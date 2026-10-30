import React from 'react';
import { X } from 'lucide-react';
import { CopilotPanel } from './CopilotPanel';

export interface CopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  sheetId: string | null;
  onEvidence: (boxes: number[][]) => void;
}

/**
 * BlueTraceAI conversational copilot drawer.
 * Streams muse-wonder-1.0 over the takeoff ledger; falls back to a labelled
 * offline template when the model is unreachable. Never invents provenance.
 */
export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ open, onClose, sheetId, onEvidence }) => {
  if (!open) return null;
  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col"
      role="dialog"
      aria-label="Ask the drawing"
      data-testid="copilot-drawer"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="font-semibold text-slate-100 text-xs uppercase tracking-wider">Ask the drawing</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <CopilotPanel sheetId={sheetId} onEvidence={onEvidence} />
      </div>
    </div>
  );
};

export default CopilotDrawer;
