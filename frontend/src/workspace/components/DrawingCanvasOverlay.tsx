import React, { useMemo } from 'react';
import type { RouteItem, ObjectItem } from '../../api/contracts';

export interface DrawingCanvasOverlayProps {
  routes: RouteItem[];
  objects: ObjectItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  showRoutes?: boolean;
  showComponents?: boolean;
  showLabels?: boolean;
  scale?: number; // Canvas zoom scale to adjust label sizing inversely
}

function getObjectColors(rawType: string, isSelected: boolean, reviewStatus?: string) {
  const t = rawType.toLowerCase();
  let baseStroke = '#EA580C'; // Fire Damper orange
  let baseFill = 'rgba(234, 88, 12, 0.16)';

  if (t.includes('wshp') || t.includes('heat pump')) {
    baseStroke = '#006D84'; // Blueprint Teal
    baseFill = 'rgba(0, 109, 132, 0.18)';
  } else if (t.includes('grille') || t.includes('diffuser') || t.includes('lbg')) {
    baseStroke = '#0284C7'; // Sky Blue
    baseFill = 'rgba(2, 132, 199, 0.16)';
  }

  if (reviewStatus === 'ACCEPTED') {
    baseStroke = '#058A5E'; // Emerald verified
    baseFill = 'rgba(5, 138, 94, 0.15)';
  } else if (reviewStatus === 'REJECTED') {
    baseStroke = '#94A3B8'; // Muted slate rejected
    baseFill = 'rgba(148, 163, 184, 0.08)';
  }

  if (isSelected) {
    baseStroke = '#006D84';
    baseFill = 'rgba(0, 109, 132, 0.35)';
  }

  return { stroke: baseStroke, fill: baseFill };
}

function getRouteColor(rawType: string, isSelected: boolean, reviewStatus?: string, continuityStatus?: string) {
  const t = (rawType || '').toLowerCase();
  let strokeColor = '#2563EB'; // Mechanical duct blue
  let strokeDash = 'none';
  let strokeWidth = 2.5;
  let opacity = 0.85;

  if (t.includes('pipe') || t.includes('plumb')) {
    strokeColor = '#0D9488'; // Plumbing teal
  }

  if (reviewStatus === 'ACCEPTED') {
    strokeColor = '#058A5E';
  } else if (reviewStatus === 'REJECTED') {
    strokeColor = '#DC2626';
    strokeDash = '4,4';
    opacity = 0.5;
  } else if (reviewStatus === 'NEEDS_REVIEW' || continuityStatus === 'REVIEW_REQUIRED') {
    strokeColor = '#D97706';
    strokeDash = '5,3';
  }

  if (isSelected) {
    strokeColor = '#006D84';
    strokeWidth = 5.0;
    opacity = 1.0;
    strokeDash = 'none';
  }

  return { stroke: strokeColor, dash: strokeDash, width: strokeWidth, opacity };
}

