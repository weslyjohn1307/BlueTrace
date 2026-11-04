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
  onClose?: () => void;
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
  onClose,
}) => {
  if (!open) return null;

  return (
    <>
      {/* Narrow screens: explicit drawer with a dismissable backdrop. */}
      <div
        className="fixed inset-x-0 bottom-0 top-14 z-40 bg-bt-inset/60 xl:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed bottom-0 left-0 top-14 z-50 flex w-72 shrink-0 select-none flex-col border-r border-bt-border-subtle bg-bt-inset xl:static xl:inset-auto xl:z-auto xl:w-64"
        aria-label="Sheet directory"
      >
        {/* View switcher: tree or filmstrip */}
        <div
          role="group"
          aria-label="Sheet panel view"
          className="flex items-center gap-1 border-b border-bt-border-subtle bg-bt-inset px-2 py-1.5"
        >
          <button
            type="button"
            aria-pressed={sheetPanelMode === 'tree'}
            onClick={() => onSheetPanelModeChange('tree')}
            className={`flex-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus ${
              sheetPanelMode === 'tree'
                ? 'border border-bt-selection-border bg-bt-brand-soft text-bt-brand'
                : 'border border-transparent text-bt-text-secondary hover:bg-bt-surface hover:text-bt-text-primary'
            }`}
          >
            Tree
          </button>
          <button
            type="button"
            aria-pressed={sheetPanelMode === 'filmstrip'}
            onClick={() => onSheetPanelModeChange('filmstrip')}
            className={`flex-1 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus ${
              sheetPanelMode === 'filmstrip'
                ? 'border border-bt-selection-border bg-bt-brand-soft text-bt-brand'
                : 'border border-transparent text-bt-text-secondary hover:bg-bt-surface hover:text-bt-text-primary'
            }`}
          >
            Filmstrip
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
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
    </>
  );
};
