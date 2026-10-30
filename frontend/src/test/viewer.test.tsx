import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RunViewer } from '../modes/live/RunViewer';
import { SheetNavigation } from '../modes/live/SheetNavigation';
import { DrawingViewer } from '../modes/live/DrawingViewer';
import { apiClient } from '../api/client';
import type {
  RunSummaryItem,
  SheetItem,
  ViewDetailResponse,
  ImageBlobResult,
} from '../api/contracts';

// Mock apiClient
vi.mock('../api/client', () => {
  return {
    apiClient: {
      getHealth: vi.fn(),
      getVersion: vi.fn(),
      getRun: vi.fn(),
      listSheets: vi.fn(),
      getView: vi.fn(),
      getPageImageBlob: vi.fn(),
      getPageThumbnailBlob: vi.fn(),
      getSourcePdfUrl: vi.fn(),
      getRoutes: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0 }),
      getObjects: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0 }),
      getRunSummary: vi.fn().mockResolvedValue({
        run_id: 'RUN-20260908-135525-9A6D3D',
        project_id: 'PRJ-94318E2B1ECB',
        total_routes: 329,
        total_objects: 0,
        g3_status: 'G3_NOT_PASSED_NO_VERIFIED_SCALE',
      }),
      getReviewEvents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      appendReviewEvent: vi.fn(),
    },
  };
});

