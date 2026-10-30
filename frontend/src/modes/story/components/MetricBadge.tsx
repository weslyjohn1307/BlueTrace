import React from 'react';

interface MetricBadgeProps {
  label: string;
  value: string;
  unit?: string;
  detail: string;
}

export const MetricBadge: React.FC<MetricBadgeProps> = ({ label, value, unit, detail }) => {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-left">
      <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline space-x-1 mt-0.5">
        <span className="text-xl font-mono font-bold text-white tracking-tight">{value}</span>
        {unit && <span className="text-xs font-mono text-slate-400">{unit}</span>}
      </div>
      <div className="text-[11px] text-slate-400 mt-1 leading-normal">{detail}</div>
    </div>
  );
};
