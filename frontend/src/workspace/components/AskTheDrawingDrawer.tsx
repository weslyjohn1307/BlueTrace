import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Clock,
  AlertCircle,
  Key,
  Shield,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Ruler,
  Target,
  Info,
  Layers,
  Lock,
} from 'lucide-react';
import type { CopilotQueryResponse, CopilotQueryRequest } from '../../api/contracts';
import { apiClient } from '../../api/client';

export interface AskTheDrawingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  runId: string;
  currentSheetId?: string | null;
  sheetLabel?: string | null;
  selectedResultId?: string | null;
  selectedResultType?: 'object' | 'route' | null;
  onClearSelection?: () => void;
  isScaleCalibrated?: boolean;
  scaleRatioValue?: string | null;
  onOpenScaleCalibration?: () => void;
  onHighlightResult?: (id: string) => void;
  onHighlightMultipleResults?: (ids: string[]) => void;
  onFilterResultsTable?: (ids: string[]) => void;
}

interface QAPair {
  id: string;
  query: string;
  timestamp: string;
  mode: 'local' | 'byok';
  isLoading?: boolean;
  response?: CopilotQueryResponse;
  error?: string;
  isTraceExpanded?: boolean;
}

type BYOKProvider = 'openai' | 'anthropic' | 'gemini';

