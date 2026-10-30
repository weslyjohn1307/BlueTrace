import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Clock, AlertTriangle, Compass } from 'lucide-react';
import type { SheetItem, RouteItem, ObjectItem, ImageBlobResult } from '../../api/contracts';
import { apiClient } from '../../api/client';
import { DrawingCanvasOverlay } from './DrawingCanvasOverlay';
import { CanvasFooterToolbar } from './CanvasFooterToolbar';
import {
  type TransformState,
  calculateFitTransform,
  zoomAroundScreenAnchor,
  panByScreenDelta,
  resetToFit,
  screenPointToPagePoint,
  type Point,
} from '../../utils/transform';

export interface CalibrationRulerState {
  active: boolean;
  pointA: Point | null;
  pointB: Point | null;
  onConfirmPoints?: (pA: Point, pB: Point) => void;
}

export interface DrawingCanvasProps {
  projectId: string;
  runId: string;
  selectedSheet: SheetItem | null;
  routes: RouteItem[];
  objects: ObjectItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  scaleStatus?: string;
  scaleRatioLabel?: string | null;
  onOpenCalibration: () => void;
  rulerState?: CalibrationRulerState;
  onRulerPointPlaced?: (point: Point) => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  projectId,
  runId,
  selectedSheet,
  routes,
  objects,
  selectedId,
  onSelect,
  scaleStatus = 'SCALE_UNREADABLE',
  scaleRatioLabel = null,
  onOpenCalibration,
  rulerState,
  onRulerPointPlaced,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Intrinsic image and dimension state
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

  // Pure transform state
  const [transform, setTransform] = useState<TransformState>({
    scale: 1.0,
    translationX: 0,
    translationY: 0,
    mode: 'fit',
  });

  // Layer visibility toggles
  const [showComponents, setShowComponents] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // Pointer dragging state
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // 1. Fetch 150 DPI page image when sheet changes
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

        const widthPx = res.width || 6300; // Arch E1 at 150 DPI default
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

  // 2. Maintain fit on container resize
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

  // 3. Pointer event handlers for drag panning
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    // Check if ruler click
    if (rulerState?.active && onRulerPointPlaced) {
      const rect = container.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const pagePt = screenPointToPagePoint(screenPt, transform);
      onRulerPointPlaced(pagePt);
      return;
    }

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

  // 4. Wheel zoom around cursor
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
    setTransform(
      resetToFit(
        { width: rect.width, height: rect.height },
        { width: imageState.widthPt, height: imageState.heightPt },
        24
      )
    );
  };

  const handleZoomIn = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTransform((prev) =>
      zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale * 1.25)
    );
  };

  const handleZoomOut = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTransform((prev) =>
      zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, prev.scale / 1.25)
    );
  };

  const handleReset100 = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTransform((prev) =>
      zoomAroundScreenAnchor(prev, { x: rect.width / 2, y: rect.height / 2 }, 1.0)
    );
  };

  if (!selectedSheet) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 p-8 text-center select-none">
        <Compass className="w-12 h-12 text-[#006D84]/40 mb-3" />
        <h3 className="font-heading font-semibold text-slate-800 text-sm">
          No Drawing Sheet Selected
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Select a sheet from the left navigator to display the drawing.
        </p>
      </div>
    );
  }

  return (
    <main
      aria-label="Interactive 2D MEP Drawing Workspace"
      className="flex-1 h-full flex flex-col bg-slate-100 select-none relative overflow-hidden"
    >
      {/* Interactive Main Viewport Canvas */}
      <div
        id="main-drawing-viewport"
        ref={containerRef}
        role="region"
        aria-label="Drawing Viewport"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`flex-1 w-full h-full relative overflow-hidden bg-slate-200/50 ${
          rulerState?.active ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        {/* Loading Spinner */}
        {imageState.isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs">
            <Clock className="w-8 h-8 text-[#006D84] animate-spin mb-2" />
            <p className="font-heading font-semibold text-xs text-slate-800">
              Rendering Page at 150 DPI...
            </p>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              Deterministic PyMuPDF rasterization
            </p>
          </div>
        )}

        {/* Error State */}
        {imageState.error && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-600 mb-3" />
            <h4 className="font-heading font-bold text-sm text-slate-900">
              Failed to load sheet drawing
            </h4>
            <p className="text-xs text-rose-700 max-w-sm mt-1">{imageState.error}</p>
            <button
              type="button"
              onClick={fetchPageImage}
              className="mt-4 px-3 py-1.5 bg-[#006D84] text-white rounded text-xs font-medium hover:bg-[#005264] cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Ruler Mode Banner */}
        {rulerState?.active && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#006D84] text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-3 text-xs">
            <span className="font-semibold">2-Point Scale Ruler Active:</span>
            <span>
              {!rulerState.pointA
                ? 'Click first reference point (Point A)'
                : !rulerState.pointB
                ? 'Click second reference point (Point B)'
                : 'Points captured! Enter physical length in modal.'}
            </span>
          </div>
        )}

        {/* Transformed Page Stack */}
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
            {/* 1. Source Raster Page */}
            <img
              data-testid="source-page-image"
              src={imageState.url}
              alt={`Drawing for sheet ${selectedSheet.sheet_id}`}
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

            {/* 2. SVG Coordinate Overlay Layer */}
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
              <DrawingCanvasOverlay
                routes={routes}
                objects={objects}
                selectedId={selectedId}
                onSelect={onSelect}
                showRoutes={showRoutes}
                showComponents={showComponents}
                showLabels={showLabels}
                scale={transform.scale}
              />

              {/* Ruler Reference Line & Markers if active */}
              {rulerState?.pointA && (
                <g id="ruler-measurement-layer">
                  <circle
                    cx={rulerState.pointA.x}
                    cy={rulerState.pointA.y}
                    r={6 / transform.scale}
                    fill="#D97706"
                    stroke="#FFFFFF"
                    strokeWidth={2 / transform.scale}
                  />
                  {rulerState.pointB && (
                    <>
                      <circle
                        cx={rulerState.pointB.x}
                        cy={rulerState.pointB.y}
                        r={6 / transform.scale}
                        fill="#D97706"
                        stroke="#FFFFFF"
                        strokeWidth={2 / transform.scale}
                      />
                      <line
                        x1={rulerState.pointA.x}
                        y1={rulerState.pointA.y}
                        x2={rulerState.pointB.x}
                        y2={rulerState.pointB.y}
                        stroke="#D97706"
                        strokeWidth={2.5 / transform.scale}
                        strokeDasharray={`${6 / transform.scale},${4 / transform.scale}`}
                      />
                    </>
                  )}
                </g>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Footer Toolbar */}
      <CanvasFooterToolbar
        scalePercent={transform.scale * 100}
        onFit={handleFit}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset100={handleReset100}
        showComponents={showComponents}
        onToggleComponents={() => setShowComponents((prev) => !prev)}
        showRoutes={showRoutes}
        onToggleRoutes={() => setShowRoutes((prev) => !prev)}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((prev) => !prev)}
        scaleStatus={scaleStatus}
        scaleRatioLabel={scaleRatioLabel}
        onOpenCalibration={onOpenCalibration}
        componentCount={objects.length}
        routeCount={routes.length}
      />
    </main>
  );
};
