import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './primitives/Modal';

export interface CalibrationConfirmPayload {
  realFt: number;
  realIn: number;
}

export interface CalibrationModalProps {
  open: boolean;
  p1: [number, number];
  p2: [number, number];
  lengthPt: number;
  defaultFeet?: number;
  defaultInches?: number;
  isSubmitting?: boolean;
  submitError?: string | null;
  onConfirm: (payload: CalibrationConfirmPayload) => void;
  onCancel: () => void;
}

const SNAP_TABLE: Array<[number, string]> = [
  [96, '1/8" = 1\'-0"'],
  [64, '3/16" = 1\'-0"'],
  [48, '1/4" = 1\'-0"'],
  [32, '3/8" = 1\'-0"'],
  [24, '1/2" = 1\'-0"'],
  [16, '3/4" = 1\'-0"'],
  [12, '1" = 1\'-0"'],
  [8, '1-1/2" = 1\'-0"'],
  [4, '3" = 1\'-0"'],
];

/** Mirror of the backend snapping table (tolerance 2%) for live preview only. */
// eslint-disable-next-line react-refresh/only-export-components
export function snapScaleString(ratio: number, tol = 0.02): string {
  for (const [known, label] of SNAP_TABLE) {
    if (Math.abs(ratio - known) / known <= tol) return label;
  }
  const feet = Math.floor(ratio / 12);
  const inches = Math.round((ratio % 12) * 10) / 10;
  return `Custom (1" = ${feet}'-${inches.toFixed(1)}")`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function previewScaleRatio(lengthPt: number, realFt: number, realIn: number): number | null {
  const totalIn = realFt * 12 + realIn;
  if (!(lengthPt >= 5) || !(totalIn > 0)) return null;
  return (totalIn * 72) / lengthPt;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  open,
  p1,
  p2,
  lengthPt,
  defaultFeet = 10,
  defaultInches = 0,
  isSubmitting = false,
  submitError = null,
  onConfirm,
  onCancel,
}) => {
  const [feet, setFeet] = useState(String(defaultFeet));
  const [inches, setInches] = useState(String(defaultInches));

  useEffect(() => {
    if (open) {
      setFeet(String(defaultFeet));
      setInches(String(defaultInches));
    }
  }, [open, defaultFeet, defaultInches, p1, p2]);

  const parsed = useMemo(() => {
    const ft = Number(feet);
    const inch = Number(inches);
    return { ft, inch };
  }, [feet, inches]);

  const validationError = useMemo(() => {
    if (!(lengthPt >= 5)) return `Calibration line too short: ${lengthPt.toFixed(1)} pt (minimum 5 pt).`;
    const { ft, inch } = parsed;
    if (!Number.isFinite(ft) || !Number.isFinite(inch)) return 'Enter numeric feet and inches.';
    if (ft < 0 || inch < 0) return 'Feet and inches cannot be negative.';
    if (inch >= 12) return 'Inches must be less than 12 (roll into feet).';
    if (ft * 12 + inch <= 0) return 'Real-world distance must be greater than 0.';
    return null;
  }, [parsed, lengthPt]);

  const preview = useMemo(() => {
    if (validationError) return null;
    const ratio = previewScaleRatio(lengthPt, parsed.ft, parsed.inch);
    if (ratio === null) return null;
    return { ratio, label: snapScaleString(ratio) };
  }, [validationError, lengthPt, parsed]);

  if (!open) return null;

  const invalid = validationError !== null || isSubmitting;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      data-testid="calibration-modal"
      ariaLabel="Scale calibration"
      className="w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900 border border-amber-500/40 shadow-2xl p-5"
    >
      <h2 className="text-sm font-mono font-bold text-amber-300">Calibrate sheet scale</h2>
      <p className="mt-1 text-[11px] font-mono text-slate-400">
        P1 [{p1[0].toFixed(1)}, {p1[1].toFixed(1)}] → P2 [{p2[0].toFixed(1)}, {p2[1].toFixed(1)}] ·{' '}
        {lengthPt.toFixed(1)} pt
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cal-feet" className="block text-[11px] font-mono text-slate-300 mb-1">
            Real length — feet
          </label>
          <input
            id="cal-feet"
            data-testid="cal-feet-input"
            type="number"
            min={0}
            step="any"
            value={feet}
            onChange={(e) => setFeet(e.target.value)}
            aria-invalid={validationError !== null}
            aria-describedby={validationError ? 'cal-error' : undefined}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
          />
        </div>
        <div>
          <label htmlFor="cal-inches" className="block text-[11px] font-mono text-slate-300 mb-1">
            Real length — inches
          </label>
          <input
            id="cal-inches"
            data-testid="cal-inches-input"
            type="number"
            min={0}
            max={11.99}
            step="any"
            value={inches}
            onChange={(e) => setInches(e.target.value)}
            aria-invalid={validationError !== null}
            aria-describedby={validationError ? 'cal-error' : undefined}
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
          />
        </div>
      </div>

      <div data-testid="cal-preview" aria-live="polite" className="mt-3 text-[11px] font-mono text-slate-300">
        {preview ? (
          <span>
            Preview: ratio {preview.ratio.toFixed(2)} → {preview.label}
          </span>
        ) : (
          <span className="text-slate-500">Preview unavailable — fix the inputs.</span>
        )}
      </div>

      {(validationError || submitError) && (
        <div id="cal-error" data-testid="cal-error" role="alert" className="mt-2 text-[11px] font-mono text-rose-400">
          {validationError ?? submitError}
        </div>
      )}

      <div className="mt-4 flex justify-end space-x-2">
        <button
          type="button"
          data-testid="cal-cancel"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="cal-confirm"
          disabled={invalid}
          aria-disabled={invalid}
          onClick={() => onConfirm({ realFt: parsed.ft, realIn: parsed.inch })}
          className="px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? 'Calibrating…' : 'Confirm calibration'}
        </button>
      </div>
    </Modal>
  );
};
