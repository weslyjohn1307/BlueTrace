import React from 'react';
import { useNavigate } from 'react-router';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  HelpCircle, 
  FileDown,
  FolderGit2
} from 'lucide-react';
import { WorkspaceShell } from '../../app/WorkspaceShell';
import { EmptyPanel } from '../../components/EmptyPanel';
import { LiveDataProvider } from './LiveDataProvider';
import { useLiveData } from './liveContext';
import { ProjectManager } from './ProjectManager';
import { SheetManager } from './SheetManager';
import { DrawingUploader } from './DrawingUploader';
import { PreflightViewer } from './PreflightViewer';
import { JobProgressCard } from './JobProgressCard';
import { RunReadyHandoff } from './RunReadyHandoff';

const LiveAppContent: React.FC = () => {
  const navigate = useNavigate();
  const {
    connectionState,
    backendVersion,
    errorMessage,
    checkConnection,
    activeProject,
    activeDrawing,
    preflight,
    isLoadingPreflight,
    preflightError,
    loadPreflight,
    activeJob,
    setActiveJob,
    isSubmittingJob,
    submitJob,
    viewMode,
    setViewMode,
    setActiveDrawing,
  } = useLiveData();

  const renderViewport = () => {
    if (viewMode === 'run-ready' && activeJob) {
      return (
        <RunReadyHandoff
          job={activeJob}
          onBackToProject={() => {
            setViewMode('project');
          }}
          onOpenRun={(completedJob) => {
            if (completedJob.run_id) {
              navigate(
                `/live/projects/${encodeURIComponent(completedJob.project_id)}/runs/${encodeURIComponent(completedJob.run_id)}`
              );
            }
          }}
        />
      );
    }

    if (viewMode === 'job' && activeJob) {
      return (
        <JobProgressCard
          initialJob={activeJob}
          onOpenRun={(completedJob) => {
            setActiveJob(completedJob);
            setViewMode('run-ready');
          }}
          onRetry={() => {
            if (activeDrawing) {
              setViewMode('preflight');
            } else {
              setViewMode('upload');
            }
          }}
        />
      );
    }

    if (activeDrawing) {
      return (
        <PreflightViewer
          drawing={activeDrawing}
          preflight={preflight}
          isLoading={isLoadingPreflight}
          error={preflightError}
          onRetry={() => {
            if (activeProject && activeDrawing) {
              loadPreflight(activeProject.project_id, activeDrawing.source_id);
            }
          }}
          onSubmitProcessing={async (componentRef) => {
            if (activeProject && activeDrawing) {
              await submitJob(activeProject.project_id, activeDrawing.source_id, componentRef);
            }
          }}
          isSubmittingJob={isSubmittingJob}
        />
      );
    }

    if (activeProject) {
      return (
        <DrawingUploader
          onUploadSuccess={(drawing) => {
            setActiveDrawing(drawing);
          }}
        />
      );
    }

    // Default: no project selected
    return (
      <div className="w-full max-w-xl h-[400px] bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col items-center justify-center p-8 text-center">
        <FolderGit2 className="w-12 h-12 text-[#006D84]/60 mb-4" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold text-slate-800">
          Select or Create a Project
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
          Open an existing local construction drawing project in the left navigation,
          or create a new project to upload 2D MEP drawings.
        </p>
        <div className="mt-4 px-3 py-1.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono text-slate-600">
          Mode: LIVE (Local FastAPI Backend)
        </div>
      </div>
    );
  };

  return (
    <WorkspaceShell
      mode="live"
      connectionState={connectionState}
      backendVersion={backendVersion}
      errorMessage={errorMessage}
      onRetryConnection={checkConnection}
      projectNavContent={<ProjectManager />}
      sheetNavContent={<SheetManager />}
      viewportContent={renderViewport()}
      inspectorContent={
        <EmptyPanel
          title="Results Inspector"
          description="Linework routes, components, and symbol classifications are introduced in UI-03."
          icon={FileSpreadsheet}
        />
      }
      reviewContent={
        <EmptyPanel
          title="Review Workflow"
          description="Review actions and verification decisions will unlock in later stages."
          icon={CheckCircle2}
        />
      }
      copilotContent={
        <EmptyPanel
          title="Copilot Not Built"
          description="Ask the drawing is not built in this stage. It unlocks after review UI verification."
          icon={HelpCircle}
        />
      }
      exportContent={
        <EmptyPanel
          title="Export Not Available"
          description="Export bundles will be enabled in later UI stages after review verification."
          icon={FileDown}
        />
      }
    />
  );
};

export const LiveApp: React.FC = () => {
  return (
    <LiveDataProvider>
      <LiveAppContent />
    </LiveDataProvider>
  );
};

