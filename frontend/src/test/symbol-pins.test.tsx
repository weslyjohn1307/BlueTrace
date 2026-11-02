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
    expect(symbolSystemColor('Supply')).toBe('#2563EB');
    expect(symbolSystemColor('Return Air')).toBe('#16A34A');
    expect(symbolSystemColor('Exhaust')).toBe('#D97706');
    expect(symbolSystemColor('Fire Life Safety')).toBe('#DC2626');
    expect(symbolSystemColor('Mystery')).toBe('#64748B');
    expect(symbolSystemColor(undefined)).toBe('#64748B');
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
    expect(glyphs[0].getAttribute('fill')).toBe('#2563EB');
    expect(glyphs[1].getAttribute('fill')).toBe('#16A34A');
    expect(glyphs[2].getAttribute('fill')).toBe('#D97706');
    expect(glyphs[3].getAttribute('fill')).toBe('#DC2626');
  });

  it('shows a pulsing amber ring only on review_required pins', () => {
    render(
      <svg>
        <SymbolPinsOverlay pins={SYMBOL_PINS} />
      </svg>
    );
    const rings = screen.getAllByTestId('symbol-pin-review-ring');
    expect(rings).toHaveLength(1);
    const ring = rings[0];
    expect(ring.getAttribute('stroke')).toBe('#F59E0B');
    expect(ring.getAttribute('cx')).toBe('780');
    expect(ring.getAttribute('cy')).toBe('840');
    expect(ring.getAttribute('class')).toContain('animate-pulse');

    const reviewPins = screen.getAllByTestId('symbol-pin');
    expect(reviewPins).toHaveLength(4);
    expect(reviewPins[3].getAttribute('data-review')).toBe('true');
    expect(reviewPins[0].getAttribute('data-review')).toBeNull();
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
    expect(glyph.getAttribute('fill')).toBe('#2563EB');
    expect(within(overlay).getByTestId('symbol-pin-review-ring')).toBeTruthy();
    // The generic pin layer still renders the non-symbol pin exactly once.
    expect(screen.getAllByTestId('canvas-pin')).toHaveLength(1);
  });
});
