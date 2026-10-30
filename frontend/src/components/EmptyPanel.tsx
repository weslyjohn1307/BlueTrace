import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyPanelProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyPanel: React.FC<EmptyPanelProps> = ({
  title,
  description,
  icon: Icon,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[120px] bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
      {Icon && <Icon className="w-6 h-6 text-slate-400 mb-2" aria-hidden="true" />}
      <h4 className="text-xs font-semibold text-slate-700 tracking-wide">{title}</h4>
      <p className="text-xs text-slate-500 mt-1 max-w-[280px] leading-relaxed">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 px-2.5 py-1 text-xs font-medium text-[#006D84] bg-white border border-slate-300 rounded shadow-xs hover:bg-slate-50 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
