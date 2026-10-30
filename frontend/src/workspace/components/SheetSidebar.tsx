import React, { useEffect, useState } from 'react';
import { Layers, FileText, CheckCircle2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SheetItem } from '../../api/contracts';
import { apiClient } from '../../api/client';

export interface SheetSidebarProps {
  projectId: string;
  runId: string;
  sheets: SheetItem[];
  selectedSheet: SheetItem | null;
  onSelectSheet: (sheet: SheetItem) => void;
  isLoading?: boolean;
}

interface ThumbnailState {
  url: string | null;
  isLoading: boolean;
  hasError: boolean;
}

export const SheetSidebar: React.FC<SheetSidebarProps> = ({
  projectId,
  runId,
  sheets,
  selectedSheet,
  onSelectSheet,
  isLoading = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailState>>({});

  // Fetch thumbnails with strict Object URL cleanup
  useEffect(() => {
    if (!projectId || !runId || sheets.length === 0) return;

    const activeUrls: string[] = [];
    let isMounted = true;
    const controller = new AbortController();

    sheets.forEach((sheet) => {
      setThumbnails((prev) => ({
        ...prev,
        [sheet.page_id]: { url: null, isLoading: true, hasError: false },
      }));

      apiClient
        .getPageThumbnailBlob(projectId, runId, sheet.page_id, controller.signal)
        .then((result) => {
          if (!isMounted) return;
          const url = URL.createObjectURL(result.blob);
          activeUrls.push(url);
          setThumbnails((prev) => ({
            ...prev,
            [sheet.page_id]: { url, isLoading: false, hasError: false },
          }));
        })
        .catch(() => {
          if (!isMounted) return;
          setThumbnails((prev) => ({
            ...prev,
            [sheet.page_id]: { url: null, isLoading: false, hasError: true },
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
          // ignore
        }
      });
    };
  }, [projectId, runId, sheets]);

  if (isCollapsed) {
    return (
      <aside
        aria-label="Drawing Sheets Sidebar Collapsed"
        className="w-12 bg-white border-r border-slate-200 flex flex-col items-center py-3 select-none shrink-0"
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          title="Expand Sheets Panel"
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 writing-mode-vertical text-[11px] font-medium text-slate-500 tracking-wider uppercase">
          Sheets ({sheets.length})
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Drawing Sheets Sidebar"
      className="w-64 bg-white border-r border-slate-200 flex flex-col select-none shrink-0"
    >
      {/* Sidebar Header */}
      <div className="h-11 px-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[#006D84]" />
          <span className="font-heading text-xs font-semibold text-slate-800">
            Drawing Sheets
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-200/80 text-slate-700">
            {sheets.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          title="Collapse Panel"
          className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sheet List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {isLoading && sheets.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            <Clock className="w-5 h-5 mx-auto mb-2 text-[#006D84] animate-spin" />
            Loading sheets...
          </div>
        ) : sheets.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No sheets available
          </div>
        ) : (
          sheets.map((sheet) => {
            const isSelected = selectedSheet?.sheet_id === sheet.sheet_id;
            const thumb = thumbnails[sheet.page_id];
            const pageNum = sheet.page_index + 1;
            const sheetTitle = sheet.sheet_id || `Page ${pageNum}`;

            return (
              <button
                key={sheet.sheet_id}
                type="button"
                onClick={() => onSelectSheet(sheet)}
                className={`w-full text-left rounded-lg p-2 transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-sky-50/60 border-[#006D84] shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Thumbnail Preview Area */}
                <div className="w-full h-28 rounded bg-slate-100 border border-slate-200/80 overflow-hidden relative flex items-center justify-center mb-2">
                  {thumb?.url ? (
                    <img
                      src={thumb.url}
                      alt={`Thumbnail for ${sheetTitle}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  ) : thumb?.isLoading ? (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Clock className="w-4 h-4 animate-spin text-slate-400 mb-1" />
                      <span className="text-[10px]">Rendering...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <FileText className="w-6 h-6 text-slate-300 mb-1" />
                      <span className="text-[10px]">Sheet {pageNum}</span>
                    </div>
                  )}

                  {/* Page index badge */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/70 text-white backdrop-blur-xs">
                    P.{pageNum}
                  </span>
                </div>

                {/* Sheet Metadata */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isSelected ? 'text-[#006D84]' : 'text-slate-800'
                    }`}
                    title={sheetTitle}
                  >
                    {sheetTitle}
                  </span>
                  <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                    <span>Ready</span>
                  </span>
                </div>

                {/* Object & Route Counts */}
                <div className="mt-1 flex items-center space-x-2 text-[11px] text-slate-500 font-mono">
                  <span title="Detected Quantifiable Components">
                    {sheet.object_count} obj{sheet.object_count !== 1 ? 's' : ''}
                  </span>
                  <span>•</span>
                  <span title="Extracted Linear Routes">
                    {sheet.route_count} run{sheet.route_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
