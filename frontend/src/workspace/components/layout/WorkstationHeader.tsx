import React from 'react';
import {
  PanelLeft,
  PanelRight,
  MessageCircleQuestion,
} from 'lucide-react';
import type { ScaleStatus } from '../../../api/contracts';
import { ScaleStateBadge } from '../ScaleStateBadge';

export interface WorkstationHeaderProps {
  sheetNumber: string;
  sheetTitle: string;
  discipline: string;
  scaleRaw?: string | null;
  scaleStatus?: ScaleStatus;
  /** @deprecated Compatibility for existing header callers. Prefer `scaleStatus`. */
  scaleOk?: boolean;
  sheetType?: string | null;
  leftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  disciplineFilter: 'ALL' | 'Supply' | 'Return' | 'Exhaust';
  onDisciplineFilterChange: (disc: 'ALL' | 'Supply' | 'Return' | 'Exhaust') => void;
  statusFilter: 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST';
  onStatusFilterChange: (status: 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST') => void;
  onOpenCopilot?: () => void;
}

const PANEL_TOGGLE =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-bt-text-tertiary transition-colors hover:bg-bt-panel hover:text-bt-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bt-surface';

const SELECT =
  'min-h-10 rounded-md border border-bt-border-strong bg-bt-surface px-2 text-sm text-bt-text-primary outline-none focus:border-bt-focus focus-visible:ring-2 focus-visible:ring-bt-focus';

export const WorkstationHeader: React.FC<WorkstationHeaderProps> = ({
  sheetNumber,
  sheetTitle,
  discipline,
  scaleRaw,
  scaleStatus,
  scaleOk,
  sheetType,
  leftSidebarOpen,
  onToggleLeftSidebar,
  rightSidebarOpen,
  onToggleRightSidebar,
  disciplineFilter,
  onDisciplineFilterChange,
  statusFilter,
  onStatusFilterChange,
  onOpenCopilot,
}) => {
  const displayedScaleStatus: ScaleStatus = scaleStatus ?? (scaleOk ? 'VERIFIED' : 'UNVERIFIED');
  return (
    <header
      className="z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-bt-border-subtle bg-bt-surface px-4 py-2"
      aria-label="Workstation header"
    >
      <div className="flex w-full min-w-0 items-center gap-2 xl:w-auto xl:flex-1">
        <button
          type="button"
          onClick={onToggleLeftSidebar}
          className={`${PANEL_TOGGLE} ${!leftSidebarOpen ? 'bg-bt-brand-soft text-bt-brand' : ''}`}
          title="Sheets panel (key: [)"
          aria-label={leftSidebarOpen ? 'Hide sheets panel' : 'Show sheets panel'}
          aria-pressed={leftSidebarOpen}
          aria-keyshortcuts="["
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-bt-text-primary" title={`${sheetNumber} ${sheetTitle}`}>
            <span className="mr-2 inline-block max-w-28 truncate align-bottom">{sheetNumber}</span>
            <span className="font-normal text-bt-text-secondary">{sheetTitle}</span>
          </h1>
          <span className={`max-w-28 shrink-0 truncate rounded border px-1.5 py-0.5 font-sans text-xs font-semibold ${discipline.toLowerCase().includes('plumb') ? 'text-mep-plumbing bg-mep-plumbing-tint border-mep-plumbing/30' : discipline.toLowerCase().includes('elec') ? 'text-mep-electrical bg-mep-electrical-tint border-mep-electrical/30' : discipline.toLowerCase().includes('mech') ? 'text-mep-mechanical bg-mep-mechanical-tint border-mep-mechanical/30' : 'border-bt-border-strong bg-bt-panel text-bt-text-secondary'}`} title={discipline}>
            {discipline}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 xl:ml-auto xl:w-auto">
        <label className="flex items-center gap-1.5 text-[11px] text-bt-text-tertiary">
          <span className="sr-only">Filter by trade</span>
          <select
            value={disciplineFilter}
            onChange={(event) =>
              onDisciplineFilterChange(
                event.target.value as 'ALL' | 'Supply' | 'Return' | 'Exhaust'
              )
            }
            aria-label="Filter by trade"
            className={SELECT}
          >
            <option value="ALL">All trades</option>
            <option value="Supply">Supply</option>
            <option value="Return">Return</option>
            <option value="Exhaust">Exhaust</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-bt-text-tertiary">
          <span className="sr-only">Filter by review status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(
                event.target.value as 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST'
              )
            }
            aria-label="Filter by review status"
            className={SELECT}
          >
            <option value="ALL">All statuses</option>
            <option value="MATCHED">Matched</option>
            <option value="DISCREPANCIES">Discrepancies</option>
            <option value="GHOST">Unplaced</option>
          </select>
        </label>

        <ScaleStateBadge status={displayedScaleStatus} sheetType={sheetType} sheetTitle={sheetTitle} scaleRaw={scaleRaw} />

        {onOpenCopilot ? (
          <button
            type="button"
            onClick={onOpenCopilot}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-bt-border-strong px-2.5 text-xs text-bt-text-primary transition-colors hover:bg-bt-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bt-focus"
            title="Ask about this sheet (Ctrl+K)"
            aria-label="Ask about this sheet (Ctrl+K)"
            aria-keyshortcuts="Control+K"
          >
            <MessageCircleQuestion className="h-4 w-4 text-bt-brand" aria-hidden="true" />
            <span>Ask</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleRightSidebar}
          className={`${PANEL_TOGGLE} ${!rightSidebarOpen ? 'bg-bt-brand-soft text-bt-brand' : ''}`}
          title="Review panel (key: ])"
          aria-label={rightSidebarOpen ? 'Hide review panel' : 'Show review panel'}
          aria-pressed={rightSidebarOpen}
          aria-keyshortcuts="]"
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
