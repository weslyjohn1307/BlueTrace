import React, { useState } from 'react';
import { Layers, FileText, CheckCircle2, AlertTriangle, ScanLine, Search, X } from 'lucide-react';

export interface SheetItemData {
  sheet_id: string;
  sheet_number: string;
  sheet_title: string;
  discipline: string;
  scale_raw?: string | null;
  scale_ratio?: number | null;
  scale_status: 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED';
  page_index: number;
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
      return 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40';
    }
    if (d.includes('PLUMB')) {
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
    }
    if (d.includes('ELEC')) {
      return 'bg-purple-950/80 text-purple-300 border-purple-500/40';
    }
    if (d.includes('ARCH')) {
      return 'bg-amber-950/80 text-amber-300 border-amber-500/40';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 border-r border-slate-800 text-xs select-none">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] font-mono">
            Sheet Directory
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
            {filteredSheets.length}/{sheets.length}
          </span>
        </div>
        {onScanNewSheet && (
          <button
            type="button"
            onClick={onScanNewSheet}
            disabled={isScanning}
            className="flex items-center space-x-1 px-2 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-50 cursor-pointer text-[10px] font-mono"
            title="Scan Sheet with muse-spark-1.3"
          >
            <ScanLine className="w-3 h-3" />
            <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
          </button>
        )}
      </div>

      {/* Progressive Disclosure: Search & Discipline Filters */}
      {sheets.length > 0 && (
        <div className="p-2 border-b border-slate-800 space-y-1.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter sheets (M-101, plan)..."
              aria-label="Filter sheets"
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700/80 text-slate-200 placeholder:text-slate-500 font-mono text-[11px] outline-none focus:border-cyan-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Discipline Filter Chips */}
          <div className="flex flex-wrap gap-1 font-mono text-[10px]">
            {(['ALL', 'MECHANICAL', 'PLUMBING', 'ELECTRICAL'] as DisciplineTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDisciplineFilter(tab)}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  disciplineFilter === tab
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sheets.length === 0 ? (
          <div className="p-6 text-center text-slate-500 font-mono italic text-[11px] space-y-1">
            <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
            <div>No sheets indexed yet.</div>
            <div className="text-[10px] text-slate-600">Open a drawing PDF to inspect sheet layouts.</div>
          </div>
        ) : filteredSheets.length === 0 ? (
          <div className="p-4 text-center text-slate-500 font-mono text-xs space-y-2">
            <div>No sheets match current filters.</div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDisciplineFilter('ALL');
              }}
              className="text-cyan-400 underline hover:text-cyan-300 cursor-pointer text-[11px]"
            >
              Reset search & filters
            </button>
          </div>
        ) : (
          filteredSheets.map((sheet) => {
            const isActive = sheet.sheet_id === activeSheetId;
            const isScaleVerified =
              sheet.scale_status === 'VERIFIED' || sheet.scale_status === 'CALIBRATED';

            return (
              <button
                type="button"
                key={sheet.sheet_id}
                onClick={() => onSelectSheet(sheet.sheet_id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col space-y-1.5 ${
                  isActive
                    ? 'bg-cyan-950/40 border-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/30'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-mono font-bold text-slate-100 text-xs">
                    <FileText className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <span>{sheet.sheet_number}</span>
                  </div>
                  <span
                    className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-semibold border ${getDisciplineBadge(
                      sheet.discipline
                    )}`}
                  >
                    {sheet.discipline}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 truncate font-sans font-medium">
                  {sheet.sheet_title || 'Untitled Sheet'}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                  <span className="text-slate-500">Scale:</span>
                  {isScaleVerified ? (
                    <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>{sheet.scale_raw || 'Verified'}</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-amber-400 font-medium">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>Review Required</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
