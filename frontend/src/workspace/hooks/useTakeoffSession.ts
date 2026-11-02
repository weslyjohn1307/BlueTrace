import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type { LedgerSummaryRow, SheetMetadata, TakeoffRecord } from '../../api/contracts';

export type SessionStage = 'idle' | 'uploading' | 'scanning' | 'ready' | 'failed';

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

export interface ScannedSheet {
  pdfPath: string;
  fileName: string;
  pageIndex: number;
  meta: SheetMetadata;
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
  sheets: ScannedSheet[];
  activeSheetId: string | null;
  items: TakeoffRecord[];
  summary: LedgerSummaryRow[];
  itemsLoading: boolean;
  backendOnline: boolean;
  aiConfigured: boolean;
  error: string | null;
  initialTransform: ViewportTransform | null;
}

const EMPTY_STATE: TakeoffSessionState = {
  stage: 'idle',
  projectName: '',
  sheets: [],
  activeSheetId: null,
  items: [],
  summary: [],
  itemsLoading: false,
  backendOnline: false,
  aiConfigured: false,
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
      const sheets: ScannedSheet[] = payload.sheets.map((meta) => ({
        pdfPath: '',
        fileName: '',
        pageIndex: meta.page_index,
        meta,
      }));
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
      setState((prev) => ({
        ...prev,
        stage: 'failed',
        error: err instanceof Error ? err.message : 'Saved session could not be restored',
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
      setState((prev) => ({ ...prev, stage: 'scanning', error: null }));
      try {
        const result = await apiClient.scanAllSheets(pdfPath, { projectId: projectName });
        const sheets: ScannedSheet[] = result.sheets.map((meta) => ({
          pdfPath,
          fileName,
          pageIndex: meta.page_index,
          meta,
        }));
        const activeSheetId = sheets[0]?.meta.sheet_id ?? null;
        setState((prev) => ({
          ...prev,
          stage: 'ready',
          projectName,
          sheets,
          activeSheetId,
          error: result.errors.length > 0 ? result.errors.join('; ') : null,
        }));
        if (activeSheetId) {
          await refreshLedger(projectName, activeSheetId);
        }
        rememberProjectId(projectName);
        return result;
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
      setState((prev) => ({ ...EMPTY_STATE, stage: 'scanning', projectName, backendOnline: prev.backendOnline, aiConfigured: prev.aiConfigured }));
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
    async (itemId: string, status: 'SUGGESTED' | 'ACCEPTED' | 'REJECTED') => {
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
