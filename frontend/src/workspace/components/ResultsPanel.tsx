import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Route as RouteIcon,
  BookOpen,
  Ruler,
  Download,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Flame,
  Fan,
  Grid,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import type {
  RouteItem,
  ObjectItem,
  ReviewedStatus,
  SheetItem,
} from '../../api/contracts';

export type WorkstationTab = 'components' | 'routes' | 'legend' | 'scale' | 'export';

export interface ResultsPanelProps {
  sheet?: SheetItem | null;
  routes: RouteItem[];
  objects: ObjectItem[];
  selectedId: string | null;
  selectedType: 'route' | 'object' | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  onClearSelection: () => void;
  onReview: (id: string, type: 'route' | 'object', status: ReviewedStatus, notes?: string) => void;
  onBatchReviewObjects?: (status: ReviewedStatus) => void;
  scaleStatus?: string;
  scaleRatioLabel?: string | null;
  scaleRatioValue?: number | null;
  onOpenCalibration: () => void;
  onOpenCopilot?: () => void;
  modelReady?: boolean;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  isExporting?: boolean;
  onApplyPresetScale?: (label: string, ptToMRatio: number) => void;
  sheets?: SheetItem[];
  onSelectSheet?: (sheet: SheetItem) => void;
}

const PRESET_SCALES = [
  { label: '1/8" = 1\'-0" (1:96)', ptToM: (96 * 0.0254) / 72, desc: 'Standard Floor Plan' },
  { label: '1/4" = 1\'-0" (1:48)', ptToM: (48 * 0.0254) / 72, desc: 'Detailed Mechanical' },
  { label: '3/8" = 1\'-0" (1:32)', ptToM: (32 * 0.0254) / 72, desc: 'Equipment Room' },
  { label: '1/2" = 1\'-0" (1:24)', ptToM: (24 * 0.0254) / 72, desc: 'Enlarged Detail' },
  { label: '1:100 Metric', ptToM: (100 * 0.0254) / 72, desc: 'Metric General Plan' },
  { label: '1:50 Metric', ptToM: (50 * 0.0254) / 72, desc: 'Metric Detailed Plan' },
];

