import React, { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { BlueprintRadarLoader } from './BlueprintRadarLoader';
import { BrandIcon, BrandSymbol, type BrandIconName } from '../../components/brand/BrandAssets';

export interface UploadCardProps {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onFixture: (pdfPath: string) => void;
}

const FIXTURES: { label: string; path: string; icon: BrandIconName }[] = [
  { label: 'M-201 HVAC plan', path: 'fixtures/mechanical/hvac_plan_level2.pdf', icon: 'measure' },
  { label: 'M-118 damper schedule', path: 'fixtures/mechanical/hvac_schedule_plan.pdf', icon: 'detect' },
  { label: 'Plumbing L4', path: 'fixtures/plumbing/plumbing_plan_level4.pdf', icon: 'layers' },
];

export const UploadCard: React.FC<UploadCardProps> = ({ loading, error, onFile, onFixture }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="p-6 max-w-xl mx-auto" data-testid="upload-card">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0A0F1E] border border-[#005BFF]/40 flex items-center justify-center shadow-[0_0_12px_rgba(0,91,255,0.2)]">
            <BrandSymbol size={18} variant="dark-surface" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.16em] text-[#37C6FF]">
              MEP DRAWING INTELLIGENCE
            </div>
            <div className="text-sm font-semibold text-slate-100">
              From Drawings to Trusted Takeoff.
            </div>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0A0F1E] border border-slate-800 text-[10px] font-mono text-slate-400">
          <BrandIcon name="review" size={12} className="text-[#37C6FF]" />
          <span>Fail-Closed Scale Gate</span>
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF drawing"
        onClick={() => {
          if (!loading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !loading) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!loading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (loading) return;
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        style={{
          backgroundImage: 'url("/brand/patterns/blueprint-network-pattern.svg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden ${
          dragOver
            ? 'border-[#37C6FF] bg-[#0A0F1E]/95 shadow-[0_0_30px_rgba(55,198,255,0.25)]'
            : 'border-[#005BFF]/35 bg-[#0A0F1E]/90 hover:border-[#37C6FF]/60 hover:bg-[#0A0F1E]'
        }`}
      >
        <div className="absolute inset-0 bg-[#0A0F1E]/85 pointer-events-none" />
        <div className="relative z-10">
          {loading ? (
            <BlueprintRadarLoader
              size="md"
              label="SYS.SCAN // EXTRACTING_SHEETS"
              sublabel="Extracting vector linework & scale calibration..."
            />
          ) : (
            <>
              {/* Corner Reticles */}
              <div className="absolute -top-4 -left-4 w-3 h-3 border-t-2 border-l-2 border-[#37C6FF]/50" />
              <div className="absolute -top-4 -right-4 w-3 h-3 border-t-2 border-r-2 border-[#37C6FF]/50" />
              <div className="absolute -bottom-4 -left-4 w-3 h-3 border-b-2 border-l-2 border-[#37C6FF]/50" />
              <div className="absolute -bottom-4 -right-4 w-3 h-3 border-b-2 border-r-2 border-[#37C6FF]/50" />

              <div className="w-12 h-12 rounded-lg bg-[#005BFF]/15 border border-[#005BFF]/40 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(0,91,255,0.2)]">
                <FileUp className="w-6 h-6 text-[#37C6FF] animate-pulse" />
              </div>
              <div className="text-slate-100 font-semibold mb-1 tracking-tight text-base">
                Drop a multi-sheet MEP drawing set (PDF)
              </div>
              <div className="text-slate-400 text-xs font-mono">
                Native vector CAD drawings or scanned sets · 150 DPI hardware acceleration
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-sm font-mono" role="alert">
          {error}
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center space-x-2 text-slate-400 text-[11px] font-mono uppercase tracking-wider mb-2">
          <BrandIcon name="project" size={14} className="text-[#37C6FF]" />
          <span>Or load benchmark MEP test fixture</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {FIXTURES.map((fixture) => (
            <button
              key={fixture.path}
              type="button"
              disabled={loading}
              onClick={() => onFixture(fixture.path)}
              className="px-3 py-1.5 rounded-lg bg-[#0A0F1E] hover:bg-slate-800/90 hover:border-[#37C6FF]/50 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 cursor-pointer transition-all flex items-center space-x-1.5"
            >
              <BrandIcon name={fixture.icon} size={13} className="text-[#37C6FF]" />
              <span>{fixture.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
