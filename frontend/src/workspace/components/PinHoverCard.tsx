import React from 'react';
import { getDisciplineColor } from '../utils/disciplineColors';
import type { CanvasPin } from './SheetCanvas';

export interface PinHoverCardProps {
  pin: CanvasPin;
  screenX: number;
  screenY: number;
  onPlaceOnCanvas?: (pin: CanvasPin) => void;
  onSelect?: (pin: CanvasPin) => void;
  onDismiss?: (pin: CanvasPin) => void;
}

export const PinHoverCard: React.FC<PinHoverCardProps> = ({
  pin,
  screenX,
  screenY,
  onPlaceOnCanvas,
  onSelect,
  onDismiss,
}) => {
  const disciplineColor = getDisciplineColor(pin.discipline || pin.system);
  const tag = pin.tag || pin.label || pin.id;
  const equipmentType = pin.equipmentType || pin.description || 'Equipment Component';
  const cfm = pin.cfm !== undefined && pin.cfm !== null ? `${pin.cfm} CFM` : null;

  // Determine status color styling
  const status = pin.status || (pin.kind === 'ghost' ? 'UNPLACED_GHOST' : 'MATCHED');
  let statusBadgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
  if (status === 'MATCHED') {
    statusBadgeStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
  } else if (status === 'UNDERCOUNT') {
    statusBadgeStyle = 'bg-amber-950/80 text-amber-300 border-amber-500/40';
  } else if (status === 'OVERCOUNT') {
    statusBadgeStyle = 'bg-orange-950/80 text-orange-300 border-orange-500/40';
  } else if (status === 'UNPLACED_GHOST' || pin.kind === 'ghost') {
    statusBadgeStyle = 'bg-rose-950/80 text-rose-300 border-rose-500/40';
  }

  // Adjust position to avoid screen overflow
  const cardWidth = 260;
  const left = Math.max(12, screenX - cardWidth / 2);
  const top = Math.max(12, screenY - 145);

  return (
    <div
      data-testid="pin-hover-card"
      role="tooltip"
      className="absolute z-50 pointer-events-auto w-[260px] rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md p-3 select-none text-xs transition-opacity duration-150 animate-fade-in"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {/* Header: Tag + Status badge */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
        <div className="flex items-center space-x-1.5 truncate">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: disciplineColor }}
          />
          <span className="font-mono font-bold text-slate-100 text-sm tracking-wide truncate">
            {tag}
          </span>
        </div>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold border ${statusBadgeStyle}`}
        >
          {status}
        </span>
      </div>

      {/* Equipment Type & Trade */}
      <div className="pt-1.5 pb-2 space-y-1">
        <p className="text-slate-300 font-medium leading-tight truncate">{equipmentType}</p>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <span className="capitalize">{pin.discipline || pin.system || 'Mechanical'}</span>
          {cfm && (
            <>
              <span className="text-slate-600">•</span>
              <span className="font-mono font-semibold text-cyan-300">{cfm}</span>
            </>
          )}
        </div>
      </div>

      {/* Scheduled vs Plan Qty & Confidence */}
      <div className="py-1 px-2 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between font-mono text-[11px] tabular-nums">
        <div className="flex items-center space-x-2 text-slate-400">
          <span>
            Sched: <strong className="text-slate-200">{pin.scheduled_qty ?? '-'}</strong>
          </span>
          <span className="text-slate-700">|</span>
          <span>
            Plan: <strong className="text-slate-200">{pin.plan_qty ?? '-'}</strong>
          </span>
        </div>
        {pin.confidence !== undefined && (
          <span className="text-emerald-400 font-semibold">
            {(pin.confidence * 100).toFixed(0)}% conf
          </span>
        )}
      </div>

      {/* Coordinate Telemetry */}
      <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>
          [{pin.x.toFixed(1)}, {pin.y.toFixed(1)}] pt
        </span>
        {pin.kind === 'ghost' && (
          <span className="text-amber-400 font-semibold flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            <span>UNPLACED GHOST</span>
          </span>
        )}
      </div>

      {/* Action Buttons if callbacks provided */}
      {(onPlaceOnCanvas || onSelect || onDismiss) && (
        <div className="pt-2 mt-1.5 border-t border-slate-800 flex items-center gap-1.5">
          {pin.kind === 'ghost' && onPlaceOnCanvas && (
            <button
              type="button"
              onClick={() => onPlaceOnCanvas(pin)}
              className="flex-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-semibold cursor-pointer transition-colors"
            >
              Place on Canvas
            </button>
          )}
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(pin)}
              className="flex-1 px-2 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-semibold cursor-pointer transition-colors"
            >
              Select
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(pin)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] font-mono cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
};
