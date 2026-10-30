import React from 'react';
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckSquare,
  Square,
  Ruler,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export interface CanvasFooterToolbarProps {
  scalePercent: number;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset100: () => void;
  showComponents: boolean;
  onToggleComponents: () => void;
  showRoutes: boolean;
  onToggleRoutes: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  scaleStatus?: string;
  scaleRatioLabel?: string | null;
  onOpenCalibration: () => void;
  componentCount?: number;
  routeCount?: number;
}

export const CanvasFooterToolbar: React.FC<CanvasFooterToolbarProps> = ({
  scalePercent,
  onFit,
  onZoomIn,
  onZoomOut,
  onReset100,
  showComponents,
  onToggleComponents,
  showRoutes,
  onToggleRoutes,
  showLabels,
  onToggleLabels,
  scaleStatus = 'SCALE_UNREADABLE',
  scaleRatioLabel = null,
  onOpenCalibration,
  componentCount = 0,
  routeCount = 0,
}) => {
  const isCalibrated = scaleStatus === 'VERIFIED' || scaleStatus === 'MANUALLY_CONFIRMED';

  return (
    <div
      role="toolbar"
      aria-label="Drawing Canvas Toolbar"
      className="h-11 bg-white border-t border-slate-200 px-4 flex items-center justify-between select-none shrink-0 shadow-2xs z-20"
    >
      {/* 1. Zoom and Fit Controls */}
      <div className="flex items-center space-x-1.5">
        <button
          type="button"
          onClick={onFit}
          title="Fit Drawing to Window (F)"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onZoomOut}
          title="Zoom Out (-)"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onReset100}
          title="Click to reset to 100%"
          className="px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
        >
          {Math.round(scalePercent)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          title="Zoom In (+)"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onFit}
          title="Reset to Fit"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Layer Visibility Toggles */}
      <div className="flex items-center space-x-2 border-x border-slate-200 px-3">
        {/* Components (L1) toggle */}
        <button
          type="button"
          onClick={onToggleComponents}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            showComponents
              ? 'bg-orange-50 text-orange-800 border border-orange-200'
              : 'text-slate-500 hover:bg-slate-100 border border-transparent'
          }`}
          title="Toggle Level 1 Quantifiable Components"
        >
          <span className="w-2.5 h-2.5 rounded-xs bg-[#EA580C]" />
          <span>Components</span>
          <span className="font-mono text-[10px] opacity-75">({componentCount})</span>
        </button>

        {/* Routes (L2) toggle */}
        <button
          type="button"
          onClick={onToggleRoutes}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            showRoutes
              ? 'bg-blue-50 text-blue-800 border border-blue-200'
              : 'text-slate-500 hover:bg-slate-100 border border-transparent'
          }`}
          title="Toggle Level 2 Linear Routes"
        >
          <span className="w-2.5 h-0.5 bg-[#2563EB]" />
          <span>Routes</span>
          <span className="font-mono text-[10px] opacity-75">({routeCount})</span>
        </button>

        {/* Labels toggle */}
        <button
          type="button"
          onClick={onToggleLabels}
          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            showLabels
              ? 'bg-slate-100 text-slate-800'
              : 'text-slate-400 hover:bg-slate-50'
          }`}
          title="Toggle On-Canvas Confidence Badges"
        >
          {showLabels ? (
            <CheckSquare className="w-3 h-3 text-[#006D84]" />
          ) : (
            <Square className="w-3 h-3" />
          )}
          <span>Labels</span>
        </button>
      </div>

      {/* 3. Scale Calibration Status & Trigger */}
      <div className="flex items-center space-x-2.5">
        <div
          className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
            isCalibrated
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
          title={
            isCalibrated
              ? `Scale verified: ${scaleRatioLabel || 'Calibrated'}`
              : 'Drawing scale could not be automatically confirmed from title block'
          }
        >
          {isCalibrated ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-600" />
          )}
          <span>
            {isCalibrated
              ? `Scale: ${scaleRatioLabel || 'Confirmed'}`
              : 'Scale: Unverified'}
          </span>
        </div>

        <button
          type="button"
          id="canvas-calibrate-scale-btn"
          onClick={onOpenCalibration}
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#006D84] hover:bg-[#005769] text-white text-xs font-medium shadow-2xs transition-colors cursor-pointer"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Calibrate Scale</span>
        </button>
      </div>
    </div>
  );
};
