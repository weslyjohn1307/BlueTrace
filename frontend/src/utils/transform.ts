/**
 * Pure 2D Coordinate Transformation Engine for BlueTraceAI Drawing Viewer.
 *
 * Implements authoritative transforms between:
 * 1. Screen Space (pixels relative to viewport container)
 * 2. PDF Page User Space (72 pt/in, origin top-left)
 *
 * Guaranteed Invariants:
 * - Roundtrip exactness: ||screenToPage(pageToScreen(P)) - P|| < 1e-6
 * - Anchor stability: point under screen cursor remains invariant during zoom
 * - Zero external dependencies; standard mathematical formulation
 */

export interface TransformState {
  scale: number;
  translationX: number;
  translationY: number;
  mode: 'fit' | 'manual';
}

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export const DEFAULT_PADDING = 24;
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 30.0;

/**
 * Calculates fit-to-viewport transform for given viewport and page dimensions.
 */
export function calculateFitTransform(
  viewport: Dimensions,
  page: Dimensions,
  padding: number = DEFAULT_PADDING
): TransformState {
  if (viewport.width <= 0 || viewport.height <= 0 || page.width <= 0 || page.height <= 0) {
    return {
      scale: 1.0,
      translationX: 0,
      translationY: 0,
      mode: 'fit',
    };
  }

  const availWidth = Math.max(10, viewport.width - padding * 2);
  const availHeight = Math.max(10, viewport.height - padding * 2);

  const scaleX = availWidth / page.width;
  const scaleY = availHeight / page.height;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));

  const translationX = (viewport.width - page.width * scale) / 2;
  const translationY = (viewport.height - page.height * scale) / 2;

  return {
    scale,
    translationX,
    translationY,
    mode: 'fit',
  };
}

/**
 * Maps a point in PDF page user space (points) to viewport screen space (pixels).
 */
export function pagePointToScreenPoint(
  pagePt: Point,
  transform: TransformState
): Point {
  return {
    x: pagePt.x * transform.scale + transform.translationX,
    y: pagePt.y * transform.scale + transform.translationY,
  };
}

/**
 * Maps a point in viewport screen space (pixels) to PDF page user space (points).
 */
export function screenPointToPagePoint(
  screenPt: Point,
  transform: TransformState
): Point {
  if (transform.scale === 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: (screenPt.x - transform.translationX) / transform.scale,
    y: (screenPt.y - transform.translationY) / transform.scale,
  };
}

/**
 * Zooms around a specific screen anchor point (e.g. mouse cursor), ensuring
 * that the drawing point beneath the cursor remains stationary on screen.
 */
export function zoomAroundScreenAnchor(
  current: TransformState,
  screenAnchor: Point,
  targetScale: number,
  minScale: number = MIN_SCALE,
  maxScale: number = MAX_SCALE
): TransformState {
  const newScale = Math.max(minScale, Math.min(maxScale, targetScale));
  if (current.scale === 0) {
    return { ...current, scale: newScale, mode: 'manual' };
  }

  const scaleFactor = newScale / current.scale;
  const translationX = screenAnchor.x - (screenAnchor.x - current.translationX) * scaleFactor;
  const translationY = screenAnchor.y - (screenAnchor.y - current.translationY) * scaleFactor;

  return {
    scale: newScale,
    translationX,
    translationY,
    mode: 'manual',
  };
}

/**
 * Translates the viewport by a screen delta (dx, dy).
 */
export function panByScreenDelta(
  current: TransformState,
  delta: Point
): TransformState {
  return {
    scale: current.scale,
    translationX: current.translationX + delta.x,
    translationY: current.translationY + delta.y,
    mode: 'manual',
  };
}

/**
 * Resets transform to fit the viewport.
 */
export function resetToFit(
  viewport: Dimensions,
  page: Dimensions,
  padding: number = DEFAULT_PADDING
): TransformState {
  return calculateFitTransform(viewport, page, padding);
}
