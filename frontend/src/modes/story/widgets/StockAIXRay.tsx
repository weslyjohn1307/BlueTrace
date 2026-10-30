import React, { useState } from 'react';
import { Eye, Terminal, CheckCircle2, XCircle, GitCommit } from 'lucide-react';

export const StockAIXRay: React.FC = () => {
  type Mode = 'raw' | 'stock' | 'custom';
  const [activeMode, setActiveMode] = useState<Mode>('stock');

  return (
    <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 text-[#38BDF8]" />
          <span className="font-heading text-sm font-semibold text-white tracking-wide">
            Interactive Visualizer 3: The Stock AI X-Ray (P00 Failure Log)
          </span>
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-400">
          <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
          <span>Commit 0ebbc80d</span>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-3 gap-2 mt-4 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setActiveMode('raw')}
          className={`py-2 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeMode === 'raw'
              ? 'bg-slate-800 text-white shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          1. Raw Blueprint
        </button>
        <button
          onClick={() => setActiveMode('stock')}
          className={`py-2 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeMode === 'stock'
              ? 'bg-rose-950/60 text-rose-300 border border-rose-800/50 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          2. Stock YOLO (COCO)
        </button>
        <button
          onClick={() => setActiveMode('custom')}
          className={`py-2 px-3 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeMode === 'custom'
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 shadow-xs font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          3. BlueTraceAI Model (Legend-Grounded)
        </button>
      </div>

      {/* Simulated Blueprint / Detection Viewport */}
      <div className="relative mt-4 bg-[#0F172A] rounded-lg border border-slate-800 p-6 min-h-[220px] flex items-center justify-center">
        {/* Architectural Legend Background Grid */}
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-lg p-4 space-y-3 font-mono text-xs">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2 flex justify-between">
            <span>Symbol Legend Crop (Sheet M-3.1)</span>
            <span className="text-slate-400">150 DPI Scan</span>
          </div>

          {/* Symbol Row 1: Fire Damper */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 relative">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 bg-[#EA580C] border border-white flex items-center justify-center text-[10px] text-white font-bold">
                ✕
              </div>
              <div>
                <div className="text-white font-semibold">Fire Damper (FD)</div>
                <div className="text-[10px] text-slate-400">HVAC Safety Partition</div>
              </div>
            </div>

            {/* Prediction Overlays */}
            {activeMode === 'stock' && (
              <span className="flex items-center space-x-1 text-[11px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                <XCircle className="w-3.5 h-3.5" />
                <span>Missed (0.00)</span>
              </span>
            )}
            {activeMode === 'custom' && (
              <span className="flex items-center space-x-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Fire Damper 0.94</span>
              </span>
            )}
          </div>

          {/* Symbol Row 2: Electrical Legend Symbol */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 relative">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 border border-cyan-400 flex items-center justify-center text-[10px] text-cyan-300">
                ◇
              </div>
              <div>
                <div className="text-white font-semibold">Duplex Receptacle</div>
                <div className="text-[10px] text-slate-400">120V Power Outlet</div>
              </div>
            </div>

            {/* Prediction Overlays */}
            {activeMode === 'stock' && (
              <span className="flex items-center space-x-1 text-[11px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40 font-bold">
                <XCircle className="w-3.5 h-3.5" />
                <span>"kite" 0.61</span>
              </span>
            )}
            {activeMode === 'custom' && (
              <span className="flex items-center space-x-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                <span>Domain Filtered</span>
              </span>
            )}
          </div>

          {/* Symbol Row 3: Motor Connection */}
          <div className="flex items-center justify-between p-2 rounded bg-slate-800/40 relative">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 border border-amber-400 rounded-full flex items-center justify-center text-[10px] text-amber-300">
                M
              </div>
              <div>
                <div className="text-white font-semibold">Motor Connection</div>
                <div className="text-[10px] text-slate-400">Pumping Unit #4</div>
              </div>
            </div>

            {/* Prediction Overlays */}
            {activeMode === 'stock' && (
              <span className="flex items-center space-x-1 text-[11px] text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40 font-bold">
                <XCircle className="w-3.5 h-3.5" />
                <span>"bird" 0.72</span>
              </span>
            )}
            {activeMode === 'custom' && (
              <span className="flex items-center space-x-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                <span>Domain Filtered</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Forensic Log */}
      <div className="mt-4 bg-slate-950 rounded-lg p-3 border border-slate-800 font-mono text-[11px] text-slate-300">
        <div className="flex items-center space-x-2 text-slate-400 border-b border-slate-800 pb-1.5 mb-2">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span>BASELINE_P00.log — Forensic Inspection</span>
        </div>
        {activeMode === 'raw' && (
          <div className="text-slate-400">
            $ python -m src.baseline.inspect --sheet "BSWH-THH TFO_page_10.pdf"<br />
            → Ingested 28.35M pixel engineering scan. Zero inference applied.
          </div>
        )}
        {activeMode === 'stock' && (
          <div className="text-rose-300/90 leading-relaxed">
            <span className="text-rose-400 font-bold">[CRITICAL COLLAPSE]</span> Stock YOLO11 (COCO natural weights):<br />
            • Sheet E1.1: Detected 1 "book", 1 "kite" across electrical legend.<br />
            • Sheet M-3.1: Detected 1 "traffic light" on manual fire alarm pull.<br />
            • Sheet P601: Detected 50 "birds" on motor pump connections.<br />
            <span className="text-rose-400 font-bold">Level 1 Takeoff Recall: 0.00% (Commit 0ebbc80d)</span>
          </div>
        )}
        {activeMode === 'custom' && (
          <div className="text-emerald-300/90 leading-relaxed">
            <span className="text-emerald-400 font-bold">[GATE G1 PASS]</span> Custom Tiled Model (`mep-fire-damper-v1.pt`):<br />
            • 640×640 tiled sliding window inference with 128px border overlap.<br />
            • 100% recall on 32 verified Fire Damper instances (Sheet BSWH Page 10).<br />
            • 175 Fire Dampers detected on Sheet PfMCC Page 118.<br />
            <span className="text-emerald-400 font-bold">Level 1 Gate G1 Verified: 100% Symbol Recovery</span>
          </div>
        )}
      </div>
    </div>
  );
};
