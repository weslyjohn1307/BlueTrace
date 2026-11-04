import React from 'react';
import { Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import type { ScaleStatus } from '../../api/contracts';
import { OVERLAY_COLORS } from '../utils/disciplineColors';

export type LayerKey = 'vector' | 'components' | 'ghosts' | 'evidence' | 'calibration' | 'review';

export type LayerVisibility = Record<LayerKey, boolean>;

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  vector: true,
  components: true,
  ghosts: true,
  evidence: true,
  calibration: true,
  review: true,
};

export interface LayerCounts {
  vector: number;
  components: number;
  ghosts: number;
  evidence: number;
  review: number;
}

export interface SystemLegendEntry {
  label: string;
  color: string;
  count: number;
  dash?: string;
}

interface LayerRow {
  key: LayerKey;
  label: string;
  hint: string;
  marker: 'line' | 'box' | 'dash' | 'dot' | 'ruler' | 'warning';
  color: string;
  count?: number;
}

const LAYER_ROWS = (counts: LayerCounts): LayerRow[] => [
  {
    key: 'vector',
    label: 'Vector linework',
    hint: 'Traced routes from the PDF vector layer',
    marker: 'line',
    color: OVERLAY_COLORS.supply,
    count: counts.vector,
  },
  {
    key: 'components',
    label: 'Detected components',
    hint: 'Equipment and symbol candidates',
    marker: 'box',
    color: OVERLAY_COLORS.item,
    count: counts.components,
  },
  {
    key: 'ghosts',
    label: 'Schedule matches and ghosts',
    hint: 'Scheduled equipment with no confirmed plan location',
    marker: 'dash',
    color: OVERLAY_COLORS.ghost,
    count: counts.ghosts,
  },
  {
    key: 'evidence',
    label: 'Evidence pins',
    hint: 'Citations returned with an answer or detection',
    marker: 'dot',
    color: OVERLAY_COLORS.evidence,
    count: counts.evidence,
  },
  {
    key: 'calibration',
    label: 'Calibration ruler',
    hint: 'Your two-point scale evidence for this sheet',
    marker: 'ruler',
    color: OVERLAY_COLORS.calibration,
  },
  {
    key: 'review',
    label: 'Review emphasis',
    hint: 'Dashed and ringed markers for items that need a decision',
    marker: 'warning',
    color: OVERLAY_COLORS.calibration,
    count: counts.review,
  },
];

function Marker({ marker, color }: { marker: LayerRow['marker']; color: string }) {
  if (marker === 'line') {
    return <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
  }
  if (marker === 'box') {
    return (
      <span
        className="h-3 w-3 shrink-0 border-2"
        style={{ borderColor: color, backgroundColor: `${color}2E` }}
      />
    );
  }
  if (marker === 'dash') {
    return <span className="h-3 w-3 shrink-0 border border-dashed" style={{ borderColor: color }} />;
  }
  if (marker === 'dot') {
    return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
  }
  if (marker === 'ruler') {
    return (
      <span className="flex h-3 w-4 shrink-0 items-center" aria-hidden="true">
        <span className="h-[1px] w-full" style={{ backgroundColor: color }} />
        <span className="ml-0.5 h-2 w-[1px]" style={{ backgroundColor: color }} />
      </span>
    );
  }
  return (
    <span
      className="h-3 w-3 shrink-0 rotate-45 border"
      style={{ borderColor: color, backgroundColor: `${color}22` }}
    />
  );
}

