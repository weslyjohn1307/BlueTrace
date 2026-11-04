import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MousePointer,
  Hand,
  Crosshair,
  Scan,
  Ruler,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
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
import {
  LayerControls,
  DEFAULT_LAYER_VISIBILITY,
  type LayerVisibility,
  type SystemLegendEntry,
} from './LayerControls';
import { PinHoverCard } from './PinHoverCard';
import { SymbolPinsOverlay } from './SymbolPinsOverlay';
import { apiClient } from '../../api/client';
import type { ScaleStatus } from '../../api/contracts';
import { displaySystemLabel, getOverlayColor, OVERLAY_COLORS } from '../utils/disciplineColors';
import { Tooltip } from '../../components/Tooltip';

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
// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
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
  /** PDF point bounds for symbol detections, in [x0, y0, x1, y1] order. */
  bbox?: [number, number, number, number];
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
  confidence?: number;
  label: string;
}

export interface VectorRun {
  id: string;
  /** Polyline vertices in PDF points, top-left origin. */
  points: [number, number][];
  system?: string;
  status?: string;
  reviewRequired?: boolean;
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
  scaleStatus?: ScaleStatus;
  onCalibrationPointsSelected?: (p1: [number, number], p2: [number, number]) => void;
  onCalibrationCancel?: () => void;
  /** Instant 72 DPI blur-up thumbnail preview during sheet transitions. */
  thumbnailUrl?: string;
}

function vectorRunColor(system?: string): string {
  return getOverlayColor(system);
}

function vectorRunDash(system?: string, reviewRequired = false): string | undefined {
  if (reviewRequired) return '5 3';
  const key = (system ?? '').toLowerCase();
  if (/electrical|power|lighting|conduit/.test(key)) return '8 4';
  if (/water|plumb|piping|sanitary|waste|sewer|chilled|heating water|hhw/.test(key)) return '10 3 2 3';
  return undefined;
}

const PIN_COLORS: Record<CanvasPin['kind'], string> = {
  ghost: OVERLAY_COLORS.ghost,
  evidence: OVERLAY_COLORS.evidence,
  item: OVERLAY_COLORS.item,
  symbol: OVERLAY_COLORS.supply,
};

function getPinFill(pin: CanvasPin): string {
  if (pin.kind === 'ghost' || pin.status === 'UNPLACED_GHOST') return OVERLAY_COLORS.ghost;
  if (pin.system) return getOverlayColor(pin.system);
  if (pin.discipline) return getOverlayColor(pin.discipline);
  return PIN_COLORS[pin.kind] ?? OVERLAY_COLORS.item;
}

const HOVER_DEBOUNCE_MS = 250;

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

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  shortcut: string;
  accent?: 'cyan' | 'emerald' | 'amber';
  icon: React.ReactNode;
  busy?: boolean;
}

const TOOL_ACTIVE: Record<NonNullable<ToolButtonProps['accent']>, string> = {
  cyan: 'bg-[#005BFF]/25 text-[#9BDCFF] ring-1 ring-inset ring-[#37C6FF]/45',
  emerald: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-inset ring-emerald-400/45',
  amber: 'bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-400/45',
};

