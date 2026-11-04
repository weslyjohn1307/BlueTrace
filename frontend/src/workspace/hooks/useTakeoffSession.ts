import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type { AgentJobEvent, LedgerSummaryRow, OrchestrateAgentResponse, SheetMetadata, TakeoffRecord } from '../../api/contracts';

export type SessionStage = 'idle' | 'uploading' | 'scanning' | 'orchestrating' | 'ready' | 'failed';

export interface ViewportTransform {
  scale: number;
  translationX: number;
  translationY: number;
  mode: 'manual';
}

export const ACTIVE_PROJECT_SLOT = 'bluetrace_active_project';
const ACTIVE_AGENT_JOB_SLOT = 'bluetrace_active_agent_job';

function readSavedProjectId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PROJECT_SLOT);
    const cleaned = (raw ?? '').trim();
    return cleaned ? cleaned : null;
  } catch {
    return null;
  }
}

function rememberProjectId(projectId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_SLOT, projectId);
  } catch {
    // Storage is best-effort; rehydration simply won't trigger next launch.
  }
}

function forgetProjectId(projectId: string): void {
  try {
    if (localStorage.getItem(ACTIVE_PROJECT_SLOT) === projectId) {
      localStorage.removeItem(ACTIVE_PROJECT_SLOT);
    }
  } catch {
    // Storage cleanup is best-effort; the current view can still recover.
  }
}

function saveAgentJob(projectId: string, jobId: string): void {
  try { localStorage.setItem(ACTIVE_AGENT_JOB_SLOT, JSON.stringify({ projectId, jobId })); } catch { /* best effort */ }
}

function readAgentJob(projectId: string): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_AGENT_JOB_SLOT);
    if (!raw) return null;
    const value = JSON.parse(raw) as { projectId?: unknown; jobId?: unknown };
    return value.projectId === projectId && typeof value.jobId === 'string' ? value.jobId : null;
  } catch { return null; }
}

function clearAgentJob(jobId: string): void {
  try {
    const raw = localStorage.getItem(ACTIVE_AGENT_JOB_SLOT);
    if (raw && (JSON.parse(raw) as { jobId?: unknown }).jobId === jobId) localStorage.removeItem(ACTIVE_AGENT_JOB_SLOT);
  } catch { /* best effort */ }
}

export interface ScannedSheet {
  pdfPath: string;
  fileName: string;
  pageIndex: number;
  meta: SheetMetadata;
}

/** The local copy of the opened package, available before classification lands. */
export interface DrawingSource {
  fileName: string;
  filePath: string;
}

/** Fail-closed viewport restore: only finite scale>0 with finite tx/ty
 *  becomes a manual transform; anything else falls back to fit (null). */
export function toRestoredTransform(session: {
  viewport_scale: unknown;
  viewport_tx: unknown;
  viewport_ty: unknown;
}): ViewportTransform | null {
  const scale = Number(session.viewport_scale);
  const tx = Number(session.viewport_tx);
  const ty = Number(session.viewport_ty);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
  return { scale, translationX: tx, translationY: ty, mode: 'manual' };
}

export interface TakeoffSessionState {
  stage: SessionStage;
  projectName: string;
  source: DrawingSource | null;
  sheets: ScannedSheet[];
  activeSheetId: string | null;
  items: TakeoffRecord[];
  summary: LedgerSummaryRow[];
  itemsLoading: boolean;
  backendOnline: boolean | null;
  aiConfigured: boolean;
  metaConsent: boolean;
  agentRun: OrchestrateAgentResponse | null;
  agentProgress: AgentJobProgress | null;
  totalPages: number | null;
  error: string | null;
  initialTransform: ViewportTransform | null;
}

export interface AgentJobProgress {
  jobId: string;
  totalPages: number | null;
  classifiedPages: number;
  currentAgent: string;
  currentMessage: string;
  detections: number;
  reviewFlags: number;
  status: 'running' | 'paused' | 'complete' | 'failed';
  analysisScope: 'all' | 'vision';
  events?: AgentJobEvent[];
}

const EMPTY_STATE: TakeoffSessionState = {
  stage: 'idle',
  projectName: '',
  source: null,
  sheets: [],
  activeSheetId: null,
  items: [],
  summary: [],
  itemsLoading: false,
  backendOnline: null,
  aiConfigured: false,
  metaConsent: false,
  agentRun: null,
  agentProgress: null,
  totalPages: null,
  error: null,
  initialTransform: null,
};

