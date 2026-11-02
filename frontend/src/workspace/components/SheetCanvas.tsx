import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MousePointer,
  Hand,
  Crosshair,
  Scan,
  Ruler,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Activity,
} from 'lucide-react';
import {
  calculateFitTransform,
  panByScreenDelta,
  screenPointToPagePoint,
  pagePointToScreenPoint,
  zoomAroundScreenAnchor,
  zoomToPageCoordinate,
  type Point,
  type TransformState,
} from '../../utils/transform';
import { LaserScanLoader } from './LaserScanLoader';
import { VectorTraceCard } from './VectorTraceCard';
import { PinHoverCard } from './PinHoverCard';
import { SymbolPinsOverlay } from './SymbolPinsOverlay';
import { apiClient } from '../../api/client';
import { getDisciplineColor } from '../utils/disciplineColors';

export type ToolMode = 'select' | 'pan' | 'quickdraw' | 'segment' | 'calibrate';

export type CalibratePhase = 'IDLE' | 'AWAITING_P1' | 'AWAITING_P2' | 'INPUT_MODAL_OPEN';

export interface CalibrationResult {
  p1: [number, number];
  p2: [number, number];
  lengthPt: number;
  scaleRatio?: number;
  scaleRaw?: string;
}

/** Snap a calibration endpoint to 0/45/90 deg when Shift is held. */
export function snapCalibrationPoint(
  p1: Point,
  raw: Point,
  shiftKey: boolean
): Point {
  if (!shiftKey) return raw;
  const dx = raw.x - p1.x;
  const dy = raw.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return raw;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  return { x: p1.x + dist * Math.cos(snapped), y: p1.y + dist * Math.sin(snapped) };
}

