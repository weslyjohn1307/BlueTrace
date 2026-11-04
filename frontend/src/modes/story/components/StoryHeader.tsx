import React from 'react';
import { Link } from 'react-router';
import { PanelLeftOpen, ArrowRight } from 'lucide-react';
import { STORY_ACTS } from '../data/storyContent';
import { BrandLockup } from '../../../components/brand/BrandAssets';

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
    <header className="sticky top-0 z-50 bg-[#0A0F1E]/95 backdrop-blur-md border-b border-[#005BFF]/25 shadow-md select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            to="/workspace"
            className="flex items-center space-x-2 text-white hover:opacity-90 transition-opacity no-underline"
          >
            <BrandLockup theme="dark" descriptorText="EXPLORABLE STORY" />
          </Link>
        </div>

        <nav className="hidden md:flex items-center space-x-1 font-mono text-xs">
          {STORY_ACTS.map((act) => (
            <button
              key={act.id}
              onClick={() => onSelectAct(act.id)}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                activeActId === act.id
                  ? 'bg-[#005BFF]/25 text-bt-brand border border-[#005BFF]/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Act {act.actNumber}
            </button>
          ))}
        </nav>

        <div className="flex items-center space-x-2">
          <Link
            to="/workspace"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#005BFF] hover:bg-[#004CE0] text-white text-xs font-semibold shadow-xs transition-colors no-underline"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Launch Workstation</span>
            <ArrowRight className="w-3 h-3 text-white/70" />
          </Link>
        </div>
      </div>

      <div className="w-full h-0.5 bg-slate-800">
        <div
          className="h-full bg-[#37C6FF] transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
    </header>
  );
};
