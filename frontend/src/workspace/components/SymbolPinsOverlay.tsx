import React from 'react';

/**
 * Symbol detection pin overlay for the CAD sheet canvas (TASK-SYM-005).
 *
 * Renders one SVG glyph per verified symbol-swarm detection persisted as a
 * `SYMBOL_SWARM` ledger item. Colors are system-coded per the SYM-005 spec
 * (distinct from the discipline tokens in `disciplineColors.ts`):
 * Supply `#2563EB`, Return `#16A34A`, Exhaust `#D97706`, Fire `#DC2626`.
 * Pins with `reviewRequired` carry a pulsing amber warning ring so reviewers
 * can spot unverified glyphs at a glance.
 */

export const SYMBOL_SYSTEM_COLORS = {
  supply: '#2563EB',
  return: '#16A34A',
  exhaust: '#D97706',
  fire: '#DC2626',
  default: '#64748B',
} as const;

export function symbolSystemColor(system?: string | null): string {
  if (!system) return SYMBOL_SYSTEM_COLORS.default;
  const key = system.toLowerCase();
  if (key.includes('supply')) return SYMBOL_SYSTEM_COLORS.supply;
  if (key.includes('return')) return SYMBOL_SYSTEM_COLORS.return;
  if (key.includes('exhaust') || key.includes('relief')) return SYMBOL_SYSTEM_COLORS.exhaust;
  if (key.includes('fire') || key.includes('smoke') || key.includes('life safety')) {
    return SYMBOL_SYSTEM_COLORS.fire;
  }
  return SYMBOL_SYSTEM_COLORS.default;
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
}

export interface SymbolPinsOverlayProps {
  pins: SymbolPin[];
  onSelectPin?: (pin: SymbolPin) => void;
}

export const SymbolPinsOverlay: React.FC<SymbolPinsOverlayProps> = ({
  pins,
  onSelectPin,
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
            {pin.reviewRequired && (
              <circle
                cx={pin.x}
                cy={pin.y}
                r={13}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={2}
                data-testid="symbol-pin-review-ring"
                className="animate-pulse"
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
              strokeWidth={2}
              data-testid="symbol-pin-glyph"
            />
            {displayLabel && (
              <g transform={`translate(${pin.x + 12}, ${pin.y - 10})`}>
                <rect
                  rx={4}
                  width={displayLabel.length * 7.5 + 16}
                  height={18}
                  fill="#1e3a8a"
                  stroke={fill}
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
    </g>
  );
};
