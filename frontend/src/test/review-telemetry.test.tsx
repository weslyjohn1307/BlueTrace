import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '../api/client';
import {
  debugSkipUnknownItem,
  logAcceptTelemetry,
  logMoveTelemetry,
  logRejectTelemetry,
  logReviewTelemetry,
  resetSkippedUnknownItems,
  resetTelemetryWarnThrottle,
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
    resetTelemetryWarnThrottle();
    resetSkippedUnknownItems();
    vi.restoreAllMocks();
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

  it('dispatcher sends the caller previous_status verbatim (no SUGGESTED fabrication)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-2', training_eligible: false })
    );
    logReviewTelemetry({
      projectId: 'proj-1',
      sheetId: 'sheet-1',
      itemId: 'item-9',
      action: 'ACCEPT',
      previousStatus: 'MATCHED',
      newStatus: 'ACCEPTED',
      bboxPt: [120, 240, 270, 390],
    });
    await flushTelemetry();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback/events');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.task_type).toBe('SYMBOL_DETECTION');
    expect(body.action).toBe('ACCEPT');
    expect(body.previous_status).toBe('MATCHED');
    expect(body.new_status).toBe('ACCEPTED');
    expect(body.bounding_box_pt).toEqual([120, 240, 270, 390]);
  });

  it('accept logs a positive example with the real previous status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-a', training_eligible: false })
    );
    logAcceptTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-1',
      previousStatus: 'SUGGESTED',
      pageIndex: 2,
    });
    await flushTelemetry();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('ACCEPT');
    expect(body.new_status).toBe('ACCEPTED');
    expect(body.previous_status).toBe('SUGGESTED');
    expect(body.page_index).toBe(2);
  });

  it('reject prompts for a reason and records a negative example', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ feedback_id: 'fb-r', training_eligible: false })
    );
    logRejectTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-2',
      previousStatus: 'SUGGESTED',
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
      previousStatus: 'UNPLACED',
      pagePoint: [400, 300],
    });
    await flushTelemetry();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.action).toBe('CORRECT');
    expect(body.previous_status).toBe('UNPLACED');
    expect(body.corrected_output).toEqual({ page_point: [400, 300] });
  });

  it('telemetry failure never throws to the reviewer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() =>
      logAcceptTelemetry({
        projectId: 'p',
        sheetId: 's',
        itemId: 'item-3',
        previousStatus: 'SUGGESTED',
      })
    ).not.toThrow();
    await flushTelemetry();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 500 warns once with the status code, then throttles', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

    logAcceptTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-5',
      previousStatus: 'SUGGESTED',
    });
    await flushTelemetry();
    logAcceptTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-6',
      previousStatus: 'SUGGESTED',
    });
    await flushTelemetry();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('500');

    // After a reset the next failure warns again.
    resetTelemetryWarnThrottle();
    logAcceptTelemetry({
      projectId: 'p',
      sheetId: 's',
      itemId: 'item-7',
      previousStatus: 'SUGGESTED',
    });
    await flushTelemetry();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('unknown-item skips dispatch and debugs once', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    debugSkipUnknownItem('ghost-9', 'ACCEPT');
    debugSkipUnknownItem('ghost-9', 'ACCEPT');
    debugSkipUnknownItem('ghost-9', 'REJECT');
    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
