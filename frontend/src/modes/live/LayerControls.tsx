import React from 'react';
import {
  Layers,
  Filter,
  Eye,
  EyeOff,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

export interface FilterState {
  continuity: string;
  representation: string;
  reviewStatus: string;
}

export interface LayerControlsProps {
  totalRoutes: number;
  totalObjects: number;
  visibleCount: number;
  showRoutes: boolean;
  showObjects: boolean;
  showReviewMarks: boolean;
  filters: FilterState;
  onToggleRoutes: () => void;
  onToggleObjects: () => void;
  onToggleReviewMarks: () => void;
  onFilterChange: (key: keyof FilterState, value: string) => void;
  onClearFilters: () => void;
  selectedItemHiddenByFilter?: boolean;
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  totalRoutes,
  totalObjects,
  visibleCount,
  showRoutes,
  showObjects,
  showReviewMarks,
  filters,
  onToggleRoutes,
  onToggleObjects,
  onToggleReviewMarks,
  onFilterChange,
  onClearFilters,
  selectedItemHiddenByFilter = false,
}) => {
  const hasActiveFilters =
    filters.continuity !== 'ALL' ||
    filters.representation !== 'ALL' ||
    filters.reviewStatus !== 'ALL';

  return (
    <div
      data-testid="layer-controls"
      className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      {/* 1. Layer Visibility Toggles */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
        <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider flex items-center mr-1">
          <Layers className="w-3.5 h-3.5 mr-1 text-slate-500" aria-hidden="true" />
          Layers:
        </span>

        {/* Routes Layer Button */}
        <button
          type="button"
          aria-pressed={showRoutes}
          onClick={onToggleRoutes}
          className={`px-2.5 py-1 rounded border inline-flex items-center space-x-1.5 font-medium transition-colors ${
            showRoutes
              ? 'bg-blue-50 border-blue-300 text-blue-800'
              : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
          }`}
        >
          {showRoutes ? (
            <Eye className="w-3 h-3 text-blue-600" aria-hidden="true" />
          ) : (
            <EyeOff className="w-3 h-3 text-slate-400" aria-hidden="true" />
          )}
          <span>Routes ({totalRoutes})</span>
        </button>

        {/* Objects Layer Button */}
        <button
          type="button"
          aria-pressed={showObjects}
          onClick={onToggleObjects}
          className={`px-2.5 py-1 rounded border inline-flex items-center space-x-1.5 font-medium transition-colors ${
            showObjects
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
          }`}
        >
          {showObjects ? (
            <Eye className="w-3 h-3 text-red-600" aria-hidden="true" />
          ) : (
            <EyeOff className="w-3 h-3 text-slate-400" aria-hidden="true" />
          )}
          <span>Objects ({totalObjects})</span>
        </button>

        {/* Review & Uncertainty Marks Toggle */}
        <button
          type="button"
          aria-pressed={showReviewMarks}
          onClick={onToggleReviewMarks}
          className={`px-2.5 py-1 rounded border inline-flex items-center space-x-1.5 font-medium transition-colors ${
            showReviewMarks
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
          <span>Review Marks</span>
        </button>
      </div>

      {/* 2. Status Filters */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
        <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider flex items-center mr-1">
          <Filter className="w-3.5 h-3.5 mr-1 text-slate-500" aria-hidden="true" />
          Filter:
        </span>

        {/* Continuity Filter */}
        <select
          aria-label="Filter by continuity status"
          value={filters.continuity}
          onChange={(e) => onFilterChange('continuity', e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#006D84]"
        >
          <option value="ALL">All Continuity</option>
          <option value="CONTINUOUS">Continuous (64)</option>
          <option value="GAP_BRIDGED">Gap-Bridged (8)</option>
          <option value="ISOLATED">Isolated (114)</option>
          <option value="REVIEW_REQUIRED">Review Required (143)</option>
        </select>

        {/* Review Status Filter */}
        <select
          aria-label="Filter by review status"
          value={filters.reviewStatus}
          onChange={(e) => onFilterChange('reviewStatus', e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-[#006D84]"
        >
          <option value="ALL">All Review Statuses</option>
          <option value="PENDING">Pending Review</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
        </select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-2 py-1 text-xs text-[#006D84] hover:text-[#005769] hover:bg-slate-100 rounded inline-flex items-center space-x-1 font-medium transition-colors"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Clear Filters</span>
          </button>
        )}

        {/* Showing Count */}
        <span className="text-slate-500 font-mono text-[11px] pl-2 border-l border-slate-200">
          Showing <span className="font-bold text-slate-800">{visibleCount}</span> of{' '}
          <span>{totalRoutes + totalObjects}</span> results
        </span>
      </div>

      {/* Notice if selected item is hidden by filter */}
      {selectedItemHiddenByFilter && (
        <div className="w-full mt-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] flex items-center space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <span>The currently selected item is hidden by the active filter.</span>
          <button
            type="button"
            onClick={onClearFilters}
            className="font-bold underline hover:text-amber-900 ml-1"
          >
            Clear filters to show
          </button>
        </div>
      )}
    </div>
  );
};