function projectNameFromFile(name: string, uploadId?: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[^\w\- ]+/g, '').trim() || 'Untitled drawing';
  // Each upload is a new package revision/session. Reusing only the filename
  // would mix this upload's ledger with records persisted by an earlier run.
  return uploadId ? `${base.substring(0, 68)}-${uploadId}` : base.substring(0, 80);
}

export function useTakeoffSession() {
  const [state, setState] = useState<TakeoffSessionState>(EMPTY_STATE);

  const checkBackend = useCallback(async (): Promise<boolean> => {
    try {
      const health = await apiClient.getHealth();
      const online = health.status === 'online';
      setState((prev) => ({ ...prev, backendOnline: online, aiConfigured: health.meta_model_api_configured }));
      return online;
    } catch {
      setState((prev) => ({ ...prev, backendOnline: false, aiConfigured: false }));
      return false;
    }
  }, []);

  const refreshLedger = useCallback(
    async (projectName: string, sheetId: string | null) => {
      if (!sheetId) return;
      setState((prev) =>
        prev.projectName === projectName && prev.activeSheetId === sheetId
          ? { ...prev, itemsLoading: true }
          : prev
      );
      try {
        const [items, summary] = await Promise.all([
          apiClient.listTakeoffItems({ project_id: projectName, sheet_id: sheetId }),
          apiClient.getTakeoffSummary({ project_id: projectName, sheet_id: sheetId }),
        ]);
        setState((prev) =>
          prev.projectName === projectName && prev.activeSheetId === sheetId
            ? { ...prev, items, summary, itemsLoading: false }
            : prev
        );
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          ...(prev.projectName === projectName && prev.activeSheetId === sheetId
            ? {
                itemsLoading: false,
                error: err instanceof Error ? err.message : 'Failed to load takeoff ledger',
              }
            : {}),
        }));
      }
    },
    []
  );

  const rehydrateProject = useCallback(async (projectId: string) => {
    const cleaned = projectId.trim();
    if (!cleaned) return null;
    setState((prev) => ({ ...prev, stage: 'scanning', error: null }));
    try {
      const payload = await apiClient.getProjectSession(cleaned);
      const sheets: ScannedSheet[] = payload.sheets.map((meta) => {
        const storedPdfPath = meta.pdf_path;
        const pdfPath = typeof storedPdfPath === 'string' && storedPdfPath.trim() ? storedPdfPath.trim() : '';
        const fileName = pdfPath ? pdfPath.split('/').pop() || pdfPath : '';
        return {
          pdfPath,
          fileName,
          pageIndex: meta.page_index,
          meta,
        };
      });
      const session = payload.session;
      const activeSheetId =
        session.active_sheet_id && sheets.some((s) => s.meta.sheet_id === session.active_sheet_id)
          ? session.active_sheet_id
          : (sheets[0]?.meta.sheet_id ?? null);
      setState((prev) => ({
        ...prev,
        stage: 'ready',
        projectName: cleaned,
        source: sheets[0]?.pdfPath
          ? { fileName: sheets[0].fileName, filePath: sheets[0].pdfPath }
          : null,
        sheets,
        totalPages: sheets.length || null,
        activeSheetId,
        summary: payload.summary,
        items: [],
        initialTransform: toRestoredTransform(session),
        error: null,
      }));
      rememberProjectId(cleaned);
      const savedJobId = readAgentJob(cleaned);
      if (savedJobId) {
        try {
          const job = await apiClient.getAgentJob(savedJobId);
          const classified = new Set<number>();
          const sheetTypes = new Map<string, string>();
          let totalPages: number | null = null;
          let detections = 0;
          let reviewFlags = 0;
          for (const event of job.events) {
            if (typeof event.page_index === 'number' && event.event_type === 'sheet_classified') {
              classified.add(event.page_index);
              if (typeof event.payload?.sheet_id === 'string' && typeof event.payload?.sheet_type === 'string') {
                sheetTypes.set(event.payload.sheet_id, event.payload.sheet_type);
              }
            }
            if (typeof event.payload?.total_pages === 'number') totalPages = event.payload.total_pages;
            if (
              event.event_type === 'items_emitted' &&
              (event.payload?.persisted === true || event.message.startsWith('Persisted ')) &&
              typeof event.payload?.item_count === 'number'
            ) detections += event.payload.item_count;
            if (event.event_type === 'flag_raised') reviewFlags += 1;
          }
          const lastEvent = job.events[job.events.length - 1];
          const completedEvent = [...job.events].reverse().find((event) => event.job_terminal && event.event_type === 'complete');
          const documentMap = completedEvent?.payload?.document_map;
          const routes = documentMap && typeof documentMap === 'object' && Array.isArray((documentMap as Record<string, unknown>).routes)
            ? (documentMap as Record<string, unknown>).routes as Record<string, unknown>[]
            : [];
          const restoredRun: OrchestrateAgentResponse | null = completedEvent && documentMap
            ? {
                job_id: savedJobId,
                project_id: cleaned,
                document_map: documentMap as Record<string, unknown>,
                routes,
                flags: job.events.filter((event) => event.event_type === 'flag_raised').map((event) => event.payload),
                sheets_processed: classified.size,
              }
            : null;
          const restoredSheets = sheets.map((sheet) => ({
            ...sheet,
            meta: { ...sheet.meta, sheet_type: sheetTypes.get(sheet.meta.sheet_id) ?? sheet.meta.sheet_type ?? null },
          }));
          const isComplete = job.status === 'complete';
          const isActive = job.status === 'running';
          setState((prev) => ({
            ...prev,
            stage: isActive ? 'orchestrating' : 'ready',
            sheets: restoredSheets,
            agentRun: restoredRun,
            agentProgress: {
              jobId: savedJobId,
              totalPages,
              classifiedPages: classified.size,
              currentAgent: lastEvent?.agent_id ?? 'agent_00_orchestrator',
              currentMessage: lastEvent?.message ?? 'Analysis state restored',
              detections,
              reviewFlags,
              status: isComplete ? 'complete' : isActive ? 'running' : job.status === 'failed' ? 'failed' : 'paused',
              analysisScope: job.analysis_scope,
              events: job.events.slice(-240),
            },
            metaConsent: job.meta_consent,
          }));
          if (isComplete) clearAgentJob(savedJobId);
        } catch {
          clearAgentJob(savedJobId);
        }
      }
      return payload;
    } catch (err: unknown) {
      const missingProject = err instanceof ApiError && err.status === 404;
      if (missingProject) forgetProjectId(cleaned);
      setState((prev) => ({
        ...EMPTY_STATE,
        backendOnline: prev.backendOnline,
        aiConfigured: prev.aiConfigured,
        stage: missingProject ? 'idle' : 'failed',
        error: missingProject
          ? 'This saved workspace is no longer available. Open its PDF to start again.'
          : 'Could not restore the saved workspace. Check the local connection, then open the PDF again.',
      }));
      return null;
    }
  }, []);

  const rehydrateAttemptedRef = useRef(false);

  // Atomic rehydration on mount: restore the last project, its sheets, the
  // active sheet, the ledger summary, and the saved canvas transform in one
  // state transition so the canvas never flickers through a blank session.
  useEffect(() => {
    if (rehydrateAttemptedRef.current) return;
    rehydrateAttemptedRef.current = true;
    const saved = readSavedProjectId();
    if (saved) {
      void rehydrateProject(saved);
    }
  }, [rehydrateProject]);

  const scanPage = useCallback(
    async (pdfPath: string, fileName: string, pageIndex: number, projectName: string) => {
      setState((prev) => ({ ...prev, stage: 'scanning', error: null }));
      try {
        const meta = await apiClient.scanSheet(pdfPath, pageIndex, { projectId: projectName });
        const entry: ScannedSheet = { pdfPath, fileName, pageIndex, meta };
        setState((prev) => {
          const sheets = [...prev.sheets.filter((s) => s.meta.sheet_id !== meta.sheet_id), entry];
          return {
            ...prev,
            stage: 'ready',
            projectName,
            sheets,
            activeSheetId: meta.sheet_id,
          };
        });
        await refreshLedger(projectName, meta.sheet_id);
        return meta;
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          stage: 'failed',
          agentProgress: prev.agentProgress
            ? { ...prev.agentProgress, status: 'paused', currentMessage: err instanceof Error ? err.message : 'Connection interrupted' }
            : null,
          error: err instanceof Error ? err.message : 'Sheet scan failed',
        }));
        return null;
      }
    },
    [refreshLedger]
  );

  const scanAll = useCallback(
    async (
      pdfPath: string,
      fileName: string,
      projectName: string,
      options: { metaConsent?: boolean; resumeJobId?: string; attachJobId?: string; analysisScope?: 'all' | 'vision' } = {}
    ) => {
      setState((prev) => ({ ...prev, stage: 'orchestrating', agentRun: null, agentProgress: null, error: null }));
      try {
        const analysisScope = options.analysisScope ?? state.agentProgress?.analysisScope ?? 'all';
        const started = options.resumeJobId
          ? await apiClient.resumeAgentJob(options.resumeJobId)
          : options.attachJobId
            ? await apiClient.getAgentJob(options.attachJobId)
          : await apiClient.startAgentJob({
              file_path: pdfPath,
              project_id: projectName,
              meta_consent: options.metaConsent === true,
              analysis_scope: analysisScope,
            });
        saveAgentJob(projectName, started.job_id);
        setState((prev) => ({ ...prev, metaConsent: options.metaConsent === true }));
        const sheetsById = new Map<string, ScannedSheet>(
          state.sheets
            .filter((sheet) => sheet.pdfPath === pdfPath)
            .map((sheet) => [sheet.meta.sheet_id, sheet])
        );
        const flags: Record<string, unknown>[] = [];
        let routes: Record<string, unknown>[] = [];
        let events: AgentJobEvent[] = [];
        const classifiedPageIndexes = new Set<number>();
        let totalPages: number | null = null;
        let detections = 0;
        const onEvent = (event: AgentJobEvent) => {
          const payload = event.payload ?? {};
          events = [...events, event].slice(-240);
          if (event.event_type === 'sheet_classified' && typeof event.page_index === 'number') {
            classifiedPageIndexes.add(event.page_index);
          }
          if (typeof payload.total_pages === 'number') totalPages = payload.total_pages;
          if (event.event_type === 'sheet_classified' && payload.sheet_metadata && typeof payload.sheet_metadata === 'object') {
            const meta = { ...(payload.sheet_metadata as SheetMetadata), sheet_type: typeof payload.sheet_type === 'string' ? payload.sheet_type : null };
            sheetsById.set(meta.sheet_id, { pdfPath, fileName, pageIndex: meta.page_index, meta });
          }
          if (event.event_type === 'flag_raised') flags.push(payload);
          const itemsPersisted = payload.persisted === true || event.message.startsWith('Persisted ');
          if (event.event_type === 'items_emitted' && itemsPersisted && typeof payload.item_count === 'number') {
            detections += payload.item_count;
          }
          if (event.event_type === 'complete' && payload.document_map && typeof payload.document_map === 'object') {
            const documentMap = payload.document_map as Record<string, unknown>;
            routes = Array.isArray(documentMap.routes) ? documentMap.routes as Record<string, unknown>[] : [];
            if (Array.isArray(documentMap.sheets)) {
              const sheetTypes = new Map<string, string>();
              if (Array.isArray(documentMap.routes)) {
                for (const route of documentMap.routes) {
                  if (route && typeof route === 'object' && 'sheet_id' in route && 'sheet_type' in route) {
                    sheetTypes.set(String(route.sheet_id), String(route.sheet_type));
                  }
                }
              }
              for (const rawMeta of documentMap.sheets) {
                if (!rawMeta || typeof rawMeta !== 'object' || !('sheet_id' in rawMeta)) continue;
                const raw = rawMeta as SheetMetadata;
                const meta = { ...raw, sheet_type: sheetTypes.get(raw.sheet_id) ?? raw.sheet_type ?? null };
                sheetsById.set(meta.sheet_id, { pdfPath, fileName, pageIndex: meta.page_index, meta });
              }
            }
          }
          const sheets = [...sheetsById.values()].sort((a, b) => a.pageIndex - b.pageIndex);
          setState((prev) => {
            const activeSheetId = prev.activeSheetId && sheets.some((sheet) => sheet.meta.sheet_id === prev.activeSheetId)
              ? prev.activeSheetId
              : (sheets[0]?.meta.sheet_id ?? null);
            const terminal = event.job_terminal === true && event.event_type === 'complete';
            const failed = event.job_terminal === true && event.event_type === 'failed';
            const result: OrchestrateAgentResponse | null = terminal ? {
              job_id: started.job_id,
              project_id: projectName,
              document_map: (payload.document_map as Record<string, unknown>) ?? {},
              routes,
              flags,
              sheets_processed: sheets.length,
            } : prev.agentRun;
            return {
              ...prev,
              stage: terminal ? 'ready' : failed ? 'failed' : 'orchestrating',
              projectName,
              sheets,
              activeSheetId,
              agentRun: result,
              agentProgress: {
                jobId: started.job_id,
                totalPages,
                classifiedPages: classifiedPageIndexes.size,
                currentAgent: event.agent_id,
                currentMessage: event.message,
                detections,
                reviewFlags: flags.length,
                status: terminal ? 'complete' : failed
                  ? payload.status === 'cancelled' ? 'paused' : 'failed'
                  : 'running',
                analysisScope,
                events,
              },
              error: failed && payload.status !== 'cancelled' ? event.message : null,
            };
          });
          if (event.event_type === 'sheet_classified' && sheetsById.size === 1) {
            const firstSheet = sheetsById.values().next().value as ScannedSheet;
            void refreshLedger(projectName, firstSheet.meta.sheet_id);
          }
          // The agent's own items_emitted event precedes its DB transaction.
          // The orchestrator emits a second event only after persistence, so
          // refresh then to avoid leaving the ledger empty for the whole run.
          if (
            event.event_type === 'items_emitted' &&
            itemsPersisted &&
            typeof payload.sheet_id === 'string'
          ) {
            void refreshLedger(projectName, payload.sheet_id);
          }
        };
        const terminal = await apiClient.streamAgentJobEvents(started.job_id, onEvent);
        if (!terminal || terminal.job_terminal !== true) {
          throw new Error(terminal?.message || 'Agent job stream ended without a completion event.');
        }
        if (terminal.payload?.status === 'cancelled') return null;
        if (terminal.event_type !== 'complete') throw new Error(terminal.message || 'Agent job failed.');
        clearAgentJob(started.job_id);
        rememberProjectId(projectName);
        return null;
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          stage: 'failed',
          error: err instanceof Error ? err.message : 'Sheet scan failed',
        }));
        return null;
      }
    },
    [refreshLedger, state.agentProgress?.analysisScope, state.sheets]
  );

  const selectFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setState((prev) => ({ ...prev, stage: 'failed', error: 'Only PDF documents (.pdf) are supported.' }));
        return;
      }
      const projectName = projectNameFromFile(file.name, crypto.randomUUID().slice(0, 8));
      setState((prev) => ({ ...EMPTY_STATE, stage: 'uploading', projectName, backendOnline: prev.backendOnline, aiConfigured: prev.aiConfigured }));
      try {
        const uploaded = await apiClient.uploadDrawing(file);
        const preview = await apiClient.previewPackagePage({
          file_path: uploaded.file_path,
          project_id: projectName,
          page_index: 0,
        });
        const firstSheet: ScannedSheet = {
          pdfPath: uploaded.file_path,
          fileName: uploaded.filename,
          pageIndex: 0,
          meta: preview.sheet,
        };
        setState((prev) => ({
          ...prev,
          stage: 'ready',
          source: { fileName: uploaded.filename, filePath: uploaded.file_path },
          sheets: [firstSheet],
          activeSheetId: preview.sheet.sheet_id,
          totalPages: preview.total_pages,
          error: null,
        }));
          void refreshLedger(projectName, preview.sheet.sheet_id);
        rememberProjectId(projectName);
        void scanAll(uploaded.file_path, uploaded.filename, projectName, { analysisScope: 'all', metaConsent: false });
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
        setState((prev) => ({ ...prev, stage: 'failed', error: message }));
      }
    },
    [refreshLedger, scanAll]
  );

  const openFixture = useCallback(
    async (pdfPath: string) => {
      const fileName = pdfPath.split('/').pop() ?? pdfPath;
      const projectName = projectNameFromFile(fileName);
      setState((prev) => ({
        ...EMPTY_STATE,
        stage: 'scanning',
        projectName,
        source: { fileName, filePath: pdfPath },
        backendOnline: prev.backendOnline,
        aiConfigured: prev.aiConfigured,
      }));
      try {
        const preview = await apiClient.previewPackagePage({ file_path: pdfPath, project_id: projectName, page_index: 0 });
        const firstSheet: ScannedSheet = { pdfPath, fileName, pageIndex: 0, meta: preview.sheet };
        setState((prev) => ({
          ...prev,
          stage: 'ready',
          sheets: [firstSheet],
          activeSheetId: preview.sheet.sheet_id,
          totalPages: preview.total_pages,
          error: null,
        }));
          void refreshLedger(projectName, preview.sheet.sheet_id);
        void scanAll(pdfPath, fileName, projectName, { analysisScope: 'all', metaConsent: false });
      } catch (err) {
        setState((prev) => ({ ...prev, stage: 'failed', error: err instanceof Error ? err.message : 'Could not open sample PDF.' }));
      }
    },
    [refreshLedger, scanAll]
  );

  const selectPreviewPage = useCallback(async (pageIndex: number) => {
    if (!state.source || pageIndex < 0 || (state.totalPages !== null && pageIndex >= state.totalPages)) return;
    try {
      const preview = await apiClient.previewPackagePage({
        file_path: state.source.filePath,
        project_id: state.projectName,
        page_index: pageIndex,
      });
      const entry: ScannedSheet = {
        pdfPath: state.source.filePath,
        fileName: state.source.fileName,
        pageIndex,
        meta: preview.sheet,
      };
      setState((prev) => ({
        ...prev,
        totalPages: preview.total_pages,
        sheets: [...prev.sheets.filter((sheet) => sheet.pageIndex !== pageIndex), entry],
        activeSheetId: preview.sheet.sheet_id,
      }));
      await refreshLedger(state.projectName, preview.sheet.sheet_id);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Could not open this page.' }));
    }
  }, [state.source, state.projectName, state.totalPages, refreshLedger]);

  const cancelAnalysis = useCallback(async () => {
    const jobId = state.agentProgress?.jobId;
    if (!jobId) return;
    try {
      await apiClient.cancelAgentJob(jobId);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : 'Could not pause analysis.' }));
    }
  }, [state.agentProgress?.jobId]);

  const setMetaConsent = useCallback((metaConsent: boolean) => {
    setState((prev) => ({ ...prev, metaConsent }));
  }, []);

  const resumeAnalysis = useCallback(async () => {
    const jobId = state.agentProgress?.jobId;
    if (!jobId || !state.source) return;
    try {
      const snapshot = await apiClient.getAgentJob(jobId);
      await scanAll(
        state.source.filePath,
        state.source.fileName,
        state.projectName,
        snapshot.status === 'running'
          ? { attachJobId: jobId, analysisScope: snapshot.analysis_scope, metaConsent: snapshot.meta_consent }
          : { resumeJobId: jobId, analysisScope: snapshot.analysis_scope, metaConsent: snapshot.meta_consent }
      );
    } catch (err) {
      setState((prev) => ({
        ...prev,
        stage: 'ready',
        agentProgress: prev.agentProgress
          ? { ...prev.agentProgress, status: 'paused', currentMessage: 'Could not reconnect. Try resume again.' }
          : null,
        error: err instanceof Error ? err.message : 'Could not reconnect to analysis.',
      }));
    }
  }, [state.agentProgress?.jobId, state.source, state.projectName, scanAll]);

  const selectSheet = useCallback(
    (sheetId: string) => {
      setState((prev) => {
        if (!prev.sheets.some((s) => s.meta.sheet_id === sheetId)) return prev;
        return { ...prev, activeSheetId: sheetId };
      });
      const projectName = state.projectName;
      void refreshLedger(projectName, sheetId);
    },
    [state.projectName, refreshLedger]
  );

  const setItemStatus = useCallback(
    async (itemId: string, status: 'SUGGESTED' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'CANNOT_DETERMINE') => {
      try {
        await apiClient.updateTakeoffStatus(itemId, status, 'USER_REVIEW');
        await refreshLedger(state.projectName, state.activeSheetId);
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to update item status',
        }));
      }
    },
    [state.projectName, state.activeSheetId, refreshLedger]
  );

  const reset = useCallback(() => {
    setState((prev) => ({ ...EMPTY_STATE, backendOnline: prev.backendOnline, aiConfigured: prev.aiConfigured }));
  }, []);

  const applyCalibrationResult = useCallback(
    async (
      sheetId: string,
      patch: { scale_ratio: number | null; scale_raw: string | null; scale_status: SheetMetadata['scale_status'] }
    ) => {
      setState((prev) => ({
        ...prev,
        sheets: prev.sheets.map((s) =>
          s.meta.sheet_id === sheetId ? { ...s, meta: { ...s.meta, ...patch } } : s
        ),
      }));
      await refreshLedger(state.projectName, sheetId);
    },
    [state.projectName, refreshLedger]
  );

  return {
    state,
    checkBackend,
    selectFile,
    openFixture,
    scanPage,
    scanAll,
    selectPreviewPage,
    cancelAnalysis,
    resumeAnalysis,
    setMetaConsent,
    rehydrateProject,
    selectSheet,
    refreshLedger: () => refreshLedger(state.projectName, state.activeSheetId),
    setItemStatus,
    reset,
    applyCalibrationResult,
  };
}
