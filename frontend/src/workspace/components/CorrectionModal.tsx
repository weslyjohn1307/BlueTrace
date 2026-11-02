import React, { useEffect, useMemo, useState } from 'react';
import {
  CORRECTION_CATEGORIES,
  CORRECTION_REASONS,
  CORRECTION_SYSTEMS,
  type CorrectionFieldValues,
} from '../../api/contracts';

export interface CorrectionSubmitPayload {
  itemId: string;
  reason: string;
  /** Status to file the corrected item under; string for 3-state/4-state compat. */
  status: string;
  originalProposal: CorrectionFieldValues;
  correctedValues: CorrectionFieldValues;
}

export interface CorrectionModalProps {
  open: boolean;
  itemId: string;
  itemLabel?: string;
  initial: CorrectionFieldValues;
  /** Reason-code options; defaults to the CORRECTION_REASONS taxonomy. */
  reasonOptions?: readonly string[];
  /** System options; defaults to CORRECTION_SYSTEMS. */
  systemOptions?: readonly string[];
  /** Category options; defaults to CORRECTION_CATEGORIES. */
  categoryOptions?: readonly string[];
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit: (payload: CorrectionSubmitPayload) => void;
  onCancel: () => void;
}

/**
 * REV-002 rich field-level correction form.
 *
 * Controlled, accessible dialog: the estimator edits the dimension label, the
 * integer CFM airflow, the system and category selectors, and a required
 * reason code. Submit always ships both the original proposal and the
 * corrected values so downstream telemetry/audit keeps what was overridden.
 */
export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  open,
  itemId,
  itemLabel,
  initial,
  reasonOptions = CORRECTION_REASONS,
  systemOptions = CORRECTION_SYSTEMS,
  categoryOptions = CORRECTION_CATEGORIES,
  isSubmitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}) => {
  const [dimensionLabel, setDimensionLabel] = useState(initial.dimensionLabel);
  const [cfm, setCfm] = useState(initial.cfm == null ? '' : String(initial.cfm));
  const [system, setSystem] = useState(initial.system);
  const [category, setCategory] = useState(initial.category);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setDimensionLabel(initial.dimensionLabel);
      setCfm(initial.cfm == null ? '' : String(initial.cfm));
      setSystem(initial.system);
      setCategory(initial.category);
      setReason('');
    }
    // Reset only on open/item change; edits are local state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const validationError = useMemo(() => {
    if (!dimensionLabel.trim()) return 'Dimension label is required (e.g. 12x8 or 10" dia).';
    const trimmedCfm = cfm.trim();
    if (trimmedCfm !== '') {
      if (!/^\d+$/.test(trimmedCfm)) return 'Airflow CFM must be a non-negative integer.';
    }
    if (!system) return 'System selection is required.';
    if (!category) return 'Category selection is required.';
    if (!reason) return 'A reason code is required for every correction.';
    return null;
  }, [dimensionLabel, cfm, system, category, reason]);

  if (!open) return null;

  const invalid = validationError !== null || isSubmitting;

  const handleSubmit = () => {
    if (validationError) return;
    const trimmedCfm = cfm.trim();
    const correctedValues: CorrectionFieldValues = {
      dimensionLabel: dimensionLabel.trim(),
      cfm: trimmedCfm === '' ? null : Number.parseInt(trimmedCfm, 10),
      system,
      category,
    };
    onSubmit({
      itemId,
      reason,
      status: 'ACCEPTED',
      originalProposal: { ...initial },
      correctedValues,
    });
  };

  return (
    <div
      data-testid="correction-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Correct takeoff item ${itemLabel ?? itemId}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900 border border-cyan-500/40 shadow-2xl p-5">
        <h2 className="text-sm font-mono font-bold text-cyan-300">Correct takeoff item</h2>
        <p className="mt-1 text-[11px] font-mono text-slate-400 truncate">
          {itemLabel ?? itemId} · original proposal is preserved in the payload
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="correction-dimension" className="block text-[11px] font-mono text-slate-300 mb-1">
              Dimension (e.g. 12x8 or 10&quot; dia)
            </label>
            <input
              id="correction-dimension"
              data-testid="correction-dimension-input"
              type="text"
              value={dimensionLabel}
              onChange={(e) => setDimensionLabel(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="correction-cfm" className="block text-[11px] font-mono text-slate-300 mb-1">
              Airflow (CFM, integer)
            </label>
            <input
              id="correction-cfm"
              data-testid="correction-cfm-input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={cfm}
              onChange={(e) => setCfm(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="correction-system" className="block text-[11px] font-mono text-slate-300 mb-1">
                System
              </label>
              <select
                id="correction-system"
                data-testid="correction-system-select"
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
              >
                {systemOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="correction-category" className="block text-[11px] font-mono text-slate-300 mb-1">
                Category
              </label>
              <select
                id="correction-category"
                data-testid="correction-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="correction-reason" className="block text-[11px] font-mono text-slate-300 mb-1">
              Reason code (required)
            </label>
            <select
              id="correction-reason"
              data-testid="correction-reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-sm font-mono text-slate-100"
            >
              <option value="">Select a reason…</option>
              {reasonOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(validationError || submitError) && (
          <div data-testid="correction-error" role="alert" className="mt-3 text-[11px] font-mono text-rose-400">
            {validationError ?? submitError}
          </div>
        )}

        <div className="mt-4 flex justify-end space-x-2">
          <button
            type="button"
            data-testid="correction-cancel"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="correction-submit"
            disabled={invalid}
            onClick={handleSubmit}
            className="px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? 'Submitting…' : 'Submit correction'}
          </button>
        </div>
      </div>
    </div>
  );
};
