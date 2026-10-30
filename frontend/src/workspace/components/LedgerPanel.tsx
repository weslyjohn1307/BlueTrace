import React from 'react';
import { Check, X, Download, ClipboardList } from 'lucide-react';
import type { LedgerSummaryRow, TakeoffRecord } from '../../api/contracts';
import { EmptyPanel } from '../../components/EmptyPanel';

export interface LedgerPanelProps {
  items: TakeoffRecord[];
  summary: LedgerSummaryRow[];
  loading: boolean;
  onAccept: (itemId: string) => void;
  onReject: (itemId: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}

export const LedgerPanel: React.FC<LedgerPanelProps> = ({
  items,
  summary,
  loading,
  onAccept,
  onReject,
  onExportCsv,
  onExportJson,
}) => {
  const suggested = items.filter((i) => i.status === 'SUGGESTED');
  const accepted = items.filter((i) => i.status === 'ACCEPTED');
  const totalFt = summary.reduce((acc, row) => acc + row.total_length_ft, 0);

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 text-xs" data-testid="ledger-panel">
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center space-x-2 mb-1">
          <ClipboardList className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">Takeoff Ledger</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          {accepted.length} accepted · {suggested.length} need review · {totalFt.toFixed(1)} ft verified
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && <div className="p-4 text-center text-slate-500 italic">Loading ledger…</div>}
        {!loading && items.length === 0 && (
          <EmptyPanel
            title="No takeoff items yet"
            description="Hover the sheet and accept a dimension badge, or link a schedule, to start the ledger."
          />
        )}
        {suggested.length > 0 && (
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 px-1 pt-1">
            Needs review ({suggested.length})
          </div>
        )}
        {suggested.map((item) => (
          <div
            key={item.item_id}
            className="p-2 rounded-lg border border-amber-500/40 bg-amber-950/20 flex flex-col space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-slate-100">{item.dimension_label}</span>
              <span className="font-mono text-[10px] text-slate-400">{item.category}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-500">
              {item.system} · {item.total_length_ft.toFixed(1)} ft · {item.source}
            </div>
            <div className="flex space-x-1.5 pt-1">
              <button
                type="button"
                onClick={() => onAccept(item.item_id)}
                className="flex-1 flex items-center justify-center space-x-1 px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Accept</span>
              </button>
              <button
                type="button"
                onClick={() => onReject(item.item_id)}
                className="flex-1 flex items-center justify-center space-x-1 px-2 py-1 rounded bg-slate-700 hover:bg-rose-600 text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Reject</span>
              </button>
            </div>
          </div>
        ))}
        {accepted.length > 0 && (
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 px-1 pt-2">
            Accepted ({accepted.length})
          </div>
        )}
        {accepted.map((item) => (
          <div key={item.item_id} className="p-2 rounded-lg border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-slate-100">{item.dimension_label}</span>
              <span className="font-mono text-[10px] text-emerald-400">{item.total_length_ft.toFixed(1)} ft</span>
            </div>
            <div className="font-mono text-[10px] text-slate-500">
              {item.category} · {item.system}
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-slate-800 flex space-x-1.5">
        <button
          type="button"
          onClick={onExportCsv}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
        >
          <Download className="w-3 h-3" />
          <span>CSV</span>
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
        >
          <Download className="w-3 h-3" />
          <span>JSON</span>
        </button>
      </div>
    </div>
  );
};
