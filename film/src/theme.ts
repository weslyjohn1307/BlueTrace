import { Easing, interpolate } from 'remotion';

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Seconds → frames. All timing in the film is authored in seconds and resolved here. */
export const s = (seconds: number) => Math.round(seconds * FPS);

/**
 * Palette: the public story surface tokens (frontend/src/modes/showcase/showcase.css)
 * and the showcase scene's trade colours (frontend/src/modes/showcase/showcaseScene.ts).
 * Colour carries meaning only — supply, plumbing, electrical, review.
 */
export const C = {
  paper: '#f0ecdf',
  paperLight: '#f8f5ec',
  ink: '#17252b',
  muted: '#5a6869',
  hairline: '#d6d0c1',
  night: '#101a1f',
  nightSoft: '#1a292e',
  linework: '#4f5c5f',
  lineworkFaint: '#9aa29f',
  ghost: '#c3beb0',
  supply: '#286f9f',
  plumbing: '#327b6b',
  electrical: '#a96a32',
} as const;

export const FONT = {
  display: "'STIX Two Text', Georgia, serif",
  ui: "'Libre Franklin', system-ui, sans-serif",
  mono: "'Inconsolata', ui-monospace, monospace",
} as const;

/** Entrances: fast start, long settle. Travel: symmetric, unhurried. No springs, no bounce. */
export const EASE_ENTER = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_MOVE = Easing.bezier(0.65, 0, 0.35, 1);

export function ramp(
  frame: number,
  [from, to]: [number, number],
  [a, b]: [number, number],
  easing: (t: number) => number = EASE_MOVE,
) {
  return interpolate(frame, [from, to], [a, b], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Constant-speed progress, used for linework so every stroke draws at an even pace. */
export function linear(frame: number, [from, to]: [number, number]) {
  return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}
