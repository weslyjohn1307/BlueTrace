import React from 'react';
import { Link } from 'react-router';
import { Sparkles, ArrowRight } from 'lucide-react';
import { STORY_ACTS } from '../data/storyContent';

interface StoryHeaderProps {
  activeActId: string;
  onSelectAct: (id: string) => void;
  scrollProgress: number; // 0 to 100
}

export const StoryHeader: React.FC<StoryHeaderProps> = ({
  activeActId,
  onSelectAct,
  scrollProgress,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[#10161A]/95 backdrop-blur-md border-b border-[#2C3844] shadow-md select-none">
      {/* Top brand & navigation bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <Link
            to="/workspace"
            className="flex items-center space-x-2 text-white hover:opacity-90 transition-opacity no-underline"
          >
            <div className="w-7 h-7 rounded bg-[#006D84] text-white flex items-center justify-center font-mono font-bold text-xs border border-teal-500/30">
              MEP
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-heading font-bold text-sm text-white">MEP Design AI</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Explorable Story
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Acts quick selector pills (desktop) */}
        <nav className="hidden md:flex items-center space-x-1 font-mono text-xs">
          {STORY_ACTS.map((act) => (
            <button
              key={act.id}
              onClick={() => onSelectAct(act.id)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeActId === act.id
                  ? 'bg-slate-700 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Act {act.actNumber}
            </button>
          ))}
        </nav>

        {/* Action button leading directly to Live Workstation */}
        <div className="flex items-center space-x-2">
          <Link
            to="/workspace"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#006D84] hover:bg-[#005769] text-white text-xs font-semibold shadow-xs transition-colors no-underline"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Launch Workstation</span>
            <ArrowRight className="w-3 h-3 text-white/70" />
          </Link>
        </div>
      </div>

      {/* Reading Progress Line */}
      <div className="w-full h-0.5 bg-slate-800">
        <div
          className="h-full bg-[#38BDF8] transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
    </header>
  );
};
