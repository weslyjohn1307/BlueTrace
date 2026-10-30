import React from 'react';
import { ShieldAlert } from 'lucide-react';

export interface ModeBannerProps {
  mode: 'live' | 'demo';
}

export const ModeBanner: React.FC<ModeBannerProps> = ({ mode }) => {
  if (mode === 'live') {
    return (
      <div 
        role="region" 
        aria-label="Mode indicator"
        className="px-4 py-1 bg-slate-100 border-b border-slate-200 text-xs font-mono text-slate-700 flex items-center justify-between"
      >
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#006D84]" aria-hidden="true" />
          <span className="font-semibold tracking-wider">LIVE — Local backend</span>
        </div>
        <span className="text-slate-500">FastAPI /api/v1</span>
      </div>
    );
  }

  return (
    <div 
      role="region" 
      aria-label="Demo mode warning"
      className="px-4 py-2 bg-amber-50 border-b-2 border-amber-400 text-xs text-amber-950 flex items-center justify-between sticky top-0 z-50 shadow-sm"
    >
      <div className="flex items-center space-x-2">
        <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
        <span className="font-medium">
          DEMO — Example data only. Nothing on this screen was calculated from a drawing.
        </span>
      </div>
      <span className="font-mono text-[11px] bg-amber-100 px-2 py-0.5 rounded border border-amber-300 uppercase tracking-wider font-semibold">
        Example only
      </span>
    </div>
  );
};
