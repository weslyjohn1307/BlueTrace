import React from 'react';

interface LaserScanLoaderProps {
  label?: string;
  sublabel?: string;
  discipline?: string;
}

export const LaserScanLoader: React.FC<LaserScanLoaderProps> = ({
  label = 'SYS.CAD // RASTERIZING_VECTOR_LAYERS',
  sublabel = 'Aligning 150 DPI viewport & vector linework...',
  discipline = 'MEP-HVAC',
}) => {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md select-none cad-dot-grid-dark"
      data-testid="laser-scan-loader"
    >
      {/* CAD Calibration Frame */}
      <div className="relative w-84 h-52 rounded-lg border border-cyan-500/30 bg-slate-900/60 shadow-[0_0_35px_rgba(14,165,233,0.2)] overflow-hidden flex flex-col justify-between p-4">
        {/* Corner Precision Reticles */}
        <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
        <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
        <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
        <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />

        {/* Animated Laser Scanning Beam */}
        <div className="absolute inset-x-0 h-[2px] bg-cyan-400 shadow-[0_0_12px_#22d3ee] animate-scan-radar pointer-events-none">
          <div className="w-full h-12 -mt-12 bg-gradient-to-t from-cyan-400/20 to-transparent pointer-events-none" />
        </div>

        {/* Header Micro-Badges */}
        <div className="flex items-center justify-between text-[10px] font-mono text-cyan-400/80 border-b border-cyan-500/20 pb-2">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-semibold tracking-wider">HARDWARE ACCEL</span>
          </div>
          <span className="text-slate-400">150 DPI // {discipline}</span>
        </div>

        {/* Center Grid Geometry Silhouette */}
        <div className="my-auto flex flex-col items-center justify-center space-y-2 py-2">
          <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs">
            <span className="inline-flex space-x-1">
              <span className="w-1.5 h-3 bg-cyan-400 animate-pulse" />
              <span className="w-1.5 h-3 bg-cyan-400/80 animate-pulse" />
              <span className="w-1.5 h-3 bg-cyan-400/50 animate-pulse" />
              <span className="w-1.5 h-3 bg-cyan-400/20" />
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-slate-200">{label}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 text-center max-w-xs truncate">
            {sublabel}
          </div>
        </div>

        {/* Footer Real-Time Telemetry Bar */}
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-2 border-t border-slate-800">
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            ZERO OCR DRIFT
          </span>
          <span className="text-cyan-400">MUSE-SPARK-1.3 // ONLINE</span>
        </div>
      </div>
    </div>
  );
};
