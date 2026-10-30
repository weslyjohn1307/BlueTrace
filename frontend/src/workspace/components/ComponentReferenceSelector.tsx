import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  FileUp,
  MinusCircle,
  Check,
  Upload,
  AlertCircle,
  Layers,
} from 'lucide-react';
import type { ComponentReference, ReferenceMode } from '../../api/contracts';
import { apiClient } from '../../api/client';

export interface ComponentReferenceSelectorProps {
  projectId?: string | null;
  drawingSourceId?: string | null;
  drawingFilename?: string;
  drawingPageCount?: number;
  value: ComponentReference;
  onChange: (ref: ComponentReference) => void;
  // Separate reference PDF handling
  onReferenceFileSelected?: (file: File) => void;
  referenceFileName?: string | null;
  referenceFilePageCount?: number;
  referenceSourceId?: string | null;
  isUploadingReference?: boolean;
}

export const ComponentReferenceSelector: React.FC<ComponentReferenceSelectorProps> = ({
  projectId,
  drawingSourceId,
  drawingFilename = 'Uploaded Drawing',
  drawingPageCount = 1,
  value,
  onChange,
  onReferenceFileSelected,
  referenceFileName,
  referenceFilePageCount = 0,
  referenceSourceId,
  isUploadingReference = false,
}) => {
  const [separateUploadError, setSeparateUploadError] = useState<string | null>(null);

  const handleModeChange = (mode: ReferenceMode) => {
    if (mode === 'none') {
      onChange({
        reference_mode: 'none',
        reference_source_id: null,
        reference_pages: [],
      });
    } else if (mode === 'same_pdf') {
      // Default to page 1 if none selected
      const initialPages = value.reference_pages.length > 0 ? value.reference_pages : [1];
      onChange({
        reference_mode: 'same_pdf',
        reference_source_id: drawingSourceId || null,
        reference_pages: initialPages,
      });
    } else if (mode === 'separate_pdf') {
      onChange({
        reference_mode: 'separate_pdf',
        reference_source_id: referenceSourceId || null,
        reference_pages: referenceFilePageCount > 0 ? [1] : [],
      });
    }
  };

  const togglePageSelection = (pageNum: number) => {
    const current = new Set(value.reference_pages);
    if (current.has(pageNum)) {
      current.delete(pageNum);
    } else {
      current.add(pageNum);
    }
    const sorted = Array.from(current).sort((a, b) => a - b);
    onChange({
      ...value,
      reference_pages: sorted,
    });
  };

  const selectAllPages = (total: number) => {
    const all = Array.from({ length: total }, (_, i) => i + 1);
    onChange({
      ...value,
      reference_pages: all,
    });
  };

  const clearPages = () => {
    onChange({
      ...value,
      reference_pages: [],
    });
  };

  const handleSeparateFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeparateUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setSeparateUploadError('Only PDF files (.pdf) are supported for reference.');
      return;
    }
    if (file.size === 0) {
      setSeparateUploadError('The selected reference file is empty (0 bytes).');
      return;
    }

    if (onReferenceFileSelected) {
      onReferenceFileSelected(file);
    }
  };

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-5 shadow-xs text-left">
      {/* Header */}
      <div className="flex items-start space-x-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-[#006D84]/10 text-[#006D84] flex items-center justify-center shrink-0 mt-0.5">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-heading text-sm font-bold text-slate-900 tracking-tight">
            Component / Legend Reference
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Tell us where the component symbols and definitions are located. This helps the AI understand what to detect.
          </p>
        </div>
      </div>

      {/* Mode Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
        {/* Option 1: Pages in this PDF */}
        <button
          type="button"
          onClick={() => handleModeChange('same_pdf')}
          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
            value.reference_mode === 'same_pdf'
              ? 'border-[#006D84] bg-sky-50/60 ring-1 ring-[#006D84]'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-[#006D84]" />
              <span className="text-xs font-semibold text-slate-900">Pages in this PDF</span>
            </div>
            {value.reference_mode === 'same_pdf' && (
              <span className="w-4 h-4 rounded-full bg-[#006D84] text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Select symbol, schedule, or notes pages from this drawing file.
          </p>
        </button>

        {/* Option 2: Separate Reference PDF */}
        <button
          type="button"
          onClick={() => handleModeChange('separate_pdf')}
          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
            value.reference_mode === 'separate_pdf'
              ? 'border-[#006D84] bg-sky-50/60 ring-1 ring-[#006D84]'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div className="flex items-center space-x-2">
              <FileUp className="w-4 h-4 text-[#006D84]" />
              <span className="text-xs font-semibold text-slate-900">Upload a separate reference PDF</span>
            </div>
            {value.reference_mode === 'separate_pdf' && (
              <span className="w-4 h-4 rounded-full bg-[#006D84] text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Upload an external symbols sheet (e.g. Symbols_for_detection.pdf).
          </p>
        </button>

        {/* Option 3: No reference */}
        <button
          type="button"
          onClick={() => handleModeChange('none')}
          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
            value.reference_mode === 'none'
              ? 'border-[#006D84] bg-sky-50/60 ring-1 ring-[#006D84]'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div className="flex items-center space-x-2">
              <MinusCircle className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-900">No component reference</span>
            </div>
            {value.reference_mode === 'none' && (
              <span className="w-4 h-4 rounded-full bg-[#006D84] text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Run standard Fire Damper baseline and linework routing without legend.
          </p>
        </button>
      </div>

      {/* Sub-Panel: Option A (Pages in this PDF) */}
      {value.reference_mode === 'same_pdf' && (
        <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-800">
                Select Component / Legend Pages
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({drawingPageCount} total {drawingPageCount === 1 ? 'page' : 'pages'})
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <button
                type="button"
                onClick={() => selectAllPages(drawingPageCount)}
                className="text-[11px] text-[#006D84] hover:underline font-medium cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={clearPages}
                className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Page Checkbox Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
            {Array.from({ length: drawingPageCount }, (_, i) => i + 1).map((pageNum) => {
              const isSelected = value.reference_pages.includes(pageNum);
              const thumbUrl =
                projectId && drawingSourceId
                  ? apiClient.getPageThumbnailUrl(projectId, drawingSourceId, pageNum)
                  : null;

              return (
                <label
                  key={pageNum}
                  className={`flex flex-col items-center p-2 rounded-md border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#006D84] bg-white shadow-2xs ring-1 ring-[#006D84]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Thumbnail / Placeholder */}
                  <div className="w-full h-16 bg-slate-100 rounded border border-slate-100 mb-1.5 flex items-center justify-center overflow-hidden">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`Page ${pageNum}`}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={(e) => {
                          // Hide broken thumbnail image and show fallback icon
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Layers className="w-5 h-5 text-slate-300" />
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 w-full justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePageSelection(pageNum)}
                      className="rounded border-slate-300 text-[#006D84] focus:ring-[#006D84] h-3.5 w-3.5"
                    />
                    <span className="text-xs font-mono font-medium text-slate-800">
                      Page {pageNum}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Selection Counter */}
          <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Selected pages:{' '}
              {value.reference_pages.length > 0 ? (
                <span className="font-mono text-[#006D84] font-semibold">
                  {value.reference_pages.join(', ')}
                </span>
              ) : (
                <span className="text-rose-500 font-normal">None selected (select at least one)</span>
              )}
            </span>
            <span className="text-[11px] text-slate-400">Human-friendly 1-based indexing</span>
          </div>
        </div>
      )}

      {/* Sub-Panel: Option B (Separate Reference PDF) */}
      {value.reference_mode === 'separate_pdf' && (
        <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-lg">
          {!referenceFileName ? (
            /* Upload dropzone for separate reference */
            <div>
              <div className="border border-dashed border-slate-300 hover:border-[#006D84] rounded-lg p-4 text-center bg-white transition-colors">
                <Upload className="w-6 h-6 text-[#006D84] mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-800">
                  Upload Component / Legend Reference PDF
                </p>
                <p className="text-[11px] text-slate-500 mb-2.5">
                  Select an external PDF containing symbols, schedules, or component definitions.
                </p>
                <label className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md bg-[#006D84] hover:bg-[#005769] text-white text-xs font-medium cursor-pointer shadow-2xs transition-colors">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Choose Reference PDF</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleSeparateFileInput}
                    disabled={isUploadingReference}
                  />
                </label>
              </div>
              {separateUploadError && (
                <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{separateUploadError}</span>
                </div>
              )}
            </div>
          ) : (
            /* Reference PDF uploaded: Show page selector */
            <div>
              <div className="flex items-center justify-between mb-3 bg-white p-2.5 rounded-md border border-slate-200">
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-4 h-4 text-[#006D84] shrink-0" />
                  <span className="text-xs font-semibold text-slate-800 truncate" title={referenceFileName}>
                    {referenceFileName}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    ({referenceFilePageCount} {referenceFilePageCount === 1 ? 'page' : 'pages'})
                  </span>
                </div>

                <label className="text-[11px] text-[#006D84] hover:underline font-medium cursor-pointer shrink-0 ml-2">
                  Replace File
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleSeparateFileInput}
                    disabled={isUploadingReference}
                  />
                </label>
              </div>

              {/* Page Checkboxes for Reference PDF */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  Select all pages containing component/legend information:
                </span>
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => selectAllPages(referenceFilePageCount)}
                    className="text-[11px] text-[#006D84] hover:underline font-medium cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={clearPages}
                    className="text-[11px] text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
                {Array.from({ length: referenceFilePageCount }, (_, i) => i + 1).map((pageNum) => {
                  const isSelected = value.reference_pages.includes(pageNum);
                  const thumbUrl =
                    projectId && referenceSourceId
                      ? apiClient.getPageThumbnailUrl(projectId, referenceSourceId, pageNum)
                      : null;

                  return (
                    <label
                      key={pageNum}
                      className={`flex flex-col items-center p-2 rounded-md border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#006D84] bg-white shadow-2xs ring-1 ring-[#006D84]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="w-full h-16 bg-slate-100 rounded border border-slate-100 mb-1.5 flex items-center justify-center overflow-hidden">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={`Page ${pageNum}`}
                            className="w-full h-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Layers className="w-5 h-5 text-slate-300" />
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 w-full justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePageSelection(pageNum)}
                          className="rounded border-slate-300 text-[#006D84] focus:ring-[#006D84] h-3.5 w-3.5"
                        />
                        <span className="text-xs font-mono font-medium text-slate-800">
                          Page {pageNum}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">
                  Selected pages:{' '}
                  {value.reference_pages.length > 0 ? (
                    <span className="font-mono text-[#006D84] font-semibold">
                      {value.reference_pages.join(', ')}
                    </span>
                  ) : (
                    <span className="text-rose-500 font-normal">None selected (select at least one)</span>
                  )}
                </span>
                <span className="text-[11px] text-slate-400">From reference PDF</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Panel: Option C (No Reference) */}
      {value.reference_mode === 'none' && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          <p>
            No external legend or symbol reference supplied. The system will execute using the verified
            Fire Damper YOLO baseline and standard continuous duct/pipe geometry extraction.
          </p>
        </div>
      )}

      {/* Final Verification & Summary Bar */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-700">Active Reference:</span>
          {value.reference_mode === 'same_pdf' && (
            <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {drawingFilename} — {value.reference_pages.length > 0 ? `Pages: ${value.reference_pages.join(', ')}` : 'No pages selected'}
            </span>
          )}
          {value.reference_mode === 'separate_pdf' && (
            <span className="font-mono text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {referenceFileName || 'Reference PDF'} — {value.reference_pages.length > 0 ? `Pages: ${value.reference_pages.join(', ')}` : 'No pages selected'}
            </span>
          )}
          {value.reference_mode === 'none' && (
            <span className="text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              None (Default Extraction Baseline)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
