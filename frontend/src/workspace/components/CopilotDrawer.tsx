import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import { CopilotPanel } from './CopilotPanel';
import { DiscrepancyList } from './DiscrepancyList';
import type { DiscrepancyItem } from '../../api/contracts';

export interface CopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  sheetId: string | null;
  onEvidence: (boxes: number[][]) => void;
  discrepancies?: DiscrepancyItem[];
  onLocateItem?: (coords: [number, number], zoom?: number) => void;
  onPlaceGhostPin?: (ghostId: string) => void;
  onDismissDiscrepancy?: (itemId: string) => void;
  onVerifyDiscrepancy?: (itemId: string) => void;
}

/**
 * BlueTraceAI Conversational Copilot & Schedule Discrepancies Drawer.
 * Retained in the DOM with Tailwind CSS translate-x transitions to preserve
 * conversational history and discrepancy triage states.
 */
export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  open,
  onClose,
  sheetId,
  onEvidence,
  discrepancies = [],
  onLocateItem,
  onPlaceGhostPin,
  onDismissDiscrepancy,
  onVerifyDiscrepancy,
}) => {
  const [activeTab, setActiveTab] = useState<'copilot' | 'discrepancies'>('copilot');

  // If discrepancies are provided and there are unresolved items, select discrepancies tab initially
  useEffect(() => {
    if (discrepancies.length > 0) {
      setActiveTab('discrepancies');
    }
  }, [discrepancies.length]);

  return (
    <div
      className={`fixed top-0 right-0 bottom-0 w-full max-w-lg lg:max-w-xl bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
      }`}
      role="dialog"
      aria-label="Ask the drawing"
      data-testid="copilot-drawer"
      aria-hidden={!open}
    >
      {/* Header Bar with Tab Switchers & Close Button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
              activeTab === 'copilot'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ask Drawing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('discrepancies')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
              activeTab === 'discrepancies'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Discrepancies</span>
            {discrepancies.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {discrepancies.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Persistent Tab Bodies Retained in DOM */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div
          className={`flex-1 overflow-hidden flex flex-col ${
            activeTab === 'copilot' ? 'flex' : 'hidden'
          }`}
        >
          <CopilotPanel sheetId={sheetId} onEvidence={onEvidence} />
        </div>

        <div
          className={`flex-1 overflow-hidden flex flex-col ${
            activeTab === 'discrepancies' ? 'flex' : 'hidden'
          }`}
        >
          <DiscrepancyList
            discrepancies={discrepancies}
            onLocateItem={onLocateItem}
            onPlaceGhostPin={onPlaceGhostPin}
            onDismissDiscrepancy={onDismissDiscrepancy}
            onVerifyDiscrepancy={onVerifyDiscrepancy}
            onEvidence={onEvidence}
          />
        </div>
      </div>
    </div>
  );
};

export default CopilotDrawer;
