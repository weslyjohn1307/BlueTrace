import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Crosshair,
  AlertTriangle,
  Clock,
  Compass,
} from 'lucide-react';
import type { SheetItem, ViewDetailResponse, ImageBlobResult, RouteItem, ObjectItem } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { DrawingOverlay } from './DrawingOverlay';
import {
  type TransformState,
  calculateFitTransform,
  zoomAroundScreenAnchor,
  panByScreenDelta,
  resetToFit,
} from '../../utils/transform';

export interface DrawingViewerProps {
  projectId: string;
  runId: string;
  selectedSheet: SheetItem | null;
  selectedView: ViewDetailResponse | null;
  routes?: RouteItem[];
  objects?: ObjectItem[];
  selectedResultId?: string | null;
  onSelectResult?: (id: string, type: 'route' | 'object') => void;
  showRoutes?: boolean;
  showObjects?: boolean;
  showReviewMarks?: boolean;
}

// Frozen fixture alignment control points (Avexis Page 22 / U-06 verified landmarks in PDF points)
// Canonical conversion: pt = px_150dpi * (72 / 150)
const FIXTURE_CONTROL_POINTS = [
  {
    id: 'CORNER-TL',
    name: 'Top-Left Margin',
    x: 50,
    y: 50,
    color: '#006D84',
  },
  {
    id: 'CORNER-TR',
    name: 'Top-Right Margin',
    x: 2974,
    y: 50,
    color: '#006D84',
  },
  {
    id: 'CORNER-BL',
    name: 'Bottom-Left Margin',
    x: 50,
    y: 2110,
    color: '#006D84',
  },
  {
    id: 'CORNER-BR',
    name: 'Title Block Corner',
    x: 2974,
    y: 2110,
    color: '#006D84',
  },
  {
    id: 'LANDMARK-MECH-202',
    name: 'Mechanical Room 202 (Main Risers)',
    x: 1003.09,
    y: 601.17,
    color: '#D97706', // amber
  },
  {
    id: 'LANDMARK-TITLE-BLOCK',
    name: 'Authoritative Title Block',
    x: 2750.0,
    y: 2050.0,
    color: '#2563EB', // blue
  },
];

