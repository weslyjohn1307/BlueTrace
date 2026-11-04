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
  const measuredLocked = scaleCalibrated === false && totalFt > 0;

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
    return 'text-bt-text-secondary bg-bt-panel border-bt-border-strong';
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
    <div className="flex flex-col h-full bg-bt-surface text-bt-text-primary text-xs" data-testid="ledger-panel">
      {/* Header & Tremor-Style KPI Summary */}
      <div className="p-3 border-b border-bt-border-subtle space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-bt-text-primary uppercase tracking-wider text-[11px] font-mono">
              Takeoff Ledger
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bt-panel text-bt-text-secondary border border-bt-border-strong tabular-nums">
            {effectiveItems.length} records
          </span>
        </div>

        {/* KPI Mini-Cards: footage is measured length, never a claim of accepted takeoff. */}
        <div className="grid grid-cols-3 gap-2 font-mono">
          <div className="p-2 rounded-lg bg-bt-inset/70 border border-bt-border-subtle flex flex-col">
            <span className="text-[9px] text-bt-text-tertiary uppercase">Total LF</span>
            {measuredLocked ? (
              <span
                className="text-xs font-bold text-amber-300 tabular-nums"
                title="Measured length exists but scale is unverified, so footage stays locked until you verify or calibrate this sheet."
              >
                Locked
              </span>
            ) : (
              <span className="text-xs font-bold text-cyan-300 truncate tabular-nums">{totalFt.toFixed(1)} ft</span>
            )}
          </div>
          <div className="p-2 rounded-lg bg-bt-inset/70 border border-bt-border-subtle flex flex-col">
            <span className="text-[9px] text-emerald-500 uppercase">Accepted</span>
            <span className="text-xs font-bold text-emerald-300 tabular-nums">{accepted.length}</span>
          </div>
          <div className="p-2 rounded-lg bg-bt-inset/70 border border-bt-border-subtle flex flex-col">
            <span className="text-[9px] text-amber-500 uppercase">Review</span>
            <span className="text-xs font-bold text-amber-300 tabular-nums">{suggested.length}</span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 pt-1" role="group" aria-label="Filter ledger by review state">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'all' ? 'bg-cyan-600 text-bt-on-brand font-semibold' : 'text-bt-text-secondary hover:text-bt-text-primary hover:bg-bt-panel'
            }`}
          >
            All ({effectiveItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('suggested')}
            aria-pressed={filter === 'suggested'}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'suggested' ? 'bg-amber-600 text-bt-on-brand font-semibold' : 'text-amber-400 hover:bg-bt-panel'
            }`}
          >
            Review ({suggested.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('accepted')}
            aria-pressed={filter === 'accepted'}
            className={`px-2 py-1 rounded text-[10px] font-mono transition-all duration-100 active:scale-[0.98] cursor-pointer ${
              filter === 'accepted' ? 'bg-emerald-600 text-bt-on-brand font-semibold' : 'text-emerald-400 hover:bg-bt-panel'
            }`}
          >
            Accepted ({accepted.length})
          </button>
        </div>
      </div>

      {/* Item List (Beautiful UI Diff Table Pattern) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && <div className="p-4 text-center text-bt-text-tertiary font-mono italic">Loading ledger records…</div>}
        {!loading && items.length === 0 && (
          <EmptyPanel
            title="No takeoff items yet"
            description="Hover the sheet and accept a dimension badge, or link an equipment schedule, to populate the ledger."
          />
        )}

        {filteredItems.map((item) => {
          const isSuggested = item.status === 'SUGGESTED';
          const needsScale = item.total_length_ft > 0 && scaleCalibrated === false;
          return (
            <div
              key={item.item_id}
              className={`p-2.5 rounded-lg border transition-colors duration-150 flex flex-col space-y-1.5 ${
                isSuggested
                  ? 'border-amber-500/50 bg-amber-950/20'
                  : 'border-bt-border-subtle bg-bt-surface/80 hover:border-bt-border-strong'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-bt-text-primary text-xs tracking-tight">
                  {item.dimension_label}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {isSuggested ? (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold border border-amber-500/40 text-amber-300">
                      Needs review
                    </span>
                  ) : null}
                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold border ${getSystemColor(
                      item.system
                    )}`}
                  >
                    {item.system || item.category}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-bt-text-secondary">
                <div className="flex items-center space-x-1.5">
                  <span className="text-bt-text-tertiary">{item.source}</span>
                </div>
                <span className="font-bold text-bt-text-primary tabular-nums">
                  {item.total_length_ft > 0 ? `${item.total_length_ft.toFixed(1)} ft` : `Qty: ${item.count || 1}`}
                </span>
              </div>

              {needsScale && (
                <p
                  id={`scale-note-${item.item_id}`}
                  className="rounded border border-amber-500/30 bg-amber-950/30 px-2 py-1 text-[10px] leading-snug text-amber-200"
                >
                  Scale unverified. This measured length stays locked until you calibrate the sheet.
                </p>
              )}

              {isSuggested && (
                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOptimisticAccept(item.item_id)}
                    disabled={needsScale}
                    aria-describedby={needsScale ? `scale-note-${item.item_id}` : undefined}
                    className="flex flex-1 items-center justify-center space-x-1 rounded-lg bg-emerald-600/90 px-2.5 py-1.5 font-mono text-[11px] text-bt-on-brand shadow-xs transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-bt-panel disabled:text-bt-text-tertiary active:scale-[0.98]"
                  >
                    <Check className="w-3 h-3" />
                    <span>Accept</span>
                  </button>
                  {onCorrect && (
                    <button
                      type="button"
                      aria-label={`Correct ${item.dimension_label}`}
                      onClick={() => onCorrect(item.item_id)}
                      className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-cyan-600/90 hover:bg-cyan-500 text-bt-on-brand font-mono text-[11px] cursor-pointer transition-all duration-100 active:scale-[0.98] shadow-xs"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Correct</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOptimisticReject(item.item_id)}
                    className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 rounded-lg bg-bt-panel hover:bg-rose-600/80 text-bt-text-secondary hover:text-bt-on-brand font-mono text-[11px] cursor-pointer transition-all duration-100 active:scale-[0.98] border border-bt-border-strong"
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
                    className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono text-cyan-400 hover:text-cyan-200 hover:bg-bt-panel cursor-pointer transition-colors"
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
      <div className="p-2.5 border-t border-bt-border-subtle bg-bt-inset/70 flex space-x-2">
        <button
          type="button"
          onClick={onExportCsv}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-bt-panel hover:bg-bt-panel hover:border-cyan-500/40 border border-bt-border-strong text-bt-text-primary font-mono text-xs disabled:opacity-40 cursor-pointer transition-all"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export CSV</span>
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={items.length === 0}
          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-bt-panel hover:bg-bt-panel hover:border-cyan-500/40 border border-bt-border-strong text-bt-text-primary font-mono text-xs disabled:opacity-40 cursor-pointer transition-all"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export JSON</span>
        </button>
      </div>
    </div>
  );
};
