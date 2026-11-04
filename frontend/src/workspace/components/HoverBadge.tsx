import React from 'react';
import { Check, X, ScanSearch, AlertTriangle, Clock } from 'lucide-react';

export interface HoverBadgeProps {
  x: number;
  y: number;
  detectedText: string;
  latencyMs: number;
  confidence: number;
  reviewRequired?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onClose?: () => void;
}

export const HoverBadge: React.FC<HoverBadgeProps> = ({
  x,
  y,
  detectedText,
  latencyMs,
  confidence,
  reviewRequired = false,
  onAccept,
  onReject,
  onClose,
}) => {
  return (
    <div
      className="absolute z-50 pointer-events-auto transform -translate-x-1/2 -translate-y-full mb-3 select-none"
      style={{ left: `${x}px`, top: `${y}px` }}
      data-testid="hover-badge"
    >
      <div
        className={`px-3 py-2 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md border text-xs flex items-center space-x-2.5 transition-all ${
          reviewRequired
            ? 'bg-amber-950/95 border-amber-500/60 text-amber-200 ring-1 ring-amber-500/30'
            : 'bg-bt-surface/95 border-cyan-500/50 text-bt-text-primary ring-1 ring-cyan-500/20'
        }`}
      >
        <div className="flex items-center space-x-1.5">
          {reviewRequired ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
          ) : (
            <ScanSearch className="w-3.5 h-3.5 text-bt-info shrink-0" />
          )}
          <span className="font-semibold tracking-wide font-mono text-xs">
            {detectedText || (reviewRequired ? 'Scale Review Required' : 'Dimensioning…')}
          </span>
        </div>

        <div className="flex items-center space-x-1 text-[10px] opacity-75 font-mono border-l border-bt-border-strong/80 pl-2">
          <Clock className="w-2.5 h-2.5 text-bt-text-secondary" />
          <span>{latencyMs}ms</span>
        </div>

        {!reviewRequired && confidence > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-bold">
            {Math.round(confidence * 100)}%
          </span>
        )}

        <div className="flex items-center space-x-1.5 pl-2 border-l border-bt-border-strong/80">
          {onAccept && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
              className="flex items-center space-x-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-bt-on-brand font-mono text-[10px] transition-colors cursor-pointer shadow-xs"
              title="Accept Dimension [Enter]"
              aria-label="Accept"
            >
              <Check className="w-3 h-3" />
              <span>Accept</span>
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              className="p-1 rounded-md bg-bt-panel hover:bg-rose-600 text-bt-text-secondary hover:text-bt-on-brand transition-colors cursor-pointer"
              title="Dismiss [Esc]"
              aria-label="Reject"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {onClose && !onReject && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-md hover:bg-bt-panel text-bt-text-secondary hover:text-bt-on-brand transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {/* Downward pointer caret */}
      <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900 mx-auto" />
    </div>
  );
};