export const AskTheDrawingDrawer: React.FC<AskTheDrawingDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  runId,
  currentSheetId,
  sheetLabel,
  selectedResultId,
  selectedResultType,
  onClearSelection,
  isScaleCalibrated = false,
  scaleRatioValue,
  onOpenScaleCalibration,
  onHighlightResult,
  onHighlightMultipleResults,
  onFilterResultsTable,
}) => {
  // Mode state
  const [copilotMode, setCopilotMode] = useState<'local' | 'byok'>('local');

  // BYOK transient memory-only state (strictly discarded on unmount, never stored in localStorage/cookies)
  const [byokProvider, setByokProvider] = useState<BYOKProvider>('openai');
  const [byokModel, setByokModel] = useState('gpt-4o-mini');
  const [byokKey, setByokKey] = useState('');
  const [isByokModalOpen, setIsByokModalOpen] = useState(false);

  const [queryInput, setQueryInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  const [history, setHistory] = useState<QAPair[]>([
    {
      id: 'welcome',
      query: 'System Ready',
      timestamp: 'Just now',
      mode: 'local',
      response: {
        request_id: 'welcome-0',
        mode: 'local',
        mode_label: 'Local deterministic mode — no external language model',
        external_model_used: false,
        project_id: projectId,
        run_id: runId,
        deterministic_intent: 'system_greeting',
        response_status: 'OK',
        answer:
          'Ask questions about detected components, linear duct/pipe lengths, and drawing sheet scale status. All answers are queried directly from the verified SQLite index with zero LLM arithmetic hallucination.',
        canonical_result_ids: [],
        highlight_result_ids: [],
        safe_evidence_references: [],
        bounded_tool_call_trace: [],
      },
    },
  ]);

  useEffect(() => {
    if (isOpen) {
      scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, history]);

  // Cleanup BYOK key on unmount for strict memory-only security
  useEffect(() => {
    return () => {
      setByokKey('');
    };
  }, []);

  if (!isOpen) return null;

  // Context-sensitive prompt generator
  const getContextPrompts = (): string[] => {
    const prompts: string[] = [];

    if (selectedResultId) {
      prompts.push(`Explain selected item ${selectedResultId}`);
      prompts.push('Show detection confidence and method');
    }

    if (!isScaleCalibrated) {
      prompts.push('Why is linear measurement unavailable?');
      prompts.push('Which drawing sheets have unverified scale?');
    }

    prompts.push('How many Fire Dampers are detected on this sheet?');
    prompts.push('What component types were found?');
    prompts.push('What is the total linear duct length extracted?');

    return prompts.slice(0, 4);
  };

  const handleSubmit = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isSubmitting) return;

    const queryId = `q-${Date.now()}`;
    const newEntry: QAPair = {
      id: queryId,
      query: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: copilotMode,
      isLoading: true,
      isTraceExpanded: false,
    };

    setHistory((prev) => [...prev, newEntry]);
    setQueryInput('');
    setIsSubmitting(true);

    try {
      const payload: CopilotQueryRequest = {
        query: trimmed,
      };

      if (currentSheetId && currentSheetId.trim()) {
        payload.sheet_id = currentSheetId.trim();
      }

      if (selectedResultId && selectedResultId.trim()) {
        payload.target_id = selectedResultId.trim();
      }

      // Query deterministic local endpoint (always the arithmetic authority)
      const response = await apiClient.queryCopilot(projectId, runId, payload);

      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId
            ? { ...item, isLoading: false, response }
            : item
        )
      );

      // If response designates results for highlight, highlight first one automatically
      if (response.highlight_result_ids?.length && onHighlightResult) {
        onHighlightResult(response.highlight_result_ids[0]);
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : 'Deterministic copilot query failed.';
      setHistory((prev) =>
        prev.map((item) =>
          item.id === queryId
            ? { ...item, isLoading: false, error: errMsg }
            : item
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTrace = (id: string) => {
    setHistory((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isTraceExpanded: !item.isTraceExpanded } : item
      )
    );
  };

  return (
    <div
      role="complementary"
      aria-label="Ask the Drawing Assistant"
      className="fixed inset-y-0 right-0 z-40 w-100 bg-white shadow-2xl border-l border-slate-200 flex flex-col select-none animate-in slide-in-from-right duration-200"
    >
      {/* 1. Header with Title & Mode Switcher */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-md bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-heading text-xs font-bold text-slate-900 leading-none">
              Ask the Drawing
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              Level 3 Contextual Copilot
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mode Pill Toggle */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-md text-[10px] font-medium">
            <button
              type="button"
              onClick={() => setCopilotMode('local')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                copilotMode === 'local'
                  ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Keyless, 100% offline deterministic mode"
            >
              ⚡ Local
            </button>
            <button
              type="button"
              onClick={() => {
                setCopilotMode('byok');
                if (!byokKey) setIsByokModalOpen(true);
              }}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer flex items-center space-x-1 ${
                copilotMode === 'byok'
                  ? 'bg-white text-[#635BFF] shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Optional Bring-Your-Own-Key External LLM"
            >
              <Key className="w-2.5 h-2.5" />
              <span>BYOK</span>
            </button>
          </div>

          <button
            id="copilot-drawer-close-btn"
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Mode Notification Banner */}
      {copilotMode === 'local' ? (
        <div className="px-3 py-1 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between text-[10px] text-emerald-800">
          <span className="flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Local Deterministic Mode — Zero External Cost</span>
          </span>
          <span className="font-mono text-[9px] uppercase font-bold text-emerald-700">Offline</span>
        </div>
      ) : (
        <div className="px-3 py-1 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between text-[10px] text-indigo-900">
          <span className="flex items-center space-x-1">
            <Shield className="w-3 h-3 text-indigo-600" />
            <span>
              BYOK Mode ({byokProvider}: {byokModel})
            </span>
          </span>
          <button
            type="button"
            onClick={() => setIsByokModalOpen(true)}
            className="text-[10px] font-semibold text-indigo-700 hover:underline cursor-pointer"
          >
            {byokKey ? 'Configured' : 'Set Key'}
          </button>
        </div>
      )}

      {/* 3. Active Scope Chips Bar */}
      <div className="p-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center gap-1.5 shrink-0 text-[10px]">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px] mr-0.5">
          Scope:
        </span>

        {/* Sheet Chip */}
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-mono shadow-2xs">
          📄 {sheetLabel || currentSheetId || 'All Sheets'}
        </span>

        {/* Selected Component Chip */}
        {selectedResultId ? (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-mono shadow-2xs animate-in fade-in duration-150">
            <Target className="w-2.5 h-2.5 text-amber-600" />
            <span>{selectedResultId}</span>
            {selectedResultType && (
              <span className="text-[9px] text-amber-700 uppercase font-sans">
                ({selectedResultType})
              </span>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="hover:text-amber-950 p-0.5 rounded cursor-pointer"
                title="Clear selected target"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ) : (
          <span className="text-slate-400 italic">No item selected</span>
        )}

        {/* Scale Gating Chip */}
        <button
          type="button"
          onClick={onOpenScaleCalibration}
          className={`ml-auto inline-flex items-center space-x-1 px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors ${
            isScaleCalibrated
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
          }`}
          title={isScaleCalibrated ? 'Scale calibrated' : 'Click to calibrate scale'}
        >
          <Ruler className="w-2.5 h-2.5" />
          <span>{isScaleCalibrated ? scaleRatioValue : 'Scale Unverified'}</span>
        </button>
      </div>

      {/* 4. Context-Sensitive Suggested Prompts */}
      <div className="p-2.5 border-b border-slate-100 bg-slate-50/40 shrink-0 space-y-1">
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">
          Suggested Inquiries
        </span>
        <div className="flex flex-wrap gap-1">
          {getContextPrompts().map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleSubmit(prompt)}
              disabled={isSubmitting}
              className="text-left text-[10px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Transcript Area with 5-Part Answer Cards */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {history.map((item) => (
          <div key={item.id} className="space-y-2 text-xs">
            {/* User Question */}
            <div className="flex items-start justify-between bg-slate-100 rounded-lg p-2.5 text-slate-800 font-medium">
              <span className="leading-relaxed">{item.query}</span>
              <div className="flex items-center space-x-1 ml-2 shrink-0">
                {item.mode === 'byok' && (
                  <span className="px-1 rounded bg-indigo-100 text-indigo-700 font-mono text-[9px]">
                    BYOK
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-mono">
                  {item.timestamp}
                </span>
              </div>
            </div>

            {/* Answer State */}
            {item.isLoading ? (
              <div className="flex items-center space-x-2 text-slate-500 py-2.5 px-2 bg-slate-50 border border-slate-100 rounded-lg">
                <Clock className="w-3.5 h-3.5 animate-spin text-[#006D84]" />
                <span className="text-[11px] font-mono">
                  Querying verified SQLite extraction ledger...
                </span>
              </div>
            ) : item.error ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px]">
                <div className="flex items-center space-x-1.5 font-semibold mb-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Query Error</span>
                </div>
                <span>{item.error}</span>
              </div>
            ) : item.response ? (
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs">
                {/* Status Badges */}
                {item.response.response_status === 'UNSUPPORTED' && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px] flex items-start space-x-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      This query is outside Level 3 extraction scope. Quantities, counts, and route lengths are supported.
                    </span>
                  </div>
                )}

                {/* 1. Direct Answer */}
                <p className="text-slate-900 font-sans text-xs leading-relaxed font-medium">
                  {item.response.answer}
                </p>

                {/* 2. Numerical Unit & Value Status Pill */}
                {item.response.unit && (
                  <div className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                    Unit: {item.response.unit}
                    {item.response.numerical_value !== null && item.response.numerical_value !== undefined && (
                      <span> · Count/Value: {item.response.numerical_value}</span>
                    )}
                  </div>
                )}

                {/* 3. Interactive Drawing & Ledger Actions */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
                  {item.response.canonical_result_ids?.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const ids = item.response!.canonical_result_ids;
                          if (ids.length && onHighlightResult) {
                            onHighlightResult(ids[0]);
                          }
                          if (ids.length && onHighlightMultipleResults) {
                            onHighlightMultipleResults(ids);
                          }
                        }}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-[#006D84]/10 hover:bg-[#006D84]/20 text-[#006D84] font-medium text-[10px] transition-colors cursor-pointer"
                      >
                        <Target className="w-3 h-3" />
                        <span>Show {item.response.canonical_result_ids.length} on drawing</span>
                      </button>

                      {onFilterResultsTable && (
                        <button
                          type="button"
                          onClick={() => onFilterResultsTable(item.response!.canonical_result_ids)}
                          className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[10px] transition-colors cursor-pointer"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Filter Ledger</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* If length unavailable due to scale, offer calibration CTA */}
                  {item.response.answer.toLowerCase().includes('scale') && onOpenScaleCalibration && (
                    <button
                      type="button"
                      onClick={onOpenScaleCalibration}
                      className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium text-[10px] transition-colors cursor-pointer"
                    >
                      <Ruler className="w-3 h-3" />
                      <span>Calibrate Drawing Scale</span>
                    </button>
                  )}
                </div>

                {/* 4. Evidence Citations List */}
                {item.response.canonical_result_ids?.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-100 space-y-1">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Evidence Sources ({item.response.canonical_result_ids.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {item.response.canonical_result_ids.slice(0, 8).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onHighlightResult?.(id)}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-sky-100 border border-slate-200 hover:border-sky-300 text-slate-700 hover:text-[#006D84] font-mono text-[9px] transition-colors cursor-pointer"
                          title="Focus item on drawing"
                        >
                          {id}
                        </button>
                      ))}
                      {item.response.canonical_result_ids.length > 8 && (
                        <span className="text-[9px] text-slate-400 self-center font-mono">
                          +{item.response.canonical_result_ids.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. Collapsible Method & Tool Trace Disclosure */}
                <div className="pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => toggleTrace(item.id)}
                    className="w-full flex items-center justify-between text-[9px] text-slate-500 font-mono hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-1">
                      <span className="font-semibold text-emerald-700">● 100% Deterministic</span>
                      <span>· Tool: {item.response.deterministic_intent}</span>
                    </span>
                    {item.isTraceExpanded ? (
                      <ChevronUp className="w-3 h-3 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    )}
                  </button>

                  {item.isTraceExpanded && (
                    <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200 text-[9px] font-mono space-y-1.5 text-slate-600 animate-in fade-in duration-100">
                      <div className="flex justify-between">
                        <span>Request ID:</span>
                        <span className="font-bold text-slate-800">{item.response.request_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tool Intent:</span>
                        <span className="text-emerald-700 font-bold">{item.response.deterministic_intent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Response Status:</span>
                        <span className="font-semibold">{item.response.response_status}</span>
                      </div>
                      {item.response.bounded_tool_call_trace?.[0]?.duration_ms !== undefined && (
                        <div className="flex justify-between">
                          <span>Execution Duration:</span>
                          <span>{item.response.bounded_tool_call_trace[0].duration_ms} ms</span>
                        </div>
                      )}
                      {item.response.safe_evidence_references?.[0]?.sha256 && (
                        <div className="flex justify-between">
                          <span>Evidence SHA-256:</span>
                          <span title={item.response.safe_evidence_references[0].sha256}>
                            {item.response.safe_evidence_references[0].sha256.substring(0, 12)}...
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>External Model:</span>
                        <span>{item.response.external_model_used ? 'Yes' : 'None (Offline Tool)'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        <div ref={scrollBottomRef} />
      </div>

      {/* 6. Query Input Form */}
      <div className="p-3 border-t border-slate-200 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(queryInput);
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            disabled={isSubmitting}
            placeholder={
              selectedResultId
                ? `Ask about ${selectedResultId}...`
                : 'Ask a question about this drawing...'
            }
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#006D84] placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!queryInput.trim() || isSubmitting}
            className="p-1.5 bg-[#006D84] hover:bg-[#005769] disabled:opacity-40 text-white rounded-md transition-colors cursor-pointer shadow-2xs"
            title="Submit query"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* 7. Ephemeral BYOK Configuration Modal */}
      {isByokModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-[#635BFF] flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-heading text-sm font-bold text-slate-900">
                    BYOK External LLM
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Bring-Your-Own-Key Configuration
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsByokModalOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Strict Memory-Only Privacy Disclosure */}
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg text-indigo-950 text-[11px] space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-indigo-900">
                <Lock className="w-3 h-3 text-indigo-600" />
                <span>Strict Memory-Only Security</span>
              </div>
              <p className="text-[10px] text-indigo-800 leading-relaxed">
                Your key exists strictly in React component RAM for this active session. It is NEVER written to localStorage, cookies, logs, or disk. Discarded immediately upon tab close or mode reset.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Provider
                </label>
                <select
                  value={byokProvider}
                  onChange={(e) => {
                    const p = e.target.value as BYOKProvider;
                    setByokProvider(p);
                    if (p === 'openai') setByokModel('gpt-4o-mini');
                    else if (p === 'anthropic') setByokModel('claude-3-5-haiku');
                    else if (p === 'gemini') setByokModel('gemini-1.5-flash');
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={byokModel}
                  onChange={(e) => setByokModel(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={byokKey}
                  onChange={(e) => setByokKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setByokKey('');
                  setCopilotMode('local');
                  setIsByokModalOpen(false);
                }}
                className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-md font-medium cursor-pointer"
              >
                Clear Key & Revert
              </button>
              <button
                type="button"
                onClick={() => setIsByokModalOpen(false)}
                className="px-4 py-1.5 text-xs bg-[#635BFF] hover:bg-[#5249ea] text-white rounded-md font-medium cursor-pointer shadow-xs"
              >
                Apply for Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
