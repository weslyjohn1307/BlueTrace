import { describe, expect, it } from 'vitest';
import { displaySystemLabel, getOverlayColor, OVERLAY_COLORS } from '../workspace/utils/disciplineColors';

describe('MEP overlay color mapping', () => {
  it('keeps discipline, review, selection, and unknown linework colors readable on the white PDF', () => {
    const colors = [
      OVERLAY_COLORS.supply,
      OVERLAY_COLORS.electrical,
      OVERLAY_COLORS.coldWater,
      OVERLAY_COLORS.ghost,
      OVERLAY_COLORS.selected,
      OVERLAY_COLORS.default,
    ];
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const linear = channels.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    for (const color of colors) {
      expect(1.05 / (luminance(color) + 0.05), `${color} contrast on white`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('uses stable discipline colors for route systems on the white PDF', () => {
    expect(getOverlayColor('Supply Air')).toBe('#2468A8');
    expect(getOverlayColor('Return Air')).toBe('#2468A8');
    expect(getOverlayColor('Exhaust Air')).toBe('#2468A8');
    expect(getOverlayColor('Domestic Cold Water')).toBe('#087668');
    expect(getOverlayColor('Domestic Hot Water')).toBe('#087668');
    expect(getOverlayColor('Electrical Lighting')).toBe('#A45214');
    expect(getOverlayColor('Fire Smoke Damper')).toBe('#B3313D');
    expect(getOverlayColor('Mechanical HVAC')).toBe('#2468A8');
    expect(getOverlayColor('unclassified linework')).toBe('#66717E');
  });

  it('shows one plain-language legend label per pipeline system key', () => {
    expect(displaySystemLabel('SupplyAir')).toBe('Supply air');
    expect(displaySystemLabel('SUPPLY_AIR')).toBe('Supply air');
    expect(displaySystemLabel('ReturnAir')).toBe('Return air');
    expect(displaySystemLabel('ExhaustAir')).toBe('Exhaust air');
    expect(displaySystemLabel('GENERAL')).toBe('General');
    expect(displaySystemLabel(undefined)).toBe('Unassigned');
    expect(displaySystemLabel('Chilled Water')).toBe('Chilled Water');
  });
});
