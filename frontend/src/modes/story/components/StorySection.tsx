import React from 'react';
import { HelpCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { StoryAct } from '../data/storyContent';
import { MetricBadge } from './MetricBadge';

interface StorySectionProps {
  act: StoryAct;
  children: React.ReactNode;
}

export const StorySection: React.FC<StorySectionProps> = ({ act, children }) => {
  return (
    <section id={act.id} className="py-16 border-b border-slate-800/80 scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Column: Narrative & Plain English Veritasium Spine (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Act Badge & Tag */}
          <div className="flex items-center space-x-2.5 font-mono text-xs">
            <span className="px-2.5 py-0.5 rounded-full bg-[#006D84]/40 text-cyan-300 border border-teal-500/30 font-bold">
              ACT {act.actNumber}
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-400 uppercase tracking-wider">{act.tag}</span>
          </div>

          {/* Act Title & Provocative Question */}
          <div>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
              {act.title}
            </h2>
            <p className="mt-2 text-base sm:text-lg font-heading italic text-[#38BDF8]">
              "{act.question}"
            </p>
          </div>

          {/* Common Misconception Callout */}
          <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start space-x-3 text-xs leading-relaxed text-slate-300">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-200">The Common Assumption: </span>
              {act.misconception}
            </div>
          </div>

          {/* Veritasium Narrative Spine: The Puzzle → Experiment → Discovery → Truth */}
          <div className="space-y-4 text-sm leading-relaxed text-slate-300 font-sans">
            <div>
              <span className="font-bold text-white font-mono text-xs uppercase tracking-wider block mb-1">
                The Puzzle:
              </span>
              <p>{act.veritasiumSpine.puzzle}</p>
            </div>

            <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/30">
              <span className="font-bold text-cyan-300 font-mono text-xs uppercase tracking-wider block mb-1">
                The Experiment:
              </span>
              <p className="text-cyan-100/90">{act.veritasiumSpine.experiment}</p>
            </div>

            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/30">
              <span className="font-bold text-rose-300 font-mono text-xs uppercase tracking-wider block mb-1 flex items-center space-x-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>The Discovery:</span>
              </span>
              <p className="text-rose-100/90">{act.veritasiumSpine.discovery}</p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/30">
              <span className="font-bold text-bt-success font-mono text-xs uppercase tracking-wider block mb-1 flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>The Engineering Truth:</span>
              </span>
              <p className="text-emerald-100/90 font-medium">{act.veritasiumSpine.truth}</p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
            {act.metrics.map((m, idx) => (
              <MetricBadge
                key={idx}
                label={m.label}
                value={m.value}
                unit={m.unit}
                detail={m.detail}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Tactile Interactive Visualizer (5 cols) */}
        <div className="lg:col-span-5 sticky top-20">
          {children}
        </div>
      </div>
    </section>
  );
};
