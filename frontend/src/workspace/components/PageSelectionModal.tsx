import React, { useState, useCallback, useMemo } from 'react';
import { FileText, X, Layers, AlertTriangle, Zap, Clock, Check } from 'lucide-react';

export interface PageSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  pageCount: number;
  /** Called when user confirms selection. Passes null for all pages, or number[] of 1-based page numbers. */
  onConfirm: (selectedPages: number[] | null) => void;
}

function getResourceLevel(count: number): { label: string; color: string; description: string } {
  if (count <= 3) return { label: 'Low', color: 'text-emerald-700', description: '~10–25 sec · minimal peak RAM' };
  if (count <= 7) return { label: 'Moderate', color: 'text-sky-700', description: '~30–60 sec · ~250 MB RAM' };
  if (count <= 15) return { label: 'High', color: 'text-amber-700', description: '~1–3 min · ~500 MB RAM' };
  return { label: 'Heavy', color: 'text-rose-700', description: '~3–6 min · ~1 GB peak RAM' };
}

function parseRangeInput(input: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  const parts = input.split(/[,;\s]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let p = Math.max(1, start); p <= Math.min(maxPages, end); p++) {
          result.add(p);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        result.add(num);
      }
    }
  }
  return result;
}

function formatPageList(pages: number[]): string {
  if (pages.length === 0) return 'None';
  if (pages.length <= 6) return `Pages ${pages.join(', ')}`;
  return `Pages ${pages.slice(0, 5).join(', ')}... (+${pages.length - 5} more)`;
}

export const PageSelectionModal: React.FC<PageSelectionModalProps> = ({
  isOpen,
  onClose,
  filename,
  pageCount,
  onConfirm,
}) => {
  const [mode, setMode] = useState<'subset' | 'all'>('subset');
  // Default to first 3 pages if drawing is >10 pages, so user gets fast response by default
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => {
    const init = new Set<number>();
    const count = Math.min(3, pageCount);
    for (let i = 1; i <= count; i++) init.add(i);
    return init;
  });
  const [rangeText, setRangeText] = useState<string>(() => {
    const count = Math.min(3, pageCount);
    return count > 1 ? `1-${count}` : '1';
  });

  const selectedArray = useMemo(
    () => Array.from(selectedPages).sort((a, b) => a - b),
    [selectedPages]
  );

  const activeCount = mode === 'all' ? pageCount : selectedArray.length;
  const resource = getResourceLevel(activeCount);

  const handleTogglePage = useCallback((pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      const arr = Array.from(next).sort((a, b) => a - b);
      setRangeText(arr.join(', '));
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const all = new Set<number>();
    for (let i = 1; i <= pageCount; i++) all.add(i);
    setSelectedPages(all);
    setRangeText(`1-${pageCount}`);
  }, [pageCount]);

  const handleClear = useCallback(() => {
    setSelectedPages(new Set());
    setRangeText('');
  }, []);

  const handlePresetFirstN = useCallback((n: number) => {
    const subset = new Set<number>();
    const limit = Math.min(n, pageCount);
    for (let i = 1; i <= limit; i++) subset.add(i);
    setSelectedPages(subset);
    setRangeText(`1-${limit}`);
  }, [pageCount]);

  const handleRangeTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setRangeText(val);
      const parsed = parseRangeInput(val, pageCount);
      setSelectedPages(parsed);
    },
    [pageCount]
  );

  const handleConfirm = useCallback(() => {
    if (mode === 'all') {
      onConfirm(null);
    } else {
      if (selectedArray.length === 0) return;
      onConfirm(selectedArray);
    }
    onClose();
  }, [mode, selectedArray, onConfirm, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-select-title"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-[#006D84]" />
            <span id="page-select-title" className="font-heading text-sm font-semibold text-slate-900">
              Large Drawing Detected ({pageCount} Pages)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* File info */}
          <div className="flex items-start space-x-3 p-2.5 rounded-lg bg-sky-50/60 border border-[#006D84]/20">
            <FileText className="w-4 h-4 text-[#006D84] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate" title={filename}>
                {filename}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                {pageCount} pages detected · Select pages to analyze
              </div>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('subset')}
              className={`py-2 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === 'subset'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Select Specific Pages (Recommended)
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`py-2 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Process All {pageCount} Pages
            </button>
          </div>

          {mode === 'subset' ? (
            <div className="space-y-3">
              {/* Quick Preset Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] text-slate-500">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handlePresetFirstN(3)}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors cursor-pointer"
                  >
                    First 3
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetFirstN(5)}
                    className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors cursor-pointer"
                  >
                    First 5
                  </button>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] font-medium text-[#006D84] hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-[11px] font-medium text-slate-500 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Range Input */}
              <div>
                <label htmlFor="page-range-input" className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Page Range or Numbers (e.g. 1-3, 5, 8):
                </label>
                <input
                  id="page-range-input"
                  type="text"
                  value={rangeText}
                  onChange={handleRangeTextChange}
                  placeholder={`1-${pageCount}`}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#006D84] focus:border-[#006D84]"
                />
              </div>

              {/* Interactive Page Pills */}
              <div>
                <div className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>Click to toggle individual pages:</span>
                  <span className="font-mono text-slate-700">
                    {selectedArray.length} of {pageCount} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
                    const isSelected = selectedPages.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleTogglePage(p)}
                        className={`w-7 h-7 rounded text-[11px] font-mono font-medium flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#006D84] text-white shadow-xs font-bold'
                            : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                        }`}
                        title={`Page ${p}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selection summary */}
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                <span className="text-slate-500">Selected pages:</span>
                <span className="font-mono font-semibold text-slate-800 truncate max-w-xs">
                  {formatPageList(selectedArray)}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-800 leading-relaxed">
                  <span className="font-semibold">All {pageCount} pages will be processed.</span>{' '}
                  This will run symbol detection and route extraction across the complete drawing set.
                  Estimated processing time is significantly higher.
                </div>
              </div>
            </div>
          )}

          {/* Estimates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center space-x-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                  Estimated Time
                </span>
              </div>
              <div className="text-xs font-mono font-semibold text-slate-800">
                {resource.description.split('·')[0].trim()}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Estimated from recent runs
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center space-x-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                  Resource Level
                </span>
              </div>
              <div className={`text-xs font-semibold ${resource.color}`}>
                {resource.label}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {resource.description.split('·')[1]?.trim() || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            {mode === 'subset' ? (
              <span>{selectedArray.length} sheet{selectedArray.length !== 1 ? 's' : ''} to analyze</span>
            ) : (
              <span>All {pageCount} sheets to analyze</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-200 bg-white border border-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="page-selection-confirm-btn"
              onClick={handleConfirm}
              disabled={mode === 'subset' && selectedArray.length === 0}
              className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005769] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {mode === 'all'
                  ? `Process All ${pageCount} Pages`
                  : `Analyze ${selectedArray.length} Selected Page${selectedArray.length !== 1 ? 's' : ''}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
