import React from 'react';
import { 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight,
  Sparkles, 
  AlertCircle 
} from 'lucide-react';
import type { JobResponse } from '../../api/contracts';

export interface RunReadyHandoffProps {
  job: JobResponse;
  onBackToProject: () => void;
  onOpenRun?: (job: JobResponse) => void;
}

export const RunReadyHandoff: React.FC<RunReadyHandoffProps> = ({
  job,
  onBackToProject,
  onOpenRun,
}) => {
  const isComplete = job.state === 'COMPLETE';
  const completedPages = job.progress?.completed_pages ?? 0;
  const totalPages = job.progress?.total_pages ?? 0;
  const failedPages = job.progress?.failed_pages ?? 0;

  return (
    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-600" aria-hidden="true" />
          )}
          <div>
            <h3 className="font-heading font-semibold text-sm text-slate-900">
              Run-Ready Extraction Handoff
            </h3>
            <p className="text-xs text-slate-500">
              Extraction verified and indexed locally. Ready for interactive sheet review.
            </p>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
            isComplete
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}
        >
          {job.state}
        </span>
      </div>

      {/* Identifiers & Details */}
      <div className="p-6 space-y-5">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Run ID:</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {job.run_id || 'None'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Job ID:</span>
            <span className="font-mono text-slate-700">{job.job_id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Project ID:</span>
            <span className="font-mono text-slate-700">{job.project_id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Source ID(s):</span>
            <span className="font-mono text-slate-700">{job.source_ids.join(', ')}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="text-slate-500 font-medium">Page Completion:</span>
            <span className="font-mono text-slate-800 font-semibold">
              {completedPages} / {totalPages} pages completed
              {failedPages > 0 && (
                <span className="text-rose-600 font-normal ml-1">({failedPages} failed)</span>
              )}
            </span>
          </div>
        </div>

        {/* UI-03 Boundary Notice */}
        <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-lg text-xs text-teal-900 space-y-2">
          <div className="flex items-center space-x-1.5 font-semibold text-[#006D84]">
            <Sparkles className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
            <span>Upcoming Stage: UI-03 Interactive Review</span>
          </div>
          <p className="text-[11px] text-teal-800 leading-relaxed">
            The drawing canvas viewport, 150 DPI page rasters, SVG linework overlays, route quantities,
            and symbol inspection tables are introduced in <strong>UI-03</strong>.
          </p>
          <p className="text-[11px] text-teal-700">
            In accordance with UI-02 specifications, no results or overlay endpoints were queried in this view.
          </p>
        </div>

        {/* Navigation Action */}
        <div className="pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToProject}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded focus:outline-none focus:ring-1 focus:ring-[#006D84]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Project</span>
          </button>

          {job.run_id ? (
            <button
              type="button"
              onClick={() => {
                if (onOpenRun) {
                  onOpenRun(job);
                } else if (typeof window !== 'undefined' && job.run_id) {
                  window.location.assign(
                    `/live/projects/${encodeURIComponent(job.project_id)}/runs/${encodeURIComponent(job.run_id)}`
                  );
                }
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] rounded shadow-xs focus:outline-none focus:ring-2 focus:ring-[#006D84]"
            >
              <span>Open Run</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono">
              Status: RUN_READY
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
