import React, { useRef, useState } from 'react';
import { FileUp, FolderOpen } from 'lucide-react';
import { BlueprintRadarLoader } from './BlueprintRadarLoader';

export interface UploadCardProps {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onFixture: (pdfPath: string) => void;
}

const FIXTURES = [
  { label: 'Avexis HVAC plan', path: 'fixtures/mechanical/avexis_page_22.pdf' },
  { label: 'PfMCC dampers', path: 'fixtures/mechanical/pfmcc_page_118.pdf' },
  { label: 'Plumbing L4', path: 'fixtures/plumbing/p104_1_plumbing_level4.pdf' },
];

export const UploadCard: React.FC<UploadCardProps> = ({ loading, error, onFile, onFixture }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="p-6 max-w-xl mx-auto" data-testid="upload-card">
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
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 cad-dot-grid-dark overflow-hidden ${
          dragOver
            ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_30px_rgba(34,211,238,0.25)]'
            : 'border-slate-700/80 bg-slate-900/80 hover:border-cyan-500/50 hover:bg-slate-900'
        }`}
      >
        {loading ? (
          <BlueprintRadarLoader
            size="md"
            label="SYS.SCAN // EXTRACTING_SHEETS"
            sublabel="Extracting vector linework & scale calibration..."
          />
        ) : (
          <>
            {/* Corner Reticles */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-cyan-500/40" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-cyan-500/40" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-cyan-500/40" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-cyan-500/40" />

            <div className="w-12 h-12 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
              <FileUp className="w-6 h-6 text-cyan-400 animate-pulse" />
            </div>
            <div className="text-slate-100 font-semibold mb-1 tracking-tight text-base">
              Drop a multi-sheet MEP drawing set (PDF)
            </div>
            <div className="text-slate-400 text-xs font-mono">
              Native vector CAD drawings or scanned sets · 150 DPI hardware acceleration
            </div>
          </>
        )}

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
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>Or load benchmark MEP test fixture</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {FIXTURES.map((fixture) => (
            <button
              key={fixture.path}
              type="button"
              disabled={loading}
              onClick={() => onFixture(fixture.path)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 hover:border-cyan-500/40 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 cursor-pointer transition-all flex items-center space-x-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>{fixture.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
