import React from 'react';
import { Check, X, Sparkles, AlertTriangle, Clock } from 'lucide-react';

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
      className="absolute z-50 pointer-events-auto transform -translate-x-1/2 -translate-y-full mb-3"
      style={{ left: `${x}px`, top: `${y}px` }}
      data-testid="hover-badge"
    >
      <div
        className={`px-3 py-2 rounded-lg shadow-xl backdrop-blur-md border text-xs flex items-center space-x-2.5 transition-all ${
          reviewRequired
            ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
            : 'bg-slate-900/90 border-cyan-500/40 text-slate-100'
        }`}
      >
        <div className="flex items-center space-x-1.5">
          {reviewRequired ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="font-semibold tracking-wide font-mono">
            {detectedText || (reviewRequired ? 'Review Required' : 'Dimensioning...')}
          </span>
        </div>

        <div className="flex items-center space-x-1 text-[10px] opacity-75 font-mono border-l border-slate-700 pl-2">
          <Clock className="w-2.5 h-2.5" />
          <span>{latencyMs}ms</span>
        </div>

        {!reviewRequired && confidence > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-700 text-cyan-300">
            {Math.round(confidence * 100)}%
          </span>
        )}

        <div className="flex items-center space-x-1 pl-1 border-l border-slate-700">
          {onAccept && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
              className="p-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              title="Accept Dimension"
              aria-label="Accept"
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              className="p-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white transition-colors cursor-pointer"
              title="Reject Dimension"
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
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {/* Downward triangle pointer */}
      <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900/90 mx-auto" />
    </div>
  );
};
