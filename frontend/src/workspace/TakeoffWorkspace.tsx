import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquareText } from 'lucide-react';
import { GlobalTopNav } from '../app/GlobalTopNav';
import { ModeBanner } from '../components/ModeBanner';
import { useTakeoffSession } from './hooks/useTakeoffSession';
import { UploadCard } from './components/UploadCard';
import { SheetCanvas, type CanvasPin } from './components/SheetCanvas';
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

  const acceptBadge = async () => {
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
  };

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
  const scaleOk = activeSheet && (activeSheet.meta.scale_status === 'VERIFIED' || activeSheet.meta.scale_status === 'CALIBRATED');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
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
        <main className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          <aside className="w-64 shrink-0 hidden md:block" aria-label="Sheet directory">
            <SheetTree sheets={treeSheets} activeSheetId={state.activeSheetId} onSelectSheet={selectSheet} />
          </aside>

          <section className="flex-1 flex flex-col overflow-hidden" aria-label="Sheet canvas">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono">
              <span className="text-slate-300 truncate">
                {activeSheet.meta.sheet_number} — {activeSheet.meta.sheet_title}
              </span>
              {scaleOk ? (
                <span className="flex items-center space-x-1 text-emerald-400 shrink-0 ml-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{activeSheet.meta.scale_raw}</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-amber-400 shrink-0 ml-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Scale unverified — measurements need review</span>
                </span>
              )}
            </div>
            <div className="flex-1 relative" style={{ minHeight: 0 }}>
              <SheetCanvas
                imageUrl={apiClient.getPageImageUrl(activeSheet.pdfPath, activeSheet.pageIndex, 150)}
                widthPt={activeSheet.meta.width_pt}
                heightPt={activeSheet.meta.height_pt}
                pins={[...itemPins, ...ghostPins, ...evidencePins]}
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
                      onAccept={badge.review_required ? undefined : acceptBadge}
                      onReject={() => setBadge(null)}
                    />
                  ) : badgeBusy ? (
                    <HoverBadge x={screen.x} y={screen.y} detectedText="" latencyMs={0} confidence={0} />
                  ) : null
                }
              />
            </div>
          </section>

          <aside className="w-80 shrink-0 hidden lg:flex flex-col border-l border-slate-800" aria-label="Ledger and schedule">
            <div className="flex bg-slate-900 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setRightTab('ledger')}
                className={`flex-1 px-3 py-2 cursor-pointer ${rightTab === 'ledger' ? 'text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-500'}`}
              >
                Ledger
              </button>
              <button
                type="button"
                onClick={() => setRightTab('schedule')}
                className={`flex-1 px-3 py-2 cursor-pointer ${rightTab === 'schedule' ? 'text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-500'}`}
              >
                Schedule
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
        </main>
      )}

      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 px-4 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-xl cursor-pointer"
        aria-label="Open copilot"
      >
        <MessageSquareText className="w-4 h-4" />
        <span className="text-xs font-semibold">Ask the drawing</span>
      </button>

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
