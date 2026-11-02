import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '../api/client';
import {
  logAcceptTelemetry,
  logMoveTelemetry,
  logRejectTelemetry,
  logReviewTelemetry,
} from '../workspace/utils/reviewTelemetry';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function flushTelemetry(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('review telemetry triggers (FDBK-003)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts feedback events to POST /api/feedback/events and returns the id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-1', training_eligible: false })
    );
    const client = createApiClient();
    const res = await client.logFeedbackEvent({
      project_id: 'proj-1',
      sheet_id: 'sheet-1',
      item_id: 'item-1',
      task_type: 'SYMBOL_DETECTION',
      action: 'ACCEPT',
      previous_status: 'SUGGESTED',
      new_status: 'ACCEPTED',
      bounding_box_pt: [120, 240, 270, 390],
    });

    expect(res).toEqual({ feedback_id: 'fb-1', training_eligible: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback/events');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.task_type).toBe('SYMBOL_DETECTION');
    expect(body.bounding_box_pt).toEqual([120, 240, 270, 390]);
  });

  it('dispatcher defaults to SYMBOL_DETECTION and sends the bbox', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-2', training_eligible: false })
    );
    logReviewTelemetry({
      projectId: 'proj-1',
      sheetId: 'sheet-1',
      itemId: 'item-9',
      action: 'ACCEPT',
      bboxPt: [120, 240, 270, 390],
    });
    await flushTelemetry();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback/events');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.task_type).toBe('SYMBOL_DETECTION');
    expect(body.action).toBe('ACCEPT');
    expect(body.bounding_box_pt).toEqual([120, 240, 270, 390]);
  });

  it('accept logs a positive example', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-a', training_eligible: false })
    );
    logAcceptTelemetry({ projectId: 'p', sheetId: 's', itemId: 'item-1' });
    await flushTelemetry();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('ACCEPT');
    expect(body.new_status).toBe('ACCEPTED');
  });

  it('reject prompts for a reason and records a negative example', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-r', training_eligible: false })
    );
    logRejectTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-2',
      reason: 'DUPLICATE_ITEM',
    });
    await flushTelemetry();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('REJECT');
    expect(body.new_status).toBe('REJECTED');
    expect(body.correction_reason).toBe('DUPLICATE_ITEM');
  });

  it('pin-drag end logs a move correction with the new coordinates', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-m', training_eligible: false })
    );
    logMoveTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'ghost-1',
      pagePoint: [400, 300],
    });
    await flushTelemetry();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('CORRECT');
    expect(body.corrected_output).toEqual({ page_point: [400, 300] });
  });

  it('telemetry failure never throws to the reviewer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() =>
      logAcceptTelemetry({ projectId: 'p', sheetId: 's', itemId: 'item-3' })
    ).not.toThrow();
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
