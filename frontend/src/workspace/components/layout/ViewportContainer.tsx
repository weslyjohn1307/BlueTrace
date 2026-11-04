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
          className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex max-w-[min(42rem,calc(100%-1rem))] items-start gap-2 rounded-md border border-bt-review-border bg-bt-review-bg px-3 py-2 text-sm text-bt-review shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bt-review" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}
      {reconcileError && (
        <div
          role="alert"
          className={`absolute ${error ? 'top-12' : 'top-2'} left-1/2 -translate-x-1/2 z-40 flex max-w-[min(42rem,calc(100%-1rem))] items-start gap-2 rounded-md border border-bt-review-border bg-bt-review-bg px-3 py-2 text-sm text-bt-review shadow-lg`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bt-review" />
          <span className="min-w-0 break-words">{reconcileError}</span>
        </div>
      )}

      {/* Canvas Surface or Re-open Prompt */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {!sheetImageAvailable ? (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center space-y-2 text-center px-6"
          >
            <p className="text-bt-text-primary text-base font-sans font-semibold">
              Reopen the PDF to restore the drawing.
            </p>
            <p className="max-w-lg text-bt-text-secondary text-sm font-sans">
              The saved sheets and takeoff remain available. The page image needs the original PDF file.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};
