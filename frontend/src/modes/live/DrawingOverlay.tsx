import React, { useMemo } from 'react';
import type { RouteItem, ObjectItem } from '../../api/contracts';

export interface DrawingOverlayProps {
  routes: RouteItem[];
  objects: ObjectItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  showRoutes?: boolean;
  showObjects?: boolean;
  showReviewMarks?: boolean;
}

export const DrawingOverlay: React.FC<DrawingOverlayProps> = ({
  routes,
  objects,
  selectedId,
  onSelect,
  showRoutes = true,
  showObjects = true,
  showReviewMarks = true,
}) => {
  // Sort routes so selected item is rendered last (on top)
  const sortedRoutes = useMemo(() => {
    if (!selectedId) return routes;
    return [...routes].sort((a, b) => {
      if (a.route_id === selectedId) return 1;
      if (b.route_id === selectedId) return -1;
      return 0;
    });
  }, [routes, selectedId]);

  return (
    <g id="extraction-overlay-layer" data-testid="extraction-overlay-layer">
      {/* 1. Routes Layer */}
      {showRoutes &&
        sortedRoutes.map((route) => {
          const points = route.geometry?.location_or_path?.points;
          if (!points || !Array.isArray(points) || points.length < 2) {
            return null;
          }

          const pointsStr = points.map((p) => `${p[0]},${p[1]}`).join(' ');
          const isSelected = selectedId === route.route_id;
          const isReviewRequired =
            route.review_required === true ||
            route.review_required === 1 ||
            route.continuity_status === 'REVIEW_REQUIRED';
          const reviewedStatus = route.review_projection?.reviewed_status;

          // Color and stroke based on review status, continuity, and selection
          let strokeColor = '#2563EB'; // default HVAC blue
          let strokeDash = 'none';
          let strokeWidth = 2.5;
          let opacity = 0.85;

          if (reviewedStatus === 'ACCEPTED') {
            strokeColor = '#059669'; // emerald
          } else if (reviewedStatus === 'REJECTED') {
            strokeColor = '#DC2626'; // rose
            strokeDash = '4,4';
            opacity = 0.6;
          } else if (reviewedStatus === 'NEEDS_REVIEW' || isReviewRequired) {
            if (showReviewMarks) {
              strokeColor = '#D97706'; // amber warning
              strokeDash = '5,3';
            }
          } else if (route.continuity_status === 'GAP_BRIDGED') {
            strokeDash = '6,4';
          } else if (route.continuity_status === 'ISOLATED') {
            strokeDash = '2,3';
          }

          if (isSelected) {
            strokeColor = '#006D84'; // Blueprint teal
            strokeWidth = 5.5;
            opacity = 1.0;
            strokeDash = 'none';
          }

          const midPoint = points[Math.floor(points.length / 2)];

          return (
            <g
              key={route.route_id}
              className="mep-route-group"
              style={{ pointerEvents: 'auto' }}
            >
              {/* Invisible wider hit-box for easier clicking/hovering */}
              <polyline
                points={pointsStr}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(route.route_id, 'route');
                }}
              />

              {/* Visible Styled Route Polyline */}
              <polyline
                data-testid="route-feature"
                data-route-id={route.route_id}
                role="button"
                tabIndex={0}
                aria-label={`Route ${route.route_id} (${route.object_type}, ${route.continuity_status || 'unknown'})`}
                aria-pressed={isSelected}
                points={pointsStr}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDash}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
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
                <title>{`Route: ${route.route_id}\nType: ${route.object_type}\nContinuity: ${route.continuity_status}\nReview: ${reviewedStatus || 'PENDING'}`}</title>
              </polyline>

              {/* Review-Required or Uncertainty Visual Mark (small amber diamond at midpoint) */}
              {showReviewMarks && isReviewRequired && midPoint && !isSelected && (
                <polygon
                  points={`${midPoint[0]},${midPoint[1] - 5} ${midPoint[0] + 5},${midPoint[1]} ${midPoint[0]},${midPoint[1] + 5} ${midPoint[0] - 5},${midPoint[1]}`}
                  fill="#D97706"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Selected Focus Halo indicator */}
              {isSelected && (
                <polyline
                  points={pointsStr}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.9}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}

      {/* 2. Objects Layer */}
      {showObjects &&
        objects.map((obj) => {
          const xyxy = obj.geometry?.location_or_path?.xyxy;
          if (!xyxy || xyxy.length < 4) return null;

          const coordSpace =
            obj.geometry?.coordinate_space ||
            (obj.geometry?.location_or_path as { coordinate_space?: string } | undefined)?.coordinate_space;
          const isRasterPixels =
            coordSpace === 'CANONICAL_RASTER_PIXEL_SPACE' ||
            coordSpace === 'canonical_150_dpi_page_pixels';
          // Convert canonical 150 DPI page pixels to 72 pt PDF user space points
          const factor = isRasterPixels ? 72 / 150 : 1.0;

          const x0 = xyxy[0] * factor;
          const y0 = xyxy[1] * factor;
          const x1 = xyxy[2] * factor;
          const y1 = xyxy[3] * factor;
          const width = Math.max(0, x1 - x0);
          const height = Math.max(0, y1 - y0);
          const isSelected = selectedId === obj.object_id;
          const reviewedStatus = obj.review_projection?.reviewed_status;

          let strokeColor = '#DC2626'; // symbol red
          let fillColor = 'rgba(220, 38, 38, 0.15)';
          let strokeWidth = 2.0;

          if (reviewedStatus === 'ACCEPTED') {
            strokeColor = '#059669';
            fillColor = 'rgba(5, 150, 105, 0.15)';
          } else if (reviewedStatus === 'REJECTED') {
            strokeColor = '#9CA3AF';
            fillColor = 'rgba(156, 163, 175, 0.1)';
          }

          if (isSelected) {
            strokeColor = '#006D84';
            fillColor = 'rgba(0, 109, 132, 0.25)';
            strokeWidth = 3.5;
          }

          return (
            <g
              key={obj.object_id}
              className="mep-object-group"
              style={{ pointerEvents: 'auto' }}
            >
              <rect
                data-testid="object-feature"
                data-object-id={obj.object_id}
                role="button"
                tabIndex={0}
                aria-label={`Object ${obj.object_id} (${obj.object_type})`}
                aria-pressed={isSelected}
                x={x0}
                y={y0}
                width={width}
                height={height}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
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
                <title>{`Object: ${obj.object_id}\nType: ${obj.object_type}\nConfidence: ${obj.confidence ?? 'N/A'}`}</title>
              </rect>
            </g>
          );
        })}
    </g>
  );
};
