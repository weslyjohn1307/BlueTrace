import React, { useState } from 'react';
import { MessageSquare, Database, Cpu, CheckCircle2, ShieldCheck, Play } from 'lucide-react';

interface SampleQuery {
  id: string;
  question: string;
  tool: string;
  sql: string;
  answerText: string;
  evidence: string;
  arithmeticCheck: string;
}

const SAMPLE_QUERIES: SampleQuery[] = [
  {
    id: 'q1',
    question: 'How many fire dampers are on sheet PfMCC Page 118?',
    tool: 'count_components',
    sql: "SELECT count(*) AS total FROM objects WHERE class = 'FIRE_DAMPER' AND sheet_id = 'PfMCC_118'",
    answerText: 'Found 175 Fire Dampers on sheet PfMCC Page 118 across mechanical zones A, B, and C.',
    evidence: '175 verified bounding boxes mapped to SVG coordinates.',
    arithmeticCheck: 'ZERO LLM Arithmetic: Integer count pulled directly from SQLite database row.',
  },
  {
    id: 'q2',
    question: 'Where is fire damper FD-014 located?',
    tool: 'locate_component',
    sql: "SELECT bbox_x, bbox_y, width, height FROM objects WHERE tag = 'FD-014' LIMIT 1",
    answerText: 'Fire Damper FD-014 is located in Corridor C-2 at canvas coordinates [1420 pt, 860 pt].',
    evidence: 'Direct viewport coordinate center point with bidirectional ledger highlight.',
    arithmeticCheck: 'ZERO LLM Arithmetic: Exact PostScript vector coordinate returned.',
  },
  {
    id: 'q3',
    question: 'What is the total length of supply ductwork?',
    tool: 'measure_routes',
    sql: "SELECT sum(vector_length_pt) AS total_pt, scale_ratio FROM routes WHERE system = 'SUPPLY'",
    answerText: 'Physical length is unavailable: Drawing scale unverified under Gate G3. Total vector length is 4,820 pt.',
    evidence: 'STATUS: SCALE_UNVERIFIED (Fail-closed governance banner displayed).',
    arithmeticCheck: 'ZERO LLM Arithmetic: System refused to multiply unverified scale factors.',
  },
];

export const CopilotSandbox: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('q1');
  const activeQuery = SAMPLE_QUERIES.find((q) => q.id === selectedId) || SAMPLE_QUERIES[0];

  return (
    <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-4 h-4 text-[#38BDF8]" />
          <span className="font-heading text-sm font-semibold text-white tracking-wide">
            Interactive Visualizer 6: The No-Math Copilot Sandbox
          </span>
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>819+ Offline Tests Passing</span>
        </div>
      </div>

      {/* Preset Query Buttons */}
      <div className="mt-4">
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
          Click a question to inspect the deterministic execution pipeline:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedId(q.id)}
              className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                selectedId === q.id
                  ? 'bg-slate-800 border-[#38BDF8] text-white font-semibold shadow-xs'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <Play className={`w-3 h-3 shrink-0 ${selectedId === q.id ? 'text-[#38BDF8]' : 'text-slate-500'}`} />
                <span className="line-clamp-2">{q.question}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Three-Stage Under-The-Hood Execution Inspection */}
      <div className="mt-4 space-y-3 font-mono text-xs">
        {/* Step 1: Semantic Intent Router */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase tracking-wider pb-1.5 border-b border-slate-800/80 mb-2">
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>Step 1: Semantic Router (LLM Tokenizer)</span>
            </span>
            <span>Zero Calculation In Weights</span>
          </div>
          <div className="text-slate-300">
            Selected Offline Tool: <span className="text-[#38BDF8] font-bold">{activeQuery.tool}</span>
          </div>
        </div>

        {/* Step 2: Deterministic Database Query */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase tracking-wider pb-1.5 border-b border-slate-800/80 mb-2">
            <span className="flex items-center space-x-1.5 text-emerald-400">
              <Database className="w-3.5 h-3.5" />
              <span>Step 2: Deterministic SQL Execution</span>
            </span>
            <span>Local SQLite Workstation</span>
          </div>
          <div className="text-emerald-300 bg-slate-950 p-2 rounded border border-slate-800/60 break-all">
            {activeQuery.sql}
          </div>
        </div>

        {/* Step 3: Structured Envelope & Answer */}
        <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase tracking-wider pb-1.5 border-b border-slate-800/80 mb-2">
            <span className="flex items-center space-x-1.5 text-amber-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Step 3: Estimator Answer Envelope</span>
            </span>
            <span className="text-emerald-400">Audit Verifiable</span>
          </div>
          <div className="text-white font-sans font-medium text-sm leading-relaxed mb-2">
            "{activeQuery.answerText}"
          </div>
          <div className="text-[11px] text-slate-400">
            Evidence: <span className="text-slate-300">{activeQuery.evidence}</span>
          </div>
          <div className="mt-2 text-[10px] text-emerald-400 font-bold bg-emerald-950/40 p-1.5 rounded border border-emerald-800/30">
            ✓ {activeQuery.arithmeticCheck}
          </div>
        </div>
      </div>
    </div>
  );
};
