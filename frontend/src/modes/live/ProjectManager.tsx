import React, { useState } from 'react';
import { 
  FolderPlus, 
  FolderCheck, 
  RefreshCw, 
  AlertCircle, 
  Plus, 
  ArrowRight,
  FolderGit2,
  X
} from 'lucide-react';
import type { ProjectResponse } from '../../api/contracts';
import { useLiveData } from './liveContext';

export const ProjectManager: React.FC = () => {
  const {
    projects,
    activeProject,
    isLoadingProjects,
    projectsError,
    loadProjects,
    setActiveProject,
    createProject,
    connectionState,
  } = useLiveData();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProject, setCreatedProject] = useState<ProjectResponse | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError('Project name is required');
      return;
    }
    if (trimmed.length > 128) {
      setCreateError('Project name must not exceed 128 characters');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const newProj = await createProject(trimmed, description.trim() || undefined);
      setCreatedProject(newProj);
      setName('');
      setDescription('');
      setIsCreating(false);
      setActiveProject(newProj);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      setCreateError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If a project is selected, show active project summary with switch button
  if (activeProject && !isCreating) {
    return (
      <div className="p-3 bg-white rounded-md border border-slate-200 shadow-xs">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <FolderCheck className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
            <span className="font-semibold text-xs text-slate-800 truncate" title={activeProject.name}>
              {activeProject.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveProject(null)}
            className="text-[11px] text-[#006D84] hover:text-[#005264] font-medium underline focus:outline-none focus:ring-1 focus:ring-[#006D84]"
            aria-label="Switch to another project"
          >
            Switch
          </button>
        </div>

        <div className="mt-2 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span>Project ID:</span>
            <span className="font-mono text-slate-700 font-medium">{activeProject.project_id}</span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Drawings:</span>
            <span className="font-mono text-slate-700 font-medium">{activeProject.drawing_count}</span>
          </div>
          {activeProject.description && (
            <p className="text-slate-500 text-[10px] mt-1 line-clamp-2">{activeProject.description}</p>
          )}
        </div>

        {createdProject && createdProject.project_id === activeProject.project_id && (
          <div className="mt-2 p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-800">
            Created server ID: <span className="font-mono font-bold">{createdProject.project_id}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header and New Project Action */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'} available
        </span>
        {!isCreating && (
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setCreateError(null);
            }}
            disabled={connectionState !== 'connected'}
            className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium text-white bg-[#006D84] hover:bg-[#005264] disabled:opacity-50 disabled:cursor-not-allowed rounded focus:outline-none focus:ring-2 focus:ring-[#006D84]"
            aria-label="Create new project"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Project Creation Form */}
      {isCreating && (
        <form 
          onSubmit={handleCreateSubmit} 
          aria-label="Create project form"
          className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-800">
              <FolderPlus className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
              <span>Create Project</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setCreateError(null);
              }}
              className="text-slate-400 hover:text-slate-600 focus:outline-none"
              aria-label="Cancel project creation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label htmlFor="project-name-input" className="block text-[11px] font-medium text-slate-700 mb-0.5">
              Project Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="project-name-input"
              type="text"
              required
              maxLength={128}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Avexis Facility IFC"
              className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:border-[#006D84] focus:ring-1 focus:ring-[#006D84] outline-none"
              disabled={isSubmitting}
              aria-describedby={createError ? 'create-project-error' : undefined}
            />
            <div className="text-[10px] text-slate-400 mt-0.5 text-right">
              {name.length}/128
            </div>
          </div>

          <div>
            <label htmlFor="project-desc-input" className="block text-[11px] font-medium text-slate-700 mb-0.5">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="project-desc-input"
              type="text"
              maxLength={256}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project notes"
              className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:border-[#006D84] focus:ring-1 focus:ring-[#006D84] outline-none"
              disabled={isSubmitting}
            />
          </div>

          {createError && (
            <div id="create-project-error" role="alert" className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700 flex items-start space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{createError}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setCreateError(null);
              }}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 rounded border border-slate-200 bg-white"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-3 py-1 text-xs font-semibold text-white bg-[#006D84] hover:bg-[#005264] disabled:opacity-50 disabled:cursor-not-allowed rounded focus:outline-none focus:ring-2 focus:ring-[#006D84]"
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Loading State */}
      {isLoadingProjects && (
        <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#006D84]" aria-hidden="true" />
          <span>Loading projects...</span>
        </div>
      )}

      {/* Error State */}
      {projectsError && !isLoadingProjects && (
        <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 space-y-1.5">
          <div className="flex items-center space-x-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
            <span>Failed to load projects</span>
          </div>
          <p className="text-[11px] text-rose-600">{projectsError}</p>
          <button
            type="button"
            onClick={() => loadProjects()}
            className="inline-flex items-center space-x-1 px-2 py-0.5 bg-white border border-rose-300 rounded text-[11px] font-medium text-rose-700 hover:bg-rose-50"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingProjects && !projectsError && projects.length === 0 && !isCreating && (
        <div className="p-3 text-center border border-dashed border-slate-200 rounded-md">
          <FolderGit2 className="w-6 h-6 text-slate-300 mx-auto mb-1.5" aria-hidden="true" />
          <p className="text-xs text-slate-600 font-medium">No projects found</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Create a project to import drawings.</p>
        </div>
      )}

      {/* Projects List */}
      {!isLoadingProjects && !projectsError && projects.length > 0 && !isCreating && (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5" aria-label="Available projects">
          {projects.map((proj) => (
            <li key={proj.project_id}>
              <button
                type="button"
                onClick={() => setActiveProject(proj)}
                className="w-full text-left p-2 rounded-md border border-slate-200 bg-white hover:border-[#006D84] hover:bg-slate-50/50 transition-colors focus:outline-none focus:ring-1 focus:ring-[#006D84] group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800 group-hover:text-[#006D84] truncate">
                    {proj.name}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-[#006D84]" aria-hidden="true" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                  <span className="font-mono text-slate-600">{proj.project_id}</span>
                  <span>{proj.drawing_count} {proj.drawing_count === 1 ? 'drawing' : 'drawings'}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
