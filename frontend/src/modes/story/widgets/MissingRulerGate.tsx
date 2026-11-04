import React, { useState } from 'react';
import { Ruler, ShieldCheck, AlertOctagon, HelpCircle } from 'lucide-react';

export const MissingRulerGate: React.FC = () => {
  type SystemMode = 'guess' | 'fail-closed';
  const [scalePresent, setScalePresent] = useState<boolean>(false);
  const [selectedSystem, setSelectedSystem] = useState<SystemMode>('fail-closed');

  return (
    <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <Ruler className="w-4 h-4 text-amber-400" />
          <span className="font-heading text-sm font-semibold text-white tracking-wide">
            Interactive Visualizer 5: The Missing Ruler (Gate G3)
          </span>
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
          <span>Gate G3 Governance</span>
        </div>
      </div>

      {/* Scenario Control: Drawing Title Block Status */}
      <div className="mt-4 bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="text-xs">
          <span className="text-slate-300 font-semibold">Drawing Reality: </span>
          <span className="text-slate-400">Did the architect export the title block ruler?</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setScalePresent(true)}
            className={`px-3 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
              scalePresent
                ? 'bg-slate-700 text-white font-bold border border-slate-500'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Title Block Present (1/4" = 1'-0")
          </button>
          <button
            onClick={() => setScalePresent(false)}
            className={`px-3 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
              !scalePresent
                ? 'bg-bt-review-bg text-bt-review font-bold border border-amber-800/60'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Title Block Stripped (Crop)
          </button>
        </div>
      </div>

      {/* Compare Approaches Toggle */}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <button
          onClick={() => setSelectedSystem('guess')}
          className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
            selectedSystem === 'guess'
              ? 'bg-rose-950/40 border-rose-800/80 shadow-xs'
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/50'
          }`}
        >
          <div className="text-xs font-bold text-rose-400 flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Naive Generative AI (Guess Mode)</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Hallucinates common scale to avoid returning blank results.
          </div>
        </button>

        <button
          onClick={() => setSelectedSystem('fail-closed')}
          className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
            selectedSystem === 'fail-closed'
              ? 'bg-emerald-950/40 border-emerald-800/80 shadow-xs'
              : 'bg-slate-900/40 border-slate-800 hover:bg-slate-800/50'
          }`}
        >
          <div className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>BlueTraceAI Gate G3 (Fail-Closed)</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Suppresses physical length to protect contractor bids.
          </div>
        </button>
      </div>

      {/* Simulated Output Ledger Card */}
      <div className="mt-4 bg-[#0F172A] border border-slate-800 rounded-lg p-4 font-mono text-xs">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex justify-between">
          <span>Corridor Duct Run Takeoff Result (360 pt Vector Run)</span>
          <span>Status Ledger</span>
        </div>

        {selectedSystem === 'guess' ? (
          <div className="mt-3 space-y-2">
            {scalePresent ? (
              <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700">
                <div className="text-slate-300 font-bold">Estimated Length: 14.63 meters (48.0 ft)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Calculated using verified title block scale.</div>
              </div>
            ) : (
              <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800/60 text-rose-200">
                <div className="font-bold flex items-center space-x-1.5 text-rose-400">
                  <AlertOctagon className="w-4 h-4" />
                  <span>AI Guess: 14.63 meters (48.0 ft) — UNVERIFIED!</span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-rose-300">
                  <span className="font-bold">Bidding Danger: </span> The AI assumed standard 1/4" = 1'-0" scale. But if this drawing was actually 1/8" scale, the true ductwork was 29.2 meters. The subcontractor underbids by 50% and faces a $150,000 to $1,500,000 contractor claim!
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {scalePresent ? (
              <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-bt-success">
                <div className="font-bold text-emerald-400">Verified Length: 14.63 meters (48.0 ft)</div>
                <div className="text-[11px] text-bt-success/80 mt-0.5">Scale confirmed programmatically against legend calibration bar.</div>
              </div>
            ) : (
              <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 text-bt-review">
                <div className="font-bold flex items-center space-x-1.5 text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>length: null (FAIL-CLOSED)</span>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-bt-review/90">
                  <span className="font-bold">Gate G3 Rule: </span> Scale unverified. Physical lengths set to null to protect estimators from inaccurate bids. Pixel vector length preserved (360 pt) for manual calibration.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
