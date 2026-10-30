import React from 'react';
import { Layers, FileText, CheckCircle2, AlertTriangle, ScanLine } from 'lucide-react';

export interface SheetItemData {
  sheet_id: string;
  sheet_number: string;
  sheet_title: string;
  discipline: string;
  scale_raw?: string | null;
  scale_ratio?: number | null;
  scale_status: 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED';
  page_index: number;
}

export interface SheetTreeProps {
  sheets: SheetItemData[];
  activeSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
  onScanNewSheet?: () => void;
  isScanning?: boolean;
}

export const SheetTree: React.FC<SheetTreeProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  onScanNewSheet,
  isScanning = false,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 border-r border-slate-800 text-xs">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-100 uppercase tracking-wider text-[11px]">
            Sheet Directory
          </span>
        </div>
        {onScanNewSheet && (
          <button
            type="button"
            onClick={onScanNewSheet}
            disabled={isScanning}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-cyan-600/80 hover:bg-cyan-500 text-white transition-all disabled:opacity-50 cursor-pointer text-[10px]"
            title="Scan Sheet with muse-spark-1.3"
          >
            <ScanLine className="w-3 h-3" />
            <span>{isScanning ? 'Scanning...' : 'SheetScan'}</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sheets.length === 0 ? (
          <div className="p-4 text-center text-slate-500 italic text-[11px]">
            No sheets scanned yet. Click SheetScan to analyze title blocks.
          </div>
        ) : (
          sheets.map((sheet) => {
            const isActive = sheet.sheet_id === activeSheetId;
            const isScaleVerified =
              sheet.scale_status === 'VERIFIED' || sheet.scale_status === 'CALIBRATED';

            return (
              <button
                type="button"
                key={sheet.sheet_id}
                onClick={() => onSelectSheet(sheet.sheet_id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col space-y-1 ${
                  isActive
                    ? 'bg-slate-800 border-cyan-500/60 shadow-xs'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-mono font-bold text-slate-100">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sheet.sheet_number}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    {sheet.discipline}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 truncate font-sans">
                  {sheet.sheet_title || 'Untitled Sheet'}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                  <span className="text-slate-400">Scale:</span>
                  {isScaleVerified ? (
                    <span className="flex items-center space-x-1 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>{sheet.scale_raw || 'Verified'}</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-amber-400 font-medium">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>Review Required</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
