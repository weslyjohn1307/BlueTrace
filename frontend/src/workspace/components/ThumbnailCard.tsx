import React from 'react';

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
}

function disciplineBadge(discipline: string): string {
  const d = discipline.toUpperCase();
  if (d.includes('MECH')) return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40';
  if (d.includes('PLUMB')) return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
  if (d.includes('ELEC')) return 'bg-purple-950/80 text-purple-300 border-purple-500/40';
  if (d.includes('ARCH')) return 'bg-amber-950/80 text-amber-300 border-amber-500/40';
  return 'bg-slate-800 text-slate-400 border-slate-700';
}

/** One sheet thumbnail: preview image plus discipline and scale badges. */
export const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  sheet,
  thumbnailUrl,
  active,
  onSelect,
}) => {
  const scaleOk = sheet.scale_status === 'VERIFIED' || sheet.scale_status === 'CALIBRATED';
  return (
    <button
      type="button"
      data-testid="thumbnail-card"
      aria-label={`${sheet.sheet_number} ${sheet.sheet_title}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(sheet.sheet_id)}
      className={`w-full text-left rounded-lg border overflow-hidden transition-all cursor-pointer ${
        active
          ? 'border-cyan-400/80 ring-1 ring-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
          : 'border-slate-800 hover:border-slate-700'
      } bg-slate-900/60`}
    >
      <img
        src={thumbnailUrl}
        alt={`Thumbnail of ${sheet.sheet_number}`}
        loading="lazy"
        className="w-full aspect-[4/3] object-cover bg-slate-950"
      />
      <div className="p-1.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono font-bold text-slate-100 text-[11px] truncate">
            {sheet.sheet_number}
          </span>
          <span
            className={`text-[9px] uppercase px-1 py-px rounded font-mono font-semibold border shrink-0 ${disciplineBadge(sheet.discipline)}`}
          >
            {sheet.discipline}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 truncate">{sheet.sheet_title || 'Untitled Sheet'}</div>
        <div className="text-[10px] font-mono">
          {scaleOk ? (
            <span className="text-emerald-400 font-semibold">{sheet.scale_raw || 'Verified'}</span>
          ) : (
            <span className="text-amber-400 font-medium">Review Required</span>
          )}
        </div>
      </div>
    </button>
  );
};
