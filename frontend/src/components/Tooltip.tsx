import React from 'react';

export interface TooltipProps {
  id: string;
  children: React.ReactNode;
  align?: 'center' | 'end';
  visible?: boolean;
}

/** Small, non-interactive tooltip shared by icon-first controls. */
export const Tooltip: React.FC<TooltipProps> = ({ id, children, align = 'center', visible = true }) => (
  <span
    id={id}
    role="tooltip"
    className={`pointer-events-none absolute top-full z-[70] mt-2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-medium text-slate-100 shadow-lg transition-opacity duration-150 ${
      align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'
    } ${visible ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : '!opacity-0'}`}
  >
    {children}
  </span>
);

export default Tooltip;
