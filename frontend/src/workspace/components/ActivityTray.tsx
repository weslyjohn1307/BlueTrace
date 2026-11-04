import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import type { OrchestrateAgentResponse } from '../../api/contracts';
import type { AgentJobProgress } from '../hooks/useTakeoffSession';
import { agentDisplayName, progressDisplayMessage } from '../utils/agentDisplay';

export interface ActivityTrayProps {
  progress: AgentJobProgress | null;
  run: OrchestrateAgentResponse | null;
  running: boolean;
}

/**
 * One collapsible activity strip for real agent work. Collapsed when idle, it
 * shows what is happening now; expanded, it lists sheet routes and review
 * flags without taking canvas height away permanently.
 */
export const ActivityTray: React.FC<ActivityTrayProps> = ({ progress, run, running }) => {
  const [open, setOpen] = useState(false);

  if (!progress && !run) return null;

  const summary = running && progress
    ? `Sheet audit: ${agentDisplayName(progress.currentAgent)}, ${
        progress.totalPages
          ? `${progress.classifiedPages} of ${progress.totalPages} pages classified`
          : `${progress.classifiedPages} pages classified`
      }`
    : run
      ? `Last run: ${run.sheets_processed} sheets read, ${run.routes.length} sheet routes, ${run.flags.length} review flags`
      : 'Sheet audit finished';

  return (
    <section
      className="shrink-0 border-t border-bt-border-subtle bg-bt-surface"
      aria-label="Agent activity"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-bt-text-secondary transition-colors hover:bg-bt-panel/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#37C6FF]"
      >
        <Activity className="h-3.5 w-3.5 shrink-0 text-[#37C6FF]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {running ? (
          <span className="shrink-0 rounded border border-[#37C6FF]/30 bg-[#37C6FF]/10 px-1.5 py-0.5 text-[10px] text-[#9BDCFF]">
            Working
          </span>
        ) : null}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-bt-text-tertiary" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-bt-text-tertiary" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="max-h-56 overflow-y-auto border-t border-bt-border-subtle/70 px-3 py-2">
          {running && progress ? (
            <div data-testid="agent-job-progress" role="status" aria-live="polite">
              <p className="text-[11px] text-bt-text-secondary">
                {progress.detections} takeoff items proposed, {progress.reviewFlags} review flags
              </p>
              <p className="mt-1 text-[11px] text-bt-text-tertiary">
                {agentDisplayName(progress.currentAgent)}: {progressDisplayMessage(progress.currentMessage)}
              </p>
            </div>
          ) : null}

          {run ? (
            <div className="mt-2">
              <h3 className="text-[10px] font-medium uppercase tracking-wide text-bt-text-tertiary">
                Sheet routes
              </h3>
              {run.routes.length > 0 ? (
                <ul className="mt-1 space-y-1 text-[11px] text-bt-text-secondary" aria-label="Agent sheet routing results">
                  {run.routes.map((route, index) => {
                    const targetAgents = Array.isArray(route.target_agents)
                      ? route.target_agents.filter((agent): agent is string => typeof agent === 'string')
                      : [];
                    return (
                      <li key={`${String(route.sheet_id ?? index)}-${index}`}>
                        Page {Number(route.page_index ?? index) + 1}:{' '}
                        {String(route.sheet_type ?? 'unclassified')},{' '}
                        {targetAgents.length
                          ? targetAgents.map((agent) => agentDisplayName(agent)).join(', ')
                          : 'no specialist work required'}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-bt-text-tertiary">No sheet routes were reported.</p>
              )}

              {run.flags.length > 0 ? (
                <>
                  <h3 className="mt-3 text-[10px] font-medium uppercase tracking-wide text-bt-text-tertiary">
                    Review flags
                  </h3>
                  <ul className="mt-1 space-y-1 text-[11px] text-amber-200" aria-label="Agent review flags">
                    {run.flags.map((flag, index) => (
                      <li key={String(flag.flag_id ?? index)}>
                        {String(flag.message ?? flag.type ?? 'Review required')}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};
