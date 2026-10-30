import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router';
import {
  FileUp,
  FileText,
  AlertTriangle,
  Flame,
  Fan,
  Grid,
  Route,
} from 'lucide-react';
import { GlobalTopNav } from '../app/GlobalTopNav';
import { DrawingCanvas, type CalibrationRulerState } from './components/DrawingCanvas';
import { ResultsPanel } from './components/ResultsPanel';
import { ContextualInspector } from './components/ContextualInspector';
import { AnalysisSetupView, type CapabilitiesConfig, type ScaleConfig, type LegendConfig } from './components/AnalysisSetupView';
import { ProcessingProgressView } from './components/ProcessingProgressView';
import { ScaleCalibrationModal } from './components/ScaleCalibrationModal';
import { AskTheDrawingDrawer } from './components/AskTheDrawingDrawer';
import { useAnalysisWorkflow } from './hooks/useAnalysisWorkflow';
import { apiClient } from '../api/client';
import type {
  SheetItem,
  RouteItem,
  ObjectItem,
  ReviewedStatus,
  ComponentReference,
} from '../api/contracts';
import {
  downloadCsv,
  downloadJson,
  generateTakeoffCsv,
  generateTakeoffJson,
} from './utils/exportHelpers';
import type { Point } from '../utils/transform';

export interface WorkspaceAppProps {
  initialProjectId?: string | null;
  initialRunId?: string | null;
}

const PRESET_SCALES = [
  { label: '1/8" = 1\'-0" (1:96)', ptToM: (96 * 0.0254) / 72, desc: 'Standard Floor Plan' },
  { label: '1/4" = 1\'-0" (1:48)', ptToM: (48 * 0.0254) / 72, desc: 'Detailed Mechanical' },
  { label: '3/8" = 1\'-0" (1:32)', ptToM: (32 * 0.0254) / 72, desc: 'Equipment Room' },
  { label: '1/2" = 1\'-0" (1:24)', ptToM: (24 * 0.0254) / 72, desc: 'Enlarged Detail' },
  { label: '1:100 Metric', ptToM: (100 * 0.0254) / 72, desc: 'Metric General Plan' },
  { label: '1:50 Metric', ptToM: (50 * 0.0254) / 72, desc: 'Metric Detailed Plan' },
];

