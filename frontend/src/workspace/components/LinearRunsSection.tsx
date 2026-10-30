import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { RouteItem, ReviewedStatus } from '../../api/contracts';

export interface LinearRunsSectionProps {
  routes: RouteItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  onReview: (id: string, status: ReviewedStatus, notes?: string) => void;
  scaleStatus?: string;
  scaleRatioLabel?: string | null;
  scaleRatioValue?: number | null; // e.g. 1 point = X metres
  onOpenCalibration: () => void;
}

export const LinearRunsSection: React.FC<LinearRunsSectionProps> = ({
  routes,
  selectedId,
  onSelect,
  onReview,
  scaleStatus = 'SCALE_UNREADABLE',
  scaleRatioLabel = null,
  scaleRatioValue = null,
  onOpenCalibration,
}) => {
  const isScaleVerified = scaleStatus === 'VERIFIED' || scaleStatus === 'MANUALLY_CONFIRMED';

  // Calculate total drawing-space length in points
  const totals = useMemo(() => {
    let totalPt = 0;
    let totalPhysicalM = 0;
    let accepted = 0;
    let rejected = 0;
    let pending = 0;

    routes.forEach((route) => {
      const status = route.review_projection?.reviewed_status || 'PENDING';
      if (status === 'ACCEPTED') accepted++;
      else if (status === 'REJECTED') rejected++;
      else pending++;

      const points = route.geometry?.location_or_path?.points;
      if (points && points.length >= 2) {
        let routePt = 0;
        for (let i = 1; i < points.length; i++) {
          const dx = points[i][0] - points[i - 1][0];
          const dy = points[i][1] - points[i - 1][1];
          routePt += Math.sqrt(dx * dx + dy * dy);
        }
        totalPt += routePt;

        if (isScaleVerified && scaleRatioValue) {
          totalPhysicalM += routePt * scaleRatioValue;
        } else if (route.physical_length_m) {
          totalPhysicalM += route.physical_length_m;
        }
      }
    });

    return {
      totalPt: Math.round(totalPt),
      totalPhysicalM: totalPhysicalM > 0 ? totalPhysicalM.toFixed(1) : null,
      accepted,
      rejected,
      pending,
    };
  }, [routes, isScaleVerified, scaleRatioValue]);

  if (routes.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg select-none">
        <Layers className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p className="font-medium text-slate-700">No linear routes found on this sheet</p>
        <p className="text-slate-400 mt-1">
          Vector extraction identified no continuous duct or piping runs.
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
            Duct & Pipe Runs (Level 2)
          </span>
          <span className="font-mono text-base font-bold text-[#2563EB]">
            {routes.length}
          </span>
        </div>

        {/* Quantities Ledger Box */}
        <div className="mt-2.5 bg-white border border-slate-200 rounded-md p-2.5 space-y-2">
          {/* Drawing-space length */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Drawing-Space Length:</span>
            <span className="font-mono font-semibold text-slate-800">
              {totals.totalPt.toLocaleString()} pt
            </span>
          </div>

          {/* Physical length */}
          <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
            <span className="text-slate-500">Physical Length:</span>
            {isScaleVerified && totals.totalPhysicalM ? (
              <span className="font-mono font-bold text-emerald-700">
                {totals.totalPhysicalM} m
              </span>
            ) : (
              <span className="font-mono text-slate-400 font-medium text-[11px]">Unverified</span>
            )}
          </div>
        </div>

        {/* Honest Scale Notification */}
        {!isScaleVerified ? (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800">
            <div className="flex items-start space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Drawing scale unconfirmed</span>
                <span className="text-amber-700 leading-tight block mt-0.5">
                  Physical takeoff length is hidden to prevent ungrounded estimates. Calibrate scale to confirm.
                </span>
                <button
                  type="button"
                  onClick={onOpenCalibration}
                  className="mt-1.5 font-semibold text-[#006D84] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>Calibrate scale now</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[11px] text-emerald-800 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">
              Scale confirmed: {scaleRatioLabel || 'Calibrated'}
            </span>
          </div>
        )}
      </div>

      {/* Individual Routes List */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {routes.map((route) => {
          const isSelected = selectedId === route.route_id;
          const points = route.geometry?.location_or_path?.points || [];
          const reviewedStatus = route.review_projection?.reviewed_status || 'PENDING';

          // Calculate single route length
          let routePt = 0;
          for (let i = 1; i < points.length; i++) {
            const dx = points[i][0] - points[i - 1][0];
            const dy = points[i][1] - points[i - 1][1];
            routePt += Math.sqrt(dx * dx + dy * dy);
          }

          const routeM =
            isScaleVerified && scaleRatioValue
              ? (routePt * scaleRatioValue).toFixed(2)
              : route.physical_length_m
              ? route.physical_length_m.toFixed(2)
              : null;

          return (
            <div
              key={route.route_id}
              onClick={() => onSelect(route.route_id, 'route')}
              className={`p-2 rounded-md border text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'bg-sky-50/70 border-[#006D84] shadow-xs ring-1 ring-[#006D84]/30'
                  : 'bg-white hover:bg-slate-50/80 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="w-2.5 h-0.5 bg-[#2563EB] shrink-0" />
                  <span className="font-mono text-[11px] font-medium text-slate-800 truncate">
                    {route.route_id}
                  </span>
                </div>

                {/* Length Badge */}
                <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  {routeM ? `${routeM} m` : `${Math.round(routePt)} pt`}
                </span>
              </div>

              {/* Status and Action Buttons */}
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  {route.continuity_status || 'DIRECT'} • {points.length} pts
                </span>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(route.route_id, 'ACCEPTED');
                    }}
                    title="Confirm Route"
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
                      onReview(route.route_id, 'REJECTED');
                    }}
                    title="Reject Route"
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
