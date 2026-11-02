import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  MapPin,
  Check,
  X,
  Ghost,
} from 'lucide-react';
import type { DiscrepancyItem, DiscrepancySeverity, DiscrepancyStatus } from '../../api/contracts';
import { getDisciplineColor } from '../utils/disciplineColors';

export interface DiscrepancyListProps {
  discrepancies: DiscrepancyItem[];
  onLocateItem?: (coords: [number, number], zoom?: number) => void;
  onPlaceGhostPin?: (ghostId: string) => void;
  onDismissDiscrepancy?: (itemId: string) => void;
  onVerifyDiscrepancy?: (itemId: string) => void;
  onEvidence?: (boxes: number[][]) => void;
}

export const DiscrepancyList: React.FC<DiscrepancyListProps> = ({
  discrepancies,
  onLocateItem,
  onPlaceGhostPin,
  onDismissDiscrepancy,
  onVerifyDiscrepancy,
  onEvidence,
}) => {
  const [severityFilter, setSeverityFilter] = useState<DiscrepancySeverity | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<DiscrepancyStatus | 'ALL'>('ALL');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
    onDismissDiscrepancy?.(id);
  };

  const handleVerify = (id: string) => {
    setVerifiedIds((prev) => new Set([...prev, id]));
    onVerifyDiscrepancy?.(id);
  };

  const filteredItems = discrepancies.filter((d) => {
    if (dismissedIds.has(d.item_id)) return false;
    if (severityFilter !== 'ALL' && d.severity !== severityFilter) return false;
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    return true;
  });

  const getSeverityBadge = (severity: DiscrepancySeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>CRITICAL</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>WARNING</span>
          </span>
        );
      case 'INFO':
      default:
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold">
            <Info className="w-3 h-3 text-cyan-400" />
            <span>INFO</span>
          </span>
        );
    }
  };

  const getStatusBadge = (status: DiscrepancyStatus) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono text-[10px]">
            MATCHED
          </span>
        );
      case 'UNDERCOUNT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[10px]">
            UNDERCOUNT
          </span>
        );
      case 'OVERCOUNT':
        return (
          <span className="px-1.5 py-0.5 rounded bg-orange-950/80 border border-orange-500/40 text-orange-300 font-mono text-[10px]">
            OVERCOUNT
          </span>
        );
      case 'UNPLACED_GHOST':
        return (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-[10px]">
            <Ghost className="w-2.5 h-2.5 text-rose-400 animate-pulse" />
            <span>UNPLACED_GHOST</span>
          </span>
        );
      case 'UNSCHEDULED':
      default:
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">
            UNSCHEDULED
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-slate-200">
      {/* Subheader Filters */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-950 flex flex-wrap gap-2 text-[11px] font-mono items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-slate-500 text-[10px]">Severity:</span>
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                severityFilter === sev
                  ? 'bg-cyan-900/80 text-cyan-200 border border-cyan-500/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {sev === 'ALL'
                ? 'All'
                : sev === 'CRITICAL'
                  ? 'Critical'
                  : sev === 'WARNING'
                    ? 'Warning'
                    : 'Info'}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-1">
          <span className="text-slate-500 text-[10px]">Status:</span>
          {(['ALL', 'UNPLACED_GHOST', 'UNDERCOUNT', 'MATCHED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                statusFilter === st
                  ? 'bg-cyan-900/80 text-cyan-200 border border-cyan-500/50'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {st === 'ALL'
                ? 'All'
                : st === 'UNPLACED_GHOST'
                  ? 'Ghosts'
                  : st === 'UNDERCOUNT'
                    ? 'Undercount'
                    : 'Matched'}
            </button>
          ))}
        </div>
      </div>

      {/* Discrepancies Count & Summary */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>
          Showing <strong className="text-cyan-300">{filteredItems.length}</strong> of{' '}
          {discrepancies.length} reconciliation items
        </span>
        {verifiedIds.size > 0 && (
          <span className="text-emerald-400 flex items-center space-x-1 text-[10px]">
            <CheckCircle2 className="w-3 h-3" />
            <span>{verifiedIds.size} verified</span>
          </span>
        )}
      </div>

      {/* Scrollable Discrepancy Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/70" />
            <p className="text-slate-300 font-semibold">Zero schedule discrepancies match filter</p>
            <p className="text-[11px] text-slate-500">
              Equipment schedules and plan takeoffs are reconciled.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isVerified = verifiedIds.has(item.item_id);
            const discColor = getDisciplineColor(item.discipline || item.system);

            return (
              <div
                key={item.item_id}
                data-testid="discrepancy-card"
                className={`p-3 rounded-xl border transition-all ${
                  isVerified
                    ? 'bg-slate-900/40 border-emerald-500/40'
                    : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600 shadow-md'
                }`}
              >
                {/* Header: Tag + Badges */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-700/60">
                  <div className="flex items-center space-x-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: discColor }}
                    />
                    <span className="font-mono font-bold text-slate-100 text-sm tracking-wide">
                      {item.tag}
                    </span>
                    {item.label && item.label !== item.tag && (
                      <span className="text-xs text-slate-400 truncate">({item.label})</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {getStatusBadge(item.status)}
                    {getSeverityBadge(item.severity)}
                  </div>
                </div>

                {/* Variance Readout (Rule 03 Monospace Invariant) */}
                <div className="my-2 py-1.5 px-2.5 rounded-lg bg-slate-950/90 border border-slate-800 flex items-center justify-between font-mono text-xs tabular-nums select-text">
                  <div className="flex items-center space-x-3 text-slate-400">
                    <span>
                      Sched:{' '}
                      <strong className="text-slate-100 font-semibold">{item.schedule_qty}</strong>
                    </span>
                    <span className="text-slate-700">|</span>
                    <span>
                      Plan:{' '}
                      <strong className="text-slate-100 font-semibold">{item.plan_qty}</strong>
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-bold">
                    <span className="text-slate-400 font-normal">Variance:</span>
                    <span
                      className={
                        item.variance === 0
                          ? 'text-emerald-400'
                          : item.variance < 0
                            ? 'text-rose-400'
                            : 'text-orange-400'
                      }
                    >
                      {item.variance > 0 ? `+${item.variance}` : item.variance}
                    </span>
                  </div>
                </div>

                {/* Trade & System Metadata */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5">
                  <span className="capitalize">{item.discipline || item.system || 'Mechanical'}</span>
                  {item.schedule_sheet && (
                    <span className="font-mono text-[10px] text-slate-500">
                      Schedule: {item.schedule_sheet}
                    </span>
                  )}
                </div>

                {/* Notes or Suggested Action */}
                {(item.notes || item.suggested_action) && (
                  <p className="text-[11px] text-slate-300 leading-snug pb-2 italic">
                    {item.notes || item.suggested_action}
                  </p>
                )}

                {/* Evidence Citations / Coordinates */}
                {item.location_pt && (
                  <div className="pb-2 flex items-center space-x-2">
                    <button
                      type="button"
                      title="Highlight on drawing canvas"
                      onClick={() => {
                        if (item.location_pt) {
                          onLocateItem?.(item.location_pt);
                          onEvidence?.([item.location_pt]);
                        }
                      }}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] hover:bg-cyan-900 transition-colors cursor-pointer"
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      <span>
                        [{item.location_pt[0]?.toFixed(0)}, {item.location_pt[1]?.toFixed(0)}] pt
                      </span>
                    </button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-700/60 flex items-center gap-1.5">
                  {item.status === 'UNPLACED_GHOST' && onPlaceGhostPin && (
                    <button
                      type="button"
                      onClick={() => onPlaceGhostPin(item.item_id || item.tag)}
                      className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-semibold cursor-pointer transition-colors"
                    >
                      <Ghost className="w-3 h-3 text-amber-400" />
                      <span>Place on Canvas</span>
                    </button>
                  )}

                  {item.location_pt && onLocateItem && (
                    <button
                      type="button"
                      onClick={() => item.location_pt && onLocateItem(item.location_pt)}
                      className="flex-1 flex items-center justify-center space-x-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-mono font-semibold cursor-pointer transition-colors"
                    >
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>Locate on Canvas</span>
                    </button>
                  )}

                  {onVerifyDiscrepancy && (
                    <button
                      type="button"
                      onClick={() => handleVerify(item.item_id)}
                      className={`px-2 py-1 rounded border text-[10px] font-mono font-semibold flex items-center space-x-1 cursor-pointer transition-colors ${
                        isVerified
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      <span>{isVerified ? 'Verified' : 'Mark Verified'}</span>
                    </button>
                  )}

                  {onDismissDiscrepancy && (
                    <button
                      type="button"
                      onClick={() => handleDismiss(item.item_id)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 cursor-pointer transition-colors"
                      title="Dismiss discrepancy"
                      aria-label="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