export const DrawingViewer: React.FC<DrawingViewerProps> = ({
  projectId,
  runId,
  selectedSheet,
  selectedView,
  routes = [],
  objects = [],
  selectedResultId = null,
  onSelectResult,
  showRoutes = true,
  showObjects = true,
  showReviewMarks = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Intrinsic dimensions & image state
  const [imageState, setImageState] = useState<{
    url: string | null;
    widthPx: number;
    heightPx: number;
    widthPt: number;
    heightPt: number;
    isLoading: boolean;
    error: string | null;
  }>({
    url: null,
    widthPx: 0,
    heightPx: 0,
    widthPt: 0,
    heightPt: 0,
    isLoading: false,
    error: null,
  });

  // Pure transform model state
  const [transform, setTransform] = useState<TransformState>({
    scale: 1.0,
    translationX: 0,
    translationY: 0,
    mode: 'fit',
  });

  // Alignment layer visibility
  const [showAlignmentLayer, setShowAlignmentLayer] = useState(true);

  // Pointer dragging state
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // 1. Fetch 150 DPI page image whenever selected page changes
  const fetchPageImage = useCallback(() => {
    if (!selectedSheet) return;

    setImageState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    const controller = new AbortController();
    let currentUrl: string | null = null;

    apiClient
      .getPageImageBlob(projectId, runId, selectedSheet.page_id, controller.signal)
      .then((res: ImageBlobResult) => {
        const url = URL.createObjectURL(res.blob);
        currentUrl = url;

        // Determine dimensions
        const widthPx = res.width || 6300; // default to canonical Arch E1 150 DPI
        const heightPx = res.height || 4500;
        const widthPt = (widthPx * 72) / 150;
        const heightPt = (heightPx * 72) / 150;

        setImageState({
          url,
          widthPx,
          heightPx,
          widthPt,
          heightPt,
          isLoading: false,
          error: null,
        });

        // Initialize fit transform
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const initialFit = calculateFitTransform(
            { width: rect.width, height: rect.height },
            { width: widthPt, height: heightPt },
            24
          );
          setTransform(initialFit);
        }
      })
      .catch((err: unknown) => {
        setImageState((prev) => ({
          ...prev,
          url: null,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to download page image',
        }));
      });

    return () => {
      controller.abort();
      if (currentUrl) {
        try {
          URL.revokeObjectURL(currentUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [projectId, runId, selectedSheet]);

  useEffect(() => {
    const cleanup = fetchPageImage();
    return () => {
      if (cleanup) cleanup();
    };
  }, [fetchPageImage]);

  // 2. Handle ResizeObserver to maintain fit when in fit mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && imageState.widthPt > 0 && imageState.heightPt > 0) {
          setTransform((prev) => {
            if (prev.mode === 'fit') {
              return calculateFitTransform(
                { width, height },
                { width: imageState.widthPt, height: imageState.heightPt },
                24
              );
            }
            return prev;
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [imageState.widthPt, imageState.heightPt]);

  // 3. Pointer event handlers for panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // primary button only
    const container = containerRef.current;
    if (!container) return;

    container.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - lastPointerRef.current.x;
    const deltaY = e.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    setTransform((prev) => panByScreenDelta(prev, { x: deltaX, y: deltaY }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // 4. Wheel zoom around screen anchor
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container || imageState.widthPt <= 0) return;

    const rect = container.getBoundingClientRect();
    const screenAnchor = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const targetScale = transform.scale * zoomFactor;

    setTransform((prev) =>
      zoomAroundScreenAnchor(prev, screenAnchor, targetScale)
    );
  };

  // 5. Toolbar button actions
  const handleFit = () => {
    const container = containerRef.current;
    if (!container || imageState.widthPt <= 0) return;
    const rect = container.getBoundingClientRect();
    const fit = resetToFit(
      { width: rect.width, height: rect.height },
      { width: imageState.widthPt, height: imageState.heightPt },
      24
    );
    setTransform(fit);
  };

  const handleZoomIn = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    setTransform((prev) => zoomAroundScreenAnchor(prev, center, prev.scale * 1.25));
  };

  const handleZoomOut = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    setTransform((prev) => zoomAroundScreenAnchor(prev, center, prev.scale / 1.25));
  };

  const handleReset100 = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const center = { x: rect.width / 2, y: rect.height / 2 };
    setTransform((prev) => zoomAroundScreenAnchor(prev, center, 1.0));
  };

  if (!selectedSheet) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 p-8 text-center">
        <Compass className="w-12 h-12 text-[#006D84]/40 mb-3" aria-hidden="true" />
        <h3 className="font-heading font-semibold text-slate-800 text-sm">
          No Drawing Sheet Selected
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Select a sheet from the navigation panel to display the source drawing.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/5 select-none relative overflow-hidden">
      {/* Floating Viewport Toolbar */}
      <div
        role="toolbar"
        aria-label="Drawing Viewport Controls"
        className="absolute top-4 left-4 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg shadow-md px-3 py-1.5 flex items-center space-x-2 text-xs text-slate-700"
      >
        <button
          type="button"
          onClick={handleFit}
          title="Fit Drawing to Viewport (F)"
          aria-label="Fit to Viewport"
          className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
        >
          <Maximize2 className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="w-px h-4 bg-slate-200" />

        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
          className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
        >
          <ZoomIn className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
        >
          <ZoomOut className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handleReset100}
          title="100% Native Scale"
          aria-label="Reset to 100% scale"
          className="px-1.5 py-0.5 font-mono text-[11px] font-semibold hover:bg-slate-100 rounded text-slate-700"
        >
          {Math.round(transform.scale * 100)}%
        </button>

        <button
          type="button"
          onClick={handleFit}
          title="Reset View"
          aria-label="Reset View"
          className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="w-px h-4 bg-slate-200" />

        {/* Alignment Test Layer Toggle */}
        <button
          type="button"
          onClick={() => setShowAlignmentLayer((prev) => !prev)}
          title={showAlignmentLayer ? 'Hide Alignment Test Grid' : 'Show Alignment Test Grid'}
          aria-label="Toggle Coordinate Alignment Layer"
          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
            showAlignmentLayer
              ? 'bg-[#006D84]/10 text-[#006D84] border-[#006D84]/30'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Alignment Grid</span>
        </button>
      </div>

      {/* Coordinate Space & Viewport Status Pill */}
      <div className="absolute bottom-4 left-4 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-md shadow-xs px-2.5 py-1 text-[11px] font-mono text-slate-600 flex items-center space-x-3">
        <span>Space: {selectedView?.coordinate_space || 'PDF_PAGE_USER_SPACE'}</span>
        <span>•</span>
        <span>
          Page: {imageState.widthPt.toFixed(1)} × {imageState.heightPt.toFixed(1)} pt
        </span>
        <span>•</span>
        <span>
          Raster: {imageState.widthPx} × {imageState.heightPx} px (150 DPI)
        </span>
        <span>•</span>
        <span className="text-amber-700 font-medium">Scale: Unverified</span>
      </div>

      {/* Interactive Main Viewport Canvas */}
      <div
        id="main-drawing-viewport"
        ref={containerRef}
        role="region"
        aria-label="Interactive 2D MEP Drawing Viewer"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden bg-slate-200/50"
      >
        {/* Loading State */}
        {imageState.isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs">
            <Clock className="w-8 h-8 text-[#006D84] animate-spin mb-2" aria-hidden="true" />
            <p className="font-heading font-medium text-xs text-slate-800">
              Rendering Source Page at 150 DPI...
            </p>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              Deterministic PyMuPDF rasterization
            </p>
          </div>
        )}

        {/* Error State */}
        {imageState.error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-600 mb-3" aria-hidden="true" />
            <h4 className="font-heading font-bold text-sm text-slate-900">
              Page Image Download Failed
            </h4>
            <p className="text-xs text-rose-700 max-w-sm mt-1">{imageState.error}</p>
            <button
              type="button"
              onClick={fetchPageImage}
              className="mt-4 px-3 py-1.5 bg-[#006D84] text-white rounded text-xs font-medium hover:bg-[#005264]"
            >
              Retry Download
            </button>
          </div>
        )}

        {/* One Shared Transformed Page Stack */}
        {imageState.url && (
          <div
            data-testid="transformed-page-wrapper"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${imageState.widthPt}px`,
              height: `${imageState.heightPt}px`,
              transform: `translate(${transform.translationX}px, ${transform.translationY}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.25)',
              backgroundColor: '#FFFFFF',
            }}
          >
            {/* 1. Source Page Image */}
            <img
              data-testid="source-page-image"
              src={imageState.url}
              alt={`Drawing page for sheet ${selectedSheet.sheet_id}`}
              width={imageState.widthPx}
              height={imageState.heightPx}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
              draggable={false}
            />

            {/* 2. SVG Coordinate Layer (Aligned directly with PDF points) */}
            <svg
              data-testid="svg-coordinate-layer"
              viewBox={`0 0 ${imageState.widthPt} ${imageState.heightPt}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              {/* Alignment Grid & Control Points */}
              {showAlignmentLayer && (
                <g id="alignment-control-points" data-testid="alignment-control-points">
                  {/* Outer Boundary Rect */}
                  <rect
                    x="2"
                    y="2"
                    width={imageState.widthPt - 4}
                    height={imageState.heightPt - 4}
                    fill="none"
                    stroke="#006D84"
                    strokeWidth="2"
                    strokeDasharray="8,8"
                    opacity="0.6"
                  />

                  {/* Fixture Control Points with Crosshairs */}
                  {FIXTURE_CONTROL_POINTS.map((cp) => {
                    // Skip corners if beyond current page dimensions
                    if (cp.x > imageState.widthPt || cp.y > imageState.heightPt) {
                      return null;
                    }
                    const r = 16;
                    return (
                      <g key={cp.id} id={`cp-${cp.id}`} className="control-point">
                        {/* Circle */}
                        <circle
                          cx={cp.x}
                          cy={cp.y}
                          r={r}
                          fill={cp.color}
                          fillOpacity="0.15"
                          stroke={cp.color}
                          strokeWidth="2"
                        />
                        {/* Center Dot */}
                        <circle cx={cp.x} cy={cp.y} r="2.5" fill={cp.color} />
                        {/* Horizontal Crosshair */}
                        <line
                          x1={cp.x - r - 6}
                          y1={cp.y}
                          x2={cp.x + r + 6}
                          y2={cp.y}
                          stroke={cp.color}
                          strokeWidth="1.5"
                        />
                        {/* Vertical Crosshair */}
                        <line
                          x1={cp.x}
                          y1={cp.y - r - 6}
                          x2={cp.x}
                          y2={cp.y + r + 6}
                          stroke={cp.color}
                          strokeWidth="1.5"
                        />
                        {/* Coordinate Label */}
                        <text
                          x={cp.x + r + 8}
                          y={cp.y + 4}
                          fontFamily="monospace"
                          fontSize="12"
                          fontWeight="bold"
                          fill={cp.color}
                        >
                          {cp.id} ({cp.x.toFixed(0)}, {cp.y.toFixed(0)} pt)
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Extraction Overlays (Routes & Objects) */}
              <DrawingOverlay
                routes={routes}
                objects={objects}
                selectedId={selectedResultId}
                onSelect={onSelectResult || (() => {})}
                showRoutes={showRoutes}
                showObjects={showObjects}
                showReviewMarks={showReviewMarks}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
