import React, { useState } from 'react';
import {
  Info,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Ruler,
  ShieldCheck,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import type {
  ObjectItem,
  RouteItem,
  ReviewedStatus,
  SheetItem,
} from '../../api/contracts';

export interface ContextualInspectorProps {
  selectedObject: ObjectItem | null;
  selectedRoute: RouteItem | null;
  selectedSheet: SheetItem | null;
  onClearSelection: () => void;
  onReview: (id: string, type: 'route' | 'object', status: ReviewedStatus, notes?: string) => void;
  scaleStatus: string;
  scaleRatioLabel: string | null;
  scaleRatioValue: number | null;
  onOpenCalibration: () => void;
  onOpenCopilot: () => void;
  allObjects: ObjectItem[];
  allRoutes: RouteItem[];
}

/** Calculate Euclidean distance of route polyline in user points */
function calculatePolylineLengthPt(points?: [number, number][]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

export const ContextualInspector: React.FC<ContextualInspectorProps> = ({
  selectedObject,
  selectedRoute,
  selectedSheet,
  onClearSelection,
  onReview,
  scaleStatus: _scaleStatus,
  scaleRatioLabel,
  scaleRatioValue,
  onOpenCalibration,
  onOpenCopilot,
  allObjects,
  allRoutes,
}) => {
  const [noteInput, setNoteInput] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);

  const hasSelection = Boolean(selectedObject || selectedRoute);

  // Group objects by category for the sheet overview
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allObjects.forEach((o) => {
      const type = (o.object_type || 'Unknown').toLowerCase();
      let cat = 'Other Components';
      if (type.includes('fire') || type.includes('damper') || type.includes('fd')) {
        cat = 'Fire Dampers';
      } else if (type.includes('wshp') || type.includes('heat pump')) {
        cat = 'WSHP Units';
      } else if (type.includes('grille') || type.includes('diffuser') || type.includes('lbg')) {
        cat = 'Linear Bar Grilles';
      }
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [allObjects]);

  const handleApplyReview = (status: ReviewedStatus) => {
    if (selectedObject) {
      onReview(selectedObject.object_id, 'object', status, noteInput || undefined);
    } else if (selectedRoute) {
      onReview(selectedRoute.route_id, 'route', status, noteInput || undefined);
    }
    setNoteInput('');
    setShowNoteField(false);
  };

  return (
    <aside
      aria-label="Contextual Inspector"
      className="w-80 md:w-88 bg-white border-l border-slate-200 flex flex-col h-full select-none shrink-0 shadow-xs z-20"
    >
      {/* Inspector Header */}
      <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div className="flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#006D84]" />
          <span className="font-heading text-sm font-bold text-slate-800">
            {hasSelection ? 'Element Inspector' : 'Sheet Takeoff Overview'}
          </span>
        </div>

        {hasSelection ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Clear Selection"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenCopilot}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#635BFF]/10 hover:bg-[#635BFF]/20 text-[#635BFF] text-xs font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#635BFF]" />
            <span>Ask Drawing</span>
          </button>
        )}
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CASE 1: Object Selected */}
        {selectedObject && (
          <div className="space-y-4">
            {/* Identity & Type Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200">
                  {selectedObject.object_type.replace(/_/g, ' ')}
                </span>
                {typeof selectedObject.confidence === 'number' && (
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {Math.round(selectedObject.confidence * 100)}% confidence
                  </span>
                )}
              </div>
              <h2 className="font-mono text-base font-bold text-slate-900 break-all">
                {selectedObject.object_id}
              </h2>
            </div>

            {/* Properties List */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Method:</span>
                <span className="font-medium text-slate-800">
                  {selectedObject.object_type.toLowerCase().includes('damper')
                    ? 'Supervised YOLO11n'
                    : 'Spatially Bounded Vector GMMD'}
                </span>
              </div>

              {selectedObject.geometry?.location_or_path?.xyxy && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Bounds (pt):</span>
                  <span className="font-mono text-slate-700 text-[11px]">
                    {selectedObject.geometry.location_or_path.xyxy
                      .map((n) => Math.round(n))
                      .join(', ')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600">
                <span>Review Status:</span>
                <span
                  className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                    selectedObject.review_projection?.reviewed_status === 'ACCEPTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedObject.review_projection?.reviewed_status === 'REJECTED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedObject.review_projection?.reviewed_status || 'PENDING'}
                </span>
              </div>
            </div>

            {/* Review Decision Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-800 block">
                Engineer Takeoff Decision
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyReview('ACCEPTED')}
                  className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyReview('REJECTED')}
                  className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-md bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyReview('NEEDS_REVIEW')}
                  className="text-xs text-amber-700 hover:underline font-medium cursor-pointer"
                >
                  Flag for Review
                </button>
                <button
                  type="button"
                  onClick={() => setShowNoteField(!showNoteField)}
                  className="text-xs text-slate-500 hover:text-slate-800 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{showNoteField ? 'Hide Note' : 'Add Note'}</span>
                </button>
              </div>

              {showNoteField && (
                <div className="pt-2 space-y-1.5">
                  <textarea
                    rows={2}
                    placeholder="Enter engineering review remarks..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#006D84]/40"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyReview('NEEDS_REVIEW')}
                    className="btn-secondary text-xs h-7 py-0 w-full"
                  >
                    <span>Save Remark</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CASE 2: Route Selected */}
        {selectedRoute && (
          <div className="space-y-4">
            {/* Identity & Type Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                  {selectedRoute.object_type.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {selectedRoute.continuity_status || 'DIRECT'}
                </span>
              </div>
              <h2 className="font-mono text-base font-bold text-slate-900 break-all">
                {selectedRoute.route_id}
              </h2>
            </div>

            {/* Drawing-Space vs Physical Length Comparison (Crucial Requirement) */}
            <div className="workstation-card p-3.5 space-y-3 bg-slate-50/50">
              {/* Drawing Space Length */}
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block">
                  Drawing-Space Length
                </span>
                {(() => {
                  const pts = selectedRoute.geometry?.location_or_path?.points;
                  const lengthPt = calculatePolylineLengthPt(pts);
                  const lengthInches = (lengthPt / 72).toFixed(2);
                  return (
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="font-mono text-lg font-bold text-slate-900">
                        {lengthPt.toFixed(1)} pt
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        ({lengthInches} in on sheet)
                      </span>
                    </div>
                  );
                })()}
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Native PDF vector Euclidean polyline distance.
                </span>
              </div>

              {/* Physical Takeoff Length */}
              <div className="pt-2.5 border-t border-slate-200">
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block">
                  Physical Takeoff Length
                </span>

                {scaleRatioValue !== null && scaleRatioValue > 0 ? (
                  <div className="mt-0.5">
                    {(() => {
                      const pts = selectedRoute.geometry?.location_or_path?.points;
                      const lengthPt = calculatePolylineLengthPt(pts);
                      const physicalM = lengthPt * scaleRatioValue;
                      const physicalFt = physicalM * 3.28084;
                      return (
                        <div className="flex items-baseline space-x-2">
                          <span className="font-mono text-lg font-bold text-emerald-700">
                            {physicalM.toFixed(2)} m
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            ({physicalFt.toFixed(1)} ft)
                          </span>
                        </div>
                      );
                    })()}
                    <span className="inline-flex items-center space-x-1 text-[10px] font-mono text-emerald-700 mt-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Calibrated ({scaleRatioLabel})</span>
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Unverified (Scale Unavailable)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Scale is unverified on this sheet. Physical length fails closed (null) per Constitution Article 1.1.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenCalibration}
                      className="text-xs font-semibold text-[#006D84] hover:underline flex items-center space-x-1 cursor-pointer pt-0.5"
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span>Calibrate Scale</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Review Decision Actions */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-800 block">
                Engineer Review Decision
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyReview('ACCEPTED')}
                  className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyReview('REJECTED')}
                  className="flex items-center justify-center space-x-1.5 py-2 px-3 rounded-md bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CASE 3: Nothing Selected — General Sheet Overview */}
        {!hasSelection && (
          <div className="space-y-5">
            {/* Sheet Meta */}
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                Active Drawing Sheet
              </span>
              <h2 className="font-heading text-lg font-bold text-slate-900 mt-0.5">
                {selectedSheet?.sheet_id || 'Sheet Viewport'}
              </h2>
            </div>

            {/* Categorized Quantities Summary */}
            <div className="workstation-card p-4 space-y-3">
              <span className="text-xs font-semibold text-slate-800 block">
                Quantities on this Sheet
              </span>

              <div className="space-y-2">
                {Object.entries(categoryCounts).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 flex items-center space-x-1.5">
                      <span
                        className={`w-2 h-2 rounded-xs ${
                          cat.includes('Fire')
                            ? 'bg-[#EA580C]'
                            : cat.includes('WSHP')
                            ? 'bg-[#006D84]'
                            : 'bg-[#0284C7]'
                        }`}
                      />
                      <span>{cat}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-900">{count}</span>
                  </div>
                ))}

                {allObjects.length === 0 && (
                  <span className="text-xs text-slate-400 italic block">
                    No discrete components detected.
                  </span>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-600 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-xs bg-[#2563EB]" />
                    <span>Linear Route Runs</span>
                  </span>
                  <span className="font-mono font-bold text-[#2563EB]">
                    {allRoutes.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Scale Readiness Card */}
            <div className="workstation-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Scale Calibration
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    scaleRatioValue !== null
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {scaleRatioValue !== null ? 'Calibrated' : 'Unverified'}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {scaleRatioValue !== null
                  ? `Active scale ratio: ${scaleRatioLabel || 'Custom Calibration'}.`
                  : 'Drawing title block scale is unverified. Linear measurements will display in drawing-space points until calibrated.'}
              </p>

              <button
                type="button"
                onClick={onOpenCalibration}
                className="btn-secondary text-xs h-8 w-full mt-1"
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>{scaleRatioValue !== null ? 'Change Calibration' : 'Calibrate Scale'}</span>
              </button>
            </div>

            {/* Quick Copilot Prompt Suggestion */}
            <div className="bg-[#635BFF]/5 border border-[#635BFF]/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center space-x-1.5 text-[#635BFF] text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Copilot Takeoff Queries</span>
              </div>
              <p className="text-xs text-slate-600">
                Ask questions about detected fire dampers, WSHP counts, or duct continuity on this sheet.
              </p>
              <button
                type="button"
                onClick={onOpenCopilot}
                className="text-xs font-semibold text-[#635BFF] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <span>Open Copilot Drawer</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
