import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../api/client';
import type { ConnectionState } from '../../components/ConnectionStatus';
import type {
  ProjectResponse,
  DrawingResponse,
  DrawingPreflightResponse,
  JobResponse,
  ComponentReference,
} from '../../api/contracts';
import { LiveDataContext, type LiveViewMode } from './liveContext';

export const LiveDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [backendVersion, setBackendVersion] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // Projects state
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [activeProject, setActiveProjectState] = useState<ProjectResponse | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Drawings state
  const [drawings, setDrawings] = useState<DrawingResponse[]>([]);
  const [activeDrawing, setActiveDrawingState] = useState<DrawingResponse | null>(null);
  const [isLoadingDrawings, setIsLoadingDrawings] = useState<boolean>(false);

  // Preflight state
  const [preflight, setPreflight] = useState<DrawingPreflightResponse | null>(null);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState<boolean>(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Job state
  const [activeJob, setActiveJob] = useState<JobResponse | null>(null);
  const [isSubmittingJob, setIsSubmittingJob] = useState<boolean>(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // View Mode
  const [viewMode, setViewMode] = useState<LiveViewMode>('project');

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingProjects(true);
    setProjectsError(null);
    try {
      const res = await apiClient.listProjects(signal);
      setProjects(res.items);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const msg = err instanceof Error ? err.message : 'Failed to load projects';
      setProjectsError(msg);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingProjects(false);
      }
    }
  }, []);

  const checkConnection = useCallback(async () => {
    setConnectionState('checking');
    setErrorMessage(undefined);

    try {
      const health = await apiClient.getHealth();
      if (health.status !== 'ok') {
        setConnectionState('unavailable');
        setErrorMessage(`Unexpected health status: ${health.status}`);
        return;
      }

      const version = await apiClient.getVersion();
      setBackendVersion(`${health.service_name} API v${version.api_version}`);
      setConnectionState('connected');

      // Load initial projects list upon connection
      await loadProjects();
    } catch (err: unknown) {
      setConnectionState('unavailable');
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to local backend');
      }
    }
  }, [loadProjects]);

  const loadDrawings = useCallback(async (projectId: string, signal?: AbortSignal) => {
    setIsLoadingDrawings(true);
    try {
      const res = await apiClient.listDrawings(projectId, signal);
      setDrawings(res.items);
    } catch {
      if (signal?.aborted) return;
      // drawings error handled gracefully
    } finally {
      if (!signal?.aborted) {
        setIsLoadingDrawings(false);
      }
    }
  }, []);

  const loadPreflight = useCallback(async (projectId: string, sourceId: string, signal?: AbortSignal) => {
    setIsLoadingPreflight(true);
    setPreflightError(null);
    try {
      const res = await apiClient.getDrawingPreflight(projectId, sourceId, signal);
      setPreflight(res);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      const msg = err instanceof Error ? err.message : 'Failed to inspect preflight';
      setPreflightError(msg);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingPreflight(false);
      }
    }
  }, []);

  const setActiveProject = useCallback((proj: ProjectResponse | null) => {
    setActiveProjectState(proj);
    setActiveDrawingState(null);
    setPreflight(null);
    setActiveJob(null);

    if (proj) {
      loadDrawings(proj.project_id);
      setViewMode('upload');
    } else {
      setDrawings([]);
      setViewMode('project');
    }
  }, [loadDrawings]);

  const setActiveDrawing = useCallback((drawing: DrawingResponse | null) => {
    setActiveDrawingState(drawing);
    setPreflight(null);
    setActiveJob(null);

    if (drawing && activeProject) {
      loadPreflight(activeProject.project_id, drawing.source_id);
      setViewMode('preflight');
    }
  }, [activeProject, loadPreflight]);

  const createProject = useCallback(async (name: string, description?: string): Promise<ProjectResponse> => {
    const newProj = await apiClient.createProject({ name, description });
    await loadProjects();
    return newProj;
  }, [loadProjects]);

  const submitJob = useCallback(async (projectId: string, sourceId: string, componentReference?: ComponentReference): Promise<JobResponse> => {
    setIsSubmittingJob(true);
    setJobError(null);
    try {
      const jobRes = await apiClient.submitJob(projectId, {
        source_ids: [sourceId],
        component_reference: componentReference,
      });
      setActiveJob(jobRes);
      setViewMode('job');
      return jobRes;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Job submission failed';
      setJobError(msg);
      throw err;
    } finally {
      setIsSubmittingJob(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    checkConnection();
    return () => {
      controller.abort();
    };
  }, [checkConnection]);

  return (
    <LiveDataContext.Provider
      value={{
        connectionState,
        backendVersion,
        errorMessage,
        checkConnection,

        projects,
        activeProject,
        isLoadingProjects,
        projectsError,
        loadProjects,
        setActiveProject,
        createProject,

        drawings,
        activeDrawing,
        isLoadingDrawings,
        loadDrawings,
        setActiveDrawing,

        preflight,
        isLoadingPreflight,
        preflightError,
        loadPreflight,

        activeJob,
        isSubmittingJob,
        jobError,
        submitJob,
        setActiveJob,

        viewMode,
        setViewMode,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
};

