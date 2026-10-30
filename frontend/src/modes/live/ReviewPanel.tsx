import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  History,
  Send,
} from 'lucide-react';
import type { ReviewAction, ReviewEventResponse } from '../../api/contracts';
import { apiClient } from '../../api/client';

export interface ReviewPanelProps {
  projectId: string;
  runId: string;
  targetId: string | null;
  targetType: 'ROUTE' | 'OBJECT' | null;
  onReviewSubmitted?: (event: ReviewEventResponse) => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  projectId,
  runId,
  targetId,
  targetType,
  onReviewSubmitted,
}) => {
  const [action, setAction] = useState<ReviewAction>('ACCEPT');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastCreatedEvent, setLastCreatedEvent] = useState<ReviewEventResponse | null>(null);

  // History for target
  const [history, setHistory] = useState<ReviewEventResponse[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load review history whenever targetId changes
  useEffect(() => {
    if (!projectId || !runId || !targetId) {
      setHistory([]);
      setLastCreatedEvent(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoadingHistory(true);

    apiClient
      .getReviewEvents(projectId, runId, { target_id: targetId }, controller.signal)
      .then((res) => {
        if (isMounted) {
          // Monotonic sequence order
          const sorted = [...res.items].sort((a, b) => a.sequence - b.sequence);
          setHistory(sorted);
        }
      })
      .catch(() => {
        if (isMounted) setHistory([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingHistory(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId, runId, targetId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId || !targetType) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiClient.appendReviewEvent(projectId, runId, {
        target_type: targetType,
        target_id: targetId,
        action,
        comment: comment.trim() ? comment.trim() : null,
      });

      setLastCreatedEvent(res);
      setComment('');
      setHistory((prev) => [...prev, res]);
      if (onReviewSubmitted) {
        onReviewSubmitted(res);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record review decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!targetId || !targetType) {
    return (
      <div data-testid="review-panel" className="text-xs text-slate-500 py-3 text-center">
        <ShieldAlert className="w-5 h-5 text-slate-400 mx-auto mb-1.5" aria-hidden="true" />
        <p className="font-medium text-slate-700">No Target Selected</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Select any route or object on the canvas or quantities ledger to append human review decisions.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="review-panel" className="space-y-4 text-xs">
      {/* Target Identifier Notice */}
      <div className="bg-slate-100/70 border border-slate-200 rounded p-2 text-[11px] flex items-center justify-between font-mono">
        <span className="text-slate-500">Target Entity:</span>
        <span className="font-bold text-slate-900 break-all">{targetId}</span>
      </div>

      {/* Review Action Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="review-action-select" className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Decision Action
          </label>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            {[
              { id: 'ACCEPT', label: 'Accept', color: 'border-emerald-300 text-emerald-800 bg-emerald-50' },
              { id: 'REJECT', label: 'Reject', color: 'border-rose-300 text-rose-800 bg-rose-50' },
              { id: 'NEEDS_REVIEW', label: 'Needs Review', color: 'border-amber-300 text-amber-800 bg-amber-50' },
              { id: 'COMMENT', label: 'Comment', color: 'border-slate-300 text-slate-800 bg-slate-50' },
              { id: 'CORRECTION_NOTE', label: 'Correction Note', color: 'border-indigo-300 text-indigo-800 bg-indigo-50 col-span-2' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setAction(btn.id as ReviewAction)}
                className={`py-1.5 px-2 rounded border font-semibold text-center transition-all ${
                  action === btn.id
                    ? `${btn.color} ring-2 ring-[#006D84]`
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                } ${btn.color.includes('col-span') ? 'col-span-2' : ''}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment input */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <label htmlFor="review-comment-input" className="font-semibold text-slate-700 uppercase tracking-wider">
              Comment / Note
            </label>
            <span className="text-slate-400 font-mono text-[10px]">
              {comment.length} / 1000
            </span>
          </div>
          <textarea
            id="review-comment-input"
            aria-label="Review comment"
            maxLength={1000}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional rationale or field observation..."
            className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#006D84] text-slate-800"
          />
        </div>

        {/* Explain raw immutability */}
        <p className="text-[10px] text-slate-500 leading-tight">
          * Decisions and notes append to the immutable review audit trail. Raw extraction geometry is never modified.
        </p>

        {/* Error message */}
        {submitError && (
          <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px]">
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 bg-[#006D84] hover:bg-[#005769] text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-2xs transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <Clock className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{isSubmitting ? 'Recording Decision...' : `Record ${action} Decision`}</span>
        </button>
      </form>

      {/* Confirmation of Last Event */}
      {lastCreatedEvent && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px] space-y-1">
          <div className="flex items-center space-x-1.5 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Review Event Appended</span>
          </div>
          <div className="font-mono text-[10px] break-all">
            Event ID: <span className="font-bold">{lastCreatedEvent.event_id}</span>
          </div>
          <div className="font-mono text-[10px]">
            Sequence #{lastCreatedEvent.sequence} • Action: {lastCreatedEvent.action}
          </div>
        </div>
      )}

      {/* Monotonic Review History */}
      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="flex items-center space-x-1.5 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
          <History className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <h4>Audit Trail ({history.length})</h4>
        </div>

        {isLoadingHistory ? (
          <div className="text-slate-400 text-center py-2 text-[11px]">
            Loading audit events...
          </div>
        ) : history.length === 0 ? (
          <div className="text-slate-400 italic text-[11px]">
            No previous review decisions recorded for this entity.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {history.map((ev) => (
              <div
                key={ev.event_id}
                className="p-2 bg-white border border-slate-200 rounded text-[11px] font-mono space-y-0.5"
              >
                <div className="flex items-center justify-between text-slate-900 font-semibold">
                  <span className="text-[#006D84]">#{ev.sequence} {ev.action}</span>
                  <span className="text-[9px] text-slate-400 font-normal">{ev.created_at.slice(11, 19)}</span>
                </div>
                {ev.comment && (
                  <p className="text-slate-600 font-sans text-[11px] pt-0.5">{ev.comment}</p>
                )}
                <div className="text-[9px] text-slate-400 truncate">{ev.event_id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
