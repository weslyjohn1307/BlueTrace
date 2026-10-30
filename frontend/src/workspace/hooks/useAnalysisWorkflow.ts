import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { JobResponse, ComponentReference, JobSubmitRequest } from '../../api/contracts';
import type { CapabilitiesConfig } from '../components/AnalysisSetupView';

export type AnalysisStage =
  | 'idle'
  | 'selected'
  | 'preparing'
  | 'uploading'
  | 'preflight'
  | 'processing'
  | 'persisting'
  | 'completed'
  | 'failed';

export interface FileMetadata {
  file: File;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
}

export interface AnalysisState {
  stage: AnalysisStage;
  fileMeta: FileMetadata | null;
  humanMessage: string;
  progressPercent: number;
  projectId: string | null;
  sourceId: string | null;
  pageCount: number;
  runId: string | null;
  errorMessage: string | null;
  modelReady: boolean;
  isPreparingFile?: boolean;
  /** Seconds elapsed since job start (client-side timer) */
  elapsedSeconds: number;
  /** Current page being processed (from backend progress) */
  currentPage: number | null;
  /** True when job completed with PARTIAL state (some pages failed) */
  isPartial: boolean;
  /** Pages that failed (from backend progress) */
  failedPages: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function useAnalysisWorkflow(onAnalysisComplete?: (projectId: string, runId: string) => void) {
  const [state, setState] = useState<AnalysisState>({
    stage: 'idle',
    fileMeta: null,
    humanMessage: '',
    progressPercent: 0,
    projectId: null,
    sourceId: null,
    pageCount: 1,
    runId: null,
    errorMessage: null,
    modelReady: true,
    isPreparingFile: false,
    elapsedSeconds: 0,
    currentPage: null,
    isPartial: false,
    failedPages: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);

  // Client-side elapsed timer — only runs during processing/persisting
  useEffect(() => {
    if (state.stage === 'processing' || state.stage === 'persisting') {
      if (!jobStartTimeRef.current) {
        jobStartTimeRef.current = Date.now();
      }
      if (elapsedTimerRef.current) return;
      elapsedTimerRef.current = setInterval(() => {
        const elapsed = jobStartTimeRef.current
          ? Math.floor((Date.now() - jobStartTimeRef.current) / 1000)
          : 0;
        setState((prev) => ({ ...prev, elapsedSeconds: elapsed }));
      }, 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      if (state.stage === 'idle' || state.stage === 'selected') {
        jobStartTimeRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [state.stage]);

  const selectFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setState((prev) => ({
        ...prev,
        stage: 'failed',
        errorMessage: 'Only PDF documents (.pdf) are supported.',
      }));
      return;
    }

    const cleanProjectName = file.name.replace(/\.pdf$/i, '').substring(0, 80);

    setState({
      stage: 'selected',
      fileMeta: {
        file,
        name: file.name,
        sizeBytes: file.size,
        sizeFormatted: formatBytes(file.size),
      },
      humanMessage: 'Uploading drawing and reading sheet geometry...',
      progressPercent: 15,
      projectId: null,
      sourceId: null,
      pageCount: 1,
      runId: null,
      errorMessage: null,
      modelReady: true,
      isPreparingFile: true,
      elapsedSeconds: 0,
      currentPage: null,
      isPartial: false,
      failedPages: 0,
    });

    try {
      const health = await apiClient.getHealth();
      const version = await apiClient.getVersion();
      const isModelReady = Boolean(health.model_available ?? version.approved_model_available);

      const project = await apiClient.createProject({
        name: cleanProjectName,
      });

      const drawing = await apiClient.uploadDrawing(project.project_id, file);
      const preflight = await apiClient.getDrawingPreflight(project.project_id, drawing.source_id);
      const totalPages = preflight.page_count || 1;

      setState((prev) => ({
        ...prev,
        stage: 'selected',
        humanMessage: `Drawing uploaded (${totalPages} page${totalPages > 1 ? 's' : ''}). Ready for reference selection or analysis.`,
        progressPercent: 0,
        projectId: project.project_id,
        sourceId: drawing.source_id,
        pageCount: totalPages,
        modelReady: isModelReady,
        isPreparingFile: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to inspect uploaded drawing';
      setState((prev) => ({
        ...prev,
        stage: 'failed',
        errorMessage: message,
        isPreparingFile: false,
      }));
    }
  }, []);

  const resetWorkflow = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSubmittingRef.current = false;
    jobStartTimeRef.current = null;
    setState({
      stage: 'idle',
      fileMeta: null,
      humanMessage: '',
      progressPercent: 0,
      projectId: null,
      sourceId: null,
      pageCount: 1,
      runId: null,
      errorMessage: null,
      modelReady: true,
      isPreparingFile: false,
      elapsedSeconds: 0,
      currentPage: null,
      isPartial: false,
      failedPages: 0,
    });
  }, []);

  const startAnalysis = useCallback(
    async (
      componentReference?: ComponentReference,
      selectedPages?: number[] | null,
      capabilities?: CapabilitiesConfig
    ) => {
      if (!state.fileMeta) return;

      // Guard against duplicate submission
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      abortControllerRef.current = new AbortController();
      jobStartTimeRef.current = Date.now();

      try {
        let activeProjectId = state.projectId;
        let activeSourceId = state.sourceId;
        let totalPages = state.pageCount;

        // In case startAnalysis was clicked before background upload finished
        if (!activeProjectId || !activeSourceId) {
          setState((prev) => ({
            ...prev,
            stage: 'preparing',
            humanMessage: 'Creating analysis session...',
            progressPercent: 12,
          }));

          const cleanProjectName = state.fileMeta.file.name.replace(/\.pdf$/i, '').substring(0, 80);
          const project = await apiClient.createProject({
            name: cleanProjectName,
          });
          activeProjectId = project.project_id;

          setState((prev) => ({
            ...prev,
            stage: 'uploading',
            humanMessage: `Uploading ${state.fileMeta?.name}...`,
            progressPercent: 25,
            projectId: activeProjectId,
          }));

          const drawing = await apiClient.uploadDrawing(activeProjectId, state.fileMeta.file);
          activeSourceId = drawing.source_id;

          const preflight = await apiClient.getDrawingPreflight(activeProjectId, activeSourceId);
          totalPages = preflight.page_count || 1;
        }

        const pagesToRun = selectedPages && selectedPages.length > 0 ? selectedPages.length : totalPages;

        // Start extraction job
        setState((prev) => ({
          ...prev,
          stage: 'processing',
          humanMessage: `Starting extraction across ${pagesToRun} sheet${pagesToRun > 1 ? 's' : ''}...`,
          progressPercent: 50,
          currentPage: null,
        }));

        const submitPayload: JobSubmitRequest = {
          source_ids: [activeSourceId],
          component_reference: componentReference,
        };
        if (selectedPages && selectedPages.length > 0) {
          submitPayload.selected_pages = selectedPages;
        }
        if (capabilities) {
          submitPayload.capabilities = {
            fire_dampers: capabilities.fireDampers,
            wshp: capabilities.wshp,
            linear_grilles: capabilities.linearGrilles,
            duct_pipe_routes: capabilities.ductPipeRoutes,
          };
        }

        const job = await apiClient.submitJob(activeProjectId, submitPayload);

        // Poll progress until completion
        let activeJob: JobResponse = job;
        const startTime = Date.now();
        const MAX_POLL_MS = 600000; // 10 minutes maximum

        while (
          activeJob.state === 'QUEUED' ||
          activeJob.state === 'PREFLIGHT' ||
          activeJob.state === 'PROCESSING' ||
          activeJob.state === 'PERSISTING'
        ) {
          if (Date.now() - startTime > MAX_POLL_MS) {
            throw new Error('Analysis timed out after 10 minutes.');
          }

          await new Promise((resolve) => setTimeout(resolve, 600));

          activeJob = await apiClient.getJob(activeProjectId, job.job_id);

          if (activeJob.state === 'PROCESSING') {
            const completed = activeJob.progress.completed_pages || 0;
            const total = activeJob.progress.total_pages || totalPages;
            const current = activeJob.progress.current_page ?? Math.min(total, completed + 1);
            // Prefer backend percent if available, else compute
            const backendPct = typeof activeJob.progress.percent === 'number'
              ? activeJob.progress.percent
              : null;
            const percent = backendPct !== null
              ? Math.min(92, Math.round(50 + (backendPct / 100) * 42))
              : Math.min(92, Math.round(50 + (completed / Math.max(1, total)) * 42));

            setState((prev) => ({
              ...prev,
              stage: 'processing',
              humanMessage: `Analyzing sheet ${current} of ${total}: detecting symbols & tracing routes...`,
              progressPercent: percent,
              currentPage: current,
            }));
          } else if (activeJob.state === 'PERSISTING') {
            setState((prev) => ({
              ...prev,
              stage: 'persisting',
              humanMessage: 'Indexing quantities and compiling takeoff ledger...',
              progressPercent: 96,
            }));
          }
        }

        if (activeJob.state === 'COMPLETE' && activeJob.run_id) {
          const completedRunId = activeJob.run_id;
          setState((prev) => ({
            ...prev,
            stage: 'completed',
            humanMessage: 'Analysis complete. Loading drawing results...',
            progressPercent: 100,
            runId: completedRunId,
            isPartial: false,
            failedPages: activeJob.progress.failed_pages || 0,
          }));

          if (onAnalysisComplete) {
            onAnalysisComplete(activeProjectId, completedRunId);
          }
        } else if (activeJob.state === 'PARTIAL' && activeJob.run_id) {
          const partialRunId = activeJob.run_id;
          const failedCount = activeJob.progress.failed_pages || 0;
          const completedCount = activeJob.progress.completed_pages || 0;
          setState((prev) => ({
            ...prev,
            stage: 'completed',
            humanMessage: `${completedCount} of ${totalPages} pages processed — ${failedCount} page${failedCount !== 1 ? 's' : ''} failed.`,
            progressPercent: 100,
            runId: partialRunId,
            isPartial: true,
            failedPages: failedCount,
          }));

          if (onAnalysisComplete) {
            onAnalysisComplete(activeProjectId, partialRunId);
          }
        } else {
          const errorMsg =
            activeJob.message ||
            activeJob.error_code ||
            `Extraction ended in state ${activeJob.state}. Please check the drawing.`;
          throw new Error(errorMsg);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unexpected analysis failure';
        setState((prev) => ({
          ...prev,
          stage: 'failed',
          humanMessage: 'Analysis failed',
          progressPercent: 0,
          errorMessage: message,
        }));
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [state.fileMeta, state.projectId, state.sourceId, state.pageCount, onAnalysisComplete]
  );

  return {
    state,
    selectFile,
    startAnalysis,
    resetWorkflow,
  };
}
