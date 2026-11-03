import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ViewportContainerProps {
  error: string | null;
  reconcileError: string | null;
  sheetImageAvailable: boolean;
  children: React.ReactNode;
}

export const ViewportContainer: React.FC<ViewportContainerProps> = ({
  error,
  reconcileError,
  sheetImageAvailable,
  children,
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative" style={{ minHeight: 0 }}>
      {/* Partial-failure banner: per-sheet scan / ledger errors stay visible in-workspace */}
      {error && (
        <div
          role="alert"
          className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 max-w-xl px-3 py-2 rounded-lg bg-amber-950/90 backdrop-blur-md border border-amber-500/40 text-amber-200 text-[11px] font-mono shadow-lg"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="truncate">{error}</span>
        </div>
      )}
      {reconcileError && (
        <div
          role="alert"
          className={`absolute ${error ? 'top-12' : 'top-2'} left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 max-w-xl px-3 py-2 rounded-lg bg-amber-950/90 backdrop-blur-md border border-amber-500/40 text-amber-200 text-[11px] font-mono shadow-lg`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="truncate">{reconcileError}</span>
        </div>
      )}

      {/* Canvas Surface or Re-open Prompt */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {!sheetImageAvailable ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center space-y-2 text-center px-6"
          >
            <p className="text-slate-200 text-sm font-mono font-semibold">
              Session restored — page images need the source PDF.
            </p>
            <p className="text-slate-400 text-xs font-mono">
              Re-open the PDF to restore page images. Ledger, sheets, and viewport state are intact.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