export interface LayerControlsProps {
  visibility: LayerVisibility;
  counts: LayerCounts;
  systems: SystemLegendEntry[];
  scaleStatus: ScaleStatus;
  scaleRatio?: number | null;
  totalRuns: number;
  totalLengthFt: number;
  onToggle: (key: LayerKey) => void;
  onReset: () => void;
  onClose?: () => void;
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  visibility,
  counts,
  systems,
  scaleStatus,
  scaleRatio,
  totalRuns,
  totalLengthFt,
  onToggle,
  onReset,
  onClose,
}) => {
  const scaleVerified = scaleStatus === 'VERIFIED' || scaleStatus === 'CALIBRATED';
  const rows = LAYER_ROWS(counts);

  return (
    <div
      role="group"
      aria-label="Drawing layers and scale"
      className="max-h-[min(70vh,540px)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-bt-border-strong bg-bt-surface-raised p-3 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-bt-text-primary">Layers on this sheet</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Reset
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close layers"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-bt-text-secondary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-2 space-y-0.5">
        {rows.map((row) => {
          const visible = visibility[row.key];
          return (
            <li key={row.key}>
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={`${row.label}${typeof row.count === 'number' ? `, ${row.count} on this sheet` : ''}. ${row.hint}`}
                onClick={() => onToggle(row.key)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-bt-panel/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
              >
                <Marker marker={row.marker} color={row.color} />
                <span className="min-w-0 flex-1 truncate text-xs text-bt-text-primary">{row.label}</span>
                {typeof row.count === 'number' ? (
                  <span className="font-mono text-[11px] tabular-nums text-bt-text-secondary">{row.count}</span>
                ) : null}
                {visible ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-bt-text-secondary" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-bt-text-tertiary" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-bt-border-subtle pt-2.5" data-testid="layer-controls-legend">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-bt-text-tertiary">System colors</h3>
        {systems.length > 0 ? (
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            {systems.map((entry) => (
              <li key={entry.label} className="flex items-center gap-1.5 text-[11px] text-bt-text-primary">
                <svg className="h-2 w-6 shrink-0 overflow-visible" viewBox="0 0 24 8" aria-hidden="true">
                  <line x1="0" y1="4" x2="24" y2="4" stroke={entry.color} strokeWidth="3" strokeDasharray={entry.dash} strokeLinecap="butt" />
                </svg>
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <span className="font-mono tabular-nums text-bt-text-tertiary">{entry.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[11px] text-bt-text-secondary">
            No system linework is visible on this sheet.
          </p>
        )}
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-bt-text-secondary">
          <li className="flex items-center gap-1.5">
            <Marker marker="box" color={OVERLAY_COLORS.supply} />
            Detected symbol
          </li>
          <li className="flex items-center gap-1.5">
            <Marker marker="dash" color={OVERLAY_COLORS.ghost} />
            Ghost / review
          </li>
        </ul>
      </div>

      <div className="mt-3 border-t border-bt-border-subtle pt-2.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-bt-text-tertiary">Scale evidence</h3>
        <p className={`mt-1 text-xs font-medium ${scaleVerified ? 'text-bt-success' : 'text-bt-review'}`}>
          {scaleStatus === 'VERIFIED'
            ? 'Printed scale verified'
            : scaleStatus === 'CALIBRATED'
              ? 'Scale set by your two-point calibration'
              : 'No verified scale on this sheet'}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-bt-text-secondary">
          {scaleVerified && scaleRatio ? `Ratio ${scaleRatio.toFixed(2)}:1` : 'Measured lengths stay unaccepted'}
        </p>
        {!scaleVerified ? (
          <p className="mt-1 text-[11px] leading-relaxed text-bt-text-tertiary">
            If this sheet carries plan geometry, verify the printed scale or calibrate two points. Counts and
            reference sheets do not need scale.
          </p>
        ) : null}
      </div>

      <div className="mt-3 border-t border-bt-border-subtle pt-2.5">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-bt-text-tertiary">Vector linework</h3>
        <dl className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <dt className="text-bt-text-tertiary">Runs traced</dt>
            <dd className="font-mono text-bt-text-primary tabular-nums">{totalRuns}</dd>
          </div>
          <div>
            <dt className="text-bt-text-tertiary">Measured length</dt>
            <dd className="font-mono text-bt-text-primary tabular-nums">
              {!scaleVerified ? 'Locked until scale is set' : totalLengthFt > 0 ? `${totalLengthFt.toFixed(0)} ft` : '0 ft'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
};
