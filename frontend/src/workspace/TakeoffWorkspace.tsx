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
import { apiClient, ApiError } from '../api/client';
import { Filter } from 'lucide-react';
import type {
  CursorCropResponse,
  DiscrepancyItem,
  ReconcilePlanSymbol,
  ReconcileScheduledItem,
  ScheduledItem,
} from '../api/contracts';
import { mapReconcileGhostPins, pinFocusCoords } from './utils/reconcilePins';

type RightTab = 'ledger' | 'schedule';

export const TakeoffWorkspace: React.FC = () => {
  const { state, checkBackend, selectFile, openFixture, selectSheet, setItemStatus, reset, refreshLedger } =
    useTakeoffSession();
  const [badge, setBadge] = useState<CursorCropResponse | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeCursor, setBadgeCursor] = useState<[number, number] | null>(null);
  const [ghostPins, setGhostPins] = useState<CanvasPin[]>([]);
  const [evidencePins, setEvidencePins] = useState<CanvasPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ x: number; y: number; zoom?: number; timestamp?: number } | null>(null);
  const [disciplineFilter, setDisciplineFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
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
      return {
        id: item.item_id,
        x: coords[0],
        y: coords[1],
        kind: 'item' as const,
        label: item.dimension_label,
        tag: item.dimension_label,
        system: item.system,
        status: item.status,
        confidence: item.confidence ?? undefined,
      };
    });

  const handlePlaceGhostPin = (ghostId: string, pagePoint: [number, number]) => {
    setGhostPins((prev) =>
      prev.map((pin) =>
        pin.id === ghostId || pin.tag === ghostId
          ? {
              ...pin,
              x: pagePoint[0],
              y: pagePoint[1],
              status: 'ACCEPTED',
              kind: 'item',
            }
          : pin
      )
    );
    setDiscrepancies((prev) =>
      prev.map((d) =>
        d.item_id === ghostId || `ghost-${d.tag}` === ghostId || d.tag === ghostId
          ? {
              ...d,
              status: 'MATCHED',
              location_pt: pagePoint,
              variance: 0,
              plan_qty: d.schedule_qty,
            }
          : d
      )
    );
  };

  const handleLocateItem = (coords: [number, number], zoom = 1.5) => {
    setFocusTarget({
      x: coords[0],
      y: coords[1],
      zoom,
      timestamp: Date.now(),
    });
  };

  const runReconcile = useCallback(
    async (scheduled: ReconcileScheduledItem[], planSymbols?: ReconcilePlanSymbol[]) => {
      if (scheduled.length === 0) return;
      setReconcileError(null);
      try {
        const derivedSymbols: ReconcilePlanSymbol[] =
          planSymbols ??
          (state.activeSheetId
            ? itemPins.map((pin) => ({
                label: pin.tag || pin.label || pin.id,
                sheet_id: state.activeSheetId as string,
                location_pt: [pin.x, pin.y] as [number, number],
                system: pin.system,
              }))
            : []);
        const report = await apiClient.reconcileTakeoff({
          project_id: state.projectName || undefined,
          sheet_id: state.activeSheetId ?? undefined,
          scheduled_items: scheduled,
          plan_symbols: derivedSymbols,
        });
        setDiscrepancies(report.discrepancies ?? []);
        const newGhostPins = mapReconcileGhostPins(report.ghost_pins ?? []);
        // Wholesale-replace reconcile-sourced ghosts so a successful reconcile
        // with zero ghosts clears stale UNPLACED ghosts. Placed pins (kind
        // flipped to 'item' / status ACCEPTED by handlePlaceGhostPin) and
        // evidence/item pins (held outside ghostPins) are preserved.
        setGhostPins((prev) => [
          ...prev.filter((pin) => pin.kind !== 'ghost' || pin.status === 'ACCEPTED'),
          ...newGhostPins,
        ]);
        setReconcileError(null);
      } catch (err) {
        // Fail closed: keep existing discrepancies/pins, never fabricate results.
        setReconcileError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Reconciliation failed. Previous results are unchanged.'
        );
      }
    },
    // itemPins is derived from state.items on every render; reconcile reads the latest via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.projectName, state.activeSheetId, state.items]
  );

  // Convenience overload for SchedulePanel's ScheduledItem[] shape.
  const runReconcileFromSchedule = useCallback(
    (scheduled: ScheduledItem[], scheduleSheet: string) => {
      const mapped: ReconcileScheduledItem[] = scheduled.map((item) => ({
        tag: item.tag,
        description: item.description,
        schedule_sheet: scheduleSheet,
        quantity: 1,
        system: item.system,
        cfm: item.cfm ?? undefined,
        dimension: item.dimension ?? undefined,
      }));
      return runReconcile(mapped);
    },
    [runReconcile]
  );

  const handleEvidence = (boxes: number[][]) => {
    if (!boxes || boxes.length === 0) return;
    const newPins: CanvasPin[] = boxes.map((box, i) => {
      const x = box.length >= 4 ? (box[0] + box[2]) / 2 : box[0];
      const y = box.length >= 4 ? (box[1] + box[3]) / 2 : box[1];
      return {
        id: `evidence-${Date.now()}-${i}`,
        x,
        y,
        kind: 'evidence' as const,
        label: `Evidence [${x.toFixed(0)}, ${y.toFixed(0)}]`,
        tag: `EV-${i + 1}`,
        confidence: 0.99,
        status: 'MATCHED',
      };
    });
    setEvidencePins(newPins);
    if (newPins.length > 0) {
      setFocusTarget({
        x: newPins[0].x,
        y: newPins[0].y,
        zoom: 1.5,
        timestamp: Date.now(),
      });
    }
  };

  const allPins: CanvasPin[] = [...itemPins, ...ghostPins, ...evidencePins];

  const filteredPins = allPins.filter((pin) => {
    if (disciplineFilter !== 'ALL') {
      const disc = (pin.discipline || pin.system || '').toLowerCase();
      if (!disc.includes(disciplineFilter.toLowerCase())) return false;
    }
    if (statusFilter !== 'ALL') {
      const st = (pin.status || '').toUpperCase();
      if (statusFilter === 'GHOST' && pin.kind !== 'ghost' && st !== 'UNPLACED_GHOST') {
        return false;
      }
      if (
        statusFilter === 'DISCREPANCIES' &&
        st !== 'UNDERCOUNT' &&
        st !== 'OVERCOUNT' &&
        st !== 'UNPLACED_GHOST'
      ) {
        return false;
      }
      if (statusFilter === 'MATCHED' && st !== 'MATCHED' && st !== 'ACCEPTED') {
        return false;
      }
    }
    return true;
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
          {reconcileError && (
            <div
              role="alert"
              className={`absolute ${state.error ? 'top-12' : 'top-2'} left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 max-w-xl px-3 py-2 rounded-lg bg-amber-950/90 backdrop-blur-md border border-amber-500/40 text-amber-200 text-[11px] font-mono shadow-lg`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{reconcileError}</span>
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

                {/* Multi-Axis Discipline & Status Filter Bar */}
                <div className="hidden xl:flex items-center space-x-1.5 pl-3 border-l border-slate-800 text-[10px]">
                  <Filter className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-500">Trade:</span>
                  {(['ALL', 'Supply', 'Return', 'Exhaust'] as const).map((disc) => (
                    <button
                      key={disc}
                      type="button"
                      onClick={() => setDisciplineFilter(disc)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        disciplineFilter === disc
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {disc}
                    </button>
                  ))}
                  <span className="text-slate-700">|</span>
                  <span className="text-slate-500">Status:</span>
                  {(['ALL', 'MATCHED', 'DISCREPANCIES', 'GHOST'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        statusFilter === st
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
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
                pins={filteredPins}
                vectorRuns={vectorRuns}
                cropEnabled={true}
                scaleRatio={activeSheet.meta.scale_ratio ?? undefined}
                discipline={activeSheet.meta.discipline}
                selectedPinId={selectedPinId}
                onSelectPin={(pin) => {
                  setSelectedPinId(pin.id);
                  const focus = pinFocusCoords(pin);
                  if (focus) handleLocateItem(focus);
                }}
                onPlaceGhostPin={handlePlaceGhostPin}
                focusTarget={focusTarget}
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
                    onReconcile={(scheduled, scheduleSheet) =>
                      void runReconcileFromSchedule(scheduled, scheduleSheet)
                    }
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
        onEvidence={handleEvidence}
        discrepancies={discrepancies}
        onLocateItem={handleLocateItem}
        onPlaceGhostPin={(ghostId) => {
          handlePlaceGhostPin(ghostId, [400.0, 300.0]);
        }}
        onDismissDiscrepancy={(id) => {
          setDiscrepancies((prev) => prev.filter((d) => d.item_id !== id));
        }}
        onVerifyDiscrepancy={(id) => {
          setDiscrepancies((prev) =>
            prev.map((d) => (d.item_id === id ? { ...d, severity: 'INFO' } : d))
          );
        }}
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
