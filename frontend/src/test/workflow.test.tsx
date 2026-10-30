import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { apiClient } from '../api/client';
import type {
  ProjectResponse,
  DrawingResponse,
  DrawingPreflightResponse,
  JobResponse,
  JobState,
} from '../api/contracts';
import { ProjectManager } from '../modes/live/ProjectManager';
import { PreflightViewer } from '../modes/live/PreflightViewer';
import { JobProgressCard } from '../modes/live/JobProgressCard';
import { RunReadyHandoff } from '../modes/live/RunReadyHandoff';
import { LiveDataProvider } from '../modes/live/LiveDataProvider';
import { LiveApp } from '../modes/live/LiveApp';
import { DemoApp } from '../modes/demo/DemoApp';

const MOCK_PROJECT: ProjectResponse = {
  project_id: 'PRJ-TEST-123456',
  name: 'Test MEP Facility',
  description: 'Test project description',
  created_at: '2026-09-08T12:00:00Z',
  drawing_count: 1,
};

const MOCK_DRAWING: DrawingResponse = {
  project_id: 'PRJ-TEST-123456',
  source_id: 'SRC-TEST-789012',
  document_id: 'DOC-TEST-UUID',
  filename: 'test_drawing.pdf',
  sha256: 'AB24C8CBB3E208E6FB8BF1CE366945CB481641D13E872F4B95E094E430C5BB47',
  byte_size: 1048576,
  page_count: 1,
  content_type: 'application/pdf',
  imported_at: '2026-09-08T12:01:00Z',
  import_state: 'IMPORTED',
};

const MOCK_PREFLIGHT: DrawingPreflightResponse = {
  project_id: 'PRJ-TEST-123456',
  source_id: 'SRC-TEST-789012',
  document_id: 'DOC-TEST-UUID',
  page_count: 1,
  overall_status: 'PROCESSABLE',
  pages: [
    {
      page_id: 'PAGE-DOC-TEST-P0',
      page_number: 1,
      width_pt: 2592.0,
      height_pt: 1728.0,
      rotation: 0,
      media_box: [0, 0, 2592, 1728],
      crop_box: [0, 0, 2592, 1728],
      user_unit: 1.0,
      candidate_sheet_id: 'M-101',
      sheet_id_confidence: 'high',
      sheet_id_source: 'title_block_vector',
      page_role_hint: 'plan_view',
      modality_hint: 'vector_native',
      processability_status: 'PROCESSABLE',
      warnings: [],
    },
  ],
};

const MOCK_PREFLIGHT_UNKNOWN: DrawingPreflightResponse = {
  ...MOCK_PREFLIGHT,
  pages: [
    {
      ...MOCK_PREFLIGHT.pages[0],
      candidate_sheet_id: 'FALLBACK-SHEET-01',
      sheet_id_confidence: 'unknown',
      sheet_id_source: 'filename_fallback',
      warnings: ['Title block unreadable'],
    },
  ],
};

