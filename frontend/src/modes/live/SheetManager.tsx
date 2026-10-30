import React from 'react';
import { 
  FileText, 
  UploadCloud, 
  RefreshCw, 
  CheckCircle2, 
  Layers
} from 'lucide-react';
import { useLiveData } from './liveContext';

export const SheetManager: React.FC = () => {
  const {
    activeProject,
    drawings,
    activeDrawing,
    isLoadingDrawings,
    loadDrawings,
    setActiveDrawing,
    setViewMode,
  } = useLiveData();

  if (!activeProject) {
    return (
      <div className="p-3 text-center border border-dashed border-slate-200 rounded-md text-xs text-slate-400">
        <Layers className="w-5 h-5 mx-auto mb-1 text-slate-300" aria-hidden="true" />
        <p>No project selected.</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Select a project to view drawing sheets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {drawings.length} {drawings.length === 1 ? 'drawing' : 'drawings'}
        </span>
        <button
          type="button"
          onClick={() => {
            setActiveDrawing(null);
            setViewMode('upload');
          }}
          className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#006D84]"
          aria-label="Upload new drawing"
        >
          <UploadCloud className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
          <span>Upload PDF</span>
        </button>
      </div>

      {isLoadingDrawings && (
        <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#006D84]" aria-hidden="true" />
          <span>Loading drawings...</span>
        </div>
      )}

      {!isLoadingDrawings && drawings.length === 0 && (
        <div className="p-3 text-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
          <p className="font-medium">No drawings imported yet.</p>
          <button
            type="button"
            onClick={() => setViewMode('upload')}
            className="mt-2 inline-flex items-center space-x-1 text-xs text-[#006D84] hover:underline font-semibold"
          >
            <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload your first PDF</span>
          </button>
        </div>
      )}

      {!isLoadingDrawings && drawings.length > 0 && (
        <ul className="space-y-1.5" aria-label="Project drawings">
          {drawings.map((drawing) => {
            const isSelected = activeDrawing?.source_id === drawing.source_id;
            return (
              <li key={drawing.source_id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDrawing(drawing);
                    setViewMode('preflight');
                  }}
                  className={`w-full text-left p-2 rounded-md border text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-[#006D84] ${
                    isSelected
                      ? 'border-[#006D84] bg-teal-50/50 text-[#006D84]'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-[#006D84]' : 'text-slate-400'}`} aria-hidden="true" />
                    <span className="font-medium truncate" title={drawing.filename}>
                      {drawing.filename}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="w-3 h-3 text-[#006D84] ml-auto flex-shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 pl-5 font-mono">
                    <span>{drawing.source_id}</span>
                    <span>{drawing.page_count} {drawing.page_count === 1 ? 'page' : 'pages'}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={() => activeProject && loadDrawings(activeProject.project_id)}
          className="text-[11px] text-slate-400 hover:text-slate-600 inline-flex items-center space-x-1"
          aria-label="Refresh drawings list"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
};
