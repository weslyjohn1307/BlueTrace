import React, { useEffect, useState } from 'react';
import { displaySheetNumber } from '../utils/sheetLabels';

export type ThumbnailScaleStatus = 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED';

export interface ThumbnailCardData {
  sheet_id: string;
  sheet_number: string;
  sheet_title: string;
  discipline: string;
  scale_raw?: string | null;
  scale_status: ThumbnailScaleStatus;
  page_index: number;
}

export interface ThumbnailCardProps {
  sheet: ThumbnailCardData;
  thumbnailUrl: string;
  active: boolean;
  onSelect: (sheetId: string) => void;
  /** Optional second-chance source (e.g. the live page-image renderer) tried once before giving up. */
  fallbackUrl?: string;
}

function disciplineBadge(discipline: string): string {
  const d = discipline.toUpperCase();
  if (d.includes('MECH')) return 'bg-mep-mechanical-tint text-mep-mechanical border-mep-mechanical/30';
  if (d.includes('PLUMB')) return 'bg-mep-plumbing-tint text-mep-plumbing border-mep-plumbing/30';
  if (d.includes('ELEC')) return 'bg-mep-electrical-tint text-mep-electrical border-mep-electrical/30';
  return 'bg-bt-panel text-bt-text-secondary border-bt-border-strong';
}

/** One sheet thumbnail: preview image plus discipline and scale badges. */
export const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  sheet,
  thumbnailUrl,
  active,
  onSelect,
  fallbackUrl,
}) => {
  const [src, setSrc] = useState(thumbnailUrl);
  const [triedFallback, setTriedFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A new sheet (or a new primary URL) resets the error state so a stale
  // failure never hides a fresh thumbnail.
  useEffect(() => {
    setSrc(thumbnailUrl);
    setTriedFallback(false);
    setFailed(false);
    setLoaded(false);
  }, [thumbnailUrl, fallbackUrl]);

  const handleError = () => {
    if (fallbackUrl && !triedFallback && src !== fallbackUrl) {
      setTriedFallback(true);
      setSrc(fallbackUrl);
      return;
    }
    setFailed(true);
  };

  const scaleOk = sheet.scale_status === 'VERIFIED' || sheet.scale_status === 'CALIBRATED';
  return (
    <button
      type="button"
      data-testid="thumbnail-card"
      aria-label={`${displaySheetNumber(sheet.sheet_number, sheet.page_index)} ${sheet.sheet_title}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(sheet.sheet_id)}
      className={`w-full text-left rounded-lg border overflow-hidden transition-all cursor-pointer ${
        active
          ? 'border-bt-selection-border ring-1 ring-bt-selection-border bg-bt-brand-soft'
          : 'border-bt-border-subtle hover:border-bt-border-strong'
      } bg-bt-surface/60`}
    >
      <div className="relative w-full aspect-[4/3] bg-bt-inset">
        {!loaded && !failed && (
          <div
            data-testid="thumbnail-skeleton"
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-bt-panel"
          />
        )}
        {failed ? (
          <div
            data-testid="thumbnail-fallback"
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-bt-surface text-bt-text-secondary"
          >
            <span className="font-sans font-semibold text-bt-text-primary text-sm">{displaySheetNumber(sheet.sheet_number, sheet.page_index)}</span>
            <span className="font-sans text-xs">Preview unavailable</span>
          </div>
        ) : (
          <img
            src={src}
            alt={`Preview of ${displaySheetNumber(sheet.sheet_number, sheet.page_index)}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={handleError}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>
      <div className="p-1.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="min-w-0 truncate font-sans font-semibold text-bt-text-primary text-xs" title={sheet.sheet_number}>
            {displaySheetNumber(sheet.sheet_number, sheet.page_index)}
          </span>
          <span
            className={`max-w-24 truncate text-xs px-1.5 py-0.5 rounded font-sans font-semibold border shrink-0 ${disciplineBadge(sheet.discipline)}`}
          >
            {sheet.discipline}
          </span>
        </div>
        <div className="truncate font-sans text-xs text-bt-text-secondary" title={sheet.sheet_title}>{sheet.sheet_title || 'Untitled Sheet'}</div>
        <div className="font-sans text-xs">
          {scaleOk ? (
            <span className="text-bt-success font-semibold">{sheet.scale_raw || 'Verified'}</span>
          ) : (
            <span className="text-bt-review font-medium">Scale unverified</span>
          )}
        </div>
      </div>
    </button>
  );
};
