import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { FileUp, FlaskConical, RotateCcw, BookOpen, KeyRound, Sparkles } from 'lucide-react';

export interface GlobalTopNavProps {
  modelReady?: boolean;
  aiConfigured?: boolean;
  onLoadSample?: () => void;
  onNewAnalysis?: () => void;
  onFileSelect?: (file: File) => void;
  onOpenCopilot?: () => void;
  onOpenByok?: () => void;
}

export const GlobalTopNav: React.FC<GlobalTopNavProps> = ({
  modelReady = true,
  aiConfigured = false,
  onLoadSample,
  onNewAnalysis,
  onFileSelect,
  onOpenCopilot,
  onOpenByok,
}) => {
  const location = useLocation();
  const path = location.pathname;
  const fileRef = useRef<HTMLInputElement>(null);
  const isWorkspaceActive = path === '/' || path === '/new' || path === '/workspace';
  const isStoryActive = path.startsWith('/story') || path.startsWith('/explorable') || path.startsWith('/how-it-works');

  return (
    <header
      role="banner"
      className="h-14 bg-slate-950 border-b border-cyan-500/20 px-4 flex items-center justify-between shadow-md select-none shrink-0 z-40 backdrop-blur-md"
    >
      <div className="flex items-center space-x-6">
        <Link
          to="/"
          onClick={onNewAnalysis}
          className="flex items-center space-x-3 text-white hover:opacity-95 transition-opacity no-underline group"
        >
          <div className="w-8 h-8 rounded-lg bg-cyan-950/80 text-cyan-400 flex items-center justify-center font-bold font-mono text-xs tracking-tight border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)] group-hover:border-cyan-400 transition-colors">
            BT
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-bold text-base text-white tracking-tight leading-none">BlueTraceAI</span>
            <span className="text-[9px] font-mono text-cyan-400/80 tracking-widest uppercase">Precision CAD Takeoff</span>
          </div>
        </Link>

        <nav aria-label="Primary" className="flex items-center space-x-1 text-xs">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-lg no-underline font-mono transition-colors ${
              isWorkspaceActive
                ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Workspace
          </Link>
          <Link
            to="/story"
            className={`px-3 py-1.5 rounded-lg no-underline font-mono transition-colors ${
              isStoryActive
                ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            How it works
          </Link>
        </nav>

        {/* Engineering Benchmark Micro-Badges */}
        <div className="hidden xl:flex items-center space-x-2 pl-4 border-l border-slate-800 text-[10px] font-mono select-none">
          <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 flex items-center gap-1.5 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            NIST LASER CALIBRATED
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ZERO HALLUCINATION
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-xs">
        <span
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] border ${
            modelReady
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
          }`}
          title={modelReady ? 'Backend connected' : 'Backend unreachable — start the API server'}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${modelReady ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          <span>{modelReady ? 'API 150 DPI' : 'Offline'}</span>
        </span>

        {onOpenByok && (
          <button
            type="button"
            onClick={onOpenByok}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all font-mono text-xs border ${
              aiConfigured
                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title={aiConfigured ? 'Meta API key configured' : 'Add Meta API key'}
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span>{aiConfigured ? 'Meta AI On' : 'Meta AI Key'}</span>
          </button>
        )}

        {onLoadSample && (
          <button
            type="button"
            onClick={onLoadSample}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800/80 hover:text-white cursor-pointer transition-colors font-mono text-xs border border-slate-800"
          >
            <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
            <span>Sample</span>
          </button>
        )}

        {onNewAnalysis && (
          <button
            type="button"
            onClick={onNewAnalysis}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800/80 hover:text-white cursor-pointer transition-colors font-mono text-xs border border-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        )}

        {onFileSelect && (
          <>
            <button
              id="topnav-choose-pdf-btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs cursor-pointer transition-all shadow-[0_0_15px_rgba(8,145,178,0.3)] font-medium"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>Open PDF</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onFileSelect) onFileSelect(file);
                e.target.value = '';
              }}
            />
          </>
        )}

        {onOpenCopilot && (
          <button
            type="button"
            onClick={onOpenCopilot}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800/80 hover:text-white cursor-pointer transition-colors font-mono text-xs border border-slate-800"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Copilot</span>
          </button>
        )}

        <Link
          to="/story"
          aria-label="How it works"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-800"
        >
          <BookOpen className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
};
