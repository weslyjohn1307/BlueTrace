import { describe, it, expect } from 'vitest';
import {
  calculateFitTransform,
  pagePointToScreenPoint,
  screenPointToPagePoint,
  zoomAroundScreenAnchor,
  panByScreenDelta,
  resetToFit,
} from '../utils/transform';

describe('Transform Math Engine', () => {
  const viewport = { width: 1200, height: 800 };
  const pageAvexis = { width: 3024, height: 2160 }; // Standard Avexis 22 page points (pt)

  it('calculates exact fit transform with symmetric padding', () => {
    const transform = calculateFitTransform(viewport, pageAvexis, 24);
    expect(transform.mode).toBe('fit');

    // Avail width: 1200 - 48 = 1152. 1152 / 3024 = 0.380952...
    // Avail height: 800 - 48 = 752. 752 / 2160 = 0.348148...
    // Limiting axis is height: scale = 752 / 2160 ≈ 0.348148
    expect(transform.scale).toBeCloseTo(752 / 2160, 5);

    // Height fits within padding: 2160 * scale = 752. translationY = (800 - 752) / 2 = 24
    expect(transform.translationY).toBeCloseTo(24, 4);

    // Width is centered horizontally in 1200 viewport
    const renderedWidth = pageAvexis.width * transform.scale;
    expect(transform.translationX).toBeCloseTo((viewport.width - renderedWidth) / 2, 4);
  });

  it('guarantees roundtrip exactness between page user space and screen pixels', () => {
    const transform = calculateFitTransform(viewport, pageAvexis, 24);

    const testPoints = [
      { x: 0, y: 0 },
      { x: 3024, y: 2160 },
      { x: 1512, y: 1080 },
      { x: 450.25, y: 890.75 },
      { x: 2800.12, y: 200.45 },
    ];

    for (const pt of testPoints) {
      const screenPt = pagePointToScreenPoint(pt, transform);
      const roundtripPt = screenPointToPagePoint(screenPt, transform);

      expect(roundtripPt.x).toBeCloseTo(pt.x, 5);
      expect(roundtripPt.y).toBeCloseTo(pt.y, 5);
    }
  });

  it('preserves page point under screen anchor across zoom operations', () => {
    const initialTransform = calculateFitTransform(viewport, pageAvexis, 24);
    const screenCursor = { x: 600, y: 400 };

    // Page point under cursor before zoom
    const pagePtBefore = screenPointToPagePoint(screenCursor, initialTransform);

    // Zoom in 2x
    const zoomedTransform = zoomAroundScreenAnchor(
      initialTransform,
      screenCursor,
      initialTransform.scale * 2.0
    );
    expect(zoomedTransform.mode).toBe('manual');
    expect(zoomedTransform.scale).toBeCloseTo(initialTransform.scale * 2.0, 5);

    // Page point under cursor after zoom MUST be identical
    const pagePtAfter = screenPointToPagePoint(screenCursor, zoomedTransform);
    expect(pagePtAfter.x).toBeCloseTo(pagePtBefore.x, 5);
    expect(pagePtAfter.y).toBeCloseTo(pagePtBefore.y, 5);
  });

  it('pans accurately by screen delta', () => {
    const initialTransform = calculateFitTransform(viewport, pageAvexis, 24);
    const delta = { x: 45, y: -30 };

    const panned = panByScreenDelta(initialTransform, delta);
    expect(panned.mode).toBe('manual');
    expect(panned.scale).toBe(initialTransform.scale);
    expect(panned.translationX).toBe(initialTransform.translationX + 45);
    expect(panned.translationY).toBe(initialTransform.translationY - 30);
  });

  it('resets to fit viewport', () => {
    const initialTransform = calculateFitTransform(viewport, pageAvexis, 24);
    const modified = panByScreenDelta(
      zoomAroundScreenAnchor(initialTransform, { x: 300, y: 300 }, 1.5),
      { x: 100, y: 100 }
    );
    expect(modified.mode).toBe('manual');

    const reset = resetToFit(viewport, pageAvexis, 24);
    expect(reset.mode).toBe('fit');
    expect(reset.scale).toBeCloseTo(initialTransform.scale, 5);
    expect(reset.translationX).toBeCloseTo(initialTransform.translationX, 5);
    expect(reset.translationY).toBeCloseTo(initialTransform.translationY, 5);
  });

  it('handles zero or degenerate dimensions safely without dividing by zero', () => {
    const deg1 = calculateFitTransform({ width: 0, height: 0 }, pageAvexis);
    expect(deg1.scale).toBe(1.0);
    expect(deg1.translationX).toBe(0);

    const deg2 = calculateFitTransform(viewport, { width: 0, height: 0 });
    expect(deg2.scale).toBe(1.0);

    const zeroScale = { scale: 0, translationX: 0, translationY: 0, mode: 'manual' as const };
    const pt = screenPointToPagePoint({ x: 100, y: 100 }, zeroScale);
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(0);
  });
});
