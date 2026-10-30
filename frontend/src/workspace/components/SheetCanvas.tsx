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
  zoomAroundScreenAnchor,
  type Point,
  type TransformState,
} from '../../utils/transform';
import { LaserScanLoader } from './LaserScanLoader';
import { apiClient } from '../../api/client';

export type ToolMode = 'select' | 'pan' | 'quickdraw' | 'segment' | 'calibrate';

export interface CanvasPin {
  id: string;
  /** PDF points, top-left origin. */
  x: number;
  y: number;
  kind: 'ghost' | 'evidence' | 'item';
  label?: string;
}

export interface SegmentedPolygon {
  id: string;
  points: [number, number][];
  centroid: [number, number];
  areaSqFt?: number;
  confidence: number;
  label: string;
}

export interface SheetCanvasProps {
  imageUrl: string;
  widthPt: number;
  heightPt: number;
  pins: CanvasPin[];
  cropEnabled: boolean;
  onCropRequest: (cursorPt: [number, number], imageBase64: string) => void;
  renderBadge?: (screen: Point, pagePt: [number, number]) => React.ReactNode;
  scaleRatio?: number;
  discipline?: string;
}

const PIN_COLORS: Record<CanvasPin['kind'], string> = {
  ghost: '#F59E0B',
  evidence: '#22D3EE',
  item: '#34D399',
};

const HOVER_DEBOUNCE_MS = 400;
const CROP_WINDOW_PT = 150;
const CROP_OUTPUT_PX = 312;

export const SheetCanvas: React.FC<SheetCanvasProps> = ({
  imageUrl,
  widthPt,
  heightPt,
  pins,
  cropEnabled,
  onCropRequest,
  renderBadge,
  scaleRatio,
  discipline = 'MEP-HVAC',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState<TransformState>({ scale: 1, translationX: 0, translationY: 0, mode: 'fit' });
  const [cursor, setCursor] = useState<{ screen: Point; page: Point } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('quickdraw');
  const [segmentedPolygons, setSegmentedPolygons] = useState<SegmentedPolygon[]>([]);
  const [isSegmenting, setIsSegmenting] = useState(false);

  const spacePressedRef = useRef(false);
  const panningRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef<{ screen: Point; page: Point } | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  cursorRef.current = cursor;

  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el || widthPt <= 0 || heightPt <= 0) return;
    const rect = el.getBoundingClientRect();
    setTransform(calculateFitTransform({ width: rect.width, height: rect.height }, { width: widthPt, height: heightPt }));
  }, [widthPt, heightPt]);

  // Refit when the sheet image changes; track container resizes.
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    setCursor(null);
    setSegmentedPolygons([]);
    fitToContainer();
  }, [imageUrl, fitToContainer]);

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

        // Convert to sq ft if scale ratio is known
        const areaSqFt = scaleRatio && scaleRatio > 0 ? areaPt2 * (scaleRatio * scaleRatio) : undefined;

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
    if (cropEnabled && imgLoaded && (toolMode === 'quickdraw' || toolMode === 'select')) {
      scheduleHoverCrop();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
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

  const handleMouseLeave = () => {
    panningRef.current = null;
    setCursor(null);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      setToolMode('calibrate');
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
            onClick={() => setToolMode('calibrate')}
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
        <div className="absolute top-3 right-3 z-30 hidden sm:flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-mono select-none">
          <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-slate-300">MUSE-SPARK-1.3</span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-400">SAM-3.1 ACTIVE</span>
        </div>
      )}

      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        draggable={false}
        onLoad={() => {
          setImgLoaded(true);
          fitToContainer();
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

        {/* CAD Takeoff & Ghost Pins */}
        {pins.map((pin) => (
          <g key={pin.id}>
            <circle
              cx={pin.x}
              cy={pin.y}
              r={9}
              fill={PIN_COLORS[pin.kind]}
              fillOpacity={0.85}
              stroke="#ffffff"
              strokeWidth={2}
            />
            {pin.label && (
              <text x={pin.x + 13} y={pin.y + 4} fontSize={13} fill="#ffffff" fontFamily="monospace">
                {pin.label}
              </text>
            )}
          </g>
        ))}

        {/* CAD Precision Crosshair Lines */}
        {cursor && (
          <g stroke="#22D3EE" strokeWidth={1} opacity={0.6}>
            <line x1={cursor.page.x} y1={0} x2={cursor.page.x} y2={heightPt} />
            <line x1={0} y1={cursor.page.y} x2={widthPt} y2={cursor.page.y} />
          </g>
        )}
      </svg>

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
    </div>
  );
};