export const WorkspaceApp: React.FC<WorkspaceAppProps> = ({
  initialProjectId = null,
  initialRunId = null,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeParams = useParams<{ projectId?: string; runId?: string }>();
  const navigate = useNavigate();

  // Active Project and Run identifiers (resolve from props, route params, or query params)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialProjectId ||
      routeParams.projectId ||
      searchParams.get('project') ||
      searchParams.get('project_id') ||
      searchParams.get('projectId') ||
      null
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialRunId ||
      routeParams.runId ||
      searchParams.get('run') ||
      searchParams.get('run_id') ||
      searchParams.get('runId') ||
      null
  );

  // Synchronize state if URL query params or route params change
  useEffect(() => {
    const p =
      initialProjectId ||
      routeParams.projectId ||
      searchParams.get('project') ||
      searchParams.get('project_id') ||
      searchParams.get('projectId');
    const r =
      initialRunId ||
      routeParams.runId ||
      searchParams.get('run') ||
      searchParams.get('run_id') ||
      searchParams.get('runId');
    if (p && p !== activeProjectId) setActiveProjectId(p);
    if (r && r !== activeRunId) setActiveRunId(r);
  }, [initialProjectId, initialRunId, routeParams, searchParams, activeProjectId, activeRunId]);

  // Active sheets
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<SheetItem | null>(null);
  const [_isLoadingSheets, setIsLoadingSheets] = useState(false);

  // Extraction results
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [objects, setObjects] = useState<ObjectItem[]>([]);

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'route' | 'object' | null>(null);

  // Scale Calibration state
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [scaleStatus, setScaleStatus] = useState<string>('SCALE_UNREADABLE');
  const [scaleRatioLabel, setScaleRatioLabel] = useState<string | null>(null);
  const [scaleRatioValue, setScaleRatioValue] = useState<number | null>(null);
  const [rulerState, setRulerState] = useState<CalibrationRulerState>({
    active: false,
    pointA: null,
    pointB: null,
  });

  // Copilot Drawer state
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Export progress
  const [isExporting, setIsExporting] = useState(false);

  // Drag over state for dropzone
  const [isDragOver, setIsDragOver] = useState(false);

  // Analysis Setup State
  const [selectedPages, setSelectedPages] = useState<number[] | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesConfig>({
    fireDampers: true,
    wshp: true,
    linearGrilles: true,
    ductPipeRoutes: true,
  });
  const [scaleConfig, setScaleConfig] = useState<ScaleConfig>({
    mode: 'auto',
    presetLabel: '1/8" = 1\'-0" (1:96)',
  });
  const [legendConfig, setLegendConfig] = useState<LegendConfig>({
    mode: 'none',
    pageNumber: 1,
    separateFile: null,
  });

  // Synchronize URL query params
  const updateUrlParams = useCallback(
    (projectId: string | null, runId: string | null, sheetId?: string | null) => {
      const next = new URLSearchParams();
      if (projectId) next.set('project', projectId);
      if (runId) next.set('run', runId);
      if (sheetId) next.set('sheet', sheetId);
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  // Automated transition hook upon workflow completion
  const handleWorkflowComplete = useCallback(
    (newProjectId: string, newRunId: string) => {
      setActiveProjectId(newProjectId);
      setActiveRunId(newRunId);
      updateUrlParams(newProjectId, newRunId);

      // If user selected manual scale preset during setup, initialize it immediately
      if (scaleConfig.mode === 'manual' && scaleConfig.presetLabel) {
        const preset = PRESET_SCALES.find((p) => p.label === scaleConfig.presetLabel);
        if (preset) {
          setScaleStatus('MANUALLY_CONFIRMED');
          setScaleRatioLabel(preset.label);
          setScaleRatioValue(preset.ptToM);
        }
      }
    },
    [updateUrlParams, scaleConfig]
  );

  const { state: workflowState, selectFile, startAnalysis, resetWorkflow } =
    useAnalysisWorkflow(handleWorkflowComplete);

  // Start analysis triggered from Stage 2 Setup
  const handleSetupStartAnalysis = useCallback(() => {
    let refPayload: ComponentReference | undefined = undefined;
    if (legendConfig.mode === 'same_pdf') {
      refPayload = {
        reference_mode: 'same_pdf',
        reference_source_id: workflowState.sourceId,
        reference_pages: [legendConfig.pageNumber],
      };
    }

    // Pre-apply manual scale preset if chosen
    if (scaleConfig.mode === 'manual' && scaleConfig.presetLabel) {
      const preset = PRESET_SCALES.find((p) => p.label === scaleConfig.presetLabel);
      if (preset) {
        setScaleStatus('MANUALLY_CONFIRMED');
        setScaleRatioLabel(preset.label);
        setScaleRatioValue(preset.ptToM);
      }
    }

    startAnalysis(refPayload, selectedPages, capabilities);
  }, [legendConfig, workflowState.sourceId, scaleConfig, startAnalysis, selectedPages, capabilities]);

  // Reset all workspace state
  const handleFullReset = useCallback(() => {
    resetWorkflow();
    setActiveProjectId(null);
    setActiveRunId(null);
    setSheets([]);
    setSelectedSheet(null);
    setRoutes([]);
    setObjects([]);
    setSelectedId(null);
    setSelectedType(null);
    setScaleStatus('SCALE_UNREADABLE');
    setScaleRatioLabel(null);
    setScaleRatioValue(null);
    setSelectedPages(null);
    setLegendConfig({ mode: 'none', pageNumber: 1, separateFile: null });
    setSearchParams({}, { replace: true });
    navigate('/');
  }, [resetWorkflow, setSearchParams, navigate]);

  // Load sheets when activeProjectId and activeRunId change
  useEffect(() => {
    if (!activeProjectId || !activeRunId) {
      setSheets([]);
      setSelectedSheet(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoadingSheets(true);

    apiClient
      .listSheets(activeProjectId, activeRunId, controller.signal)
      .then((res) => {
        if (!isMounted) return;
        setSheets(res.items);
        setIsLoadingSheets(false);

        // Auto-select page 1 or sheet from URL param
        const targetSheetId = searchParams.get('sheet');
        const initial =
          (targetSheetId && res.items.find((s) => s.sheet_id === targetSheetId)) ||
          res.items[0] ||
          null;

        if (initial) {
          setSelectedSheet(initial);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoadingSheets(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeProjectId, activeRunId, searchParams]);

  // Load Results when selectedSheet changes
  useEffect(() => {
    if (!activeProjectId || !activeRunId || !selectedSheet) {
      setRoutes([]);
      setObjects([]);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    // Load Routes & Objects in parallel
    Promise.all([
      apiClient.getRoutes(
        activeProjectId,
        activeRunId,
        { sheet_id: selectedSheet.sheet_id, limit: 1000 },
        controller.signal
      ),
      apiClient.getObjects(
        activeProjectId,
        activeRunId,
        { sheet_id: selectedSheet.sheet_id, limit: 1000 },
        controller.signal
      ),
    ])
      .then(([routesRes, objectsRes]) => {
        if (!isMounted) return;
        setRoutes(routesRes.items);
        setObjects(objectsRes.items);
      })
      .catch(() => {
        // ignore load errors
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeProjectId, activeRunId, selectedSheet]);

  // Handle Sheet Selection
  const handleSelectSheet = (sheet: SheetItem) => {
    setSelectedSheet(sheet);
    setSelectedId(null);
    setSelectedType(null);
    updateUrlParams(activeProjectId, activeRunId, sheet.sheet_id);
  };

  // Bidirectional Selection
  const handleSelectResult = (id: string, type: 'route' | 'object') => {
    setSelectedId(id);
    setSelectedType(type);
  };

  const handleClearSelection = () => {
    setSelectedId(null);
    setSelectedType(null);
  };

  // Human Review Submission
  const handleReview = useCallback(
    (id: string, type: 'route' | 'object', status: ReviewedStatus, notes?: string) => {
      if (type === 'object') {
        setObjects((prev) =>
          prev.map((o) =>
            o.object_id === id
              ? {
                  ...o,
                  review_projection: {
                    reviewed_status: status,
                    last_action: status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT',
                    last_action_at: new Date().toISOString(),
                    event_count: (o.review_projection?.event_count || 0) + 1,
                    has_notes: Boolean(notes),
                  },
                }
              : o
          )
        );
      } else {
        setRoutes((prev) =>
          prev.map((r) =>
            r.route_id === id
              ? {
                  ...r,
                  review_projection: {
                    reviewed_status: status,
                    last_action: status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT',
                    last_action_at: new Date().toISOString(),
                    event_count: (r.review_projection?.event_count || 0) + 1,
                    has_notes: Boolean(notes),
                  },
                }
              : r
          )
        );
      }
    },
    []
  );

  const handleBatchReviewObjects = useCallback((status: ReviewedStatus) => {
    setObjects((prev) =>
      prev.map((o) => ({
        ...o,
        review_projection: {
          reviewed_status: status,
          last_action: status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT',
          last_action_at: new Date().toISOString(),
          event_count: (o.review_projection?.event_count || 0) + 1,
          has_notes: false,
        },
      }))
    );
  }, []);

  // Scale Calibration Handlers
  const handleApplyCalibration = (label: string, ptToMetersRatio: number) => {
    setScaleStatus('MANUALLY_CONFIRMED');
    setScaleRatioLabel(label);
    setScaleRatioValue(ptToMetersRatio);
    setRulerState({ active: false, pointA: null, pointB: null });
  };

  const handleStartRulerMode = () => {
    setRulerState({ active: true, pointA: null, pointB: null });
  };

  const handleRulerPointPlaced = (point: Point) => {
    if (!rulerState.pointA) {
      setRulerState((prev) => ({ ...prev, pointA: point }));
    } else if (!rulerState.pointB) {
      setRulerState((prev) => ({ ...prev, pointB: point }));
      setIsCalibrationOpen(true);
    }
  };

  // Export: try backend structured bundle first, fall back to client-side
  const handleExportCsv = useCallback(async () => {
    if (!activeProjectId || !activeRunId) return;
    setIsExporting(true);
    try {
      const exportRecord = await apiClient.createExport(activeProjectId, activeRunId);
      const blob = await apiClient.downloadExport(activeProjectId, activeRunId, exportRecord.export_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mep-takeoff-${activeRunId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      try {
        const csv = generateTakeoffCsv(
          workflowState.fileMeta?.name || 'MEP_Takeoff',
          objects,
          routes,
          sheets,
          scaleRatioLabel,
          scaleRatioValue
        );
        downloadCsv(`mep-takeoff-${activeRunId}.csv`, csv);
      } catch {
        // ignore secondary failure
      }
    } finally {
      setIsExporting(false);
    }
  }, [activeProjectId, activeRunId, objects, routes, sheets, scaleRatioLabel, scaleRatioValue, workflowState.fileMeta]);

  const handleExportJson = useCallback(async () => {
    if (!activeProjectId || !activeRunId) return;
    setIsExporting(true);
    try {
      const exportRecord = await apiClient.createExport(activeProjectId, activeRunId);
      const blob = await apiClient.downloadExport(activeProjectId, activeRunId, exportRecord.export_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mep-takeoff-${activeRunId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      try {
        const json = generateTakeoffJson(
          activeRunId,
          workflowState.fileMeta?.name || 'MEP_Takeoff',
          objects,
          routes,
          scaleRatioLabel,
          scaleRatioValue
        );
        downloadJson(`mep-takeoff-${activeRunId}.json`, json);
      } catch {
        // ignore secondary failure
      }
    } finally {
      setIsExporting(false);
    }
  }, [activeProjectId, activeRunId, objects, routes, scaleRatioLabel, scaleRatioValue, workflowState.fileMeta]);

  // Drag-and-drop file handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      selectFile(file);
    }
  };

  // Sample drawing loader for quick judging demonstration
  const handleLoadSampleDrawing = async () => {
    try {
      const projectsRes = await apiClient.listProjects();
      for (const p of projectsRes.items) {
        if (p.drawing_count > 0) {
          const drawingsRes = await apiClient.listDrawings(p.project_id);
          const drawing = drawingsRes.items[0];
          if (drawing) {
            const pdfUrl = apiClient.getSourcePdfUrl(p.project_id, drawing.source_id);
            const res = await fetch(pdfUrl);
            if (res.ok) {
              const blob = await res.blob();
              const sampleFile = new File(
                [blob],
                drawing.filename || 'Architecture and Mechanical_IFC Set_Avexis_page_21.pdf',
                { type: 'application/pdf' }
              );
              selectFile(sampleFile);
              return;
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  };

  const hasActiveResults = Boolean(activeProjectId && activeRunId);
  const isProcessing = [
    'preparing',
    'uploading',
    'preflight',
    'processing',
    'persisting',
  ].includes(workflowState.stage);

  // Resolve selected item for the Contextual Inspector
  const selectedObject = useMemo(
    () => (selectedType === 'object' && selectedId ? objects.find((o) => o.object_id === selectedId) || null : null),
    [selectedType, selectedId, objects]
  );
  const selectedRoute = useMemo(
    () => (selectedType === 'route' && selectedId ? routes.find((r) => r.route_id === selectedId) || null : null),
    [selectedType, selectedId, routes]
  );

  return (
    <div
      className="flex flex-col h-screen w-screen bg-[#F8FAFC] text-[#0F172A] overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. Autodesk HIG Global Top App Bar (56px) */}
      <GlobalTopNav
        modelReady={workflowState.modelReady}
        onLoadSample={handleLoadSampleDrawing}
        onNewAnalysis={handleFullReset}
        onFileSelect={selectFile}
      />

      {/* 2. Main Workflow State Resolver */}
      {hasActiveResults ? (
        /* =========================================================================
           STAGE 4: RESULTS WORKSPACE (Dominant Hero Engineering Workstation)
           Left: Results & Navigation | Center: Large Drawing Canvas | Right: Contextual Inspector
           ========================================================================= */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Partial Results Warning Banner */}
          {workflowState.isPartial && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center space-x-2 text-xs text-amber-800 shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <span className="font-semibold">Partial results:</span>{' '}
                {workflowState.humanMessage} — Some extraction steps may be incomplete.
              </span>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* LEFT PANEL: Results & Takeoff Navigation (Autodesk HIG Workstation Nav) */}
            <ResultsPanel
              sheet={selectedSheet}
              sheets={sheets}
              onSelectSheet={handleSelectSheet}
              routes={routes}
              objects={objects}
              selectedId={selectedId}
              selectedType={selectedType}
              onSelect={handleSelectResult}
              onClearSelection={handleClearSelection}
              onReview={handleReview}
              onBatchReviewObjects={handleBatchReviewObjects}
              scaleStatus={scaleStatus}
              scaleRatioLabel={scaleRatioLabel}
              scaleRatioValue={scaleRatioValue}
              onOpenCalibration={() => setIsCalibrationOpen(true)}
              onOpenCopilot={() => setIsCopilotOpen(true)}
              modelReady={workflowState.modelReady}
              onExportCsv={handleExportCsv}
              onExportJson={handleExportJson}
              isExporting={isExporting}
              onApplyPresetScale={handleApplyCalibration}
            />

            {/* CENTER PANEL: Large Engineering Drawing Viewer (Hero, Dominant Canvas) */}
            <main
              id="drawing-viewport"
              aria-label="Engineering Drawing Viewport"
              className="flex-1 relative overflow-hidden bg-slate-900/95 flex flex-col"
            >
              <DrawingCanvas
                projectId={activeProjectId!}
                runId={activeRunId!}
                selectedSheet={selectedSheet}
                routes={routes}
                objects={objects}
                selectedId={selectedId}
                onSelect={handleSelectResult}
                scaleStatus={scaleStatus}
                scaleRatioLabel={scaleRatioLabel}
                onOpenCalibration={() => setIsCalibrationOpen(true)}
                rulerState={rulerState}
                onRulerPointPlaced={handleRulerPointPlaced}
              />
            </main>

            {/* RIGHT PANEL: Contextual Inspection (Details, Drawing-space vs Physical Length, Reviews) */}
            <ContextualInspector
              selectedObject={selectedObject}
              selectedRoute={selectedRoute}
              selectedSheet={selectedSheet}
              onClearSelection={handleClearSelection}
              onReview={handleReview}
              scaleStatus={scaleStatus}
              scaleRatioLabel={scaleRatioLabel}
              scaleRatioValue={scaleRatioValue}
              onOpenCalibration={() => setIsCalibrationOpen(true)}
              onOpenCopilot={() => setIsCopilotOpen(true)}
              allObjects={objects}
              allRoutes={routes}
            />
          </div>
        </div>
      ) : isProcessing ? (
        /* =========================================================================
           STAGE 3: PROCESSING PROGRESS VIEW (Monotonic Progress & Checklist)
           ========================================================================= */
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-100/70 p-6 overflow-y-auto">
          <ProcessingProgressView
            state={workflowState}
            onCancel={handleFullReset}
          />
        </div>
      ) : workflowState.stage === 'selected' ? (
        /* =========================================================================
           STAGE 2: ANALYSIS SETUP (Capabilities, Pages, Scale, Legend, Estimates)
           ========================================================================= */
        <div className="flex-1 overflow-y-auto bg-slate-100/60 p-6">
          <AnalysisSetupView
            fileName={workflowState.fileMeta?.name || 'Drawing.pdf'}
            fileSizeFormatted={workflowState.fileMeta?.sizeFormatted || '0 B'}
            pageCount={workflowState.pageCount || 1}
            selectedPages={selectedPages}
            onSelectedPagesChange={setSelectedPages}
            capabilities={capabilities}
            onCapabilitiesChange={setCapabilities}
            scaleConfig={scaleConfig}
            onScaleConfigChange={setScaleConfig}
            legendConfig={legendConfig}
            onLegendConfigChange={setLegendConfig}
            onBack={handleFullReset}
            onStartAnalysis={handleSetupStartAnalysis}
            isStarting={workflowState.isPreparingFile}
          />
        </div>
      ) : (
        /* =========================================================================
           STAGE 1: UPLOAD (Autodesk HIG Clean Drag-and-Drop Landing Zone)
           ========================================================================= */
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 select-none overflow-y-auto bg-[#F8FAFC]">
          {workflowState.stage === 'failed' && (
            <div className="max-w-2xl w-full mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold text-sm block">Analysis Inspection Failed</span>
                <span className="text-xs text-rose-700">{workflowState.errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={handleFullReset}
                className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            className={`max-w-3xl w-full rounded-2xl border-2 border-dashed p-10 md:p-14 text-center transition-all bg-white shadow-xs ${
              isDragOver
                ? 'border-[#006D84] bg-teal-50/40 scale-[1.005]'
                : 'border-slate-300 hover:border-slate-400'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#006D84]/10 text-[#006D84] mx-auto flex items-center justify-center mb-5 shadow-2xs">
              <FileUp className="w-8 h-8" />
            </div>

            <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900 mb-2 tracking-tight">
              MEP 2D Drawing Intelligence Workstation
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto mb-8 leading-relaxed">
              Upload Mechanical, Electrical, or Plumbing construction drawings in PDF format.
              The workstation extracts continuous routes, detects engineering symbols, and calculates verified quantities.
            </p>

            {/* CTAs: Select File & Load Sample */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <label className="btn-primary flex items-center space-x-2 px-6 py-3 text-sm cursor-pointer shadow-sm">
                <FileUp className="w-4 h-4" />
                <span>Select PDF Drawing Sheet</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) selectFile(f);
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleLoadSampleDrawing}
                className="btn-secondary flex items-center space-x-2 px-5 py-3 text-sm"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Load Sample Drawing (Avexis P.21)</span>
              </button>
            </div>

            {/* Architectural Feature Capability Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-slate-200/80 text-left">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 mb-1">
                  <Flame className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Fire Dampers</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  YOLOv11 neural detector for fire dampers and dampers.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 mb-1">
                  <Fan className="w-3.5 h-3.5 text-[#006D84]" />
                  <span>WSHP Units</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Structural contour vector extraction for mechanical units.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 mb-1">
                  <Grid className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>Linear Grilles</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Geometric morphology & aspect ratio distribution detection.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 mb-1">
                  <Route className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Duct & Pipe Routes</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Conservative hybrid collinear linework & topological graph.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scale Calibration Modal (2-Point Interactive Ruler or Manual Entry) */}
      <ScaleCalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        onApplyCalibration={handleApplyCalibration}
        rulerPoints={{ pointA: rulerState.pointA, pointB: rulerState.pointB }}
        onStartRulerMode={handleStartRulerMode}
      />

      {/* Non-Intrusive Copilot Drawer (Attached to Right Workstation Margin) */}
      {hasActiveResults && (
        <AskTheDrawingDrawer
          isOpen={isCopilotOpen}
          onClose={() => setIsCopilotOpen(false)}
          projectId={activeProjectId!}
          runId={activeRunId!}
          currentSheetId={selectedSheet?.sheet_id}
          sheetLabel={selectedSheet?.sheet_id}
          selectedResultId={selectedId}
          selectedResultType={selectedType}
          onClearSelection={handleClearSelection}
          isScaleCalibrated={scaleRatioLabel !== null}
          scaleRatioValue={scaleRatioLabel}
          onOpenScaleCalibration={() => setIsCalibrationOpen(true)}
          onHighlightResult={(id) => {
            const isObj = objects.some((o) => o.object_id === id);
            const isRte = routes.some((r) => r.route_id === id);
            if (isObj) handleSelectResult(id, 'object');
            else if (isRte) handleSelectResult(id, 'route');
          }}
        />
      )}
    </div>
  );
};
