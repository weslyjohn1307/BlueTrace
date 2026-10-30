import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  WifiOff,
  Filter,
  FileQuestion,
} from 'lucide-react';
import type { PackageSummaryResponse } from '../../api/contracts';
import type { FilterState } from './LayerControls';

export interface TakeoffSummaryProps {
  summary: PackageSummaryResponse | null;
  isLoading: boolean;
  error?: string | null;
  isDisconnected?: boolean;
  onRetry?: () => void;
  activeFilters?: FilterState;
  onSelectFilterGroup?: (key: keyof FilterState, value: string) => void;
  onClearFilters?: () => void;
}

export const TakeoffSummary: React.FC<TakeoffSummaryProps> = ({
  summary,
  isLoading,
  error,
  isDisconnected,
  onRetry,
  activeFilters,
  onSelectFilterGroup,
  onClearFilters,
}) => {
  if (isLoading) {
    return (
      <div
        role="region"
        aria-label="Takeoff and coverage summary loading"
        className="p-8 flex flex-col items-center justify-center space-y-3 text-slate-500 min-h-[320px]"
      >
        <Clock className="w-8 h-8 text-[#006D84] animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium">Loading authoritative package summary...</p>
        <span className="text-xs text-slate-400">Querying backend takeoff metrics</span>
      </div>
    );
  }

  if (isDisconnected) {
    return (
      <div
        role="alert"
        aria-label="Backend disconnected"
        className="p-8 flex flex-col items-center justify-center space-y-3 text-slate-600 min-h-[320px] bg-slate-50 rounded-lg border border-slate-200"
      >
        <WifiOff className="w-10 h-10 text-amber-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Backend Disconnected</h3>
        <p className="text-xs text-slate-500 max-w-md text-center">
          Cannot retrieve takeoff and coverage summary while the backend service is unreachable.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-medium text-slate-700 shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry Connection</span>
          </button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        aria-label="Takeoff summary error"
        className="p-8 flex flex-col items-center justify-center space-y-3 text-red-700 min-h-[320px] bg-red-50/50 rounded-lg border border-red-200"
      >
        <AlertTriangle className="w-10 h-10 text-red-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Takeoff Summary Unavailable</h3>
        <p className="text-xs text-red-600 max-w-md text-center">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 rounded text-xs font-medium text-red-700 shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry Query</span>
          </button>
        )}
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        role="region"
        aria-label="No takeoff data"
        className="p-8 flex flex-col items-center justify-center space-y-3 text-slate-500 min-h-[320px]"
      >
        <FileQuestion className="w-10 h-10 text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-700">No Summary Data Available</h3>
        <p className="text-xs text-slate-400">The selected run has not returned summary metrics.</p>
      </div>
    );
  }

  // Authoritative metrics
  const totalRoutes = summary.total_routes ?? 0;
  const totalObjects = summary.total_objects ?? 0;
  const measuredRoutes = summary.measured_route_count ?? 0;
  const unavailableLengths = summary.unavailable_length_count ?? 0;
  const totalLengthM = summary.total_physical_length_m;
  const g3Status = summary.g3_status || 'G3_NOT_PASSED_NO_VERIFIED_SCALE';
  const isScaleConfirmed = g3Status === 'G3_PASSED';

  const continuityCounts = summary.continuity_state_counts || {};
  const representationCounts = summary.representation_state_counts || {};
  const reviewCounts = summary.review_status_counts || {};

  const hasActiveFilter =
    activeFilters &&
    (activeFilters.continuity !== 'ALL' ||
      activeFilters.representation !== 'ALL' ||
      activeFilters.reviewStatus !== 'ALL');

  return (
    <div
      role="region"
      aria-label="Authoritative Takeoff and Coverage Summary"
      className="p-6 max-w-5xl mx-auto space-y-6 overflow-y-auto"
    >
      {/* 1. Scale and Linear Measurement Availability Notice */}
      <section
        aria-labelledby="scale-availability-heading"
        className={`p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isScaleConfirmed
            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50/70 border-amber-200 text-amber-900'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            {isScaleConfirmed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
            )}
            <h3 id="scale-availability-heading" className="text-sm font-bold">
              {isScaleConfirmed ? 'Scale Confirmed — Measured Takeoff Available' : 'Scale Not Confirmed'}
            </h3>
          </div>
          <p className="text-xs text-slate-700">
            {totalLengthM === null || totalLengthM === undefined
              ? 'Physical total is not available because the drawing scale was not confirmed.'
              : `Total Physical Length: ${totalLengthM.toFixed(2)} m`}
          </p>
          <p className="text-xs font-medium text-slate-800">
            Geometry review available: {totalRoutes} routes. Measured takeoff available: {measuredRoutes} routes.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end text-xs font-mono shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-sans font-semibold">
            Scale Status (G3)
          </span>
          <span
            className={`px-2 py-0.5 mt-1 rounded text-xs font-bold border ${
              isScaleConfirmed
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}
          >
            {g3Status}
          </span>
        </div>
      </section>

      {/* 2. Top-Level Takeoff Metric Cards */}
      <section aria-labelledby="takeoff-metrics-heading">
        <h3 id="takeoff-metrics-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          Authoritative Takeoff Quantities
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Total Routes */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs block">Total Routes</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {totalRoutes}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              {summary.total_sheets} sheet · {summary.total_views} view
            </span>
          </div>

          {/* Measured Routes */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs block">Measured Routes</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {measuredRoutes}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              With confirmed scale
            </span>
          </div>

          {/* Unavailable Physical Lengths */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs block">Unavailable Lengths</span>
            <span className="text-2xl font-bold font-mono text-amber-700 block mt-1">
              {unavailableLengths}
            </span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
              Fail-closed policy
            </span>
          </div>

          {/* Total Physical Length */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs block">Physical Total</span>
            <span className="text-2xl font-bold font-mono text-slate-700 block mt-1">
              {totalLengthM === null || totalLengthM === undefined ? '—' : `${totalLengthM.toFixed(2)} m`}
            </span>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
              {totalLengthM === null || totalLengthM === undefined ? 'Not available' : 'Authoritative sum'}
            </span>
          </div>

          {/* Total Objects */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500 text-xs block">Detected Objects</span>
            <span className="text-2xl font-bold font-mono text-slate-900 block mt-1">
              {totalObjects}
            </span>
            <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
              Symbols & terminals
            </span>
          </div>
        </div>
      </section>

      {/* 3. Coverage Breakdowns: Continuity, Representation, Review */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Continuity State Coverage */}
        <section
          aria-labelledby="continuity-coverage-heading"
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 id="continuity-coverage-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Continuity Coverage
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Routes</span>
            </div>

            <div className="space-y-2">
              <SummaryRow
                label="Continuous"
                count={continuityCounts['CONTINUOUS'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-emerald-50 text-emerald-700 border-emerald-200"
                isSelected={activeFilters?.continuity === 'CONTINUOUS'}
                onSelect={() => onSelectFilterGroup?.('continuity', 'CONTINUOUS')}
              />
              <SummaryRow
                label="Gap Bridged"
                count={continuityCounts['GAP_BRIDGED'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-blue-50 text-blue-700 border-blue-200"
                isSelected={activeFilters?.continuity === 'GAP_BRIDGED'}
                onSelect={() => onSelectFilterGroup?.('continuity', 'GAP_BRIDGED')}
              />
              <SummaryRow
                label="Isolated"
                count={continuityCounts['ISOLATED'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-slate-50 text-slate-700 border-slate-200"
                isSelected={activeFilters?.continuity === 'ISOLATED'}
                onSelect={() => onSelectFilterGroup?.('continuity', 'ISOLATED')}
              />
              {Object.entries(continuityCounts)
                .filter(([k]) => !['CONTINUOUS', 'GAP_BRIDGED', 'ISOLATED'].includes(k))
                .map(([k, count]) => (
                  <SummaryRow
                    key={k}
                    label={k.replace(/_/g, ' ').toLowerCase()}
                    count={count}
                    total={totalRoutes}
                    badgeClass="bg-slate-50 text-slate-700 border-slate-200"
                    isSelected={activeFilters?.continuity === k}
                    onSelect={() => onSelectFilterGroup?.('continuity', k)}
                  />
                ))}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Select group to filter in drawing overlay and ledger
          </span>
        </section>

        {/* Representation State Coverage */}
        <section
          aria-labelledby="representation-coverage-heading"
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 id="representation-coverage-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Representation
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Routes</span>
            </div>

            <div className="space-y-2">
              <SummaryRow
                label="Single Line"
                count={representationCounts['SINGLE_LINE'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-purple-50 text-purple-700 border-purple-200"
                isSelected={activeFilters?.representation === 'SINGLE_LINE'}
                onSelect={() => onSelectFilterGroup?.('representation', 'SINGLE_LINE')}
              />
              <SummaryRow
                label="Double Line"
                count={representationCounts['DOUBLE_LINE'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-indigo-50 text-indigo-700 border-indigo-200"
                isSelected={activeFilters?.representation === 'DOUBLE_LINE'}
                onSelect={() => onSelectFilterGroup?.('representation', 'DOUBLE_LINE')}
              />
              <SummaryRow
                label="Paired-Boundary Derived"
                count={representationCounts['PAIRED_BOUNDARY_DERIVED'] ?? 0}
                total={totalRoutes}
                badgeClass="bg-sky-50 text-sky-700 border-sky-200"
                isSelected={activeFilters?.representation === 'PAIRED_BOUNDARY_DERIVED'}
                onSelect={() => onSelectFilterGroup?.('representation', 'PAIRED_BOUNDARY_DERIVED')}
              />
              {Object.entries(representationCounts)
                .filter(([k]) => !['SINGLE_LINE', 'DOUBLE_LINE', 'PAIRED_BOUNDARY_DERIVED'].includes(k))
                .map(([k, count]) => (
                  <SummaryRow
                    key={k}
                    label={k.replace(/_/g, ' ').toLowerCase()}
                    count={count}
                    total={totalRoutes}
                    badgeClass="bg-slate-50 text-slate-700 border-slate-200"
                    isSelected={activeFilters?.representation === k}
                    onSelect={() => onSelectFilterGroup?.('representation', k)}
                  />
                ))}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Derived from 2D drawing line-style conventions
          </span>
        </section>

        {/* Review Status Coverage */}
        <section
          aria-labelledby="review-coverage-heading"
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 id="review-coverage-heading" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Review Status
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Projection</span>
            </div>

            <div className="space-y-2">
              <SummaryRow
                label="Accepted"
                count={reviewCounts['ACCEPTED'] ?? 0}
                total={totalRoutes + totalObjects}
                badgeClass="bg-emerald-50 text-emerald-700 border-emerald-200"
                isSelected={activeFilters?.reviewStatus === 'ACCEPTED'}
                onSelect={() => onSelectFilterGroup?.('reviewStatus', 'ACCEPTED')}
              />
              <SummaryRow
                label="Needs Review"
                count={reviewCounts['NEEDS_REVIEW'] ?? 0}
                total={totalRoutes + totalObjects}
                badgeClass="bg-amber-50 text-amber-700 border-amber-200"
                isSelected={activeFilters?.reviewStatus === 'NEEDS_REVIEW'}
                onSelect={() => onSelectFilterGroup?.('reviewStatus', 'NEEDS_REVIEW')}
              />
              <SummaryRow
                label="Rejected"
                count={reviewCounts['REJECTED'] ?? 0}
                total={totalRoutes + totalObjects}
                badgeClass="bg-rose-50 text-rose-700 border-rose-200"
                isSelected={activeFilters?.reviewStatus === 'REJECTED'}
                onSelect={() => onSelectFilterGroup?.('reviewStatus', 'REJECTED')}
              />
              <SummaryRow
                label="Not Reviewed / Pending"
                count={
                  (reviewCounts['PENDING'] ?? 0) +
                  (reviewCounts['NOT_REVIEWED'] ?? 0) ||
                  Math.max(
                    0,
                    totalRoutes +
                      totalObjects -
                      ((reviewCounts['ACCEPTED'] ?? 0) +
                        (reviewCounts['NEEDS_REVIEW'] ?? 0) +
                        (reviewCounts['REJECTED'] ?? 0))
                  )
                }
                total={totalRoutes + totalObjects}
                badgeClass="bg-slate-50 text-slate-600 border-slate-200"
                isSelected={activeFilters?.reviewStatus === 'PENDING'}
                onSelect={() => onSelectFilterGroup?.('reviewStatus', 'PENDING')}
              />
            </div>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Review status changes projection, never immutable run
          </span>
        </section>
      </div>

      {/* Filter Reset if active */}
      {hasActiveFilter && (
        <div className="flex items-center justify-between p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs">
          <div className="flex items-center space-x-2 text-blue-900 font-medium">
            <Filter className="w-4 h-4 text-blue-600" aria-hidden="true" />
            <span>Summary filter applied to Drawing Overlay & Quantities Ledger</span>
          </div>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="px-2.5 py-1 bg-white border border-blue-300 hover:bg-blue-50 rounded text-blue-700 font-medium transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface SummaryRowProps {
  label: string;
  count: number;
  total: number;
  badgeClass: string;
  isSelected?: boolean;
  onSelect?: () => void;
}

const SummaryRow: React.FC<SummaryRowProps> = ({
  label,
  count,
  total,
  badgeClass,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors text-left border ${
        isSelected
          ? 'bg-slate-100 border-[#006D84] ring-1 ring-[#006D84]'
          : 'border-transparent hover:bg-slate-50'
      }`}
    >
      <span className="font-medium text-slate-700 capitalize">{label}</span>
      <div className="flex items-center space-x-2">
        <span className="font-mono font-bold text-slate-900">{count}</span>
        <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${badgeClass}`}>
          {total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'}
        </span>
      </div>
    </button>
  );
};
