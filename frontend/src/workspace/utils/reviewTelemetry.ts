/**
 * Review interaction telemetry dispatcher (TASK-FDBK-003).
 *
 * Pin actions in the ledger and on the canvas fire structured feedback
 * events to `POST /api/feedback/events` so later curation can assemble
 * supervised examples. Dispatch is always fire-and-forget: telemetry
 * failures are swallowed and must never block or break the review UX.
 */

import { apiClient } from '../../api/client';
import type { FeedbackEventPayload } from '../../api/contracts';

export type ReviewTelemetryAction = FeedbackEventPayload['action'];

export interface ReviewTelemetryInput {
  projectId: string;
  sheetId: string;
  itemId?: string | null;
  /** Detection task that produced the proposal; defaults to SYMBOL_DETECTION. */
  taskType?: string;
  action: ReviewTelemetryAction;
  previousStatus?: string;
  newStatus?: string;
  originalOutput?: Record<string, unknown> | null;
  correctedOutput?: Record<string, unknown> | null;
  correctionReason?: string | null;
  /** [x0, y0, x1, y1] in PDF points. */
  bboxPt?: [number, number, number, number] | null;
}

export function logReviewTelemetry(input: ReviewTelemetryInput): void {
  const payload: FeedbackEventPayload = {
    project_id: input.projectId,
    sheet_id: input.sheetId,
    item_id: input.itemId ?? null,
    task_type: input.taskType ?? 'SYMBOL_DETECTION',
    action: input.action,
    previous_status: input.previousStatus ?? 'SUGGESTED',
    new_status: input.newStatus ?? 'SUGGESTED',
    original_output: input.originalOutput ?? null,
    corrected_output: input.correctedOutput ?? null,
    correction_reason: input.correctionReason ?? null,
    bounding_box_pt: input.bboxPt ?? null,
  };
  // Non-blocking: telemetry must never surface an error to the reviewer.
  void apiClient.logFeedbackEvent(payload).catch(() => undefined);
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
