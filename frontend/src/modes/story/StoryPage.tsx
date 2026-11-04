import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowRight, FileSearch, ShieldCheck, GitCommit, Layers } from 'lucide-react';
import { StoryHeader } from './components/StoryHeader';
import { StorySection } from './components/StorySection';
import { STORY_ACTS } from './data/storyContent';

// Interactive Visualizer Widgets
import { ResolutionSlider } from './widgets/ResolutionSlider';
import { IoUBreakdown } from './widgets/IoUBreakdown';
import { StockAIXRay } from './widgets/StockAIXRay';
import { OffsetGatingDuct } from './widgets/OffsetGatingDuct';
import { MissingRulerGate } from './widgets/MissingRulerGate';
import { CopilotSandbox } from './widgets/CopilotSandbox';

export const StoryPage: React.FC = () => {
  const [activeActId, setActiveActId] = useState<string>(STORY_ACTS[0].id);
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  // Track active section and scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        const currentProgress = (window.scrollY / totalScroll) * 100;
        setScrollProgress(Math.min(100, Math.max(0, currentProgress)));
      }

      // Check which section is in view
      const scrollY = window.scrollY + 200;
      for (const act of STORY_ACTS) {
        const el = document.getElementById(act.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollY >= top && scrollY < top + height) {
            setActiveActId(act.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSelectAct = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveActId(id);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B132B] text-slate-100 flex flex-col font-sans selection:bg-[#006D84] selection:text-white">
      {/* Sticky Top Header */}
      <StoryHeader
        activeActId={activeActId}
        onSelectAct={handleSelectAct}
        scrollProgress={scrollProgress}
      />

      {/* Hero Header */}
      <section className="pt-20 pb-16 px-4 sm:px-6 max-w-5xl mx-auto text-center border-b border-slate-800/80">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#006D84]/30 border border-teal-500/40 text-cyan-300 font-mono text-xs mb-6">
          <FileSearch className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
          <span>Meta Global AI Hackathon — BlueTraceAI</span>
        </div>

        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight">
          Why AI Fails on Blueprints — <br className="hidden sm:inline" />
          <span className="text-[#38BDF8]">And How We Solved It</span>
        </h1>

        <p className="mt-6 text-base sm:text-xl text-slate-300 font-heading italic max-w-3xl mx-auto leading-relaxed">
          An interactive explorable explanation into commercial 2D drawing intelligence, zero-area vector lines,
          and why real engineering means knowing when to say "null".
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>6 Interactive Acts</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>819+ Passing Tests</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-slate-900/80 px-3 py-1.5 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Zero Conversational Fluff</span>
          </div>
        </div>
      </section>

      {/* Main Narrative Scrollytelling Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 w-full">
        {/* Act 1: The Resolution Collapse */}
        <StorySection act={STORY_ACTS[0]}>
          <ResolutionSlider />
        </StorySection>

        {/* Act 2: Zero-Area CAD Lines & IoU Breakdown */}
        <StorySection act={STORY_ACTS[1]}>
          <IoUBreakdown />
        </StorySection>

        {/* Act 3: When AI Hallucinates in Blueprints (P00 Baseline) */}
        <StorySection act={STORY_ACTS[2]}>
          <StockAIXRay />
        </StorySection>

        {/* Act 4: The Dual-Track Breakthrough (Lateral Offset Gating) */}
        <StorySection act={STORY_ACTS[3]}>
          <OffsetGatingDuct />
        </StorySection>

        {/* Act 5: The Fail-Closed Law (Gate G3) */}
        <StorySection act={STORY_ACTS[4]}>
          <MissingRulerGate />
        </StorySection>

        {/* Act 6: The No-Math Copilot & 715 Tests Proof */}
        <StorySection act={STORY_ACTS[5]}>
          <CopilotSandbox />
        </StorySection>

        {/* Final Conclusion & Launch Callout */}
        <section className="py-20 text-center border-t border-slate-800 mt-12">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="inline-flex p-3 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight">
              We Did Not Ship an Overpromised Demo. <br />
              <span className="text-[#38BDF8]">We Shipped What We Could Prove.</span>
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-sans">
              From the P00 baseline crash to 7 ratified architectural decisions and 819+ automated offline regression
              tests, BlueTraceAI proves that precision takeoff is achieved not by prompts, but by sound geometry,
              tiled raster inference, and strict fail-closed governance.
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/workspace"
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 rounded-lg bg-[#006D84] hover:bg-[#005769] text-white font-semibold text-sm shadow-lg transition-all no-underline"
              >
                <FileSearch className="w-4 h-4 text-[#38BDF8]" aria-hidden="true" />
                <span>Launch Live Drawing Workstation</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/projects"
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-all no-underline"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                <span>View Historical Runs & Benchmark Sheets</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#10161A] border-t border-[#2C3844] py-8 px-4 sm:px-6 text-center text-xs font-mono text-slate-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-slate-300">
            <span className="font-bold text-white">BlueTraceAI</span>
            <span>•</span>
            <span>Startup Track</span>
          </div>
          <div>Meta Global AI Developer Hackathon (2026)</div>
          <div className="flex items-center space-x-1 text-slate-400">
            <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
            <span>Commit 0ebbc80d → ec65a06</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StoryPage;
