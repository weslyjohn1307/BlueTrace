import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SheetCanvas } from '../workspace/components/SheetCanvas';

describe('SheetCanvas hover-to-crop', () => {
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realToDataURL = HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' })),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: vi.fn(() => 'data:image/png;base64,CROPBYTES'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: realGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: realToDataURL,
    });
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

  it('renders the sheet image and coordinate readout', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={true}
        onCropRequest={() => {}}
      />
    );
    expect(screen.getByTestId('sheet-canvas')).toBeInTheDocument();
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/page-image?x=1');
  });

  it('fires a 150pt-window crop after hovering still', () => {
    const onCropRequest = vi.fn();
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={true}
        onCropRequest={onCropRequest}
      />
    );
    primeLoadedImage(container);
    const canvas = screen.getByTestId('sheet-canvas');

    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 90 });
    expect(onCropRequest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);

    expect(onCropRequest).toHaveBeenCalledTimes(1);
    const [cursorPt, base64] = onCropRequest.mock.calls[0] as [[number, number], string];
    expect(base64).toBe('CROPBYTES');
    expect(cursorPt[0]).toBeGreaterThanOrEqual(0);
    expect(cursorPt[1]).toBeGreaterThanOrEqual(0);
  });

  it('renders vector runs in system colors with airflow animation', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        vectorRuns={[
          { id: 'r1', points: [[10, 10], [200, 10]], system: 'Supply Air', status: 'ACCEPTED' },
          { id: 'r2', points: [[10, 40], [200, 40]], system: 'Return Air', status: 'SUGGESTED' },
          { id: 'r3', points: [[10, 70], [200, 70]], system: 'Exhaust Air', status: 'SUGGESTED' },
        ]}
        cropEnabled={false}
        onCropRequest={() => {}}
      />
    );
    const runs = container.querySelectorAll('[data-testid="vector-run"]');
    expect(runs).toHaveLength(3);
    expect(runs[0].getAttribute('stroke')).toBe('#0099ff');
    expect(runs[1].getAttribute('stroke')).toBe('#10b981');
    expect(runs[2].getAttribute('stroke')).toBe('#f59e0b');
    expect(runs[0].getAttribute('class')).toContain('animate-duct-flow');
  });

  it('renders pins as labeled markers', () => {
    render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[{ id: 'ghost-VAV-1', x: 500, y: 600, kind: 'ghost', label: 'VAV-1' }]}
        cropEnabled={false}
        onCropRequest={() => {}}
      />
    );
    expect(screen.getByText('VAV-1')).toBeInTheDocument();
  });
});
