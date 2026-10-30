import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Layers,
  Flame,
  Fan,
  Grid,
  Route,
  BookOpen,
  Ruler,
  Clock,
  Cpu,
  ArrowLeft,
  Check,
} from 'lucide-react';

export interface CapabilitiesConfig {
  fireDampers: boolean;
  wshp: boolean;
  linearGrilles: boolean;
  ductPipeRoutes: boolean;
}

export interface ScaleConfig {
  mode: 'auto' | 'manual';
  presetLabel: string;
}

export interface LegendConfig {
  mode: 'none' | 'same_pdf' | 'separate_pdf';
  pageNumber: number;
  separateFile: File | null;
}

export interface AnalysisSetupViewProps {
  fileName: string;
  fileSizeFormatted: string;
  pageCount: number;
  selectedPages: number[] | null;
  onSelectedPagesChange: (pages: number[] | null) => void;
  capabilities: CapabilitiesConfig;
  onCapabilitiesChange: (caps: CapabilitiesConfig) => void;
  scaleConfig: ScaleConfig;
  onScaleConfigChange: (cfg: ScaleConfig) => void;
  legendConfig: LegendConfig;
  onLegendConfigChange: (cfg: LegendConfig) => void;
  onBack: () => void;
  onStartAnalysis: () => void;
  isStarting?: boolean;
}

const SCALE_PRESETS = [
  { label: '1/8" = 1\'-0" (1:96)', desc: 'Standard Floor Plan' },
  { label: '1/4" = 1\'-0" (1:48)', desc: 'Detailed Mechanical' },
  { label: '3/8" = 1\'-0" (1:32)', desc: 'Equipment Room' },
  { label: '1/2" = 1\'-0" (1:24)', desc: 'Enlarged Detail' },
  { label: '1:100 Metric', desc: 'Metric General Plan' },
  { label: '1:50 Metric', desc: 'Metric Detailed Plan' },
];