function getCategoryInfo(rawType: string): { label: string; color: string; icon: 'fire' | 'fan' | 'grid' | 'box' } {
  const t = rawType.toLowerCase();
  if (t.includes('fire') || t.includes('damper') || t.includes('fd')) {
    return { label: 'Fire Dampers', color: '#EA580C', icon: 'fire' };
  }
  if (t.includes('wshp') || t.includes('heat pump')) {
    return { label: 'WSHP Units', color: '#006D84', icon: 'fan' };
  }
  if (t.includes('grille') || t.includes('diffuser') || t.includes('lbg')) {
    return { label: 'Linear Bar Grilles', color: '#0284C7', icon: 'grid' };
  }
  return { label: rawType.replace(/_/g, ' '), color: '#64748B', icon: 'box' };
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  sheet,
  routes,
  objects,
  selectedId,
  selectedType: _selectedType,
  onSelect,
  onClearSelection: _onClearSelection,
  onReview: _onReview,
  onBatchReviewObjects,
  scaleStatus = 'SCALE_UNREADABLE',
  scaleRatioLabel = null,
  scaleRatioValue = null,
  onOpenCalibration,
  onOpenCopilot,
  modelReady: _modelReady = true,
  onExportCsv,
  onExportJson,
  isExporting = false,
  onApplyPresetScale,
  sheets,
  onSelectSheet,
}) => {
  const [activeTab, setActiveTab] = useState<WorkstationTab>('components');
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED'>('ALL');

  // Expanded categories map (all expanded by default)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Fire Dampers': true,
    'WSHP Units': true,
    'Linear Bar Grilles': true,
  });

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [cat]: prev[cat] === undefined ? false : !prev[cat],
    }));
  };

  // Filtered objects by review projection
  const filteredObjects = useMemo(() => {
    if (reviewFilter === 'ALL') return objects;
    return objects.filter((o) => (o.review_projection?.reviewed_status || 'PENDING') === reviewFilter);
  }, [objects, reviewFilter]);

  // Group objects by category
  const categorizedObjects = useMemo(() => {
    const map: Record<string, { info: ReturnType<typeof getCategoryInfo>; items: ObjectItem[] }> = {};
    filteredObjects.forEach((obj) => {
      const info = getCategoryInfo(obj.object_type || 'Component');
      if (!map[info.label]) {
        map[info.label] = { info, items: [] };
      }
      map[info.label].items.push(obj);
    });
    return map;
  }, [filteredObjects]);

  // Group routes by type
  const categorizedRoutes = useMemo(() => {
    const mechRoutes: RouteItem[] = [];
    const plumRoutes: RouteItem[] = [];
    routes.forEach((r) => {
      const t = (r.object_type || '').toLowerCase();
      if (t.includes('pipe') || t.includes('plumb')) {
        plumRoutes.push(r);
      } else {
        mechRoutes.push(r);
      }
    });
    return {
      'Mechanical Ducts': mechRoutes,
      'Plumbing Pipelines': plumRoutes,
    };
  }, [routes]);

  return (
    <aside
      aria-label="Workstation Results Navigation"
      className="w-80 md:w-88 bg-white border-r border-slate-200 flex flex-col h-full select-none shrink-0 shadow-xs z-20"
    >
      {/* Panel Top Title & Sheet Info */}
      <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="w-4 h-4 text-[#006D84]" />
          <span className="font-heading text-sm font-bold text-slate-800">
            Takeoff Results
          </span>
          {sheet?.sheet_id && (
            <span className="font-mono text-xs text-slate-500 truncate max-w-[110px]" title={sheet.sheet_id}>
              · {sheet.sheet_id}
            </span>
          )}
        </div>

        {onOpenCopilot && (
          <button
            type="button"
            onClick={onOpenCopilot}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#635BFF]/10 hover:bg-[#635BFF]/20 text-[#635BFF] text-xs font-semibold transition-colors cursor-pointer"
            title="Ask Copilot about takeoff on this sheet"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Copilot</span>
          </button>
        )}
      </div>

      {/* Multi-Sheet Switcher (shown when document has multiple sheets) */}
      {sheets && sheets.length > 1 && onSelectSheet && (
        <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider">Sheet:</span>
          <select
            value={sheet?.sheet_id || ''}
            onChange={(e) => {
              const target = sheets.find((s) => s.sheet_id === e.target.value);
              if (target) onSelectSheet(target);
            }}
            className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800 max-w-[210px] truncate shadow-2xs focus:border-[#006D84] focus:outline-hidden"
            aria-label="Select drawing sheet"
          >
            {sheets.map((s) => (
              <option key={s.sheet_id} value={s.sheet_id}>
                {s.sheet_id} (Page {s.page_index + 1})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main Mode Tabs Switcher (Autodesk HIG Workstation Navigation) */}
      <nav aria-label="Workstation Modes" className="flex border-b border-slate-200 bg-slate-100/60 shrink-0 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('components')}
          className={`flex-1 py-2.5 px-2 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-1 ${
            activeTab === 'components'
              ? 'bg-white border-[#006D84] text-[#006D84] font-bold shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Components</span>
          <span className="font-mono text-[10px] ml-0.5">({objects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('routes')}
          className={`flex-1 py-2.5 px-2 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center space-x-1 ${
            activeTab === 'routes'
              ? 'bg-white border-[#006D84] text-[#006D84] font-bold shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <RouteIcon className="w-3.5 h-3.5" />
          <span>Routes</span>
          <span className="font-mono text-[10px] ml-0.5">({routes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('legend')}
          className={`py-2.5 px-2 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center ${
            activeTab === 'legend'
              ? 'bg-white border-[#006D84] text-[#006D84] font-bold shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Symbol Legend & Schedule"
        >
          <BookOpen className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scale')}
          className={`py-2.5 px-2 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center ${
            activeTab === 'scale'
              ? 'bg-white border-[#006D84] text-[#006D84] font-bold shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Scale & Calibration"
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('export')}
          className={`py-2.5 px-2 text-center transition-colors cursor-pointer border-b-2 flex items-center justify-center ${
            activeTab === 'export'
              ? 'bg-white border-[#006D84] text-[#006D84] font-bold shadow-2xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Takeoff Export"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </nav>

      {/* TAB 1: COMPONENTS (Separated by Category) */}
      {activeTab === 'components' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Review Filter Bar */}
          <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-100">
            <span className="text-slate-500 font-medium">Filter Status:</span>
            <div className="flex items-center space-x-1">
              {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setReviewFilter(filter)}
                  className={`px-1.5 py-0.5 rounded font-mono cursor-pointer ${
                    reviewFilter === filter
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Batch review button if pending items exist */}
          {onBatchReviewObjects && (
            <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-600 text-[11px]">Unreviewed symbols</span>
              <button
                type="button"
                onClick={() => onBatchReviewObjects('ACCEPTED')}
                className="text-[11px] font-semibold text-[#006D84] hover:underline cursor-pointer"
              >
                Confirm All
              </button>
            </div>
          )}

          {/* Categorized Component Groups */}
          {Object.keys(categorizedObjects).length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No components detected</p>
              <p className="text-slate-400 mt-0.5">This sheet contains no verified symbol classifications.</p>
            </div>
          ) : (
            Object.entries(categorizedObjects).map(([catName, group]) => {
              const isExpanded = expandedCategories[catName] !== false;
              const catItems = group.items.filter((item) =>
                reviewFilter === 'ALL' ? true : (item.review_projection?.reviewed_status || 'PENDING') === reviewFilter
              );

              return (
                <div key={catName} className="workstation-card overflow-hidden">
                  {/* Category Header Card */}
                  <div
                    onClick={() => toggleCategory(catName)}
                    className="p-2.5 bg-slate-50/80 hover:bg-slate-100/80 border-b border-slate-200/80 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: group.info.color }}
                      />
                      <span className="text-xs font-bold text-slate-900">
                        {catName}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                      {catItems.length}
                    </span>
                  </div>

                  {/* Category Item List */}
                  {isExpanded && (
                    <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {catItems.map((obj) => {
                        const isSelected = selectedId === obj.object_id;
                        const confPercent =
                          typeof obj.confidence === 'number' ? Math.round(obj.confidence * 100) : null;
                        const status = obj.review_projection?.reviewed_status || 'PENDING';

                        return (
                          <div
                            key={obj.object_id}
                            onClick={() => onSelect(obj.object_id, 'object')}
                            className={`p-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-sky-50 font-semibold border-l-3 border-[#006D84]'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-mono text-slate-800 truncate max-w-[160px]">
                              {obj.object_id}
                            </span>
                            <div className="flex items-center space-x-2">
                              {confPercent !== null && (
                                <span className="font-mono text-[11px] text-slate-500">
                                  {confPercent}%
                                </span>
                              )}
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  status === 'ACCEPTED'
                                    ? 'bg-emerald-500'
                                    : status === 'REJECTED'
                                    ? 'bg-rose-500'
                                    : 'bg-amber-400'
                                }`}
                                title={status}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: ROUTES (Separated by Discipline) */}
      {activeTab === 'routes' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {routes.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              <RouteIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">No linear routes</p>
              <p className="text-slate-400 mt-0.5">No continuous duct or pipe paths were extracted.</p>
            </div>
          ) : (
            Object.entries(categorizedRoutes).map(([discipline, items]) => {
              if (items.length === 0) return null;

              return (
                <div key={discipline} className="workstation-card overflow-hidden">
                  <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <RouteIcon className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span className="text-xs font-bold text-slate-900">{discipline}</span>
                    </div>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                      {items.length}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {items.map((route) => {
                      const isSelected = selectedId === route.route_id;
                      const status = route.review_projection?.reviewed_status || 'PENDING';

                      return (
                        <div
                          key={route.route_id}
                          onClick={() => onSelect(route.route_id, 'route')}
                          className={`p-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-sky-50 font-semibold border-l-3 border-[#006D84]'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <span className="font-mono text-slate-800 block truncate max-w-[150px]">
                              {route.route_id}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {route.continuity_status || 'DIRECT'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                status === 'ACCEPTED'
                                  ? 'bg-emerald-500'
                                  : status === 'REJECTED'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-400'
                              }`}
                              title={status}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: LEGEND (Real Representation without Fake API Claims) */}
      {activeTab === 'legend' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Symbol Legend & Schedule
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Reference bank utilized for component classification and takeoff validation.
            </p>
          </div>

          <div className="workstation-card p-3 space-y-2 bg-slate-50">
            <span className="font-semibold text-slate-800 block">
              Reference Configuration
            </span>
            <div className="space-y-1 text-slate-600 text-[11px]">
              <div>Mode: <strong className="font-mono text-slate-800">Verified Training Bank</strong></div>
              <div>Classes isolated: <strong className="font-mono text-slate-800">Fire Damper, WSHP, Grille</strong></div>
              <div>Status: <strong className="font-mono text-emerald-700">Pre-Indexed Reference</strong></div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="font-semibold text-slate-800 block">
              Supported Symbols
            </span>
            <div className="space-y-2">
              <div className="p-2.5 rounded border border-orange-200 bg-orange-50/50 flex items-center space-x-2.5">
                <Flame className="w-4 h-4 text-[#EA580C]" />
                <div>
                  <span className="font-bold text-slate-900 block">Fire Damper (FD)</span>
                  <span className="text-[10px] text-slate-500">Life safety duct dampers</span>
                </div>
              </div>

              <div className="p-2.5 rounded border border-teal-200 bg-teal-50/50 flex items-center space-x-2.5">
                <Fan className="w-4 h-4 text-[#006D84]" />
                <div>
                  <span className="font-bold text-slate-900 block">Water Source Heat Pump (WSHP)</span>
                  <span className="text-[10px] text-slate-500">Terminal heat pumps & air units</span>
                </div>
              </div>

              <div className="p-2.5 rounded border border-sky-200 bg-sky-50/50 flex items-center space-x-2.5">
                <Grid className="w-4 h-4 text-[#0284C7]" />
                <div>
                  <span className="font-bold text-slate-900 block">Linear Bar Grille (LBG)</span>
                  <span className="text-[10px] text-slate-500">Air supply/return distribution</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic pt-2 border-t border-slate-100">
            Symbol extraction models run offline inference against verified vector and raster geometries. Dynamic offline OCR tools are used during dataset training.
          </p>
        </div>
      )}

      {/* TAB 4: SCALE & CALIBRATION (Simple, Direct) */}
      {activeTab === 'scale' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Drawing Scale & Calibration
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Linear route measurement requires verified scale.
            </p>
          </div>

          <div className="workstation-card p-3 space-y-2 bg-slate-50">
            <span className="font-semibold text-slate-800 block">
              Active Scale Status
            </span>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  scaleRatioValue !== null ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="font-mono font-bold text-slate-800">
                {scaleRatioValue !== null ? scaleRatioLabel : scaleStatus}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {scaleRatioValue !== null
                ? `Scale confirmed: 1 point (pt) = ${scaleRatioValue.toFixed(5)} metres.`
                : 'Drawing scale could not be automatically verified. All physical takeoff lengths fail closed.'}
            </p>
          </div>

          {/* 2-Point Calibration Button */}
          <button
            type="button"
            onClick={onOpenCalibration}
            className="btn-primary w-full text-xs h-9"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Calibrate with 2 Points</span>
          </button>

          {/* Preset Scale Options */}
          {onApplyPresetScale && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-semibold text-slate-700 block">
                Standard Preset Scales
              </span>
              <div className="space-y-1.5">
                {PRESET_SCALES.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => onApplyPresetScale(p.label, p.ptToM)}
                    className="w-full text-left p-2 rounded border border-slate-200 hover:border-[#006D84] hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-mono font-medium text-slate-800 block">{p.label}</span>
                      <span className="text-[10px] text-slate-400">{p.desc}</span>
                    </div>
                    <span className="text-[10px] text-[#006D84] font-semibold">Apply</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: EXPORT */}
      {activeTab === 'export' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <h3 className="font-heading text-sm font-bold text-slate-900">
              Takeoff Quantities Export
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Deterministic 5-field public schema and verified engineering takeoff bundles.
            </p>
          </div>

          {/* Takeoff Summary Stats */}
          <div className="workstation-card p-3 space-y-2 bg-slate-50">
            <span className="font-semibold text-slate-800 block">
              Takeoff Bill of Materials
            </span>
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Components Count:</span>
                <span className="font-bold text-[#EA580C]">{objects.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Linear Runs Count:</span>
                <span className="font-bold text-[#2563EB]">{routes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Scale Readiness:</span>
                <span className="font-bold text-slate-700">
                  {scaleRatioValue !== null ? 'Calibrated' : 'Unverified (G3)'}
                </span>
              </div>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="space-y-2 pt-2">
            {onExportCsv && (
              <button
                type="button"
                onClick={onExportCsv}
                disabled={isExporting}
                className="btn-secondary w-full text-xs h-9 justify-center"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Download Takeoff CSV</span>
              </button>
            )}

            {onExportJson && (
              <button
                type="button"
                onClick={onExportJson}
                disabled={isExporting}
                className="btn-secondary w-full text-xs h-9 justify-center"
              >
                <Download className="w-3.5 h-3.5 text-sky-600" />
                <span>Download Public JSON</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 italic">
            Exports strictly adhere to the 5-field schema: object_type, location_or_path, confidence, length, and sheet_id.
          </p>
        </div>
      )}
    </aside>
  );
};
