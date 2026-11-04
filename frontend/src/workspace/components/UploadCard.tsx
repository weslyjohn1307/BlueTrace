import React, { useRef, useState } from 'react';
import { CircleAlert, FileUp } from 'lucide-react';

export interface UploadCardProps {
  loading: boolean;
  loadingStage?: 'uploading' | 'scanning' | 'orchestrating';
  error: string | null;
  onFile: (file: File) => void;
}

const STAGE_COPY: Record<'uploading' | 'scanning' | 'orchestrating', string> = {
  uploading: 'Uploading the drawing package',
  scanning: 'Opening the first sheet',
  orchestrating: 'Starting the sheet audit',
};

export const UploadCard: React.FC<UploadCardProps> = ({
  loading,
  loadingStage = 'scanning',
  error,
  onFile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-8"
      data-testid="upload-card"
    >
      <h1 className="text-2xl font-semibold tracking-tight text-bt-text-primary">
        Open a drawing package
      </h1>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a PDF here or choose a file"
        aria-disabled={loading}
        onClick={() => {
          if (!loading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !loading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!loading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (loading) return;
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`mt-6 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005BFF] ${
          dragOver
            ? 'border-[#37C6FF] bg-[#005BFF]/10 ring-2 ring-[#37C6FF]/30'
            : 'border-bt-border-strong/80 bg-bt-surface/60 hover:border-[#005BFF]/70 hover:bg-bt-surface/90'
        } ${loading ? 'cursor-wait' : 'cursor-pointer'}`}
      >
        {loading ? (
          <div className="py-4" role="status" aria-live="polite">
            <FileUp className="mx-auto h-7 w-7 text-[#37C6FF]" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-bt-text-primary">{STAGE_COPY[loadingStage]}</p>
          </div>
        ) : (
          <div>
            <FileUp className="mx-auto h-7 w-7 text-[#37C6FF]" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-bt-text-primary">
              Drop a PDF here, or choose a file
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div
          className="mt-3 flex items-start gap-2 rounded-md border border-bt-danger-border bg-bt-danger-bg p-3 text-sm text-bt-danger"
          role="alert"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error === 'Failed to fetch'
            ? 'The local BlueTrace server could not be reached. Check the connection and try again.'
            : error}
        </div>
      )}

    </div>
  );
};
