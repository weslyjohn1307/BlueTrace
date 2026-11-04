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
  agentRun: OrchestrateAgentResponse | null;
  agentProgress: AgentJobProgress | null;
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
  agentRun: null,
  agentProgress: null,
  error: null,
  initialTransform: null,
};

function projectNameFromFile(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[^\w\- ]+/g, '').trim().substring(0, 80) || 'Untitled drawing';
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
      setState((prev) => ({ ...prev, itemsLoading: true }));
      try {
        const [items, summary] = await Promise.all([
          apiClient.listTakeoffItems({ project_id: projectName, sheet_id: sheetId }),
          apiClient.getTakeoffSummary({ project_id: projectName, sheet_id: sheetId }),
        ]);
        setState((prev) => ({ ...prev, items, summary, itemsLoading: false }));
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          itemsLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load takeoff ledger',
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
        sheets,
        activeSheetId,
        summary: payload.summary,
        items: [],
        initialTransform: toRestoredTransform(session),
        error: null,
      }));
      rememberProjectId(cleaned);
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
          error: err instanceof Error ? err.message : 'Sheet scan failed',
        }));
        return null;
      }
    },
    [refreshLedger]
  );

  const scanAll = useCallback(
    async (pdfPath: string, fileName: string, projectName: string) => {
      setState((prev) => ({ ...prev, stage: 'orchestrating', agentRun: null, agentProgress: null, error: null }));
      try {
        const started = await apiClient.startAgentJob({ file_path: pdfPath, project_id: projectName });
        const sheetsById = new Map<string, ScannedSheet>();
        const flags: Record<string, unknown>[] = [];
        let routes: Record<string, unknown>[] = [];
        let totalPages: number | null = null;
        let detections = 0;
        const onEvent = (event: AgentJobEvent) => {
          const payload = event.payload ?? {};
          if (typeof payload.total_pages === 'number') totalPages = payload.total_pages;
          if (event.event_type === 'sheet_classified' && payload.sheet_metadata && typeof payload.sheet_metadata === 'object') {
            const meta = payload.sheet_metadata as SheetMetadata;
            sheetsById.set(meta.sheet_id, { pdfPath, fileName, pageIndex: meta.page_index, meta });
          }
          if (event.event_type === 'flag_raised') flags.push(payload);
          if (event.event_type === 'items_emitted' && typeof payload.item_count === 'number') detections += payload.item_count;
          if (event.event_type === 'complete' && payload.document_map && typeof payload.document_map === 'object') {
            const documentMap = payload.document_map as Record<string, unknown>;
            routes = Array.isArray(documentMap.routes) ? documentMap.routes as Record<string, unknown>[] : [];
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
                classifiedPages: sheets.length,
                currentAgent: event.agent_id,
                currentMessage: event.message,
                detections,
                reviewFlags: flags.length,
              },
              error: failed ? event.message : null,
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
            event.agent_id === 'agent_00_orchestrator' &&
            typeof payload.sheet_id === 'string'
          ) {
            void refreshLedger(projectName, payload.sheet_id);
          }
        };
        const terminal = await apiClient.streamAgentJobEvents(started.job_id, onEvent);
        if (!terminal || terminal.event_type !== 'complete' || terminal.job_terminal !== true) {
          throw new Error(terminal?.message || 'Agent job stream ended without a completion event.');
        }
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
    [refreshLedger]
  );

  const selectFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setState((prev) => ({ ...prev, stage: 'failed', error: 'Only PDF documents (.pdf) are supported.' }));
        return;
      }
      const projectName = projectNameFromFile(file.name);
      setState((prev) => ({ ...EMPTY_STATE, stage: 'uploading', projectName, backendOnline: prev.backendOnline, aiConfigured: prev.aiConfigured }));
      try {
        const uploaded = await apiClient.uploadDrawing(file);
        // The local copy is readable before classification; the intake view
        // renders page 1 from it while the audit runs.
        setState((prev) => ({
          ...prev,
          source: { fileName: uploaded.filename, filePath: uploaded.file_path },
        }));
        await scanAll(uploaded.file_path, uploaded.filename, projectName);
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
        setState((prev) => ({ ...prev, stage: 'failed', error: message }));
      }
    },
    [scanAll]
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
      await scanAll(pdfPath, fileName, projectName);
    },
    [scanAll]
  );

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
    rehydrateProject,
    selectSheet,
    refreshLedger: () => refreshLedger(state.projectName, state.activeSheetId),
    setItemStatus,
    reset,
    applyCalibrationResult,
  };
}
