import React, { useEffect, useState } from 'react';
import { Check, X, Download, ClipboardList, Pencil } from 'lucide-react';
import type { LedgerSummaryRow, TakeoffRecord } from '../../api/contracts';
import { EmptyPanel } from '../../components/EmptyPanel';

export interface LedgerPanelProps {
  items: TakeoffRecord[];
  summary: LedgerSummaryRow[];
  loading: boolean;
  onAccept: (itemId: string) => void;
  onReject: (itemId: string) => void;
  /** REV-002 correction entry point; when omitted no Correct affordance renders. */
  onCorrect?: (itemId: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  scaleCalibrated?: boolean;
}

type LedgerFilter = 'all' | 'suggested' | 'accepted';

export const LedgerPanel: React.FC<LedgerPanelProps> = ({
  items,
  summary,
  loading,
  onAccept,
  onReject,
  onCorrect,
  onExportCsv,
  onExportJson,
  scaleCalibrated = true,
}) => {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({});

  // Sync / clear pending status when items update from backend
  useEffect(() => {
    setPendingStatus((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of items) {
        if (next[item.item_id] && item.status === next[item.item_id]) {
          delete next[item.item_id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Compute effective items with optimistic pending transitions
  const effectiveItems = items.map((item) => {
    const override = pendingStatus[item.item_id];
    return override ? { ...item, status: override } : item;
  });

  const suggested = effectiveItems.filter((i) => i.status === 'SUGGESTED');
  const accepted = effectiveItems.filter((i) => i.status === 'ACCEPTED');
  const totalFt = summary.reduce((acc, row) => acc + row.total_length_ft, 0);

  const filteredItems = effectiveItems.filter((item) => {
    if (filter === 'suggested') return item.status === 'SUGGESTED';
    if (filter === 'accepted') return item.status === 'ACCEPTED';
    return true;
  });

  const getSystemColor = (system?: string) => {
    const s = (system || '').toLowerCase();
    if (s.includes('supply')) return 'text-sky-400 bg-sky-950/60 border-sky-500/30';
    if (s.includes('return')) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30';
    if (s.includes('exhaust')) return 'text-amber-400 bg-amber-950/60 border-amber-500/30';
    if (s.includes('fire') || s.includes('life safety')) return 'text-rose-400 bg-rose-950/60 border-rose-500/30';
    return 'text-slate-400 bg-slate-800 border-slate-700';
  };

  const handleOptimisticAccept = (id: string) => {
    setPendingStatus((prev) => ({ ...prev, [id]: 'ACCEPTED' }));
    onAccept(id);
  };

  const handleOptimisticReject = (id: string) => {
    setPendingStatus((prev) => ({ ...prev, [id]: 'REJECTED' }));
    onReject(id);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 text-xs" data-testid="ledger-panel">
      {/* Header & Tremor-Style KPI Summary */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] font-mono">
              Takeoff Ledger
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 tabular-nums">
            {effectiveItems.length} records
          </span>
        </div>

        {/* KPI Mini-Cards */}
        <div className="grid grid-cols-3 gap-2 font-mono">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase">Total LF</span>
            <span className="text-xs font-bold text-cyan-300 truncate tabular-nums">{totalFt.toFixed(1)} ft</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[9px] text-emerald-500 uppercase">Accepted</span>
            <span className="text-xs font-bold text-emerald-300 tabular-nums">{accepted.length}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col">
            <span className="text-[9px] text-amber-500 uppercase">Review</span>
            <span className="text-xs font-bold text-amber-300 tabular-nums">{suggested.length}</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 pt-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'all' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            All ({effectiveItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('suggested')}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'suggested' ? 'bg-amber-600 text-white font-semibold' : 'text-amber-400 hover:bg-slate-800'
            }`}
          >
            Review ({suggested.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('accepted')}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'accepted' ? 'bg-emerald-600 text-white font-semibold' : 'text-emerald-400 hover:bg-slate-800'
            }`}
          >
            Accepted ({accepted.length})
          </button>
        </div>
      </div>

      {/* Item List (Beautiful UI Diff Table Pattern) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && <div className="p-4 text-center text-slate-500 font-mono italic">Loading ledger records…</div>}
        {!loading && items.length === 0 && (
          <EmptyPanel
            title="No takeoff items yet"
            description="Hover the sheet and accept a dimension badge, or link an equipment schedule, to populate the ledger."
          />
        )}

        {filteredItems.map((item) => {
          const isSuggested = item.status === 'SUGGESTED';
          return (
            <div
              key={item.item_id}
              className={`p-2.5 rounded-lg border transition-all duration-200 flex flex-col space-y-1.5 ${
                isSuggested
                  ? 'border-amber-500/50 bg-amber-950/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                  : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-slate-100 text-xs tracking-tight">
                  {item.dimension_label}
                </span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold border ${getSystemColor(
                    item.system
                  )}`}
                >
                  {item.system || item.category}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-500">{item.source}</span>
                  {item.confidence && (
                    <span className="text-cyan-400">{(item.confidence * 100).toFixed(0)}%</span>
                  )}
                </div>
                <span className="font-bold text-slate-200 tabular-nums">
                  {item.total_length_ft > 0 ? `${item.total_length_ft.toFixed(1)} ft` : `Qty: ${item.count || 1}`}
                </span>
              </div>

              {isSuggested && (
                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOptimisticAccept(item.item_id)}
                    title={scaleCalibrated === false ? 'Scale calibration required before accepting measurements' : undefined}
                    className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-mono text-[11px] cursor-pointer transition-all duration-100 active:scale-[0.98] shadow-xs"
                  >
                    <Check className="w-3 h-3" />
                    <span>Accept</span>
                  </button>
                  {onCorrect && (
                    <button
                      type="button"
                      aria-label={`Correct ${item.dimension_label}`}
                      onClick={() => onCorrect(item.item_id)}
                      className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-cyan-600/90 hover:bg-cyan-500 text-white font-mono text-[11px] cursor-pointer transition-all duration-100 active:scale-[0.98] shadow-xs"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Correct</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOptimisticReject(item.item_id)}
                    className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white font-mono text-[11px] cursor-pointer transition-all duration-100 active:scale-[0.98] border border-slate-700"
                  >
                    <X className="w-3 h-3" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
              {!isSuggested && onCorrect && (
                <div className="flex pt-1">
                  <button
                    type="button"
                    aria-label={`Correct ${item.dimension_label}`}
                    onClick={() => onCorrect(item.item_id)}
                    className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono text-cyan-400 hover:text-cyan-200 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Correct</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Export Bar */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/70 flex space-x-2">
        <button
          type="button"
          onClick={onExportCsv}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:border-cyan-500/40 border border-slate-700 text-slate-200 font-mono text-xs disabled:opacity-40 cursor-pointer transition-all"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export CSV</span>
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:border-cyan-500/40 border border-slate-700 text-slate-200 font-mono text-xs disabled:opacity-40 cursor-pointer transition-all"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export JSON</span>
        </button>
      </div>
    </div>
  );
};
