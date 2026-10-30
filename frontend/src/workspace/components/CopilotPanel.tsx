import React, { useState } from 'react';
import { Send, Sparkles, AlertTriangle, Cpu, ChevronDown, ChevronRight, MapPin, Terminal } from 'lucide-react';
import { apiClient } from '../../api/client';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  modelUsed: boolean;
  scaleVerified: boolean;
  streaming?: boolean;
  citations?: number[][];
  thoughtChain?: string[];
}

export interface CopilotPanelProps {
  sheetId: string | null;
  onEvidence: (boxes: number[][]) => void;
}

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}

const QUICK_PROMPTS = [
  'Count all VAV terminal units on this floor',
  'What is the total supply air CFM airflow?',
  'Check for non-compliant duct aspect ratios (> 4:1)',
  'Summarize duct linear footage by dimension',
];

export const CopilotPanel: React.FC<CopilotPanelProps> = ({ sheetId, onEvidence }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  const toggleThought = (id: string) => {
    setExpandedThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sendQuery = async (queryText: string) => {
    const query = queryText.trim();
    if (!query || busy) return;
    setInput('');
    setError(null);
    setBusy(true);

    const userMsg: CopilotMessage = {
      id: nextId(),
      role: 'user',
      text: query,
      modelUsed: false,
      scaleVerified: true,
    };
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        text: '',
        modelUsed: false,
        scaleVerified: false,
        streaming: true,
        thoughtChain: [
          'Analyzing sheet vector coordinate space',
          'Cross-referencing verified title block scale',
          'Evaluating spatial geometry with muse-wonder-1.0',
        ],
      },
    ]);
    setExpandedThoughts((prev) => ({ ...prev, [assistantId]: true }));

    const patchAssistant = (patch: Partial<CopilotMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

    try {
      const terminal = await apiClient.streamCopilot(query, sheetId, (text, done) => {
        if (!done) patchAssistant({ text });
      });
      patchAssistant({
        text: terminal.answer,
        modelUsed: terminal.model_used,
        scaleVerified: terminal.scale_verified,
        streaming: false,
        citations: terminal.cited_coordinates ?? [],
      });
      if (terminal.cited_coordinates && terminal.cited_coordinates.length > 0) {
        onEvidence(terminal.cited_coordinates);
      }
    } catch {
      // Streaming failed — fall back to one-shot endpoint
      try {
        const res = await apiClient.queryCopilot(query, sheetId);
        patchAssistant({
          text: res.answer,
          modelUsed: res.model_used,
          scaleVerified: res.scale_verified,
          streaming: false,
          citations: res.cited_coordinates ?? [],
        });
        if (res.cited_coordinates && res.cited_coordinates.length > 0) {
          onEvidence(res.cited_coordinates);
        }
      } catch (err: unknown) {
        patchAssistant({ text: '', streaming: false });
        setError(err instanceof Error ? err.message : 'Copilot query failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 text-xs" data-testid="copilot-panel">
      {/* Telemetry Header */}
      <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-[10px] font-mono select-none">
        <div className="flex items-center space-x-1.5 text-cyan-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-semibold tracking-wider">MUSE-WONDER-1.0 // COPILOT</span>
        </div>
        <span className="text-slate-500">REASONING: HIGH</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-4">
            <div className="text-slate-400 text-center font-mono text-xs px-2">
              Ask about this drawing sheet — counts, footage, CFM balance, or physical scale.
            </div>

            {/* Quick Prompt Composer Chips */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider px-1">
                Suggested Telemetry Queries:
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendQuery(prompt)}
                    disabled={busy || !sheetId}
                    className="text-left px-2.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 hover:border-cyan-500/40 text-slate-300 hover:text-white transition-all text-xs font-mono disabled:opacity-50 cursor-pointer flex items-center justify-between group"
                  >
                    <span>{prompt}</span>
                    <span className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
            {/* User Query Bubble */}
            {msg.role === 'user' && (
              <div className="inline-block max-w-[90%] px-3 py-2 rounded-lg bg-cyan-900/60 border border-cyan-500/30 text-white font-mono text-xs text-left shadow-[0_0_15px_rgba(8,145,178,0.2)]">
                {msg.text}
              </div>
            )}

            {/* Assistant Response Card */}
            {msg.role === 'assistant' && (
              <div className="space-y-2 max-w-[95%]">
                {/* Reasoning / Chain of Thought Accordion */}
                {msg.thoughtChain && msg.thoughtChain.length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => toggleThought(msg.id)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-slate-400 hover:text-slate-200 bg-slate-900/40 cursor-pointer"
                    >
                      <span className="flex items-center space-x-1.5 text-cyan-400 font-semibold">
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        <span>Chain of Thought ({msg.thoughtChain.length} steps)</span>
                      </span>
                      {expandedThoughts[msg.id] ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    {expandedThoughts[msg.id] && (
                      <div className="p-2 space-y-1 text-slate-400 border-t border-slate-800/80 bg-slate-950">
                        {msg.thoughtChain.map((step, idx) => (
                          <div key={step} className="flex items-center space-x-2 text-[10px]">
                            <span className="text-cyan-400 font-bold">{idx + 1}.</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant Output Content */}
                <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700/80 text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {msg.text || (msg.streaming ? 'Synthesizing verified spatial response…' : '')}
                </div>

                {/* Inline Citations Group */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-slate-500 self-center">Evidence Citations:</span>
                    {msg.citations.map((cite, idx) => (
                      <button
                        key={`${cite[0]}-${cite[1]}-${idx}`}
                        type="button"
                        onClick={() => onEvidence([cite])}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] hover:bg-cyan-900 transition-colors cursor-pointer"
                        title="Highlight on drawing canvas"
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        <span>
                          [{cite[0]?.toFixed(0)}, {cite[1]?.toFixed(0)}] pt
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Status Telemetry Footer */}
                {!msg.streaming && (
                  <div className="flex items-center space-x-2 text-[10px] font-mono pt-0.5">
                    {msg.modelUsed ? (
                      <span className="flex items-center space-x-1 text-cyan-300 font-semibold">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>MUSE-WONDER-1.0</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-slate-400">
                        <Cpu className="w-3 h-3" />
                        <span>deterministic fallback</span>
                      </span>
                    )}
                    {!msg.scaleVerified && (
                      <span className="flex items-center space-x-1 text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span>scale unverified</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 font-mono text-xs" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Input Composer Dock */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/60 flex space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void sendQuery(input);
          }}
          placeholder={sheetId ? 'Ask copilot about ductwork, scale, or equipment…' : 'Open a sheet first…'}
          disabled={busy || !sheetId}
          aria-label="Copilot question"
          className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-100 placeholder:text-slate-500 font-mono text-xs outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void sendQuery(input)}
          disabled={busy || !sheetId || input.trim() === ''}
          aria-label="Send"
          className="px-3.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs disabled:opacity-40 cursor-pointer transition-all shadow-[0_0_12px_rgba(8,145,178,0.3)] flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
