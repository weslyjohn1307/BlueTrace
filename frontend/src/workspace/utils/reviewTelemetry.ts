/**
 * Review interaction telemetry dispatcher (TASK-FDBK-003).
 *
 * Pin actions in the ledger and on the canvas fire structured feedback
 * events to `POST /api/feedback/events` so later curation can assemble
 * supervised examples. Dispatch is always fire-and-forget: telemetry
 * failures never block or break the review UX, but they are surfaced as a
 * throttled `console.warn` (at most once per minute) so silent outages are
 * still diagnosable.
 */

import { ApiError, apiClient } from '../../api/client';
import type { FeedbackEventPayload } from '../../api/contracts';

export type ReviewTelemetryAction = FeedbackEventPayload['action'];

export interface ReviewTelemetryInput {
  projectId: string;
  sheetId: string;
  itemId?: string | null;
  /** Detection task that produced the proposal; defaults to SYMBOL_DETECTION. */
  taskType?: string;
  action: ReviewTelemetryAction;
  /** Status the item had before this review action. Required: callers must
   * pass the item's real status and skip dispatch when the item is unknown
   * (see `debugSkipUnknownItem`) instead of inventing a default. */
  previousStatus: string;
  newStatus?: string;
  originalOutput?: Record<string, unknown> | null;
  correctedOutput?: Record<string, unknown> | null;
  correctionReason?: string | null;
  /** [x0, y0, x1, y1] in PDF points. */
  bboxPt?: [number, number, number, number] | null;
  /** Page inside the sheet PDF the bbox refers to. */
  pageIndex?: number | null;
}

/** Minimum gap between telemetry-failure warnings (ms). */
const TELEMETRY_WARN_THROTTLE_MS = 60_000;

let lastTelemetryWarnAt = 0;

/** Test-only reset for the warn throttle. */
export function resetTelemetryWarnThrottle(): void {
  lastTelemetryWarnAt = 0;
}

const skippedUnknownItems = new Set<string>();

/**
 * Log (once per item+action) that telemetry was skipped because the review
 * target is not in the local ledger. Callers must skip the dispatch itself:
 * inventing a `previousStatus` for an unknown item fabricates provenance.
 */
export function debugSkipUnknownItem(
  itemId: string | null | undefined,
  action: ReviewTelemetryAction
): void {
  const key = `${action}:${itemId ?? 'null'}`;
  if (skippedUnknownItems.has(key)) return;
  skippedUnknownItems.add(key);
  console.debug(
    `[review-telemetry] skipping ${action} event: item ${itemId ?? 'null'} not in ledger; no event sent.`
  );
}

/** Test-only reset for the skip-once set. */
export function resetSkippedUnknownItems(): void {
  skippedUnknownItems.clear();
}

export function logReviewTelemetry(input: ReviewTelemetryInput): void {
  const payload: FeedbackEventPayload = {
    project_id: input.projectId,
    sheet_id: input.sheetId,
    item_id: input.itemId ?? null,
    task_type: input.taskType ?? 'SYMBOL_DETECTION',
    action: input.action,
    previous_status: input.previousStatus,
    new_status: input.newStatus ?? 'SUGGESTED',
    original_output: input.originalOutput ?? null,
    corrected_output: input.correctedOutput ?? null,
    correction_reason: input.correctionReason ?? null,
    bounding_box_pt: input.bboxPt ?? null,
    page_index: input.pageIndex ?? null,
  };
  // Non-blocking: telemetry must never surface an error to the reviewer.
  // Failures are swallowed but reported via a throttled warning carrying the
  // HTTP status so a dead telemetry path is still diagnosable.
  void apiClient.logFeedbackEvent(payload).catch((err: unknown) => {
    const status =
      err instanceof ApiError
        ? err.status
        : typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : 'unknown';
    const now = Date.now();
    if (now - lastTelemetryWarnAt < TELEMETRY_WARN_THROTTLE_MS) return;
    lastTelemetryWarnAt = now;
    console.warn(
      `[review-telemetry] POST /api/feedback/events failed (status ${String(status)}); event dropped.`
    );
  });
}

/** Positive example: the proposal was correct for its stated purpose. */
export function logAcceptTelemetry(input: Omit<ReviewTelemetryInput, 'action' | 'newStatus'>): void {
  logReviewTelemetry({ ...input, action: 'ACCEPT', newStatus: 'ACCEPTED' });
}

/** Negative example: the proposal was wrong or irrelevant; reason captured. */
export function logRejectTelemetry(
  input: Omit<ReviewTelemetryInput, 'action' | 'newStatus'> & { reason?: string | null }
): void {
  const { reason, ...rest } = input;
  logReviewTelemetry({
    ...rest,
    action: 'REJECT',
    newStatus: 'REJECTED',
    correctionReason: reason ?? rest.correctionReason ?? null,
  });
}

/** Move correction: a pin drag ended at new canvas coordinates. */
export function logMoveTelemetry(
  input: Omit<ReviewTelemetryInput, 'action' | 'newStatus' | 'correctedOutput'> & {
    pagePoint: [number, number];
  }
): void {
  const { pagePoint, ...rest } = input;
  logReviewTelemetry({
    ...rest,
    action: 'CORRECT',
    newStatus: 'CORRECTED',
    correctedOutput: { page_point: pagePoint },
  });
}