export const DrawingCanvasOverlay: React.FC<DrawingCanvasOverlayProps> = ({
  routes,
  objects,
  selectedId,
  onSelect,
  showRoutes = true,
  showComponents = true,
  showLabels = true,
  scale = 1.0,
}) => {
  // Sort items so selected item renders on top
  const sortedRoutes = useMemo(() => {
    if (!selectedId) return routes;
    return [...routes].sort((a, b) => {
      if (a.route_id === selectedId) return 1;
      if (b.route_id === selectedId) return -1;
      return 0;
    });
  }, [routes, selectedId]);

  const sortedObjects = useMemo(() => {
    if (!selectedId) return objects;
    return [...objects].sort((a, b) => {
      if (a.object_id === selectedId) return 1;
      if (b.object_id === selectedId) return -1;
      return 0;
    });
  }, [objects, selectedId]);

  // Adjust label scale inversely so labels remain readable at different zoom levels
  const inverseScale = Math.max(0.4, Math.min(1.5, 1 / (scale || 1)));

  return (
    <g id="drawing-canvas-overlay" data-testid="drawing-canvas-overlay">
      {/* 1. Linear Routes Layer */}
      {showRoutes &&
        sortedRoutes.map((route) => {
          const points = route.geometry?.location_or_path?.points;
          if (!points || !Array.isArray(points) || points.length < 2) {
            return null;
          }

          const pointsStr = points.map((p) => `${p[0]},${p[1]}`).join(' ');
          const isSelected = selectedId === route.route_id;
          const reviewStatus = route.review_projection?.reviewed_status;
          const styling = getRouteColor(route.object_type, isSelected, reviewStatus, route.continuity_status || undefined);

          const midPoint = points[Math.floor(points.length / 2)];

          return (
            <g
              key={route.route_id}
              className="route-trace-group"
              style={{ pointerEvents: 'auto' }}
            >
              {/* Invisible wider hit-box for easier clicking */}
              <polyline
                points={pointsStr}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(route.route_id, 'route');
                }}
              />

              {/* Visible Polyline */}
              <polyline
                data-testid="route-feature"
                data-route-id={route.route_id}
                role="button"
                tabIndex={0}
                aria-label={`Route ${route.route_id} (${route.object_type})`}
                aria-pressed={isSelected}
                points={pointsStr}
                fill="none"
                stroke={styling.stroke}
                strokeWidth={styling.width}
                strokeDasharray={styling.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={styling.opacity}
                style={{
                  cursor: 'pointer',
                  pointerEvents: 'stroke',
                  transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(route.route_id, 'route');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(route.route_id, 'route');
                  }
                }}
              >
                <title>{`Route: ${route.route_id}\nType: ${route.object_type}\nContinuity: ${route.continuity_status || 'DIRECT'}\nStatus: ${reviewStatus || 'PENDING'}`}</title>
              </polyline>

              {/* Selected Focus Halo */}
              {isSelected && (
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={2.0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Midpoint marker for review required */}
              {route.continuity_status === 'REVIEW_REQUIRED' && midPoint && !isSelected && (
                <polygon
                  points={`${midPoint[0]},${midPoint[1] - 5} ${midPoint[0] + 5},${midPoint[1]} ${midPoint[0]},${midPoint[1] + 5} ${midPoint[0] - 5},${midPoint[1]}`}
                  fill="#D97706"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}

      {/* 2. Quantifiable Components Layer (Categorized Colors) */}
      {showComponents &&
        sortedObjects.map((obj) => {
          const xyxy = obj.geometry?.location_or_path?.xyxy;
          if (!xyxy || xyxy.length < 4) return null;

          const coordSpace =
            obj.geometry?.coordinate_space ||
            (obj.geometry?.location_or_path as { coordinate_space?: string } | undefined)?.coordinate_space;
          const isRasterPixels =
            coordSpace === 'CANONICAL_RASTER_PIXEL_SPACE' ||
            coordSpace === 'canonical_150_dpi_page_pixels';
          const factor = isRasterPixels ? 72 / 150 : 1.0;

          const x0 = xyxy[0] * factor;
          const y0 = xyxy[1] * factor;
          const x1 = xyxy[2] * factor;
          const y1 = xyxy[3] * factor;
          const width = Math.max(0, x1 - x0);
          const height = Math.max(0, y1 - y0);

          const isSelected = selectedId === obj.object_id;
          const reviewStatus = obj.review_projection?.reviewed_status;
          const colors = getObjectColors(obj.object_type, isSelected, reviewStatus);
          const confidencePercent =
            typeof obj.confidence === 'number' ? Math.round(obj.confidence * 100) : null;

          return (
            <g
              key={obj.object_id}
              className="object-box-group"
              style={{ pointerEvents: 'auto' }}
            >
              {/* Bounding Box Rectangle */}
              <rect
                data-testid="object-feature"
                data-object-id={obj.object_id}
                role="button"
                tabIndex={0}
                aria-label={`Component ${obj.object_id} (${obj.object_type})`}
                aria-pressed={isSelected}
                x={x0}
                y={y0}
                width={width}
                height={height}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 3.5 : 2.0}
                rx={2}
                style={{
                  cursor: 'pointer',
                  pointerEvents: 'all',
                  transition: 'stroke 0.15s ease, fill 0.15s ease',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(obj.object_id, 'object');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(obj.object_id, 'object');
                  }
                }}
              >
                <title>{`Object: ${obj.object_id}\nType: ${obj.object_type}\nConfidence: ${confidencePercent !== null ? `${confidencePercent}%` : 'N/A'}\nStatus: ${reviewStatus || 'PENDING'}`}</title>
              </rect>

              {/* Tag Label on Canvas */}
              {showLabels && (
                <g
                  transform={`translate(${x0}, ${Math.max(0, y0 - 18)}) scale(${inverseScale})`}
                  style={{ pointerEvents: 'none' }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={confidencePercent ? 115 : 85}
                    height={16}
                    rx={3}
                    fill={isSelected ? '#006D84' : '#1B242C'}
                    opacity={0.92}
                  />
                  <text
                    x={4}
                    y={11.5}
                    fill="#FFFFFF"
                    fontSize={9.5}
                    fontWeight={600}
                    fontFamily="monospace"
                  >
                    {obj.object_type.replace(/_/g, ' ')}
                    {confidencePercent !== null ? ` · ${confidencePercent}%` : ''}
                  </text>
                </g>
              )}
            </g>
          );
        })}
    </g>
  );
};
