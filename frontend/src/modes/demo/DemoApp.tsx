import React, { useState } from 'react';
import { 
  FolderCheck, 
  FileCheck, 
  Layout, 
  MessageCircleQuestion,
  Download, 
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  FileCode,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { WorkspaceShell } from '../../app/WorkspaceShell';
import { DemoDataProvider } from './DemoDataProvider';
import { useDemoData } from './demoContext';
import { DEMO_PREFLIGHT_FIXTURE, DEMO_JOB_FIXTURE } from './demoFixtures';

type DemoStep = 'landing' | 'preflight' | 'job' | 'handoff';

const DemoAppContent: React.FC = () => {
  const { project, sheet } = useDemoData();
  const [step, setStep] = useState<DemoStep>('landing');

  return (
    <WorkspaceShell
      mode="demo"
      projectNavContent={
        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-md text-xs space-y-2">
          <div className="flex items-center space-x-1.5 text-amber-800 font-semibold">
            <FolderCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="truncate">{project.name}</span>
          </div>
          <p className="text-[11px] text-amber-700 leading-tight">
            {project.description}
          </p>
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded inline-block">
            Example Project ID: {project.projectId}
          </div>
        </div>
      }
      sheetNavContent={
        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-md text-xs space-y-2">
          <div className="flex items-center space-x-1.5 text-amber-800 font-semibold">
            <FileCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{sheet.sheetId}</span>
          </div>
          <p className="text-[11px] text-amber-700">
            {sheet.title} ({sheet.discipline})
          </p>
          <div className="text-[10px] font-mono text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded">
            Example Source ID: {sheet.sourceId}
          </div>
        </div>
      }
      viewportContent={
        <div className="w-full max-w-2xl bg-white rounded-lg border-2 border-dashed border-amber-300 shadow-xs flex flex-col p-6 relative overflow-hidden">
          {/* Step Selector Navigation */}
          <div className="flex items-center justify-between border-b border-amber-200 pb-3 mb-4">
            <div className="flex items-center space-x-2">
              <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase">
                Demo Example Walkthrough
              </span>
              <span className="text-xs text-amber-800 font-medium">
                Step: <span className="font-semibold capitalize">{step}</span>
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setStep('landing')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  step === 'landing' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                1. Project
              </button>
              <button
                type="button"
                onClick={() => setStep('preflight')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  step === 'preflight' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                2. Preflight
              </button>
              <button
                type="button"
                onClick={() => setStep('job')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  step === 'job' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                3. Job
              </button>
              <button
                type="button"
                onClick={() => setStep('handoff')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  step === 'handoff' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                4. Handoff
              </button>
            </div>
          </div>

          {/* Step 1: Landing */}
          {step === 'landing' && (
            <div className="text-center py-6 space-y-3">
              <Layout className="w-10 h-10 text-amber-400 mx-auto" aria-hidden="true" />
              <h3 className="font-heading text-base font-bold text-slate-800">
                Example Project & Import Workflow (Example only)
              </h3>
              <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
                DEMO — Example data only. Nothing on this screen was calculated from a drawing.
                In Live mode, real drawings upload to FastAPI and extract verified engineering quantities.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setStep('preflight')}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-800 text-white rounded text-xs font-semibold hover:bg-amber-900"
                >
                  <span>Advance to Example Preflight</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preflight */}
          {step === 'preflight' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-amber-900">
                  <div className="flex items-center space-x-1.5">
                    <FileCode className="w-4 h-4 text-amber-700" />
                    <span>Page 1 Preflight (Example data only)</span>
                  </div>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-mono text-[10px]">
                    Unverified Candidate (Example)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-amber-800 pt-1">
                  <div>Dimensions: <span className="font-mono">{DEMO_PREFLIGHT_FIXTURE.widthPt} × {DEMO_PREFLIGHT_FIXTURE.heightPt} pt</span></div>
                  <div>Candidate Sheet ID: <span className="font-mono">{DEMO_PREFLIGHT_FIXTURE.candidateSheetId}</span></div>
                  <div>Confidence: <span className="font-mono">{DEMO_PREFLIGHT_FIXTURE.sheetIdConfidence}</span></div>
                  <div>Status: <span className="font-mono">{DEMO_PREFLIGHT_FIXTURE.processabilityStatus}</span></div>
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="text-xs text-amber-700 underline"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('job')}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-800 text-white rounded text-xs font-semibold hover:bg-amber-900"
                >
                  <span>Advance to Example Job</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Job */}
          {step === 'job' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-2">
                <div className="flex items-center justify-between font-semibold text-amber-900">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-amber-700" />
                    <span>Job Complete State (Example data only)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-200 rounded font-mono text-[10px]">
                    {DEMO_JOB_FIXTURE.state}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Example job <span className="font-mono">{DEMO_JOB_FIXTURE.jobId}</span> completed 1 of 1 pages.
                </p>
                <div className="text-[11px] text-amber-700 font-mono">
                  Example Run ID: {DEMO_JOB_FIXTURE.runId}
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('preflight')}
                  className="text-xs text-amber-700 underline"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('handoff')}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-800 text-white rounded text-xs font-semibold hover:bg-amber-900"
                >
                  <span>Advance to Example Handoff</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Handoff */}
          {step === 'handoff' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-2">
                <div className="font-semibold text-amber-900">
                  Run-Ready Handoff (Example data only)
                </div>
                <p className="text-[11px] text-amber-800">
                  Example Run <span className="font-mono font-bold">{DEMO_JOB_FIXTURE.runId}</span> is ready.
                  Linework viewer and extraction tables are introduced in UI-03.
                </p>
                <div className="p-2 bg-amber-100/60 rounded text-[10px] text-amber-900 font-mono">
                  DEMO MODE: Zero API calls made. No live execution occurred.
                </div>
              </div>
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('job')}
                  className="text-xs text-amber-700 underline"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-medium hover:bg-amber-200"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Walkthrough</span>
                </button>
              </div>
            </div>
          )}

          {/* Persistent Offline Warning */}
          <div className="mt-4 pt-3 border-t border-amber-200 text-[11px] font-mono text-amber-800 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
              <span>Offline mode — No API requests made</span>
            </div>
            <div className="flex items-center space-x-1 text-slate-400">
              <Clock className="w-3 h-3" />
              <span>Manual navigation only</span>
            </div>
          </div>
        </div>
      }
      inspectorContent={
        <div className="p-3 bg-amber-50/50 rounded border border-amber-200 text-xs text-amber-900">
          <div className="font-semibold mb-1">Example Inspector Display</div>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            In Demo mode, quantities are not derived from engineering models. This illustrates inspector panel positioning only.
          </p>
        </div>
      }
      reviewContent={
        <div className="p-3 bg-amber-50/50 rounded border border-amber-200 text-xs text-amber-900">
          <div className="font-semibold mb-1">Example Review Region</div>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Review decisions are disabled in Demo mode to prevent corrupting audit logs.
          </p>
        </div>
      }
      copilotContent={
        <div className="p-3 bg-amber-50/50 rounded border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
          <MessageCircleQuestion className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold">Copilot Placeholder</div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Copilot reasoning is unavailable in Demo mode.
            </p>
          </div>
        </div>
      }
      exportContent={
        <div className="p-3 bg-amber-50/50 rounded border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
          <Download className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold">Export Unavailable</div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Export bundles require verified backend extraction runs.
            </p>
          </div>
        </div>
      }
    />
  );
};

export const DemoApp: React.FC = () => {
  return (
    <DemoDataProvider>
      <DemoAppContent />
    </DemoDataProvider>
  );
};

