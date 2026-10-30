import React, { useState } from 'react';
import { 
  FileCheck2, 
  AlertTriangle, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  HelpCircle,
  FileCode,
  Info
} from 'lucide-react';
import type { DrawingResponse, DrawingPreflightResponse, ComponentReference } from '../../api/contracts';
import { ComponentReferenceSelector } from '../../workspace/components/ComponentReferenceSelector';
import { apiClient } from '../../api/client';

interface PreflightViewerProps {
  drawing: DrawingResponse;
  preflight: DrawingPreflightResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onSubmitProcessing: (componentReference?: ComponentReference) => void;
  isSubmittingJob: boolean;
}

export const PreflightViewer: React.FC<PreflightViewerProps> = ({
  drawing,
  preflight,
  isLoading,
  error,
  onRetry,
  onSubmitProcessing,
  isSubmittingJob,
}) => {
  const [componentRef, setComponentRef] = useState<ComponentReference>({
    reference_mode: 'none',
    reference_source_id: null,
    reference_pages: [],
  });
  const [separateFile, setSeparateFile] = useState<File | null>(null);
  const [separateSourceId, setSeparateSourceId] = useState<string | null>(null);
  const [separatePageCount, setSeparatePageCount] = useState<number>(0);
  const [isUploadingSeparate, setIsUploadingSeparate] = useState<boolean>(false);

  const handleSeparateFileSelected = async (file: File) => {
    setSeparateFile(file);
    setIsUploadingSeparate(true);
    try {
      const uploaded = await apiClient.uploadDrawing(drawing.project_id, file);
      const refPreflight = await apiClient.getDrawingPreflight(drawing.project_id, uploaded.source_id);
      setSeparateSourceId(uploaded.source_id);
      setSeparatePageCount(refPreflight.page_count || 1);
      setComponentRef({
        reference_mode: 'separate_pdf',
        reference_source_id: uploaded.source_id,
        reference_pages: [1],
      });
    } catch {
      // Error handled by selector
    } finally {
      setIsUploadingSeparate(false);
    }
  };

  const abbreviatedSha = drawing.sha256 ? `${drawing.sha256.slice(0, 12)}...` : 'Unknown';

  const renderConfidenceBadge = (confidence: string) => {
    const norm = confidence.toLowerCase();
    if (norm === 'high') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
          <span>High Confidence</span>
        </span>
      );
    }
    if (norm === 'medium') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
          <Info className="w-3 h-3 text-blue-600" aria-hidden="true" />
          <span>Medium Confidence</span>
        </span>
      );
    }
    // unknown or low: visually neutral/unverified
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-300">
        <HelpCircle className="w-3 h-3 text-amber-600" aria-hidden="true" />
        <span>Unverified Candidate ({confidence})</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl p-8 bg-white border border-slate-200 rounded-lg text-center">
        <RefreshCw className="w-8 h-8 text-[#006D84] animate-spin mx-auto mb-3" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold text-slate-800">
          Running Preflight Inspection...
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Analyzing PDF structure, geometry, page dimensions, and sheet title blocks.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl p-6 bg-white border border-rose-200 rounded-lg text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold text-rose-800">
          Preflight Inspection Failed
        </h3>
        <p className="text-xs text-rose-600 mt-1 max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-3 py-1.5 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] rounded focus:outline-none focus:ring-2 focus:ring-[#006D84]"
        >
          Retry Preflight
        </button>
      </div>
    );
  }

  if (!preflight) {
    return (
      <div className="w-full max-w-2xl p-8 bg-white border border-slate-200 rounded-lg text-center">
        <RefreshCw className="w-8 h-8 text-[#006D84] animate-spin mx-auto mb-3" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold text-slate-800">
          Loading Preflight Inspection...
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Retrieving preflight report for drawing {drawing.filename}.
        </p>
      </div>
    );
  }

  const isProcessable = preflight.overall_status === 'PROCESSABLE';

  return (
    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <FileCheck2 className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
            <h3 className="font-heading font-semibold text-sm text-slate-900 truncate">
              {drawing.filename}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Source ID: <span className="font-mono text-slate-700">{drawing.source_id}</span> • SHA-256:{' '}
            <span className="font-mono text-slate-700">{abbreviatedSha}</span>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span
            className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
              isProcessable
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {preflight.overall_status}
          </span>
        </div>
      </div>

      {/* Drawing Meta Summary */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/30 border-b border-slate-200 text-xs">
        <div>
          <span className="text-slate-500 block text-[11px]">Pages</span>
          <span className="font-semibold text-slate-800 font-mono">{preflight.page_count}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">Source Status</span>
          <span className="font-semibold text-slate-800">{drawing.import_state}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">File Size</span>
          <span className="font-semibold text-slate-800 font-mono">
            {(drawing.byte_size / (1024 * 1024)).toFixed(2)} MB
          </span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">Preflight Result</span>
          <span className={`font-semibold ${isProcessable ? 'text-emerald-700' : 'text-amber-700'}`}>
            {isProcessable ? 'Ready to Process' : 'Review Required'}
          </span>
        </div>
      </div>

      {/* Pages Preflight Details */}
      <div className="p-4 space-y-4">
        <h4 className="font-heading font-semibold text-xs text-slate-700 uppercase tracking-wider">
          Page-Level Preflight Inspection
        </h4>

        <div className="space-y-3">
          {preflight.pages.map((page) => {
            const isUnknownSheet = page.sheet_id_confidence.toLowerCase() === 'unknown';
            return (
              <div
                key={page.page_id}
                className="p-3 bg-white border border-slate-200 rounded-md space-y-2 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span className="font-semibold text-slate-800">
                      Page {page.page_number}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      ({page.page_id})
                    </span>
                  </div>
                  <div>{renderConfidenceBadge(page.sheet_id_confidence)}</div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Sheet ID Candidate:</span>
                    <span
                      className={`font-mono font-bold ${
                        isUnknownSheet ? 'text-amber-800 italic' : 'text-slate-900'
                      }`}
                    >
                      {page.candidate_sheet_id || 'Unknown'}
                    </span>
                    {isUnknownSheet && (
                      <span className="block text-[10px] text-amber-700">
                        (Unverified fallback)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Dimensions:</span>
                    <span className="font-mono text-slate-800">
                      {page.width_pt.toFixed(1)} × {page.height_pt.toFixed(1)} pt
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Rotation:</span>
                    <span className="font-mono text-slate-800">{page.rotation}°</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Derivation Source:</span>
                    <span className="text-slate-700">{page.sheet_id_source}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Modality:</span>
                    <span className="text-slate-700">{page.modality_hint}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Page Role:</span>
                    <span className="text-slate-700">{page.page_role_hint}</span>
                  </div>
                </div>

                {page.warnings && page.warnings.length > 0 && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                    <div className="font-semibold flex items-center space-x-1 mb-0.5">
                      <AlertTriangle className="w-3 h-3 text-amber-600" aria-hidden="true" />
                      <span>Warnings:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {page.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Component / Legend Reference Configuration */}
        <div className="pt-4 border-t border-slate-200">
          <ComponentReferenceSelector
            projectId={drawing.project_id}
            drawingSourceId={drawing.source_id}
            drawingFilename={drawing.filename}
            drawingPageCount={preflight?.page_count || 1}
            value={componentRef}
            onChange={setComponentRef}
            onReferenceFileSelected={handleSeparateFileSelected}
            referenceFileName={separateFile?.name}
            referenceFilePageCount={separatePageCount}
            referenceSourceId={separateSourceId}
            isUploadingReference={isUploadingSeparate}
          />
        </div>

        {/* Action Button: Start Processing */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {isProcessable
              ? 'Geometry verified. Ready for child-process background extraction.'
              : 'Drawing contains warnings. Processing may yield partial extractions.'}
          </p>

          <button
            type="button"
            onClick={() => onSubmitProcessing(componentRef.reference_mode === 'none' ? undefined : componentRef)}
            disabled={isSubmittingJob}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] disabled:opacity-50 disabled:cursor-not-allowed rounded-md shadow-xs focus:outline-none focus:ring-2 focus:ring-[#006D84]"
          >
            {isSubmittingJob ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Submitting Job...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Submit for Processing</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
