import React, { useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import type { ObjectItem, ReviewedStatus } from '../../api/contracts';

export interface ComponentsSectionProps {
  objects: ObjectItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  onReview: (id: string, status: ReviewedStatus, notes?: string) => void;
  onBatchReview?: (status: ReviewedStatus) => void;
  modelReady?: boolean;
}

export const ComponentsSection: React.FC<ComponentsSectionProps> = ({
  objects,
  selectedId,
  onSelect,
  onReview,
  onBatchReview,
  modelReady = true,
}) => {
  // Aggregate stats
  const stats = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    let highConf = 0;
    let totalConf = 0;
    let confCount = 0;

    objects.forEach((obj) => {
      const status = obj.review_projection?.reviewed_status || 'PENDING';
      if (status === 'ACCEPTED') accepted++;
      else if (status === 'REJECTED') rejected++;
      else pending++;

      if (typeof obj.confidence === 'number') {
        totalConf += obj.confidence;
        confCount++;
        if (obj.confidence >= 0.85) highConf++;
      }
    });

    const avgConf = confCount > 0 ? Math.round((totalConf / confCount) * 100) : null;

    return { accepted, rejected, pending, highConf, avgConf };
  }, [objects]);

  if (!modelReady && objects.length === 0) {
    return (
      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-800">
        <div className="flex items-center space-x-2 font-semibold mb-1">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <span>Component Detection Unavailable</span>
        </div>
        <p className="leading-relaxed text-amber-700">
          The trained YOLO model file could not be loaded on the server. Level 1 symbol counting is offline.
        </p>
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p className="font-medium text-slate-700">No components detected on this sheet</p>
        <p className="text-slate-400 mt-1">
          The detection model ran successfully but found no supported MEP symbols.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 select-none">
      {/* Rollup Summary Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">
            Fire Dampers (Level 1)
          </span>
          <span className="font-mono text-base font-bold text-[#EA580C]">
            {objects.length}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
          <div className="bg-white border border-slate-200/80 rounded py-1">
            <span className="text-slate-400 block text-[9px]">AVG CONF</span>
            <span className="font-semibold text-slate-700">
              {stats.avgConf !== null ? `${stats.avgConf}%` : 'N/A'}
            </span>
          </div>
          <div className="bg-white border border-emerald-200/80 rounded py-1">
            <span className="text-emerald-600 block text-[9px]">CONFIRMED</span>
            <span className="font-semibold text-emerald-700">{stats.accepted}</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded py-1">
            <span className="text-slate-400 block text-[9px]">UNREVIEWED</span>
            <span className="font-semibold text-slate-700">{stats.pending}</span>
          </div>
        </div>

        {/* Batch Action */}
        {onBatchReview && stats.pending > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {stats.pending} pending review
            </span>
            <button
              type="button"
              onClick={() => onBatchReview('ACCEPTED')}
              className="text-[11px] font-medium text-[#006D84] hover:text-[#005769] hover:underline cursor-pointer"
            >
              Confirm All Unreviewed
            </button>
          </div>
        )}
      </div>

      {/* Individual Item List */}
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {objects.map((obj) => {
          const isSelected = selectedId === obj.object_id;
          const confPercent =
            typeof obj.confidence === 'number' ? Math.round(obj.confidence * 100) : null;
          const reviewedStatus = obj.review_projection?.reviewed_status || 'PENDING';

          return (
            <div
              key={obj.object_id}
              onClick={() => onSelect(obj.object_id, 'object')}
              className={`p-2 rounded-md border text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'bg-sky-50/70 border-[#006D84] shadow-xs ring-1 ring-[#006D84]/30'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-xs bg-[#EA580C] shrink-0" />
                  <span className="font-mono text-[11px] font-medium text-slate-800 truncate">
                    {obj.object_id}
                  </span>
                </div>

                {/* Confidence Badge */}
                {confPercent !== null && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                      confPercent >= 85
                        ? 'bg-emerald-50 text-emerald-700'
                        : confPercent >= 70
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {confPercent}%
                  </span>
                )}
              </div>

              {/* Status and Action Buttons */}
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                <span
                  className={`text-[10px] font-medium ${
                    reviewedStatus === 'ACCEPTED'
                      ? 'text-emerald-700'
                      : reviewedStatus === 'REJECTED'
                      ? 'text-rose-600'
                      : 'text-slate-400'
                  }`}
                >
                  {reviewedStatus === 'ACCEPTED'
                    ? 'Confirmed'
                    : reviewedStatus === 'REJECTED'
                    ? 'Rejected'
                    : 'Unreviewed'}
                </span>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(obj.object_id, 'ACCEPTED');
                    }}
                    title="Confirm Detection"
                    className={`p-1 rounded hover:bg-emerald-50 transition-colors cursor-pointer ${
                      reviewedStatus === 'ACCEPTED'
                        ? 'text-emerald-600 font-bold'
                        : 'text-slate-400 hover:text-emerald-600'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(obj.object_id, 'REJECTED');
                    }}
                    title="Reject Detection"
                    className={`p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer ${
                      reviewedStatus === 'REJECTED'
                        ? 'text-rose-600 font-bold'
                        : 'text-slate-400 hover:text-rose-600'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
