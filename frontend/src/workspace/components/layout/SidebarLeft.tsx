import React from 'react';
import type { ScannedSheet } from '../../hooks/useTakeoffSession';
import { SheetTree, type SheetItemData } from '../SheetTree';
import { SheetNavigator } from '../SheetNavigator';

export interface SidebarLeftProps {
  open: boolean;
  sheetPanelMode: 'tree' | 'filmstrip';
  onSheetPanelModeChange: (mode: 'tree' | 'filmstrip') => void;
  treeSheets: SheetItemData[];
  sheets: ScannedSheet[];
  activeSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
  projectId?: string | null;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  open,
  sheetPanelMode,
  onSheetPanelModeChange,
  treeSheets,
  sheets,
  activeSheetId,
  onSelectSheet,
  projectId,
}) => {
  if (!open) return null;

  return (
    <aside
      className="w-64 shrink-0 hidden md:flex flex-col border-r border-slate-800 bg-slate-950/40 select-none"
      aria-label="Sheet directory"
    >
      {/* View Switcher: Tree vs Filmstrip Segmented Control */}
      <div
        role="group"
        aria-label="Sheet panel view"
        className="flex items-center gap-1 px-2 py-1.5 bg-slate-950 border-b border-slate-800"
      >
        <button
          type="button"
          aria-pressed={sheetPanelMode === 'tree'}
          onClick={() => onSheetPanelModeChange('tree')}
          className={`flex-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-all duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            sheetPanelMode === 'tree'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold shadow-xs'
              : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-900/60'
          }`}
        >
          Tree
        </button>
        <button
          type="button"
          aria-pressed={sheetPanelMode === 'filmstrip'}
          onClick={() => onSheetPanelModeChange('filmstrip')}
          className={`flex-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-all duration-[180ms] ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            sheetPanelMode === 'filmstrip'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold shadow-xs'
              : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-900/60'
          }`}
        >
          Filmstrip
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {sheetPanelMode === 'tree' ? (
          <SheetTree
            sheets={treeSheets}
            activeSheetId={activeSheetId}
            onSelectSheet={onSelectSheet}
          />
        ) : (
          <SheetNavigator
            sheets={sheets}
            activeSheetId={activeSheetId}
            onSelectSheet={onSelectSheet}
            projectId={projectId}
          />
        )}
      </div>
    </aside>
  );
};
