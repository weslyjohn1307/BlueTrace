import React from 'react';
import { NavLink } from 'react-router';
import { 
  FolderGit2, 
  FileSpreadsheet, 
  FileText, 
  Compass, 
  Sparkles, 
  Download, 
  Layers 
} from 'lucide-react';
import { ModeBanner } from '../components/ModeBanner';
import { ConnectionStatus } from '../components/ConnectionStatus';
import type { ConnectionState } from '../components/ConnectionStatus';

export interface WorkspaceShellProps {
  mode: 'live' | 'demo';
  connectionState?: ConnectionState;
  backendVersion?: string;
  errorMessage?: string;
  onRetryConnection?: () => void;
  // Region render props
  projectNavContent: React.ReactNode;
  sheetNavContent: React.ReactNode;
  viewportContent: React.ReactNode;
  inspectorContent: React.ReactNode;
  reviewContent: React.ReactNode;
  copilotContent: React.ReactNode;
  exportContent: React.ReactNode;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  mode,
  connectionState = 'connected',
  backendVersion,
  errorMessage,
  onRetryConnection,
  projectNavContent,
  sheetNavContent,
  viewportContent,
  inspectorContent,
  reviewContent,
  copilotContent,
  exportContent,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      {/* Skip to Content Accessibility Link */}
      <a
        href="#main-drawing-viewport"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#006D84] focus:text-white focus:rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006D84]"
      >
        Skip to main drawing viewport
      </a>

      {/* Persistent Mode Banner */}
      <ModeBanner mode={mode} />

      {/* Product Header Landmark */}
      <header 
        role="banner" 
        className="h-14 px-4 bg-white border-b border-bt-border-subtle flex items-center justify-between flex-shrink-0 z-40"
      >
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Compass className="w-5 h-5 text-[#006D84]" aria-hidden="true" />
            <h1 className="font-heading text-lg font-bold tracking-tight text-bt-text-primary">
              BlueTraceAI
            </h1>
          </div>

          {/* Mode Switcher Navigation */}
          <nav aria-label="Mode switcher" className="flex items-center p-0.5 bg-bt-panel rounded-md border border-bt-border-subtle">
            <NavLink
              to="/live"
              className={({ isActive }) =>
                `px-3 py-1 rounded text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-bt-text-primary shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-bt-text-primary'
                }`
              }
            >
              Live Mode
            </NavLink>
            <NavLink
              to="/demo"
              className={({ isActive }) =>
                `px-3 py-1 rounded text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-amber-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-bt-text-primary'
                }`
              }
            >
              Demo Mode
            </NavLink>
          </nav>
        </div>

        {/* Live Backend Connection Indicator */}
        <div className="flex items-center space-x-4">
          {mode === 'live' ? (
            <ConnectionStatus
              state={connectionState}
              version={backendVersion}
              errorMessage={errorMessage}
              onRetry={onRetryConnection}
            />
          ) : (
            <div className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Offline fixture mode
            </div>
          )}
        </div>
      </header>

      {/* Main 8-Region Grid Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Sidebar: Project & Sheet Navigation */}
        <nav 
          aria-label="Drawing navigation" 
          className="w-full md:w-64 lg:w-72 bg-white border-r border-bt-border-subtle flex flex-col flex-shrink-0 z-30"
        >
          {/* Region 2: Project Navigation */}
          <section 
            aria-labelledby="region-project-nav-heading" 
            className="p-3 border-b border-bt-border-subtle"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <FolderGit2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <h2 id="region-project-nav-heading">Project Navigation</h2>
            </div>
            {projectNavContent}
          </section>

          {/* Region 3: Sheet Navigation */}
          <section 
            aria-labelledby="region-sheet-nav-heading" 
            className="p-3 flex-1 overflow-y-auto"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <h2 id="region-sheet-nav-heading">Sheet Navigation</h2>
            </div>
            {sheetNavContent}
          </section>
        </nav>

        {/* Center: Drawing Sheet Viewport (Main Landmark) */}
        <main 
          id="main-drawing-viewport" 
          tabIndex={-1} 
          aria-labelledby="region-viewport-heading" 
          className="flex-1 flex flex-col bg-[#F8FAFC] overflow-hidden relative focus:outline-none"
        >
          <div className="h-9 px-4 bg-white/70 backdrop-blur-xs border-b border-bt-border-subtle flex items-center justify-between text-xs text-slate-600 flex-shrink-0">
            <h2 id="region-viewport-heading" className="font-semibold uppercase tracking-wider text-[11px] text-slate-500">
              Drawing-Sheet Viewport
            </h2>
            <span className="font-mono text-[11px] text-slate-400">Scale: fail-closed</span>
          </div>
          
          {/* Viewport Drawing Canvas Surface */}
          <div className="flex-1 p-4 md:p-6 overflow-auto flex items-center justify-center">
            {viewportContent}
          </div>
        </main>

        {/* Right Sidebar: Results, Review, Copilot, Export */}
        <aside 
          aria-label="Engineering details and review" 
          className="w-full md:w-80 lg:w-96 bg-white border-l border-bt-border-subtle flex flex-col flex-shrink-0 z-30 overflow-y-auto"
        >
          {/* Region 5: Results / Inspector Panel */}
          <section 
            aria-labelledby="region-inspector-heading" 
            className="p-3 border-b border-bt-border-subtle overflow-y-auto max-h-[220px]"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <h2 id="region-inspector-heading">Results / Inspector Panel</h2>
            </div>
            {inspectorContent}
          </section>

          {/* Region 6: Review Region */}
          <section 
            aria-labelledby="region-review-heading" 
            className="p-3 border-b border-bt-border-subtle bg-bt-panel/50"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <h2 id="region-review-heading">Review Region</h2>
            </div>
            {reviewContent}
          </section>

          {/* Region 7: Ask the Drawing Copilot Region */}
          <section 
            aria-labelledby="region-copilot-heading" 
            className="p-3 border-b border-bt-border-subtle"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#006D84]" aria-hidden="true" />
              <h2 id="region-copilot-heading">Ask the Drawing</h2>
            </div>
            {copilotContent}
          </section>

          {/* Region 8: Export Region */}
          <section 
            aria-labelledby="region-export-heading" 
            className="p-3 bg-bt-panel/30"
          >
            <div className="flex items-center space-x-1.5 mb-2 text-xs font-semibold text-bt-text-secondary uppercase tracking-wider">
              <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <h2 id="region-export-heading">Export Region</h2>
            </div>
            {exportContent}
          </section>
        </aside>

      </div>
    </div>
  );
};
