import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export interface ScopeReadinessBannerProps {
  runId: string;
  sourceId?: string | null;
  g3Status?: string | null;
  totalRoutes: number;
  measuredRoutes: number;
}

export const ScopeReadinessBanner: React.FC<ScopeReadinessBannerProps> = ({
  runId,
  sourceId,
  g3Status,
  totalRoutes,
  measuredRoutes,
}) => {
  const isScaleVerified = g3Status === 'G3_PASSED';

  return (
    <div
      role="region"
      aria-label="Run readiness and scope banner"
      className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 shrink-0"
    >
      <div className="flex items-start md:items-center space-x-2">
        <div className="flex items-center space-x-1 font-semibold text-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>Ready for geometry review ({totalRoutes} routes)</span>
        </div>
        <span className="text-slate-300 hidden md:inline">•</span>
        <div className="flex items-center space-x-1 font-semibold text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          <span>
            {isScaleVerified
              ? `Ready for physical takeoff (${measuredRoutes} measured)`
              : 'Not ready for measured physical takeoff'}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-[11px] text-slate-500">
        <span className="font-mono truncate max-w-[200px]" title={runId}>
          Run: {runId}
        </span>
        {sourceId && (
          <>
            <span>•</span>
            <span className="font-mono truncate max-w-[160px]" title={sourceId}>
              Source: {sourceId}
            </span>
          </>
        )}
        <span>•</span>
        <span className="text-slate-600 italic">Not an extraction-accuracy certification</span>
      </div>
    </div>
  );
};
