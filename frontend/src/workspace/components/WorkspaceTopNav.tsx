import React, { useRef } from 'react';
import {
  FileUp,
  Sparkles,
  Loader2,
  RotateCcw,
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { AnalysisState } from '../hooks/useAnalysisWorkflow';

interface WorkspaceTopNavProps {
  analysisState: AnalysisState;
  onFileSelect: (file: File) => void;
  onStartAnalysis: () => void;
  onReset: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  isExporting?: boolean;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

/** Map analysis stage to a human-readable pipeline step label */
function getStagePipelineLabel(state: AnalysisState): string | null {
  switch (state.stage) {
    case 'processing':
      if (state.currentPage !== null && state.pageCount > 0) {
        return `Sheet ${state.currentPage} of ${state.pageCount}`;
      }
      return 'Detecting symbols & tracing routes';
    case 'persisting':
      return 'Indexing quantities';
    case 'preparing':
      return 'Creating session';
    case 'uploading':
      return 'Uploading drawing';
    default:
      return null;
  }
}

export const WorkspaceTopNav: React.FC<WorkspaceTopNavProps> = ({
  analysisState,
  onFileSelect,
  onStartAnalysis,
  onReset,
  onExportCsv,
  onExportJson,
  isExporting = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAnalyzing = [
    'preparing',
    'uploading',
    'preflight',
    'processing',
    'persisting',
  ].includes(analysisState.stage);

  const hasResults = analysisState.stage === 'completed';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const pipelineLabel = getStagePipelineLabel(analysisState);

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shadow-xs select-none">
      {/* Brand & Left Context */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-md bg-[#006D84] text-white flex items-center justify-center font-bold font-mono text-sm tracking-tighter">
            BT
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-heading font-bold text-sm text-slate-900 tracking-tight">
                BlueTraceAI
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                2D Drawing Intelligence
              </span>
            </div>
            <div className="text-[10px] text-slate-500 flex items-center space-x-1">
              <span>BlueTraceAI</span>
              <span>•</span>
              <span className="font-medium text-[#006D84]">Meta Hackathon</span>
            </div>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          className="hidden"
        />

        {/* File Chooser / Badge */}
        {!analysisState.fileMeta ? (
          <button
            type="button"
            id="topnav-choose-pdf-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-300 text-xs font-medium text-slate-700 transition-colors shadow-2xs cursor-pointer ml-3"
          >
            <FileUp className="w-3.5 h-3.5 text-slate-600" />
            <span>Choose PDF Drawing</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 ml-3 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
            <FileText className="w-3.5 h-3.5 text-[#006D84]" />
            <span className="text-xs font-medium text-slate-800 max-w-[200px] truncate" title={analysisState.fileMeta.name}>
              {analysisState.fileMeta.name}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              ({analysisState.fileMeta.sizeFormatted})
            </span>
            {!isAnalyzing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
              >
                Change
              </button>
            )}
          </div>
        )}
      </div>

      {/* Middle Action: Analyze CTA & Progress Bar */}
      <div className="flex-1 max-w-sm mx-6">
        {analysisState.stage === 'selected' && (
          <button
            type="button"
            id="topnav-analyze-btn"
            onClick={onStartAnalysis}
            className="w-full flex items-center justify-center space-x-2 px-4 py-1.5 rounded-md bg-[#006D84] hover:bg-[#005769] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Analyze Drawing</span>
          </button>
        )}

        {isAnalyzing && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-[#006D84] flex items-center space-x-1.5 truncate min-w-0">
                <Loader2 className="w-3 h-3 animate-spin text-[#006D84] shrink-0" />
                <span className="truncate">{pipelineLabel || analysisState.humanMessage}</span>
              </span>
              <span className="font-mono text-slate-500 text-[10px] ml-2 shrink-0">
                {analysisState.elapsedSeconds > 0 && `${formatElapsed(analysisState.elapsedSeconds)} `}
                {analysisState.progressPercent}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#006D84] h-1.5 transition-all duration-300 rounded-full"
                style={{ width: `${analysisState.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {analysisState.stage === 'completed' && analysisState.isPartial && (
          <div className="flex items-center space-x-1.5 bg-amber-50 border border-amber-200 px-3 py-1 rounded text-xs text-amber-700">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">Partial: {analysisState.humanMessage}</span>
          </div>
        )}

        {analysisState.stage === 'completed' && !analysisState.isPartial && (
          <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded text-xs text-emerald-700">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>Analysis complete</span>
          </div>
        )}

        {analysisState.stage === 'failed' && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 px-3 py-1 rounded text-xs text-rose-700">
            <span className="truncate max-w-[280px]">{analysisState.errorMessage}</span>
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-semibold underline text-rose-800 ml-2 cursor-pointer shrink-0"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Right Controls: Model Status & Export Controls */}
      <div className="flex items-center space-x-3">
        {/* Model Status Pill */}
        <div
          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
            analysisState.modelReady
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title={
            analysisState.modelReady
              ? 'Muse Spark 1.3 Vision & OCR online'
              : 'Model API unconfigured or offline'
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              analysisState.modelReady ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span>{analysisState.modelReady ? 'Model Ready' : 'Model Unavailable'}</span>
        </div>

        {/* Results Export Actions */}
        {hasResults && (
          <div className="flex items-center space-x-1.5">
            {onExportCsv && (
              <button
                type="button"
                id="topnav-export-csv-btn"
                onClick={onExportCsv}
                disabled={isExporting}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-xs font-medium text-slate-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Download structured quantities CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>CSV</span>
              </button>
            )}
            {onExportJson && (
              <button
                type="button"
                id="topnav-export-json-btn"
                onClick={onExportJson}
                disabled={isExporting}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-xs font-medium text-slate-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Download 5-field public JSON takeoff"
              >
                <Download className="w-3.5 h-3.5 text-sky-600" />
                <span>JSON</span>
              </button>
            )}
            <button
              type="button"
              id="topnav-reset-btn"
              onClick={onReset}
              className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 text-xs transition-colors cursor-pointer"
              title="Upload new drawing"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
