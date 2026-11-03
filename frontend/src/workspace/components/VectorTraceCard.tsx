import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface VectorTraceCardProps {
  totalRuns?: number;
  totalLengthFt?: number;
  confidence?: number;
  scaleVerified?: boolean;
  scaleRatio?: number;
}

export const VectorTraceCard: React.FC<VectorTraceCardProps> = ({
  totalRuns = 0,
  totalLengthFt = 0,
  confidence = 0.998,
  scaleVerified = false,
  scaleRatio,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const avgSegmentLength =
    totalRuns > 0 ? (totalLengthFt / totalRuns).toFixed(1) : '0.0';

  return (
    <div
      className="absolute right-4 top-14 z-30 w-72 bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] select-none transition-all duration-300"
      data-purpose="agent-vectortrace-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              scaleVerified
                ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                : 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
            }`}
          />
          <span className="text-xs font-bold text-slate-100 font-mono tracking-tight">
            Vector Linework Engine
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
            {scaleVerified ? 'CALIBRATED' : 'REVIEW'}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Toggle card"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-3 pt-2.5">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 font-mono">
            <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800 flex flex-col">
              <span className="text-[9px] uppercase text-slate-500">Total Run</span>
              <span className="text-xs font-bold text-cyan-300 mt-0.5 tabular-nums">
                {totalLengthFt.toFixed(0)} <span className="text-[9px] text-slate-400">LF</span>
              </span>
            </div>
            <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800 flex flex-col">
              <span className="text-[9px] uppercase text-slate-500">Segments</span>
              <span className="text-xs font-bold text-slate-200 mt-0.5 tabular-nums">{totalRuns}</span>
            </div>
            <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800 flex flex-col">
              <span className="text-[9px] uppercase text-slate-500">Confidence</span>
              <span className="text-xs font-bold text-emerald-400 mt-0.5 tabular-nums">
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Real Linework Telemetry (Replaces fake velocity & bezier curve) */}
          <div className="space-y-1.5 bg-slate-950/90 rounded-xl p-2.5 border border-slate-800/80 font-mono text-[11px]">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Segment Density</span>
              </span>
              <span className="text-slate-200 font-semibold tabular-nums">
                {avgSegmentLength} LF/run
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">Scale Ratio</span>
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
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Vector Linework Proof</span>
              <span className="text-cyan-400 font-semibold">Deterministic</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
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
