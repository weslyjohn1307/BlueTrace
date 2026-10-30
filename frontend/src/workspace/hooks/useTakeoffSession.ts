import { useCallback, useState } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type { LedgerSummaryRow, SheetMetadata, TakeoffRecord } from '../../api/contracts';

export type SessionStage = 'idle' | 'uploading' | 'scanning' | 'ready' | 'failed';

export interface ScannedSheet {
  pdfPath: string;
  fileName: string;
  pageIndex: number;
  meta: SheetMetadata;
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

  const scanPage = useCallback(
    async (pdfPath: string, fileName: string, pageIndex: number, projectName: string) => {
      setState((prev) => ({ ...prev, stage: 'scanning', error: null }));
      try {
        const meta = await apiClient.scanSheet(pdfPath, pageIndex);
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
        await scanPage(uploaded.file_path, uploaded.filename, 0, projectName);
      } catch (err: unknown) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed';
        setState((prev) => ({ ...prev, stage: 'failed', error: message }));
      }
    },
    [scanPage]
  );

  const openFixture = useCallback(
    async (pdfPath: string) => {
      const fileName = pdfPath.split('/').pop() ?? pdfPath;
      const projectName = projectNameFromFile(fileName);
      setState((prev) => ({ ...EMPTY_STATE, stage: 'scanning', projectName, backendOnline: prev.backendOnline, aiConfigured: prev.aiConfigured }));
      await scanPage(pdfPath, fileName, 0, projectName);
    },
    [scanPage]
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

  return {
    state,
    checkBackend,
    selectFile,
    openFixture,
    scanPage,
    selectSheet,
    refreshLedger: () => refreshLedger(state.projectName, state.activeSheetId),
    setItemStatus,
    reset,
  };
}
