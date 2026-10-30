import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, Sliders, AlertCircle, CheckCircle2 } from 'lucide-react';

export const ResolutionSlider: React.FC = () => {
  // dpi value: 20 (equivalent to downscaling 6300px to 640px) up to 150 (native 150 DPI)
  const [dpi, setDpi] = useState<number>(150);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Derived metrics
  const fullWidth = Math.round((42 * dpi));
  const fullHeight = Math.round((30 * dpi));
  const totalPixels = fullWidth * fullHeight;
  const damperSizePx = Math.round((20 * dpi) / 150);
  const symbolCanvasRatio = ((damperSizePx * damperSizePx) / totalPixels) * 100;
  const isBlurry = dpi < 50;

  // Render the simulated technical drawing snippet with the Fire Damper
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#0F172A'; // Dark slate backdrop
    ctx.fillRect(0, 0, width, height);

    // Architectural faint grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Save state before applying resolution scaling/pixelation simulation
    ctx.save();

    // Pixelation factor: when dpi is low, simulate downscaled pixel size
    const pixelScale = Math.max(1, Math.round(150 / dpi));

    if (pixelScale > 1) {
      // Offscreen downsample simulation
      const offW = Math.max(8, Math.floor(width / pixelScale));
      const offH = Math.max(8, Math.floor(height / pixelScale));

      const offCanvas = document.createElement('canvas');
      offCanvas.width = offW;
      offCanvas.height = offH;
      const offCtx = offCanvas.getContext('2d')!;

      offCtx.fillStyle = '#0F172A';
      offCtx.fillRect(0, 0, offW, offH);

      // Scale drawing into small offscreen
      offCtx.scale(1 / pixelScale, 1 / pixelScale);
      drawDrawingElements(offCtx, width, height);

      // Draw pixelated image back onto display canvas
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, offW, offH, 0, 0, width, height);
    } else {
      ctx.imageSmoothingEnabled = true;
      drawDrawingElements(ctx, width, height);
    }

    ctx.restore();

    // Callout badge pointing to the Fire Damper
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(centerX - 40, centerY - 40, 80, 80);

    // Callout pin
    ctx.setLineDash([]);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 40, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [dpi]);

  // Helper drawing function for the CAD snippet
  const drawDrawingElements = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cx = width / 2;
    const cy = height / 2;

    // Draw mechanical duct runs (parallel lines)
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;

    // Main supply duct running horizontally through corridor
    ctx.beginPath();
    ctx.moveTo(40, cy - 30);
    ctx.lineTo(width - 40, cy - 30);
    ctx.moveTo(40, cy + 30);
    ctx.lineTo(width - 40, cy + 30);
    ctx.stroke();

    // Architectural wall running nearby
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, cy - 65);
    ctx.lineTo(width - 40, cy - 65);
    ctx.stroke();

    // Fire Damper Symbol at center (cross in square with damper blades)
    ctx.fillStyle = '#EA580C'; // Safety orange
    ctx.fillRect(cx - 25, cy - 25, 50, 50);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 25, cy - 25, 50, 50);

    // Damper diagonal blades
    ctx.beginPath();
    ctx.moveTo(cx - 25, cy - 25);
    ctx.lineTo(cx + 25, cy + 25);
    ctx.moveTo(cx + 25, cy - 25);
    ctx.lineTo(cx - 25, cy + 25);
    ctx.stroke();

    // Damper label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px Inconsolata, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FD-1', cx, cy + 42);
  };

  return (
    <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-[#38BDF8]" />
          <span className="font-heading text-sm font-semibold text-white tracking-wide">
            Interactive Visualizer 1: Resolution Collapse
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {isBlurry ? (
            <span className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/40 px-2.5 py-1 rounded-full border border-rose-800/40 font-mono">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>AI Blind (Collapsed)</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-800/40 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Native Clarity (100% Retained)</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative mt-4 bg-[#0F172A] rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          width={560}
          height={260}
          className="w-full h-auto block rounded"
        />
        <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs border border-slate-700/60 px-3 py-1.5 rounded-md text-[11px] font-mono text-slate-300">
          Inspection Crop: <span className="text-[#38BDF8]">Fire Damper (FD-1)</span>
        </div>
      </div>

      {/* Interactive Controls & Live Readouts */}
      <div className="mt-5 space-y-4">
        <div>
          <div className="flex justify-between items-center text-xs mb-1.5">
            <label htmlFor="dpi-slider" className="text-slate-300 font-medium flex items-center space-x-1.5">
              <ZoomIn className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Input Resolution:</span>
            </label>
            <span className="font-mono text-[#38BDF8] font-bold text-sm">
              {dpi === 20 ? '20 DPI (640×640 AI Whole-Image)' : `${dpi} DPI (Native Engineering Scan)`}
            </span>
          </div>
          <input
            id="dpi-slider"
            type="range"
            min={20}
            max={150}
            step={5}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#38BDF8]"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>20 DPI (thumbnail squeeze)</span>
            <span>72 DPI (Screen PDF)</span>
            <span>150 DPI (Native Engineering Scan)</span>
          </div>
        </div>

        {/* Real-time Math Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
          <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Canvas Size</div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {dpi === 20 ? '640 × 640' : `${fullWidth} × ${fullHeight}`}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {dpi === 20 ? '0.4M pixels' : `${(totalPixels / 1000000).toFixed(1)}M pixels`}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Damper Footprint</div>
            <div className="text-sm font-mono font-bold text-white mt-0.5">
              {damperSizePx} × {damperSizePx} px
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {damperSizePx * damperSizePx} pixels
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Canvas Share</div>
            <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">
              {symbolCanvasRatio < 0.001 ? '<0.001%' : `${symbolCanvasRatio.toFixed(4)}%`}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              of total image area
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg text-center">
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">AI Detectability</div>
            <div className={`text-sm font-mono font-bold mt-0.5 ${isBlurry ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isBlurry ? '0% (Dissolved)' : '100% (Sharp)'}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {isBlurry ? 'Features Lost' : 'Features Preserved'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
