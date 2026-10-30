import React, { useState } from 'react';
import {
  Ruler,
  X,
  Crosshair,
} from 'lucide-react';
import type { Point } from '../../utils/transform';

export interface ScaleCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCalibration: (label: string, ptToMetersRatio: number) => void;
  rulerPoints?: { pointA: Point | null; pointB: Point | null };
  onStartRulerMode?: () => void;
}

// Preset options: [label, ratio_pt_to_meters, description]
const PRESET_SCALES: Array<{ label: string; ptToM: number; description: string }> = [
  {
    label: '1/8" = 1\'-0" (1:96)',
    ptToM: (96 * 0.0254) / 72, // ~0.03387 m/pt
    description: 'Standard Architectural (Floor Plans)',
  },
  {
    label: '1/4" = 1\'-0" (1:48)',
    ptToM: (48 * 0.0254) / 72, // ~0.01693 m/pt
    description: 'Standard Architectural (Detailed Mechanical)',
  },
  {
    label: '3/8" = 1\'-0" (1:32)',
    ptToM: (32 * 0.0254) / 72, // ~0.01129 m/pt
    description: 'Enlarged Equipment Rooms',
  },
  {
    label: '1/2" = 1\'-0" (1:24)',
    ptToM: (24 * 0.0254) / 72, // ~0.00847 m/pt
    description: 'Enlarged MEP Details & Sections',
  },
  {
    label: '1:50 Metric',
    ptToM: (50 * 0.0254) / 72, // ~0.01764 m/pt
    description: 'Standard Metric MEP Plan',
  },
  {
    label: '1:100 Metric',
    ptToM: (100 * 0.0254) / 72, // ~0.03528 m/pt
    description: 'Standard Metric Overview Plan',
  },
];

export const ScaleCalibrationModal: React.FC<ScaleCalibrationModalProps> = ({
  isOpen,
  onClose,
  onApplyCalibration,
  rulerPoints,
  onStartRulerMode,
}) => {
  const [activeTab, setActiveTab] = useState<'preset' | 'ruler'>('preset');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);

  // Ruler state
  const [rulerLengthInput, setRulerLengthInput] = useState('10.0');
  const [rulerUnit, setRulerUnit] = useState<'ft' | 'm'>('ft');

  if (!isOpen) return null;

  // Calculate distance between points in points
  let pointsDistancePt: number | null = null;
  if (rulerPoints?.pointA && rulerPoints?.pointB) {
    const dx = rulerPoints.pointB.x - rulerPoints.pointA.x;
    const dy = rulerPoints.pointB.y - rulerPoints.pointA.y;
    pointsDistancePt = Math.sqrt(dx * dx + dy * dy);
  }

  const handleApplyPreset = () => {
    const preset = PRESET_SCALES[selectedPresetIndex];
    onApplyCalibration(preset.label, preset.ptToM);
    onClose();
  };

  const handleApplyRuler = () => {
    if (!pointsDistancePt || pointsDistancePt <= 0) return;
    const userVal = parseFloat(rulerLengthInput);
    if (isNaN(userVal) || userVal <= 0) return;

    // Convert to metres
    const physicalMetres = rulerUnit === 'ft' ? userVal * 0.3048 : userVal;
    const ptToM = physicalMetres / pointsDistancePt;
    const label = `Custom Ruler (${userVal} ${rulerUnit})`;

    onApplyCalibration(label, ptToM);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calibrate Drawing Scale"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 select-none"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#006D84]/10 text-[#006D84] flex items-center justify-center">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-slate-900">
                Calibrate Drawing Scale
              </h3>
              <p className="text-[11px] text-slate-500">
                Enable physical distance takeoff in feet and metres
              </p>
            </div>
          </div>
          <button
            id="scale-modal-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close Scale Calibration"
            className="p-1.5 rounded-md hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('preset')}
            className={`flex-1 py-2.5 text-center transition-colors cursor-pointer border-b-2 ${
              activeTab === 'preset'
                ? 'border-[#006D84] text-[#006D84] bg-white font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Option A: Standard Preset
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ruler')}
            className={`flex-1 py-2.5 text-center transition-colors cursor-pointer border-b-2 ${
              activeTab === 'ruler'
                ? 'border-[#006D84] text-[#006D84] bg-white font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Option B: 2-Point Reference Ruler
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {activeTab === 'preset' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Select the architectural or engineering scale printed in the drawing sheet’s title block:
              </p>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {PRESET_SCALES.map((scale, idx) => {
                  const isSelected = selectedPresetIndex === idx;
                  return (
                    <label
                      key={scale.label}
                      className={`flex items-start space-x-3 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky-50/60 border-[#006D84] ring-1 ring-[#006D84]/30'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="preset_scale"
                        checked={isSelected}
                        onChange={() => setSelectedPresetIndex(idx)}
                        className="mt-0.5 text-[#006D84] focus:ring-[#006D84]"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-slate-800 block">
                          {scale.label}
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {scale.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  className="w-full py-2 px-4 rounded-lg bg-[#006D84] hover:bg-[#005769] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Apply {PRESET_SCALES[selectedPresetIndex].label}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600">
                Calibrate by picking two points of known real-world distance on the drawing (e.g. a grid line bay or door width):
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Reference Points:</span>
                  {pointsDistancePt ? (
                    <span className="font-mono font-semibold text-emerald-700">
                      {Math.round(pointsDistancePt)} pt measured
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">None placed</span>
                  )}
                </div>

                {onStartRulerMode && (
                  <button
                    type="button"
                    onClick={() => {
                      onStartRulerMode();
                      onClose();
                    }}
                    className="w-full flex items-center justify-center space-x-2 py-1.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-[#006D84]" />
                    <span>
                      {pointsDistancePt ? 'Re-pick 2 Points on Canvas' : 'Pick 2 Points on Canvas'}
                    </span>
                  </button>
                )}
              </div>

              {pointsDistancePt && (
                <div className="space-y-1.5">
                  <label className="block font-medium text-slate-700">
                    Known Real-World Distance:
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      step="0.1"
                      value={rulerLengthInput}
                      onChange={(e) => setRulerLengthInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#006D84]"
                      placeholder="e.g. 10.0"
                    />
                    <select
                      value={rulerUnit}
                      onChange={(e) => setRulerUnit(e.target.value as 'ft' | 'm')}
                      className="px-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#006D84]"
                    >
                      <option value="ft">Feet (ft)</option>
                      <option value="m">Metres (m)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleApplyRuler}
                  disabled={!pointsDistancePt}
                  className="w-full py-2 px-4 rounded-lg bg-[#006D84] hover:bg-[#005769] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Confirm Ruler Calibration
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
