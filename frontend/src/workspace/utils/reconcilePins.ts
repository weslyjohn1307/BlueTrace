import type { ReconcileGhostPin } from '../../api/contracts';
import type { CanvasPin } from '../components/SheetCanvas';

/**
 * Map backend reconcile ghost_pins to canvas pins. Dock staging is preserved:
 * a valid `location_pt` is used verbatim (backend stages unplaced ghosts at
 * [60, 100 + i*35]); only a missing/invalid location falls back to that dock.
 */
export function mapReconcileGhostPins(ghostPins: ReconcileGhostPin[]): CanvasPin[] {
  return ghostPins.map((ghost, index) => {
    const loc = ghost.location_pt;
    const hasLoc =
      Array.isArray(loc) &&
      loc.length >= 2 &&
      typeof loc[0] === 'number' &&
      typeof loc[1] === 'number' &&
      Number.isFinite(loc[0]) &&
      Number.isFinite(loc[1]);
    return {
      id: ghost.ghost_id,
      x: hasLoc ? loc[0] : 60,
      y: hasLoc ? loc[1] : 100 + index * 35,
      kind: 'ghost' as const,
      label: ghost.tag,
      tag: ghost.tag,
      description: ghost.description,
      status: ghost.status === 'UNPLACED' ? 'UNPLACED_GHOST' : ghost.status,
      system: ghost.suggested_system,
      discipline: ghost.suggested_discipline,
    };
  });
}

/** Coordinates to center on when a pin is selected, or null for non-ghost pins. */
export function pinFocusCoords(pin: CanvasPin): [number, number] | null {
  if (pin.kind === 'ghost' || pin.status === 'UNPLACED_GHOST') {
    return [pin.x, pin.y];
  }
  return null;
}
