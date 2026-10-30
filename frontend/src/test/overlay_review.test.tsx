import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RunViewer } from '../modes/live/RunViewer';
import { DrawingOverlay } from '../modes/live/DrawingOverlay';
import { ResultTable, type UnifiedResultItem } from '../modes/live/ResultTable';
import { ResultInspector } from '../modes/live/ResultInspector';
import { ReviewPanel } from '../modes/live/ReviewPanel';
import { LayerControls, type FilterState } from '../modes/live/LayerControls';
import { apiClient } from '../api/client';
import type {
  RouteItem,
  RunSummaryItem,
  SheetItem,
  ViewDetailResponse,
  ReviewEventResponse,
  PackageSummaryResponse,
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
    },
  };
});

describe('MEP Design AI — UI-04 Extraction Overlays, Results, Inspector & Review Tests', () => {
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
    sheet_id: 'source_p1',
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    document_id: 'DOC-AB24C8CBB3E208E6',
    page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P0',
    page_index: 0,
    source_id: 'SRC-AB24C8CBB3E208E6',
    object_count: 0,
    route_count: 329,
  };

  const mockView: ViewDetailResponse = {
    view_id: 'VIEW-238CFC3EFFCAECF5',
    run_id: 'RUN-20260908-135525-9A6D3D',
    project_id: 'PRJ-94318E2B1ECB',
    page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P0',
    sheet_id: 'source_p1',
    coordinate_space: 'PDF_PAGE_USER_SPACE',
    role: 'UNIFIED_PAGE',
  };

  // Generate 329 realistic mock route records matching the real fixture contract
  const generateMockRoutes = (count = 329): RouteItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      route_id: `ROUTE-${String(i + 1).padStart(4, '0')}`,
      run_id: 'RUN-20260908-135525-9A6D3D',
      project_id: 'PRJ-94318E2B1ECB',
      page_id: 'PAGE-DOC-AB24C8CBB3E208E6-P0',
      sheet_id: 'source_p1',
      view_id: 'VIEW-238CFC3EFFCAECF5',
      object_type: 'HVAC_DUCT',
      confidence: null, // calibrated confidence null per verified fixture
      continuity_status: i % 10 === 0 ? 'GAP_BRIDGED' : i % 15 === 0 ? 'ISOLATED' : 'CONTINUOUS',
      representation_state: 'SINGLE_LINE',
      physical_length: null, // fail-closed scale
      physical_length_m: null,
      physical_length_status: 'FAIL_CLOSED_NO_SCALE',
      scale_status: 'UNVERIFIED',
      geometry: {
        coordinate_space: 'PDF_PAGE_USER_SPACE',
        location_or_path: {
          type: 'polyline',
          points: [
            [100 + (i % 50) * 10, 200 + Math.floor(i / 50) * 15],
            [150 + (i % 50) * 10, 200 + Math.floor(i / 50) * 15],
            [150 + (i % 50) * 10, 250 + Math.floor(i / 50) * 15],
          ],
        },
      },
      uncertainty_codes: i % 10 === 0 ? ['POTENTIAL_DISCONTINUITY'] : [],
      review_required: i % 10 === 0,
      review_projection: {
        reviewed_status: 'PENDING',
        event_count: 0,
        has_notes: false,
      },
    }));
  };

  const mockRoutes = generateMockRoutes(329);

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
      supported_public_output_fields: ['routes', 'objects'],
    });

    vi.mocked(apiClient.getRun).mockResolvedValue(mockRun);
    vi.mocked(apiClient.listSheets).mockResolvedValue({ items: [mockSheet], total: 1 });
    vi.mocked(apiClient.getView).mockResolvedValue(mockView);
    vi.mocked(apiClient.getRoutes).mockResolvedValue({
      items: mockRoutes,
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
      review_required_count: 33,
    };
    vi.mocked(apiClient.getRunSummary).mockResolvedValue(mockSummary);
    vi.mocked(apiClient.getReviewEvents).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(apiClient.getPageImageBlob).mockResolvedValue({
      blob: new Blob(['fake-img'], { type: 'image/png' }),
      width: 3000,
      height: 2200,
    });
    vi.mocked(apiClient.getPageThumbnailBlob).mockResolvedValue({
      blob: new Blob(['fake-thumb'], { type: 'image/png' }),
      width: 200,
      height: 150,
    });
  });

  it('1. Renders 329 canonical route polylines in SVG coordinate layer', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <svg viewBox="0 0 3000 2200">
        <DrawingOverlay
          routes={mockRoutes}
          objects={[]}
          selectedId={null}
          onSelect={handleSelect}
          showRoutes={true}
          showObjects={true}
          showReviewMarks={true}
        />
      </svg>
    );

    const routeGroups = container.querySelectorAll('.mep-route-group');
    expect(routeGroups.length).toBe(329);

    const hitBoxes = container.querySelectorAll('polyline[stroke="transparent"]');
    expect(hitBoxes.length).toBe(329);
  });

  it('2. Clicking SVG polyline triggers selection callback with route identity', () => {
    const handleSelect = vi.fn();
    const { container } = render(
      <svg viewBox="0 0 3000 2200">
        <DrawingOverlay
          routes={mockRoutes.slice(0, 5)}
          objects={[]}
          selectedId={null}
          onSelect={handleSelect}
          showRoutes={true}
          showObjects={true}
          showReviewMarks={true}
        />
      </svg>
    );

    const firstHitBox = container.querySelector('polyline[stroke="transparent"]')!;
    fireEvent.click(firstHitBox);

    expect(handleSelect).toHaveBeenCalledWith('ROUTE-0001', 'route');
  });

  it('3. Layer controls toggle routes, objects, and review marks visibility', () => {
    const onToggleRoutes = vi.fn();
    const onToggleObjects = vi.fn();
    const onToggleReviewMarks = vi.fn();
    const onFilterChange = vi.fn();
    const onClearFilters = vi.fn();

    const filters: FilterState = {
      continuity: 'ALL',
      representation: 'ALL',
      reviewStatus: 'ALL',
    };

    render(
      <LayerControls
        totalRoutes={329}
        totalObjects={0}
        visibleCount={329}
        showRoutes={true}
        showObjects={true}
        showReviewMarks={true}
        filters={filters}
        onToggleRoutes={onToggleRoutes}
        onToggleObjects={onToggleObjects}
        onToggleReviewMarks={onToggleReviewMarks}
        onFilterChange={onFilterChange}
        onClearFilters={onClearFilters}
        selectedItemHiddenByFilter={false}
      />
    );

    expect(screen.getByRole('button', { name: /Routes \(329\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Objects \(0\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Marks/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Routes \(329\)/i }));
    expect(onToggleRoutes).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Objects \(0\)/i }));
    expect(onToggleObjects).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Review Marks/i }));
    expect(onToggleReviewMarks).toHaveBeenCalledTimes(1);
  });

  it('4. Result table renders 25 items per page and paginates correctly across 329 routes', () => {
    const unifiedItems: UnifiedResultItem[] = mockRoutes.map((r) => ({
      kind: 'route',
      data: r,
    }));
    const onSelect = vi.fn();

    render(
      <ResultTable
        items={unifiedItems}
        selectedId={null}
        onSelect={onSelect}
        pageSize={25}
      />
    );

    // Shows 329 items
    expect(screen.getByText(/329 items/i)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 14')).toBeInTheDocument();

    // Verify first row
    expect(screen.getByText('ROUTE-0001')).toBeInTheDocument();

    // Next page
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText('Page 2 of 14')).toBeInTheDocument();
    expect(screen.getByText('ROUTE-0026')).toBeInTheDocument();
  });

  it('5. Result table displays — for null physical lengths and shows fail-closed explanation', () => {
    const unifiedItems: UnifiedResultItem[] = mockRoutes.slice(0, 5).map((r) => ({
      kind: 'route',
      data: r,
    }));

    render(
      <ResultTable
        items={unifiedItems}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );

    // Check that null lengths render as '—' rather than '0 m'
    const nullLengthCells = screen.getAllByText('—');
    expect(nullLengthCells.length).toBeGreaterThanOrEqual(5);

    // Fail-closed explanation footnote
    expect(
      screen.getByText(/Drawing scale could not be verified from title block/i)
    ).toBeInTheDocument();
  });

  it('6. Result Inspector clearly separates Raw Extraction from Mutable Reviewed Projection', () => {
    const testRoute = mockRoutes[0];

    render(
      <ResultInspector
        selectedRoute={testRoute}
        selectedObject={null}
        selectedSheet={mockSheet}
        selectedView={mockView}
        totalRoutes={329}
        totalObjects={0}
      />
    );

    // Section 1: Raw Extraction
    expect(screen.getByText(/Raw Extraction \(Immutable\)/i)).toBeInTheDocument();
    expect(screen.getByText('ROUTE-0001')).toBeInTheDocument();
    expect(screen.getByText(/HVAC_DUCT/i)).toBeInTheDocument();
    expect(screen.getByText(/SINGLE_LINE/i)).toBeInTheDocument();
    expect(screen.getByText(/FAIL_CLOSED_NO_SCALE/i)).toBeInTheDocument();

    // Section 2: Reviewed Projection
    expect(screen.getByText(/Reviewed Projection/i)).toBeInTheDocument();
    expect(screen.getAllByText('PENDING').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Event Count:')).toBeInTheDocument();
  });

  it('7. Review panel submits append-only review events and displays audit history', async () => {
    const onSubmitted = vi.fn();
    const createdEvent: ReviewEventResponse = {
      event_id: 'REV-EV-1001',
      run_id: 'RUN-20260908-135525-9A6D3D',
      project_id: 'PRJ-94318E2B1ECB',
      sequence: 1,
      target_type: 'ROUTE',
      target_id: 'ROUTE-0001',
      action: 'ACCEPT',
      comment: 'Verified in field room 202',
      created_at: '2026-09-08T15:00:00Z',
    };

    vi.mocked(apiClient.appendReviewEvent).mockResolvedValue(createdEvent);

    render(
      <ReviewPanel
        projectId="PRJ-94318E2B1ECB"
        runId="RUN-20260908-135525-9A6D3D"
        targetId="ROUTE-0001"
        targetType="ROUTE"
        onReviewSubmitted={onSubmitted}
      />
    );

    expect(screen.getByText('ROUTE-0001')).toBeInTheDocument();

    // Select REJECT action button
    const rejectBtn = screen.getByRole('button', { name: /^Reject$/i });
    fireEvent.click(rejectBtn);

    // Add comment
    const commentInput = screen.getByPlaceholderText(/Optional rationale or field observation/i);
    fireEvent.change(commentInput, { target: { value: 'Discontinuity identified at grid C-3' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Record REJECT Decision/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.appendReviewEvent).toHaveBeenCalledWith(
        'PRJ-94318E2B1ECB',
        'RUN-20260908-135525-9A6D3D',
        {
          target_type: 'ROUTE',
          target_id: 'ROUTE-0001',
          action: 'REJECT',
          comment: 'Discontinuity identified at grid C-3',
        }
      );
    });

    expect(onSubmitted).toHaveBeenCalledWith(createdEvent);
    expect(await screen.findByText(/Review Event Appended/i)).toBeInTheDocument();
    expect(screen.getAllByText('REV-EV-1001').length).toBeGreaterThanOrEqual(1);

    // Verify raw immutability statement
    expect(
      screen.getByText(/Raw extraction geometry is never modified/i)
    ).toBeInTheDocument();
  });

  it('8. Full RunViewer integration maintains synchronized selection across table and inspector', async () => {
    render(
      <MemoryRouter initialEntries={['/live/projects/PRJ-94318E2B1ECB/runs/RUN-20260908-135525-9A6D3D']}>
        <Routes>
          <Route path="/live/projects/:projectId/runs/:runId" element={<RunViewer />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for run and routes to load
    expect(await screen.findByText('PRJ-94318E2B1ECB')).toBeInTheDocument();

    // Switch to Quantities Ledger table view
    const ledgerTab = await screen.findByRole('button', { name: /Quantities Ledger/i });
    fireEvent.click(ledgerTab);

    // Click on a table row to select ROUTE-0001
    const row = await screen.findByText('ROUTE-0001');
    fireEvent.click(row);

    // Inspector should now reflect ROUTE-0001
    expect(await screen.findByText(/Canonical Route Entity/i)).toBeInTheDocument();
    // Synchronized selection: ROUTE-0001 appears in table, inspector, and review panel
    expect(screen.getAllByText('ROUTE-0001').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/Raw Extraction \(Immutable\)/i)).toBeInTheDocument();

    // Review Panel should now reflect ROUTE-0001 as target entity
    expect(screen.getByText(/Target Entity:/i)).toBeInTheDocument();
  });
});
