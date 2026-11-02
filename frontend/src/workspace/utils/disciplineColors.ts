/**
 * Authoritative AEC Discipline Color Tokens conforming to Rule 03 (.agents/rules/03-anti-slop-ui.md).
 *
 * Distinct system colors:
 * - Supply (Blue): #0284c7
 * - Return (Green): #16a34a
 * - Exhaust (Amber): #d97706
 * - Fire Life Safety (Red): #dc2626
 *
 * Invariant:
 * High contrast ratio (>= 3:1 UI element contrast, >= 4.5:1 text contrast)
 */

export const DISCIPLINE_COLORS = {
  supply: '#0284c7',           // Supply: Blue
  return: '#16a34a',           // Return: Green
  exhaust: '#d97706',          // Exhaust: Amber
  fire_life_safety: '#dc2626', // Fire Life Safety: Red
  plumbing: '#0284c7',         // Plumbing
  electrical: '#eab308',       // Electrical: Amber/Yellow
  default: '#94a3b8',          // Default Slate
} as const;

export type DisciplineType = keyof typeof DISCIPLINE_COLORS;

/**
 * Maps a discipline, system, or category string to its authoritative hex color token.
 */
export function getDisciplineColor(disciplineOrSystem?: string | null): string {
  if (!disciplineOrSystem) return DISCIPLINE_COLORS.default;
  const key = disciplineOrSystem.toLowerCase();

  if (key.includes('supply') || key === 's') {
    return DISCIPLINE_COLORS.supply;
  }
  if (key.includes('return') || key === 'r') {
    return DISCIPLINE_COLORS.return;
  }
  if (key.includes('exhaust') || key === 'e' || key.includes('relief')) {
    return DISCIPLINE_COLORS.exhaust;
  }
  if (
    key.includes('fire') ||
    key.includes('smoke') ||
    key.includes('life safety') ||
    key.includes('fls') ||
    key.includes('damper')
  ) {
    return DISCIPLINE_COLORS.fire_life_safety;
  }
  if (key.includes('plumb') || key.includes('piping')) {
    return DISCIPLINE_COLORS.plumbing;
  }
  if (key.includes('elec') || key.includes('power') || key.includes('light')) {
    return DISCIPLINE_COLORS.electrical;
  }
  if (key.includes('mech')) {
    return DISCIPLINE_COLORS.supply;
  }
  return DISCIPLINE_COLORS.default;
}

/**
 * Returns a short 1-letter trade initial badge (S, R, E, F, P, L, M) for compact CAD pins.
 */
export function getDisciplineInitial(disciplineOrSystem?: string | null): string {
  if (!disciplineOrSystem) return 'M';
  const key = disciplineOrSystem.toLowerCase();
  if (key.includes('supply')) return 'S';
  if (key.includes('return')) return 'R';
  if (key.includes('exhaust')) return 'E';
  if (key.includes('fire') || key.includes('smoke') || key.includes('fls')) return 'F';
  if (key.includes('plumb')) return 'P';
  if (key.includes('elec')) return 'E';
  return 'M';
}
