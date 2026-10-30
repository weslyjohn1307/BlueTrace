import React from 'react';
import { Link, useLocation } from 'react-router';
import {
  FileText,
  FileUp,
  FolderKanban,
  Layers,
  Sparkles,
  BookOpen,
} from 'lucide-react';

export interface GlobalTopNavProps {
  modelReady?: boolean;
  onLoadSample?: () => void;
  onNewAnalysis?: () => void;
  onFileSelect?: (file: File) => void;
}

export const GlobalTopNav: React.FC<GlobalTopNavProps> = ({
  modelReady = true,
  onLoadSample,
  onNewAnalysis,
  onFileSelect,
}) => {
  const location = useLocation();
  const path = location.pathname;

  const isNewAnalysisActive = path === '/' || path === '/new' || path === '/workspace';
  const isProjectsActive = path.startsWith('/projects') && !path.includes('/runs/');
  const isRunsActive = path.startsWith('/runs') || path.startsWith('/run/');
  const isStoryActive = path.startsWith('/story') || path.startsWith('/explorable') || path.startsWith('/how-it-works');

  return (
    <header
      role="banner"
      className="h-14 bg-[#1B242C] border-b border-[#2C3844] px-4 flex items-center justify-between shadow-xs select-none shrink-0 z-40"
    >
      {/* Brand & Identity */}
      <div className="flex items-center space-x-6">
        <Link
          to="/"
          onClick={onNewAnalysis}
          className="flex items-center space-x-3 text-white hover:opacity-95 transition-opacity no-underline"
        >
          <div className="w-8 h-8 rounded-md bg-[#006D84] text-white flex items-center justify-center font-bold font-mono text-xs tracking-tight border border-teal-500/30 shadow-xs">
            BT
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-heading font-bold text-base text-white tracking-tight">
                BlueTraceAI
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                Workstation
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
              <span>BlueTraceAI</span>
              <span>•</span>
              <span className="font-medium text-[#38BDF8]">Meta Hackathon</span>
            </div>
          </div>
        </Link>

        {/* Autodesk HIG Main Navigation: New Analysis → Projects → Runs */}
        <nav aria-label="Main Navigation" className="hidden sm:flex items-center h-14 pl-2 space-x-1">
          <Link
            to="/"
            onClick={onNewAnalysis}
            className={`hig-nav-tab ${isNewAnalysisActive ? 'active' : ''}`}
            data-testid="nav-new-analysis"
          >
            <Sparkles className={`w-4 h-4 ${isNewAnalysisActive ? 'text-[#0696D7]' : 'text-slate-400'}`} />
            <span>New Analysis</span>
          </Link>

          <Link
            to="/projects"
            className={`hig-nav-tab ${isProjectsActive ? 'active' : ''}`}
            data-testid="nav-projects"
          >
            <FolderKanban className={`w-4 h-4 ${isProjectsActive ? 'text-[#0696D7]' : 'text-slate-400'}`} />
            <span>Projects</span>
          </Link>

          <Link
            to="/runs"
            className={`hig-nav-tab ${isRunsActive ? 'active' : ''}`}
            data-testid="nav-runs"
          >
            <Layers className={`w-4 h-4 ${isRunsActive ? 'text-[#0696D7]' : 'text-slate-400'}`} />
            <span>Runs</span>
          </Link>

          <Link
            to="/story"
            className={`hig-nav-tab ${isStoryActive ? 'active' : ''}`}
            data-testid="nav-story"
          >
            <BookOpen className={`w-4 h-4 ${isStoryActive ? 'text-[#0696D7]' : 'text-slate-400'}`} />
            <span>Interactive Story</span>
          </Link>
        </nav>
      </div>

      {/* Right Utilities */}
      <div className="flex items-center space-x-3">
        {/* Upload Drawing Action */}
        {onFileSelect && (
          <label
            id="topnav-choose-pdf-btn"
            tabIndex={0}
            role="button"
            aria-label="Upload PDF drawing"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.querySelector('input')?.click();
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#006D84] hover:bg-[#005769] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#38BDF8]"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload PDF</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileSelect(f);
              }}
            />
          </label>
        )}

        {/* Sample Drawing CTA */}
        {onLoadSample && (
          <button
            type="button"
            onClick={onLoadSample}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title="Load verified sample drawing"
          >
            <FileText className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Load Sample</span>
          </button>
        )}

        {/* Model Status Pill */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
            modelReady
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80'
              : 'bg-amber-950/60 text-amber-300 border-amber-800/80'
          }`}
          title={
            modelReady
              ? 'Muse Spark 1.3 and vector engines online'
              : 'Extraction engines offline or unverified'
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              modelReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-mono text-[11px]">
            {modelReady ? 'Model Ready' : 'Model Offline'}
          </span>
        </div>
      </div>
    </header>
  );
};
