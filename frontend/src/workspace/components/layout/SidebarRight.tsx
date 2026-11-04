import React from 'react';
import { SegmentedControl, type SegmentedControlOption } from '../primitives/SegmentedControl';

export type RightTab = 'ledger' | 'schedule' | 'qa';

export interface SidebarRightProps {
  open: boolean;
  rightTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  qaOpenCount: number;
  children: React.ReactNode;
  onClose?: () => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  open,
  rightTab,
  onTabChange,
  qaOpenCount,
  children,
  onClose,
}) => {
  if (!open) return null;

  const tabOptions: readonly SegmentedControlOption<RightTab>[] = [
    { id: 'ledger', label: 'Takeoff' },
    { id: 'schedule', label: 'Schedules' },
    {
      id: 'qa',
      label: qaOpenCount > 0 ? `Issues (${qaOpenCount})` : 'Issues',
    },
  ];

  return (
    <>
      {/* Narrow screens: explicit drawer with a dismissable backdrop. */}
      <div
        className="fixed inset-x-0 bottom-0 top-14 z-40 bg-bt-inset/60 xl:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed bottom-0 right-0 top-14 z-50 flex w-[21rem] shrink-0 select-none flex-col border-l border-bt-border-subtle bg-bt-surface xl:static xl:inset-auto xl:z-auto"
        aria-label="Takeoff, schedules and issues"
      >
        <div className="border-b border-bt-border-subtle bg-bt-inset p-1.5">
          <SegmentedControl<RightTab>
            options={tabOptions}
            value={rightTab}
            onChange={onTabChange}
            size="sm"
            className="flex w-full"
            ariaLabel="Workspace panels"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </aside>
    </>
  );
};
