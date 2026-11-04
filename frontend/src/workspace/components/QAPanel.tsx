import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Flame,
  Info,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { QAAnnotation, QAChecklist, QAAnnotation as QAAnnotationType } from '../../api/contracts';

export interface QAPanelProps {
  annotations: QAAnnotation[];
  checklist: QAChecklist[];
  loading: boolean;
  error: string | null;
  onResolve: (annotationId: string, status: 'CONFIRMED' | 'DISMISSED', reason?: string) => void;
  onRefresh: () => void;
}

type SeverityFilter = QAAnnotationType['severity'] | 'ALL';
const PAGE_SIZE = 20;

function SeverityBadge({ severity }: { severity: QAAnnotation['severity'] }) {
  const base =
    'flex items-center space-x-1 px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold';
  switch (severity) {
    case 'CRITICAL':
      return (
        <span className={`${base} bg-rose-50 border-rose-200 text-rose-800`}>
          <AlertCircle className="w-3 h-3 text-rose-700" />
          <span>CRITICAL</span>
        </span>
      );
    case 'HIGH':
      return (
        <span className={`${base} bg-orange-50 border-orange-200 text-orange-800`}>
          <Flame className="w-3 h-3 text-orange-700" />
          <span>HIGH</span>
        </span>
      );
    case 'WARNING':
      return (
        <span className={`${base} bg-amber-50 border-amber-200 text-amber-900`}>
          <AlertTriangle className="w-3 h-3 text-amber-800" />
          <span>WARNING</span>
        </span>
      );
    case 'INFO':
    default:
      return (
        <span className={`${base} bg-cyan-50 border-cyan-200 text-cyan-800`}>
          <Info className="w-3 h-3 text-cyan-700" />
          <span>INFO</span>
        </span>
      );
  }
}

export const QAPanel: React.FC<QAPanelProps> = ({
  annotations,
  checklist,
  loading,
  error,
  onResolve,
  onRefresh,
}) => {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [page, setPage] = useState(0);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissError, setDismissError] = useState<string | null>(null);

  const openItems = annotations.filter((a) => a.status === 'OPEN');
  const filtered =
    severityFilter === 'ALL' ? openItems : openItems.filter((a) => a.severity === severityFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const submitDismiss = (annotationId: string) => {
    const reason = dismissReason.trim();
    if (!reason) {
      setDismissError('A reason is required to dismiss.');
      return;
    }
    setDismissError(null);
    setDismissTarget(null);
    setDismissReason('');
    onResolve(annotationId, 'DISMISSED', reason);
  };

  return (
    <div className="flex flex-col h-full bg-bt-surface" aria-label="QA review panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-bt-border-subtle">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-bt-text-secondary">
            QA Review{openItems.length > 0 ? ` (${openItems.length})` : ''}
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <label htmlFor="qa-severity-filter" className="sr-only">
            Filter by severity
          </label>
          <select
            id="qa-severity-filter"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as SeverityFilter);
              setPage(0);
            }}
            className="bg-bt-inset border border-bt-border-strong rounded px-1.5 py-1 font-mono text-[10px] text-bt-text-secondary cursor-pointer"
          >
            <option value="ALL">ALL</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh QA annotations"
            className="p-1 rounded text-bt-text-secondary hover:text-bt-text-primary hover:bg-bt-panel cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {checklist.length > 0 && (
        <ul aria-label="Per-sheet QA checklist" className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-bt-border-subtle">
          {checklist.map((entry) => (
            <li
              key={entry.sheet_id}
              title={`${entry.open_flags} flags, ${entry.open_conflicts} conflicts, ${entry.notes} notes`}
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                entry.verdict === 'NEEDS_REVIEW'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {entry.sheet_id}: {entry.verdict}
            </li>
          ))}
        </ul>
      )}

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Loading QA annotations" className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-bt-panel animate-pulse rounded" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="p-3 text-center">
            <p className="font-mono text-[11px] text-rose-300">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-2 px-2.5 py-1 rounded bg-bt-panel hover:bg-bt-panel text-bt-text-primary font-mono text-[11px] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div role="status" className="text-center px-4 py-10">
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
            <h3 className="mt-2 font-mono text-xs font-semibold text-bt-text-primary">No open QA tasks</h3>
            <p className="mt-1 text-[11px] text-bt-text-secondary">
              Watchdog found nothing requiring review with the current filter.
            </p>
          </div>
        ) : (
          <>
          <ul role="list" aria-label="Open QA annotations" className="divide-y divide-slate-200">
            {visibleItems.map((ann) => (
              <li key={ann.annotation_id} className="min-w-0 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <SeverityBadge severity={ann.severity} />
                  <span className="truncate text-xs text-bt-text-tertiary">{ann.annotation_type}</span>
                  <span className="break-all text-xs text-bt-text-tertiary">{ann.reason_code}</span>
                </div>
                <p className="mt-1 break-words text-xs leading-snug text-bt-text-primary [overflow-wrap:anywhere]">{ann.message}</p>
                {ann.sheet_id && (
                  <p className="mt-0.5 break-all text-xs text-bt-text-tertiary">{ann.sheet_id}</p>
                )}
                {dismissTarget === ann.annotation_id ? (
                  <div className="mt-2 space-y-1.5">
                    <label
                      htmlFor={`qa-dismiss-reason-${ann.annotation_id}`}
                      className="font-mono text-[10px] text-bt-text-secondary"
                    >
                      Dismiss reason (required)
                    </label>
                    <input
                      id={`qa-dismiss-reason-${ann.annotation_id}`}
                      type="text"
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      placeholder="e.g. duplicate of ledger item"
                      className="w-full bg-bt-inset border border-bt-border-strong rounded px-2 py-1 text-[11px] text-bt-text-primary placeholder:text-bt-text-tertiary"
                    />
                    {dismissError && (
                      <p role="alert" className="font-mono text-[10px] text-rose-300">
                        {dismissError}
                      </p>
                    )}
                    <div className="flex space-x-1.5">
                      <button
                        type="button"
                        onClick={() => submitDismiss(ann.annotation_id)}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-bt-panel text-bt-text-primary font-mono text-[10px] cursor-pointer"
                      >
                        Submit dismissal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDismissTarget(null);
                          setDismissReason('');
                          setDismissError(null);
                        }}
                        className="px-2 py-1 rounded text-bt-text-secondary hover:text-bt-text-primary font-mono text-[10px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex space-x-1.5">
                    <button
                      type="button"
                      onClick={() => onResolve(ann.annotation_id, 'CONFIRMED')}
                      aria-label={`Confirm ${ann.reason_code}`}
                      className="flex items-center space-x-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Confirm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissTarget(ann.annotation_id)}
                      aria-label={`Dismiss ${ann.reason_code}`}
                      className="flex items-center space-x-1 px-2 py-1 rounded bg-bt-panel hover:bg-bt-panel text-bt-text-secondary font-mono text-[10px] cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 flex items-center justify-between border-t border-bt-border-subtle bg-bt-surface px-3 py-2 text-xs text-bt-text-tertiary">
            <span>Page {currentPage + 1} of {pageCount}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={currentPage === 0}
                className="rounded-md px-2 py-1 text-bt-text-secondary hover:bg-bt-panel disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={currentPage >= pageCount - 1}
                className="rounded-md px-2 py-1 text-bt-text-secondary hover:bg-bt-panel disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
};
