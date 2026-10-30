import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface VectorTraceCardProps {
  totalRuns?: number;
  totalLengthFt?: number;
  confidence?: number;
  scaleVerified?: boolean;
}

export const VectorTraceCard: React.FC<VectorTraceCardProps> = ({
  totalRuns = 329,
  totalLengthFt = 1840,
  confidence = 0.998,
  scaleVerified = true,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute right-4 top-14 z-30 w-72 bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] select-none transition-all duration-300"
      data-purpose="agent-vectortrace-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          <span className="text-xs font-bold text-slate-100 font-mono tracking-tight">Agent 01: VectorTrace</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-semibold border border-cyan-500/40">
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
              <span className="text-xs font-bold text-cyan-300 mt-0.5">
                {totalLengthFt.toFixed(0)} <span className="text-[9px] text-slate-400">LF</span>
              </span>
            </div>
            <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800 flex flex-col">
              <span className="text-[9px] uppercase text-slate-500">Segments</span>
              <span className="text-xs font-bold text-slate-200 mt-0.5">{totalRuns}</span>
            </div>
            <div className="bg-slate-950/80 rounded-xl p-2 border border-slate-800 flex flex-col">
              <span className="text-[9px] uppercase text-slate-500">Confidence</span>
              <span className="text-xs font-bold text-emerald-400 mt-0.5">
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Micro Velocity Area Sparkline */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-cyan-400" />
                <span>Parsing Velocity</span>
              </span>
              <span className="text-cyan-300 font-semibold">128 item/min</span>
            </div>
            <div className="h-9 w-full bg-slate-950/90 rounded-lg overflow-hidden border border-slate-800 p-0.5">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 28">
                <path
                  d="M0,24 Q15,18 30,20 T60,8 T85,12 T100,4 L100,28 L0,28 Z"
                  fill="rgba(34, 211, 238, 0.2)"
                />
                <path
                  d="M0,24 Q15,18 30,20 T60,8 T85,12 T100,4"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="100" cy="4" fill="#22d3ee" r="2.5" />
              </svg>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Vector Linework Proof</span>
              <span className="text-cyan-400 font-semibold">100% Deterministic</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
