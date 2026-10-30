import React, { useRef, useState } from 'react';
import { FileUp, FolderOpen } from 'lucide-react';

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
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-cyan-400 bg-cyan-950/30' : 'border-slate-700 bg-slate-900 hover:border-slate-500'
        }`}
      >
        <FileUp className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
        <div className="text-slate-100 font-semibold mb-1">
          {loading ? 'Working…' : 'Drop a multi-sheet MEP drawing set (PDF)'}
        </div>
        <div className="text-slate-500 text-sm">or click to browse · single sheets and full sets welcome</div>
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
        <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center space-x-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Or open a bundled fixture</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {FIXTURES.map((fixture) => (
            <button
              key={fixture.path}
              type="button"
              disabled={loading}
              onClick={() => onFixture(fixture.path)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 cursor-pointer"
            >
              {fixture.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
