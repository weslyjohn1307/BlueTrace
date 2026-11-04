import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Ruler, ShieldAlert } from 'lucide-react';
import type { ScaleStatus } from '../../api/contracts';
import { scalePresentation } from '../utils/scalePresentation';

export interface ScaleStateBadgeProps {
  status: ScaleStatus | string;
  sheetType?: string | null;
  sheetTitle?: string;
  scaleRaw?: string | null;
  compact?: boolean;
}

const STYLE = {
  not_applicable: 'border-bt-border-subtle bg-bt-panel text-bt-text-secondary',
  verified: 'border-bt-success-border bg-bt-success-bg text-bt-success',
  calibrated: 'border-bt-info-border bg-bt-info-bg text-bt-info',
  conflict: 'border-bt-danger-border bg-bt-danger-bg text-bt-danger',
  unverified: 'border-bt-review-border bg-bt-review-bg text-bt-review',
  pending: 'border-bt-border-subtle bg-bt-panel text-bt-text-secondary',
} as const;

const ICON = {
  not_applicable: Info,
  verified: CheckCircle2,
  calibrated: Ruler,
  conflict: ShieldAlert,
  unverified: AlertTriangle,
  pending: Info,
} as const;

export const ScaleStateBadge: React.FC<ScaleStateBadgeProps> = ({
  status,
  sheetType,
  sheetTitle,
  scaleRaw,
  compact = false,
}) => {
  const state = scalePresentation(status, sheetType, sheetTitle);
  const Icon = ICON[state.kind];
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded border px-2 ${compact ? 'min-h-7 text-[11px]' : 'min-h-9 text-xs'} font-medium ${STYLE[state.kind]}`}
      title={state.detail}
      aria-label={`${state.label}. ${state.detail}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{state.kind === 'verified' && scaleRaw ? `${state.label} · ${scaleRaw}` : state.label}</span>
    </span>
  );
};
