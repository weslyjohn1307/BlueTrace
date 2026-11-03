import React from 'react';
import { SegmentedControl, type SegmentedControlOption } from '../primitives/SegmentedControl';

export type RightTab = 'ledger' | 'schedule' | 'qa';

export interface SidebarRightProps {
  open: boolean;
  rightTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  qaOpenCount: number;
  children: React.ReactNode;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  open,
  rightTab,
  onTabChange,
  qaOpenCount,
  children,
}) => {
  if (!open) return null;

  const tabOptions: readonly SegmentedControlOption<RightTab>[] = [
    { id: 'ledger', label: 'Takeoff Ledger' },
    { id: 'schedule', label: 'Equipment Schedule' },
    {
      id: 'qa',
      label: qaOpenCount > 0 ? `QA Review (${qaOpenCount})` : 'QA Review',
    },
  ];

  return (
    <aside
      className="w-84 shrink-0 hidden lg:flex flex-col border-l border-slate-800 bg-slate-900 select-none"
      aria-label="Ledger, schedule and QA review"
    >
      <div className="p-1.5 bg-slate-950 border-b border-slate-800">
        <SegmentedControl<RightTab>
          options={tabOptions}
          value={rightTab}
          onChange={onTabChange}
          size="sm"
          className="w-full flex"
          ariaLabel="Workspace panels"
        />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
        {children}
      </div>
    </aside>
  );
};
