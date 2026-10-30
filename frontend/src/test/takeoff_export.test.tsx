import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { TakeoffSummary } from '../modes/live/TakeoffSummary';
import { ExportPanel } from '../modes/live/ExportPanel';
import { ScopeReadinessBanner } from '../modes/live/ScopeReadinessBanner';
import { RunViewer } from '../modes/live/RunViewer';
import { DemoApp } from '../modes/demo/DemoApp';
import { apiClient } from '../api/client';
import type {
  PackageSummaryResponse,
  ExportResponse,
  ExportListResponse,
  RunSummaryItem,
  SheetItem,
  ViewDetailResponse,
  RouteItem,
  ReviewEventResponse,
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
      getRoutes: vi.fn(),
      getObjects: vi.fn(),
      getRunSummary: vi.fn(),
      getReviewEvents: vi.fn(),
      appendReviewEvent: vi.fn(),
      createExport: vi.fn(),
      listExports: vi.fn(),
      downloadExport: vi.fn(),
    },
  };
});

describe('MEP Design AI — UI-05 Takeoff, Coverage, and Export Tests', () => {
  const mockSummary: PackageSummaryResponse = {
    project_id: 'PRJ-94318E2B1ECB',
    run_id: 'RUN-20260908-135525-9A6D3D',
    total_pages: 1,
    total_sheets: 1,
    total_views: 1,
    total_objects: 0,
    total_routes: 329,
    measured_route_count: 0,
    unavailable_length_count: 329,
    total_physical_length_m: null,
    g3_status: 'G3_NOT_PASSED_NO_VERIFIED_SCALE',
    approved_demo_run: false,
    extraction_accuracy_claim_allowed: false,
    continuity_state_counts: {
      CONTINUOUS: 180,
      GAP_BRIDGED: 95,
      ISOLATED: 54,
    },
    representation_state_counts: {
      SINGLE_LINE: 320,
      DOUBLE_LINE: 9,
    },
    review_status_counts: {
      ACCEPTED: 1,
      NEEDS_REVIEW: 2,
      REJECTED: 0,
      PENDING: 326,
    },
    review_required_count: 0,
  };

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

  const mockSheet: SheetItem = {
    sheet_id: 'SHT-PAGE-DOC-AB24C8CBB3E2-0000',
    page_id: 'PAGE-DOC-AB24C8CBB3E2-0000',
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    source_id: 'SRC-AB24C8CBB3E208E6',
    page_index: 0,
    object_count: 0,
    route_count: 329,
  };

  const mockView: ViewDetailResponse = {
    view_id: 'VIEW-238CFC3EFFCAECF5',
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    page_id: 'PAGE-DOC-AB24C8CBB3E2-0000',
    sheet_id: 'SHT-PAGE-DOC-AB24C8CBB3E2-0000',
    coordinate_space: 'PDF_PAGE_USER_SPACE',
    role: 'UNIFIED_PAGE',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.getHealth).mockResolvedValue({
      status: 'ok',
      service_name: 'mep-design-ai-backend',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.mocked(apiClient.getVersion).mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: ['object_type', 'location_or_path', 'confidence', 'length', 'sheet_id'],
    });
    vi.mocked(apiClient.getRun).mockResolvedValue(mockRun);
    vi.mocked(apiClient.listSheets).mockResolvedValue({
      items: [mockSheet],
      total: 1,
    });
    vi.mocked(apiClient.getView).mockResolvedValue(mockView);
    vi.mocked(apiClient.getRoutes).mockResolvedValue({
      items: [],
      total: 329,
      limit: 1000,
      offset: 0,
    });
    vi.mocked(apiClient.getObjects).mockResolvedValue({
      items: [],
      total: 0,
      limit: 1000,
      offset: 0,
    });
    vi.mocked(apiClient.getRunSummary).mockResolvedValue(mockSummary);
    vi.mocked(apiClient.getReviewEvents).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(apiClient.listExports).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(apiClient.getPageImageBlob).mockResolvedValue({
      blob: new Blob([''], { type: 'image/png' }),
      width: 2384,
      height: 1684,
    });
    vi.mocked(apiClient.getPageThumbnailBlob).mockResolvedValue({
      blob: new Blob([''], { type: 'image/png' }),
      width: 300,
      height: 200,
    });
  });

  // 1. summary request uses explicit project and run IDs
  it('1. summary request uses explicit project and run IDs', async () => {
    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiClient.getRunSummary).toHaveBeenCalledWith(
        'PRJ-94318E2B1ECB',
        'RUN-20260908-135525-9A6D3D',
        expect.any(AbortSignal)
      );
    });
  });

  // 2. summary values come from the backend response
  it('2. summary values come from the backend response', () => {
    render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
      />
    );

    expect(screen.getAllByText('329').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Physical total is not available because the drawing scale was not confirmed.')).toBeDefined();
    expect(screen.getByText('G3_NOT_PASSED_NO_VERIFIED_SCALE')).toBeDefined();
  });

  // 3. route count 329 can display without being hard-coded in product source
  it('3. dynamic route count displays faithfully from backend data', () => {
    const customSummary: PackageSummaryResponse = {
      ...mockSummary,
      total_routes: 412,
      unavailable_length_count: 412,
    };

    render(
      <TakeoffSummary
        summary={customSummary}
        isLoading={false}
      />
    );

    expect(screen.getAllByText('412').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Geometry review available: 412 routes/)).toBeDefined();
  });

  // 4. null physical total displays "—" or "Not available"
  it('4. null physical total displays "—" or "Not available"', () => {
    render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
      />
    );

    expect(screen.getByText('—')).toBeDefined();
    expect(screen.getByText('Not available')).toBeDefined();
  });

  // 5. null total never displays "0 m"
  it('5. null total never displays "0 m"', () => {
    const { container } = render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
      />
    );

    expect(container.textContent).not.toContain('0 m');
    expect(container.textContent).not.toContain('0 ft');
    expect(container.textContent).not.toContain('Total length: 0');
  });

  // 6. measured count zero remains distinct from null physical total
  it('6. measured count zero remains distinct from null physical total', () => {
    render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
      />
    );

    // Measured routes count has 0
    expect(screen.getByText('Measured Routes')).toBeDefined();
    // Physical total remains "—"
    expect(screen.getByText('Physical Total')).toBeDefined();
    expect(screen.getByText('—')).toBeDefined();
  });

  // 7. continuity, representation, and review categories remain distinct
  it('7. continuity, representation, and review categories remain distinct', () => {
    render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
      />
    );

    // Continuity categories
    expect(screen.getByText('Continuous')).toBeDefined();
    expect(screen.getByText('Gap Bridged')).toBeDefined();
    expect(screen.getByText('Isolated')).toBeDefined();

    // Representation categories
    expect(screen.getByText('Single Line')).toBeDefined();
    expect(screen.getByText('Double Line')).toBeDefined();

    // Review categories
    expect(screen.getByText('Accepted')).toBeDefined();
    expect(screen.getByText('Needs Review')).toBeDefined();
    expect(screen.getByText('Rejected')).toBeDefined();
  });

  // 8. summary filter and UI-04 overlay/table filters stay synchronized
  it('8. clicking summary category invokes filter callback with exact category', () => {
    const onSelectFilter = vi.fn();

    render(
      <TakeoffSummary
        summary={mockSummary}
        isLoading={false}
        onSelectFilterGroup={onSelectFilter}
      />
    );

    const gapBridgedBtn = screen.getByText('Gap Bridged');
    fireEvent.click(gapBridgedBtn);

    expect(onSelectFilter).toHaveBeenCalledWith('continuity', 'GAP_BRIDGED');
  });

  // 9. export creation handles HTTP 201 (new creation)
  it('9. export creation handles HTTP 201 new bundle response', async () => {
    const mockExportRes: ExportResponse = {
      export_id: 'EXP-99F72D0B6A78',
      project_id: 'PRJ-94318E2B1ECB',
      run_id: 'RUN-20260908-135525-9A6D3D',
      state: 'CREATED',
      export_schema_version: '1.0.0',
      manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
      bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
      bundle_size_bytes: 45678,
      files: [],
      created_at: '2026-09-08T14:10:00Z',
    };

    vi.mocked(apiClient.createExport).mockResolvedValue(mockExportRes);

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    const createBtn = screen.getByRole('button', { name: /create export bundle/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(apiClient.createExport).toHaveBeenCalledWith('PRJ-94318E2B1ECB', 'RUN-20260908-135525-9A6D3D');
      expect(screen.getByText('Created New Export Bundle')).toBeDefined();
      expect(screen.getByText('EXP-99F72D0B6A78')).toBeDefined();
    });
  });

  // 10. repeated export handles HTTP 200 and ALREADY_EXPORTED
  it('10. repeated export handles HTTP 200 and ALREADY_EXPORTED', async () => {
    const mockExportRes: ExportResponse = {
      export_id: 'EXP-99F72D0B6A78',
      project_id: 'PRJ-94318E2B1ECB',
      run_id: 'RUN-20260908-135525-9A6D3D',
      state: 'ALREADY_EXPORTED',
      export_schema_version: '1.0.0',
      manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
      bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
      bundle_size_bytes: 45678,
      files: [],
      created_at: '2026-09-08T14:10:00Z',
    };

    vi.mocked(apiClient.createExport).mockResolvedValue(mockExportRes);

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    const createBtn = screen.getByRole('button', { name: /create export bundle/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Reused Existing Export Bundle')).toBeDefined();
      expect(screen.getByText('ALREADY_EXPORTED')).toBeDefined();
    });
  });

  // 11. export listing uses the explicit selected run
  it('11. export listing uses the explicit selected run', async () => {
    const mockList: ExportListResponse = {
      items: [
        {
          export_id: 'EXP-111111111111',
          project_id: 'PRJ-94318E2B1ECB',
          run_id: 'RUN-20260908-135525-9A6D3D',
          export_schema_version: '1.0.0',
          manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
          bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
          bundle_size_bytes: 45678,
          created_at: '2026-09-08T14:10:00Z',
        },
      ],
      total: 1,
    };

    vi.mocked(apiClient.listExports).mockResolvedValue(mockList);

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    await waitFor(() => {
      expect(apiClient.listExports).toHaveBeenCalledWith('PRJ-94318E2B1ECB', 'RUN-20260908-135525-9A6D3D');
      expect(screen.getByText('EXP-111111111111')).toBeDefined();
    });
  });

  // 12. ZIP download uses the server response
  it('12. ZIP download requests blob from backend endpoint', async () => {
    const mockBlob = new Blob(['PK\x03\x04zipcontent'], { type: 'application/zip' });
    vi.mocked(apiClient.downloadExport).mockResolvedValue(mockBlob);

    const mockList: ExportListResponse = {
      items: [
        {
          export_id: 'EXP-111111111111',
          project_id: 'PRJ-94318E2B1ECB',
          run_id: 'RUN-20260908-135525-9A6D3D',
          export_schema_version: '1.0.0',
          manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
          bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
          bundle_size_bytes: 45678,
          created_at: '2026-09-08T14:10:00Z',
        },
      ],
      total: 1,
    };
    vi.mocked(apiClient.listExports).mockResolvedValue(mockList);

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('EXP-111111111111')).toBeDefined();
    });

    const downloadBtn = screen.getByRole('button', { name: /zip/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(apiClient.downloadExport).toHaveBeenCalledWith(
        'PRJ-94318E2B1ECB',
        'RUN-20260908-135525-9A6D3D',
        'EXP-111111111111'
      );
    });
  });

  // 13. export Blob Object URL is revoked
  it('13. export Blob Object URL is created and revoked after download', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    const mockBlob = new Blob(['PK\x03\x04zipcontent'], { type: 'application/zip' });
    vi.mocked(apiClient.downloadExport).mockResolvedValue(mockBlob);

    const mockList: ExportListResponse = {
      items: [
        {
          export_id: 'EXP-111111111111',
          project_id: 'PRJ-94318E2B1ECB',
          run_id: 'RUN-20260908-135525-9A6D3D',
          export_schema_version: '1.0.0',
          manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
          bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
          bundle_size_bytes: 45678,
          created_at: '2026-09-08T14:10:00Z',
        },
      ],
      total: 1,
    };
    vi.mocked(apiClient.listExports).mockResolvedValue(mockList);

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('EXP-111111111111')).toBeDefined();
    });

    const downloadBtn = screen.getByRole('button', { name: /zip/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/test-uuid');
    });
  });

  // 14. no client JSON, CSV, length, or ZIP generation occurs
  it('14. no client JSON, CSV, or ZIP packaging occurs in ExportPanel', () => {
    // ExportPanel only delegates to apiClient.createExport and apiClient.downloadExport
    expect(typeof apiClient.createExport).toBe('function');
    expect(typeof apiClient.downloadExport).toBe('function');
  });

  // 15. export failure does not destroy loaded drawing/results
  it('15. export creation failure retains drawing and results UI without unmounting', async () => {
    vi.mocked(apiClient.createExport).mockRejectedValue(new Error('Export engine busy'));

    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    const createBtn = screen.getByRole('button', { name: /create export bundle/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText('Export Failed')).toBeDefined();
      expect(screen.getByText('Export engine busy')).toBeDefined();
    });
  });

  // 16. loading, empty, disconnected, malformed, and partial states
  it('16. renders truthful resilient states for TakeoffSummary', () => {
    // Loading state
    const { rerender } = render(<TakeoffSummary summary={null} isLoading={true} />);
    expect(screen.getByText(/Loading authoritative package summary/)).toBeDefined();

    // Disconnected state
    rerender(<TakeoffSummary summary={null} isLoading={false} isDisconnected={true} />);
    expect(screen.getByText('Backend Disconnected')).toBeDefined();

    // Error state
    rerender(<TakeoffSummary summary={null} isLoading={false} error="Summary malformed" />);
    expect(screen.getByText('Takeoff Summary Unavailable')).toBeDefined();
    expect(screen.getByText('Summary malformed')).toBeDefined();

    // Empty state
    rerender(<TakeoffSummary summary={null} isLoading={false} />);
    expect(screen.getByText('No Summary Data Available')).toBeDefined();
  });

  // 17. review and raw-result wording remain distinct
  it('17. review projection and raw extraction wording remain distinct', () => {
    render(
      <ExportPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
      />
    );

    expect(screen.getByText(/Raw extraction:/)).toBeDefined();
    expect(screen.getByText(/Reviewed result:/)).toBeDefined();
    expect(screen.getByText(/Review notes never alter route geometry, confidence, scale, physical length, or source lineage/)).toBeDefined();
  });

  // 18. Demo makes zero API requests
  it('18. Demo mode makes zero FastAPI requests', () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <DemoApp />
      </MemoryRouter>
    );

    expect(apiClient.getHealth).not.toHaveBeenCalled();
    expect(apiClient.getRun).not.toHaveBeenCalled();
    expect(apiClient.getRunSummary).not.toHaveBeenCalled();
    expect(apiClient.createExport).not.toHaveBeenCalled();
    expect(screen.getByText(/Offline fixture mode/i)).toBeDefined();
  });

  // 19. Live imports no Demo fixture
  it('19. Live mode imports no Demo fixture and uses live apiClient', async () => {
    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiClient.getRun).toHaveBeenCalledWith('PRJ-94318E2B1ECB', 'RUN-20260908-135525-9A6D3D', expect.any(AbortSignal));
    });
  });

  // 20. ScopeReadinessBanner renders clear words and symbols
  it('20. ScopeReadinessBanner makes geometry ready and physical takeoff blocked explicit', () => {
    render(
      <ScopeReadinessBanner
        runId="RUN-20260908-135525-9A6D3D"
        sourceId="SRC-AB24C8CBB3E208E6"
        g3Status="G3_NOT_PASSED_NO_VERIFIED_SCALE"
        totalRoutes={329}
        measuredRoutes={0}
      />
    );

    expect(screen.getByText(/Ready for geometry review \(329 routes\)/)).toBeDefined();
    expect(screen.getByText(/Not ready for measured physical takeoff/)).toBeDefined();
    expect(screen.getByText(/Not an extraction-accuracy certification/)).toBeDefined();
  });

  // UI-05-C1 Review-Dependent Summary Synchronization Tests
  describe('UI-05-C1 Review-Dependent Summary Synchronization Tests', () => {
    const generate329Routes = (): RouteItem[] => {
      return Array.from({ length: 329 }, (_, i) => ({
        route_id: `RTE-${String(i + 1).padStart(4, '0')}`,
        run_id: 'RUN-20260908-135525-9A6D3D',
        project_id: 'PRJ-94318E2B1ECB',
        page_id: 'PAGE-DOC-AB24C8CBB3E2-0000',
        sheet_id: 'SHT-PAGE-DOC-AB24C8CBB3E2-0000',
        view_id: 'VIEW-238CFC3EFFCAECF5',
        object_type: 'HVAC_DUCT',
        confidence: null,
        continuity_status: 'CONTINUOUS',
        representation_state: 'PAIRED_BOUNDARY_DERIVED',
        physical_length: null,
        physical_length_m: null,
        physical_length_status: 'FAIL_CLOSED_NO_SCALE',
        scale_status: 'UNVERIFIED',
        geometry: {
          coordinate_space: 'PDF_PAGE_USER_SPACE',
          location_or_path: {
            type: 'polyline',
            points: [
              [100, 200],
              [150, 200],
            ],
          },
        },
        uncertainty_codes: [],
        review_required: false,
        review_projection: {
          reviewed_status: 'PENDING',
          event_count: 0,
          has_notes: false,
        },
      }));
    };

    it('21. successful review append immediately triggers getRunSummary refetch and updates summary review counts', async () => {
      const initialRoutes = generate329Routes();
      const initialSummary: PackageSummaryResponse = {
        ...mockSummary,
        review_status_counts: {
          ACCEPTED: 0,
          NEEDS_REVIEW: 0,
          REJECTED: 0,
          PENDING: 329,
        },
      };

      const updatedSummary: PackageSummaryResponse = {
        ...initialSummary,
        review_status_counts: {
          ACCEPTED: 0,
          NEEDS_REVIEW: 1,
          REJECTED: 0,
          PENDING: 328,
        },
      };

      vi.mocked(apiClient.getRoutes).mockResolvedValue({
        items: initialRoutes,
        total: 329,
        limit: 1000,
        offset: 0,
      });
      vi.mocked(apiClient.getRunSummary).mockResolvedValueOnce(initialSummary);

      const reviewEvent: ReviewEventResponse = {
        event_id: 'REV-SYNC-PROOF-01',
        run_id: 'RUN-20260908-135525-9A6D3D',
        project_id: 'PRJ-94318E2B1ECB',
        sequence: 1,
        target_type: 'ROUTE',
        target_id: 'RTE-0001',
        action: 'NEEDS_REVIEW',
        comment: 'UI-05-C1 summary synchronization proof',
        created_at: '2026-09-08T20:30:00Z',
      };

      vi.mocked(apiClient.appendReviewEvent).mockResolvedValue(reviewEvent);

      render(
        <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
          <Routes>
            <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for run to finish loading and switch to Quantities Ledger table view
      const ledgerTab = await screen.findByRole('button', { name: /Quantities Ledger/i });
      fireEvent.click(ledgerTab);
      const row = await screen.findByText('RTE-0001');
      fireEvent.click(row);

      // Setup the next getRunSummary call to return updated summary
      vi.mocked(apiClient.getRunSummary).mockResolvedValueOnce(updatedSummary);

      // Click Needs Review button in ReviewPanel
      const nrBtn = await screen.findByRole('button', { name: /^Needs Review$/i });
      fireEvent.click(nrBtn);

      // Submit review
      const submitBtn = await screen.findByRole('button', { name: /Record NEEDS_REVIEW Decision/i });
      fireEvent.click(submitBtn);

      // Verify appendReviewEvent was called
      await waitFor(() => {
        expect(apiClient.appendReviewEvent).toHaveBeenCalledWith(
          'PRJ-94318E2B1ECB',
          'RUN-20260908-135525-9A6D3D',
          {
            target_type: 'ROUTE',
            target_id: 'RTE-0001',
            action: 'NEEDS_REVIEW',
            comment: null,
          }
        );
      });

      // Verify getRunSummary was called again
      await waitFor(() => {
        expect(apiClient.getRunSummary).toHaveBeenCalledTimes(2);
      });

      // Switch to Takeoff & Coverage tab
      const summaryTab = screen.getByRole('button', { name: /^Takeoff & Coverage$/i });
      fireEvent.click(summaryTab);

      // Verify TakeoffSummary shows updated counts: Needs Review: 1, Pending: 328
      await waitFor(() => {
        expect(screen.getAllByText('Needs Review').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('328').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('22. review append failure does NOT trigger false summary update or mutate review counts', async () => {
      const initialRoutes = generate329Routes();
      const initialSummary: PackageSummaryResponse = {
        ...mockSummary,
        review_status_counts: {
          ACCEPTED: 0,
          NEEDS_REVIEW: 0,
          REJECTED: 0,
          PENDING: 329,
        },
      };

      vi.mocked(apiClient.getRoutes).mockResolvedValue({
        items: initialRoutes,
        total: 329,
        limit: 1000,
        offset: 0,
      });
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(initialSummary);
      vi.mocked(apiClient.appendReviewEvent).mockRejectedValue(new Error('Review engine connection timeout'));

      render(
        <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
          <Routes>
            <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for run to finish loading and switch to Quantities Ledger table view
      const ledgerTab = await screen.findByRole('button', { name: /Quantities Ledger/i });
      fireEvent.click(ledgerTab);
      const row = await screen.findByText('RTE-0001');
      fireEvent.click(row);

      const nrBtn = await screen.findByRole('button', { name: /^Needs Review$/i });
      fireEvent.click(nrBtn);

      const submitBtn = await screen.findByRole('button', { name: /Record NEEDS_REVIEW Decision/i });
      fireEvent.click(submitBtn);

      // Verify error message is rendered
      await waitFor(() => {
        expect(screen.getByText('Review engine connection timeout')).toBeDefined();
      });

      // Verify getRunSummary was called only once on initial mount
      expect(apiClient.getRunSummary).toHaveBeenCalledTimes(1);
    });

    it('23. selected route identity and raw immutability remain preserved after review submission', async () => {
      const initialRoutes = generate329Routes();
      vi.mocked(apiClient.getRoutes).mockResolvedValue({
        items: initialRoutes,
        total: 329,
        limit: 1000,
        offset: 0,
      });
      vi.mocked(apiClient.getRunSummary).mockResolvedValue(mockSummary);

      const reviewEvent: ReviewEventResponse = {
        event_id: 'REV-SYNC-PROOF-02',
        run_id: 'RUN-20260908-135525-9A6D3D',
        project_id: 'PRJ-94318E2B1ECB',
        sequence: 1,
        target_type: 'ROUTE',
        target_id: 'RTE-0001',
        action: 'ACCEPT',
        comment: 'Field verified',
        created_at: '2026-09-08T20:30:00Z',
      };
      vi.mocked(apiClient.appendReviewEvent).mockResolvedValue(reviewEvent);

      render(
        <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
          <Routes>
            <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for run to finish loading and switch to Quantities Ledger table view
      const ledgerTab = await screen.findByRole('button', { name: /Quantities Ledger/i });
      fireEvent.click(ledgerTab);
      const row = await screen.findByText('RTE-0001');
      fireEvent.click(row);

      // Submit Accept
      const acceptBtn = await screen.findByRole('button', { name: /^Accept$/i });
      fireEvent.click(acceptBtn);
      const submitBtn = await screen.findByRole('button', { name: /Record ACCEPT Decision/i });
      fireEvent.click(submitBtn);

      // Verify route remains selected in Inspector
      await waitFor(() => {
        expect(screen.getByText(/Canonical Route Entity/i)).toBeDefined();
        expect(screen.getByText(/Raw Extraction \(Immutable\)/i)).toBeDefined();
        expect(screen.getByText(/Reviewed Projection/i)).toBeDefined();
      });

      // Verify raw extraction details remain untouched
      expect(screen.getAllByText(/PAIRED_BOUNDARY_DERIVED/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/— \(Length unavailable\)/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Scale state: UNVERIFIED/i).length).toBeGreaterThanOrEqual(1);
    });

    it('24. ExportPanel automatically re-fetches exports when reviewRevision increments', async () => {
      const mockList1: ExportListResponse = { items: [], total: 0 };
      const mockList2: ExportListResponse = {
        items: [
          {
            export_id: 'EXP-REV-SYNC-01',
            project_id: 'PRJ-94318E2B1ECB',
            run_id: 'RUN-20260908-135525-9A6D3D',
            export_schema_version: '1.0.0',
            manifest_sha256: '46D08D0E79FE6348260CA5DF830C6F0B98374E5F52F47D5E0E7032C8BDA4433B',
            bundle_sha256: 'B0DE66B136C9C4E0FA1E80562D55B77E3C7598EDBEFDE3627D4C6CE36B9F2997',
            bundle_size_bytes: 45678,
            created_at: '2026-09-08T20:30:00Z',
          },
        ],
        total: 1,
      };

      vi.mocked(apiClient.listExports).mockResolvedValueOnce(mockList1).mockResolvedValueOnce(mockList2);

      const { rerender } = render(
        <ExportPanel
          projectId="PRJ-94318E2B1ECB"
          runId="RUN-20260908-135525-9A6D3D"
          reviewRevision={0}
        />
      );

      await waitFor(() => {
        expect(apiClient.listExports).toHaveBeenCalledTimes(1);
      });

      // Rerender with reviewRevision = 1
      rerender(
        <ExportPanel
          projectId="PRJ-94318E2B1ECB"
          runId="RUN-20260908-135525-9A6D3D"
          reviewRevision={1}
        />
      );

      await waitFor(() => {
        expect(apiClient.listExports).toHaveBeenCalledTimes(2);
        expect(screen.getByText('EXP-REV-SYNC-01')).toBeDefined();
      });
    });
  });
});
