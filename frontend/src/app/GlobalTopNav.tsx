import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { FileUp, FlaskConical, RotateCcw, BookOpen, MessageSquareText, KeyRound } from 'lucide-react';

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
      className="h-14 bg-[#1B242C] border-b border-[#2C3844] px-4 flex items-center justify-between shadow-xs select-none shrink-0 z-40"
    >
      <div className="flex items-center space-x-6">
        <Link
          to="/"
          onClick={onNewAnalysis}
          className="flex items-center space-x-3 text-white hover:opacity-95 transition-opacity no-underline"
        >
          <div className="w-8 h-8 rounded-md bg-[#006D84] text-white flex items-center justify-center font-bold font-mono text-xs tracking-tight border border-teal-500/30 shadow-xs">
            BT
          </div>
          <span className="font-heading font-bold text-base text-white tracking-tight">BlueTraceAI</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center space-x-1 text-xs">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-md no-underline transition-colors ${
              isWorkspaceActive ? 'bg-slate-700/60 text-white font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            Workspace
          </Link>
          <Link
            to="/story"
            className={`px-3 py-1.5 rounded-md no-underline transition-colors ${
              isStoryActive ? 'bg-slate-700/60 text-white font-semibold' : 'text-slate-300 hover:text-white'
            }`}
          >
            How it works
          </Link>
        </nav>
      </div>

      <div className="flex items-center space-x-2 text-xs">
        <span
          className={`flex items-center space-x-1.5 px-2 py-1 rounded-md font-mono ${
            modelReady ? 'text-emerald-300' : 'text-rose-300'
          }`}
          title={modelReady ? 'Backend connected' : 'Backend unreachable — start the API server'}
        >
          <span className={`w-2 h-2 rounded-full ${modelReady ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span>{modelReady ? 'API' : 'Offline'}</span>
        </span>
        {onOpenByok && (
          <button
            type="button"
            onClick={onOpenByok}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
              aiConfigured ? 'text-cyan-300 hover:bg-slate-700/60' : 'text-slate-300 hover:bg-slate-700/60'
            }`}
            title={aiConfigured ? 'Meta API key configured' : 'Add Meta API key'}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{aiConfigured ? 'AI on' : 'AI key'}</span>
          </button>
        )}
        {onLoadSample && (
          <button
            type="button"
            onClick={onLoadSample}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-slate-700/60 hover:text-white cursor-pointer transition-colors"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Sample</span>
          </button>
        )}
        {onNewAnalysis && (
          <button
            type="button"
            onClick={onNewAnalysis}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-slate-700/60 hover:text-white cursor-pointer transition-colors"
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
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#006D84] hover:bg-[#00819c] text-white cursor-pointer transition-colors"
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
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-slate-700/60 hover:text-white cursor-pointer transition-colors"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>Copilot</span>
          </button>
        )}
        <Link
          to="/story"
          aria-label="How it works"
          className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
        >
          <BookOpen className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
};
