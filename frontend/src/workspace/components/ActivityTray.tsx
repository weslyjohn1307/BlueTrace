import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import type { OrchestrateAgentResponse } from '../../api/contracts';
import type { AgentJobProgress } from '../hooks/useTakeoffSession';
import { agentDisplayName, progressDisplayMessage } from '../utils/agentDisplay';

const AGENT_ORDER = [
  'agent_00_orchestrator',
  'agent_01_recon',
  'agent_02_finder_l1',
  'agent_03_tracer_l2',
  'agent_04_reconciler',
] as const;

const AGENT_ROLE: Record<string, string> = {
  agent_00_orchestrator: 'Coordinates package review and scale gates',
  agent_01_recon: 'Reads sheet titles, discipline and scale evidence',
  agent_02_finder_l1: 'Checks plan symbols against legend evidence',
  agent_03_tracer_l2: 'Traces vector routes and connected linework',
  agent_04_reconciler: 'Reads schedules and checks plan matches',
};

function canonicalAgentId(agentId: string): string {
  if (agentId === 'agent_02_finder') return 'agent_02_finder_l1';
  if (agentId === 'agent_03_tracer') return 'agent_03_tracer_l2';
  return agentId;
}

function agentRoster(progress: AgentJobProgress) {
  const assigned = new Set<string>();
  const status = new Map<string, 'queued' | 'working' | 'complete' | 'review'>();
  for (const event of progress.events ?? []) {
    const payload = event.payload ?? {};
    if (event.event_type === 'sheet_classified' && Array.isArray(payload.target_agents)) {
      for (const agent of payload.target_agents) if (typeof agent === 'string') assigned.add(canonicalAgentId(agent));
    }
    if (event.event_type === 'agent_dispatched' && typeof payload.target_agent === 'string') {
      const id = canonicalAgentId(payload.target_agent);
      assigned.add(id);
      status.set(id, 'queued');
    }
    if (event.event_type === 'agent_completed' && typeof payload.agent_id === 'string') {
      const id = canonicalAgentId(payload.agent_id);
      assigned.add(id);
      status.set(id, 'complete');
    }
    const eventAgentId = canonicalAgentId(event.agent_id);
    if (AGENT_ORDER.includes(eventAgentId as typeof AGENT_ORDER[number])) {
      assigned.add(eventAgentId);
      if (event.event_type === 'failed') status.set(eventAgentId, 'review');
      else if (event.event_type === 'started' || event.event_type === 'progress') status.set(eventAgentId, 'working');
      else if (event.event_type === 'completed' && !event.job_terminal) status.set(eventAgentId, 'complete');
    }
  }
  assigned.add('agent_00_orchestrator');
  if (progress.status === 'complete') status.set('agent_00_orchestrator', 'complete');
  else if (progress.currentAgent === 'agent_00_orchestrator') status.set('agent_00_orchestrator', 'working');
  return AGENT_ORDER.filter((id) => assigned.has(id)).map((id) => ({
    id,
    name: agentDisplayName(id),
    role: AGENT_ROLE[id],
    status: status.get(id) ?? (progress.status === 'complete' ? 'complete' : 'queued'),
  }));
}

const STATUS_LABEL = { queued: 'Queued', working: 'Working', complete: 'Complete', review: 'Needs review' } as const;

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
    ? `${progress.analysisScope === 'vision' ? 'Vision pass' : 'Sheet audit'}: ${agentDisplayName(progress.currentAgent)}, ${
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
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-bt-text-secondary transition-colors hover:bg-bt-panel/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bt-focus"
      >
        <Activity className="h-3.5 w-3.5 shrink-0 text-bt-brand" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {running ? (
          <span className="shrink-0 rounded border border-bt-info-border bg-bt-info-bg px-1.5 py-0.5 text-xs text-bt-info">
            Running
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
          {progress ? (
            <div data-testid="agent-job-progress" role="status" aria-live="polite">
              <p className="text-xs text-bt-text-secondary">
                {progress.classifiedPages} of {progress.totalPages ?? '—'} pages classified. {progress.detections} items saved for review and {progress.reviewFlags} review flags raised.
              </p>
              <div className="mt-2 border-t border-bt-border-subtle pt-2">
                <h3 className="text-xs font-medium text-bt-text-primary">Agent assignments</h3>
                <ol className="mt-1 space-y-1.5">
                  {agentRoster(progress).map((agent, index) => (
                    <li key={agent.id} className="flex items-start gap-2 text-xs">
                      <span className="w-5 shrink-0 font-mono tabular-nums text-bt-text-tertiary">{String(index).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-bt-text-primary">{agent.name}</span>
                        <span className="block text-bt-text-tertiary">{agent.role}</span>
                      </span>
                      <span className={agent.status === 'working' ? 'text-bt-info' : agent.status === 'complete' ? 'text-bt-success' : agent.status === 'review' ? 'text-bt-review' : 'text-bt-text-tertiary'}>
                        {STATUS_LABEL[agent.status]}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-bt-text-secondary">
                  {running
                    ? `${agentDisplayName(progress.currentAgent)}: ${progressDisplayMessage(progress.currentMessage)}`
                    : progress.status === 'complete'
                      ? 'Package audit complete.'
                      : progress.status === 'paused'
                        ? progress.currentMessage
                        : 'The audit stopped with an error. Review the message above and resume if possible.'}
                </p>
              </div>
            </div>
          ) : null}

          {run ? (
            <div className="mt-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-bt-text-tertiary">
                Sheet routes
              </h3>
              {run.routes.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs text-bt-text-secondary" aria-label="Agent sheet routing results">
                  {run.routes.map((route, index) => {
                    const targetAgents = Array.isArray(route.target_agents)
                      ? route.target_agents.filter((agent): agent is string => typeof agent === 'string')
                      : [];
                    return (
                      <li key={`${String(route.sheet_id ?? index)}-${index}`}>
                        Page {Number(route.page_index ?? index) + 1}:{' '}
                        {String(route.sheet_type ?? 'unclassified')},{' '}
                        {String(route.sheet_type ?? '').toLowerCase() === 'legend'
                          ? 'legend context for plan review'
                          : targetAgents.length
                          ? targetAgents.map((agent) => agentDisplayName(agent)).join(', ')
                          : 'no specialist work required'}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-bt-text-tertiary">No sheet routes were reported.</p>
              )}

              {run.flags.length > 0 ? (
                <>
                  <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-bt-text-tertiary">
                    Review flags
                  </h3>
                  <ul className="mt-1 space-y-1 text-xs text-bt-review" aria-label="Agent review flags">
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
