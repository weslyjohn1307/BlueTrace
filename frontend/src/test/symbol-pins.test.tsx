import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  SymbolPinsOverlay,
  symbolSystemColor,
  type SymbolPin,
} from '../workspace/components/SymbolPinsOverlay';
import { SheetCanvas, type CanvasPin } from '../workspace/components/SheetCanvas';

const SYMBOL_PINS: SymbolPin[] = [
  { id: 'sym-sup', x: 120, y: 200, label: 'SD-1', system: 'Supply', reviewRequired: false },
  { id: 'sym-ret', x: 340, y: 410, label: 'RG-2', system: 'Return', reviewRequired: false },
  { id: 'sym-exh', x: 560, y: 620, label: 'EF-3', system: 'Exhaust', reviewRequired: false },
  { id: 'sym-fire', x: 780, y: 840, label: 'FD-4', system: 'Fire', reviewRequired: true },
];

describe('SymbolPinsOverlay system colors', () => {
  it('maps each system to its SYM-005 spec color', () => {
    expect(symbolSystemColor('Supply')).toBe('#2468A8');
    expect(symbolSystemColor('Return Air')).toBe('#2468A8');
    expect(symbolSystemColor('Exhaust')).toBe('#2468A8');
    expect(symbolSystemColor('Fire Life Safety')).toBe('#B3313D');
    expect(symbolSystemColor('Mystery')).toBe('#66717E');
    expect(symbolSystemColor(undefined)).toBe('#66717E');
  });

  it('renders one glyph per pin with matching transformed coordinates', () => {
    render(
      <svg>
        <SymbolPinsOverlay pins={SYMBOL_PINS} />
      </svg>
    );
    const layer = screen.getByTestId('symbol-pins');
    const glyphs = within(layer).getAllByTestId('symbol-pin-glyph');
    expect(glyphs).toHaveLength(4);
    const expected: Array<[string, string]> = [
      ['120', '200'],
      ['340', '410'],
      ['560', '620'],
      ['780', '840'],
    ];
    glyphs.forEach((glyph, index) => {
      expect(glyph.getAttribute('cx')).toBe(expected[index][0]);
      expect(glyph.getAttribute('cy')).toBe(expected[index][1]);
    });
    expect(glyphs[0].getAttribute('fill')).toBe('#2468A8');
    expect(glyphs[1].getAttribute('fill')).toBe('#2468A8');
    expect(glyphs[2].getAttribute('fill')).toBe('#2468A8');
    expect(glyphs[3].getAttribute('fill')).toBe('#B3313D');
  });

  it('shows a static amber ring only on review_required pins', () => {
    render(
      <svg>
        <SymbolPinsOverlay pins={SYMBOL_PINS} />
      </svg>
    );
    const rings = screen.getAllByTestId('symbol-pin-review-ring');
    expect(rings).toHaveLength(1);
    const ring = rings[0];
    expect(ring.getAttribute('stroke')).toBe('#B45309');
    expect(ring.getAttribute('cx')).toBe('780');
    expect(ring.getAttribute('cy')).toBe('840');
    expect(ring.getAttribute('class') ?? '').not.toContain('animate-pulse');
    expect(ring.getAttribute('class') ?? '').not.toContain('sonar');

    const reviewPins = screen.getAllByTestId('symbol-pin');
    expect(reviewPins).toHaveLength(4);
    expect(reviewPins[3].getAttribute('data-review')).toBe('true');
    expect(reviewPins[0].getAttribute('data-review')).toBeNull();
  });

  it('hides review emphasis without hiding the component itself', () => {
    render(
      <svg>
        <SymbolPinsOverlay pins={SYMBOL_PINS} reviewEmphasis={false} />
      </svg>
    );
    expect(screen.queryAllByTestId('symbol-pin-review-ring')).toHaveLength(0);
    expect(screen.getAllByTestId('symbol-pin')).toHaveLength(4);
  });

  it('forwards pin selection on click', () => {
    const onSelectPin = vi.fn();
    render(
      <svg>
        <SymbolPinsOverlay pins={SYMBOL_PINS} onSelectPin={onSelectPin} />
      </svg>
    );
    fireEvent.click(screen.getAllByTestId('symbol-pin')[1]);
    expect(onSelectPin).toHaveBeenCalledTimes(1);
    expect(onSelectPin.mock.calls[0][0]).toMatchObject({ id: 'sym-ret' });
  });

  it('renders bbox detections with a white halo and a system-colored review box', () => {
    render(
      <svg>
        <SymbolPinsOverlay pins={[{ id: 'sym-bbox', x: 30, y: 40, system: 'Electrical', bbox: [10, 20, 50, 60], reviewRequired: true }]} />
      </svg>
    );
    expect(screen.getByTestId('symbol-detection-halo').getAttribute('stroke')).toBe('#ffffff');
    expect(screen.getByTestId('symbol-detection-bounds').getAttribute('stroke')).toBe('#A45214');
    expect(screen.getByTestId('symbol-detection-bounds').getAttribute('stroke-dasharray')).toBe('6 3');
  });
});

describe('SheetCanvas symbol pin layer wiring', () => {
  const baseProps = {
    imageUrl: '/api/page-image?x=1',
    widthPt: 3024,
    heightPt: 2160,
    cropEnabled: false,
    onCropRequest: vi.fn(),
  };

  it('routes kind=symbol pins through the overlay with system colors', () => {
    const pins: CanvasPin[] = [
      {
        id: 'item-1',
        x: 100,
        y: 100,
        kind: 'item',
        label: 'VAV-1',
        system: 'Supply Air',
      },
      {
        id: 'sym-1',
        x: 500,
        y: 400,
        kind: 'symbol',
        label: 'SD-1',
        system: 'Supply',
        status: 'SUGGESTED',
        reviewRequired: true,
      },
    ];
    render(<SheetCanvas {...baseProps} pins={pins} />);
    const overlay = screen.getByTestId('symbol-pins');
    const symbolPins = within(overlay).getAllByTestId('symbol-pin');
    expect(symbolPins).toHaveLength(1);
    expect(symbolPins[0].getAttribute('data-system')).toBe('Supply');
    const glyph = within(overlay).getByTestId('symbol-pin-glyph');
    expect(glyph.getAttribute('cx')).toBe('500');
    expect(glyph.getAttribute('cy')).toBe('400');
    expect(glyph.getAttribute('fill')).toBe('#2468A8');
    expect(within(overlay).getByTestId('symbol-pin-review-ring')).toBeTruthy();
    // The generic pin layer still renders the non-symbol pin exactly once.
    expect(screen.getAllByTestId('canvas-pin')).toHaveLength(1);
  });
});
