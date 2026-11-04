import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MousePointer2, AlertOctagon, RefreshCw } from 'lucide-react';

const CAD_LINE = { x1: 80, y1: 120, x2: 440, y2: 120 };

export const IoUBreakdown: React.FC = () => {
  // Draggable bounding box state
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 180,
    y: 90,
    w: 160,
    h: 60,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fixed CAD Line coordinates (a 2-point pure vector line)
  const cadLine = CAD_LINE;
  // Check if box envelopes the line horizontally and vertically
  const containsX1 = box.x <= cadLine.x1 && box.x + box.w >= cadLine.x1;
  const containsX2 = box.x <= cadLine.x2 && box.x + box.w >= cadLine.x2;
  const containsY = box.y <= cadLine.y1 && box.y + box.h >= cadLine.y1;
  const isEnveloping = containsX1 && containsX2 && containsY;

  // The mathematical breakdown:
  const boxAreaPx = box.w * box.h;
  const overlapAreaMm2 = 0.0; // Area of 1D line intersected with 2D box is ZERO!
  const iouValue = 0.0; // 0 / (BoxArea + 0 - 0) = 0.0000

  // Draw the interactive canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    // Architectural faint grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 1. Draw the CAD line (cyan vector)
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cadLine.x1, cadLine.y1);
    ctx.lineTo(cadLine.x2, cadLine.y2);
    ctx.stroke();

    // Draw end vertices
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(cadLine.x1, cadLine.y1, 4, 0, Math.PI * 2);
    ctx.arc(cadLine.x2, cadLine.y2, 4, 0, Math.PI * 2);
    ctx.fill();

    // CAD Line label
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px Inconsolata, monospace';
    ctx.fillText(`CAD Vector: [${cadLine.x1}, ${cadLine.y1}] → [${cadLine.x2}, ${cadLine.y2}] (Stroke: 0.000 pt)`, cadLine.x1, cadLine.y1 - 12);

    // 2. Draw the Predicted AI Bounding Box (draggable emerald/amber box)
    ctx.fillStyle = isEnveloping ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
    ctx.fillRect(box.x, box.y, box.w, box.h);

    ctx.strokeStyle = isEnveloping ? '#10B981' : '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);

    // Bounding Box Label
    ctx.fillStyle = isEnveloping ? '#10B981' : '#F59E0B';
    ctx.font = 'bold 11px Inconsolata, monospace';
    ctx.fillText(`AI Bounding Box (${box.w} × ${box.h} px)`, box.x + 8, box.y + 18);

    // Drag handle cursor indicator
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(box.x + box.w / 2, box.y + box.h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [box, isEnveloping, cadLine]);

  // Handle Dragging
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if mouse is inside the box
    if (
      mouseX >= box.x &&
      mouseX <= box.x + box.w &&
      mouseY >= box.y &&
      mouseY <= box.y + box.h
    ) {
      setIsDragging(true);
      dragStartRef.current = { mouseX, mouseY, boxX: box.x, boxY: box.y };
    }
  }, [box]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dx = mouseX - dragStartRef.current.mouseX;
    const dy = mouseY - dragStartRef.current.mouseY;

    setBox((prev) => ({
      ...prev,
      x: Math.max(10, Math.min(canvas.width - prev.w - 10, dragStartRef.current!.boxX + dx)),
      y: Math.max(10, Math.min(canvas.height - prev.h - 10, dragStartRef.current!.boxY + dy)),
    }));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleReset = () => {
    setBox({ x: 60, y: 80, w: 400, h: 80 });
  };

  return (
    <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <MousePointer2 className="w-4 h-4 text-[#38BDF8]" />
          <span className="font-heading text-sm font-semibold text-white tracking-wide">
            Interactive Visualizer 2: The Zero-Area Line Dilemma
          </span>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-600 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Snap Box to Line</span>
        </button>
      </div>

      {/* Main Drag Canvas */}
      <div className="relative mt-4 bg-[#0F172A] rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          width={540}
          height={240}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-auto block rounded ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        />
        <div className="absolute top-3 right-3 bg-slate-900/90 backdrop-blur-xs border border-slate-700/60 px-3 py-1 rounded text-[11px] font-mono text-slate-400">
          Tip: <span className="text-[#38BDF8]">Drag the box</span> over the vector line
        </div>
      </div>

      {/* Live Math Equation Breakdown */}
      <div className="mt-4 bg-slate-900/80 border border-slate-800 rounded-lg p-3">
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">
          Intersection Over Union (IoU) Formula:
        </div>
        <div className="flex items-center justify-center space-x-3 py-2 font-mono text-sm">
          <span className="text-slate-400">IoU =</span>
          <div className="inline-flex flex-col items-center">
            <span className="text-rose-400 font-bold border-b border-slate-600 px-3 pb-0.5">
              Area(Box ∩ Line) = {overlapAreaMm2.toFixed(3)} mm²
            </span>
            <span className="text-slate-300 pt-0.5">
              Area(Box ∪ Line) = {boxAreaPx.toLocaleString()} px²
            </span>
          </div>
          <span className="text-slate-400">=</span>
          <span className="text-rose-400 font-bold text-base px-2 py-0.5 rounded bg-rose-950/40 border border-rose-800/40">
            {iouValue.toFixed(4)} (Zero IoU)
          </span>
        </div>
      </div>

      {/* Engineering Insight Banner */}
      <div className="mt-4 p-3 rounded-lg bg-bt-review-bg border border-amber-800/40 flex items-start space-x-3 text-xs leading-relaxed text-bt-review">
        <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-bt-review">Why Standard Object Detection Fails: </span>
          Even when the box perfectly encloses the CAD line, the overlap area remains mathematically zero because a 1D vector line has no 2D thickness (0.0 pt stroke).
          In the official dataset, <span className="font-mono font-bold text-white">80.1% (632,317 annotations)</span> are zero-width lines.
        </div>
      </div>
    </div>
  );
};
