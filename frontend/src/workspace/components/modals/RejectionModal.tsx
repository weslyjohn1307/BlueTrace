import React, { useState, useEffect } from 'react';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { AlertCircle } from 'lucide-react';

export const REJECTION_REASON_OPTIONS = [
  { code: 'WRONG_EQUIPMENT_TAG', label: 'Incorrect equipment classification' },
  { code: 'GEOMETRY_ARTIFACT', label: 'False linework / CAD text artifact' },
  { code: 'DUPLICATE_RUN', label: 'Duplicate takeoff entry' },
  { code: 'SCALE_INCORRECT', label: 'Dimension does not match scale' },
  { code: 'OTHER', label: 'Other (specify)' },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_OPTIONS)[number]['code'];

export interface RejectionModalProps {
  open: boolean;
  itemId?: string;
  itemLabel?: string;
  isSubmitting?: boolean;
  onConfirm: (reasonCode: string, note?: string) => void;
  onCancel: () => void;
}

export const RejectionModal: React.FC<RejectionModalProps> = ({
  open,
  itemId,
  itemLabel,
  isSubmitting = false,
  onConfirm,
  onCancel,
}) => {
  const [reasonCode, setReasonCode] = useState<string>(REJECTION_REASON_OPTIONS[0].code);
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReasonCode(REJECTION_REASON_OPTIONS[0].code);
      setNote('');
      setError(null);
    }
  }, [open, itemId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonCode) {
      setError('Please select a rejection reason code.');
      return;
    }
    if (reasonCode === 'OTHER' && !note.trim()) {
      setError('Please specify a description when selecting Other.');
      return;
    }
    setError(null);
    onConfirm(reasonCode, note.trim() || undefined);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      data-testid="rejection-modal"
      ariaLabel={`Reject item ${itemLabel ?? itemId ?? ''}`}
      className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl bg-bt-surface border border-rose-500/40 shadow-2xl p-5"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <h2 className="text-sm font-mono font-bold text-rose-300">Reject takeoff item</h2>
        </div>
        <p className="mt-1 text-[11px] font-mono text-bt-text-secondary truncate">
          {itemLabel ?? itemId ?? 'Selected item'} — records rejection reason in audit ledger
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="rejection-reason" className="block text-[11px] font-mono text-bt-text-secondary mb-1">
              Reason code (required)
            </label>
            <select
              id="rejection-reason"
              data-testid="rejection-reason-select"
              value={reasonCode}
              onChange={(e) => {
                setReasonCode(e.target.value);
                if (error) setError(null);
              }}
              className="w-full rounded-md bg-bt-inset border border-bt-border-strong px-2.5 py-1.5 text-xs font-mono text-bt-text-primary outline-none focus:border-rose-500"
            >
              {REJECTION_REASON_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.code} — {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rejection-note" className="block text-[11px] font-mono text-bt-text-secondary mb-1">
              Additional notes {reasonCode === 'OTHER' ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="rejection-note"
              data-testid="rejection-note-input"
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError(null);
              }}
              placeholder={
                reasonCode === 'OTHER'
                  ? 'Specify why this item is rejected...'
                  : 'Optional notes for estimator audit trail...'
              }
              aria-invalid={error != null}
              aria-describedby={error ? 'rejection-error' : undefined}
              className="w-full rounded-md bg-bt-inset border border-bt-border-strong px-2.5 py-1.5 text-xs font-mono text-bt-text-primary outline-none focus:border-rose-500 resize-none"
            />
          </div>
        </div>

        {error && (
          <div
            id="rejection-error"
            data-testid="rejection-error"
            role="alert"
            className="mt-2.5 flex items-center space-x-1.5 text-[11px] font-mono text-rose-400"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end space-x-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="rejection-cancel"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            data-testid="rejection-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Rejecting…' : 'Confirm rejection'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
