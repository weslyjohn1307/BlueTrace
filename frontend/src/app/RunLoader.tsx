import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import { WorkspaceApp } from '../workspace/WorkspaceApp';
import { GlobalTopNav } from './GlobalTopNav';

export const RunLoader: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setError('No run identifier specified.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    apiClient
      .getRunById(runId)
      .then((run) => {
        if (!isMounted) return;
        setResolvedProjectId(run.project_id);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : `Run '${runId}' not found.`);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [runId]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#F8FAFC]">
        <GlobalTopNav />
        <div className="flex-1 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#006D84]" />
          <span className="text-sm font-mono text-slate-600">
            Resolving run {runId}...
          </span>
        </div>
      </div>
    );
  }

  if (error || !resolvedProjectId) {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#F8FAFC]">
        <GlobalTopNav />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-heading text-xl font-bold text-slate-900 mb-2">
            Run Not Found
          </h1>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            {error || `Unable to resolve run '${runId}'. It may have been deleted or not yet indexed.`}
          </p>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => navigate('/runs')}
              className="btn-secondary text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Runs</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-primary text-xs"
            >
              <span>New Analysis</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the canonical workstation with resolved project and run!
  return <WorkspaceApp initialProjectId={resolvedProjectId} initialRunId={runId} />;
};