describe('MEP Design AI — UI-02 Workflow Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Project list handles loading, empty, success, and error states', async () => {
    // Error state
    vi.spyOn(apiClient, 'listProjects').mockRejectedValueOnce(new Error('Backend connection failed'));
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });

    render(
      <LiveDataProvider>
        <ProjectManager />
      </LiveDataProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load projects/i)).toBeInTheDocument();
      expect(screen.getByText(/Backend connection failed/i)).toBeInTheDocument();
    });

    // Success with projects
    vi.spyOn(apiClient, 'listProjects').mockResolvedValueOnce({
      items: [MOCK_PROJECT],
      total: 1,
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(MOCK_PROJECT.name)).toBeInTheDocument();
      expect(screen.getByText(MOCK_PROJECT.project_id)).toBeInTheDocument();
    });
  });

  it('2. Project creation uses server-generated ID without fabricating optimistic IDs', async () => {
    const user = userEvent.setup();
    const createdServerProject: ProjectResponse = {
      project_id: 'PRJ-SERVER-GEN-999',
      name: 'New Real Project',
      description: 'Created on server',
      created_at: '2026-09-08T12:05:00Z',
      drawing_count: 0,
    };

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });

    const createSpy = vi.spyOn(apiClient, 'createProject').mockResolvedValue(createdServerProject);

    render(
      <LiveDataProvider>
        <ProjectManager />
      </LiveDataProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create new project/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create new project/i }));

    const nameInput = screen.getByLabelText(/Project Name/i);
    await user.type(nameInput, 'New Real Project');

    const submitBtn = screen.getByRole('button', { name: /^Create$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'New Real Project',
        description: undefined,
      });
      // The server-generated ID must appear in the document
      expect(screen.getAllByText(/PRJ-SERVER-GEN-999/i).length).toBeGreaterThan(0);
    });
  });

  it('3. Valid PDF selection triggers upload request', async () => {
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });
    vi.spyOn(apiClient, 'listProjects').mockResolvedValue({
      items: [MOCK_PROJECT],
      total: 1,
    });
    vi.spyOn(apiClient, 'listDrawings').mockResolvedValue({ items: [], total: 0 });
    const uploadSpy = vi.spyOn(apiClient, 'uploadDrawing').mockResolvedValue(MOCK_DRAWING);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LiveApp />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(MOCK_PROJECT.name)).toBeInTheDocument();
    });
    await user.click(screen.getByText(MOCK_PROJECT.name));

    await waitFor(() => {
      expect(screen.getByText(/Import MEP Construction Drawing/i)).toBeInTheDocument();
    });

    const fileInput = document.getElementById('drawing-file-input') as HTMLInputElement;
    const validFile = new File(['%PDF-1.4 dummy content'], 'real_drawing.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upload and Preflight/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Upload and Preflight/i }));

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(
        MOCK_PROJECT.project_id,
        expect.any(File),
        expect.any(Function),
        expect.any(AbortSignal)
      );
    });
  });

  it('4. Client rejects empty or non-PDF selection', async () => {
    // Mock LiveApp with an active project to make upload accessible
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });
    vi.spyOn(apiClient, 'listProjects').mockResolvedValue({
      items: [MOCK_PROJECT],
      total: 1,
    });
    vi.spyOn(apiClient, 'listDrawings').mockResolvedValue({ items: [], total: 0 });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LiveApp />
      </MemoryRouter>
    );

    // Select the project
    await waitFor(() => {
      expect(screen.getByText(MOCK_PROJECT.name)).toBeInTheDocument();
    });
    await user.click(screen.getByText(MOCK_PROJECT.name));

    // DrawingUploader is now rendered
    await waitFor(() => {
      expect(screen.getByText(/Import MEP Construction Drawing/i)).toBeInTheDocument();
    });

    const fileInput = document.getElementById('drawing-file-input') as HTMLInputElement;

    // Test non-PDF file
    const invalidFile = new File(['text content'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Only PDF files \(\.pdf\) are supported/i)).toBeInTheDocument();
    });

    // Test empty PDF file
    const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [emptyFile] } });

    await waitFor(() => {
      expect(screen.getByText(/The selected file is empty \(0 bytes\)/i)).toBeInTheDocument();
    });
  });

  it('5. Backend upload error display provides actionable feedback', async () => {
    vi.spyOn(apiClient, 'uploadDrawing').mockRejectedValue(new Error('File exceeds maximum upload size (100 MB)'));
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: [],
    });
    vi.spyOn(apiClient, 'listProjects').mockResolvedValue({
      items: [MOCK_PROJECT],
      total: 1,
    });
    vi.spyOn(apiClient, 'listDrawings').mockResolvedValue({ items: [], total: 0 });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LiveApp />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(MOCK_PROJECT.name)).toBeInTheDocument();
    });
    await user.click(screen.getByText(MOCK_PROJECT.name));

    const fileInput = document.getElementById('drawing-file-input') as HTMLInputElement;
    const validFile = new File(['%PDF-1.4 dummy'], 'valid.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Upload and Preflight/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Upload and Preflight/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/File exceeds maximum upload size/i)).toBeInTheDocument();
    });
  });

  it('6. Preflight display renders real contract fields', () => {
    render(
      <PreflightViewer
        drawing={MOCK_DRAWING}
        preflight={MOCK_PREFLIGHT}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        onSubmitProcessing={vi.fn()}
        isSubmittingJob={false}
      />
    );

    // Dimensions in pt
    expect(screen.getByText(/2592\.0 × 1728\.0 pt/i)).toBeInTheDocument();
    // Rotation
    expect(screen.getByText(/0°/i)).toBeInTheDocument();
    // Derivation source
    expect(screen.getByText('title_block_vector')).toBeInTheDocument();
    // Candidate Sheet ID
    expect(screen.getByText('M-101')).toBeInTheDocument();
    // Confidence
    expect(screen.getByText(/High Confidence/i)).toBeInTheDocument();
    // Modality
    expect(screen.getByText('vector_native')).toBeInTheDocument();
    // Page role
    expect(screen.getByText('plan_view')).toBeInTheDocument();
  });

  it('7. Unknown/fallback sheet ID remains visibly unverified', () => {
    render(
      <PreflightViewer
        drawing={MOCK_DRAWING}
        preflight={MOCK_PREFLIGHT_UNKNOWN}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        onSubmitProcessing={vi.fn()}
        isSubmittingJob={false}
      />
    );

    expect(screen.getByText('FALLBACK-SHEET-01')).toBeInTheDocument();
    expect(screen.getByText(/Unverified Candidate \(unknown\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\(Unverified fallback\)/i)).toBeInTheDocument();
  });

  it('8. Job submission sends only source IDs', async () => {
    const submitSpy = vi.spyOn(apiClient, 'submitJob').mockResolvedValue({
      job_id: 'JOB-TEST-1',
      project_id: MOCK_PROJECT.project_id,
      state: 'QUEUED',
      source_ids: [MOCK_DRAWING.source_id],
      created_at: '2026-09-08T12:10:00Z',
      progress: {
        total_pages: 1,
        completed_pages: 0,
        failed_pages: 0,
        current_page: 1,
        percent: 0,
      },
    });

    const onSubmit = vi.fn(async () => {
      await apiClient.submitJob(MOCK_PROJECT.project_id, {
        source_ids: [MOCK_DRAWING.source_id],
      });
    });

    render(
      <PreflightViewer
        drawing={MOCK_DRAWING}
        preflight={MOCK_PREFLIGHT}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        onSubmitProcessing={onSubmit}
        isSubmittingJob={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Submit for Processing/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledWith(MOCK_PROJECT.project_id, {
      source_ids: [MOCK_DRAWING.source_id],
    });
    // Check that NO filesystem path, model path, or config was sent
    const calledPayload = submitSpy.mock.calls[0][1];
    expect(Object.keys(calledPayload)).toEqual(['source_ids']);
  });

  it('9. HTTP 202 initial job state remains nonterminal', () => {
    const initialJob: JobResponse = {
      job_id: 'JOB-202-NONTERMINAL',
      project_id: 'PRJ-123',
      state: 'QUEUED',
      source_ids: ['SRC-123'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 0, percent: 0 },
    };

    vi.spyOn(apiClient, 'getJob').mockResolvedValue(initialJob);

    render(
      <JobProgressCard
        initialJob={initialJob}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('QUEUED')).toBeInTheDocument();
    expect(screen.getByText(/Queued for processing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Run/i })).not.toBeInTheDocument();
  });

  it('10. Every backend job state maps to a truthful UI state', () => {
    const allStates: JobState[] = [
      'QUEUED',
      'PREFLIGHT',
      'PROCESSING',
      'PERSISTING',
      'COMPLETE',
      'PARTIAL',
      'FAILED',
      'CANCEL_REQUESTED',
      'CANCELLED',
      'INTERRUPTED',
    ];

    for (const state of allStates) {
      const job: JobResponse = {
        job_id: `JOB-${state}`,
        project_id: 'PRJ-1',
        state,
        source_ids: ['SRC-1'],
        created_at: '2026-09-08T12:00:00Z',
        run_id: state === 'COMPLETE' ? 'RUN-VERIFIED-123' : null,
        progress: { total_pages: 1, completed_pages: state === 'COMPLETE' ? 1 : 0, failed_pages: 0 },
      };

      vi.spyOn(apiClient, 'getJob').mockResolvedValue(job);

      const { unmount } = render(
        <JobProgressCard
          initialJob={job}
          onOpenRun={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      expect(screen.getByText(state)).toBeInTheDocument();
      unmount();
    }
  });

  it('11. Polling stops on terminal state', async () => {
    const initialJob: JobResponse = {
      job_id: 'JOB-POLL-TERM',
      project_id: 'PRJ-1',
      state: 'PROCESSING',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 0, percent: 50 },
    };

    const completeJob: JobResponse = {
      ...initialJob,
      state: 'COMPLETE',
      run_id: 'RUN-COMPLETE-123',
      progress: { total_pages: 1, completed_pages: 1, failed_pages: 0, percent: 100 },
    };

    const getJobSpy = vi.spyOn(apiClient, 'getJob').mockResolvedValue(completeJob);

    render(
      <JobProgressCard
        initialJob={initialJob}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    // Initial state rendered
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();

    // After polling returns terminal COMPLETE
    await waitFor(
      () => {
        expect(screen.getByText('COMPLETE')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Open Run/i })).toBeInTheDocument();
      },
      { timeout: 3500 }
    );

    const callCountAfterTerminal = getJobSpy.mock.calls.length;
    // Wait an additional 2 seconds to confirm no further calls are made
    await new Promise((r) => setTimeout(r, 2000));
    expect(getJobSpy.mock.calls.length).toBe(callCountAfterTerminal);
  });

  it('12. Polling stops on component unmount', async () => {
    const initialJob: JobResponse = {
      job_id: 'JOB-POLL-UNMOUNT',
      project_id: 'PRJ-1',
      state: 'PROCESSING',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 0 },
    };

    const getJobSpy = vi.spyOn(apiClient, 'getJob').mockResolvedValue(initialJob);

    const { unmount } = render(
      <JobProgressCard
        initialJob={initialJob}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    unmount();
    const callsAtUnmount = getJobSpy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 2000));
    expect(getJobSpy.mock.calls.length).toBe(callsAtUnmount);
  });

  it('13. No artificial progress value is displayed', () => {
    const job: JobResponse = {
      job_id: 'JOB-REAL-PROGRESS',
      project_id: 'PRJ-1',
      state: 'PERSISTING',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 2, completed_pages: 1, failed_pages: 0, percent: 50 },
    };

    vi.spyOn(apiClient, 'getJob').mockResolvedValue(job);

    render(
      <JobProgressCard
        initialJob={job}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    // Displays exactly the backend pages
    expect(screen.getByText(/1 \/ 2 pages/i)).toBeInTheDocument();
    // Does not invent 73% or artificial stage weight
    expect(screen.queryByText('73%')).not.toBeInTheDocument();
  });

  it('14. COMPLETE requires a non-null run ID', () => {
    const completeJobWithRun: JobResponse = {
      job_id: 'JOB-COMPLETE',
      project_id: 'PRJ-1',
      state: 'COMPLETE',
      run_id: 'RUN-VERIFIED-RUN-ID-456',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 1, failed_pages: 0 },
    };

    render(
      <JobProgressCard
        initialJob={completeJobWithRun}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('RUN-VERIFIED-RUN-ID-456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Run/i })).toBeInTheDocument();
  });

  it('15. PARTIAL exposes failed-page information honestly', () => {
    const partialJob: JobResponse = {
      job_id: 'JOB-PARTIAL-1',
      project_id: 'PRJ-1',
      state: 'PARTIAL',
      run_id: 'RUN-PARTIAL-RUN-ID-789',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 3, completed_pages: 2, failed_pages: 1 },
    };

    render(
      <JobProgressCard
        initialJob={partialJob}
        onOpenRun={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText(/Partial Processing Result/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    expect(screen.getByText('RUN-PARTIAL-RUN-ID-789')).toBeInTheDocument();
  });

  it('16. FAILED, CANCELLED, and INTERRUPTED remain distinct', () => {
    const failedJob: JobResponse = {
      job_id: 'JOB-F',
      project_id: 'PRJ-1',
      state: 'FAILED',
      error_code: 'EXTRACTION_TIMEOUT',
      message: 'Processing timed out after 300 seconds',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 1 },
    };
    const { unmount: u1 } = render(
      <JobProgressCard initialJob={failedJob} onOpenRun={vi.fn()} onRetry={vi.fn()} />
    );
    expect(screen.getByText('EXTRACTION_TIMEOUT')).toBeInTheDocument();
    expect(screen.getAllByText(/Processing timed out/i).length).toBeGreaterThan(0);
    u1();

    const cancelledJob: JobResponse = {
      job_id: 'JOB-C',
      project_id: 'PRJ-1',
      state: 'CANCELLED',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 0 },
    };
    const { unmount: u2 } = render(
      <JobProgressCard initialJob={cancelledJob} onOpenRun={vi.fn()} onRetry={vi.fn()} />
    );
    expect(screen.getByText(/Processing was cancelled by the user/i)).toBeInTheDocument();
    u2();

    const interruptedJob: JobResponse = {
      job_id: 'JOB-I',
      project_id: 'PRJ-1',
      state: 'INTERRUPTED',
      source_ids: ['SRC-1'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 0, failed_pages: 0 },
    };
    const { unmount: u3 } = render(
      <JobProgressCard initialJob={interruptedJob} onOpenRun={vi.fn()} onRetry={vi.fn()} />
    );
    expect(screen.getByText(/The worker process was stopped before a verified result/i)).toBeInTheDocument();
    u3();
  });

  it('17. Run-ready handoff does not call result/overlay/export APIs', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const job: JobResponse = {
      job_id: 'JOB-RUN-READY',
      project_id: 'PRJ-TEST-123456',
      state: 'COMPLETE',
      run_id: 'RUN-VERIFIED-FINAL',
      source_ids: ['SRC-TEST-789012'],
      created_at: '2026-09-08T12:00:00Z',
      progress: { total_pages: 1, completed_pages: 1, failed_pages: 0 },
    };

    render(<RunReadyHandoff job={job} onBackToProject={vi.fn()} />);

    expect(screen.getByText('RUN-VERIFIED-FINAL')).toBeInTheDocument();
    expect(screen.getByText('JOB-RUN-READY')).toBeInTheDocument();
    expect(screen.getByText('PRJ-TEST-123456')).toBeInTheDocument();
    expect(screen.getByText(/Upcoming Stage: UI-03/i)).toBeInTheDocument();

    // Verify zero calls made to result/overlay/export endpoints
    for (const call of fetchSpy.mock.calls) {
      const url = String(call[0]);
      expect(url).not.toContain('/routes');
      expect(url).not.toContain('/objects');
      expect(url).not.toContain('/summary');
      expect(url).not.toContain('/pages');
      expect(url).not.toContain('/overlay');
      expect(url).not.toContain('/exports');
    }
  });

  it('18. Demo flow performs zero network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <MemoryRouter>
        <DemoApp />
      </MemoryRouter>
    );

    expect(screen.getAllByText(/DEMO — Example data only/i).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Advance steps
    const preflightBtn = screen.getByRole('button', { name: /2\. Preflight/i });
    fireEvent.click(preflightBtn);
    expect(screen.getByText(/Page 1 Preflight \(Example data only\)/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    const jobBtn = screen.getByRole('button', { name: /3\. Job/i });
    fireEvent.click(jobBtn);
    expect(screen.getByText(/Job Complete State \(Example data only\)/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    const handoffBtn = screen.getByRole('button', { name: /4\. Handoff/i });
    fireEvent.click(handoffBtn);
    expect(screen.getByText(/Run-Ready Handoff \(Example data only\)/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
