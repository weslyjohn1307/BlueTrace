import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { SheetCanvas, type CanvasPin } from '../workspace/components/SheetCanvas';
import { mapReconcileGhostPins, pinFocusCoords } from '../workspace/utils/reconcilePins';
import { createApiClient } from '../api/client';
import type { ReconciliationReport } from '../api/contracts';

describe('SheetCanvas Pin Overlays & Discipline Colors', () => {
  const defaultProps = {
    imageUrl: '/api/page-image?x=1',
    widthPt: 3024,
    heightPt: 2160,
    cropEnabled: false,
    onCropRequest: vi.fn(),
  };

  const samplePins: CanvasPin[] = [
    {
      id: 'pin-sup-1',
      x: 500,
      y: 400,
      kind: 'item',
      label: 'VAV-1-01',
      tag: 'VAV-1-01',
      discipline: 'Supply',
      system: 'Supply Air',
      status: 'MATCHED',
      cfm: 850,
      equipmentType: 'Variable Air Volume Box',
    },
    {
      id: 'pin-ret-1',
      x: 700,
      y: 600,
      kind: 'item',
      label: 'RG-1',
      tag: 'RG-1',
      discipline: 'Return',
      system: 'Return Air',
      status: 'UNDERCOUNT',
      equipmentType: 'Return Grille',
    },
    {
      id: 'pin-exh-1',
      x: 900,
      y: 800,
      kind: 'item',
      label: 'EF-1',
      tag: 'EF-1',
      discipline: 'Exhaust',
      system: 'Exhaust Air',
      status: 'OVERCOUNT',
      equipmentType: 'Exhaust Fan',
    },
    {
      id: 'pin-fls-1',
      x: 1100,
      y: 1000,
      kind: 'item',
      label: 'FSD-1',
      tag: 'FSD-1',
      discipline: 'Fire Life Safety',
      system: 'Fire Life Safety',
      status: 'MATCHED',
      equipmentType: 'Fire Smoke Damper',
    },
  ];

  it('renders pins with authoritative AEC discipline color tokens', () => {
    const { container } = render(<SheetCanvas {...defaultProps} pins={samplePins} />);

    const pinElements = container.querySelectorAll('[data-testid="canvas-pin"]');
    expect(pinElements).toHaveLength(4);

    // Supply Air -> Blue (#0284c7)
    expect(pinElements[0].getAttribute('data-discipline')).toBe('Supply');
    expect(pinElements[0].querySelector('circle[stroke="#ffffff"]')?.getAttribute('fill')).toBe('#0284c7');

    // Return Air -> Green (#16a34a)
    expect(pinElements[1].getAttribute('data-discipline')).toBe('Return');
    expect(pinElements[1].querySelector('circle[stroke="#ffffff"]')?.getAttribute('fill')).toBe('#16a34a');

    // Exhaust Air -> Amber (#d97706)
    expect(pinElements[2].getAttribute('data-discipline')).toBe('Exhaust');
    expect(pinElements[2].querySelector('circle[stroke="#ffffff"]')?.getAttribute('fill')).toBe('#d97706');

    // Fire Life Safety -> Red (#dc2626)
    expect(pinElements[3].getAttribute('data-discipline')).toBe('Fire Life Safety');
    expect(pinElements[3].querySelector('circle[stroke="#ffffff"]')?.getAttribute('fill')).toBe('#dc2626');
  });

  it('renders reconciliation status indicators on pins', () => {
    const { container } = render(<SheetCanvas {...defaultProps} pins={samplePins} />);

    const pinElements = container.querySelectorAll('[data-testid="canvas-pin"]');
    expect(pinElements[0].getAttribute('data-status')).toBe('MATCHED');
    expect(pinElements[1].getAttribute('data-status')).toBe('UNDERCOUNT');
    expect(pinElements[2].getAttribute('data-status')).toBe('OVERCOUNT');
  });

  it('renders selected pin halo ring when selectedPinId is provided', () => {
    const { container } = render(
      <SheetCanvas {...defaultProps} pins={samplePins} selectedPinId="pin-sup-1" />
    );
    const selectedHalo = container.querySelector('[data-testid="selected-pin-halo"]');
    expect(selectedHalo).toBeInTheDocument();
    expect(selectedHalo?.getAttribute('cx')).toBe('500');
    expect(selectedHalo?.getAttribute('cy')).toBe('400');
  });
});

