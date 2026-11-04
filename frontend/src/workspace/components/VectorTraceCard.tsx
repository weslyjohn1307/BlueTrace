import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ScaleStatus } from '../../api/contracts';

export interface VectorTraceCardProps {
  totalRuns?: number;
  totalLengthFt?: number;
  confidence?: number | null;
  scaleVerified?: boolean;
  scaleRatio?: number;
  scaleStatus?: ScaleStatus;
}

export const VectorTraceCard: React.FC<VectorTraceCardProps> = ({
  totalRuns = 0,
  totalLengthFt = 0,
  confidence,
  scaleVerified = false,
  scaleRatio,
  scaleStatus = 'UNVERIFIED',
}) => {
  const [collapsed, setCollapsed] = useState(true);

  const avgSegmentLength =
    totalRuns > 0 ? (totalLengthFt / totalRuns).toFixed(1) : '0.0';

  return (
    <div
      className={`absolute right-4 top-14 z-30 ${collapsed ? 'w-56 p-2' : 'w-72 p-3.5'} bg-bt-surface/90 backdrop-blur-md border border-cyan-500/30 rounded-xl shadow-lg select-none transition-all duration-200`}
      data-purpose="agent-vectortrace-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-bt-border-subtle">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              scaleVerified
                ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
            }`}
          />
          <span className="text-xs font-bold text-bt-text-primary font-mono tracking-tight">
            Vector Linework
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold border ${
              scaleVerified
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
            }`}
          >
            {scaleStatus === 'VERIFIED' ? 'VERIFIED' : scaleStatus === 'CALIBRATED' ? 'CALIBRATED' : 'REVIEW'}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 text-bt-text-secondary hover:text-bt-on-brand cursor-pointer"
            aria-label={collapsed ? 'Show vector trace details' : 'Hide vector trace details'}
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3 pt-2.5">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 font-mono">
            <div className="bg-bt-inset/80 rounded-xl p-2 border border-bt-border-subtle flex flex-col">
              <span className="text-[9px] uppercase text-bt-text-tertiary">Total Run</span>
              <span className="text-xs font-bold text-cyan-300 mt-0.5 tabular-nums">
                {totalLengthFt.toFixed(0)} <span className="text-[9px] text-bt-text-secondary">LF</span>
              </span>
            </div>
            <div className="bg-bt-inset/80 rounded-xl p-2 border border-bt-border-subtle flex flex-col">
              <span className="text-[9px] uppercase text-bt-text-tertiary">Segments</span>
              <span className="text-xs font-bold text-bt-text-primary mt-0.5 tabular-nums">{totalRuns}</span>
            </div>
            <div className="bg-bt-inset/80 rounded-xl p-2 border border-bt-border-subtle flex flex-col">
              <span className="text-[9px] uppercase text-bt-text-tertiary">Confidence</span>
              <span className="text-xs font-bold text-cyan-400 mt-0.5 tabular-nums">
                {confidence != null ? `${(confidence * 100).toFixed(1)}%` : 'Unscored'}
              </span>
            </div>
          </div>

          {/* Real Linework Telemetry (Replaces fake velocity & bezier curve) */}
          <div className="space-y-1.5 bg-bt-inset/90 rounded-xl p-2.5 border border-bt-border-subtle/80 font-mono text-[11px]">
            <div className="flex items-center justify-between text-bt-text-secondary">
              <span className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Segment Density</span>
              </span>
              <span className="text-bt-text-primary font-semibold tabular-nums">
                {avgSegmentLength} LF/run
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-bt-border-subtle/60">
              <span className="text-bt-text-secondary">Scale Ratio</span>
              <div className="flex items-center space-x-1">
                {scaleVerified ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold">
                      {scaleRatio != null ? `${scaleRatio.toFixed(1)}:1` : 'Verified'}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300 font-semibold">Review Required</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Deterministic Linework Proof */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-bt-text-secondary">
              <span>Vector Linework Proof</span>
              <span className="text-cyan-400 font-semibold">Deterministic</span>
            </div>
            <div className="w-full h-1.5 bg-bt-panel rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                style={{ width: totalRuns > 0 ? '100%' : '0%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
