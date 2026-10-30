import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Layers,
  Sparkles,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { GlobalTopNav } from './GlobalTopNav';
import { apiClient } from '../api/client';
import type { RunSummaryItem } from '../api/contracts';

export const RunsView: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRuns = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .listAllRuns(100)
      .then((res) => {
        setRuns(res.items);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load runs');
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const filteredRuns = runs.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.run_id.toLowerCase().includes(q) ||
      r.project_id.toLowerCase().includes(q) ||
      (r.job_id && r.job_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F8FAFC] text-[#0F172A] overflow-hidden">
      <GlobalTopNav />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 max-w-6xl w-full mx-auto">
        {/* View Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 gap-4">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Takeoff Runs
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Browse verified extraction packages, quantities summaries, and audit trails.
            </p>
          </div>

          <div className="flex items-center space-x-3">
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

        {/* Filter Bar */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Run ID or Project ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#006D84]/40"
            />
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Showing {filteredRuns.length} of {runs.length} run{runs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={fetchRuns}
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
            <span className="text-sm">Loading runs registry...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredRuns.length === 0 && (
          <div className="py-20 text-center workstation-card p-12 mt-6">
            <Layers className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="font-heading text-xl font-bold text-slate-800">
              No Runs Found
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
              {runs.length === 0
                ? 'No extraction runs have been executed yet. Run your first analysis to see takeoff results here.'
                : 'No runs matched your search criteria.'}
            </p>
            {runs.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="btn-primary"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Start New Analysis</span>
              </button>
            )}
          </div>
        )}

        {/* Runs Table */}
        {!isLoading && filteredRuns.length > 0 && (
          <div className="mt-6 workstation-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-mono text-[11px] text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-4 py-3">Run Identifier</th>
                    <th scope="col" className="px-4 py-3">Project</th>
                    <th scope="col" className="px-4 py-3 text-right">Pages</th>
                    <th scope="col" className="px-4 py-3 text-right">Components</th>
                    <th scope="col" className="px-4 py-3 text-right">Routes</th>
                    <th scope="col" className="px-4 py-3">Scale Status</th>
                    <th scope="col" className="px-4 py-3">Indexed At</th>
                    <th scope="col" className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {filteredRuns.map((r) => {
                    const dateStr = r.indexed_at
                      ? new Date(r.indexed_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—';

                    return (
                      <tr
                        key={r.run_id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/run/${encodeURIComponent(r.run_id)}`)}
                            className="text-[#006D84] hover:underline font-bold cursor-pointer"
                          >
                            {r.run_id}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {r.project_id}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-800">
                          {r.completed_page_count || r.total_pages || 1}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#EA580C]">
                          {r.total_objects}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#2563EB]">
                          {r.total_routes}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                              r.total_length !== null && r.total_length !== undefined
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {r.total_length !== null && r.total_length !== undefined ? (
                              <>
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>Verified</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Unverified (G3)</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                          {dateStr}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/run/${encodeURIComponent(r.run_id)}`)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold text-[#006D84] hover:text-[#005568] cursor-pointer"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
