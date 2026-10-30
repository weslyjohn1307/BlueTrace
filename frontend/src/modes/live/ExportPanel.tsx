import React, { useState, useEffect, useCallback } from 'react';
import {
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type {
  ExportResponse,
  ExportSummaryItem,
  ExportListResponse,
} from '../../api/contracts';

export interface ExportPanelProps {
  projectId: string;
  runId: string;
  reviewRevision?: number;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ projectId, runId, reviewRevision }) => {
  // Export list state
  const [exports, setExports] = useState<ExportSummaryItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Active export creation state
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<ExportResponse | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{ exportId: string; message: string } | null>(null);

  // Status message for screen readers
  const [ariaStatus, setAriaStatus] = useState<string>('');

  // Fetch export list
  const fetchExports = useCallback(async () => {
    if (!projectId || !runId) return;
    setIsLoadingList(true);
    setListError(null);
    try {
      const res: ExportListResponse = await apiClient.listExports(projectId, runId);
      setExports(res.items);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load exports');
    } finally {
      setIsLoadingList(false);
    }
  }, [projectId, runId]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports, reviewRevision]);

  // Handle Create Export Bundle
  const handleCreateExport = async () => {
    if (!projectId || !runId || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    setAriaStatus('Initiating deterministic export bundle creation...');

    try {
      const res = await apiClient.createExport(projectId, runId);
      setCreateSuccess(res);
      setAriaStatus(
        res.state === 'ALREADY_EXPORTED'
          ? `Bundle reused: already exported as ${res.export_id}`
          : `New bundle created: ${res.export_id}`
      );
      // Refresh list
      await fetchExports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create export bundle';
      setCreateError(msg);
      setAriaStatus(`Export creation failed: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Download Export ZIP
  const handleDownload = async (exportId: string) => {
    if (!projectId || !runId || downloadingId) return;
    setDownloadingId(exportId);
    setDownloadError(null);
    setAriaStatus(`Downloading export bundle ${exportId}...`);

    let objectUrl: string | null = null;
    try {
      const blob = await apiClient.downloadExport(projectId, runId, exportId);
      if (!blob || blob.size === 0) {
        throw new Error('Downloaded ZIP bundle is empty or corrupted');
      }

      objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${exportId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setAriaStatus(`Download started for ${exportId}.zip`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setDownloadError({ exportId, message: msg });
      setAriaStatus(`Download failed for ${exportId}: ${msg}`);
    } finally {
      if (objectUrl) {
        // Safe revocation of object URL
        window.URL.revokeObjectURL(objectUrl);
      }
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4" role="region" aria-label="Exports and bundles">
      {/* Hidden Live Region for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaStatus}
      </div>

      {/* 1. Primary Action */}
      <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Deterministic Export Bundle
            </h3>
            <span className="text-[11px] text-slate-500 block">
              7-file verifiable audit and public takeoff package
            </span>
          </div>
          <ShieldCheck className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={handleCreateExport}
          disabled={isCreating}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-[#006D84] hover:bg-[#005769] disabled:bg-slate-300 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#006D84]"
        >
          {isCreating ? (
            <>
              <Clock className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Creating Bundle...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Create Export Bundle</span>
            </>
          )}
        </button>

        {/* Creation Feedback / Status */}
        {createSuccess && (
          <div
            role="status"
            className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 space-y-1"
          >
            <div className="flex items-center space-x-1.5 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>
                {createSuccess.state === 'ALREADY_EXPORTED'
                  ? 'Reused Existing Export Bundle'
                  : 'Created New Export Bundle'}
              </span>
            </div>
            <div className="font-mono text-[10px] space-y-0.5 pt-1 text-slate-600">
              <div>ID: <span className="font-bold text-slate-900">{createSuccess.export_id}</span></div>
              <div>State: <span className="uppercase text-emerald-700 font-bold">{createSuccess.state}</span></div>
              {createSuccess.bundle_size_bytes && (
                <div>Size: {(createSuccess.bundle_size_bytes / 1024).toFixed(1)} KB</div>
              )}
              {createSuccess.bundle_sha256 && (
                <div className="truncate" title={createSuccess.bundle_sha256}>
                  SHA: {createSuccess.bundle_sha256.slice(0, 16)}...
                </div>
              )}
            </div>
          </div>
        )}

        {createError && (
          <div
            role="alert"
            className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1"
          >
            <div className="flex items-center space-x-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-hidden="true" />
              <span>Export Failed</span>
            </div>
            <p className="text-[11px] text-red-600">{createError}</p>
          </div>
        )}
      </div>

      {/* 2. Plain Language Explanation of Views and Immutability */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
        <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
          <span>Included Views in Bundle</span>
        </h4>
        <ul className="space-y-1.5 text-[11px] text-slate-600">
          <li className="flex items-start space-x-1.5">
            <span className="font-semibold text-slate-900 shrink-0">• Raw extraction:</span>
            <span>Immutable engine result (canonical routes and objects).</span>
          </li>
          <li className="flex items-start space-x-1.5">
            <span className="font-semibold text-slate-900 shrink-0">• Public output:</span>
            <span>Exact five challenge fields (JSON and CSV).</span>
          </li>
          <li className="flex items-start space-x-1.5">
            <span className="font-semibold text-slate-900 shrink-0">• Reviewed result:</span>
            <span>Raw extraction overlaid with separate human review projection.</span>
          </li>
          <li className="flex items-start space-x-1.5">
            <span className="font-semibold text-slate-900 shrink-0">• Summary:</span>
            <span>Backend-authoritative counts and measurement availability.</span>
          </li>
        </ul>
        <div className="pt-1 border-t border-slate-200/80 text-[10px] text-slate-500 italic">
          Review notes never alter route geometry, confidence, scale, physical length, or source lineage.
        </div>
      </div>

      {/* 3. Export History List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Export History ({exports.length})
          </h4>
          <button
            type="button"
            onClick={fetchExports}
            disabled={isLoadingList}
            title="Refresh export list"
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <RotateCcw className={`w-3 h-3 ${isLoadingList ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="sr-only">Refresh exports</span>
          </button>
        </div>

        {isLoadingList && exports.length === 0 && (
          <div className="p-4 text-center text-xs text-slate-500">
            <Clock className="w-4 h-4 mx-auto mb-1 animate-spin text-[#006D84]" aria-hidden="true" />
            <span>Loading export history...</span>
          </div>
        )}

        {listError && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1">
            <p>{listError}</p>
            <button
              type="button"
              onClick={fetchExports}
              className="text-[11px] underline font-semibold text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoadingList && exports.length === 0 && !listError && (
          <div className="p-4 bg-white border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400">
            <span>No export bundles generated for this run yet.</span>
          </div>
        )}

        {exports.length > 0 && (
          <ul className="space-y-2" aria-label="Available exports">
            {exports.map((item) => (
              <li
                key={item.export_id}
                className="p-3 bg-white border border-slate-200 rounded-lg space-y-2 text-xs shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-mono font-bold text-slate-900 truncate max-w-[170px]" title={item.export_id}>
                      {item.export_id}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {(item.bundle_size_bytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(item.export_id)}
                    disabled={downloadingId === item.export_id}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium text-xs transition-colors shrink-0 focus:outline-none focus:ring-1 focus:ring-[#006D84]"
                  >
                    {downloadingId === item.export_id ? (
                      <>
                        <Clock className="w-3 h-3 animate-spin text-[#006D84]" aria-hidden="true" />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3 text-[#006D84]" aria-hidden="true" />
                        <span>ZIP</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-100 font-mono text-[10px] text-slate-400 space-y-0.5">
                  <div className="truncate" title={item.manifest_sha256}>
                    Manifest: {item.manifest_sha256.slice(0, 14)}...
                  </div>
                  <div className="truncate" title={item.bundle_sha256}>
                    Bundle SHA: {item.bundle_sha256.slice(0, 14)}...
                  </div>
                </div>

                {downloadError?.exportId === item.export_id && (
                  <div className="text-[10px] text-red-600 bg-red-50 p-1 rounded border border-red-200">
                    {downloadError.message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
