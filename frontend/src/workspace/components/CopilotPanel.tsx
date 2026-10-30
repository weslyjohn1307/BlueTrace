import React, { useState } from 'react';
import { Send, Sparkles, AlertTriangle, Cpu } from 'lucide-react';
import { apiClient } from '../../api/client';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  modelUsed: boolean;
  scaleVerified: boolean;
  streaming?: boolean;
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

export const CopilotPanel: React.FC<CopilotPanelProps> = ({ sheetId, onEvidence }) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const query = input.trim();
    if (!query || busy) return;
    setInput('');
    setError(null);
    setBusy(true);
    const userMsg: CopilotMessage = { id: nextId(), role: 'user', text: query, modelUsed: false, scaleVerified: true };
    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', text: '', modelUsed: false, scaleVerified: false, streaming: true },
    ]);

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
      });
      onEvidence(terminal.cited_coordinates ?? []);
    } catch {
      // Streaming failed (offline backend, proxy buffering) — fall back to one-shot.
      try {
        const res = await apiClient.queryCopilot(query, sheetId);
        patchAssistant({
          text: res.answer,
          modelUsed: res.model_used,
          scaleVerified: res.scale_verified,
          streaming: false,
        });
        onEvidence(res.cited_coordinates ?? []);
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
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-slate-500 italic text-center pt-6 px-2">
            Ask about this sheet — counts, footage, scale. Answers cite drawing coordinates.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[95%] px-3 py-2 rounded-lg text-left whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-cyan-800/60 text-white' : 'bg-slate-800 text-slate-100'
              }`}
            >
              {msg.text || (msg.streaming ? '…' : '')}
            </div>
            {msg.role === 'assistant' && !msg.streaming && (
              <div className="flex items-center space-x-2 mt-1 text-[10px] font-mono">
                {msg.modelUsed ? (
                  <span className="flex items-center space-x-1 text-cyan-300">
                    <Sparkles className="w-3 h-3" />
                    <span>muse-wonder-1.0</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-slate-400">
                    <Cpu className="w-3 h-3" />
                    <span>offline template</span>
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
        ))}
        {error && (
          <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="p-2 border-t border-slate-800 flex space-x-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder={sheetId ? 'Ask about this sheet…' : 'Open a sheet first…'}
          disabled={busy || !sheetId}
          aria-label="Copilot question"
          className="flex-1 px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !sheetId || input.trim() === ''}
          aria-label="Send"
          className="px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
