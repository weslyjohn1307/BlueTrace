import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Layers, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { JobResponse, JobState } from '../../api/contracts';

interface JobProgressCardProps {
  initialJob: JobResponse;
  onOpenRun: (job: JobResponse) => void;
  onRetry: () => void;
}

const TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  'COMPLETE',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);

export const JobProgressCard: React.FC<JobProgressCardProps> = ({
  initialJob,
  onOpenRun,
  onRetry,
}) => {
  const [job, setJob] = useState<JobResponse>(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const isPollingRef = useRef<boolean>(true);

  const getStatusLabel = (state: JobState): string => {
    switch (state) {
      case 'QUEUED':
        return 'Queued for processing';
      case 'PREFLIGHT':
        return 'Verifying drawing preflight';
      case 'PROCESSING':
        return 'Extracting engineering elements';
      case 'PERSISTING':
        return 'Persisting and strictly indexing run artifacts';
      case 'COMPLETE':
        return 'Processing Complete';
      case 'PARTIAL':
        return 'Processing Partial (with page errors)';
      case 'FAILED':
        return 'Processing Failed';
      case 'CANCEL_REQUESTED':
        return 'Cancellation Requested';
      case 'CANCELLED':
        return 'Job Cancelled';
      case 'INTERRUPTED':
        return 'Job Interrupted (Worker stopped)';
      default:
        return `State: ${state}`;
    }
  };

  const getStatusColor = (state: JobState): string => {
    switch (state) {
      case 'COMPLETE':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'PARTIAL':
        return 'text-amber-800 bg-amber-50 border-amber-300';
      case 'FAILED':
      case 'CANCELLED':
        return 'text-rose-700 bg-rose-50 border-rose-200';
      case 'INTERRUPTED':
        return 'text-orange-800 bg-orange-50 border-orange-300';
      case 'PERSISTING':
        return 'text-[#006D84] bg-teal-50 border-teal-200';
      case 'PROCESSING':
      case 'PREFLIGHT':
      case 'QUEUED':
      case 'CANCEL_REQUESTED':
      default:
        return 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  const pollJob = useCallback(async (abortSignal: AbortSignal) => {
    try {
      const updated = await apiClient.getJob(initialJob.project_id, initialJob.job_id, abortSignal);
      setJob(updated);
      setPollError(null);

      if (TERMINAL_STATES.has(updated.state)) {
        isPollingRef.current = false;
      }
    } catch (err: unknown) {
      if (abortSignal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Error polling job status';
      setPollError(msg);
    }
  }, [initialJob.project_id, initialJob.job_id]);

  useEffect(() => {
    isPollingRef.current = !TERMINAL_STATES.has(initialJob.state);
    setJob(initialJob);

    if (!isPollingRef.current) return;

    const controller = new AbortController();

    const intervalId = setInterval(() => {
      if (isPollingRef.current && !controller.signal.aborted) {
        pollJob(controller.signal);
      }
    }, 1500);

    return () => {
      isPollingRef.current = false;
      clearInterval(intervalId);
      controller.abort();
    };
  }, [initialJob, pollJob]);

  const isTerminal = TERMINAL_STATES.has(job.state);
  const isComplete = job.state === 'COMPLETE';
  const isPartial = job.state === 'PARTIAL';
  const isFailed = job.state === 'FAILED';
  const isCancelled = job.state === 'CANCELLED';
  const isInterrupted = job.state === 'INTERRUPTED';

  // Calculate percentage: strictly backend-observed
  const totalPages = job.progress?.total_pages ?? 0;
  const completedPages = job.progress?.completed_pages ?? 0;
  const failedPages = job.progress?.failed_pages ?? 0;
  const pagePercent =
    job.progress?.percent ??
    (totalPages > 0 ? Math.round(((completedPages + failedPages) / totalPages) * 100) : null);

  return (
    <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Card Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-sm text-slate-900">
            Extraction Job Monitor
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Job ID: <span className="font-mono text-slate-700">{job.job_id}</span>
          </p>
        </div>

        <div className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${getStatusColor(job.state)}`}>
          {job.state}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Status Announcement Landmark */}
        <div aria-live="polite" className="flex items-center space-x-3 p-3 bg-slate-50 rounded-md border border-slate-200">
          {!isTerminal ? (
            <RefreshCw className="w-5 h-5 animate-spin text-[#006D84] flex-shrink-0" aria-hidden="true" />
          ) : isComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          ) : isPartial ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
          ) : isInterrupted ? (
            <ShieldAlert className="w-5 h-5 text-orange-600 flex-shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" aria-hidden="true" />
          )}

          <div className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-slate-800">
              {getStatusLabel(job.state)}
            </span>
            <span className="block text-[11px] text-slate-500 truncate">
              {job.message || (isTerminal ? 'Job has finished execution.' : 'Waiting for local worker updates...')}
            </span>
          </div>
        </div>

        {/* Progress Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Page Processing Progress</span>
            </span>
            <span className="font-mono font-medium text-slate-700">
              {totalPages > 0 ? (
                <>
                  {completedPages} / {totalPages} pages
                  {failedPages > 0 && (
                    <span className="text-rose-600 ml-1">({failedPages} failed)</span>
                  )}
                  {pagePercent !== null && ` • ${pagePercent}%`}
                </>
              ) : (
                'Initializing...'
              )}
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={pagePercent !== null ? pagePercent : undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Extraction page progress"
            className="w-full bg-slate-200 rounded-full h-2 overflow-hidden"
          >
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isComplete
                  ? 'bg-emerald-600'
                  : isPartial
                  ? 'bg-amber-500'
                  : isFailed
                  ? 'bg-rose-500'
                  : 'bg-[#006D84]'
              } ${!isTerminal && pagePercent === null ? 'w-full animate-pulse' : ''}`}
              style={{
                width: pagePercent !== null ? `${pagePercent}%` : !isTerminal ? '100%' : '0%',
              }}
            />
          </div>

          {!isTerminal && job.state === 'PERSISTING' && pagePercent === 100 && (
            <p className="text-[11px] text-[#006D84] font-medium">
              Extraction 100% complete. Persisting immutable run artifacts...
            </p>
          )}
        </div>

        {/* Polling Error Banner */}
        {pollError && (
          <div role="alert" className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            Polling notice: {pollError}. Retrying in next interval...
          </div>
        )}

        {/* COMPLETE State Display */}
        {isComplete && job.run_id && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md space-y-2">
            <div className="flex items-center space-x-2 text-emerald-900 font-semibold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Immutable Run Created & Verified</span>
            </div>
            <div className="text-xs text-emerald-800">
              Run ID: <span className="font-mono font-bold">{job.run_id}</span>
            </div>
            <p className="text-[11px] text-emerald-700">
              {completedPages} page(s) successfully processed with 0 failed pages.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onOpenRun(job)}
                className="inline-flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] rounded focus:outline-none focus:ring-2 focus:ring-[#006D84]"
              >
                <span>Open Run</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* PARTIAL State Display */}
        {isPartial && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-md space-y-2">
            <div className="flex items-center space-x-2 text-amber-900 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              <span>Partial Processing Result</span>
            </div>
            <div className="text-xs text-amber-800 space-y-1">
              <div>Completed: <span className="font-bold">{completedPages}</span> pages</div>
              <div>Failed: <span className="font-bold text-rose-700">{failedPages}</span> pages</div>
              {job.run_id && (
                <div>Run ID: <span className="font-mono font-bold">{job.run_id}</span></div>
              )}
            </div>
            <p className="text-[11px] text-amber-700">
              Some pages could not be extracted. Valid completed pages remain accessible.
            </p>
            {job.run_id && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onOpenRun(job)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded"
                >
                  <span>Open Partial Run</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* FAILED State Display */}
        {isFailed && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-md space-y-2">
            <div className="flex items-center space-x-2 text-rose-900 font-semibold text-xs">
              <XCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
              <span>Processing Job Failed</span>
            </div>
            <div className="text-xs text-rose-800">
              Error code:{' '}
              <span className="font-mono font-bold">{job.error_code || 'EXTRACTION_ERROR'}</span>
            </div>
            <p className="text-[11px] text-rose-700">
              {job.message || 'An unexpected error occurred during processing.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-semibold text-rose-800 bg-white border border-rose-300 hover:bg-rose-50 rounded"
              >
                Retry Processing
              </button>
            </div>
          </div>
        )}

        {/* CANCELLED State Display */}
        {isCancelled && (
          <div className="p-4 bg-slate-100 border border-slate-300 rounded-md space-y-2">
            <div className="text-xs font-semibold text-slate-800">Job Cancelled</div>
            <p className="text-[11px] text-slate-600">
              Processing was cancelled by the user before completion.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded"
              >
                Start New Job
              </button>
            </div>
          </div>
        )}

        {/* INTERRUPTED State Display */}
        {isInterrupted && (
          <div className="p-4 bg-orange-50 border border-orange-300 rounded-md space-y-2">
            <div className="flex items-center space-x-2 text-orange-900 font-semibold text-xs">
              <ShieldAlert className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>Job Interrupted</span>
            </div>
            <p className="text-[11px] text-orange-800">
              The worker process was stopped before a verified result could be finalized. You can safely retry.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-800 hover:bg-orange-900 rounded"
              >
                Retry Processing
              </button>
            </div>
          </div>
        )}

        {/* Timing Information */}
        <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 pt-2 border-t border-slate-100 font-mono">
          <Clock className="w-3 h-3 text-slate-300" aria-hidden="true" />
          <span>Created: {new Date(job.created_at).toLocaleTimeString()}</span>
          {job.started_at && (
            <span>• Started: {new Date(job.started_at).toLocaleTimeString()}</span>
          )}
          {job.finished_at && (
            <span>• Finished: {new Date(job.finished_at).toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
};
