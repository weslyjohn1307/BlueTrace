import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import type { AgentJobProgress } from '../hooks/useTakeoffSession';

export interface PackageIntakeProps {
  fileName: string;
  imageUrl?: string | null;
  progress: AgentJobProgress | null;
  agentName: string;
  message: string;
}

/**
 * PDF-first intake: the first page stays on screen while the sheet audit runs.
 * Counts are shown as work completed, never as accepted takeoff.
 */
export const PackageIntake: React.FC<PackageIntakeProps> = ({
  fileName,
  imageUrl,
  progress,
  agentName,
  message,
}) => {
  const [previewFailed, setPreviewFailed] = useState(false);
  const totalPages = progress?.totalPages ?? null;
  const classified = progress?.classifiedPages ?? 0;
  const hasTotal = typeof totalPages === 'number' && totalPages > 0;
  const percent = hasTotal ? Math.min(100, Math.round((classified / totalPages) * 100)) : 0;

  return (
    <section
      data-testid="package-processing-state"
      aria-live="polite"
      className="mx-auto grid w-full max-w-5xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <figure className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-bt-border-subtle bg-bt-inset">
        <div className="flex flex-1 items-center justify-center p-3">
          {imageUrl && !previewFailed ? (
            <img
              src={imageUrl}
              alt={`First page of ${fileName}`}
              className="max-h-[62vh] w-auto max-w-full object-contain"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="max-w-xs text-center">
              <FileText className="mx-auto h-8 w-8 text-bt-text-tertiary" aria-hidden="true" />
              <p className="mt-2 text-sm text-bt-text-secondary">
                {previewFailed ? 'The page preview could not be rendered.' : 'Preparing the first page'}
              </p>
              <p className="mt-1 text-xs text-bt-text-tertiary">
                {previewFailed
                  ? 'Keep working from the Sheets panel; open any page that is ready.'
                  : 'The drawing appears here as soon as the local copy is readable.'}
              </p>
            </div>
          )}
        </div>
        <figcaption className="border-t border-bt-border-subtle px-3 py-2 text-[11px] text-bt-text-secondary">
          {fileName}, page 1 preview
        </figcaption>
      </figure>

      <div className="flex flex-col rounded-lg border border-bt-border-subtle bg-bt-surface/60 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-bt-text-tertiary">
          Reading the package
        </p>
        <h1 className="mt-1 truncate text-base font-semibold text-bt-text-primary" title={fileName}>
          {fileName}
        </h1>

        <div className="mt-4">
          <p className="text-sm text-bt-text-primary" role="status">
            {hasTotal
              ? `${classified} of ${totalPages} pages classified`
              : 'Classification is starting'}
          </p>
          {hasTotal ? (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded bg-bt-panel"
              aria-label={`${percent}% of pages classified`}
            >
              <div
                className="h-full rounded bg-[#37C6FF] transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-xs font-medium text-[#9BDCFF]">{agentName}</p>
        <p className="mt-1 text-xs leading-relaxed text-bt-text-secondary">{message}</p>

        <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-bt-border-subtle pt-3 text-[11px]">
          <div>
            <dt className="text-bt-text-tertiary">Items proposed</dt>
            <dd className="font-mono tabular-nums text-bt-text-primary">{progress?.detections ?? 0}</dd>
          </div>
          <div>
            <dt className="text-bt-text-tertiary">Needs review</dt>
            <dd className="font-mono tabular-nums text-bt-text-primary">{progress?.reviewFlags ?? 0}</dd>
          </div>
        </dl>

        <p className="mt-auto pt-4 text-[11px] leading-relaxed text-bt-text-tertiary">
          Items are proposals. Nothing is accepted until you review it, and measured lengths stay
          locked until the sheet scale is verified or calibrated.
        </p>
      </div>
    </section>
  );
};