export const AnalysisSetupView: React.FC<AnalysisSetupViewProps> = ({
  fileName,
  fileSizeFormatted,
  pageCount,
  selectedPages,
  onSelectedPagesChange,
  capabilities,
  onCapabilitiesChange,
  scaleConfig,
  onScaleConfigChange,
  legendConfig,
  onLegendConfigChange,
  onBack,
  onStartAnalysis,
  isStarting = false,
}) => {
  const [pageSelectionMode, setPageSelectionMode] = useState<'all' | 'custom'>(
    selectedPages && selectedPages.length > 0 ? 'custom' : 'all'
  );
  const [customPageInput, setCustomPageInput] = useState<string>(
    selectedPages ? selectedPages.join(', ') : '1'
  );

  const handlePageModeChange = (mode: 'all' | 'custom') => {
    setPageSelectionMode(mode);
    if (mode === 'all') {
      onSelectedPagesChange(null);
    } else {
      parseAndSetPages(customPageInput);
    }
  };

  const parseAndSetPages = (inputStr: string) => {
    setCustomPageInput(inputStr);
    const parts = inputStr.split(',').map((s) => s.trim());
    const pages = new Set<number>();
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let p = Math.max(1, start); p <= Math.min(pageCount, end); p++) {
            pages.add(p);
          }
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= pageCount) {
          pages.add(p);
        }
      }
    }
    const arr = Array.from(pages).sort((a, b) => a - b);
    onSelectedPagesChange(arr.length > 0 ? arr : null);
  };

  const activePagesCount =
    pageSelectionMode === 'custom' && selectedPages && selectedPages.length > 0
      ? selectedPages.length
      : pageCount;

  // Estimated processing time
  const estimatedSeconds = Math.max(12, activePagesCount * 18);
  const formatEstimatedTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `~${m}m ${s}s` : `~${s}s`;
  };

  return (
    <div className="max-w-4xl w-full mx-auto p-6 md:p-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title="Change Drawing PDF"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#006D84]">
              Step 2 of 4 · Configuration
            </span>
            <h1 className="font-heading text-2xl font-bold text-slate-900 tracking-tight">
              Analysis Setup
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartAnalysis}
          disabled={isStarting}
          className="btn-primary h-11 px-6 text-sm"
          id="btn-start-analysis"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{isStarting ? 'Preparing Run...' : 'Run Extraction'}</span>
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {/* 1. Uploaded Drawing Summary Bar */}
        <section aria-labelledby="section-file-summary" className="workstation-card p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-lg bg-[#006D84]/10 text-[#006D84] flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span id="section-file-summary" className="text-sm font-bold text-slate-900 block truncate max-w-md" title={fileName}>
                {fileName}
              </span>
              <div className="flex items-center space-x-2 text-xs font-mono text-slate-500 mt-0.5">
                <span>{fileSizeFormatted}</span>
                <span>•</span>
                <span className="font-semibold text-slate-700">{pageCount} total page{pageCount > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Page Selection for Large PDFs */}
          <div className="flex items-center space-x-2 border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-700">
              <button
                type="button"
                onClick={() => handlePageModeChange('all')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  pageSelectionMode === 'all'
                    ? 'bg-white shadow-2xs text-slate-900 font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                All Sheets ({pageCount})
              </button>
              <button
                type="button"
                onClick={() => handlePageModeChange('custom')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  pageSelectionMode === 'custom'
                    ? 'bg-white shadow-2xs text-slate-900 font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Select Sheets
              </button>
            </div>

            {pageSelectionMode === 'custom' && (
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  value={customPageInput}
                  onChange={(e) => parseAndSetPages(e.target.value)}
                  placeholder="e.g. 1-3, 5"
                  className="w-28 px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#006D84]/40"
                  title="Comma-separated pages or ranges (e.g. 1, 2, 4-6)"
                />
              </div>
            )}
          </div>
        </section>

        {/* 2. Extraction Capabilities (Engineering Capabilities, Not Low-Level Algorithms) */}
        <section aria-labelledby="section-capabilities" className="space-y-3">
          <div>
            <h2 id="section-capabilities" className="font-heading text-lg font-bold text-slate-900">
              Extraction Capabilities
            </h2>
            <p className="text-xs text-slate-500">
              Select quantifiable component symbols and linear route networks to extract.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Fire Dampers */}
            <div
              onClick={() =>
                onCapabilitiesChange({ ...capabilities, fireDampers: !capabilities.fireDampers })
              }
              className={`workstation-card p-4 flex items-start justify-between cursor-pointer transition-all ${
                capabilities.fireDampers
                  ? 'border-[#EA580C] ring-1 ring-[#EA580C]/20 bg-orange-50/20'
                  : 'opacity-60 bg-slate-50/60'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-lg bg-[#EA580C]/10 text-[#EA580C] flex items-center justify-center shrink-0 mt-0.5">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">Fire Dampers</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-orange-100 text-orange-800 border border-orange-200">
                      Level 1
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Detect life safety dampers on supply and return mechanical air systems.
                  </p>
                  <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                    Method: Tiled YOLO11n Detector (Supervised)
                  </span>
                </div>
              </div>

              <div
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 mt-1 ${
                  capabilities.fireDampers ? 'bg-[#EA580C] text-white' : 'border border-slate-300'
                }`}
              >
                {capabilities.fireDampers && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>

            {/* WSHP (Water Source Heat Pumps) */}
            <div
              onClick={() => onCapabilitiesChange({ ...capabilities, wshp: !capabilities.wshp })}
              className={`workstation-card p-4 flex items-start justify-between cursor-pointer transition-all ${
                capabilities.wshp
                  ? 'border-[#006D84] ring-1 ring-[#006D84]/20 bg-teal-50/20'
                  : 'opacity-60 bg-slate-50/60'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-lg bg-[#006D84]/10 text-[#006D84] flex items-center justify-center shrink-0 mt-0.5">
                  <Fan className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">WSHP Units</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-100 text-teal-800 border border-teal-200">
                      Level 1
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Water source heat pumps and terminal mechanical package units.
                  </p>
                  <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                    Method: Spatially Bounded Vector Matcher (GMMD)
                  </span>
                </div>
              </div>

              <div
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 mt-1 ${
                  capabilities.wshp ? 'bg-[#006D84] text-white' : 'border border-slate-300'
                }`}
              >
                {capabilities.wshp && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>

            {/* Linear Bar Grilles */}
            <div
              onClick={() =>
                onCapabilitiesChange({ ...capabilities, linearGrilles: !capabilities.linearGrilles })
              }
              className={`workstation-card p-4 flex items-start justify-between cursor-pointer transition-all ${
                capabilities.linearGrilles
                  ? 'border-[#0284C7] ring-1 ring-[#0284C7]/20 bg-sky-50/20'
                  : 'opacity-60 bg-slate-50/60'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-lg bg-[#0284C7]/10 text-[#0284C7] flex items-center justify-center shrink-0 mt-0.5">
                  <Grid className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">Linear Bar Grilles</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-100 text-sky-800 border border-sky-200">
                      Level 1
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                      Beta
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Air distribution grilles, linear diffusers, and architectural registers (known density limitations).
                  </p>
                  <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                    Method: Spatially Bounded Vector Matcher (GMMD · Beta)
                  </span>
                </div>
              </div>

              <div
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 mt-1 ${
                  capabilities.linearGrilles ? 'bg-[#0284C7] text-white' : 'border border-slate-300'
                }`}
              >
                {capabilities.linearGrilles && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>

            {/* Duct & Pipe Routes */}
            <div
              onClick={() =>
                onCapabilitiesChange({
                  ...capabilities,
                  ductPipeRoutes: !capabilities.ductPipeRoutes,
                })
              }
              className={`workstation-card p-4 flex items-start justify-between cursor-pointer transition-all ${
                capabilities.ductPipeRoutes
                  ? 'border-[#2563EB] ring-1 ring-[#2563EB]/20 bg-blue-50/20'
                  : 'opacity-60 bg-slate-50/60'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <Route className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">Duct & Pipe Routes</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-800 border border-blue-200">
                      Level 2
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Continuous polyline tracing for mechanical air ducts and plumbing pipes.
                  </p>
                  <span className="text-[11px] font-mono text-slate-400 mt-1 block">
                    Method: Conservative Hybrid Collinear Splicing + Topological Reconstruction
                  </span>
                </div>
              </div>

              <div
                className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 mt-1 ${
                  capabilities.ductPipeRoutes ? 'bg-[#2563EB] text-white' : 'border border-slate-300'
                }`}
              >
                {capabilities.ductPipeRoutes && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Legend Reference & Scale Setup (Simple, Direct, No Complex Fluff) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Legend Reference */}
          <section aria-labelledby="section-legend" className="workstation-card p-5 space-y-3">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-[#006D84]" />
              <h3 id="section-legend" className="font-heading text-sm font-bold text-slate-900">
                Legend & Symbol Schedule
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Correlate symbols against reference schedule for verified takeoff attribution.
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="legend-mode"
                  checked={legendConfig.mode === 'none'}
                  onChange={() => onLegendConfigChange({ ...legendConfig, mode: 'none' })}
                  className="text-[#006D84] focus:ring-[#006D84]"
                />
                <span>Direct Extraction (Pre-Indexed Symbol Reference)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="legend-mode"
                  checked={legendConfig.mode === 'same_pdf'}
                  onChange={() => onLegendConfigChange({ ...legendConfig, mode: 'same_pdf' })}
                  className="text-[#006D84] focus:ring-[#006D84]"
                />
                <span>Legend sheet exists in same PDF</span>
              </label>

              {legendConfig.mode === 'same_pdf' && (
                <div className="pl-6 pt-1 flex items-center space-x-2">
                  <span className="text-xs text-slate-600">Sheet Page:</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={legendConfig.pageNumber || 1}
                    onChange={(e) =>
                      onLegendConfigChange({
                        ...legendConfig,
                        pageNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
              Note: Automated symbol recognition is powered by verified training prototypes. Offline OCR reference banks are utilized during model training.
            </p>
          </section>

          {/* Scale Setup */}
          <section aria-labelledby="section-scale" className="workstation-card p-5 space-y-3">
            <div className="flex items-center space-x-2">
              <Ruler className="w-4 h-4 text-[#006D84]" />
              <h3 id="section-scale" className="font-heading text-sm font-bold text-slate-900">
                Drawing Scale Calibration
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Drawing-space coordinates are measured in points (pt). Physical length requires scale.
            </p>

            <div className="space-y-2 pt-1">
              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scale-mode"
                  checked={scaleConfig.mode === 'auto'}
                  onChange={() => onScaleConfigChange({ ...scaleConfig, mode: 'auto' })}
                  className="text-[#006D84] focus:ring-[#006D84]"
                />
                <div>
                  <span className="font-medium">Automatic Title-Block Detection</span>
                  <span className="text-slate-400 block text-[11px]">
                    Extracts ratio from title block; fails closed (null length) if unreadable.
                  </span>
                </div>
              </label>

              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scale-mode"
                  checked={scaleConfig.mode === 'manual'}
                  onChange={() => onScaleConfigChange({ ...scaleConfig, mode: 'manual' })}
                  className="text-[#006D84] focus:ring-[#006D84]"
                />
                <span className="font-medium">Manual Scale Fallback</span>
              </label>

              {scaleConfig.mode === 'manual' && (
                <div className="pl-6 pt-1">
                  <select
                    value={scaleConfig.presetLabel}
                    onChange={(e) =>
                      onScaleConfigChange({ ...scaleConfig, presetLabel: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#006D84]/40"
                  >
                    {SCALE_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} — {p.desc}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
              Interactive 2-point ruler calibration is also available directly on the drawing canvas in the Results Workspace.
            </p>
          </section>
        </div>

        {/* 4. Estimated Processing Time & Resources */}
        <section aria-labelledby="section-resources" className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center space-x-4">
            <span id="section-resources" className="sr-only">Estimated Processing Resources</span>
            <div className="flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-[#006D84]" />
              <span>Est. Runtime: <strong className="font-mono text-slate-800">{formatEstimatedTime(estimatedSeconds)}</strong></span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Cpu className="w-4 h-4 text-[#006D84]" />
              <span>Execution: <strong className="font-mono text-slate-800">Isolated Child Process</strong></span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-[#006D84]" />
              <span>Target Sheets: <strong className="font-mono text-slate-800">{activePagesCount}</strong></span>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartAnalysis}
            disabled={isStarting}
            className="btn-primary text-xs h-9"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{isStarting ? 'Starting...' : 'Start Analysis'}</span>
          </button>
        </section>
      </div>
    </div>
  );
};