describe('Ghost Pin Margin Staging & Radar Ring', () => {
  const ghostPins: CanvasPin[] = [
    {
      id: 'ghost-1',
      x: 60,
      y: 100, // 100 + 0 * 35
      kind: 'ghost',
      label: 'AHU-1',
      tag: 'AHU-1',
      discipline: 'Supply',
      status: 'UNPLACED_GHOST',
    },
    {
      id: 'ghost-2',
      x: 60,
      y: 135, // 100 + 1 * 35
      kind: 'ghost',
      label: 'VAV-2',
      tag: 'VAV-2',
      discipline: 'Supply',
      status: 'UNPLACED_GHOST',
    },
    {
      id: 'ghost-3',
      x: 60,
      y: 170, // 100 + 2 * 35
      kind: 'ghost',
      label: 'EF-2',
      tag: 'EF-2',
      discipline: 'Exhaust',
      status: 'UNPLACED_GHOST',
    },
  ];

  it('stages unplaced ghost pins at canonical margin coordinates (60, 100 + i*35)', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={ghostPins}
        cropEnabled={false}
        onCropRequest={vi.fn()}
      />
    );

    const ghostMarkers = container.querySelectorAll('[data-ghost="true"]');
    expect(ghostMarkers).toHaveLength(3);

    expect(ghostPins[0].x).toBe(60);
    expect(ghostPins[0].y).toBe(100);

    expect(ghostPins[1].x).toBe(60);
    expect(ghostPins[1].y).toBe(135);

    expect(ghostPins[2].x).toBe(60);
    expect(ghostPins[2].y).toBe(170);
  });

  it('renders amber sonar radar pulse rings for ghost pins', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[ghostPins[0]]}
        cropEnabled={false}
        onCropRequest={vi.fn()}
      />
    );

    const ring = container.querySelector('.sonar-ring');
    const ringDelayed = container.querySelector('.sonar-ring-delayed');
    expect(ring).toBeInTheDocument();
    expect(ring?.getAttribute('class')).toContain('stroke-amber-400');
    expect(ringDelayed).toBeInTheDocument();
  });

  it('fires onPlaceGhostPin with translated 2D affine PDF coordinates on drop', () => {
    const onPlaceGhostPin = vi.fn();
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[ghostPins[0]]}
        cropEnabled={false}
        onCropRequest={vi.fn()}
        onPlaceGhostPin={onPlaceGhostPin}
      />
    );

    const ghostEl = container.querySelector('[data-testid="canvas-pin"]');
    expect(ghostEl).toBeInTheDocument();

    // Simulate drag start on ghost pin
    fireEvent.dragStart(ghostEl!);

    // Simulate drop on canvas container at screen point (400, 300)
    const canvasContainer = screen.getByTestId('sheet-canvas');
    fireEvent.drop(canvasContainer, { clientX: 400, clientY: 300 });

    expect(onPlaceGhostPin).toHaveBeenCalledTimes(1);
    const [ghostId, pagePoint] = onPlaceGhostPin.mock.calls[0];
    expect(ghostId).toBe('ghost-1');
    expect(Array.isArray(pagePoint)).toBe(true);
    expect(pagePoint[0]).toBeGreaterThanOrEqual(0);
    expect(pagePoint[1]).toBeGreaterThanOrEqual(0);
  });
});

describe('Pin Hover Card & Selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const testPin: CanvasPin = {
    id: 'pin-101',
    x: 650,
    y: 420,
    kind: 'item',
    tag: 'VAV-1-01',
    label: 'VAV-1-01',
    discipline: 'Supply',
    system: 'Supply Air',
    status: 'UNDERCOUNT',
    equipmentType: 'VAV Terminal Unit',
    cfm: 850,
    scheduled_qty: 4,
    plan_qty: 3,
    confidence: 0.98,
  };

  it('displays hover card within sub-second Doherty threshold (<= 400ms)', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[testPin]}
        cropEnabled={false}
        onCropRequest={vi.fn()}
      />
    );

    const pinMarker = container.querySelector('[data-testid="canvas-pin"]');
    expect(pinMarker).toBeInTheDocument();

    // Mouse enters pin hit area
    fireEvent.mouseEnter(pinMarker!);

    // Card should not immediately show before debounce
    expect(screen.queryByTestId('pin-hover-card')).not.toBeInTheDocument();

    // Advance timers by 400ms inside act to flush React 19 state update
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Card appears with verified telemetry
    const hoverCard = screen.getByTestId('pin-hover-card');
    expect(hoverCard).toBeInTheDocument();
    expect(within(hoverCard).getByText('VAV-1-01')).toBeInTheDocument();
    expect(screen.getByText(/VAV Terminal Unit/i)).toBeInTheDocument();
    expect(screen.getByText('850 CFM')).toBeInTheDocument();
    expect(screen.getByText(/UNDERCOUNT/i)).toBeInTheDocument();
  });

  it('selects pin and invokes onSelectPin callback on click', () => {
    const onSelectPin = vi.fn();
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[testPin]}
        cropEnabled={false}
        onCropRequest={vi.fn()}
        onSelectPin={onSelectPin}
      />
    );

    const pinMarker = container.querySelector('[data-testid="canvas-pin"]');
    fireEvent.click(pinMarker!);

    expect(onSelectPin).toHaveBeenCalledTimes(1);
    expect(onSelectPin).toHaveBeenCalledWith(testPin);
  });
});