describe('MEP Design AI — UI-03 Drawing Viewer & Sheet Navigation Tests', () => {
  const mockRun: RunSummaryItem = {
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    job_id: 'JOB-66863EDD57DF',
    manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
    schema_version: '1.0.0',
    readiness_state: 'NOT_G4_READY',
    approved_demo_run: false,
    extraction_accuracy_claim_allowed: false,
    g3_status: 'G3_NOT_PASSED_NO_VERIFIED_SCALE',
    total_pages: 1,
    completed_page_count: 1,
    failed_page_count: 0,
    total_objects: 0,
    total_routes: 329,
    total_length: null,
    created_at: '2026-09-08T13:55:25Z',
    indexed_at: '2026-09-08T13:55:53Z',
  };

  const mockSheets: SheetItem[] = [
    {
      sheet_id: 'source_p1',
      run_id: 'RUN-20260908-135525-9A6D3D',
      project_id: 'PRJ-94318E2B1ECB',
      document_id: 'DOC-AB24C8CBB3E208E6',
      page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P0',
      page_index: 0,
      source_id: 'SRC-AB24C8CBB3E208E6',
      object_count: 0,
      route_count: 329,
    },
  ];

  const mockView: ViewDetailResponse = {
    view_id: 'VIEW-238CFC3EFFCAECF5',
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P0',
    sheet_id: 'source_p1',
    role: 'UNIFIED_PAGE',
    coordinate_space: 'PDF_PAGE_USER_SPACE',
    bounds: null,
    transform_provenance: {
      coordinate_space: 'PDF_PAGE_USER_SPACE',
      matrix: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
      notes: 'identity',
    },
  };

  const mockImageBlob: ImageBlobResult = {
    blob: new Blob(['fake-png-data'], { type: 'image/png' }),
    width: 6300,
    height: 4500,
  };

  const mockThumbnailBlob: ImageBlobResult = {
    blob: new Blob(['fake-thumb-data'], { type: 'image/png' }),
    width: 1512,
    height: 1080,
  };

  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    vi.mocked(apiClient.getHealth).mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI API',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.mocked(apiClient.getVersion).mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '0.1.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });
    vi.mocked(apiClient.getRun).mockResolvedValue(mockRun);
    vi.mocked(apiClient.listSheets).mockResolvedValue({ items: mockSheets, total: 1 });
    vi.mocked(apiClient.getView).mockResolvedValue(mockView);
    vi.mocked(apiClient.getPageImageBlob).mockResolvedValue(mockImageBlob);
    vi.mocked(apiClient.getPageThumbnailBlob).mockResolvedValue(mockThumbnailBlob);
    vi.mocked(apiClient.getSourcePdfUrl).mockReturnValue('/api/v1/projects/PRJ-94318E2B1ECB/drawings/SRC-AB24C8CBB3E208E6/source');
  });

  afterEach(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('1. Reconstructs state from route parameters and API data on direct navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Active Project:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PRJ-94318E2B1ECB/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/RUN-20260908-135525-9A6D3D/i)[0]).toBeInTheDocument();

    // Verify API calls were made with route parameters
    expect(apiClient.getRun).toHaveBeenCalledWith('PRJ-94318E2B1ECB', 'RUN-20260908-135525-9A6D3D', expect.any(AbortSignal));
    expect(apiClient.listSheets).toHaveBeenCalledWith('PRJ-94318E2B1ECB', 'RUN-20260908-135525-9A6D3D', expect.any(AbortSignal));
  });

  it('2. Renders Sheet Navigation with thumbnail, candidate sheet ID, and unverified candidate badge', async () => {
    render(
      <SheetNavigation
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        sheets={mockSheets}
        selectedSheetId="source_p1"
        selectedViewId="VIEW-238CFC3EFFCAECF5"
        views={[mockView]}
        onSelectSheet={vi.fn()}
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText('source_p1')).toBeInTheDocument();
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Unverified Candidate')).toBeInTheDocument();
    expect(screen.getByText('ID: PAGE-DOC-AB24C8CBB3E208E6-P0')).toBeInTheDocument();
    expect(screen.getByText(/Scale: Unverified/i)).toBeInTheDocument();

    // Verify thumbnail was retrieved
    await waitFor(() => {
      expect(apiClient.getPageThumbnailBlob).toHaveBeenCalledWith(
        'PRJ-94318E2B1ECB',
        'RUN-20260908-135525-9A6D3D',
        'PAGE-DOC-AB24C8CBB3E208E6-P0',
        expect.any(AbortSignal)
      );
    });
  });

  it('3. Supports accessible keyboard arrow navigation across sheets', () => {
    const onSelectSheet = vi.fn();
    const twoSheets: SheetItem[] = [
      mockSheets[0],
      {
        ...mockSheets[0],
        sheet_id: 'source_p2',
        page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P1',
        page_index: 1,
      },
    ];

    render(
      <SheetNavigation
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        sheets={twoSheets}
        selectedSheetId="source_p1"
        selectedViewId={null}
        views={[]}
        onSelectSheet={onSelectSheet}
        isLoading={false}
        error={null}
      />
    );

    const sheetButtons = screen.getAllByRole('tab');
    expect(sheetButtons).toHaveLength(2);

    // Press ArrowDown on first button
    fireEvent.keyDown(sheetButtons[0], { key: 'ArrowDown' });
    expect(onSelectSheet).toHaveBeenCalledWith(twoSheets[1]);

    // Press ArrowUp on second button
    fireEvent.keyDown(sheetButtons[1], { key: 'ArrowUp' });
    expect(onSelectSheet).toHaveBeenCalledWith(twoSheets[0]);
  });

  it('4. DrawingViewer renders source page image and SVG coordinate layer without placeholder', async () => {
    render(
      <DrawingViewer
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        selectedSheet={mockSheets[0]}
        selectedView={mockView}
      />
    );

    // Initial loading indicator
    expect(screen.getByText(/Rendering Source Page at 150 DPI/i)).toBeInTheDocument();

    // Wait for image blob to load and render
    await waitFor(() => {
      expect(screen.getByTestId('transformed-page-wrapper')).toBeInTheDocument();
    });

    // Verify source image rendered
    const img = screen.getByTestId('source-page-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('width', '6300');
    expect(img).toHaveAttribute('height', '4500');

    // Verify SVG coordinate layer rendered on top with 3024x2160 pt viewBox
    const svg = screen.getByTestId('svg-coordinate-layer');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 3024 2160');

    // Verify control points alignment layer
    expect(screen.getByTestId('alignment-control-points')).toBeInTheDocument();
  });

  it('5. Viewport toolbar controls execute fit, zoom, and reset transforms', async () => {
    render(
      <DrawingViewer
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        selectedSheet={mockSheets[0]}
        selectedView={mockView}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('transformed-page-wrapper')).toBeInTheDocument();
    });

    const zoomInBtn = screen.getByRole('button', { name: /Zoom In/i });
    const zoomOutBtn = screen.getByRole('button', { name: /Zoom Out/i });
    const fitBtn = screen.getByRole('button', { name: /Fit to Viewport/i });
    const reset100Btn = screen.getByRole('button', { name: /Reset to 100% scale/i });

    // Click Zoom In
    fireEvent.click(zoomInBtn);
    // Click 100% scale
    fireEvent.click(reset100Btn);
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Click Zoom Out
    fireEvent.click(zoomOutBtn);

    // Click Fit
    fireEvent.click(fitBtn);
  });

  it('6. Revokes Object URLs on unmount to prevent browser memory leaks', async () => {
    const { unmount } = render(
      <DrawingViewer
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        selectedSheet={mockSheets[0]}
        selectedView={mockView}
      />
    );

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalled();
    });

    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('7. Displays safe error state when run ID is invalid', async () => {
    vi.mocked(apiClient.getRun).mockRejectedValueOnce(new Error("Run 'INVALID-RUN' not found in project 'PRJ-TEST'"));

    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-TEST/runs/INVALID-RUN']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Unable to Open Run/i)).toBeInTheDocument();
    expect(screen.getByText(/Run 'INVALID-RUN' not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Project List/i })).toBeInTheDocument();
  });

  it('8. Displays fail-closed G3 scale warning and honest metadata in inspector', async () => {
    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/G3: Scale Unverified/i)).toBeInTheDocument();
    expect(screen.getByText(/Drawing contains no verified physical scale bar or ratio/i)).toBeInTheDocument();
    expect(screen.getByText(/Extraction overlays, route tables, and export options unlock in UI-04 and UI-05/i)).toBeInTheDocument();
    expect(screen.getByText(/Download Source PDF/i)).toBeInTheDocument();
  });
});
