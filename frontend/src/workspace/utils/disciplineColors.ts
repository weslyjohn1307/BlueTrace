/** Semantic colors used on the drawing overlay, selected for contrast over white PDF sheets. */
export const OVERLAY_COLORS = {
  supply: '#2468A8',
  return: '#2468A8',
  exhaust: '#2468A8',
  coldWater: '#087668',
  hotWater: '#087668',
  sanitary: '#087668',
  electrical: '#A45214',
  fire: '#B3313D',
  ghost: '#B45309',
  evidence: '#087668',
  item: '#2468A8',
  calibration: '#B45309',
  selected: '#005BFF',
  halo: '#FFFFFF',
  labelBackground: '#101923',
  labelText: '#F8FAFC',
  default: '#66717E',
} as const;

export const DISCIPLINE_COLORS = {
  supply: OVERLAY_COLORS.supply,
  return: OVERLAY_COLORS.return,
  exhaust: OVERLAY_COLORS.exhaust,
  fire_life_safety: OVERLAY_COLORS.fire,
  plumbing: OVERLAY_COLORS.coldWater,
  electrical: OVERLAY_COLORS.electrical,
  default: OVERLAY_COLORS.default,
} as const;

export type DisciplineType = keyof typeof DISCIPLINE_COLORS;

/** Resolve a route system or discipline to one stable overlay color. */
export function getOverlayColor(systemOrDiscipline?: string | null): string {
  if (!systemOrDiscipline) return OVERLAY_COLORS.default;
  const key = systemOrDiscipline.toLowerCase().replace(/[_-]+/g, ' ');

  if (key.includes('fire') || key.includes('smoke') || key.includes('life safety') || key.includes('fls')) {
    return OVERLAY_COLORS.fire;
  }
  if (key.includes('supply') || key === 's') return OVERLAY_COLORS.supply;
  if (key.includes('return') || key === 'r') return OVERLAY_COLORS.return;
  if (key.includes('exhaust') || key.includes('relief') || key === 'e') return OVERLAY_COLORS.exhaust;
  if (key.includes('hot water') || key.includes('hhw') || key.includes('heating water')) {
    return OVERLAY_COLORS.hotWater;
  }
  if (key.includes('sanitary') || key.includes('waste') || key.includes('sewer')) {
    return OVERLAY_COLORS.sanitary;
  }
  if (key.includes('water') || key.includes('plumb') || key.includes('piping') || key.includes('chilled')) {
    return OVERLAY_COLORS.coldWater;
  }
  if (key.includes('electrical') || key.includes('power') || key.includes('lighting') || key.includes('conduit')) {
    return OVERLAY_COLORS.electrical;
  }
  if (key.includes('mechanical') || key.includes('hvac')) return OVERLAY_COLORS.supply;
  return OVERLAY_COLORS.default;
}

/**
 * Maps a discipline, system, or category string to its authoritative hex color token.
 */
export function getDisciplineColor(disciplineOrSystem?: string | null): string {
  return getOverlayColor(disciplineOrSystem);
}

/**
 * Human-readable system label for legends. Raw pipeline keys arrive in mixed
 * forms (`SupplyAir`, `SUPPLY_AIR`, `supply air`), but the legend must show
 * one consistent plain-language label. Returns the trimmed raw value when it
 * matches no known system so unknown data is never silently renamed.
 */
export function displaySystemLabel(system?: string | null): string {
  if (!system) return 'Unassigned';
  const key = system.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key) return 'Unassigned';
  if (key.includes('supply')) return 'Supply air';
  if (key.includes('return')) return 'Return air';
  if (key.includes('exhaust') || key.includes('relief')) return 'Exhaust air';
  if (key.includes('general') || key === 'unassigned' || key === 'unknown') return 'General';
  return system.trim();
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
