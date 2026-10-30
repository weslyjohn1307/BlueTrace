import React, { useState } from 'react';
import { Table2, Pin } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { ScheduledItem } from '../../api/contracts';
import type { CanvasPin } from './SheetCanvas';

export interface SchedulePanelProps {
  projectName: string;
  sheetId: string | null;
  pdfPath: string | null;
  pageIndex: number;
  onGhostPins: (pins: CanvasPin[]) => void;
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

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  projectName,
  sheetId,
  pdfPath,
  pageIndex,
  onGhostPins,
  onLinked,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [title, setTitle] = useState('MEP Equipment Schedule');

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
      setItems(res.unplaced_ghost_pins ?? []);
      const pins: CanvasPin[] = (res.unplaced_ghost_pins ?? [])
        .filter((item) => item.plan_coordinates_pt)
        .map((item) => ({
          id: `ghost-${item.tag}`,
          x: item.plan_coordinates_pt![0],
          y: item.plan_coordinates_pt![1],
          kind: 'ghost' as const,
          label: item.tag,
        }));
      onGhostPins(pins);
      onLinked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Schedule parsing failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 text-xs p-3 space-y-2" data-testid="schedule-panel">
      <div className="flex items-center space-x-2">
        <Table2 className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">Schedule linking</span>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Schedule title"
        className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 outline-none focus:border-cyan-500"
      />
      <label className="block px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-center cursor-pointer">
        {busy ? 'Parsing schedule…' : 'Choose schedule crop image'}
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
      {error && (
        <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200" role="alert">
          {error}
        </div>
      )}
      {items.length > 0 && (
        <div className="space-y-1 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-amber-400 flex items-center space-x-1">
            <Pin className="w-3 h-3" />
            <span>Ghost pins ({items.length}) — review on canvas, accept in ledger</span>
          </div>
          {items.map((item) => (
            <div key={item.tag} className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 font-mono">
              <div className="font-semibold text-slate-100">{item.tag}</div>
              <div className="text-slate-500 text-[10px]">
                {item.description} · {item.system}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