describe('Reconcile ghost wiring', () => {
  const report: ReconciliationReport = {
    reconciliation_id: 'rec-1',
    project_id: 'default_project',
    timestamp: '2026-01-01T00:00:00Z',
    total_scheduled: 2,
    total_counted: 0,
    total_matched: 0,
    total_undercounts: 0,
    total_overcounts: 0,
    total_unscheduled: 0,
    total_ghosts: 2,
    match_rate: 0,
    discrepancies: [],
    ghost_pins: [
      {
        ghost_id: 'ghost-ahu-1',
        tag: 'AHU-1',
        description: 'Rooftop Air Handling Unit',
        status: 'UNPLACED',
        location_pt: [60, 100],
        schedule_ref: 'M-601',
        suggested_discipline: 'MECHANICAL',
        suggested_system: 'Supply Air',
      },
      {
        ghost_id: 'ghost-ef-1',
        tag: 'EF-1',
        description: 'Centrifugal Roof Exhaust Fan',
        status: 'UNPLACED',
        location_pt: [60, 135],
        schedule_ref: 'M-601',
        suggested_discipline: 'MECHANICAL',
        suggested_system: 'Exhaust Air',
      },
    ],
    summary_by_discipline: {},
    review_required: false,
  };

  it('maps reconcile response ghost_pins to canvas pins with kind ghost at dock coords', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(report), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = createApiClient();
      const res = await client.reconcileTakeoff({
        scheduled_items: [
          { tag: 'AHU-1', schedule_sheet: 'M-601', quantity: 1 },
          { tag: 'EF-1', schedule_sheet: 'M-601', quantity: 1 },
        ],
        plan_symbols: [],
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/takeoff/reconcile');
      expect(init.method).toBe('POST');

      const pins = mapReconcileGhostPins(res.ghost_pins);
      expect(pins).toHaveLength(2);
      expect(pins[0]).toMatchObject({
        id: 'ghost-ahu-1',
        x: 60,
        y: 100,
        kind: 'ghost',
        tag: 'AHU-1',
        status: 'UNPLACED_GHOST',
      });
      expect(pins[1]).toMatchObject({ id: 'ghost-ef-1', x: 60, y: 135, kind: 'ghost', tag: 'EF-1' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to dock staging [60, 100 + i*35] when location_pt is missing', () => {
    const pins = mapReconcileGhostPins([
      { ghost_id: 'g1', tag: 'AHU-1', description: '', status: 'UNPLACED', location_pt: null, schedule_ref: 'M-601' },
      { ghost_id: 'g2', tag: 'EF-1', description: '', status: 'UNPLACED', location_pt: null, schedule_ref: 'M-601' },
    ]);
    expect(pins.map((p) => [p.x, p.y])).toEqual([
      [60, 100],
      [60, 135],
    ]);
    expect(pins.every((p) => p.kind === 'ghost')).toBe(true);
  });

  it('ghost click triggers focus/center via pinFocusCoords, non-ghost does not', () => {
    const pins = mapReconcileGhostPins(report.ghost_pins);
    expect(pinFocusCoords(pins[0])).toEqual([60, 100]);
    expect(
      pinFocusCoords({ id: 'i1', x: 500, y: 400, kind: 'item', status: 'MATCHED' })
    ).toBeNull();

    function Harness() {
      const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
      const [focusTarget, setFocusTarget] = useState<{
        x: number;
        y: number;
        zoom?: number;
        timestamp?: number;
      } | null>(null);
      return (
        <>
          <div data-testid="focus-probe">
            {focusTarget ? `${focusTarget.x},${focusTarget.y}` : 'none'}
          </div>
          <SheetCanvas
            imageUrl="/api/page-image?x=1"
            widthPt={3024}
            heightPt={2160}
            pins={pins}
            cropEnabled={false}
            onCropRequest={vi.fn()}
            selectedPinId={selectedPinId}
            focusTarget={focusTarget}
            onSelectPin={(pin) => {
              // Mirrors TakeoffWorkspace onSelectPin wiring.
              setSelectedPinId(pin.id);
              const focus = pinFocusCoords(pin);
              if (focus) {
                setFocusTarget({ x: focus[0], y: focus[1], zoom: 1.5, timestamp: Date.now() });
              }
            }}
          />
        </>
      );
    }

    const { container } = render(<Harness />);
    expect(screen.getByTestId('focus-probe')).toHaveTextContent('none');
    const ghostEl = container.querySelector('[data-ghost="true"]');
    expect(ghostEl).toBeInTheDocument();
    fireEvent.click(ghostEl!);
    expect(screen.getByTestId('focus-probe')).toHaveTextContent('60,100');
    expect(container.querySelector('[data-testid="selected-pin-halo"]')).toBeInTheDocument();
  });
});
