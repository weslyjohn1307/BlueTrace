import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { apiClient } from '../api/client';
import { useTakeoffSession, type ScannedSheet } from '../workspace/hooks/useTakeoffSession';
import { SheetNavigator } from '../workspace/components/SheetNavigator';

vi.mock('../api/client', () => ({
  apiClient: {
    getHealth: vi.fn(),
    uploadDrawing: vi.fn(),
    scanSheet: vi.fn(),
    scanAllSheets: vi.fn(),
    getPageImageUrl: vi.fn(
      (pdfPath: string, pageIndex = 0, dpi = 150) =>
        `/api/page-image?pdf=${encodeURIComponent(pdfPath)}&p=${pageIndex}&d=${dpi}`
    ),
    getThumbnailUrl: vi.fn(
      (projectId: string, pageIndex = 0) =>
        `/api/thumbnails/${encodeURIComponent(projectId)}/p${pageIndex}.webp`
    ),
    listTakeoffItems: vi.fn(),
    getTakeoffSummary: vi.fn(),
    updateTakeoffStatus: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const mocked = vi.mocked(apiClient);

function makeSheet(i: number, discipline = 'MECHANICAL'): ScannedSheet {
  const verified = i % 2 === 0;
  return {
    pdfPath: 'data/uploads/set.pdf',
    fileName: 'set.pdf',
    pageIndex: i,
    meta: {
      sheet_id: `sheet_${i}`,
      page_index: i,
      sheet_number: `M-10${i}`,
      sheet_title: `Plan ${i}`,
      discipline,
      scale_raw: verified ? '1/8" = 1\'-0"' : null,
      scale_ratio: verified ? 96.0 : null,
      scale_status: verified ? 'VERIFIED' : 'UNVERIFIED',
      width_pt: 612,
      height_pt: 792,
      dpi: 150,
    },
  };
}

describe('SheetNavigator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getHealth.mockResolvedValue({ status: 'online', meta_model_api_configured: false } as never);
    mocked.listTakeoffItems.mockResolvedValue([]);
    mocked.getTakeoffSummary.mockResolvedValue([]);
  });

  it('mounts a bounded window of ~8 cards out of a large set', () => {
    const sheets = Array.from({ length: 20 }, (_, i) => makeSheet(i));
    render(
      <SheetNavigator sheets={sheets} activeSheetId="sheet_0" onSelectSheet={() => {}} />
    );
    expect(screen.getAllByTestId('thumbnail-card')).toHaveLength(8);
    expect(screen.getByText('1–8 of 20')).toBeInTheDocument();
  });

  it('renders discipline and scale badges, marking unverified sheets review-required', () => {
    const sheets = [makeSheet(0), { ...makeSheet(1), meta: { ...makeSheet(1).meta, discipline: 'PLUMBING' } }];
    render(
      <SheetNavigator sheets={sheets} activeSheetId="sheet_0" onSelectSheet={() => {}} />
    );
    expect(screen.getByText('MECHANICAL')).toBeInTheDocument();
    expect(screen.getByText('PLUMBING')).toBeInTheDocument();
    expect(screen.getByText('Review Required')).toBeInTheDocument();
    expect(screen.getByText('1/8" = 1\'-0"')).toBeInTheDocument();
  });

  it('marks the active card and notifies on click', () => {
    const sheets = [makeSheet(0), makeSheet(1)];
    const onSelectSheet = vi.fn();
    render(
      <SheetNavigator sheets={sheets} activeSheetId="sheet_1" onSelectSheet={onSelectSheet} />
    );
    const cards = screen.getAllByTestId('thumbnail-card');
    expect(cards[1]).toHaveAttribute('aria-current', 'true');
    expect(cards[0]).not.toHaveAttribute('aria-current');
    fireEvent.click(cards[0]);
    expect(onSelectSheet).toHaveBeenCalledTimes(1);
    expect(onSelectSheet).toHaveBeenCalledWith('sheet_0');
  });

  it('exposes 40px pager targets with a visible focus ring', () => {
    const sheets = Array.from({ length: 20 }, (_, i) => makeSheet(i));
    // No active sheet: the window follows the pager instead of re-centering.
    render(<SheetNavigator sheets={sheets} activeSheetId={null} onSelectSheet={() => {}} />);

    const prev = screen.getByRole('button', { name: 'Previous sheets' });
    const next = screen.getByRole('button', { name: 'Next sheets' });
    for (const button of [prev, next]) {
      // WCAG 2.2 target size: 40px minimum hit area, explicitly focusable.
      expect(button.className).toContain('min-w-10');
      expect(button.className).toContain('min-h-10');
      expect(button.className).toContain('focus-visible:ring-2');
      expect(button.className).toContain('inline-flex');
    }

    fireEvent.click(next);
    expect(screen.getByText('9–16 of 20')).toBeInTheDocument();
    fireEvent.click(prev);
    expect(screen.getByText('1–8 of 20')).toBeInTheDocument();
  });

  it('click sets activeSheetId through useTakeoffSession.selectSheet', async () => {
    const sheets = [makeSheet(0), makeSheet(1)];
    mocked.scanAllSheets.mockResolvedValue({
      pdf_path: 'data/uploads/set.pdf',
      project_id: 'set',
      total_pages: 2,
      sheets: sheets.map((s) => s.meta),
      takeoff: [],
      errors: [],
    } as never);

    const { result } = renderHook(() => useTakeoffSession());
    await act(async () => {
      await result.current.openFixture('data/uploads/set.pdf');
    });
    expect(result.current.state.sheets).toHaveLength(2);

    render(
      <SheetNavigator
        sheets={result.current.state.sheets}
        activeSheetId={result.current.state.activeSheetId}
        onSelectSheet={result.current.selectSheet}
      />
    );
    const cards = screen.getAllByTestId('thumbnail-card');
    act(() => {
      fireEvent.click(cards[1]);
    });
    expect(result.current.state.activeSheetId).toBe('sheet_1');
  });

  it('uses cached thumbnail URLs with page-image fallback when projectId is provided', () => {
    const sheets = [makeSheet(0), makeSheet(1)];
    render(
      <SheetNavigator
        sheets={sheets}
        activeSheetId="sheet_0"
        onSelectSheet={() => {}}
        projectId="set"
      />
    );
    const images = screen.getAllByAltText('Thumbnail of M-100');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/api/thumbnails/set/p0.webp');

    // A broken cached thumbnail falls back to the live page-image renderer…
    fireEvent.error(images[0]);
    expect(images[0].getAttribute('src')).toContain('/api/page-image?');

    // …and a second failure hides the img behind the sheet-number placeholder.
    fireEvent.error(images[0]);
    expect(screen.getByTestId('thumbnail-fallback')).toHaveTextContent('M-100');
    expect(screen.getByTestId('thumbnail-fallback')).toHaveTextContent('Preview unavailable');
  });

  it('keeps page-image URLs when no projectId is provided', () => {
    const sheets = [makeSheet(0)];
    render(
      <SheetNavigator sheets={sheets} activeSheetId="sheet_0" onSelectSheet={() => {}} />
    );
    const img = screen.getByAltText('Thumbnail of M-100');
    expect(img.getAttribute('src')).toContain('/api/page-image?');

    // With no fallback configured, one error goes straight to the placeholder.
    fireEvent.error(img);
    expect(screen.getByTestId('thumbnail-fallback')).toHaveTextContent('M-100');
  });

  it('shows a loading skeleton until the thumbnail loads', () => {
    const sheets = [makeSheet(0)];
    render(
      <SheetNavigator sheets={sheets} activeSheetId="sheet_0" onSelectSheet={() => {}} />
    );
    expect(screen.getByTestId('thumbnail-skeleton')).toBeInTheDocument();
    fireEvent.load(screen.getByAltText('Thumbnail of M-100'));
    expect(screen.queryByTestId('thumbnail-skeleton')).not.toBeInTheDocument();
  });
});
