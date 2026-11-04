import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { apiClient } from '../api/client';
import { useTakeoffSession } from '../workspace/hooks/useTakeoffSession';

vi.mock('../api/client', () => ({
  apiClient: {
    getHealth: vi.fn(),
    uploadDrawing: vi.fn(),
    previewPackagePage: vi.fn(),
    scanSheet: vi.fn(),
    startAgentJob: vi.fn(),
    streamAgentJobEvents: vi.fn(),
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
    mocked.previewPackagePage.mockResolvedValue({ sheet: sheetMeta(), total_pages: 1 } as never);
  });

  function scanAllResult() {
    return {
      pdf_path: 'data/uploads/plan.pdf',
      project_id: 'plan',
      sheets_processed: 1,
      document_map: { sheets: [sheetMeta()] },
      routes: [],
      flags: [],
    };
  }

  function useJobResult(result: ReturnType<typeof scanAllResult>) {
    mocked.startAgentJob.mockResolvedValue({ job_id: 'job-1', project_id: result.project_id, status: 'running' } as never);
    mocked.streamAgentJobEvents.mockImplementation(async (_jobId, onEvent) => {
      const sheets = result.document_map.sheets as ReturnType<typeof sheetMeta>[];
      onEvent({ event_type: 'sheet_discovered', agent_id: '00-orchestrator', message: 'Discovered', payload: { total_pages: sheets.length } } as never);
      for (const meta of sheets) {
        onEvent({ event_type: 'sheet_classified', agent_id: '00-orchestrator', message: 'Classified', page_index: meta.page_index, payload: { sheet_metadata: meta } } as never);
      }
      const complete = { event_type: 'complete', job_terminal: true, agent_id: 'agent_00_orchestrator', message: 'Complete', payload: { document_map: { ...result.document_map, routes: result.routes } } } as never;
      onEvent(complete);
      return complete;
    });
  }

  it('runs upload → scan-all → ledger and lands ready', async () => {
    mocked.uploadDrawing.mockResolvedValue({
      filename: 'plan.pdf',
      file_path: 'data/uploads/plan.pdf',
      byte_size: 10,
      sha256: 'abc',
    } as never);
    useJobResult(scanAllResult());

    const { result } = renderHook(() => useTakeoffSession());
    const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(mocked.uploadDrawing).toHaveBeenCalledTimes(1);
    expect(mocked.startAgentJob).toHaveBeenCalledWith(expect.objectContaining({
      file_path: 'data/uploads/plan.pdf',
      project_id: expect.stringMatching(/^plan-/),
    }));
    expect(result.current.state.stage).toBe('ready');
    expect(result.current.state.sheets).toHaveLength(1);
    expect(result.current.state.activeSheetId).toBe('sheet_m22');
    expect(result.current.state.projectName).toMatch(/^plan-/);
    expect(mocked.listTakeoffItems).toHaveBeenCalled();
  });

  it('populates every discovered sheet from a multi-page scan', async () => {
    mocked.uploadDrawing.mockResolvedValue({
      filename: 'set.pdf',
      file_path: 'data/uploads/set.pdf',
      byte_size: 10,
      sha256: 'abc',
    } as never);
    const second = { ...sheetMeta(), sheet_id: 'sheet_p101', page_index: 1, sheet_number: 'P-101' };
    useJobResult({
      ...scanAllResult(),
      sheets_processed: 2,
      document_map: { sheets: [sheetMeta(), second] },
    });

    const { result } = renderHook(() => useTakeoffSession());
    const file = new File(['%PDF-1.4'], 'set.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.selectFile(file);
    });

    expect(result.current.state.sheets).toHaveLength(2);
    expect(result.current.state.activeSheetId).toBe('sheet_m22');
  });

  it('ignores a late ledger response for a sheet that is no longer active', async () => {
    mocked.uploadDrawing.mockResolvedValue({
      filename: 'set.pdf',
      file_path: 'data/uploads/set.pdf',
      byte_size: 10,
      sha256: 'abc',
    } as never);
    const second = { ...sheetMeta(), sheet_id: 'sheet_p101', page_index: 1, sheet_number: 'P-101' };
    useJobResult({
      ...scanAllResult(),
      sheets_processed: 2,
      document_map: { sheets: [sheetMeta(), second] },
    });

    let resolvePageItems!: (items: never[]) => void;
    let resolvePageSummary!: (summary: never[]) => void;
    const pageItems = new Promise<never[]>((resolve) => { resolvePageItems = resolve; });
    const pageSummary = new Promise<never[]>((resolve) => { resolvePageSummary = resolve; });
    mocked.listTakeoffItems.mockImplementation(async (params) =>
      params?.sheet_id === 'sheet_p101' ? pageItems : []
    );
    mocked.getTakeoffSummary.mockImplementation(async (params) =>
      params?.sheet_id === 'sheet_p101' ? pageSummary : []
    );

    const { result } = renderHook(() => useTakeoffSession());
    await act(async () => {
      await result.current.selectFile(new File(['%PDF-1.4'], 'set.pdf', { type: 'application/pdf' }));
    });

    await act(async () => {
      result.current.selectSheet('sheet_p101');
      result.current.selectSheet('sheet_m22');
      resolvePageItems([{ item_id: 'page-2-item' }] as never[]);
      resolvePageSummary([] as never[]);
      await Promise.resolve();
    });

    expect(result.current.state.activeSheetId).toBe('sheet_m22');
    expect(result.current.state.items).toEqual([]);
  });

  it('reloads the ledger after the orchestrator confirms items are persisted', async () => {
    mocked.startAgentJob.mockResolvedValue({ job_id: 'job-1', project_id: 'plan', status: 'running' } as never);
    mocked.streamAgentJobEvents.mockImplementation(async (_jobId, onEvent) => {
      const meta = sheetMeta();
      onEvent({ event_type: 'sheet_classified', agent_id: 'agent_00_orchestrator', message: 'Classified', payload: { sheet_metadata: meta } } as never);
      onEvent({ event_type: 'items_emitted', agent_id: 'agent_00_orchestrator', message: 'Persisted 12 items', payload: { sheet_id: meta.sheet_id, item_count: 12 } } as never);
      const complete = { event_type: 'complete', job_terminal: true, agent_id: 'agent_00_orchestrator', message: 'Complete', payload: { document_map: { sheets: [meta], routes: [] } } } as never;
      onEvent(complete);
      return complete;
    });
    mocked.listTakeoffItems.mockResolvedValue([{ item_id: 'item-1' }] as never);

    const { result } = renderHook(() => useTakeoffSession());
    await act(async () => {
      await result.current.openFixture('fixtures/mechanical/hvac_plan_level2.pdf');
    });

    expect(mocked.listTakeoffItems).toHaveBeenCalledWith({ project_id: 'hvac_plan_level2', sheet_id: 'sheet_m22' });
    expect(result.current.state.items).toEqual([{ item_id: 'item-1' }]);
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

  it('opens fixtures straight into scan-all', async () => {
    useJobResult(scanAllResult());
    const { result } = renderHook(() => useTakeoffSession());

    await act(async () => {
      await result.current.openFixture('fixtures/mechanical/hvac_plan_level2.pdf');
    });

    expect(mocked.startAgentJob).toHaveBeenCalledWith(expect.objectContaining({
      file_path: 'fixtures/mechanical/hvac_plan_level2.pdf',
      project_id: 'hvac_plan_level2',
      analysis_scope: 'all',
      meta_consent: false,
    }));
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
