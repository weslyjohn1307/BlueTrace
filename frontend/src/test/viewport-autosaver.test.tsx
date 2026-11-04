import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { apiClient } from '../api/client';
import { SheetCanvas } from '../workspace/components/SheetCanvas';
import { TakeoffWorkspace } from '../workspace/TakeoffWorkspace';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      saveProjectSession: vi.fn(),
      segmentConcept: vi.fn(),
    },
  };
});

// Production-composition seam: the workspace reads this hook, so swapping the
// hook state swaps the sheet/restore payload the canvas receives.
const workspaceHook = vi.hoisted(() => ({
  state: null as unknown,
  selectSheet: vi.fn(),
}));

vi.mock('../workspace/hooks/useTakeoffSession', () => ({
  useTakeoffSession: () => ({
    state: workspaceHook.state,
    checkBackend: vi.fn(),
    selectFile: vi.fn(),
    openFixture: vi.fn(),
    selectSheet: workspaceHook.selectSheet,
    setItemStatus: vi.fn(),
    reset: vi.fn(),
    refreshLedger: vi.fn(),
  }),
  ACTIVE_PROJECT_SLOT: 'bluetrace_active_project',
}));

function readyWorkspaceState(pdfPath: string, initialTransform: unknown) {
  return {
    stage: 'ready',
    projectName: 'sess_proj',
    sheets: [
      {
        pdfPath,
        fileName: 'plan.pdf',
        pageIndex: 0,
        meta: {
          sheet_id: 'sheet_m101',
          page_index: 0,
          sheet_number: 'M-101',
          sheet_title: 'HVAC Plan 101',
          discipline: 'MECHANICAL',
          scale_raw: '1/4" = 1\'-0"',
          scale_ratio: 48.0,
          scale_status: 'VERIFIED',
          width_pt: 3024.0,
          height_pt: 2160.0,
          dpi: 150,
        },
      },
    ],
    activeSheetId: 'sheet_m101',
    items: [],
    summary: [],
    itemsLoading: false,
    backendOnline: true,
    aiConfigured: false,
    error: null,
    initialTransform,
  };
}

const mocked = vi.mocked(apiClient);

describe('SheetCanvas viewport autosaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocked.saveProjectSession.mockResolvedValue({ session: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function primeLoadedImage(container: HTMLElement) {
    const img = container.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 6300 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 4500 });
    Object.defineProperty(img, 'complete', { configurable: true, value: true });
    fireEvent.load(img);
    return img;
  }

  function renderCanvas() {
    return render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
        projectId="sess_proj"
      />
    );
  }

  it('uses plain loading status while the page image is fetched', () => {
    renderCanvas();

    expect(screen.getByTestId('sheet-preview-loading')).toHaveTextContent('Loading drawing page…');
    expect(screen.queryByText(/ZERO OCR DRIFT|RASTERIZING_VECTOR_LAYERS|laser scan/i)).toBeNull();
  });

  it('never saves on mount or fit init', () => {
    const { container } = renderCanvas();
    primeLoadedImage(container);
    vi.advanceTimersByTime(1000);
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();
  });

  it('collapses 10 rapid pans into exactly 1 PUT with the final coordinates', () => {
    const { container } = renderCanvas();
    primeLoadedImage(container);
    vi.advanceTimersByTime(1000);
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();

    const zoomIn = screen.getByTitle('Zoom In [+]');
    for (let i = 0; i < 10; i++) {
      fireEvent.click(zoomIn);
    }
    // Still debouncing: nothing may fire mid-burst.
    vi.advanceTimersByTime(299);
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();

    // Idle settles → exactly one PUT carrying the final transform.
    vi.advanceTimersByTime(1);
    expect(mocked.saveProjectSession).toHaveBeenCalledTimes(1);
    const [projectId, payload] = mocked.saveProjectSession.mock.calls[0] as [
      string,
      { viewport_scale: number; viewport_tx: number; viewport_ty: number },
    ];
    expect(projectId).toBe('sess_proj');
    expect(payload.viewport_scale).toBeCloseTo(Math.pow(1.25, 10), 5);
    expect(Number.isFinite(payload.viewport_tx)).toBe(true);
    expect(Number.isFinite(payload.viewport_ty)).toBe(true);

    // A second idle window without interaction fires nothing further.
    vi.advanceTimersByTime(1000);
    expect(mocked.saveProjectSession).toHaveBeenCalledTimes(1);
  });
});

