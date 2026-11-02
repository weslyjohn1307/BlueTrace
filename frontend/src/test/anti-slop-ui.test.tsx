import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SheetCanvas } from '../workspace/components/SheetCanvas';
import { DISCIPLINE_COLORS } from '../workspace/utils/disciplineColors';

describe('Anti-Slop UI & Aesthetic Invariants (.agents/rules/03-anti-slop-ui.md)', () => {
  it('enforces font-mono for all dimensions, quantities, and coordinate readouts', () => {
    const { container } = render(
      <SheetCanvas
        imageUrl="/api/page-image?x=1"
        widthPt={3024}
        heightPt={2160}
        pins={[
          {
            id: 'pin-1',
            x: 100,
            y: 100,
            kind: 'item',
            label: 'VAV-1',
            cfm: 850,
          },
        ]}
        cropEnabled={false}
        onCropRequest={() => {}}
      />
    );

    // Pin labels must be rendered with monospace font
    const pinLabelText = container.querySelector('text[font-family="monospace"], text[fontfamily="monospace"]');
    expect(pinLabelText).toBeInTheDocument();

    // Telemetry and status readouts must have font-mono class
    const telemetry = container.querySelector('.font-mono');
    expect(telemetry).toBeInTheDocument();
  });

  it('verifies contrast ratio >= 4.5:1 for telemetry text against slate-900 background', () => {
    // Relative luminance calculator per WCAG 2.2
    function luminance(r: number, g: number, b: number): number {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const rgb1 = [
        parseInt(hex1.slice(1, 3), 16),
        parseInt(hex1.slice(3, 5), 16),
        parseInt(hex1.slice(5, 7), 16),
      ];
      const rgb2 = [
        parseInt(hex2.slice(1, 3), 16),
        parseInt(hex2.slice(3, 5), 16),
        parseInt(hex2.slice(5, 7), 16),
      ];
      const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
      const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
      const brightest = Math.max(l1, l2);
      const darkest = Math.min(l1, l2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    const bgSlate900 = '#0f172a';
    const textWhite = '#ffffff';
    const textCyan = '#22d3ee';
    const textSlate400 = '#94a3b8';

    expect(contrastRatio(textWhite, bgSlate900)).toBeGreaterThanOrEqual(4.5); // 16.5:1
    expect(contrastRatio(textCyan, bgSlate900)).toBeGreaterThanOrEqual(4.5); // 10.2:1
    expect(contrastRatio(textSlate400, bgSlate900)).toBeGreaterThanOrEqual(4.5); // 5.2:1
  });

  it('verifies contrast ratio >= 3:1 for all discipline UI color tokens', () => {
    function luminance(r: number, g: number, b: number): number {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const rgb1 = [
        parseInt(hex1.slice(1, 3), 16),
        parseInt(hex1.slice(3, 5), 16),
        parseInt(hex1.slice(5, 7), 16),
      ];
      const rgb2 = [
        parseInt(hex2.slice(1, 3), 16),
        parseInt(hex2.slice(3, 5), 16),
        parseInt(hex2.slice(5, 7), 16),
      ];
      const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
      const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
      const brightest = Math.max(l1, l2);
      const darkest = Math.min(l1, l2);
      return (brightest + 0.05) / (darkest + 0.05);
    }

    const bgSlate950 = '#020617';

    // Supply Blue (#0284c7)
    expect(contrastRatio(DISCIPLINE_COLORS.supply, bgSlate950)).toBeGreaterThanOrEqual(3.0);

    // Return Green (#16a34a)
    expect(contrastRatio(DISCIPLINE_COLORS.return, bgSlate950)).toBeGreaterThanOrEqual(3.0);

    // Exhaust Amber (#d97706)
    expect(contrastRatio(DISCIPLINE_COLORS.exhaust, bgSlate950)).toBeGreaterThanOrEqual(3.0);

    // Fire Life Safety Red (#dc2626)
    expect(contrastRatio(DISCIPLINE_COLORS.fire_life_safety, bgSlate950)).toBeGreaterThanOrEqual(3.0);
  });
});
