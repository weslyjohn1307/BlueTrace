import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  FolderKanban,
  Plus,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { GlobalTopNav } from './GlobalTopNav';
import { apiClient } from '../api/client';
import type { ProjectResponse } from '../api/contracts';

export const ProjectsView: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New project modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchProjects = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .listProjects()
      .then((res) => {
        setProjects(res.items);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const created = await apiClient.createProject({ name: newProjectName.trim() });
      setIsCreateOpen(false);
      setNewProjectName('');
      fetchProjects();
      navigate(`/?project=${encodeURIComponent(created.project_id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
      <GlobalTopNav />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-6xl w-full mx-auto">
        {/* View Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Projects
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage drawing sets, imported packages, and historical takeoff runs.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="btn-secondary"
            >
              <Plus className="w-4 h-4" />
              <span>Create Project</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>New Analysis</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchProjects}
              className="underline font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-[#006D84]" />
            <span className="text-sm">Loading project repository...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="py-20 text-center workstation-card p-12 mt-6">
            <FolderOpen className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="font-heading text-xl font-bold text-slate-800">
              No Projects Found
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
              Create a new project or start a new drawing analysis to get started.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Start First Analysis</span>
            </button>
          </div>
        )}

        {/* Project Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => {
              const dateStr = p.created_at
                ? new Date(p.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—';

              return (
                <div
                  key={p.project_id}
                  className="workstation-card p-5 hover:border-[#006D84]/50 hover:shadow-sm transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-[#006D84]/10 text-[#006D84] flex items-center justify-center font-bold">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {p.project_id}
                      </span>
                    </div>

                    <h2 className="font-heading text-lg font-bold text-slate-900 mt-3.5 mb-1 line-clamp-1" title={p.name}>
                      {p.name}
                    </h2>

                    <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2">
                      <span className="flex items-center space-x-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{p.drawing_count} drawing{p.drawing_count !== 1 ? 's' : ''}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{dateStr}</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/?project=${encodeURIComponent(p.project_id)}`)}
                      className="text-xs font-semibold text-[#006D84] hover:text-[#005568] flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Open in Workstation</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h2 className="font-heading text-lg font-bold text-slate-900 mb-1">
              Create New Project
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Enter a descriptive name for this construction package or drawing set.
            </p>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label htmlFor="project-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Project Name
                </label>
                <input
                  id="project-name-input"
                  type="text"
                  required
                  placeholder="e.g. Dexter Medical Center Mechanical IFC"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#006D84]/40"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn-secondary text-xs h-9"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim() || isCreating}
                  className="btn-primary text-xs h-9"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
