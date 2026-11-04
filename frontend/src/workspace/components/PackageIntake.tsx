import React from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, LoaderCircle, Pause, Play, ChevronDown } from 'lucide-react';
import type { AgentJobProgress } from '../hooks/useTakeoffSession';
import { ScaleStateBadge } from './ScaleStateBadge';

export interface PackageSheetSummary {
  sheetType?: string | null;
  title: string;
  discipline: string;
  scaleStatus: string;
}

export interface PackageIntakeProps {
  fileName: string;
  pageIndex: number;
  totalPages: number | null;
  summarySheets: PackageSheetSummary[];
  sheetNumber: string;
  sheetTitle: string;
  discipline: string;
  scaleStatus: string;
  sheetType?: string | null;
  progress: AgentJobProgress | null;
  analysisScope: 'all' | 'vision' | null;
  agentName: string;
  message: string;
  running: boolean;
  onPageChange: (pageIndex: number) => void;
  metaConsent: boolean;
  onMetaConsentChange: (consented: boolean) => void;
  onStart: (metaConsent: boolean) => void;
  onCancel: () => void;
  onResume: () => void;
}

/** Compact package controls keep the drawing visible while analysis is optional and explicit. */
export const PackageIntake: React.FC<PackageIntakeProps> = ({
  fileName,
  pageIndex,
  totalPages,
  summarySheets,
  sheetNumber,
  sheetTitle,
  discipline,
  scaleStatus,
  sheetType,
  progress,
  analysisScope,
  agentName,
  message,
  running,
  onPageChange,
  metaConsent,
  onMetaConsentChange,
  onStart,
  onCancel,
  onResume,
}) => {
  const pageCount = totalPages ?? 1;
  const [pageDraft, setPageDraft] = React.useState(String(pageIndex + 1));
  React.useEffect(() => setPageDraft(String(pageIndex + 1)), [pageIndex]);
  const paused = progress?.status === 'paused' || progress?.status === 'failed';
  const complete = progress?.status === 'complete';
  const classifiedSheets = summarySheets.filter((sheet) => Boolean(sheet.sheetType));
  const classifiedCount = Math.max(classifiedSheets.length, progress?.classifiedPages ?? 0);
  const pageTypes = classifiedSheets.reduce<Record<string, number>>((counts, sheet) => {
    const rawType = sheet.sheetType?.toLowerCase() ?? '';
    const type = rawType === 'plan'
      ? 'Plans'
      : rawType === 'schedule'
        ? 'Schedules'
        : rawType === 'legend'
          ? 'Legends'
          : rawType === 'other' && /notes|cover|index|information|specification/i.test(sheet.title)
            ? 'Information'
            : rawType === 'detail' || rawType === 'riser' || rawType === 'diagram'
              ? 'Details and diagrams'
              : 'Other / unclassified';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
  const disciplines = classifiedSheets.reduce<Record<string, number>>((counts, sheet) => {
    counts[sheet.discipline] = (counts[sheet.discipline] ?? 0) + 1;
    return counts;
  }, {});
  const scaleCounts = classifiedSheets.reduce<Record<string, number>>((counts, sheet) => {
    const key = sheet.scaleStatus === 'VERIFIED'
      ? 'Verified'
      : sheet.scaleStatus === 'CALIBRATED'
        ? 'Manually calibrated'
        : sheet.scaleStatus === 'CONFLICT'
          ? 'Conflicting'
          : 'Needs review';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const commitPage = () => {
    const parsed = Number(pageDraft);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > pageCount) {
      setPageDraft(String(pageIndex + 1));
      return;
    }
    onPageChange(parsed - 1);
  };

  return (
    <section
      data-testid="package-analysis-control"
      aria-label="Drawing package analysis"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-bt-border-subtle bg-bt-surface px-3 py-2"
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-bt-text-primary" title={`${sheetNumber} ${sheetTitle}`}>
            <span className="font-mono text-xs text-bt-text-secondary">{sheetNumber}</span>
            <span className="mx-2 text-bt-border-strong" aria-hidden="true">/</span>
            {sheetTitle}
          </h2>
          <span className="shrink-0 rounded border border-bt-border-subtle px-1.5 py-0.5 text-[11px] text-bt-text-secondary">
            {discipline}
          </span>
          <ScaleStateBadge status={scaleStatus} sheetType={sheetType} sheetTitle={sheetTitle} compact />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-bt-text-tertiary" title={fileName}>
          {fileName} · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          {progress ? ` · ${progress.classifiedPages} indexed` : ' · PDF ready'}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-bt-border-subtle bg-bt-panel px-1" aria-label="PDF page navigation">
        <button
          type="button"
          aria-label="Previous PDF page"
          title="Previous page"
          disabled={pageIndex <= 0}
          onClick={() => onPageChange(pageIndex - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-bt-text-secondary hover:bg-bt-surface hover:text-bt-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="flex items-center gap-1 font-mono text-xs tabular-nums text-bt-text-secondary">
          <span className="sr-only">Go to PDF page</span>
          <input
            type="number"
            min={1}
            max={pageCount}
            value={pageDraft}
            aria-label="Go to PDF page"
            onChange={(event) => setPageDraft(event.target.value)}
            onBlur={commitPage}
            onKeyDown={(event) => { if (event.key === 'Enter') { commitPage(); event.currentTarget.blur(); } }}
            className="h-8 w-12 border-0 bg-transparent p-0 text-center font-mono text-xs text-bt-text-primary outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
          />
          <span>/ {pageCount}</span>
        </label>
        <button
          type="button"
          aria-label="Next PDF page"
          title="Next page"
          disabled={pageIndex + 1 >= pageCount}
          onClick={() => onPageChange(pageIndex + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-bt-text-secondary hover:bg-bt-surface hover:text-bt-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <details className="group basis-full">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-bt-border-subtle px-2.5 text-xs text-bt-text-secondary hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus [&::-webkit-details-marker]:hidden">
          Package review
          <span className="font-mono tabular-nums text-bt-text-tertiary">{Math.min(classifiedCount, pageCount)} / {pageCount}</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 w-full rounded-md border border-bt-border-subtle bg-bt-panel p-3">
          <h3 className="text-xs font-semibold text-bt-text-primary">Package index</h3>
          <p className="mt-1 text-xs text-bt-text-secondary" role="status" aria-live="polite">
            {complete ? `${classifiedCount} of ${pageCount} pages classified` : `${classifiedCount} of ${pageCount} pages classified so far`}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-bt-border-subtle pt-3">
            <div>
              <h4 className="text-[11px] font-medium text-bt-text-tertiary">Sheet types</h4>
              {Object.entries(pageTypes).length ? Object.entries(pageTypes).map(([label, count]) => (
                <p key={label} className="mt-1 flex justify-between gap-2 text-xs text-bt-text-primary"><span>{label}</span><span className="font-mono tabular-nums">{count}</span></p>
              )) : <p className="mt-1 text-xs text-bt-text-secondary">Classification pending</p>}
            </div>
            <div>
              <h4 className="text-[11px] font-medium text-bt-text-tertiary">Disciplines</h4>
              {Object.entries(disciplines).map(([label, count]) => (
                <p key={label} className="mt-1 flex justify-between gap-2 text-xs text-bt-text-primary"><span className="truncate">{label}</span><span className="font-mono tabular-nums">{count}</span></p>
              ))}
            </div>
            <div>
              <h4 className="text-[11px] font-medium text-bt-text-tertiary">Scale states</h4>
              {Object.entries(scaleCounts).map(([label, count]) => (
                <p key={label} className="mt-1 flex justify-between gap-2 text-xs text-bt-text-primary"><span>{label}</span><span className="font-mono tabular-nums">{count}</span></p>
              ))}
            </div>
          </div>
        </div>
      </details>

      {running ? (
        <div className="flex min-w-52 flex-1 basis-60 items-center gap-2" role="status" aria-live="polite">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-bt-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs text-bt-text-secondary">
          {progress
              ? `${progress.analysisScope === 'vision' ? 'Vision pass' : 'Local audit'} · ${progress.classifiedPages}${progress.totalPages ? ` of ${progress.totalPages}` : ''} sheets · ${agentName}: ${message}`
              : 'Starting local sheet analysis'}
          </span>
          <button type="button" onClick={onCancel} disabled={!progress?.jobId} className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-bt-text-secondary hover:bg-bt-panel disabled:opacity-40">
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            Pause
          </button>
        </div>
      ) : complete && analysisScope === 'vision' ? (
        <div className="flex items-center gap-2 text-xs text-bt-success" role="status">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Vision pass complete · {progress?.classifiedPages ?? 0} sheets reviewed
        </div>
      ) : complete ? (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-2 text-xs text-bt-success" role="status">
            <Bot className="h-4 w-4" aria-hidden="true" />
            Local audit complete · {progress?.classifiedPages ?? 0} sheets indexed
          </span>
          <label className="inline-flex items-center gap-2 text-[11px] text-bt-text-secondary">
            <input
              type="checkbox"
              checked={metaConsent}
              onChange={(event) => onMetaConsentChange(event.target.checked)}
              title="Sends sheet imagery and extracted text to Meta using your configured API quota."
              className="h-4 w-4 accent-bt-brand-solid"
            />
              Send pages to Meta for vision analysis
          </label>
          <button
            type="button"
            disabled={!metaConsent}
            onClick={() => onStart(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-bt-brand-solid px-3 text-xs font-medium text-bt-on-brand transition-colors hover:bg-bt-brand-solid-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run vision pass
          </button>
        </div>
      ) : paused ? (
        <div className="flex items-center gap-2 text-xs text-bt-review" role="status">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span>Analysis paused at page {Math.max(1, progress?.classifiedPages ?? 1)}</span>
          <button type="button" onClick={onResume} className="inline-flex h-8 items-center gap-1 rounded bg-bt-brand-solid px-2.5 font-medium text-bt-on-brand hover:bg-bt-brand-solid-hover">
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Resume
          </button>
        </div>
      ) : (
        <div className="flex min-w-56 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <label className="inline-flex items-center gap-2 text-[11px] text-bt-text-secondary">
            <input
              type="checkbox"
              checked={metaConsent}
              onChange={(event) => onMetaConsentChange(event.target.checked)}
              title="When enabled, sheet imagery and extracted text may be sent to Meta using your configured API quota."
              className="h-4 w-4 accent-bt-brand-solid"
            />
              Send pages to Meta for vision analysis
          </label>
          <button
            type="button"
            onClick={() => onStart(metaConsent)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-bt-brand-solid px-3 text-xs font-medium text-bt-on-brand transition-colors hover:bg-bt-brand-solid-hover"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {metaConsent ? 'Start vision pass' : 'Start local analysis'}
          </button>
        </div>
      )}
    </section>
  );
};
