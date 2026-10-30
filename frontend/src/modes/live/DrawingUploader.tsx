import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  AlertCircle, 
  RefreshCw, 
  X
} from 'lucide-react';
import { apiClient } from '../../api/client';
import type { DrawingResponse } from '../../api/contracts';
import { useLiveData } from './liveContext';

interface DrawingUploaderProps {
  onUploadSuccess: (drawing: DrawingResponse) => void;
}

export const DrawingUploader: React.FC<DrawingUploaderProps> = ({ onUploadSuccess }) => {
  const { activeProject, loadDrawings } = useLiveData();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bytesLoaded, setBytesLoaded] = useState<number>(0);
  const [bytesTotal, setBytesTotal] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return 'Only PDF files (.pdf) are supported.';
    }
    if (file.size === 0) {
      return 'The selected file is empty (0 bytes). Please choose a valid PDF.';
    }
    // Optional check for max size (e.g. 100MB)
    const MAX_SIZE_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      return 'File exceeds maximum upload size (100 MB).';
    }
    return null;
  };

  const handleFileSelection = (file: File) => {
    setUploadError(null);
    const err = validateFile(file);
    if (err) {
      setUploadError(err);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length > 1) {
        setUploadError('Please select only one drawing PDF file at a time.');
        return;
      }
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async () => {
    if (!activeProject || !selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setBytesLoaded(0);
    setBytesTotal(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await apiClient.uploadDrawing(
        activeProject.project_id,
        selectedFile,
        (loaded, total) => {
          setBytesLoaded(loaded);
          setBytesTotal(total);
        },
        controller.signal
      );

      onUploadSuccess(result);
      loadDrawings(activeProject.project_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!activeProject) {
    return (
      <div className="w-full max-w-xl p-8 bg-white border border-slate-200 rounded-lg text-center">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-800 font-heading">No Active Project</h3>
        <p className="text-xs text-slate-500 mt-1">
          Please select or create a project in the navigation pane before importing drawings.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50/70">
        <h3 className="font-heading font-semibold text-sm text-slate-900">
          Import MEP Construction Drawing
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload a 2D PDF drawing to inspect preflight geometry and extract route quantities.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          id="drawing-file-input"
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleInputChange}
          className="sr-only"
          disabled={isUploading}
          aria-label="Select PDF construction drawing"
        />

        {/* Drag and Drop Surface */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-[#006D84] bg-teal-50/50'
              : selectedFile
              ? 'border-emerald-300 bg-emerald-50/20'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/30'
          }`}
          role="region"
          aria-label="PDF upload dropzone"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-[#006D84]' : 'text-slate-400'}`} aria-hidden="true" />
          
          <p className="text-sm font-medium text-slate-700">
            {dragActive ? 'Drop the PDF file here' : 'Drag and drop PDF drawing, or browse'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supports vector-native or raster PDF construction sheets up to 100 MB.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            disabled={isUploading}
            className="mt-4 px-3 py-1.5 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] rounded focus:outline-none focus:ring-2 focus:ring-[#006D84]"
          >
            Choose File
          </button>
        </div>

        {/* Selected File Details */}
        {selectedFile && !isUploading && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
            <div className="flex items-center space-x-2.5 truncate pr-2">
              <FileText className="w-5 h-5 text-[#006D84] flex-shrink-0" aria-hidden="true" />
              <div className="truncate">
                <span className="block text-xs font-semibold text-slate-800 truncate" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
                <span className="block text-[11px] text-slate-500 font-mono">
                  {formatFileSize(selectedFile.size)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded focus:outline-none"
              aria-label="Remove selected file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="space-y-2 p-4 bg-slate-50 rounded-md border border-slate-200">
            <div className="flex items-center justify-between text-xs text-slate-700">
              <span className="font-medium flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#006D84]" aria-hidden="true" />
                <span>Uploading {selectedFile?.name}...</span>
              </span>
              <span className="font-mono text-slate-600">
                {bytesTotal
                  ? `${formatFileSize(bytesLoaded)} / ${formatFileSize(bytesTotal)} (${Math.round((bytesLoaded / bytesTotal) * 100)}%)`
                  : `${formatFileSize(bytesLoaded)} uploaded`}
              </span>
            </div>

            <div 
              role="progressbar"
              aria-valuenow={bytesTotal ? Math.round((bytesLoaded / bytesTotal) * 100) : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
              className="w-full bg-slate-200 rounded-full h-2 overflow-hidden"
            >
              <div
                className={`bg-[#006D84] h-2 rounded-full transition-all duration-150 ${
                  !bytesTotal ? 'w-full animate-pulse' : ''
                }`}
                style={{ width: bytesTotal ? `${(bytesLoaded / bytesTotal) * 100}%` : '100%' }}
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleCancelUpload}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium"
              >
                Cancel Upload
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {uploadError && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">{uploadError}</p>
              {selectedFile && !isUploading && (
                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  className="mt-1.5 inline-flex items-center space-x-1 text-rose-800 underline font-semibold hover:text-rose-900"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry Upload</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Submit Upload Action */}
        {selectedFile && !isUploading && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleUploadSubmit}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] rounded-md shadow-xs focus:outline-none focus:ring-2 focus:ring-[#006D84]"
            >
              Upload and Preflight
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
