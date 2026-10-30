import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { apiClient } from '../api/client';
import { useTakeoffSession } from '../workspace/hooks/useTakeoffSession';

vi.mock('../api/client', () => ({
  apiClient: {
    getHealth: vi.fn(),
    uploadDrawing: vi.fn(),
    scanSheet: vi.fn(),
    listTakeoffItems: vi.fn(),
    getTakeoffSummary: vi.fn(),
    updateTakeoffStatus: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const mocked = vi.mocked(apiClient);

function sheetMeta() {
  return {
    sheet_id: 'sheet_m22',
    page_index: 0,
    sheet_number: 'M-2.2',
    sheet_title: 'HVAC Duct Plan',
    discipline: 'MECHANICAL',
    scale_raw: '1/4" = 1\'-0"',
    scale_ratio: 48.0,
    scale_status: 'VERIFIED' as const,
    width_pt: 3024.0,
    height_pt: 2160.0,
    dpi: 150,
  };
}

describe('useTakeoffSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getHealth.mockResolvedValue({ status: 'online', meta_model_api_configured: false } as never);
    mocked.listTakeoffItems.mockResolvedValue([]);
    mocked.getTakeoffSummary.mockResolvedValue([]);
  });

  it('runs upload → scan → ledger and lands ready', async () => {
    mocked.uploadDrawing.mockResolvedValue({
      filename: 'plan.pdf',
      file_path: 'data/uploads/plan.pdf',
      byte_size: 10,
      sha256: 'abc',
    } as never);
    mocked.scanSheet.mockResolvedValue(sheetMeta() as never);

    const { result } = renderHook(() => useTakeoffSession());
    const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(mocked.uploadDrawing).toHaveBeenCalledTimes(1);
    expect(mocked.scanSheet).toHaveBeenCalledWith('data/uploads/plan.pdf', 0);
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.activeSheetId).toBe('sheet_m22');
    expect(result.current.state.projectName).toBe('plan');
    expect(mocked.listTakeoffItems).toHaveBeenCalled();
  });

  it('rejects non-PDF files without touching the backend', async () => {
    const { result } = renderHook(() => useTakeoffSession());
    const file = new File(['nope'], 'plan.dwg', { type: 'application/octet-stream' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(result.current.state.stage).toBe('failed');
    expect(result.current.state.error).toContain('PDF');
    expect(mocked.uploadDrawing).not.toHaveBeenCalled();
  });

  it('opens fixtures straight into scan', async () => {
    mocked.scanSheet.mockResolvedValue(sheetMeta() as never);
    const { result } = renderHook(() => useTakeoffSession());

    await act(async () => {
      await result.current.openFixture('fixtures/mechanical/avexis_page_22.pdf');
    });

    expect(mocked.scanSheet).toHaveBeenCalledWith('fixtures/mechanical/avexis_page_22.pdf', 0);
    expect(result.current.state.stage).toBe('ready');
  });

  it('reports backend failures instead of hanging', async () => {
    mocked.uploadDrawing.mockRejectedValue(new Error('connection refused'));
    const { result } = renderHook(() => useTakeoffSession());
    const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(result.current.state.stage).toBe('failed');
    expect(result.current.state.error).toContain('connection refused');
  });
});
