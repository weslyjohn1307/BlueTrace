import React from 'react';
import { getOverlayColor, OVERLAY_COLORS } from '../utils/disciplineColors';

/**
 * Symbol detection pin overlay for the CAD sheet canvas (TASK-SYM-005).
 *
 * Renders one SVG glyph per symbol detection persisted as a `SYMBOL_SWARM`
 * ledger item. Fill, bounds, and review markers use the shared semantic
 * overlay palette so pins match routes and the canvas key. Review pins use a
 * static amber ring and dashed bounds for a persistent, low-distraction cue.
 */

export const SYMBOL_SYSTEM_COLORS = {
  supply: OVERLAY_COLORS.supply,
  return: OVERLAY_COLORS.return,
  exhaust: OVERLAY_COLORS.exhaust,
  fire: OVERLAY_COLORS.fire,
  default: OVERLAY_COLORS.default,
} as const;

// eslint-disable-next-line react-refresh/only-export-components
export function symbolSystemColor(system?: string | null): string {
  return getOverlayColor(system);
}

export interface SymbolPin {
  id: string;
  /** PDF points, top-left origin (matches SheetCanvas.CanvasPin). */
  x: number;
  y: number;
  label?: string;
  tag?: string;
  system?: string;
  discipline?: string;
  status?: string;
  reviewRequired?: boolean;
  bbox?: [number, number, number, number];
}

export interface SymbolPinsOverlayProps {
  pins: SymbolPin[];
  onSelectPin?: (pin: SymbolPin) => void;
  /** The review-emphasis layer can hide rings and dashed bounds without hiding the component. */
  reviewEmphasis?: boolean;
}

export const SymbolPinsOverlay: React.FC<SymbolPinsOverlayProps> = ({
  pins,
  onSelectPin,
  reviewEmphasis = true,
}) => {
  return (
    <g data-testid="symbol-pins" aria-label="Symbol detection pins">
      {pins.map((pin) => {
        const fill = symbolSystemColor(pin.system ?? pin.discipline);
        const displayLabel = pin.label ?? pin.tag;
        return (
          <g
            key={pin.id}
            data-testid="symbol-pin"
            data-system={pin.system}
            data-status={pin.status}
            data-review={pin.reviewRequired ? 'true' : undefined}
            className="pointer-events-auto cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPin?.(pin);
            }}
          >
            {pin.bbox && (
              <>
                <rect
                  x={pin.bbox[0]}
                  y={pin.bbox[1]}
                  width={Math.max(1, pin.bbox[2] - pin.bbox[0])}
                  height={Math.max(1, pin.bbox[3] - pin.bbox[1])}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={5}
                  vectorEffect="non-scaling-stroke"
                  data-testid="symbol-detection-halo"
                />
                <rect
                  x={pin.bbox[0]}
                  y={pin.bbox[1]}
                  width={Math.max(1, pin.bbox[2] - pin.bbox[0])}
                  height={Math.max(1, pin.bbox[3] - pin.bbox[1])}
                  fill={fill}
                  fillOpacity={0.2}
                  stroke={fill}
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={pin.reviewRequired && reviewEmphasis ? '6 3' : undefined}
                  data-testid="symbol-detection-bounds"
                />
              </>
            )}
            {pin.reviewRequired && reviewEmphasis && (
              <circle
                cx={pin.x}
                cy={pin.y}
                r={13}
                fill="none"
                stroke={OVERLAY_COLORS.calibration}
                strokeWidth={2.5}
                data-testid="symbol-pin-review-ring"
              />
            )}
            {/* Large invisible hit area for Doherty target acquisition */}
            <circle cx={pin.x} cy={pin.y} r={18} fill="transparent" />
            {/* Symbol glyph with 2px white stroke ensuring >= 3:1 contrast */}
            <circle
              cx={pin.x}
              cy={pin.y}
              r={9}
              fill={fill}
              fillOpacity={0.9}
              stroke="#ffffff"
              strokeWidth={2.5}
              data-testid="symbol-pin-glyph"
            />
            {displayLabel && (
              <g transform={`translate(${pin.x + 12}, ${pin.y - 10})`}>
                <rect
                  rx={4}
                  width={displayLabel.length * 7.5 + 16}
                  height={18}
                  fill="#0f172a"
                  stroke={fill}
                  strokeWidth={1}
                />
                <text
                  x={8}
                  y={13}
                  fill="#ffffff"
                  fontSize={11}
                  fontFamily="Inconsolata, monospace"
                  fontWeight="bold"
                >
                  {displayLabel}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