const ToolButton: React.FC<ToolButtonProps> = ({
  active,
  onClick,
  title,
  label,
  shortcut,
  accent = 'cyan',
  icon,
  busy = false,
}) => {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  return (
  <span
    className="group relative inline-flex"
    onMouseEnter={() => setTooltipDismissed(false)}
    onMouseLeave={() => setTooltipDismissed(false)}
    onFocusCapture={() => setTooltipDismissed(false)}
    onKeyDown={(event) => {
      if (event.key === 'Escape') setTooltipDismissed(true);
    }}
  >
  <button
    type="button"
    onClick={onClick}
    aria-label={`${label} (${shortcut})`}
    aria-describedby={`canvas-tool-${shortcut.toLowerCase()}-tooltip`}
    aria-keyshortcuts={shortcut}
    aria-pressed={active}
    className={`inline-flex h-10 w-10 items-center justify-center rounded-md text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37C6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220] ${
      active
        ? TOOL_ACTIVE[accent]
        : 'text-bt-text-secondary hover:bg-bt-panel hover:text-bt-text-primary'
    }`}
  >
    {icon}
    {busy ? (
      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
    ) : null}
  </button>
  <Tooltip id={`canvas-tool-${shortcut.toLowerCase()}-tooltip`} visible={!tooltipDismissed}>{title}</Tooltip>
  </span>
  );
};

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
  onCalibrationCancel,
  thumbnailUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState<TransformState>(() => initialTransformOrFit(initialTransform));
  const [cursor, setCursor] = useState<{ screen: Point; page: Point } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [layersOpen, setLayersOpen] = useState(false);
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
            confidence: resp.confidence,
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
    if (cropEnabled && imgLoaded && toolMode === 'quickdraw') {
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
      if (layersOpen) {
        setLayersOpen(false);
        return;
      }
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
    } else if (e.key === 'l' || e.key === 'L') {
      setLayersOpen((open) => !open);
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

  const isGhostPin = (pin: CanvasPin) => pin.kind === 'ghost' || pin.status === 'UNPLACED_GHOST';
  const layerCounts = useMemo(
    () => ({
      vector: vectorRuns.length,
      components: pins.filter((pin) => pin.kind === 'symbol' || pin.kind === 'item').length,
      ghosts: pins.filter((pin) => pin.kind === 'ghost' || pin.status === 'UNPLACED_GHOST').length,
      evidence: pins.filter((pin) => pin.kind === 'evidence').length,
      review:
        vectorRuns.filter((run) => run.reviewRequired).length +
        pins.filter((pin) => pin.reviewRequired).length,
    }),
    [pins, vectorRuns]
  );
  const layerSystems = useMemo(() => {
    const grouped = new Map<string, SystemLegendEntry>();
    for (const run of vectorRuns) {
      const label = displaySystemLabel(run.system);
      const current = grouped.get(label);
      if (current) current.count += 1;
      else grouped.set(label, { label, color: vectorRunColor(run.system), count: 1, dash: vectorRunDash(run.system) });
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count);
  }, [vectorRuns]);

  const visibleVectorRuns = layers.vector ? vectorRuns : [];
  const visiblePins = pins.filter((pin) => {
    if (pin.kind === 'symbol' || pin.kind === 'item') return layers.components;
    if (isGhostPin(pin)) return layers.ghosts;
    if (pin.kind === 'evidence') return layers.evidence;
    return true;
  });

  const toolCopy: Record<ToolMode, { label: string; shortcut: string; hint: string }> = {
    select: {
      label: 'Select',
      shortcut: 'V',
      hint: 'Select a pin or ledger item to inspect its evidence.',
    },
    pan: {
      label: 'Pan',
      shortcut: 'H',
      hint: 'Drag to move the sheet. Space-drag or the middle mouse button works in any tool.',
    },
    quickdraw: {
      label: 'QuickDraw',
      shortcut: 'Q',
      hint: 'Hover a duct or tag and hold still to read its dimension. Sends one crop to Meta per hover.',
    },
    segment: {
      label: 'Segment',
      shortcut: 'S',
      hint: 'Click an equipment boundary to request a SAM 3.1 mask. Results stay in review.',
    },
    calibrate: {
      label: 'Calibrate',
      shortcut: 'C',
      hint: 'Click two points with a known real distance to set this sheet scale.',
    },
  };
  const activeTool = toolCopy[toolMode];
  const totalLengthFt = vectorRuns.reduce((sum, run) => sum + (run.length_ft ?? 0), 0);

  // Compact key in the reserved status strip. With the vector layer on and no
  // systems traced yet we still show the standard system colors: it is a color
  // key, not a claim that geometry exists. Counts appear only for real runs.
  const fallbackSystemLegend: SystemLegendEntry[] = [
    { label: 'Mechanical', color: OVERLAY_COLORS.supply, count: 0 },
    { label: 'Electrical', color: OVERLAY_COLORS.electrical, count: 0 },
    { label: 'Plumbing', color: OVERLAY_COLORS.coldWater, count: 0 },
  ];
  const legendSystems = layers.vector
    ? layerSystems.length > 0
      ? layerSystems
      : fallbackSystemLegend
    : [];
  const legendIsEmpty =
    legendSystems.length === 0 && !layers.components && !layers.ghosts;

  return (
    <div
      data-testid="sheet-canvas-shell"
      className="flex h-full min-h-0 w-full flex-col bg-bt-canvas"
    >
      {/* Reserved tool dock above the drawing: no control sits over evidence. */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-1.5 border-b border-bt-border-subtle bg-bt-surface px-3 py-1.5">
        <div role="toolbar" aria-label="Canvas tools" className="flex items-center gap-1">
          <ToolButton
            active={toolMode === 'select'}
            onClick={() => setToolMode('select')}
            title="Select and inspect [V]"
            label="Select"
            shortcut="V"
            icon={<MousePointer className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <ToolButton
            active={toolMode === 'pan'}
            onClick={() => setToolMode('pan')}
            title="Pan the sheet [H or Space+drag]"
            label="Pan"
            shortcut="H"
            icon={<Hand className="h-3.5 w-3.5" aria-hidden="true" />}
          />

          <span className="mx-1 h-4 w-px bg-bt-panel" aria-hidden="true" />

          <ToolButton
            active={toolMode === 'quickdraw'}
            onClick={() => setToolMode('quickdraw')}
            title="QuickDraw duct dimension [Q]"
            label="QuickDraw"
            shortcut="Q"
            icon={<Crosshair className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <ToolButton
            active={toolMode === 'segment'}
            onClick={() => setToolMode('segment')}
            title="Segment an equipment boundary [S]"
            label="Segment"
            shortcut="S"
            accent="emerald"
            busy={isSegmenting}
            icon={<Scan className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <ToolButton
            active={toolMode === 'calibrate'}
            onClick={enterCalibrateMode}
            title="Scale Calibration Ruler [C]"
            label="Calibrate"
            shortcut="C"
            accent="amber"
            icon={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />}
          />
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Zoom Out [-]"
            aria-label="Zoom out (-)"
            onClick={zoomOut}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37C6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1E]"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="w-12 text-center font-mono text-xs tabular-nums text-blue-700">
            {(transform.scale * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            title="Zoom In [+]"
            aria-label="Zoom in (+)"
            onClick={zoomIn}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37C6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1E]"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Fit to Window [0]"
            aria-label="Fit to window (0)"
            onClick={fitToContainer}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37C6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1E]"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <span className="mx-1 h-4 w-px bg-bt-panel" aria-hidden="true" />

          {scaleStatus === 'CALIBRATED' && (
            <span
              data-testid="calibrated-badge"
              className="mr-1 inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/70 px-2 text-[11px] font-medium text-emerald-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              CALIBRATED{calibrationResult?.scaleRaw ? ` // ${calibrationResult.scaleRaw}` : ''}
            </span>
          )}

          <button
            type="button"
            title="Layers, legend and scale evidence [L]"
            aria-label="Layers, legend and scale evidence (L)"
            aria-haspopup="dialog"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((open) => !open)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#37C6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1E] ${
              layersOpen
                ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                : 'text-bt-text-secondary hover:bg-bt-panel hover:text-bt-text-primary'
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Layers</span>
          </button>
        </div>
      </div>

      {/* Drawing surface keeps every pointer, keyboard and drop handler. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label="Drawing sheet canvas. Press Q over a duct run to dimension it and L for layers."
          data-testid="sheet-canvas"
          className="absolute inset-0 overflow-hidden cad-dot-grid cad-crosshair outline-none select-none"
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
          {!imgLoaded && !imgError && <LaserScanLoader />}

          {imgError && (
            <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bt-canvas px-6 text-center font-sans text-sm text-bt-text-primary">
              <p className="max-w-sm text-bt-text-secondary">This page could not be rendered from the saved drawing.</p>
              <button
                type="button"
                className="min-h-10 rounded-md border border-bt-border-strong bg-bt-surface px-3 text-sm font-medium text-bt-text-primary hover:bg-bt-panel"
                onClick={() => {
                  setImgError(false);
                  setImgLoaded(false);
                  setImageRetry((attempt) => attempt + 1);
                }}
              >
                Try again
              </button>
              <span className="text-xs text-bt-text-tertiary">If it still fails, open the source PDF again.</span>
            </div>
          )}

          <img
            ref={imgRef}
            key={`${imageUrl}:${imageRetry}`}
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

          {/* 72 DPI instant blur-up thumbnail preview during sheet transitions */}
          {thumbnailUrl && !imgLoaded && !imgError && (
            <img
              src={thumbnailUrl}
              alt=""
              aria-hidden="true"
              data-testid="sheet-canvas-thumbnail"
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none opacity-75 blur-xs transition-opacity duration-300"
              style={{
                transform: matrix,
                transformOrigin: '0 0',
                width: `${widthPt}px`,
                height: `${heightPt}px`,
              }}
            />
          )}

          <svg
            className="pointer-events-none absolute left-0 top-0"
            style={{ transform: matrix, transformOrigin: '0 0', width: `${widthPt}px`, height: `${heightPt}px` }}
            viewBox={`0 0 ${widthPt} ${heightPt}`}
            aria-hidden="true"
          >
            {/* Segmented boundaries stay in review until the engineer acts. */}
            {layers.components &&
              segmentedPolygons.map((sp) => (
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
                    Segment // {sp.areaSqFt ? `${sp.areaSqFt.toFixed(1)} sq ft` : 'Boundary in review'}
                  </text>
                </g>
              ))}

            {/* Extracted vector runs (auto-takeoff linework by system) */}
            {visibleVectorRuns
              .filter((run) => run.points.length >= 2)
              .map((run) => (
                <g key={run.id} data-system={run.system ?? ''} data-review={run.reviewRequired ? 'true' : undefined}>
                  <polyline
                    data-testid="vector-run-halo"
                    points={run.points.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={OVERLAY_COLORS.halo}
                    strokeWidth={7}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    data-testid="vector-run"
                    data-system={run.system ?? ''}
                    data-review={run.reviewRequired ? 'true' : undefined}
                    points={run.points.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={vectorRunColor(run.system)}
                    strokeWidth={4.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={vectorRunDash(run.system, run.reviewRequired && layers.review)}
                    vectorEffect="non-scaling-stroke"
                    opacity={run.status === 'SUGGESTED' || run.reviewRequired ? 0.95 : 1}
                  >
                    {run.label ? <title>{run.label}</title> : null}
                  </polyline>
                </g>
              ))}

            {/* Left margin ghost staging dock */}
            {layers.ghosts &&
              pins.some((p) => (p.kind === 'ghost' || p.status === 'UNPLACED_GHOST') && p.x <= 100) && (
                <g opacity={0.6} className="pointer-events-none select-none">
                  <rect
                    x={20}
                    y={70}
                    width={80}
                    height={Math.max(
                      120,
                      pins.filter((p) => p.kind === 'ghost' || p.status === 'UNPLACED_GHOST').length * 35 + 40
                    )}
                    fill="#0f172a"
                    fillOpacity={0.6}
                    stroke="#d97706"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    rx={6}
                  />
                  <text x={26} y={88} fill="#d97706" fontSize={8} fontFamily="monospace" fontWeight="bold">
                    SCHEDULE MATCHES
                  </text>
                </g>
              )}

            {/* Takeoff and ghost pins. Symbol pins render through their own layer. */}
            {visiblePins
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
                    className="pointer-events-auto cursor-pointer outline-none focus-visible:outline-none"
                    tabIndex={0}
                    role="button"
                    aria-label={displayLabel ? `Pin: ${displayLabel}` : `Pin at ${pin.x.toFixed(0)}, ${pin.y.toFixed(0)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectPin?.(pin);
                      }
                    }}
                    onFocus={() => handlePinMouseEnter(pin)}
                    onBlur={handlePinMouseLeave}
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
                    {isSelected && (
                      <circle
                        cx={pin.x}
                        cy={pin.y}
                        r={14}
                        fill="none"
                        stroke={OVERLAY_COLORS.selected}
                        strokeWidth={2}
                        data-testid="selected-pin-halo"
                      />
                    )}

                    {isGhost && (
                      <>
                        <circle
                          cx={pin.x}
                          cy={pin.y}
                          r={8}
                          fill="none"
                          stroke={OVERLAY_COLORS.ghost}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          data-testid="ghost-pin-ring"
                        />
                        <circle
                          cx={pin.x}
                          cy={pin.y}
                          r={8}
                          fill="none"
                          stroke={OVERLAY_COLORS.ghost}
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          vectorEffect="non-scaling-stroke"
                          data-testid="ghost-pin-ring-dashed"
                        />
                      </>
                    )}

                    {pin.kind === 'evidence' && (
                      <circle
                        cx={pin.x}
                        cy={pin.y}
                        r={8}
                        fill="none"
                        stroke={OVERLAY_COLORS.evidence}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}

                    {/* Large invisible hit area for target acquisition */}
                    <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />

                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r={9}
                      fill={pinFill}
                      fillOpacity={0.9}
                      stroke={OVERLAY_COLORS.halo}
                      strokeWidth={2.5}
                    />

                    {displayLabel && (
                      <g transform={`translate(${pin.x + 12}, ${pin.y - 10})`}>
                        <rect
                          rx={4}
                          width={displayLabel.length * 7.5 + 16}
                          height={18}
                          fill={OVERLAY_COLORS.labelBackground}
                          stroke={isGhost ? OVERLAY_COLORS.ghost : getPinFill(pin)}
                          strokeWidth={1}
                        />
                        <text
                          x={8}
                          y={13}
                          fill={OVERLAY_COLORS.labelText}
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

            <SymbolPinsOverlay
              pins={visiblePins.filter((p) => p.kind === 'symbol')}
              reviewEmphasis={layers.review}
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

            {cursor && (
              <g stroke={OVERLAY_COLORS.evidence} strokeWidth={1} opacity={0.7}>
                <line x1={cursor.page.x} y1={0} x2={cursor.page.x} y2={heightPt} />
                <line x1={0} y1={cursor.page.y} x2={widthPt} y2={cursor.page.y} />
              </g>
            )}

            {layers.calibration &&
              toolMode === 'calibrate' &&
              calP1 &&
              (calPreview || calP2) &&
              calibratePhase === 'AWAITING_P2' && (
                <g data-testid="calibration-rubberband">
                  <line
                    x1={calP1.x}
                    y1={calP1.y}
                    x2={(calPreview ?? calP2)?.x ?? calP1.x}
                    y2={(calPreview ?? calP2)?.y ?? calP1.y}
                    stroke={OVERLAY_COLORS.calibration}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                  <circle
                    cx={calP1.x}
                    cy={calP1.y}
                    r={4}
                    fill={OVERLAY_COLORS.calibration}
                    stroke={OVERLAY_COLORS.halo}
                    strokeWidth={1.5}
                  />
                </g>
              )}

            {layers.calibration && calibrationResult && (
              <g data-testid="calibration-overlay">
                <line
                  x1={calibrationResult.p1[0]}
                  y1={calibrationResult.p1[1]}
                  x2={calibrationResult.p2[0]}
                  y2={calibrationResult.p2[1]}
                  stroke={OVERLAY_COLORS.calibration}
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                />
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const tx = calibrationResult.p1[0] + (calibrationResult.p2[0] - calibrationResult.p1[0]) * t;
                  const ty = calibrationResult.p1[1] + (calibrationResult.p2[1] - calibrationResult.p1[1]) * t;
                  return (
                    <circle
                      key={t}
                      cx={tx}
                      cy={ty}
                      r={2.5}
                      fill={OVERLAY_COLORS.calibration}
                      stroke={OVERLAY_COLORS.halo}
                      strokeWidth={0.75}
                    />
                  );
                })}
                <text
                  x={(calibrationResult.p1[0] + calibrationResult.p2[0]) / 2 + 8}
                  y={(calibrationResult.p1[1] + calibrationResult.p2[1]) / 2 - 8}
                  fill={OVERLAY_COLORS.calibration}
                  fontSize={12}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {calibrationResult.scaleRaw ?? `${calibrationResult.lengthPt.toFixed(1)} pt`}
                </text>
              </g>
            )}
          </svg>

          {cursor && renderBadge && renderBadge(cursor.screen, [cursor.page.x, cursor.page.y])}

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

        {layersOpen && (
          <div className="absolute right-2 top-2 z-40">
            <LayerControls
              visibility={layers}
              counts={layerCounts}
              systems={layers.vector ? layerSystems : []}
              scaleStatus={scaleStatus ?? 'UNVERIFIED'}
              scaleRatio={scaleRatio ?? null}
              totalRuns={vectorRuns.length}
              totalLengthFt={totalLengthFt}
              onToggle={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
              onReset={() => setLayers(DEFAULT_LAYER_VISIBILITY)}
              onClose={() => setLayersOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Reserved status strip: selected tool, state and a live legend. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-bt-border-subtle bg-bt-surface px-3 py-1.5 text-xs">
        <span className="flex min-w-0 max-w-md items-center gap-1.5">
          <span className="shrink-0 font-medium text-bt-text-primary">{activeTool.label}</span>
          <span className="truncate text-bt-text-tertiary">{activeTool.hint}</span>
        </span>

        {toolMode === 'calibrate' && (
          <span
            data-testid="calibrate-status"
            role="status"
            className="rounded border border-amber-500/40 bg-amber-950/70 px-2 py-0.5 font-medium text-amber-200"
          >
            {calibratePhase === 'AWAITING_P1' && 'CALIBRATE: click first point (P1) — Shift snaps 0/45/90°'}
            {calibratePhase === 'AWAITING_P2' && 'CALIBRATE: click second point (P2) — Shift snaps 0/45/90° — Esc cancels'}
            {calibratePhase === 'INPUT_MODAL_OPEN' && 'CALIBRATE: enter real-world distance — Esc cancels'}
            {calibratePhase === 'IDLE' && 'CALIBRATE: ready'}
          </span>
        )}

        {calibratePhase === 'INPUT_MODAL_OPEN' && calP1 && calP2 && (
          <span
            data-testid="calibration-input-modal"
            className="rounded border border-amber-500/40 bg-bt-surface/95 px-2 py-0.5 font-mono text-amber-100"
          >
            P1 [{calP1.x.toFixed(1)}, {calP1.y.toFixed(1)}] → P2 [{calP2.x.toFixed(1)}, {calP2.y.toFixed(1)}]
          </span>
        )}

        <span className="ml-auto shrink-0 font-mono tabular-nums text-bt-text-tertiary">
          {cursor
            ? `PDF ${cursor.page.x.toFixed(1)}, ${cursor.page.y.toFixed(1)} pt`
            : 'Pointer off sheet'}
        </span>

        <div
          data-testid="overlay-color-legend"
          aria-label="Drawing overlay color key"
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-bt-divider pt-1.5"
        >
          <span className="text-xs font-medium text-bt-text-tertiary">
            Overlay key
          </span>
          {legendSystems.map((entry) => (
            <span key={entry.label} className="inline-flex items-center gap-1 text-bt-text-primary">
              <svg className="h-2 w-6 shrink-0 overflow-visible" viewBox="0 0 24 8" aria-hidden="true">
                <line x1="0" y1="4" x2="24" y2="4" stroke={entry.color} strokeWidth="3" strokeDasharray={entry.dash} strokeLinecap="butt" />
              </svg>
              <span>{entry.label}</span>
              {entry.count > 0 ? (
                <span className="font-mono tabular-nums text-bt-text-tertiary">{entry.count}</span>
              ) : null}
            </span>
          ))}
          {layers.components && (
            <span className="inline-flex items-center gap-1 text-bt-text-primary">
              <span
                className="h-3 w-3 shrink-0 border-2"
                style={{ borderColor: OVERLAY_COLORS.supply, backgroundColor: `${OVERLAY_COLORS.supply}2E` }}
                aria-hidden="true"
              />
              <span>Detected symbol</span>
            </span>
          )}
          {layers.ghosts && (
            <span className="inline-flex items-center gap-1 text-bt-text-primary">
              <span
                className="h-3 w-3 shrink-0 border border-dashed"
                style={{ borderColor: OVERLAY_COLORS.ghost }}
                aria-hidden="true"
              />
              <span>Ghost / review</span>
            </span>
          )}
          {legendIsEmpty && <span className="text-bt-text-tertiary">No overlay layers are visible.</span>}
        </div>
      </div>
    </div>
  );
};
