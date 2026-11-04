import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Modal } from './primitives/Modal';
import { Button } from './primitives/Button';

export interface ByokDialogProps {
  open: boolean;
  onClose: () => void;
  configured: boolean;
  maskedKey: string | null;
  onChanged: () => void;
}

/**
 * Bring-your-own-key dialog. The key lives in React state until submitted,
 * then only in server memory for this session. Never persisted client-side.
 */
export const ByokDialog: React.FC<ByokDialogProps> = ({ open, onClose, configured, maskedKey, onChanged }) => {
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const save = async () => {
    if (busy) return;
    if (!keyInput.trim()) {
      setError('Please enter a valid Meta Model API key.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.configureByok(keyInput.trim());
      setKeyInput('');
      onChanged();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not configure key');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.clearByok();
      onChanged();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not clear key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="API key configuration"
      className="w-full max-w-sm bg-bt-surface border border-bt-border-strong rounded-xl p-4 text-bt-text-primary text-xs shadow-2xl"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-bt-text-primary uppercase tracking-wider text-[11px]">Meta API key</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded hover:bg-bt-panel text-bt-text-secondary hover:text-bt-on-brand cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {configured ? (
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-bt-success font-mono">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Configured{maskedKey ? ` (${maskedKey})` : ''} — this session only</span>
          </div>
          <Button
            type="button"
            variant="danger"
            size="md"
            onClick={() => void clear()}
            disabled={busy}
            className="w-full"
          >
            Clear key for this session
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-bt-text-secondary">
            Paste a Meta Model API key to enable SheetScan, hover OCR, schedule parsing, and the reasoning copilot.
            Vectors, ledger, and export work without one.
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => {
              setKeyInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            placeholder="API key"
            aria-label="API key"
            aria-invalid={error !== null}
            aria-describedby={error ? 'byok-error' : undefined}
            autoComplete="off"
            className="w-full px-2.5 py-2 rounded-lg bg-bt-panel border border-bt-border-strong outline-none focus:border-cyan-500 font-mono text-bt-text-primary"
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => void save()}
            disabled={busy || keyInput.trim() === ''}
            className="w-full"
          >
            Save for this session
          </Button>
        </div>
      )}
      {error && (
        <div id="byok-error" className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200" role="alert">
          {error}
        </div>
      )}
      <p className="mt-2 text-[10px] text-bt-text-tertiary">
        Memory-only: never written to disk, logs, or browser storage. Discarded on tab close.
      </p>
    </Modal>
  );
};