describe('SheetCanvas restored session viewport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocked.saveProjectSession.mockResolvedValue({ session: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderCanvasWithRestore(
    initialTransform: { scale: number; translationX: number; translationY: number; mode: 'manual' } | null,
    onViewportSave: (viewport: { viewport_scale: number; viewport_tx: number; viewport_ty: number }) => void
  ) {
    return render(
      <SheetCanvas
        imageUrl="/api/page-image?x=restore"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
        projectId="sess_proj"
        onViewportSave={onViewportSave}
        initialTransform={initialTransform}
      />
    );
  }

  function primeCanvasImage(container: HTMLElement) {
    const img = container.querySelector('[data-testid="sheet-canvas"] img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 6300 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 4500 });
    Object.defineProperty(img, 'complete', { configurable: true, value: true });
    fireEvent.load(img);
    return img;
  }

  it('applies the restored transform on mount without a PUT', () => {
    const onSave = vi.fn();
    const { container } = renderCanvasWithRestore(
      { scale: 1.45, translationX: 240, translationY: -120, mode: 'manual' },
      onSave
    );
    primeCanvasImage(container);
    vi.advanceTimersByTime(1000);

    // The restore itself never echoes a PUT through either sink.
    expect(onSave).not.toHaveBeenCalled();
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();
    // But the restored zoom is visibly applied in the HUD.
    expect(screen.getByText('145%')).toBeTruthy();
  });

  it('falls back to fit for an invalid restored transform without a PUT', () => {
    const onSave = vi.fn();
    const { container } = renderCanvasWithRestore(
      // viewport_scale 0 is degenerate: fail closed to fit.
      { scale: 0, translationX: 240, translationY: -120, mode: 'manual' },
      onSave
    );
    primeCanvasImage(container);
    vi.advanceTimersByTime(1000);

    expect(onSave).not.toHaveBeenCalled();
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();
    // Fit (not manual) zoom is applied.
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('flushes the pending autosave on unmount with exactly one final call', () => {
    const onSave = vi.fn();
    const { container, unmount } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=flush"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
        projectId="sess_proj"
        onViewportSave={onSave}
      />
    );
    primeCanvasImage(container);
    vi.advanceTimersByTime(1000);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Zoom In [+]'));
    // Still debouncing: nothing may fire mid-window.
    expect(onSave).not.toHaveBeenCalled();

    // Unmount flushes the final coordinates instead of dropping them.
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as {
      viewport_scale: number;
      viewport_tx: number;
      viewport_ty: number;
    };
    expect(payload.viewport_scale).toBeCloseTo(1.25, 5);

    // The timer was consumed by the flush: advancing fires nothing more.
    vi.advanceTimersByTime(1000);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('TakeoffWorkspace session wiring (production composition)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocked.saveProjectSession.mockResolvedValue({ session: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderWorkspace() {
    return render(
      <MemoryRouter>
        <TakeoffWorkspace />
      </MemoryRouter>
    );
  }

  function primeWorkspaceCanvas(container: HTMLElement) {
    const img = container.querySelector('[data-testid="sheet-canvas"] img') as HTMLImageElement | null;
    if (!img) throw new Error('expected the workspace to render a SheetCanvas image');
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 6300 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 4500 });
    Object.defineProperty(img, 'complete', { configurable: true, value: true });
    fireEvent.load(img);
  }

  it('keeps the CAD viewport bounded when the takeoff ledger contains many rows', () => {
    workspaceHook.state = readyWorkspaceState('data/uploads/plan.pdf', null);
    const { container } = renderWorkspace();

    expect(container.firstElementChild).toHaveClass('h-screen', 'min-h-0', 'overflow-hidden');
  });

  it('shows a human-readable package progress state before the first sheet is ready', () => {
    workspaceHook.state = {
      ...readyWorkspaceState('data/uploads/plan.pdf', null),
      stage: 'orchestrating',
      sheets: [],
      activeSheetId: null,
      agentProgress: {
        jobId: 'job-1',
        totalPages: 25,
        classifiedPages: 0,
        currentAgent: 'agent_00_orchestrator',
        currentMessage: 'Starting sheet classification',
        detections: 0,
        reviewFlags: 0,
      },
    };
    renderWorkspace();

    expect(screen.getByTestId('package-processing-state')).toBeInTheDocument();
    expect(screen.getByText('Sheet Auditor')).toBeInTheDocument();
    expect(screen.queryByText('agent_00_orchestrator')).not.toBeInTheDocument();
  });

  it('passes projectId + onViewportSave + initialTransform into the canvas', () => {
    workspaceHook.state = readyWorkspaceState('data/uploads/plan.pdf', {
      scale: 1.45,
      translationX: 240,
      translationY: -120,
      mode: 'manual',
    });
    const { container } = renderWorkspace();
    primeWorkspaceCanvas(container);
    vi.advanceTimersByTime(1000);

    // Restore applied with no PUT on mount (BLOCKER1/BLOCKER2 wired).
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();
    expect(screen.getByText('145%')).toBeTruthy();

    // A settled manual zoom flows to the session PUT with the workspace project id.
    fireEvent.click(screen.getByTitle('Zoom In [+]'));
    vi.advanceTimersByTime(299);
    expect(mocked.saveProjectSession).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocked.saveProjectSession).toHaveBeenCalledTimes(1);
    const [projectId, payload] = mocked.saveProjectSession.mock.calls[0] as [
      string,
      { viewport_scale: number; viewport_tx: number; viewport_ty: number },
    ];
    expect(projectId).toBe('sess_proj');
    expect(payload.viewport_scale).toBeCloseTo(1.45 * 1.25, 5);
  });

  it("renders the re-open empty state when the restored sheet has no pdf path", () => {
    workspaceHook.state = readyWorkspaceState('', {
      scale: 1.45,
      translationX: 240,
      translationY: -120,
      mode: 'manual',
    });
    const { container } = renderWorkspace();

    // Honest empty state instead of a broken image request (BLOCKER3).
    expect(
      screen.getByText('Reopen the PDF to restore the drawing.')
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="sheet-canvas"]')).toBeNull();
  });

  it('toggles the sheets panel between tree (default) and filmstrip navigator', () => {
    // This composition check covers the wide workstation layout. Narrow
    // viewports start with panels collapsed into drawers to preserve the canvas.
    window.innerWidth = 1440;
    workspaceHook.state = readyWorkspaceState('data/uploads/plan.pdf', null);
    renderWorkspace();

    // Tree is the default view: the directory filter input is present.
    expect(screen.getByLabelText('Filter sheets')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-navigator')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tree' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Filmstrip' }));
    expect(screen.getByTestId('sheet-navigator')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter sheets')).toBeNull();
    expect(screen.getByRole('button', { name: 'Filmstrip' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Selecting a thumbnail routes through the session's selectSheet.
    fireEvent.click(screen.getAllByTestId('thumbnail-card')[0]);
    expect(workspaceHook.selectSheet).toHaveBeenCalledWith('sheet_m101');

    // Tree mode is still reachable and restores the directory.
    fireEvent.click(screen.getByRole('button', { name: 'Tree' }));
    expect(screen.getByLabelText('Filter sheets')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet-navigator')).toBeNull();
  });
});
