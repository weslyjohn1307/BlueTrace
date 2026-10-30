import React, { useState } from 'react';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../../api/client';

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
    if (!keyInput.trim() || busy) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-label="API key">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 text-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">Meta API key</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {configured ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-emerald-300 font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>Configured{maskedKey ? ` (${maskedKey})` : ''} — this session only</span>
            </div>
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
            >
              Clear key for this session
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-400">
              Paste a Meta Model API key to enable SheetScan, hover OCR, schedule parsing, and the reasoning copilot.
              Vectors, ledger, and export work without one.
            </p>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
              placeholder="API key"
              aria-label="API key"
              autoComplete="off"
              className="w-full px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || keyInput.trim() === ''}
              className="w-full px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 cursor-pointer"
            >
              Save for this session
            </button>
          </div>
        )}
        {error && (
          <div className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200" role="alert">
            {error}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          Memory-only: never written to disk, logs, or browser storage. Discarded on tab close.
        </p>
      </div>
    </div>
  );
};
