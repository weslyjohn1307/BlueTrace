import React from 'react';
import {
  Loader2,
  Clock,
  Layers,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import type { AnalysisState } from '../hooks/useAnalysisWorkflow';

export interface ProcessingProgressViewProps {
  state: AnalysisState;
  onCancel?: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export const ProcessingProgressView: React.FC<ProcessingProgressViewProps> = ({
  state,
  onCancel,
}) => {
  const isPreflight = state.stage === 'preparing' || state.stage === 'uploading' || state.stage === 'preflight';
  const isProcessing = state.stage === 'processing';
  const isPersisting = state.stage === 'persisting';

  const steps = [
    {
      id: 'preflight',
      label: 'PDF Preflight & Document Geometry',
      done: isProcessing || isPersisting || state.stage === 'completed',
      active: isPreflight,
    },
    {
      id: 'symbols',
      label: 'Symbol Detection (Fire Dampers, WSHP, Grilles)',
      done: isPersisting || state.stage === 'completed',
      active: isProcessing && (state.progressPercent || 0) < 60,
    },
    {
      id: 'routes',
      label: 'Continuous Linework Tracing & Topology',
      done: isPersisting || state.stage === 'completed',
      active: isProcessing && (state.progressPercent || 0) >= 60,
    },
    {
      id: 'persisting',
      label: 'Artifact Store Persistence & Strict Indexing',
      done: state.stage === 'completed',
      active: isPersisting,
    },
  ];

  return (
    <div className="max-w-2xl w-full mx-auto p-8 my-auto animate-in fade-in duration-200">
      <div className="workstation-card p-8 text-center bg-white shadow-sm border border-slate-200">
        {/* Animated Spin Icon */}
        <div className="w-16 h-16 rounded-full bg-[#006D84]/10 text-[#006D84] mx-auto flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>

        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#006D84]">
          Step 3 of 4 · Autonomous Execution
        </span>
        <h2 className="font-heading text-2xl font-bold text-slate-900 mt-1 mb-2">
          Analyzing Drawing Sheets
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
          Executing verified computer vision detectors, vector collinear splicing, and topological continuity.
        </p>

        {/* Big Progress Bar */}
        <div className="space-y-2 mb-8">
          <div className="flex items-center justify-between text-xs font-mono text-slate-700">
            <span className="font-semibold text-slate-800">
              {state.humanMessage || 'Processing drawing...'}
            </span>
            <span className="font-bold text-[#006D84] text-sm">
              {state.progressPercent}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#006D84] h-2.5 transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, state.progressPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
            <span className="flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Elapsed: {formatElapsed(state.elapsedSeconds)}</span>
            </span>
            {state.currentPage && state.pageCount > 0 && (
              <span className="flex items-center space-x-1">
                <Layers className="w-3.5 h-3.5" />
                <span>Sheet {state.currentPage} of {state.pageCount}</span>
              </span>
            )}
          </div>
        </div>

        {/* Steps Progress Checklist */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left space-y-2.5 mb-6">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center space-x-3 text-xs">
              {step.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : step.active ? (
                <Loader2 className="w-4 h-4 text-[#006D84] animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
              )}
              <span
                className={`font-medium ${
                  step.done
                    ? 'text-slate-800'
                    : step.active
                    ? 'text-[#006D84] font-bold'
                    : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Cancel Action */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary text-xs text-rose-700 hover:text-rose-800 hover:border-rose-300"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Cancel Analysis</span>
          </button>
        )}
      </div>
    </div>
  );
};
