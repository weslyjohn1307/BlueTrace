import React from 'react';
import {
  FileCode,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import type { RouteItem, ObjectItem, SheetItem, ViewDetailResponse } from '../../api/contracts';

export interface ResultInspectorProps {
  selectedRoute: RouteItem | null;
  selectedObject: ObjectItem | null;
  selectedSheet: SheetItem | null;
  selectedView: ViewDetailResponse | null;
  totalRoutes: number;
  totalObjects: number;
}

export const ResultInspector: React.FC<ResultInspectorProps> = ({
  selectedRoute,
  selectedObject,
  selectedSheet,
  selectedView,
  totalRoutes,
  totalObjects,
}) => {
  const [copiedId, setCopiedId] = React.useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  // Case 1: An Item (Route or Object) is selected
  if (selectedRoute || selectedObject) {
    const isRoute = !!selectedRoute;
    const item = selectedRoute || selectedObject!;
    const id = isRoute ? selectedRoute!.route_id : selectedObject!.object_id;
    const revProj = item.review_projection;
    const revStatus = revProj?.reviewed_status || 'PENDING';
    const uncertainty = item.uncertainty_codes || [];

    // Extract geometry details
    const geom = item.geometry?.location_or_path;
    const geomType = geom?.type || (isRoute ? 'polyline' : 'bbox');
    const points = geom?.points;
    const xyxy = geom?.xyxy;

    return (
      <div data-testid="result-inspector" className="space-y-4 text-xs">
        {/* Header: Canonical Identifier & Type */}
        <div className="pb-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {isRoute ? 'Canonical Route Entity' : 'Quantifiable Object Entity'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                revStatus === 'ACCEPTED'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : revStatus === 'REJECTED'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : revStatus === 'NEEDS_REVIEW'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {revStatus}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-mono font-bold text-sm text-slate-900 break-all">{id}</h3>
            <button
              type="button"
              aria-label="Copy Canonical ID"
              onClick={() => handleCopy(id)}
              className="ml-2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
            >
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5">
            Class: <span className="font-semibold text-slate-800">{item.object_type}</span>
          </div>
        </div>

        {/* SECTION 1: RAW EXTRACTION (Immutable) */}
        <div className="space-y-2.5">
          <div className="flex items-center space-x-1.5 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
            <FileCode className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <h4>Raw Extraction (Immutable)</h4>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-2 font-mono text-[11px]">
            {/* Representation */}
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Representation State</span>
              <span className="text-slate-800 font-medium">
                {item.representation_state || 'Not specified'}
              </span>
            </div>

            {/* Continuity for routes */}
            {isRoute && selectedRoute && (
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Continuity Status</span>
                <span className="text-slate-800 font-medium">
                  {selectedRoute.continuity_status || 'UNKNOWN'}
                </span>
              </div>
            )}

            {/* Confidence */}
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Model Confidence</span>
              <span className="text-slate-700">
                {item.confidence != null ? (
                  `${(item.confidence * 100).toFixed(1)}%`
                ) : (
                  <span className="italic text-slate-500">Not available (uncalibrated)</span>
                )}
              </span>
            </div>

            {/* Physical Length & Scale */}
            {isRoute && selectedRoute && (
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Physical Length</span>
                <span className="text-slate-700 font-semibold block">
                  {selectedRoute.physical_length?.value != null
                    ? `${selectedRoute.physical_length.value.toFixed(2)} m`
                    : '— (Length unavailable)'}
                </span>
                <span className="text-[10px] text-amber-700 block mt-0.5">
                  Scale state: {selectedRoute.scale_status || 'SCALE_UNREADABLE'}
                </span>
                {selectedRoute.physical_length_status && (
                  <span className="text-[10px] text-slate-500 block font-mono">
                    Status: {selectedRoute.physical_length_status}
                  </span>
                )}
              </div>
            )}

            {/* Geometry Summary */}
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Geometry ({geomType})</span>
              {points && points.length > 0 ? (
                <div className="text-[10px] text-slate-600">
                  <span>{points.length} coordinate points (PDF pt):</span>
                  <div className="max-h-16 overflow-y-auto bg-white p-1 rounded border border-slate-200 mt-1">
                    {points.map((pt, i) => (
                      <div key={i} className="truncate">
                        [{pt[0].toFixed(1)}, {pt[1].toFixed(1)}]
                      </div>
                    ))}
                  </div>
                </div>
              ) : xyxy ? (
                <div className="text-[10px] text-slate-600">
                  BBox: [{xyxy[0].toFixed(1)}, {xyxy[1].toFixed(1)}, {xyxy[2].toFixed(1)},{' '}
                  {xyxy[3].toFixed(1)}]
                </div>
              ) : (
                <span className="text-slate-400 italic">No points available</span>
              )}
            </div>

            {/* Lineage & Source Native ID */}
            {isRoute && selectedRoute?.source_native_id && (
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Source Native Lineage ID</span>
                <span className="text-slate-800 text-[10px] break-all">{selectedRoute.source_native_id}</span>
              </div>
            )}

            {/* Uncertainty Codes */}
            {uncertainty.length > 0 && (
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Uncertainty Codes</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {uncertainty.map((code, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] rounded font-mono"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: REVIEWED STATUS (Mutable Projection) */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200">
          <div className="flex items-center space-x-1.5 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
            <h4>Reviewed Projection</h4>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Current Status:</span>
              <span className="font-bold text-slate-900">{revStatus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Latest Action:</span>
              <span className="text-slate-800">{revProj?.last_action || 'None'}</span>
            </div>
            {revProj?.last_action_at && (
              <div className="flex justify-between">
                <span className="text-slate-500">Action Timestamp:</span>
                <span className="text-slate-600 text-[10px]">{revProj.last_action_at}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Event Count:</span>
              <span className="text-slate-900 font-bold">{revProj?.event_count || 0}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: No Item selected -> Show Run and Drawing Metadata Overview
  return (
    <div data-testid="result-inspector" className="space-y-4 text-xs">
      <div className="pb-2 border-b border-slate-200">
        <h3 className="font-heading font-semibold text-slate-800 text-sm">
          Extraction Inspector
        </h3>
        <p className="text-slate-500 text-[11px] mt-0.5">
          Select any route or object on the canvas or table to inspect raw provenance and engineering properties.
        </p>
      </div>

      {/* Summary Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 font-mono text-[11px]">
        <div className="text-slate-500 font-semibold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-200">
          View Extraction Census
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Total Routes:</span>
          <span className="font-bold text-blue-700">{totalRoutes}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Total Objects:</span>
          <span className="font-bold text-red-700">{totalObjects}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Scale Verification:</span>
          <span className="font-bold text-amber-700">FAIL-CLOSED (G3)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Physical Lengths:</span>
          <span className="text-slate-500">100% Unavailable</span>
        </div>
      </div>

      {/* Scale Verification Notice */}
      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px]">
        <div className="font-bold">G3: Scale Unverified</div>
        <p className="mt-0.5 text-[10px] text-amber-800">
          Drawing contains no verified physical scale bar or ratio. All linear lengths remain fail-closed (null).
        </p>
      </div>

      <div className="pt-1 text-slate-500 text-[11px]">
        <span>Extraction overlays, route tables, and export options unlock in UI-04 and UI-05.</span>
      </div>

      {/* Active Sheet and View Context */}
      {(selectedSheet || selectedView) && (
        <div className="space-y-1.5 font-mono text-[11px]">
          {selectedSheet && (
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Candidate Sheet</span>
              <div className="text-slate-800 font-bold">{selectedSheet.sheet_id}</div>
            </div>
          )}
          {selectedView && (
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Active Viewport</span>
              <div className="text-slate-800 font-bold">{selectedView.view_id}</div>
              <div className="text-slate-500 text-[10px]">{selectedView.coordinate_space}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
