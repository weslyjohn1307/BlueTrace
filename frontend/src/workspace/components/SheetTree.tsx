import React, { useState } from 'react';
import { Layers, FileText, ScanLine, Search, X } from 'lucide-react';
import { displaySheetNumber } from '../utils/sheetLabels';
import { ScaleStateBadge } from './ScaleStateBadge';

export interface SheetItemData {
  sheet_id: string;
  sheet_number: string;
  sheet_title: string;
  discipline: string;
  scale_raw?: string | null;
  scale_ratio?: number | null;
  scale_status: 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED' | 'CONFLICT';
  page_index: number;
  sheet_type?: string | null;
}

export interface SheetTreeProps {
  sheets: SheetItemData[];
  activeSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
  onScanNewSheet?: () => void;
  isScanning?: boolean;
}

type DisciplineTab = 'ALL' | 'MECHANICAL' | 'PLUMBING' | 'ELECTRICAL' | 'ARCHITECTURAL';

export const SheetTree: React.FC<SheetTreeProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  onScanNewSheet,
  isScanning = false,
}) => {
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<DisciplineTab>('ALL');

  const filteredSheets = sheets.filter((sheet) => {
    const matchesSearch =
      sheet.sheet_number.toLowerCase().includes(search.toLowerCase()) ||
      sheet.sheet_title.toLowerCase().includes(search.toLowerCase());

    const matchesDiscipline =
      disciplineFilter === 'ALL' ||
      sheet.discipline.toUpperCase().includes(disciplineFilter);

    return matchesSearch && matchesDiscipline;
  });

  const getDisciplineBadge = (discipline: string) => {
    const d = discipline.toUpperCase();
    if (d.includes('MECH')) {
      return 'bg-mep-mechanical-tint text-mep-mechanical border-mep-mechanical/30';
    }
    if (d.includes('PLUMB')) {
      return 'bg-mep-plumbing-tint text-mep-plumbing border-mep-plumbing/30';
    }
    if (d.includes('ELEC')) {
      return 'bg-mep-electrical-tint text-mep-electrical border-mep-electrical/30';
    }
    if (d.includes('ARCH')) {
      return 'bg-bt-panel text-bt-text-secondary border-bt-border-subtle';
    }
    return 'bg-bt-panel text-bt-text-secondary border-bt-border-subtle';
  };

  return (
    <div className="flex min-w-0 flex-col h-full overflow-x-hidden bg-bt-surface text-bt-text-primary border-r border-bt-border-subtle text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-bt-border-subtle flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-bt-brand" />
          <span className="font-semibold text-bt-text-primary uppercase tracking-wider text-[11px] font-mono">
            Sheet Directory
          </span>
          <span className="text-[10px] font-mono text-bt-text-secondary bg-bt-panel px-1.5 py-0.5 rounded border border-bt-border-strong">
            {filteredSheets.length}/{sheets.length}
          </span>
        </div>
        {onScanNewSheet && (
          <button
            type="button"
            onClick={onScanNewSheet}
            disabled={isScanning}
            className="flex min-h-10 items-center space-x-1 rounded-md bg-bt-brand-solid px-2.5 text-xs font-medium text-bt-on-brand transition-colors hover:bg-bt-brand-solid-hover disabled:opacity-50 cursor-pointer"
            title="Scan this sheet"
          >
            <ScanLine className="w-3 h-3" />
            <span>{isScanning ? 'Scanning' : 'Scan'}</span>
          </button>
        )}
      </div>

      {/* Progressive Disclosure: Search & Discipline Filters */}
      {sheets.length > 0 && (
        <div className="min-w-0 p-2 border-b border-bt-border-subtle space-y-1.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-bt-text-secondary absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter sheets (M-101, plan)..."
              aria-label="Filter sheets"
              className="w-full min-h-10 pl-8 pr-7 py-1.5 rounded-md bg-bt-inset border border-bt-border-strong text-bt-text-primary placeholder:text-bt-text-tertiary font-sans text-sm outline-none focus:border-bt-focus transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-bt-text-secondary hover:text-bt-on-brand cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Discipline Filter Chips */}
          <div className="flex flex-wrap gap-1 font-sans text-xs">
            {(['ALL', 'MECHANICAL', 'PLUMBING', 'ELECTRICAL'] as DisciplineTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDisciplineFilter(tab)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  disciplineFilter === tab
                    ? 'bg-bt-brand-solid text-bt-on-brand font-semibold'
                    : 'text-bt-text-secondary hover:text-bt-text-primary hover:bg-bt-panel'
                }`}
              >
                {tab === 'ALL'
                  ? 'All'
                  : tab === 'MECHANICAL'
                    ? 'Mechanical'
                    : tab === 'PLUMBING'
                      ? 'Plumbing'
                      : 'Electrical'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sheet List */}
          <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2 space-y-1.5">
        {sheets.length === 0 ? (
          <div className="p-6 text-center text-bt-text-tertiary font-mono italic text-[11px] space-y-1">
            <Layers className="w-8 h-8 text-bt-text-tertiary mx-auto mb-2 opacity-60" />
            <div>No sheets indexed yet.</div>
            <div className="text-[10px] text-bt-text-tertiary">Open a drawing PDF to inspect sheet layouts.</div>
          </div>
        ) : filteredSheets.length === 0 ? (
          <div className="p-4 text-center text-bt-text-tertiary font-mono text-xs space-y-2">
            <div>No sheets match current filters.</div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDisciplineFilter('ALL');
              }}
              className="min-h-10 rounded px-2 text-bt-brand underline hover:text-bt-brand-hover cursor-pointer text-xs"
            >
              Reset search & filters
            </button>
          </div>
        ) : (
          filteredSheets.map((sheet) => {
            const isActive = sheet.sheet_id === activeSheetId;
            return (
              <button
                type="button"
                key={sheet.sheet_id}
                onClick={() => onSelectSheet(sheet.sheet_id)}
                className={`w-full min-w-0 text-left p-2.5 rounded-lg border transition-colors duration-150 active:scale-[0.99] cursor-pointer flex flex-col space-y-1.5 ${
                  isActive
                    ? 'bg-bt-brand-soft border-bt-selection-border ring-1 ring-bt-selection-border'
                    : 'bg-bt-surface/60 border-bt-border-subtle hover:bg-bt-panel/60 hover:border-bt-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center space-x-1.5 font-sans font-bold text-bt-text-primary text-xs">
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-bt-brand' : 'text-bt-text-secondary'}`} />
                    <span className="min-w-0 truncate" title={sheet.sheet_number}>{displaySheetNumber(sheet.sheet_number, sheet.page_index)}</span>
                  </div>
                  <span
                    className={`max-w-24 truncate text-xs px-1.5 py-0.5 rounded font-sans font-semibold border ${getDisciplineBadge(
                      sheet.discipline
                    )}`}
                  >
                    {sheet.discipline}
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-xs font-sans font-medium text-bt-text-secondary" title={sheet.sheet_title}>
                    {sheet.sheet_title || 'Untitled Sheet'}
                  </div>
                  {sheet.sheet_type ? (
                    <span className="shrink-0 rounded border border-bt-border-subtle px-1.5 py-0.5 text-[11px] uppercase text-bt-text-tertiary">
                      {sheet.sheet_type}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-bt-border-subtle/80 pt-1">
                  <span className="font-mono text-[11px] text-bt-text-tertiary">Scale</span>
                  <ScaleStateBadge status={sheet.scale_status} sheetType={sheet.sheet_type} sheetTitle={sheet.sheet_title} compact />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
