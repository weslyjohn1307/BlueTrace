import React, { useState, useEffect } from 'react';
import { X, BrainCircuit, AlertCircle } from 'lucide-react';
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
      className={`fixed top-0 right-0 bottom-0 w-full bg-bt-surface border-l border-bt-border-strong shadow-2xl z-50 flex flex-col overflow-hidden transition-[max-width,opacity] duration-300 ease-out ${
        open ? 'max-w-lg lg:max-w-xl opacity-100 pointer-events-auto' : 'max-w-0 opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-label="Ask the drawing"
      data-testid="copilot-drawer"
      aria-hidden={!open}
      inert={!open}
    >
      {/* Header Bar with Tab Switchers & Close Button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bt-border-subtle bg-bt-inset">
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider cursor-pointer transition-all duration-150 active:scale-[0.98] ${
              activeTab === 'copilot'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-bt-text-secondary hover:text-bt-text-primary hover:bg-bt-surface'
            }`}
          >
            <BrainCircuit className="w-4 h-4 text-bt-brand" />
            <span>Ask Drawing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('discrepancies')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider cursor-pointer transition-all duration-150 active:scale-[0.98] ${
              activeTab === 'discrepancies'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-bt-text-secondary hover:text-bt-text-primary hover:bg-bt-surface'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Discrepancies</span>
            {discrepancies.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-bt-review border border-bt-review-border">
                {discrepancies.length}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
          className="p-1.5 rounded-lg hover:bg-bt-panel text-bt-text-secondary hover:text-bt-on-brand cursor-pointer transition-all duration-150 active:scale-[0.95]"
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
