import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { FileUp, FlaskConical, RotateCcw, BookOpen, Sparkles } from 'lucide-react';
import { BrandIcon, BrandLockup } from '../components/brand/BrandAssets';

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
  const isShowcaseActive = path === '/showcase';

  return (
    <header
      role="banner"
      className="h-14 bg-[#0A0F1E] border-b border-[#005BFF]/25 px-4 flex items-center justify-between shadow-md select-none shrink-0 z-40 backdrop-blur-md"
    >
      <div className="flex items-center space-x-6">
        <Link
          to="/"
          onClick={onNewAnalysis}
          aria-label="BlueTrace — MEP Drawing Intelligence"
          className="flex items-center text-white hover:opacity-95 transition-opacity no-underline group"
        >
          <BrandLockup theme="dark" showDescriptor={true} />
        </Link>

        <nav aria-label="Primary" className="flex items-center space-x-1 text-xs">
          <Link
            to="/"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg no-underline font-mono transition-colors ${
              isWorkspaceActive
                ? 'bg-[#005BFF]/20 text-[#37C6FF] font-semibold border border-[#005BFF]/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BrandIcon name="measure" size={14} />
            <span>Workspace</span>
          </Link>
          <Link
            to="/showcase"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg no-underline font-mono transition-colors ${
              isShowcaseActive
                ? 'bg-[#005BFF]/20 text-[#37C6FF] font-semibold border border-[#005BFF]/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BrandIcon name="layers" size={14} />
            <span>Showcase</span>
          </Link>
        </nav>
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
          <span>{modelReady ? 'API ready' : 'Offline'}</span>
        </span>

        {onOpenByok && (
          <button
            type="button"
            onClick={onOpenByok}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all font-mono text-xs border ${
              aiConfigured
                ? 'bg-[#005BFF]/20 border-[#37C6FF]/40 text-[#37C6FF] shadow-[0_0_12px_rgba(55,198,255,0.15)]'
                : 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title={aiConfigured ? 'Meta API key configured' : 'Add Meta API key'}
          >
            <BrandIcon name="settings" size={14} className="text-[#37C6FF]" />
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
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#005BFF] hover:bg-[#004CE0] text-white font-mono text-xs cursor-pointer transition-all shadow-[0_0_15px_rgba(0,91,255,0.35)] font-medium"
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
            <Sparkles className="w-3.5 h-3.5 text-[#37C6FF]" />
            <span>Copilot</span>
          </button>
        )}

        <Link
          to="/showcase"
          aria-label="Showcase"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-800"
        >
          <BookOpen className="w-4 h-4" />
        </Link>
      </div>
    </header>
  );
};
