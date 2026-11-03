import React, { useState } from 'react';
import { Table2, Pin, Sparkles, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { ScheduledItem } from '../../api/contracts';
import type { CanvasPin } from './SheetCanvas';

export interface SchedulePanelProps {
  projectName: string;
  sheetId: string | null;
  pdfPath: string | null;
  pageIndex: number;
  onGhostPins: (pins: CanvasPin[]) => void;
  onReconcile?: (scheduled: ScheduledItem[], scheduleSheet: string) => void | Promise<void>;
  onLinked: () => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve(url.includes(',') ? url.split(',')[1] : '');
    };
    reader.onerror = () => reject(new Error('Could not read schedule image'));
    reader.readAsDataURL(file);
  });
}

const BENCHMARK_SCHEDULE_ITEMS: ScheduledItem[] = [
  {
    tag: 'VAV-1-01',
    description: 'Single Duct Variable Air Volume Box',
    system: 'Supply Air',
    category: 'MECHANICAL',
    located_on_plan: true,
    plan_coordinates_pt: [420.5, 310.2],
  },
  {
    tag: 'VAV-1-02',
    description: 'VAV Terminal Unit w/ Reheat Coil',
    system: 'Supply Air',
    category: 'MECHANICAL',
    located_on_plan: true,
    plan_coordinates_pt: [680.0, 415.8],
  },
  {
    tag: 'VAV-1-03',
    description: 'VAV Terminal Unit w/ Reheat Coil',
    system: 'Supply Air',
    category: 'MECHANICAL',
    located_on_plan: true,
    plan_coordinates_pt: [950.2, 530.4],
  },
  {
    tag: 'FCU-1',
    description: 'Fan Coil Unit 4-Pipe Horizontal',
    system: 'Hydronic / Air',
    category: 'MECHANICAL',
    located_on_plan: true,
    plan_coordinates_pt: [310.0, 680.0],
  },
  {
    tag: 'EF-1',
    description: 'Centrifugal Roof Exhaust Fan',
    system: 'Exhaust Air',
    category: 'MECHANICAL',
    located_on_plan: true,
    plan_coordinates_pt: [1120.0, 290.0],
  },
];

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  projectName,
  sheetId,
  pdfPath,
  pageIndex,
  onGhostPins,
  onReconcile,
  onLinked,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [isBenchmark, setIsBenchmark] = useState(false);
  const [title, setTitle] = useState('MEP Mechanical Equipment Schedule');

  const run = async (file: File) => {
    if (!sheetId || !pdfPath) {
      setError('Open and scan a sheet before linking a schedule.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [imageBase64, pageText] = await Promise.all([
        fileToBase64(file),
        apiClient.getPageText(pdfPath, pageIndex),
      ]);
      const res = await apiClient.parseSchedule({
        image_base64: imageBase64,
        schedule_title: title || 'MEP Equipment Schedule',
        project_id: projectName,
        sheet_id: sheetId,
        page_text_blocks: pageText.blocks.map((b) => [b.text, [...b.bbox]] as [string, number[]]),
      });
      const returnedItems = res.unplaced_ghost_pins ?? [];
      setIsBenchmark(false);
      setItems(returnedItems);
      let ghostCounter = 0;
      const pins: CanvasPin[] = returnedItems.map((item) => {
        let x = 60.0;
        let y = 100.0 + ghostCounter * 35.0;
        if (item.plan_coordinates_pt) {
          x = item.plan_coordinates_pt[0];
          y = item.plan_coordinates_pt[1];
        } else {
          ghostCounter++;
        }
        return {
          id: `ghost-${item.tag}`,
          x,
          y,
          kind: 'ghost' as const,
          label: item.tag,
          tag: item.tag,
          discipline: item.category || 'Mechanical',
          system: item.system,
          status: item.located_on_plan ? 'MATCHED' : 'UNPLACED_GHOST',
          description: item.description,
          cfm: item.cfm ?? undefined,
        };
      });
      onGhostPins(pins);
      if (onReconcile && returnedItems.length > 0) {
        await onReconcile(returnedItems, title || 'MEP Equipment Schedule');
      }
      onLinked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Schedule parsing failed');
    } finally {
      setBusy(false);
    }
  };

  const loadBenchmarkSchedule = () => {
    setError(null);
    setIsBenchmark(true);
    setItems(BENCHMARK_SCHEDULE_ITEMS);
    let ghostCounter = 0;
    const pins: CanvasPin[] = BENCHMARK_SCHEDULE_ITEMS.map((item) => {
      let x = 60.0;
      let y = 100.0 + ghostCounter * 35.0;
      if (item.plan_coordinates_pt) {
        x = item.plan_coordinates_pt[0];
        y = item.plan_coordinates_pt[1];
      } else {
        ghostCounter++;
      }
      return {
        id: `ghost-${item.tag}`,
        x,
        y,
        kind: 'ghost' as const,
        label: item.tag,
        tag: item.tag,
        discipline: item.category || 'Mechanical',
        system: item.system,
        status: item.located_on_plan ? 'MATCHED' : 'UNPLACED_GHOST',
        description: item.description,
        cfm: item.cfm ?? undefined,
      };
    });
    onGhostPins(pins);
    if (onReconcile) {
      void onReconcile(BENCHMARK_SCHEDULE_ITEMS, title || 'MEP Equipment Schedule');
    }
    onLinked();
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 text-xs p-3 space-y-3" data-testid="schedule-panel">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Table2 className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] font-mono">
            Schedule Linking
          </span>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
          VLM Table OCR
        </span>
      </div>

      {/* Schedule Meta Config */}
      <div className="space-y-1.5 font-mono">
        <label className="text-[10px] uppercase text-slate-400">Schedule Name</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Schedule title"
          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-100 text-xs outline-none focus:border-cyan-500 transition-colors"
        />
      </div>

      {/* Upload Dropzone (Kibo UI Dropzone Pattern) */}
      <div className="space-y-2">
        <label
          className={`block p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all duration-200 ${
            busy
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-slate-700 bg-slate-950/50 hover:border-cyan-500/50 hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-6 h-6 text-cyan-400 mx-auto mb-1.5" />
          <div className="font-semibold text-slate-200 text-xs font-mono">
            {busy ? 'Extracting schedule rows with muse-spark-1.3…' : 'Drop schedule crop or table PNG'}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Auto-extracts Equipment Tags, CFM, and reconciles against plan text
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy || !sheetId}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void run(file);
              e.target.value = '';
            }}
          />
        </label>

        {/* 1-Click Benchmark Schedule Button */}
        <button
          type="button"
          onClick={loadBenchmarkSchedule}
          disabled={busy || !sheetId}
          className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 font-mono text-xs cursor-pointer transition-all disabled:opacity-50 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Load Benchmark Avexis Equipment Schedule</span>
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 font-mono text-xs flex items-center space-x-2" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reconciled Schedule Items Grid (ReUI Data Grid Pattern) */}
      {items.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1.5 pt-1">
          <div className="text-[10px] uppercase tracking-wider text-amber-400 font-mono flex items-center justify-between pb-1">
            <div className="flex items-center space-x-1.5">
              <Pin className="w-3 h-3" />
              <span>Reconciled Ghost Pins ({items.length})</span>
            </div>
            {isBenchmark && (
              <span
                className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[9px] font-bold tracking-wider"
                data-testid="benchmark-fixture-badge"
              >
                BENCHMARK FIXTURE (DEMO)
              </span>
            )}
          </div>

          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.tag}
                className="p-2 rounded-lg border border-slate-800 bg-slate-950/80 hover:border-cyan-500/40 transition-all font-mono flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-cyan-300 text-xs">{item.tag}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {item.system}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[10px] truncate max-w-xs">{item.description}</div>
                </div>

                <div className="text-right">
                  {item.plan_coordinates_pt ? (
                    <span className="flex items-center space-x-1 text-emerald-400 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Placed</span>
                    </span>
                  ) : (
                    <span className="text-amber-400 text-[10px]">Unplaced</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
