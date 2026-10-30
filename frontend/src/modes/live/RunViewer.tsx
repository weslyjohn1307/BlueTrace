import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  FileDown,
  Clock,
  ShieldAlert,
  MapPin,
  List,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { WorkspaceShell } from '../../app/WorkspaceShell';
import { SheetNavigation } from './SheetNavigation';
import { DrawingViewer } from './DrawingViewer';
import { LayerControls, type FilterState } from './LayerControls';
import { ResultTable, type UnifiedResultItem } from './ResultTable';
import { ResultInspector } from './ResultInspector';
import { ReviewPanel } from './ReviewPanel';
import { ScopeReadinessBanner } from './ScopeReadinessBanner';
import { TakeoffSummary } from './TakeoffSummary';
import { ExportPanel } from './ExportPanel';
import { apiClient } from '../../api/client';
import type {
  RunSummaryItem,
  SheetItem,
  ViewDetailResponse,
  HealthResponse,
  VersionResponse,
  RouteItem,
  ObjectItem,
  PackageSummaryResponse,
  ReviewEventResponse,
  ReviewedStatus,
} from '../../api/contracts';
import type { ConnectionState } from '../../components/ConnectionStatus';

export const RunViewer: React.FC = () => {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Backend connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');
  const [backendVersion, setBackendVersion] = useState<string>('v1');
  const [errorMessage, setErrorMessage] = useState<string>();

  // Data states
  const [run, setRun] = useState<RunSummaryItem | null>(null);
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [views, setViews] = useState<ViewDetailResponse[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<SheetItem | null>(null);
  const [selectedView, setSelectedView] = useState<ViewDetailResponse | null>(null);

  // Extraction results state
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [objects, setObjects] = useState<ObjectItem[]>([]);
  const [packageSummary, setPackageSummary] = useState<PackageSummaryResponse | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Selection state
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [selectedResultType, setSelectedResultType] = useState<'route' | 'object' | null>(null);

  // Review state revision tracking and summary refresh synchronization
  const [reviewRevision, setReviewRevision] = useState(0);
  const summaryAbortRef = useRef<AbortController | null>(null);
  const summaryReqSeqRef = useRef(0);

  // Layer & filter controls state
  const [showRoutes, setShowRoutes] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [showReviewMarks, setShowReviewMarks] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    continuity: 'ALL',
    representation: 'ALL',
    reviewStatus: 'ALL',
  });

  // Active Viewport Mode (Canvas, Quantities Ledger Table, or Takeoff & Coverage Summary)
  const [activeTab, setActiveTab] = useState<'canvas' | 'table' | 'summary'>('canvas');

  // Loading & error states
  const [isLoadingRun, setIsLoadingRun] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const health: HealthResponse = await apiClient.getHealth();
      const version: VersionResponse = await apiClient.getVersion();
      setConnectionState(health.status === 'ok' ? 'connected' : 'unavailable');
      setBackendVersion(version.api_version);
      setErrorMessage(undefined);
    } catch (err) {
      setConnectionState('unavailable');
      setErrorMessage(err instanceof Error ? err.message : 'Backend unreachable');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    return () => {
      if (summaryAbortRef.current) {
        summaryAbortRef.current.abort();
      }
    };
  }, [checkHealth]);

  // Load run and sheets
  useEffect(() => {
    if (!projectId || !runId) {
      setLoadError('Project ID and Run ID are required');
      setIsLoadingRun(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoadingRun(true);
    setLoadError(null);

    Promise.all([
      apiClient.getRun(projectId, runId, controller.signal),
      apiClient.listSheets(projectId, runId, controller.signal),
    ])
      .then(async ([runData, sheetsData]) => {
        if (!isMounted) return;
        setRun(runData);
        setSheets(sheetsData.items);

        // If a view was specified in URL query params (?view=VIEW-...)
        const viewQuery = searchParams.get('view');
        let initialView: ViewDetailResponse | null = null;

        if (viewQuery) {
          try {
            initialView = await apiClient.getView(projectId, runId, viewQuery, controller.signal);
          } catch {
            // view query invalid or not found; fallback safely
          }
        }

        // Determine initial sheet
        let targetSheet: SheetItem | null = null;
        if (initialView?.sheet_id) {
          targetSheet = sheetsData.items.find((s) => s.sheet_id === initialView?.sheet_id) || null;
        } else if (initialView?.page_id) {
          targetSheet = sheetsData.items.find((s) => s.page_id === initialView?.page_id) || null;
        }

        if (!targetSheet && sheetsData.items.length > 0) {
          targetSheet = sheetsData.items[0];
        }

        setSelectedSheet(targetSheet);

        // If view wasn't explicitly loaded but sheet has views, try to load view
        if (!initialView && targetSheet) {
          try {
            const probe = await apiClient.getRoutes(
              projectId,
              runId,
              { sheet_id: targetSheet.sheet_id, limit: 1 },
              controller.signal
            );
            let viewId = probe.items[0]?.view_id;
            if (!viewId) {
              const objProbe = await apiClient.getObjects(
                projectId,
                runId,
                { sheet_id: targetSheet.sheet_id, limit: 1 },
                controller.signal
              );
              viewId = objProbe.items[0]?.view_id;
            }
            if (viewId) {
              initialView = await apiClient.getView(
                projectId,
                runId,
                viewId,
                controller.signal
              );
            }
          } catch {
            // ignore probe error
          }

          if (!initialView) {
            try {
              const candidateViewId = `VIEW-${targetSheet.page_id.replace('PAGE-DOC-', '')}`;
              const v = await apiClient.getView(projectId, runId, candidateViewId, controller.signal);
              initialView = v;
            } catch {
              initialView = {
                view_id: `VIEW-${targetSheet.page_id}`,
                run_id: runId,
                project_id: projectId,
                page_id: targetSheet.page_id,
                sheet_id: targetSheet.sheet_id,
                coordinate_space: 'PDF_PAGE_USER_SPACE',
                role: 'UNIFIED_PAGE',
              };
            }
          }
        }

        setSelectedView(initialView);
        if (initialView) {
          setViews([initialView]);
        }
        setIsLoadingRun(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setIsLoadingRun(false);
        setLoadError(
          err instanceof Error
            ? err.message
            : `Failed to load run '${runId}' for project '${projectId}'`
        );
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId, runId, searchParams]);

  // Load results (routes, objects, summary) whenever selectedView changes
  useEffect(() => {
    if (!projectId || !runId || !selectedView?.view_id) {
      setRoutes([]);
      setObjects([]);
      setPackageSummary(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoadingResults(true);

    Promise.all([
      apiClient.getRoutes(
        projectId,
        runId,
        { view_id: selectedView.view_id, limit: 1000 },
        controller.signal
      ),
      apiClient.getObjects(
        projectId,
        runId,
        { view_id: selectedView.view_id, limit: 1000 },
        controller.signal
      ),
      apiClient.getRunSummary(projectId, runId, controller.signal),
    ])
      .then(([routesRes, objectsRes, summaryRes]) => {
        if (!isMounted) return;
        setRoutes(routesRes.items);
        setObjects(objectsRes.items);
        setPackageSummary(summaryRes);
        setIsLoadingResults(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoadingResults(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId, runId, selectedView?.view_id]);

  // Sync selected target from URL param if present
  useEffect(() => {
    const targetQuery = searchParams.get('target');
    if (!targetQuery) return;
    if (routes.some((r) => r.route_id === targetQuery)) {
      setSelectedResultId(targetQuery);
      setSelectedResultType('route');
    } else if (objects.some((o) => o.object_id === targetQuery)) {
      setSelectedResultId(targetQuery);
      setSelectedResultType('object');
    }
  }, [searchParams, routes, objects]);

  // Handle sheet selection
  const handleSelectSheet = useCallback(
    async (sheet: SheetItem) => {
      setSelectedSheet(sheet);
      setSelectedResultId(null);
      setSelectedResultType(null);

      if (projectId && runId) {
        try {
          let v: ViewDetailResponse | null = null;
          try {
            const probe = await apiClient.getRoutes(projectId, runId, {
              sheet_id: sheet.sheet_id,
              limit: 1,
            });
            let viewId = probe.items[0]?.view_id;
            if (!viewId) {
              const objProbe = await apiClient.getObjects(projectId, runId, {
                sheet_id: sheet.sheet_id,
                limit: 1,
              });
              viewId = objProbe.items[0]?.view_id;
            }
            if (viewId) {
              v = await apiClient.getView(projectId, runId, viewId);
            }
          } catch {
            // ignore
          }

          if (!v) {
            const candidateViewId = `VIEW-${sheet.page_id.replace('PAGE-DOC-', '')}`;
            v = await apiClient.getView(projectId, runId, candidateViewId);
          }

          setSelectedView(v);
          setSearchParams({ view: v.view_id }, { replace: true });
        } catch {
          const fallbackView: ViewDetailResponse = {
            view_id: `VIEW-${sheet.page_id}`,
            run_id: runId,
            project_id: projectId,
            page_id: sheet.page_id,
            sheet_id: sheet.sheet_id,
            coordinate_space: 'PDF_PAGE_USER_SPACE',
            role: 'UNIFIED_PAGE',
          };
          setSelectedView(fallbackView);
          setSearchParams({ view: fallbackView.view_id }, { replace: true });
        }
      }
    },
    [projectId, runId, setSearchParams]
  );

  // Synchronized Selection Handler
  const handleSelectResult = useCallback(
    (id: string, type: 'route' | 'object') => {
      setSelectedResultId(id);
      setSelectedResultType(type);

      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('target', id);
      if (selectedView?.view_id) {
        nextParams.set('view', selectedView.view_id);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, selectedView, setSearchParams]
  );

  // Append-only Review submission handler: updates local reviewed projection and synchronizes authoritative backend summary
  const handleReviewSubmitted = useCallback(
    async (event: ReviewEventResponse) => {
      const resolveNewStatus = (prevStatus?: string): ReviewedStatus => {
        if (event.action === 'ACCEPT') return 'ACCEPTED';
        if (event.action === 'REJECT') return 'REJECTED';
        if (event.action === 'NEEDS_REVIEW') return 'NEEDS_REVIEW';
        return (prevStatus as ReviewedStatus) || 'PENDING';
      };

      if (event.target_type === 'ROUTE') {
        setRoutes((prev) =>
          prev.map((r) => {
            if (r.route_id === event.target_id) {
              const currentProj = r.review_projection;
              return {
                ...r,
                review_projection: {
                  reviewed_status: resolveNewStatus(currentProj?.reviewed_status),
                  last_action: event.action,
                  last_action_at: event.created_at,
                  event_count: (currentProj?.event_count || 0) + 1,
                  has_notes: currentProj?.has_notes || Boolean(event.comment),
                },
              };
            }
            return r;
          })
        );
      } else if (event.target_type === 'OBJECT') {
        setObjects((prev) =>
          prev.map((o) => {
            if (o.object_id === event.target_id) {
              const currentProj = o.review_projection;
              return {
                ...o,
                review_projection: {
                  reviewed_status: resolveNewStatus(currentProj?.reviewed_status),
                  last_action: event.action,
                  last_action_at: event.created_at,
                  event_count: (currentProj?.event_count || 0) + 1,
                  has_notes: currentProj?.has_notes || Boolean(event.comment),
                },
              };
            }
            return o;
          })
        );
      }

      // Increment review revision to notify downstream consumers (e.g., ExportPanel)
      setReviewRevision((rev) => rev + 1);

      // Immediately fetch authoritative backend run summary to synchronize takeoff & coverage metrics
      if (projectId && runId) {
        if (summaryAbortRef.current) {
          summaryAbortRef.current.abort();
        }
        const controller = new AbortController();
        summaryAbortRef.current = controller;
        const currentSeq = ++summaryReqSeqRef.current;

        try {
          const freshSummary = await apiClient.getRunSummary(projectId, runId, controller.signal);
          if (currentSeq === summaryReqSeqRef.current) {
            setPackageSummary(freshSummary);
          }
        } catch {
          if (controller.signal.aborted) {
            // Superseded by newer summary request
            return;
          }
          // On network/other failure, do not falsely mutate summary
        }
      }
    },
    [projectId, runId]
  );

  // Filter application
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (filters.continuity !== 'ALL' && r.continuity_status !== filters.continuity) {
        return false;
      }
      if (
        filters.representation !== 'ALL' &&
        r.representation_state !== filters.representation
      ) {
        return false;
      }
      if (filters.reviewStatus !== 'ALL') {
        const rev = r.review_projection?.reviewed_status || 'PENDING';
        if (rev !== filters.reviewStatus) return false;
      }
      return true;
    });
  }, [routes, filters]);

  const filteredObjects = useMemo(() => {
    return objects.filter((o) => {
      if (filters.reviewStatus !== 'ALL') {
        const rev = o.review_projection?.reviewed_status || 'PENDING';
        if (rev !== filters.reviewStatus) return false;
      }
      return true;
    });
  }, [objects, filters]);

  // Combined Unified Items for Result Table
  const unifiedTableItems: UnifiedResultItem[] = useMemo(() => {
    const list: UnifiedResultItem[] = [];
    if (showRoutes) {
      filteredRoutes.forEach((r) => list.push({ kind: 'route', data: r }));
    }
    if (showObjects) {
      filteredObjects.forEach((o) => list.push({ kind: 'object', data: o }));
    }
    return list;
  }, [showRoutes, showObjects, filteredRoutes, filteredObjects]);

  // Check if currently selected item is hidden by the active filter
  const isSelectedItemHidden = useMemo(() => {
    if (!selectedResultId) return false;
    return !unifiedTableItems.some(
      (it) => (it.kind === 'route' ? it.data.route_id : it.data.object_id) === selectedResultId
    );
  }, [selectedResultId, unifiedTableItems]);

  // Selected item lookup
  const selectedRouteItem = useMemo(() => {
    if (!selectedResultId || selectedResultType !== 'route') return null;
    return routes.find((r) => r.route_id === selectedResultId) || null;
  }, [selectedResultId, selectedResultType, routes]);

  const selectedObjectItem = useMemo(() => {
    if (!selectedResultId || selectedResultType !== 'object') return null;
    return objects.find((o) => o.object_id === selectedResultId) || null;
  }, [selectedResultId, selectedResultType, objects]);

  // Safe Error View for Invalid IDs
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-rose-600" aria-hidden="true" />
        </div>
        <h2 className="font-heading text-xl font-bold text-slate-900 mb-2">
          Unable to Open Run
        </h2>
        <p className="text-xs text-rose-700 max-w-md mb-6 leading-relaxed bg-rose-50/50 p-3 rounded border border-rose-200 font-mono">
          {loadError}
        </p>
        <div className="flex items-center space-x-3">
          <Link
            to="/live"
            className="px-4 py-2 bg-[#006D84] text-white rounded text-xs font-semibold hover:bg-[#005769] transition-colors"
          >
            Return to Project List
          </Link>
        </div>
      </div>
    );
  }

  // Loading view
  if (isLoadingRun) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-[#0F172A]">
        <Clock className="w-10 h-10 text-[#006D84] animate-spin mb-3" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold text-slate-800">
          Loading Run Extraction Data...
        </h3>
        <p className="text-xs text-slate-500 font-mono mt-1">
          {projectId} / {runId}
        </p>
      </div>
    );
  }

  // Left Project Navigation: shows back link and run info
  const projectNavContent = (
    <div className="p-3 space-y-4">
      <div className="pb-3 border-b border-slate-200">
        <button
          type="button"
          onClick={() => navigate('/live')}
          className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors focus:outline-none"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Projects</span>
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="text-slate-500 font-medium">Active Project:</div>
          <div className="font-mono font-bold text-slate-900 break-all">{projectId}</div>

          <div className="text-slate-500 font-medium pt-1">Immutable Run:</div>
          <div className="font-mono font-bold text-slate-900 break-all">{runId}</div>

          {run?.manifest_sha256 && (
            <div className="pt-1">
              <span className="text-[10px] text-slate-400 font-mono">
                SHA: {run.manifest_sha256.slice(0, 16)}...
              </span>
            </div>
          )}
        </div>

        {/* Quantities Extraction Status */}
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-medium">
            <span>Extraction Quantities:</span>
            {isLoadingResults ? (
              <Clock className="w-3 h-3 text-[#006D84] animate-spin" aria-hidden="true" />
            ) : (
              <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                PROMOTED
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
            <div className="bg-slate-50 p-2 rounded border border-slate-100">
              <span className="text-slate-400 text-[10px] block">Routes</span>
              <span className="font-bold text-slate-900">{routes.length}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded border border-slate-100">
              <span className="text-slate-400 text-[10px] block">Objects</span>
              <span className="font-bold text-slate-900">{objects.length}</span>
            </div>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <span>View Takeoff & Coverage</span>
            </button>
          </div>
        </div>

        {/* Source PDF Stored Link */}
        {selectedSheet?.source_id && projectId && (
          <div className="pt-1">
            <a
              href={apiClient.getSourcePdfUrl(projectId, selectedSheet.source_id)}
              download
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs font-medium text-slate-700 shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <span>Download Source PDF</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );

  // Sheet Navigation
  const sheetNavContent = (
    <SheetNavigation
      projectId={projectId!}
      runId={runId!}
      sheets={sheets}
      selectedSheetId={selectedSheet?.sheet_id || null}
      selectedViewId={selectedView?.view_id || null}
      views={views}
      onSelectSheet={handleSelectSheet}
      isLoading={false}
      error={null}
    />
  );

  // Viewport Content: Navigation Bar + Drawing Canvas, Result Table, or Takeoff Summary
  const viewportContent = (
    <div className="flex flex-col w-full h-full relative overflow-hidden">
      {/* 0. Scope & Readiness Banner */}
      <ScopeReadinessBanner
        runId={runId!}
        sourceId={selectedSheet?.source_id}
        g3Status={packageSummary?.g3_status}
        totalRoutes={packageSummary?.total_routes ?? routes.length}
        measuredRoutes={packageSummary?.measured_route_count ?? 0}
      />

      {/* 1. Viewport Mode Switcher & Layer Controls Toolbar */}
      <div className="flex flex-col bg-white border-b border-slate-200 shrink-0 z-20">
        <div className="px-4 py-1.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-1 bg-slate-200/80 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('canvas')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'canvas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <span>Drawing Overlay</span>
              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 font-mono text-[10px] rounded-full">
                {routes.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <span>Quantities Ledger</span>
              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 font-mono text-[10px] rounded-full">
                {unifiedTableItems.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <span>Takeoff & Coverage</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-2">
            <span>View: {selectedView?.view_id || 'None'}</span>
            <span>•</span>
            <span className="text-amber-700 font-medium">
              {packageSummary?.g3_status === 'G3_PASSED'
                ? 'Scale: Verified'
                : 'Scale: Unverified'}
            </span>
          </div>
        </div>

        {/* Layer Controls bar (shown on Canvas and Table views) */}
        {activeTab !== 'summary' && (
          <LayerControls
            totalRoutes={routes.length}
            totalObjects={objects.length}
            visibleCount={unifiedTableItems.length}
            showRoutes={showRoutes}
            showObjects={showObjects}
            showReviewMarks={showReviewMarks}
            filters={filters}
            onToggleRoutes={() => setShowRoutes((p) => !p)}
            onToggleObjects={() => setShowObjects((p) => !p)}
            onToggleReviewMarks={() => setShowReviewMarks((p) => !p)}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            onClearFilters={() =>
              setFilters({ continuity: 'ALL', representation: 'ALL', reviewStatus: 'ALL' })
            }
            selectedItemHiddenByFilter={isSelectedItemHidden}
          />
        )}
      </div>

      {/* 2. Main Viewport Body */}
      <div className="flex-1 w-full h-full relative overflow-hidden">
        {activeTab === 'canvas' ? (
          <DrawingViewer
            projectId={projectId!}
            runId={runId!}
            selectedSheet={selectedSheet}
            selectedView={selectedView}
            routes={filteredRoutes}
            objects={filteredObjects}
            selectedResultId={selectedResultId}
            onSelectResult={handleSelectResult}
            showRoutes={showRoutes}
            showObjects={showObjects}
            showReviewMarks={showReviewMarks}
          />
        ) : activeTab === 'table' ? (
          <div className="w-full h-full p-4 overflow-y-auto bg-slate-100/50">
            <ResultTable
              items={unifiedTableItems}
              selectedId={selectedResultId}
              onSelect={handleSelectResult}
              pageSize={25}
            />
          </div>
        ) : (
          <div className="w-full h-full overflow-y-auto bg-slate-50/50">
            <TakeoffSummary
              summary={packageSummary}
              isLoading={isLoadingResults}
              isDisconnected={connectionState === 'unavailable'}
              onRetry={checkHealth}
              activeFilters={filters}
              onSelectFilterGroup={(key, value) => {
                setFilters((prev) => ({ ...prev, [key]: value }));
              }}
              onClearFilters={() =>
                setFilters({ continuity: 'ALL', representation: 'ALL', reviewStatus: 'ALL' })
              }
            />
          </div>
        )}
      </div>
    </div>
  );

  // Inspector panel: Region 5 Result Inspector (or Sheet Metadata when nothing selected)
  const inspectorContent = (
    <div className="p-4">
      <ResultInspector
        selectedRoute={selectedRouteItem}
        selectedObject={selectedObjectItem}
        selectedSheet={selectedSheet}
        selectedView={selectedView}
        totalRoutes={routes.length}
        totalObjects={objects.length}
      />
    </div>
  );

  // Review panel: Region 6 Append-only Human Review & Audit Trail
  const reviewContent = (
    <div className="p-4">
      <ReviewPanel
        projectId={projectId!}
        runId={runId!}
        targetId={selectedResultId}
        targetType={
          selectedResultType === 'route'
            ? 'ROUTE'
            : selectedResultType === 'object'
              ? 'OBJECT'
              : null
        }
        onReviewSubmitted={handleReviewSubmitted}
      />
    </div>
  );

  return (
    <WorkspaceShell
      mode="live"
      connectionState={connectionState}
      backendVersion={backendVersion}
      errorMessage={errorMessage}
      onRetryConnection={checkHealth}
      projectNavContent={projectNavContent}
      sheetNavContent={sheetNavContent}
      viewportContent={viewportContent}
      inspectorContent={inspectorContent}
      reviewContent={reviewContent}
      copilotContent={
        <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-500 space-y-1">
          <div className="flex items-center space-x-1.5 font-semibold text-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
            <span>Copilot Unavailable</span>
          </div>
          <p className="text-slate-600 text-[11px]">
            Ask the drawing is introduced after the live review workflow is verified.
          </p>
        </div>
      }
      exportContent={
        <ExportPanel projectId={projectId!} runId={runId!} reviewRevision={reviewRevision} />
      }
    />
  );
};