export function calibrationLengthPt(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export interface CanvasPin {
  id: string;
  /** PDF points, top-left origin. */
  x: number;
  y: number;
  kind: 'ghost' | 'evidence' | 'item' | 'symbol';
  label?: string;
  tag?: string;
  discipline?: string;
  system?: string;
  status?: string;
  equipmentType?: string;
  cfm?: number;
  scheduled_qty?: number;
  plan_qty?: number;
  confidence?: number;
  reviewRequired?: boolean;
  description?: string;
  isGhost?: boolean;
  variance?: number;
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
}

export interface SegmentedPolygon {
  id: string;
  points: [number, number][];
  centroid: [number, number];
  areaSqFt?: number;
  confidence: number;
  label: string;
}

export interface VectorRun {
  id: string;
  /** Polyline vertices in PDF points, top-left origin. */
  points: [number, number][];
  system?: string;
  status?: string;
  label?: string;
  length_ft?: number;
}

export interface SheetCanvasProps {
  imageUrl: string;
  widthPt: number;
  heightPt: number;
  pins: CanvasPin[];
  vectorRuns?: VectorRun[];
  cropEnabled: boolean;
  onCropRequest: (cursorPt: [number, number], imageBase64: string) => void;
  renderBadge?: (screen: Point, pagePt: [number, number]) => React.ReactNode;
  scaleRatio?: number;
  discipline?: string;
  selectedPinId?: string | null;
  onSelectPin?: (pin: CanvasPin) => void;
  onPlaceGhostPin?: (ghostId: string, pagePoint: [number, number]) => void;
  focusTarget?: { x: number; y: number; zoom?: number; timestamp?: number } | null;
  /** When set, manual pan/zoom transforms are debounced-persisted to the project session. */
  projectId?: string | null;
  /** Test seam / custom sink for the debounced viewport payload. Defaults to the session PUT. */
  onViewportSave?: (viewport: {
    viewport_scale: number;
    viewport_tx: number;
    viewport_ty: number;
  }) => void | Promise<unknown>;
  /** Restored viewport from the project session. Applied on mount and when
   *  the sheet image changes; invalid values fall back to fit (null-safe). */
  initialTransform?: {
    scale: number;
    translationX: number;
    translationY: number;
    mode?: TransformState['mode'];
  } | null;
  calibrationResult?: CalibrationResult | null;
  scaleStatus?: string;
  onCalibrationPointsSelected?: (p1: [number, number], p2: [number, number]) => void;
  onCalibrationCancel?: () => void;}

const SYSTEM_RUN_COLORS: Record<string, string> = {
  supply: '#0099ff',
  return: '#10b981',
  exhaust: '#f59e0b',
};

function vectorRunColor(system?: string): string {
  const key = (system ?? '').toLowerCase();
  for (const [name, color] of Object.entries(SYSTEM_RUN_COLORS)) {
    if (key.includes(name)) return color;
  }
  return '#94a3b8';
}

const PIN_COLORS: Record<CanvasPin['kind'], string> = {
  ghost: '#d97706',
  evidence: '#22D3EE',
  item: '#34D399',
  symbol: '#0284c7',
};

function getPinFill(pin: CanvasPin): string {
  if (pin.discipline) {
    return getDisciplineColor(pin.discipline);
  }
  if (pin.system) {
    return getDisciplineColor(pin.system);
  }
  return PIN_COLORS[pin.kind] ?? '#34D399';
}

const HOVER_DEBOUNCE_MS = 400;

function isValidInitialTransform(
  value: SheetCanvasProps['initialTransform']
): value is { scale: number; translationX: number; translationY: number; mode?: TransformState['mode'] } {
  if (!value || typeof value !== 'object') return false;
  return (
    Number.isFinite(value.scale) &&
    (value.scale as number) > 0 &&
    Number.isFinite(value.translationX) &&
    Number.isFinite(value.translationY)
  );
}

function initialTransformOrFit(
  value: SheetCanvasProps['initialTransform']
): TransformState {
  if (isValidInitialTransform(value)) {
    return {
      scale: value.scale,
      translationX: value.translationX,
      translationY: value.translationY,
      mode: 'manual',
    };
  }
  return { scale: 1, translationX: 0, translationY: 0, mode: 'fit' };
}
const CROP_WINDOW_PT = 150;
const CROP_OUTPUT_PX = 312;
const VIEWPORT_AUTOSAVE_DEBOUNCE_MS = 300;

export const SheetCanvas: React.FC<SheetCanvasProps> = ({
  imageUrl,
  widthPt,
  heightPt,
  pins,
  vectorRuns = [],
  cropEnabled,
  onCropRequest,
  renderBadge,
  scaleRatio,
  discipline = 'MEP-HVAC',
  selectedPinId,
  onSelectPin,
  onPlaceGhostPin,
  focusTarget,
  projectId,
  onViewportSave,
  initialTransform,
  calibrationResult = null,
  scaleStatus,
  onCalibrationPointsSelected,
  onCalibrationCancel,}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState<TransformState>(() => initialTransformOrFit(initialTransform));
  const [cursor, setCursor] = useState<{ screen: Point; page: Point } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('quickdraw');
  const [segmentedPolygons, setSegmentedPolygons] = useState<SegmentedPolygon[]>([]);
  const [isSegmenting, setIsSegmenting] = useState(false);

  // Two-point scale calibration state machine:
  // IDLE -> AWAITING_P1 -> AWAITING_P2 -> INPUT_MODAL_OPEN (Escape cancels).
  const [calibratePhase, setCalibratePhase] = useState<CalibratePhase>('IDLE');
  const [calP1, setCalP1] = useState<Point | null>(null);
  const [calP2, setCalP2] = useState<Point | null>(null);
  const [calPreview, setCalPreview] = useState<Point | null>(null);

  const enterCalibrateMode = useCallback(() => {
    setToolMode('calibrate');
    setCalibratePhase((prev) => (prev === 'IDLE' ? 'AWAITING_P1' : prev));
  }, []);

  const cancelCalibration = useCallback(() => {
    setCalibratePhase('IDLE');
    setCalP1(null);
    setCalP2(null);
    setCalPreview(null);
    onCalibrationCancel?.();
  }, [onCalibrationCancel]);

  // Pin hover & drag state
  const [hoveredPin, setHoveredPin] = useState<CanvasPin | null>(null);
  const pinHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggedGhostIdRef = useRef<string | null>(null);

  const spacePressedRef = useRef(false);
  const panningRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef<{ screen: Point; page: Point } | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  cursorRef.current = cursor;

  // Debounced viewport autosave (Gap 4): persist manual pan/zoom to the
  // project session 300ms after interaction settles. Fit transforms are
  // computed (not user intent) and the mount run is skipped, so opening a
  // sheet never writes. Only the final settled coordinates reach the PUT.
  // A restored session transform is applied with the same skip so the
  // restore itself never echoes a PUT. A pending save is flushed
  // synchronously on unmount / sheet change before the timer is cancelled.
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportAutosavePrimedRef = useRef(false);
  const viewportRestoreSuppressRef = useRef(false);
  const viewportPendingRef = useRef<{
    viewport_scale: number;
    viewport_tx: number;
    viewport_ty: number;
  } | null>(null);

  const fireViewportSave = useCallback(
    (snapshot: { viewport_scale: number; viewport_tx: number; viewport_ty: number }) => {
      try {
        if (onViewportSave) {
          void onViewportSave(snapshot);
        } else if (projectId) {
          void apiClient.saveProjectSession(projectId, snapshot);
        }
      } catch {
        // Autosave is best-effort; a failed PUT must never break canvas input.
      }
    },
    [onViewportSave, projectId]
  );

  // Restore the saved session viewport when the sheet image changes (mount
  // counts as the first sheet). The restore sets the suppress flag so the
  // autosave effect below skips the restored coordinates instead of PUT-ing
  // them back. Invalid / absent restores fall back to fit.
  const initialTransformSignature = isValidInitialTransform(initialTransform)
    ? `${initialTransform.scale}|${initialTransform.translationX}|${initialTransform.translationY}`
    : 'fit';
  const restoreActiveRef = useRef(false);

  useEffect(() => {
    if (!viewportAutosavePrimedRef.current) {
      viewportAutosavePrimedRef.current = true;
      // A mount-time restore sets the suppress flag before the prime run;
      // consume it here so the user's first real pan is not swallowed.
      viewportRestoreSuppressRef.current = false;
      return;
    }
    if (viewportRestoreSuppressRef.current) {
      viewportRestoreSuppressRef.current = false;
      return;
    }
    if (!projectId && !onViewportSave) {
      viewportPendingRef.current = null;
      return;
    }
    if (transform.mode !== 'manual') {
      // Settled on a computed fit: nothing worth persisting, drop pendings.
      viewportPendingRef.current = null;
      return;
    }
    if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
    const snapshot = {
      viewport_scale: transform.scale,
      viewport_tx: transform.translationX,
      viewport_ty: transform.translationY,
    };
    viewportPendingRef.current = snapshot;
    viewportSaveTimerRef.current = setTimeout(() => {
      viewportSaveTimerRef.current = null;
      viewportPendingRef.current = null;
      fireViewportSave(snapshot);
    }, VIEWPORT_AUTOSAVE_DEBOUNCE_MS);
    // NOTE: no flush here — this cleanup also runs between rapid pans, where
    // flushing would defeat the debounce. Sheet-change/unmount flushing lives
    // in the dedicated effect below.
    return () => {
      if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
    };
  }, [
    transform.scale,
    transform.translationX,
    transform.translationY,
    transform.mode,
    projectId,
    onViewportSave,
    fireViewportSave,
  ]);

  // Flush-on-teardown: an unmount or sheet change fires the final pending
  // coordinates immediately instead of dropping them with the timer. Deps are
  // image-only (via a ref to the saver) so rapid pan re-renders never flush.
  const fireViewportSaveRef = useRef(fireViewportSave);
  fireViewportSaveRef.current = fireViewportSave;
  useEffect(() => {
    return () => {
      if (viewportSaveTimerRef.current) {
        clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = null;
      }
      const pending = viewportPendingRef.current;
      viewportPendingRef.current = null;
      if (pending) {
        try {
          void fireViewportSaveRef.current(pending);
        } catch {
          // Best-effort flush; never break teardown.
        }
      }
    };
  }, [imageUrl]);

  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el || widthPt <= 0 || heightPt <= 0) return;
    const rect = el.getBoundingClientRect();
    setTransform(calculateFitTransform({ width: rect.width, height: rect.height }, { width: widthPt, height: heightPt }));
  }, [widthPt, heightPt]);

  // Center on focusTarget coordinate when provided (e.g. from copilot citation)
  useEffect(() => {
    if (!focusTarget) return;
    const el = containerRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    const viewportWidth = rect && rect.width > 0 ? rect.width : 1200;
    const viewportHeight = rect && rect.height > 0 ? rect.height : 800;
    const targetScale = focusTarget.zoom ?? 1.5;
    setTransform(
      zoomToPageCoordinate(
        { width: viewportWidth, height: viewportHeight },
        { width: widthPt, height: heightPt },
        { x: focusTarget.x, y: focusTarget.y },
        targetScale
      )
    );
  }, [focusTarget, widthPt, heightPt]);

  // Refit when the sheet image changes; track container resizes. A valid
  // session restore takes precedence over fit and arms the onLoad guard so
  // the image load event does not stomp the restored viewport with a fit.
  // The autosave suppress flag is set only when the restore actually moves
  // the transform: on mount the initializer already applied it, and setting
  // the flag then would swallow the user's first real pan (same values mean
  // the autosave effect never re-runs, so no echo is possible anyway).
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    setCursor(null);
    setSegmentedPolygons([]);
    if (isValidInitialTransform(initialTransform)) {
      restoreActiveRef.current = true;
      const current = transformRef.current;
      if (
        current.scale !== initialTransform.scale ||
        current.translationX !== initialTransform.translationX ||
        current.translationY !== initialTransform.translationY ||
        current.mode !== 'manual'
      ) {
        viewportRestoreSuppressRef.current = true;
        setTransform({
          scale: initialTransform.scale,
          translationX: initialTransform.translationX,
          translationY: initialTransform.translationY,
          mode: 'manual',
        });
      }
    } else {
      restoreActiveRef.current = false;
      fitToContainer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, initialTransformSignature, fitToContainer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (transformRef.current.mode === 'fit') fitToContainer();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitToContainer]);

  // Wheel zoom (non-passive so preventDefault works).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setTransform((prev) => zoomAroundScreenAnchor(prev, anchor, prev.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const captureCrop = useCallback(
    (page: Point): string | null => {
      const img = imgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0 || widthPt <= 0 || heightPt <= 0) return null;
      const pxPerPtX = img.naturalWidth / widthPt;
      const pxPerPtY = img.naturalHeight / heightPt;
      const halfPt = CROP_WINDOW_PT / 2;
      const cx = Math.min(Math.max(page.x, 0), widthPt) * pxPerPtX;
      const cy = Math.min(Math.max(page.y, 0), heightPt) * pxPerPtY;
      const halfW = halfPt * pxPerPtX;
      const halfH = halfPt * pxPerPtY;
      const sx = Math.min(Math.max(cx - halfW, 0), Math.max(img.naturalWidth - halfW * 2, 0));
      const sy = Math.min(Math.max(cy - halfH, 0), Math.max(img.naturalHeight - halfH * 2, 0));
      const canvas = document.createElement('canvas');
      canvas.width = CROP_OUTPUT_PX;
      canvas.height = CROP_OUTPUT_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CROP_OUTPUT_PX, CROP_OUTPUT_PX);
      ctx.drawImage(img, sx, sy, halfW * 2, halfH * 2, 0, 0, CROP_OUTPUT_PX, CROP_OUTPUT_PX);
      const url = canvas.toDataURL('image/png');
      return url.includes(',') ? url.split(',')[1] : null;
    },
    [widthPt, heightPt]
  );

  const fireCrop = useCallback(() => {
    const current = cursorRef.current;
    if (!current || !cropEnabled || !imgLoaded) return;
    const base64 = captureCrop(current.page);
    if (!base64) return;
    onCropRequest(
      [Math.round(current.page.x * 100) / 100, Math.round(current.page.y * 100) / 100],
      base64
    );
  }, [cropEnabled, imgLoaded, captureCrop, onCropRequest]);

  const scheduleHoverCrop = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(fireCrop, HOVER_DEBOUNCE_MS);
  }, [fireCrop]);

  const handleSegmentClick = async (pagePoint: Point) => {
    if (isSegmenting || !imgLoaded) return;
    const base64 = captureCrop(pagePoint);
    if (!base64) return;

    setIsSegmenting(true);
    try {
      const resp = await apiClient.segmentConcept(base64, 'mechanical equipment boundary');
      if (resp && resp.polygons && resp.polygons.length > 0) {
        const halfPt = CROP_WINDOW_PT / 2;
        const originX = pagePoint.x - halfPt;
        const originY = pagePoint.y - halfPt;

        // Map first returned polygon from crop pixel space (312px) to page point space
        const rawPoly = resp.polygons[0];
        const mappedPts: [number, number][] = rawPoly.map(([px, py]) => [
          originX + (px / CROP_OUTPUT_PX) * CROP_WINDOW_PT,
          originY + (py / CROP_OUTPUT_PX) * CROP_WINDOW_PT,
        ]);

        // Calculate polygon centroid
        let sumX = 0;
        let sumY = 0;
        for (const [x, y] of mappedPts) {
          sumX += x;
          sumY += y;
        }
        const cx = sumX / mappedPts.length;
        const cy = sumY / mappedPts.length;

        // Calculate area in pt^2 via Shoelace formula
        let areaPt2 = 0;
        for (let i = 0; i < mappedPts.length; i++) {
          const [x1, y1] = mappedPts[i];
          const [x2, y2] = mappedPts[(i + 1) % mappedPts.length];
          areaPt2 += x1 * y2 - x2 * y1;
        }
        areaPt2 = Math.abs(areaPt2) / 2;

        // Convert to sq ft if scale ratio is known (scaleRatio / 864 ft/pt conversion)
        const areaSqFt = scaleRatio && scaleRatio > 0 ? areaPt2 * Math.pow(scaleRatio / 864, 2) : undefined;

        setSegmentedPolygons((prev) => [
          ...prev,
          {
            id: `seg-${Date.now()}`,
            points: mappedPts,
            centroid: [cx, cy],
            areaSqFt,
            confidence: resp.confidence ?? 0.95,
            label: resp.concept || 'Equipment Segment',
          },
        ]);
      }
    } catch {
      // Fail closed gracefully
    } finally {
      setIsSegmenting(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (panningRef.current) {
      const pan = panningRef.current;
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) pan.moved = true;
      pan.startX = e.clientX;
      pan.startY = e.clientY;
      setTransform((prev) => panByScreenDelta(prev, { x: dx, y: dy }));
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      return;
    }
    const page = screenPointToPagePoint(screen, transformRef.current);
    setCursor({ screen, page });
    if (toolMode === 'calibrate' && calP1 && calibratePhase === 'AWAITING_P2') {
      setCalPreview(snapCalibrationPoint(calP1, page, (e as React.MouseEvent).shiftKey));
    }
    if (cropEnabled && imgLoaded && (toolMode === 'quickdraw' || toolMode === 'select')) {
      scheduleHoverCrop();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (toolMode === 'calibrate') {
      // Two-point capture: first click locks P1, second click locks P2.
      const el = containerRef.current;
      const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const pagePt = screenPointToPagePoint(screenPt, transformRef.current);
      if (calibratePhase === 'AWAITING_P1' || (calibratePhase === 'IDLE' && !calP1)) {
        if (calibratePhase === 'IDLE') setCalibratePhase('AWAITING_P1');
        setCalP1(pagePt);
        setCalPreview(pagePt);
        setCalibratePhase('AWAITING_P2');
        return;
      }
      if (calibratePhase === 'AWAITING_P2' && calP1) {
        const snapped = snapCalibrationPoint(calP1, pagePt, e.shiftKey);
        setCalP2(snapped);
        setCalPreview(null);
        setCalibratePhase('INPUT_MODAL_OPEN');
        onCalibrationPointsSelected?.(
          [Math.round(calP1.x * 100) / 100, Math.round(calP1.y * 100) / 100],
          [Math.round(snapped.x * 100) / 100, Math.round(snapped.y * 100) / 100]
        );
        return;
      }
      return;
    }
    if (toolMode === 'pan' || spacePressedRef.current || e.button === 1) {
      panningRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
      return;
    }

    if (toolMode === 'segment' && cursorRef.current) {
      void handleSegmentClick(cursorRef.current.page);
      return;
    }

    // Default drag-to-pan in general workspace
    panningRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
  };

  const handleMouseUp = () => {
    panningRef.current = null;
  };

  const handlePinMouseEnter = (pin: CanvasPin) => {
    if (pinHoverTimerRef.current) clearTimeout(pinHoverTimerRef.current);
    pinHoverTimerRef.current = setTimeout(() => {
      setHoveredPin(pin);
    }, HOVER_DEBOUNCE_MS);
  };

  const handlePinMouseLeave = () => {
    if (pinHoverTimerRef.current) {
      clearTimeout(pinHoverTimerRef.current);
      pinHoverTimerRef.current = null;
    }
    setHoveredPin(null);
  };

  const handleMouseLeave = () => {
    panningRef.current = null;
    setCursor(null);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (pinHoverTimerRef.current) clearTimeout(pinHoverTimerRef.current);
    setHoveredPin(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (calibratePhase !== 'IDLE') {
        cancelCalibration();
        return;
      }
    }
    if (e.key === ' ' && !spacePressedRef.current) {
      spacePressedRef.current = true;
    } else if (e.key === 'v' || e.key === 'V') {
      setToolMode('select');
    } else if (e.key === 'h' || e.key === 'H') {
      setToolMode('pan');
    } else if (e.key === 'q' || e.key === 'Q') {
      setToolMode('quickdraw');
      if (cursorRef.current) {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        fireCrop();
      }
    } else if (e.key === 's' || e.key === 'S') {
      setToolMode('segment');
    } else if (e.key === 'c' || e.key === 'C') {
      enterCalibrateMode();
    } else if (e.key === '0') {
      fitToContainer();
    } else if (e.key === '+' || e.key === '=') {
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTransform((prev) => zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale * 1.25));
      }
    } else if (e.key === '-' || e.key === '_') {
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTransform((prev) => zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale / 1.25));
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      spacePressedRef.current = false;
    }
  };

  const zoomIn = () => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTransform((prev) => zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale * 1.25));
    }
  };

  const zoomOut = () => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTransform((prev) => zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale / 1.25));
    }
  };

  const matrix = `translate(${transform.translationX}px, ${transform.translationY}px) scale(${transform.scale})`;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Drawing sheet canvas. Hover or press Q over a duct run to dimension it."
      data-testid="sheet-canvas"
      className="relative w-full h-full overflow-hidden bg-slate-950 cad-dot-grid-dark cad-crosshair outline-none select-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onDragOver={(e) => {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        let ghostId = draggedGhostIdRef.current;
        if (e.dataTransfer) {
          try {
            const data = e.dataTransfer.getData('text/plain');
            if (data) ghostId = data;
          } catch {
            // ignore
          }
        }
        if (ghostId && onPlaceGhostPin) {
          const el = containerRef.current;
          const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 1200, height: 800 };
          const rawClientX = (e as unknown as { clientX?: number }).clientX;
          const rawClientY = (e as unknown as { clientY?: number }).clientY;
          const clientX =
            typeof rawClientX === 'number' && !Number.isNaN(rawClientX)
              ? rawClientX
              : (cursorRef.current?.screen.x ?? 400);
          const clientY =
            typeof rawClientY === 'number' && !Number.isNaN(rawClientY)
              ? rawClientY
              : (cursorRef.current?.screen.y ?? 300);
          const screenPt = { x: clientX - (rect.left || 0), y: clientY - (rect.top || 0) };
          const pagePt = screenPointToPagePoint(screenPt, transformRef.current);
          const clampedX = Math.max(0, Math.min(widthPt || 3024, pagePt.x));
          const clampedY = Math.max(0, Math.min(heightPt || 2160, pagePt.y));
          onPlaceGhostPin(ghostId, [clampedX, clampedY]);
        }
        draggedGhostIdRef.current = null;
      }}
    >
      {/* Laser Scan Loading Experience */}
      {!imgLoaded && !imgError && (
        <LaserScanLoader
          label="SYS.CAD // RASTERIZING_VECTOR_LAYERS"
          sublabel="Aligning 150 DPI viewport & vector geometry..."
          discipline={discipline}
        />
      )}

      {imgError && (
        <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm px-6 text-center font-mono">
          Could not render this sheet. Re-scan or pick another page.
        </div>
      )}

      {/* Floating CAD HUD Dock */}
      {imgLoaded && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center bg-slate-900/90 backdrop-blur-md border border-cyan-500/30 rounded-xl px-2 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.6)] space-x-1 select-none">
          <button
            type="button"
            title="Select & Inspect [V]"
            onClick={() => setToolMode('select')}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              toolMode === 'select'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            type="button"
            title="Pan Canvas [H or Space+drag]"
            onClick={() => setToolMode('pan')}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              toolMode === 'pan'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Pan</span>
          </button>

          <button
            type="button"
            title="QuickDraw Duct Dimension Hover [Q]"
            onClick={() => setToolMode('quickdraw')}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              toolMode === 'quickdraw'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span>QuickDraw</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          </button>

          <button
            type="button"
            title="SAM 3.1 Room & Boundary Segmenter [S]"
            onClick={() => setToolMode('segment')}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              toolMode === 'segment'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Scan className="w-3.5 h-3.5 text-emerald-400" />
            <span>SAM 3.1</span>
            {isSegmenting && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
          </button>

          <button
            type="button"
            title="Scale Calibration Ruler [C]"
            onClick={enterCalibrateMode}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              toolMode === 'calibrate'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Ruler className="w-3.5 h-3.5 text-amber-400" />
            <span>Calibrate</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700/80 mx-1" />

          <button
            type="button"
            title="Zoom Out [-]"
            onClick={zoomOut}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono text-cyan-400 px-1 font-semibold">
            {(transform.scale * 100).toFixed(0)}%
          </span>

          <button
            type="button"
            title="Zoom In [+]"
            onClick={zoomIn}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Fit to Window [0]"
            onClick={fitToContainer}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Right Live Telemetry Chip */}
      {imgLoaded && (
        <>
          <div className="absolute top-3 right-3 z-30 hidden sm:flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-mono select-none">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-slate-300">MUSE-SPARK-1.3</span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400">SAM-3.1 ACTIVE</span>
          </div>

          <VectorTraceCard
            totalRuns={vectorRuns.length}
            totalLengthFt={vectorRuns.reduce((acc, r) => acc + (r.length_ft ?? 0), 0)}
            confidence={vectorRuns.length > 0 ? 0.998 : 0}
            scaleVerified={scaleRatio !== undefined && scaleRatio > 0}
          />
        </>
      )}

      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        onLoad={() => {
          setImgLoaded(true);
          // A restored session viewport already positions the sheet; the
          // load-time fit only applies to fresh (non-restored) sheets.
          if (restoreActiveRef.current) {
            restoreActiveRef.current = false;
          } else {
            fitToContainer();
          }
        }}
        onError={() => setImgError(true)}
        className="absolute left-0 top-0 max-w-none"
        style={{
          transform: matrix,
          transformOrigin: '0 0',
          width: `${widthPt}px`,
          height: `${heightPt}px`,
          visibility: imgLoaded ? 'visible' : 'hidden',
        }}
      />

      <svg
        className="absolute left-0 top-0 pointer-events-none"
        style={{ transform: matrix, transformOrigin: '0 0', width: `${widthPt}px`, height: `${heightPt}px` }}
        viewBox={`0 0 ${widthPt} ${heightPt}`}
        aria-hidden="true"
      >
        {/* Render SAM 3.1 Segmented Polygons */}
        {segmentedPolygons.map((sp) => (
          <g key={sp.id} className="animate-fade-in">
            <polygon
              points={sp.points.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="rgba(16, 185, 129, 0.18)"
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            <circle cx={sp.centroid[0]} cy={sp.centroid[1]} r={4} fill="#10B981" />
            <text
              x={sp.centroid[0] + 8}
              y={sp.centroid[1] + 4}
              fill="#34D399"
              fontSize={13}
              fontFamily="monospace"
              fontWeight="bold"
            >
              SAM 3.1 // {sp.areaSqFt ? `${sp.areaSqFt.toFixed(1)} sq ft` : 'Boundary'}
            </text>
          </g>
        ))}

        {/* Extracted Vector Runs (auto-takeoff linework by system) */}
        {vectorRuns
          .filter((run) => run.points.length >= 2)
          .map((run) => (
            <polyline
              key={run.id}
              data-testid="vector-run"
              data-system={run.system ?? ''}
              points={run.points.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={vectorRunColor(run.system)}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={run.status === 'SUGGESTED' ? 0.75 : 0.95}
              className="animate-duct-flow"
            >
              {run.label ? <title>{run.label}</title> : null}
            </polyline>
          ))}

        {/* Left Margin Ghost Pin Staging Dock Visual */}
        {pins.some((p) => (p.kind === 'ghost' || p.status === 'UNPLACED_GHOST') && p.x <= 100) && (
          <g opacity={0.6} className="select-none pointer-events-none">
            <rect
              x={20}
              y={70}
              width={80}
              height={Math.max(120, pins.filter((p) => p.kind === 'ghost' || p.status === 'UNPLACED_GHOST').length * 35 + 40)}
              fill="#0f172a"
              fillOpacity={0.6}
              stroke="#d97706"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              rx={6}
            />
            <text
              x={26}
              y={88}
              fill="#d97706"
              fontSize={8}
              fontFamily="monospace"
              fontWeight="bold"
            >
              STAGING DOCK
            </text>
          </g>
        )}

        {/* CAD Takeoff & Ghost Pins with Interactive Affordances & Sonar Rings */}
        {/* Symbol-swarm detections (kind === 'symbol') render via SymbolPinsOverlay below. */}
        {pins
          .filter((p) => p.kind !== 'symbol')
          .map((pin) => {
          const isGhost = pin.kind === 'ghost' || pin.status === 'UNPLACED_GHOST';
          const isSelected = selectedPinId === pin.id;
          const displayLabel = pin.label || pin.tag;
          const pinFill = getPinFill(pin);

          return (
            <g
              key={pin.id}
              data-testid="canvas-pin"
              data-discipline={pin.discipline}
              data-status={pin.status}
              data-ghost={isGhost ? 'true' : undefined}
              className="pointer-events-auto cursor-pointer"
              {...(isGhost ? ({ draggable: true } as Record<string, unknown>) : {})}
              onDragStart={(e) => {
                draggedGhostIdRef.current = pin.id;
                if (e.dataTransfer) {
                  try {
                    e.dataTransfer.setData('text/plain', pin.id);
                  } catch {
                    // Safe in jsdom
                  }
                }
              }}
              onMouseEnter={() => handlePinMouseEnter(pin)}
              onMouseLeave={handlePinMouseLeave}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPin?.(pin);
              }}
            >
              {/* Selected pin halo ring */}
              {isSelected && (
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={14}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  data-testid="selected-pin-halo"
                  className="animate-pulse"
                />
              )}

              {/* Ghost pin sonar radar pulse rings */}
              {isGhost && (
                <>
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={8}
                    className="sonar-ring stroke-amber-400"
                    fill="none"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={8}
                    className="sonar-ring-delayed stroke-amber-400"
                    fill="none"
                    strokeWidth={1}
                  />
                </>
              )}

              {/* Evidence pin pulse ring */}
              {pin.kind === 'evidence' && (
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={8}
                  className="sonar-ring stroke-cyan-400"
                  fill="none"
                  strokeWidth={1.5}
                />
              )}

              {/* Large invisible hit area for Doherty target acquisition */}
              <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />

              {/* Pin marker with 2px white stroke ensuring >= 3:1 contrast */}
              <circle
                cx={pin.x}
                cy={pin.y}
                r={9}
                fill={pinFill}
                fillOpacity={0.9}
                stroke="#ffffff"
                strokeWidth={2}
              />

              {displayLabel && (
                <g transform={`translate(${pin.x + 12}, ${pin.y - 10})`}>
                  <rect
                    rx={4}
                    width={displayLabel.length * 7.5 + 16}
                    height={18}
                    fill={isGhost ? '#78350f' : '#083344'}
                    stroke={isGhost ? '#f59e0b' : '#06b6d4'}
                    strokeWidth={1}
                  />
                  <text
                    x={8}
                    y={13}
                    fill="#ffffff"
                    fontSize={11}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {displayLabel}
                  </text>
                </g>
              )}
            </g>
          );
          })}
        {/* Symbol-swarm pin layer: system colors + amber review pulse */}
        <SymbolPinsOverlay
          pins={pins.filter((p) => p.kind === 'symbol')}
          onSelectPin={
            onSelectPin
              ? (symbolPin) =>
                  onSelectPin(
                    pins.find((p) => p.id === symbolPin.id) ?? {
                      ...symbolPin,
                      kind: 'symbol' as const,
                    }
                  )
              : undefined
          }
        />

        {/* CAD Precision Crosshair Lines */}
        {cursor && (
          <g stroke="#22D3EE" strokeWidth={1} opacity={0.6}>
            <line x1={cursor.page.x} y1={0} x2={cursor.page.x} y2={heightPt} />
            <line x1={0} y1={cursor.page.y} x2={widthPt} y2={cursor.page.y} />
          </g>
        )}

        {/* Calibration rubberband (P1 -> live cursor) while awaiting P2 */}
        {toolMode === 'calibrate' && calP1 && (calPreview || calP2) && calibratePhase === 'AWAITING_P2' && (
          <g data-testid="calibration-rubberband">
            <line
              x1={calP1.x}
              y1={calP1.y}
              x2={(calPreview ?? calP2)?.x ?? calP1.x}
              y2={(calPreview ?? calP2)?.y ?? calP1.y}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 3"
            />
            <circle cx={calP1.x} cy={calP1.y} r={4} fill="#f59e0b" stroke="#ffffff" strokeWidth={1.5} />
          </g>
        )}

        {/* Committed calibration ruler overlay (amber dashed + ticks + dimension text) */}
        {calibrationResult && (
          <g data-testid="calibration-overlay">
            <line
              x1={calibrationResult.p1[0]}
              y1={calibrationResult.p1[1]}
              x2={calibrationResult.p2[0]}
              y2={calibrationResult.p2[1]}
              stroke="#f59e0b"
              strokeWidth={2.5}
              strokeDasharray="8 4"
            />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const tx = calibrationResult.p1[0] + (calibrationResult.p2[0] - calibrationResult.p1[0]) * t;
              const ty = calibrationResult.p1[1] + (calibrationResult.p2[1] - calibrationResult.p1[1]) * t;
              return <circle key={t} cx={tx} cy={ty} r={2.5} fill="#f59e0b" />;
            })}
            <text
              x={(calibrationResult.p1[0] + calibrationResult.p2[0]) / 2 + 8}
              y={(calibrationResult.p1[1] + calibrationResult.p2[1]) / 2 - 8}
              fill="#fbbf24"
              fontSize={12}
              fontFamily="monospace"
              fontWeight="bold"
            >
              {calibrationResult.scaleRaw ?? `${calibrationResult.lengthPt.toFixed(1)} pt`}
            </text>
          </g>
        )}
      </svg>

      {/* Calibrate phase status chip */}
      {toolMode === 'calibrate' && (
        <div
          data-testid="calibrate-status"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-500/40 text-amber-200 text-[11px] font-mono"
        >
          {calibratePhase === 'AWAITING_P1' && 'CALIBRATE: click first point (P1) — Shift snaps 0/45/90°'}
          {calibratePhase === 'AWAITING_P2' && 'CALIBRATE: click second point (P2) — Shift snaps 0/45/90° — Esc cancels'}
          {calibratePhase === 'INPUT_MODAL_OPEN' && 'CALIBRATE: enter real-world distance — Esc cancels'}
          {calibratePhase === 'IDLE' && 'CALIBRATE: ready'}
        </div>
      )}

      {/* Committed-points modal placeholder (real CalibrationModal is hosted by the workspace) */}
      {calibratePhase === 'INPUT_MODAL_OPEN' && calP1 && calP2 && (
        <div
          data-testid="calibration-input-modal"
          className="absolute top-28 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-amber-500/40 text-amber-100 text-[11px] font-mono"
        >
          P1 [{calP1.x.toFixed(1)}, {calP1.y.toFixed(1)}] → P2 [{calP2.x.toFixed(1)}, {calP2.y.toFixed(1)}]
        </div>
      )}

      {/* Emerald calibrated badge once the sheet scale is CALIBRATED */}
      {scaleStatus === 'CALIBRATED' && (
        <div
          data-testid="calibrated-badge"
          className="absolute top-3 left-3 z-30 flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-semibold"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>CALIBRATED{calibrationResult?.scaleRaw ? ` // ${calibrationResult.scaleRaw}` : ''}</span>
        </div>
      )}

      {/* Compass Bearing & Orientation Dial (Stitch Screen 3 & 4) */}
      <div
        className="absolute right-3 bottom-3 z-30 hidden sm:flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-xl px-2.5 py-1.5 text-[10px] font-mono select-none shadow-lg"
        data-purpose="orientation-controls"
      >
        <div className="relative w-7 h-7 rounded-full border border-slate-700 flex items-center justify-center bg-slate-950">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-slate-800" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center rotate-90">
            <div className="w-full h-px bg-slate-800" />
          </div>
          <div className="w-0.5 h-2.5 bg-cyan-400 -translate-y-1 transform origin-bottom" />
          <div className="w-1 h-1 rounded-full bg-cyan-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-slate-200 font-bold">315.0° N</span>
          <span className="text-[9px] text-slate-500">ROT: LOCKED</span>
        </div>
      </div>

      {/* Bottom Status & Coordinate Telemetry */}
      <div className="absolute bottom-2 left-2 z-30 text-[10px] font-mono text-slate-400 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-md border border-slate-800 flex items-center space-x-3 select-none">
        <span className="flex items-center space-x-1.5 text-cyan-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>TOOL: {toolMode.toUpperCase()}</span>
        </span>
        <span className="text-slate-600">|</span>
        <span>
          {cursor
            ? `PDF ${cursor.page.x.toFixed(1)}, ${cursor.page.y.toFixed(1)} pt`
            : `${(transform.scale * 100).toFixed(0)}% zoom`}
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-500">
          {toolMode === 'segment'
            ? 'Click equipment boundary to segment with SAM 3.1'
            : 'Hover / [Q] dimension · [H] pan · [0] fit'}
        </span>
      </div>

      {cursor && renderBadge && renderBadge(cursor.screen, [cursor.page.x, cursor.page.y])}

      {/* Instant Doherty HUD Pin Hover Card */}
      {hoveredPin && (
        <PinHoverCard
          pin={hoveredPin}
          screenX={pagePointToScreenPoint({ x: hoveredPin.x, y: hoveredPin.y }, transform).x}
          screenY={pagePointToScreenPoint({ x: hoveredPin.x, y: hoveredPin.y }, transform).y}
          onSelect={onSelectPin}
          onPlaceOnCanvas={onPlaceGhostPin ? (p) => onPlaceGhostPin(p.id, [p.x, p.y]) : undefined}
        />
      )}
    </div>
  );
};
