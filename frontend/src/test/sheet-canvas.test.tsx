import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SheetCanvas, snapCalibrationPoint } from '../workspace/components/SheetCanvas';

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

describe('SheetCanvas calibrate_state_machine', () => {
  function primeLoadedImage(container: HTMLElement) {
    const img = container.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 6300 });
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 4500 });
    Object.defineProperty(img, 'complete', { configurable: true, value: true });
    fireEvent.load(img);
    return img;
  }

  it('walks IDLE -> AWAITING_P1 -> AWAITING_P2 -> INPUT_MODAL_OPEN and Escape cancels', () => {
    const onSelected = vi.fn();
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
        onCalibrationPointsSelected={onSelected}
      />
    );
    primeLoadedImage(container);
    const canvas = screen.getByTestId('sheet-canvas');

    // Enter calibrate mode via toolbar button.
    fireEvent.click(screen.getByTitle('Scale Calibration Ruler [C]'));
    expect(screen.getByTestId('calibrate-status')).toHaveTextContent('click first point');

    // First canvas click locks P1 -> AWAITING_P2 with rubberband.
    fireEvent.mouseDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    expect(screen.getByTestId('calibrate-status')).toHaveTextContent('click second point');

    // Mouse move arms the rubberband preview.
    fireEvent.mouseMove(canvas, { clientX: 200, clientY: 120 });
    expect(container.querySelector('[data-testid="calibration-rubberband"]')).toBeInTheDocument();

    // Second click locks P2 -> INPUT_MODAL_OPEN + callback.
    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 120 });
    expect(screen.getByTestId('calibrate-status')).toHaveTextContent('real-world distance');
    expect(screen.getByTestId('calibration-input-modal')).toBeInTheDocument();
    expect(onSelected).toHaveBeenCalledTimes(1);
    expect(onSelected.mock.calls[0][0]).toHaveLength(2);
    expect(onSelected.mock.calls[0][1]).toHaveLength(2);

    // Escape cancels back to a ready calibrate state.
    fireEvent.keyDown(canvas, { key: 'Escape' });
    expect(screen.getByTestId('calibrate-status')).toHaveTextContent('ready');
  });

  it('snaps calibration angles to 0/45/90deg while Shift is held', () => {
    const p1 = { x: 0, y: 0 };
    // No shift: passthrough.
    expect(snapCalibrationPoint(p1, { x: 10, y: 3 }, false)).toEqual({ x: 10, y: 3 });
    // Shift: near-horizontal snaps flat.
    const h = snapCalibrationPoint(p1, { x: 10, y: 1 }, true);
    expect(h.y).toBeCloseTo(0, 5);
    expect(h.x).toBeCloseTo(Math.hypot(10, 1), 5);
    // Shift: diagonal snaps to 45 deg.
    const d = snapCalibrationPoint(p1, { x: 10, y: 9 }, true);
    expect(Math.abs(d.x - d.y)).toBeLessThan(1e-6);
  });
});

describe('SheetCanvas calibration_overlay', () => {
  it('renders the amber ruler overlay with dimension text and emerald calibrated badge', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
        scaleStatus="CALIBRATED"
        calibrationResult={{
          p1: [10, 20],
          p2: [110, 20],
          lengthPt: 100,
          scaleRatio: 48,
          scaleRaw: '1/4" = 1\'-0"',
        }}
      />
    );
    const overlay = container.querySelector('[data-testid="calibration-overlay"]');
    expect(overlay).toBeInTheDocument();
    expect(overlay?.querySelector('line')?.getAttribute('stroke')).toBe('#f59e0b');
    expect(overlay?.querySelector('line')?.getAttribute('stroke-dasharray')).toContain('8');
    expect(overlay?.textContent).toContain('1/4');
    const badge = screen.getByTestId('calibrated-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('CALIBRATED');
  });

  it('hides the overlay and badge before calibration', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[]}
        cropEnabled={false}
        onCropRequest={() => {}}
      />
    );
    expect(container.querySelector('[data-testid="calibration-overlay"]')).toBeNull();
    expect(container.querySelector('[data-testid="calibrated-badge"]')).toBeNull();
  });
});
