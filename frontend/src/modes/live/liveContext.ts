import { createContext, useContext } from 'react';
import type { ConnectionState } from '../../components/ConnectionStatus';
import type {
  ProjectResponse,
  DrawingResponse,
  DrawingPreflightResponse,
  JobResponse,
  ComponentReference,
} from '../../api/contracts';

export type LiveViewMode = 'project' | 'upload' | 'preflight' | 'job' | 'run-ready';

export interface LiveDataContextValue {
  connectionState: ConnectionState;
  backendVersion?: string;
  errorMessage?: string;
  checkConnection: () => Promise<void>;

  // Projects
  projects: ProjectResponse[];
  activeProject: ProjectResponse | null;
  isLoadingProjects: boolean;
  projectsError: string | null;
  loadProjects: () => Promise<void>;
  setActiveProject: (p: ProjectResponse | null) => void;
  createProject: (name: string, description?: string) => Promise<ProjectResponse>;

  // Drawings
  drawings: DrawingResponse[];
  activeDrawing: DrawingResponse | null;
  isLoadingDrawings: boolean;
  loadDrawings: (projectId: string) => Promise<void>;
  setActiveDrawing: (d: DrawingResponse | null) => void;

  // Preflight
  preflight: DrawingPreflightResponse | null;
  isLoadingPreflight: boolean;
  preflightError: string | null;
  loadPreflight: (projectId: string, sourceId: string) => Promise<void>;

  // Jobs
  activeJob: JobResponse | null;
  isSubmittingJob: boolean;
  jobError: string | null;
  submitJob: (projectId: string, sourceId: string, componentReference?: ComponentReference) => Promise<JobResponse>;
  setActiveJob: (j: JobResponse | null) => void;

  // View navigation
  viewMode: LiveViewMode;
  setViewMode: (mode: LiveViewMode) => void;
}

export const LiveDataContext = createContext<LiveDataContextValue | null>(null);

export function useLiveData(): LiveDataContextValue {
  const ctx = useContext(LiveDataContext);
  if (!ctx) {
    throw new Error('useLiveData must be used within a LiveDataProvider');
  }
  return ctx;
}

