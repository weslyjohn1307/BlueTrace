import React from 'react';

interface BlueprintRadarLoaderProps {
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BlueprintRadarLoader: React.FC<BlueprintRadarLoaderProps> = ({
  label = 'SYSTEM.SCAN // ACTIVE',
  sublabel = 'Analyzing vector geometry & title block...',
  size = 'md',
}) => {
  const dimensionClass = size === 'sm' ? 'w-32 h-32' : size === 'lg' ? 'w-56 h-56' : 'w-44 h-44';

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4 select-none">
      {/* Radar Disc Container */}
      <div
        className={`relative ${dimensionClass} rounded-full overflow-hidden border border-cyan-500/30 bg-slate-950/80 shadow-[0_0_25px_rgba(14,165,233,0.15)] flex items-center justify-center`}
      >
        {/* Concentric Range Rings */}
        <div className="absolute w-3/4 h-3/4 rounded-full border border-cyan-500/20" />
        <div className="absolute w-1/2 h-1/2 rounded-full border border-cyan-500/25" />
        <div className="absolute w-1/4 h-1/4 rounded-full border border-cyan-500/30" />

        {/* Crosshairs */}
        <div className="absolute w-full h-[1px] bg-cyan-500/20" />
        <div className="absolute h-full w-[1px] bg-cyan-500/20" />

        {/* Rotating Radar Sweep */}
        <div className="absolute inset-0 animate-radar-sweep pointer-events-none">
          <div className="w-1/2 h-1/2 bg-gradient-to-tr from-cyan-500/30 via-cyan-400/10 to-transparent rounded-tl-full origin-bottom-right" />
        </div>

        {/* Dynamic Telemetry Target Blips */}
        <div className="absolute top-[28%] right-[24%] w-2 h-2 bg-amber-400 rounded-full animate-ping opacity-75" />
        <div className="absolute top-[28%] right-[24%] w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_#f59e0b]" />

        <div className="absolute bottom-[30%] left-[28%] w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />

        {/* Center Reticle Pin */}
        <div className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]" />
      </div>

      {/* Monospace Technical Telemetry Readout */}
      <div className="text-center space-y-1">
        <div className="text-xs font-mono font-semibold tracking-wider text-cyan-400 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{label}</span>
        </div>
        {sublabel && (
          <p className="text-[11px] text-slate-400 font-mono tracking-tight">{sublabel}</p>
        )}
      </div>
    </div>
  );
};
