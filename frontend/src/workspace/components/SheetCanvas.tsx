import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateFitTransform,
  panByScreenDelta,
  screenPointToPagePoint,
  zoomAroundScreenAnchor,
  type Point,
  type TransformState,
} from '../../utils/transform';

export interface CanvasPin {
  id: string;
  /** PDF points, top-left origin. */
  x: number;
  y: number;
  kind: 'ghost' | 'evidence' | 'item';
  label?: string;
}

export interface SheetCanvasProps {
  imageUrl: string;
  widthPt: number;
  heightPt: number;
  pins: CanvasPin[];
  cropEnabled: boolean;
  onCropRequest: (cursorPt: [number, number], imageBase64: string) => void;
  renderBadge?: (screen: Point, pagePt: [number, number]) => React.ReactNode;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [transform, setTransform] = useState<TransformState>({ scale: 1, translationX: 0, translationY: 0, mode: 'fit' });
  const [cursor, setCursor] = useState<{ screen: Point; page: Point } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
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
    if (cropEnabled && imgLoaded) scheduleHoverCrop();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
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
    if ((e.key === 'q' || e.key === 'Q') && cursorRef.current) {
      e.preventDefault();
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      fireCrop();
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
      className="relative w-full h-full overflow-hidden bg-slate-950 outline-none select-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      {!imgLoaded && !imgError && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
          Rendering sheet…
        </div>
      )}
      {imgError && (
        <div className="absolute inset-0 flex items-center justify-center text-rose-400 text-sm px-6 text-center">
          Could not render this sheet. Re-scan or pick another page.
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
        {cursor && (
          <g stroke="#22D3EE" strokeWidth={1} opacity={0.6}>
            <line x1={cursor.page.x} y1={0} x2={cursor.page.x} y2={heightPt} />
            <line x1={0} y1={cursor.page.y} x2={widthPt} y2={cursor.page.y} />
          </g>
        )}
      </svg>

      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
        {cursor
          ? `PDF ${cursor.page.x.toFixed(1)}, ${cursor.page.y.toFixed(1)} pt · ${(transform.scale * 100).toFixed(0)}%`
          : `${(transform.scale * 100).toFixed(0)}% · hover or press Q to dimension`}
      </div>

      {cursor && renderBadge && renderBadge(cursor.screen, [cursor.page.x, cursor.page.y])}
    </div>
  );
};
