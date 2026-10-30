import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, PanelLeft, PanelRight, Sparkles } from 'lucide-react';
import { GlobalTopNav } from '../app/GlobalTopNav';
import { ModeBanner } from '../components/ModeBanner';
import { useTakeoffSession } from './hooks/useTakeoffSession';
import { UploadCard } from './components/UploadCard';
import { SheetCanvas, type CanvasPin, type VectorRun } from './components/SheetCanvas';
import { HoverBadge } from './components/HoverBadge';
import { SheetTree, type SheetItemData } from './components/SheetTree';
import { LedgerPanel } from './components/LedgerPanel';
import { SchedulePanel } from './components/SchedulePanel';
import { CopilotDrawer } from './components/CopilotDrawer';
import { ByokDialog } from './components/ByokDialog';
import { apiClient } from '../api/client';
import type { CursorCropResponse } from '../api/contracts';

type RightTab = 'ledger' | 'schedule';

export const TakeoffWorkspace: React.FC = () => {
  const { state, checkBackend, selectFile, openFixture, selectSheet, setItemStatus, reset, refreshLedger } =
    useTakeoffSession();
  const [badge, setBadge] = useState<CursorCropResponse | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeCursor, setBadgeCursor] = useState<[number, number] | null>(null);
  const [ghostPins, setGhostPins] = useState<CanvasPin[]>([]);
  const [evidencePins, setEvidencePins] = useState<CanvasPin[]>([]);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [byokOpen, setByokOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('ledger');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const activeSheet = state.sheets.find((s) => s.meta.sheet_id === state.activeSheetId) ?? null;
  const treeSheets: SheetItemData[] = state.sheets.map((s) => ({
    sheet_id: s.meta.sheet_id,
    sheet_number: s.meta.sheet_number,
    sheet_title: s.meta.sheet_title,
    discipline: s.meta.discipline,
    scale_raw: s.meta.scale_raw,
    scale_ratio: s.meta.scale_ratio,
    scale_status: s.meta.scale_status,
    page_index: s.meta.page_index,
  }));

  const vectorRuns: VectorRun[] = state.items.flatMap((item) => {
    if (state.activeSheetId && item.sheet_id !== state.activeSheetId) return [];
    const geometry = item.geometry as { points?: unknown };
    if (
      geometry === null ||
      typeof geometry !== 'object' ||
      !Array.isArray(geometry.points) ||
      geometry.points.length < 2
    ) {
      return [];
    }
    const points = geometry.points.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) &&
        pt.length >= 2 &&
        typeof pt[0] === 'number' &&
        typeof pt[1] === 'number' &&
        Number.isFinite(pt[0]) &&
        Number.isFinite(pt[1])
    ) as [number, number][];
    if (points.length < 2) return [];
    return [
      {
        id: item.item_id,
        points,
        system: item.system,
        status: item.status,
        label: item.dimension_label,
        length_ft: item.total_length_ft,
      },
    ];
  });

  const itemPins: CanvasPin[] = state.items
    .filter((item) => {
      const geometry = item.geometry as { coordinates?: unknown };
      return (
        geometry !== null &&
        typeof geometry === 'object' &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 2
      );
    })
    .map((item) => {
      const coords = (item.geometry as { coordinates: number[] }).coordinates;
      return { id: item.item_id, x: coords[0], y: coords[1], kind: 'item' as const };
    });

  const handleCrop = async (cursorPt: [number, number], imageBase64: string) => {
    if (!activeSheet || badgeBusy) return;
    setBadgeBusy(true);
    setBadgeCursor(cursorPt);
    try {
      const res = await apiClient.extractCropOcr({
        sheet_id: activeSheet.meta.sheet_id,
        cursor_pt: cursorPt,
        crop_size_pt: 150,
        image_base64: imageBase64,
      });
      setBadge(res);
    } catch {
      setBadge(null);
    } finally {
      setBadgeBusy(false);
    }
  };

  const acceptBadge = useCallback(async () => {
    if (!badge || !badgeCursor || !activeSheet || badge.review_required) return;
    const parsed = badge.parsed_dimension;
    const label = parsed
      ? `${parsed.width_in}${parsed.height_in ? `x${parsed.height_in}` : ''} ${parsed.shape === 'ROUND' ? 'Round' : 'Rectangular'} Duct`
      : badge.detected_text || 'QuickDraw dimension';
    try {
      await apiClient.createTakeoffItem({
        project_id: state.projectName || 'default_project',
        sheet_id: activeSheet.meta.sheet_id,
        category: 'DUCTWORK',
        system: 'Supply Air',
        dimension_label: label,
        status: 'ACCEPTED',
        source: 'QUICKDRAW_HOVER',
        total_length_ft: 0,
        count: 1,
        geometry: { type: 'point', coordinates: [badgeCursor[0], badgeCursor[1]] },
        confidence: badge.confidence,
      });
      setBadge(null);
      await refreshLedger();
    } catch {
      setBadge(null);
    }
  }, [badge, badgeCursor, activeSheet, state.projectName, refreshLedger]);

  // Global Keyboard Shortcuts ([, ], Cmd+K, Esc, Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setLeftSidebarOpen((prev) => !prev);
      } else if (e.key === ']') {
        e.preventDefault();
        setRightSidebarOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCopilotOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (copilotOpen) setCopilotOpen(false);
        if (badge) setBadge(null);
      } else if (e.key === 'Enter' && badge && !badge.review_required) {
        e.preventDefault();
        void acceptBadge();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [copilotOpen, badge, acceptBadge]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const showWorkspace = activeSheet !== null;
  const scaleOk =
    activeSheet &&
    (activeSheet.meta.scale_status === 'VERIFIED' || activeSheet.meta.scale_status === 'CALIBRATED');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 select-none">
      <ModeBanner mode="live" />
      <GlobalTopNav
        modelReady={state.backendOnline}
        onLoadSample={() => void openFixture('fixtures/mechanical/avexis_page_22.pdf')}
        onNewAnalysis={reset}
        onFileSelect={(file) => void selectFile(file)}
        aiConfigured={state.aiConfigured}
        onOpenCopilot={() => setCopilotOpen(true)}
        onOpenByok={() => setByokOpen(true)}
      />

      {!showWorkspace ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <UploadCard
            loading={state.stage === 'uploading' || state.stage === 'scanning'}
            error={state.error}
            onFile={(file) => void selectFile(file)}
            onFixture={(path) => void openFixture(path)}
          />
        </main>
      ) : (
        <main className="flex-1 flex overflow-hidden relative" style={{ minHeight: 0 }}>
          {/* Partial-failure banner: per-sheet scan / ledger errors stay visible in-workspace */}
          {state.error && (
            <div
              role="alert"
              className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 max-w-xl px-3 py-2 rounded-lg bg-amber-950/90 backdrop-blur-md border border-amber-500/40 text-amber-200 text-[11px] font-mono shadow-lg"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{state.error}</span>
            </div>
          )}

          {/* Left Sheet Tree Sidebar (Progressive Disclosure) */}
          {leftSidebarOpen && (
            <aside className="w-64 shrink-0 hidden md:flex flex-col border-r border-slate-800" aria-label="Sheet directory">
              <SheetTree sheets={treeSheets} activeSheetId={state.activeSheetId} onSelectSheet={selectSheet} />
            </aside>
          )}

          {/* Central CAD Workstation Viewport */}
          <section className="flex-1 flex flex-col overflow-hidden relative" aria-label="Sheet canvas">
            {/* Workstation Header Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono z-20 backdrop-blur-md">
              <div className="flex items-center space-x-2 truncate">
                <button
                  type="button"
                  onClick={() => setLeftSidebarOpen((prev) => !prev)}
                  className={`p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer hidden md:block ${
                    !leftSidebarOpen ? 'text-cyan-400 bg-cyan-950/60' : ''
                  }`}
                  title="Toggle Sheet Directory [[]"
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-slate-200 font-semibold truncate">
                  {activeSheet.meta.sheet_number} — {activeSheet.meta.sheet_title}
                </span>
                <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {activeSheet.meta.discipline}
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {scaleOk ? (
                  <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[10px]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{activeSheet.meta.scale_raw}</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1.5 text-amber-400 font-medium px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-[10px] animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Scale Unverified // Review Required</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setRightSidebarOpen((prev) => !prev)}
                  className={`p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer hidden lg:block ${
                    !rightSidebarOpen ? 'text-cyan-400 bg-cyan-950/60' : ''
                  }`}
                  title="Toggle Ledger & Schedule []]"
                >
                  <PanelRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="flex-1 relative" style={{ minHeight: 0 }}>
              <SheetCanvas
                imageUrl={apiClient.getPageImageUrl(activeSheet.pdfPath, activeSheet.pageIndex, 150)}
                widthPt={activeSheet.meta.width_pt}
                heightPt={activeSheet.meta.height_pt}
                pins={[...itemPins, ...ghostPins, ...evidencePins]}
                vectorRuns={vectorRuns}
                cropEnabled={true}
                scaleRatio={activeSheet.meta.scale_ratio ?? undefined}
                discipline={activeSheet.meta.discipline}
                onCropRequest={(pt, b64) => void handleCrop(pt, b64)}
                renderBadge={(screen) =>
                  badge ? (
                    <HoverBadge
                      x={screen.x}
                      y={screen.y}
                      detectedText={badge.detected_text}
                      latencyMs={badge.latency_ms}
                      confidence={badge.confidence}
                      reviewRequired={badge.review_required}
                      onAccept={badge.review_required ? undefined : () => void acceptBadge()}
                      onReject={() => setBadge(null)}
                    />
                  ) : badgeBusy ? (
                    <HoverBadge x={screen.x} y={screen.y} detectedText="" latencyMs={0} confidence={0} />
                  ) : null
                }
              />
            </div>
          </section>

          {/* Right Ledger & Schedule Sidebar (Progressive Disclosure) */}
          {rightSidebarOpen && (
            <aside className="w-84 shrink-0 hidden lg:flex flex-col border-l border-slate-800 bg-slate-900" aria-label="Ledger and schedule">
              <div className="flex bg-slate-950 border-b border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setRightTab('ledger')}
                  className={`flex-1 px-3 py-2.5 cursor-pointer transition-colors ${
                    rightTab === 'ledger'
                      ? 'text-cyan-300 border-b-2 border-cyan-400 bg-slate-900'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Takeoff Ledger
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('schedule')}
                  className={`flex-1 px-3 py-2.5 cursor-pointer transition-colors ${
                    rightTab === 'schedule'
                      ? 'text-cyan-300 border-b-2 border-cyan-400 bg-slate-900'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Equipment Schedule
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
                {rightTab === 'ledger' ? (
                  <LedgerPanel
                    items={state.items}
                    summary={state.summary}
                    loading={state.itemsLoading}
                    onAccept={(id) => void setItemStatus(id, 'ACCEPTED')}
                    onReject={(id) => void setItemStatus(id, 'REJECTED')}
                    onExportCsv={() =>
                      void apiClient
                        .exportTakeoffCsv({ project_id: state.projectName, sheet_id: state.activeSheetId ?? undefined })
                        .then((blob) => downloadBlob(blob, 'bluetrace_takeoff.csv'))
                    }
                    onExportJson={() =>
                      void apiClient
                        .exportTakeoffJson({ project_id: state.projectName, sheet_id: state.activeSheetId ?? undefined })
                        .then((blob) => downloadBlob(blob, 'bluetrace_takeoff.json'))
                    }
                  />
                ) : (
                  <SchedulePanel
                    projectName={state.projectName}
                    sheetId={state.activeSheetId}
                    pdfPath={activeSheet.pdfPath}
                    pageIndex={activeSheet.pageIndex}
                    onGhostPins={setGhostPins}
                    onLinked={() => void refreshLedger()}
                  />
                )}
              </div>
            </aside>
          )}
        </main>
      )}

      {/* Persistent Bottom-Right Copilot Quick Trigger */}
      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_8px_25px_rgba(8,145,178,0.4)] cursor-pointer transition-all border border-cyan-400/40 font-mono text-xs"
        aria-label="Open copilot"
      >
        <Sparkles className="w-3.5 h-3.5 text-cyan-200 animate-pulse" />
        <span className="font-semibold">Copilot</span>
        <span className="text-[10px] bg-cyan-700 px-1.5 py-0.2 rounded text-cyan-200">⌘K</span>
      </button>

      {/* Flyout Copilot Drawer */}
      <CopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        sheetId={state.activeSheetId}
        onEvidence={(boxes) =>
          setEvidencePins(
            boxes.map((box, i) => ({
              id: `evidence-${i}-${box.join('-')}`,
              x: (box[0] + box[2]) / 2,
              y: (box[1] + box[3]) / 2,
              kind: 'evidence' as const,
            }))
          )
        }
      />

      {/* BYOK Meta API Key Dialog */}
      <ByokDialog
        open={byokOpen}
        onClose={() => setByokOpen(false)}
        configured={state.aiConfigured}
        maskedKey={null}
        onChanged={() => void checkBackend()}
      />
    </div>
  );
};
