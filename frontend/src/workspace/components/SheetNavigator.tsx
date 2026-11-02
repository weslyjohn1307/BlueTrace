import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { ScannedSheet } from '../hooks/useTakeoffSession';
import { ThumbnailCard } from './ThumbnailCard';

export interface SheetNavigatorProps {
  sheets: ScannedSheet[];
  activeSheetId: string | null;
  /** Wire to `selectSheet` from `useTakeoffSession` — click sets the active sheet. */
  onSelectSheet: (sheetId: string) => void;
  /** Max mounted cards; keeps DOM bounded for large drawing sets. Defaults to 8. */
  windowSize?: number;
  getThumbnailUrl?: (pdfPath: string, pageIndex: number) => string;
  /** When set, cards load the cached intake thumbnail first and fall back to `getThumbnailUrl` on error. */
  projectId?: string | null;
}

const DEFAULT_WINDOW = 8;

/** Virtualized multi-sheet navigator: mounts a sliding window of thumbnails. */
export const SheetNavigator: React.FC<SheetNavigatorProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  windowSize = DEFAULT_WINDOW,
  getThumbnailUrl = (pdfPath, pageIndex) => apiClient.getPageImageUrl(pdfPath, pageIndex, 72),
  projectId = null,
}) => {
  const [windowStart, setWindowStart] = useState(0);

  const activeIndex = sheets.findIndex((s) => s.meta.sheet_id === activeSheetId);

  const start = useMemo(() => {
    if (sheets.length <= windowSize) return 0;
    // Center the window on the active sheet when it drifts outside.
    if (activeIndex >= 0 && (activeIndex < windowStart || activeIndex >= windowStart + windowSize)) {
      return Math.min(
        Math.max(0, activeIndex - Math.floor(windowSize / 2)),
        sheets.length - windowSize
      );
    }
    return Math.min(windowStart, Math.max(0, sheets.length - windowSize));
  }, [sheets.length, windowSize, activeIndex, windowStart]);

  const visible = sheets.slice(start, start + windowSize);
  const canPrev = start > 0;
  const canNext = start + windowSize < sheets.length;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200" data-testid="sheet-navigator">
      <div className="p-2 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] font-mono">
            Sheets
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            {sheets.length === 0 ? '0' : `${start + 1}–${start + visible.length} of ${sheets.length}`}
          </span>
        </div>
        {sheets.length > windowSize && (
          <div className="flex items-center space-x-1">
            <button
              type="button"
              aria-label="Previous sheets"
              disabled={!canPrev}
              onClick={() => setWindowStart((s) => Math.max(0, s - windowSize))}
              className="inline-flex items-center justify-center min-w-10 min-h-10 rounded text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next sheets"
              disabled={!canNext}
              onClick={() =>
                setWindowStart((s) => Math.min(Math.max(0, sheets.length - windowSize), s + windowSize))
              }
              className="inline-flex items-center justify-center min-w-10 min-h-10 rounded text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sheets.length === 0 ? (
          <div className="p-6 text-center text-slate-500 font-mono italic text-[11px]">
            No sheets indexed yet.
          </div>
        ) : (
          visible.map((sheet) => {
            const pageImageUrl = getThumbnailUrl(sheet.pdfPath, sheet.pageIndex);
            // The intake pipeline caches one WebP per page; prefer it and keep
            // the live renderer as the onError fallback (see ThumbnailCard).
            // Older test doubles may not stub getThumbnailUrl — fall back to
            // the page-image URL exactly as before in that case.
            const cachedUrl =
              projectId && typeof apiClient.getThumbnailUrl === 'function'
                ? apiClient.getThumbnailUrl(projectId, sheet.pageIndex)
                : null;
            return (
              <ThumbnailCard
                key={sheet.meta.sheet_id}
                sheet={sheet.meta}
                thumbnailUrl={cachedUrl ?? pageImageUrl}
                fallbackUrl={cachedUrl ? pageImageUrl : undefined}
                active={sheet.meta.sheet_id === activeSheetId}
                onSelect={onSelectSheet}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
