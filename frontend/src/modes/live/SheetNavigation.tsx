import React, { useEffect, useState } from 'react';
import {
  Layers,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
} from 'lucide-react';
import type { SheetItem, ViewDetailResponse } from '../../api/contracts';
import { apiClient } from '../../api/client';

export interface SheetNavigationProps {
  projectId: string;
  runId: string;
  sheets: SheetItem[];
  selectedSheetId: string | null;
  selectedViewId: string | null;
  views: ViewDetailResponse[];
  onSelectSheet: (sheet: SheetItem) => void;
  isLoading: boolean;
  error: string | null;
}

interface ThumbnailState {
  url: string | null;
  isLoading: boolean;
  error: boolean;
}

export const SheetNavigation: React.FC<SheetNavigationProps> = ({
  projectId,
  runId,
  sheets,
  selectedSheetId,
  selectedViewId,
  views,
  onSelectSheet,
  isLoading,
  error,
}) => {
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailState>>({});

  // Fetch thumbnails with strict Object URL cleanup
  useEffect(() => {
    const activeUrls: string[] = [];
    let isMounted = true;
    const controller = new AbortController();

    sheets.forEach((sheet) => {
      setThumbnails((prev) => ({
        ...prev,
        [sheet.page_id]: { url: null, isLoading: true, error: false },
      }));

      apiClient
        .getPageThumbnailBlob(projectId, runId, sheet.page_id, controller.signal)
        .then((result) => {
          if (!isMounted) return;
          const url = URL.createObjectURL(result.blob);
          activeUrls.push(url);
          setThumbnails((prev) => ({
            ...prev,
            [sheet.page_id]: { url, isLoading: false, error: false },
          }));
        })
        .catch(() => {
          if (!isMounted) return;
          setThumbnails((prev) => ({
            ...prev,
            [sheet.page_id]: { url: null, isLoading: false, error: true },
          }));
        });
    });

    return () => {
      isMounted = false;
      controller.abort();
      activeUrls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revocation errors
        }
      });
    };
  }, [projectId, runId, sheets]);

  // Keyboard navigation for accessible arrow up/down selection
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (sheets.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (index + 1) % sheets.length;
      onSelectSheet(sheets[nextIdx]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (index - 1 + sheets.length) % sheets.length;
      onSelectSheet(sheets[prevIdx]);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium">
          <Clock className="w-3.5 h-3.5 animate-spin text-[#006D84]" aria-hidden="true" />
          <span>Loading sheets & views...</span>
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-md border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-2">
        <div className="flex items-center space-x-1.5 text-rose-800 font-semibold">
          <AlertTriangle className="w-4 h-4 text-rose-600" aria-hidden="true" />
          <span>Sheet Listing Failed</span>
        </div>
        <p className="text-rose-700">{error}</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-500 space-y-2">
        <FileText className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
        <p className="font-medium text-slate-700">No Sheets Found in Run</p>
        <p className="text-slate-400">This indexed run does not contain extractable sheets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
          <Layers className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
          <span>Sheets & Views</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
          {sheets.length} sheet{sheets.length > 1 ? 's' : ''}
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Drawing Sheets and Views"
        className="space-y-2.5 focus:outline-none"
      >
        {sheets.map((sheet, index) => {
          const isSelected = sheet.sheet_id === selectedSheetId;
          const thumb = thumbnails[sheet.page_id];
          const isFallback =
            sheet.sheet_id.startsWith('source_p') ||
            sheet.sheet_id.startsWith('fallback') ||
            sheet.sheet_id.startsWith('sheet_');

          // Find matching view for this sheet if any
          const sheetView = views.find(
            (v) => v.sheet_id === sheet.sheet_id || v.page_id === sheet.page_id
          );

          return (
            <button
              key={sheet.sheet_id}
              role="tab"
              aria-selected={isSelected}
              aria-label={`Select sheet ${sheet.sheet_id}, page ${sheet.page_index + 1}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelectSheet(sheet)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs focus:outline-none focus:ring-2 focus:ring-[#006D84] ${
                isSelected
                  ? 'bg-[#006D84]/5 border-[#006D84] shadow-xs ring-1 ring-[#006D84]'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex space-x-3">
                {/* Thumbnail Container */}
                <div className="w-20 h-14 rounded bg-slate-100 border border-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center relative">
                  {thumb?.isLoading && (
                    <Clock className="w-4 h-4 text-slate-400 animate-spin" aria-hidden="true" />
                  )}
                  {thumb?.url && !thumb.isLoading && (
                    <img
                      src={thumb.url}
                      alt={`Thumbnail of ${sheet.sheet_id}`}
                      className="w-full h-full object-contain bg-white"
                      loading="lazy"
                    />
                  )}
                  {thumb?.error && !thumb.isLoading && (
                    <span className="text-[10px] text-slate-400 text-center px-1">
                      No Preview
                    </span>
                  )}
                  {/* Selected Indicator Badge (accessible beyond color) */}
                  {isSelected && (
                    <div className="absolute top-1 left-1 bg-[#006D84] text-white rounded-full p-0.5 shadow-xs">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* Sheet Metadata */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-slate-900 truncate">
                      {sheet.sheet_id}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Page {sheet.page_index + 1}
                    </span>
                  </div>

                  {/* Confidence Badge */}
                  <div>
                    {isFallback ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        <HelpCircle className="w-2.5 h-2.5 mr-1 text-amber-600" aria-hidden="true" />
                        Unverified Candidate
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-600" aria-hidden="true" />
                        Authoritative
                      </span>
                    )}
                  </div>

                  {/* IDs in Engineering Monospace Typography */}
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    ID: {sheet.page_id}
                  </div>

                  {sheetView && (
                    <div
                      className={`text-[10px] font-mono truncate ${
                        sheetView.view_id === selectedViewId ? 'text-teal-900 font-bold' : 'text-teal-700'
                      }`}
                    >
                      View: {sheetView.view_id}
                    </div>
                  )}

                  {/* Modality & Scale Status */}
                  <div className="pt-0.5 flex flex-wrap gap-1">
                    <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                      Scale: Unverified (null)
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
