import React, { useState } from 'react';
import { Send, BrainCircuit, AlertTriangle, Cpu, ChevronDown, ChevronRight, MapPin, Terminal } from 'lucide-react';
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

function parseInlineMarkdown(text: string, onEvidence?: (boxes: number[][]) => void): React.ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*\](?:\s*pt)?)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-bt-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-bt-inset px-1 py-0.5 rounded text-cyan-300 font-mono text-[11px] border border-bt-border-subtle">
          {part.slice(1, -1)}
        </code>
      );
    }
    const coordMatch = part.match(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/);
    if (coordMatch) {
      const x = parseFloat(coordMatch[1]);
      const y = parseFloat(coordMatch[2]);
      return (
        <button
          key={i}
          type="button"
          onClick={() => onEvidence?.([[x, y]])}
          className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] hover:bg-cyan-900 transition-colors cursor-pointer align-baseline"
          title={`Highlight coordinate [${x}, ${y}] on drawing canvas`}
        >
          <MapPin className="w-2.5 h-2.5 inline" />
          <span>[{x.toFixed(0)}, {y.toFixed(0)}] pt</span>
        </button>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function MarkdownContent({ text, onEvidence }: { text: string; onEvidence?: (boxes: number[][]) => void }) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown Table: header line with pipes, followed by divider line
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('|') &&
      lines[i + 1].includes('-')
    ) {
      const headerRow = trimmed.split('|').map((s) => s.trim()).filter(Boolean);
      i += 2; // skip header and divider
      const bodyRows: string[][] = [];

      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const row = lines[i].trim().split('|').map((s) => s.trim()).filter(Boolean);
        bodyRows.push(row);
        i++;
      }

      blocks.push(
        <div key={`table-${i}`} className="overflow-x-auto my-2 rounded-lg border border-bt-border-strong bg-bt-inset/70 shadow-inner">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-bt-border-strong bg-bt-surface/90 text-cyan-300 font-semibold">
                {headerRow.map((h, colIdx) => (
                  <th key={colIdx} className="px-2.5 py-1.5 border-r border-bt-border-subtle last:border-r-0 whitespace-nowrap">
                    {parseInlineMarkdown(h, onEvidence)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-bt-border-subtle/60 hover:bg-bt-panel/40 transition-colors">
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className="px-2.5 py-1 border-r border-bt-border-subtle/40 last:border-r-0 tabular-nums text-bt-text-primary">
                      {parseInlineMarkdown(cell, onEvidence)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${i}`} className="font-bold text-cyan-300 font-mono text-[11px] uppercase tracking-wider mt-2 mb-1">
          {parseInlineMarkdown(trimmed.replace(/^###\s+/, ''), onEvidence)}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="font-bold text-bt-on-brand font-mono text-xs uppercase tracking-wider mt-2.5 mb-1 border-b border-bt-border-subtle pb-0.5">
          {parseInlineMarkdown(trimmed.replace(/^##\s+/, ''), onEvidence)}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="font-bold text-bt-on-brand font-mono text-sm tracking-tight mt-3 mb-1.5">
          {parseInlineMarkdown(trimmed.replace(/^#\s+/, ''), onEvidence)}
        </h2>
      );
      i++;
      continue;
    }

    // Bullet lists (- or * or •)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start space-x-1.5 text-bt-text-primary leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
              <span>{parseInlineMarkdown(item, onEvidence)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered lists (1. 2. etc.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start space-x-2 text-bt-text-primary leading-relaxed">
              <span className="text-cyan-400 font-mono font-bold text-[10px] shrink-0 mt-0.5">{idx + 1}.</span>
              <span>{parseInlineMarkdown(item, onEvidence)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={`p-${i}`} className="my-1 leading-relaxed text-bt-text-primary">
        {parseInlineMarkdown(trimmed, onEvidence)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1 text-bt-text-primary">{blocks}</div>;
}

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
          'Reading the open sheet region',
          'Checking scale evidence for this sheet',
          'Gathering cited evidence for the answer',
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
    <div className="flex flex-col h-full bg-bt-surface text-bt-text-primary text-xs" data-testid="copilot-panel">
      {/* Panel header: role and evidence basis, never a model name. */}
      <div className="px-3 py-2 bg-bt-inset/80 border-b border-bt-border-subtle flex items-center justify-between text-[10px] font-mono select-none">
        <div className="flex items-center space-x-1.5 text-cyan-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="font-semibold tracking-wider">Engineering Copilot</span>
        </div>
        <span className="text-bt-text-tertiary">Cites sheet evidence</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-4">
            <div className="text-bt-text-secondary text-center font-mono text-xs px-2">
              Ask about this drawing sheet — counts, footage, CFM balance, or physical scale.
            </div>

            {/* Quick Prompt Composer Chips */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono text-bt-text-tertiary uppercase tracking-wider px-1">
                Suggested questions
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendQuery(prompt)}
                    disabled={busy || !sheetId}
                    className="text-left px-2.5 py-2 rounded-lg bg-bt-panel/80 hover:bg-bt-panel/80 border border-bt-border-strong/70 hover:border-cyan-500/40 text-bt-text-secondary hover:text-bt-on-brand transition-all duration-150 active:scale-[0.98] text-xs font-mono disabled:opacity-50 cursor-pointer flex items-center justify-between group"
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
              <div className="inline-block max-w-[90%] px-3 py-2 rounded-lg bg-cyan-900/60 border border-cyan-500/30 text-bt-on-brand font-mono text-xs text-left">
                {msg.text}
              </div>
            )}

            {/* Assistant Response Card */}
            {msg.role === 'assistant' && (
              <div className="space-y-2 max-w-[95%]">
                {/* Reasoning / Chain of Thought Accordion */}
                {msg.thoughtChain && msg.thoughtChain.length > 0 && (
                  <div className="rounded-lg border border-bt-border-subtle bg-bt-inset/60 overflow-hidden font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => toggleThought(msg.id)}
                      className="w-full px-2.5 py-1.5 flex items-center justify-between text-bt-text-secondary hover:text-bt-text-primary bg-bt-surface/40 cursor-pointer"
                    >
                      <span className="flex items-center space-x-1.5 text-cyan-400 font-semibold">
                        <BrainCircuit className="w-3.5 h-3.5" />
                        <span>Working notes ({msg.thoughtChain.length} steps)</span>
                      </span>
                      {expandedThoughts[msg.id] ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                    {expandedThoughts[msg.id] && (
                      <div className="p-2 space-y-1 text-bt-text-secondary border-t border-bt-border-subtle/80 bg-bt-inset">
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
                <div className="p-3 rounded-lg bg-bt-panel/90 border border-bt-border-strong/80 text-bt-text-primary leading-relaxed font-sans text-xs">
                  {msg.text ? (
                    <MarkdownContent text={msg.text} onEvidence={onEvidence} />
                  ) : msg.streaming ? (
                    <div className="flex items-center space-x-2 text-cyan-300 font-mono text-[11px]">
                      <BrainCircuit className="w-4 h-4 text-bt-brand" />
                      <span>Reading sheet evidence…</span>
                    </div>
                  ) : null}
                </div>

                {/* Inline Citations Group */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-bt-text-tertiary self-center">Evidence Citations:</span>
                    {msg.citations.map((cite, idx) => (
                      <button
                        key={`${cite[0]}-${cite[1]}-${idx}`}
                        type="button"
                        onClick={() => onEvidence([cite])}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] hover:bg-cyan-900 transition-all duration-150 active:scale-[0.96] cursor-pointer"
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
                      <span
                        className="flex items-center space-x-1 text-cyan-300 font-semibold"
                        title="Answered with Meta assistance using this package evidence."
                      >
                        <BrainCircuit className="w-3.5 h-3.5 text-bt-brand" />
                        <span>AI answer</span>
                      </span>
                    ) : (
                      <span
                        className="flex items-center space-x-1 text-bt-text-secondary"
                        title="Answered from local geometry and ledger evidence without a Meta call."
                      >
                        <Cpu className="w-3 h-3" />
                        <span>Local answer</span>
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
      <div className="p-2.5 border-t border-bt-border-subtle bg-bt-inset/60 flex space-x-2">
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
          className="flex-1 px-3 py-2 rounded-lg bg-bt-surface border border-bt-border-strong/80 text-bt-text-primary placeholder:text-bt-text-tertiary font-mono text-base sm:text-xs outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void sendQuery(input)}
          disabled={busy || !sheetId || input.trim() === ''}
          aria-label="Send"
          className="px-3.5 rounded-lg bg-[#005BFF] hover:bg-[#0047cc] text-bt-on-brand font-mono text-xs disabled:opacity-40 cursor-pointer transition-all duration-150 active:scale-[0.97] flex items-center justify-center shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
