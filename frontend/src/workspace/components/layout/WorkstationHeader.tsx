import React from 'react';
import {
  PanelLeft,
  PanelRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export interface WorkstationHeaderProps {
  sheetNumber: string;
  sheetTitle: string;
  discipline: string;
  scaleRaw?: string | null;
  scaleOk: boolean;
  leftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  disciplineFilter: 'ALL' | 'Supply' | 'Return' | 'Exhaust';
  onDisciplineFilterChange: (disc: 'ALL' | 'Supply' | 'Return' | 'Exhaust') => void;
  statusFilter: 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST';
  onStatusFilterChange: (status: 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST') => void;
}

export const WorkstationHeader: React.FC<WorkstationHeaderProps> = ({
  sheetNumber,
  sheetTitle,
  discipline,
  scaleRaw,
  scaleOk,
  leftSidebarOpen,
  onToggleLeftSidebar,
  rightSidebarOpen,
  onToggleRightSidebar,
  disciplineFilter,
  onDisciplineFilterChange,
  statusFilter,
  onStatusFilterChange,
}) => {
  return (
    <header
      className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono z-20 backdrop-blur-md"
      aria-label="Workstation header"
    >
      <div className="flex items-center space-x-2 truncate">
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          className={`p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer hidden md:block active:scale-[0.98] ${
            !leftSidebarOpen ? 'text-cyan-400 bg-cyan-950/60' : ''
          }`}
          title="Toggle Sheet Directory [[]"
          aria-label="Toggle Sheet Directory"
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-slate-200 font-semibold truncate">
          {sheetNumber} — {sheetTitle}
        </span>
        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
          {discipline}
        </span>

        {/* Multi-Axis Discipline & Status Filter Bar: Responsive across viewports */}
        <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-800 text-[10px] overflow-x-auto max-w-[50vw]">
          <Filter className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-slate-500 shrink-0 hidden sm:inline">Trade:</span>
          {(['ALL', 'Supply', 'Return', 'Exhaust'] as const).map((disc) => (
            <button
              key={disc}
              type="button"
              onClick={() => onDisciplineFilterChange(disc)}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition-all duration-100 active:scale-[0.98] shrink-0 ${
                disciplineFilter === disc
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {disc}
            </button>
          ))}
          <span className="text-slate-700 shrink-0">|</span>
          <span className="text-slate-500 shrink-0 hidden sm:inline">Status:</span>
          {(['ALL', 'MATCHED', 'DISCREPANCIES', 'GHOST'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => onStatusFilterChange(st)}
              className={`px-1.5 py-0.5 rounded cursor-pointer transition-all duration-100 active:scale-[0.98] shrink-0 ${
                statusFilter === st
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {scaleOk ? (
          <span className="flex items-center space-x-1.5 text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[10px]">
            <CheckCircle2 className="w-3 h-3" />
            <span>{scaleRaw}</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1.5 text-amber-400 font-medium px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-[10px] animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            <span>Scale Unverified // Review Required</span>
          </span>
        )}

        <button
          type="button"
          onClick={onToggleRightSidebar}
          className={`p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer hidden lg:block active:scale-[0.98] ${
            !rightSidebarOpen ? 'text-cyan-400 bg-cyan-950/60' : ''
          }`}
          title="Toggle Ledger & Schedule []]"
          aria-label="Toggle Ledger & Schedule"
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
