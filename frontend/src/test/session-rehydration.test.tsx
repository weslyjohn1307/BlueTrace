import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { apiClient } from '../api/client';
import { useTakeoffSession, toRestoredTransform, ACTIVE_PROJECT_SLOT } from '../workspace/hooks/useTakeoffSession';

vi.mock('../api/client', () => ({
  apiClient: {
    getHealth: vi.fn(),
    uploadDrawing: vi.fn(),
    scanSheet: vi.fn(),
    scanAllSheets: vi.fn(),
    listTakeoffItems: vi.fn(),
    getTakeoffSummary: vi.fn(),
    updateTakeoffStatus: vi.fn(),
    listProjects: vi.fn(),
    getProjectSession: vi.fn(),
    saveProjectSession: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));

const mocked = vi.mocked(apiClient);

function sheetMeta(index: number) {
  const n = 101 + index;
  return {
    sheet_id: `sheet_m${n}`,
    page_index: index,
    sheet_number: `M-${n}`,
    sheet_title: `HVAC Plan ${n}`,
    discipline: 'MECHANICAL',
    scale_raw: '1/4" = 1\'-0"',
    scale_ratio: 48.0,
    scale_status: 'VERIFIED' as const,
    width_pt: 3024.0,
    height_pt: 2160.0,
    dpi: 150,
  };
}

function sessionPayload() {
  const sheets = Array.from({ length: 12 }, (_, i) => sheetMeta(i));
  return {
    session: {
      session_id: 'session-sess_proj',
      project_id: 'sess_proj',
      active_sheet_id: 'sheet_m102',
      viewport_scale: 1.45,
      viewport_tx: 240.0,
      viewport_ty: -120.0,
      selected_pin_id: null,
      active_tool_mode: 'pan',
      discipline_filter: 'ALL',
      search_query: '',
      updated_at: '2026-11-02T00:00:00+00:00',
    },
    sheets,
    summary: [],
  };
}

describe('useTakeoffSession atomic rehydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocked.getProjectSession.mockResolvedValue(sessionPayload() as never);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('rehydrates 12 sheets with M-102 active and the saved viewport transform', async () => {
    const { result } = renderHook(() => useTakeoffSession());

    await act(async () => {
      await result.current.rehydrateProject('sess_proj');
    });

    expect(mocked.getProjectSession).toHaveBeenCalledWith('sess_proj');
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.sheets).toHaveLength(12);
    expect(result.current.state.activeSheetId).toBe('sheet_m102');
    expect(result.current.state.sheets[1].meta.sheet_number).toBe('M-102');
    expect(result.current.state.initialTransform).toEqual({
      scale: 1.45,
      translationX: 240,
      translationY: -120,
      mode: 'manual',
    });
    expect(result.current.state.projectName).toBe('sess_proj');
    expect(localStorage.getItem(ACTIVE_PROJECT_SLOT)).toBe('sess_proj');
  });

  it('auto-rehydrates from localStorage on mount without flicker', async () => {
    localStorage.setItem(ACTIVE_PROJECT_SLOT, 'sess_proj');
    const { result } = renderHook(() => useTakeoffSession());

    await waitFor(() => {
      expect(result.current.state.stage).toBe('ready');
    });

    expect(mocked.getProjectSession).toHaveBeenCalledWith('sess_proj');
    expect(result.current.state.sheets).toHaveLength(12);
    expect(result.current.state.activeSheetId).toBe('sheet_m102');
  });

  it('fails closed with a reviewable error when the session endpoint rejects', async () => {
    mocked.getProjectSession.mockRejectedValue(new Error('connection refused'));
    const { result } = renderHook(() => useTakeoffSession());

    await act(async () => {
      await result.current.rehydrateProject('sess_proj');
    });

    expect(result.current.state.stage).toBe('failed');
    expect(result.current.state.error).toContain('Check the local connection');
    expect(result.current.state.sheets).toHaveLength(0);
    expect(result.current.state.initialTransform).toBeNull();
  });

  it('clears an expired saved project and shows a recovery action without exposing its ID', async () => {
    const staleId = 'Phase 1 Combine Document_page_402_detected_hvac';
    localStorage.setItem(ACTIVE_PROJECT_SLOT, staleId);
    const { ApiError } = await import('../api/client');
    mocked.getProjectSession.mockRejectedValue(new ApiError(404, `Unknown project_id '${staleId}'.`));
    const { result } = renderHook(() => useTakeoffSession());

    await waitFor(() => expect(result.current.state.error).toContain('Open its PDF'));

    expect(result.current.state.stage).toBe('idle');
    expect(result.current.state.error).not.toContain(staleId);
    expect(localStorage.getItem(ACTIVE_PROJECT_SLOT)).toBeNull();
  });

  it('falls back to fit (null transform) when the restored viewport is invalid', async () => {
    mocked.getProjectSession.mockResolvedValue({
      ...sessionPayload(),
      session: {
        ...(sessionPayload().session as Record<string, unknown>),
        viewport_scale: 0,
        viewport_tx: Number.NaN,
        viewport_ty: Number.POSITIVE_INFINITY,
      },
    } as never);
    const { result } = renderHook(() => useTakeoffSession());

    await act(async () => {
      await result.current.rehydrateProject('sess_proj');
    });

    // Fail-closed: the session still restores, but the canvas fits instead of
    // applying a degenerate transform.
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.sheets).toHaveLength(12);
    expect(result.current.state.initialTransform).toBeNull();
  });
});

describe('toRestoredTransform fail-closed validation', () => {
  it('accepts finite positive scale with finite translations', () => {
    expect(
      toRestoredTransform({ viewport_scale: 1.45, viewport_tx: 240, viewport_ty: -120 })
    ).toEqual({ scale: 1.45, translationX: 240, translationY: -120, mode: 'manual' });
  });

  it.each([
    ['zero scale', { viewport_scale: 0, viewport_tx: 0, viewport_ty: 0 }],
    ['negative scale', { viewport_scale: -1.45, viewport_tx: 240, viewport_ty: -120 }],
    ['NaN scale', { viewport_scale: Number.NaN, viewport_tx: 0, viewport_ty: 0 }],
    ['infinite scale', { viewport_scale: Number.POSITIVE_INFINITY, viewport_tx: 0, viewport_ty: 0 }],
    ['NaN tx', { viewport_scale: 1.45, viewport_tx: Number.NaN, viewport_ty: 0 }],
    ['infinite ty', { viewport_scale: 1.45, viewport_tx: 0, viewport_ty: Number.NEGATIVE_INFINITY }],
    ['non-numeric scale', { viewport_scale: 'wide', viewport_tx: 0, viewport_ty: 0 }],
  ])('rejects %s with null (fit fallback)', (_label, viewport) => {
    expect(toRestoredTransform(viewport)).toBeNull();
  });
});
