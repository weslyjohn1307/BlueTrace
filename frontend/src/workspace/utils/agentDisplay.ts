const AGENT_DISPLAY_NAMES: Record<string, string> = {
  agent_00_orchestrator: 'Sheet Auditor',
  agent_01_recon: 'Sheet Reader',
  agent_02_finder: 'Component Finder',
  agent_02_finder_l1: 'Component Finder',
  agent_03_tracer: 'Vector Tracer',
  agent_03_tracer_l2: 'Vector Tracer',
  agent_04_reconciler: 'Schedule Reader',
  agent_05_watchdog: 'Quality Review',
  agent_06_copilot_judge: 'Engineering Copilot',
};

/** Map internal agent ids to stable product roles; never leak a raw id. */
export function agentDisplayName(agentId?: string | null): string {
  if (!agentId) return 'Sheet team';
  return AGENT_DISPLAY_NAMES[agentId] ?? 'Sheet team';
}

/** Turn an internal progress string into a plain description of the work. */
export function progressDisplayMessage(message?: string | null): string {
  const value = message ?? '';
  if (/muse-spark|vision|legend|symbol/i.test(value)) return 'Reviewing sheet imagery and component evidence';
  if (/topology extraction is still running|linework tracing/i.test(value)) return 'Tracing vector linework and connections';
  if (/extracted (\d+) raw linework runs/i.test(value)) return 'Found candidate linework for engineer review';
  if (/semantic labeling/i.test(value)) return 'Checking route and system labels';
  if (/scale|not to scale/i.test(value)) return 'Checking printed scale evidence';
  if (/schedule/i.test(value)) return 'Reading schedule rows';
  if (/classified|sheet_discovered/i.test(value)) return 'Classifying this sheet';
  if (/persisted|emitted/i.test(value)) return 'Saving takeoff evidence';
  return 'Reviewing drawing evidence';
}
