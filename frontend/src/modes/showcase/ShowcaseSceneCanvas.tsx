import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BrandIcon } from '../../components/brand/BrandAssets';
import {
  ShowcaseScene,
  type HoveredSceneItem,
  type ShowcaseBeat,
  type ShowcaseReviewState,
  type ShowcaseSystem,
} from './showcaseScene';

interface ShowcaseSceneCanvasProps {
  beat: ShowcaseBeat;
  selectedSystem: ShowcaseSystem;
  onSelectSystem: (system: ShowcaseSystem) => void;
  hoveredItem: HoveredSceneItem | null;
  onHoverItem: (item: HoveredSceneItem | null) => void;
  scaleCalibrated?: boolean;
  onToggleScaleCalibrated?: (calibrated: boolean) => void;
  reviewDecision?: ShowcaseReviewState;
  explodeFactor?: number;
  onExplodeFactorChange?: (factor: number) => void;
}

const systems: { id: ShowcaseSystem; label: string; color: string }[] = [
  { id: 'all', label: 'All systems', color: 'system-all' },
  { id: 'mechanical', label: 'Mechanical', color: 'system-mechanical' },
  { id: 'plumbing', label: 'Plumbing', color: 'system-plumbing' },
  { id: 'electrical', label: 'Electrical', color: 'system-electrical' },
];

const beatReadouts: Record<ShowcaseBeat, { kicker: string; title: string; detail: string }> = {
  overview: {
    kicker: 'SOURCE PDF · 150 DPI',
    title: 'Sheet M—201 · Level 02',
    detail: 'Native PDF vector paths + 2.5D discipline reconstruction',
  },
  intake: {
    kicker: '01 · SHEETSCAN RECONNAISSANCE',
    title: 'Mechanical · M—201 Locked',
    detail: 'Title block, symbol legend & equipment schedule indexed',
  },
  recognition: {
    kicker: '02 · POINT-OF-NEED CROP OCR',
    title: 'VAV—02 · 24"x12" · 1,450 CFM',
    detail: '300×300 px crop read in 184 ms via muse-spark-1.3',
  },
  trace: {
    kicker: '03 · PAIRED VECTOR CENTERLINE',
    title: 'Supply Trunk · Route D—04',
    detail: '6 double-line segments paired into midpoint spline',
  },
  layers: {
    kicker: '04 · 2.5D DISCIPLINE SEPARATION',
    title: 'Five Coordinated Layers',
    detail: 'Illustrative visual reconstruction above the source PDF',
  },
  scale: {
    kicker: '05 · FAIL-CLOSED SCALE GATE',
    title: 'Scale Verification Gate',
    detail: 'Physical footage withheld until 2-point calibration is verified',
  },
  reconcile: {
    kicker: '06 · SCHEDULE ↔ PLAN LINKER',
    title: '4 / 4 Equipment Tags Matched',
    detail: 'Schedule table rows cross-referenced to plan coordinates',
  },
  takeoff: {
    kicker: '07 · PROPOSED TAKEOFF LEDGER',
    title: 'Route D—04 · 24"x12" Supply',
    detail: 'SMACNA 24 GA · Evidence & scale state attached',
  },
  review: {
    kicker: '08 · ENGINEER REVIEW GATE',
    title: 'Human-in-the-Loop Signoff',
    detail: 'Accept, correct, reject, or flag uncertain items',
  },
  export: {
    kicker: '09 · AUDITABLE PROVENANCE',
    title: 'Sheet → Vector → Scale → Ledger',
    detail: 'Every exported quantity retains its exact PDF coordinate chain',
  },
  pipeline: {
    kicker: 'HYBRID ARCHITECTURE',
    title: '7-Agent Takeoff Pipeline',
    detail: 'Meta VLM perception + deterministic PyMuPDF/Shapely math',
  },
  close: {
    kicker: 'BLUETRACE',
    title: 'From Drawings to Trusted Takeoff',
    detail: 'Interactive 2.5D engineering walkthrough',
  },
};

export function ShowcaseSceneCanvas({
  beat,
  selectedSystem,
  onSelectSystem,
  hoveredItem,
  onHoverItem,
  scaleCalibrated = false,
  onToggleScaleCalibrated,
  reviewDecision = 'review',
  explodeFactor,
  onExplodeFactorChange,
}: ShowcaseSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShowcaseScene | null>(null);
  const [sceneError, setSceneError] = useState(false);
  const [exploded, setExploded] = useState(beat === 'layers');
  const [planOnly, setPlanOnly] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const readout = beatReadouts[beat];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const scene = new ShowcaseScene(canvas, onHoverItem);
      sceneRef.current = scene;
      return () => {
        scene.dispose();
        sceneRef.current = null;
      };
    } catch {
      setSceneError(true);
      return undefined;
    }
  }, [onHoverItem]);

  useEffect(() => {
    sceneRef.current?.setBeat(beat);
    const nextExploded = beat === 'layers' || beat === 'reconcile' || beat === 'pipeline';
    setExploded(nextExploded);
  }, [beat]);

  useEffect(() => {
    if (typeof explodeFactor === 'number') {
      sceneRef.current?.setExplodeFactor(explodeFactor);
      setExploded(explodeFactor > 0.55);
    }
  }, [explodeFactor]);

  useEffect(() => sceneRef.current?.setSystem(selectedSystem), [selectedSystem]);
  useEffect(() => sceneRef.current?.setPlanOnly(planOnly), [planOnly]);
  useEffect(() => sceneRef.current?.setScaleCalibrated(scaleCalibrated), [scaleCalibrated]);
  useEffect(() => sceneRef.current?.setReviewDecision(reviewDecision), [reviewDecision]);

  const showCropInset =
    beat === 'recognition' || beat === 'trace' || hoveredItem?.id === 'vav-02' || hoveredItem?.id === 'duct-main';

  return (
    <figure
      className="scene-frame"
      aria-labelledby="scene-title"
      onPointerMove={(event) => {
        if (event.pointerType === 'touch' || sceneError) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (cursorRef.current) {
          cursorRef.current.style.transform = `translate3d(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px, 0) translate(-50%, -50%)`;
          cursorRef.current.style.opacity = '1';
        }
      }}
      onPointerLeave={() => {
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
      }}
    >
      {/* Top Stage Telemetry Bar */}
      <div className="scene-meta scene-meta-top">
        <div className="scene-meta-left">
          <span className="scene-sheet-id">M—201</span>
          <span className="scene-beat-pill">{beat.toUpperCase()}</span>
        </div>
        <div className="scene-meta-right">
          <label className="scene-explode-slider" title="Scrub 2.5D layer elevation">
            <span>Z-LIFT</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((explodeFactor ?? (exploded ? 1 : 0.25)) * 100)}
              onChange={(e) => {
                const val = Number(e.target.value) / 100;
                onExplodeFactorChange?.(val);
                sceneRef.current?.setExplodeFactor(val);
                setExploded(val > 0.5);
              }}
              aria-label="2.5D layer elevation"
            />
          </label>
          <span className="scene-disclosure">
            <span className="scene-disclosure-mark" />
            Illustrative 2.5D reconstruction
          </span>
        </div>
      </div>

      {sceneError ? (
        <FallbackPlan system={selectedSystem} planOnly={planOnly} />
      ) : (
        <canvas ref={canvasRef} className="showcase-canvas" aria-hidden="true" />
      )}

      {!sceneError && (
        <div ref={cursorRef} className="cad-cursor" aria-hidden="true">
          <span />
        </div>
      )}

      {/* Point-of-Need 150 DPI Magnified Source Crop Inset */}
      {showCropInset && (
        <div className="scene-crop-inset" aria-label="150 DPI point-of-need source crop magnifier">
          <div className="crop-inset-header">
            <span className="crop-inset-badge">
              <BrandIcon name="detect" size={11} />
              <span>300×300 PX CROP · 150 DPI</span>
            </span>
            <span className="crop-inset-latency">184 ms</span>
          </div>
          <svg viewBox="0 0 220 116" className="crop-inset-svg" aria-hidden="true">
            <rect width="220" height="116" fill="#f6f4ec" />
            <g stroke="rgba(0,91,255,0.12)" strokeWidth="1">
              <line x1="0" y1="28" x2="220" y2="28" />
              <line x1="0" y1="58" x2="220" y2="58" />
              <line x1="0" y1="88" x2="220" y2="88" />
              <line x1="55" y1="0" x2="55" y2="116" />
              <line x1="110" y1="0" x2="110" y2="116" />
              <line x1="165" y1="0" x2="165" y2="116" />
            </g>
            {/* Double-line duct walls */}
            <path d="M12 44 H208 M12 72 H208" stroke="#1e293b" strokeWidth="2.2" fill="none" />
            {/* Derived centerline */}
            <path
              d="M12 58 H208"
              stroke="#005bff"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              className="crop-centerline-anim"
            />
            {/* VAV-02 Symbol Box */}
            <rect x="68" y="34" width="84" height="48" fill="#e9f4ff" stroke="#005bff" strokeWidth="2.2" />
            <text x="110" y="54" textAnchor="middle" fill="#0a0f1e" fontSize="11" fontWeight="700" fontFamily="monospace">
              VAV-02
            </text>
            <text x="110" y="70" textAnchor="middle" fill="#005bff" fontSize="9.5" fontWeight="600" fontFamily="monospace">
              24&quot;x12&quot; · 1450 CFM
            </text>
            {/* Animated Detection Bounding Reticle */}
            <rect
              x="60"
              y="26"
              width="100"
              height="64"
              fill="none"
              stroke="#37c6ff"
              strokeWidth="1.8"
              strokeDasharray="5 3"
            />
          </svg>
          <div className="crop-inset-footer">
            <span>SOURCE REGION E—04</span>
            <span>muse-spark-1.3</span>
          </div>
        </div>
      )}

      {/* Layer & View Controls Launcher */}
      <div className="scene-control-launcher">
        <div className="scene-controls" id="scene-controls-panel" hidden={!controlsOpen}>
          <p className="scene-control-label">Isolate a system</p>
          <div className="scene-system-list" role="group" aria-label="Drawing system layers">
            {systems.map((system) => (
              <button
                key={system.id}
                type="button"
                className={`scene-system-button ${system.color}${selectedSystem === system.id ? ' is-active' : ''}`}
                aria-label={system.id === 'all' ? 'All systems' : system.label}
                aria-pressed={selectedSystem === system.id}
                onClick={() => {
                  onSelectSystem(system.id);
                  setControlsOpen(false);
                }}
              >
                <span className="scene-system-swatch" aria-hidden="true" />
                {system.id === 'all' ? 'All' : system.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="scene-reset"
            onClick={() => {
              setExploded(false);
              setPlanOnly(false);
              setControlsOpen(false);
              onExplodeFactorChange?.(0.22);
              sceneRef.current?.resetView();
              onSelectSystem('all');
              onHoverItem(null);
            }}
          >
            <RotateCcw size={13} aria-hidden="true" />
            Reset view
          </button>
          <div className="scene-mode-list" role="group" aria-label="Plan view controls">
            <button
              type="button"
              className="scene-mode-button"
              aria-pressed={planOnly}
              onClick={() => {
                const next = !planOnly;
                setPlanOnly(next);
                setControlsOpen(false);
              }}
            >
              {planOnly ? 'Show systems' : 'Plan only'}
            </button>
            <button
              type="button"
              className="scene-mode-button"
              aria-pressed={exploded}
              disabled={sceneError}
              onClick={() => {
                const next = !exploded;
                setExploded(next);
                onExplodeFactorChange?.(next ? 1.0 : 0.15);
                sceneRef.current?.setExploded(next);
                setControlsOpen(false);
              }}
            >
              {exploded ? 'Reassemble' : 'Explode'}
            </button>
          </div>
          <button
            type="button"
            className="scene-inspect"
            onClick={() => {
              sceneRef.current?.inspectDuctRoute();
              onSelectSystem('mechanical');
              onHoverItem({
                id: 'duct-main',
                title: 'Supply Trunk · Route D-04 (24"x12")',
                detail: 'Paired double-line vector corridor · 6 segments · 8 vertices',
                system: 'mechanical',
                metrics: scaleCalibrated ? '48.5 LF · SMACNA 24 GA · Verified' : '48.5 LF (Withheld · Scale Unverified)',
              });
              setControlsOpen(false);
            }}
          >
            Inspect D-04
          </button>
        </div>
        <button
          type="button"
          className="scene-control-trigger"
          aria-expanded={controlsOpen}
          aria-controls="scene-controls-panel"
          aria-label={controlsOpen ? 'Close drawing controls' : 'Open drawing controls'}
          onClick={() => setControlsOpen((value) => !value)}
        >
          <BrandIcon name="layers" size={15} />
          <span>Layers</span>
          <small>{selectedSystem === 'all' ? 'All systems' : selectedSystem}</small>
          {controlsOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
        </button>
      </div>

      {/* Live Telemetry & Raycast Hover Card */}
      <div className={`scene-hover-card${hoveredItem ? ' is-visible' : ''}`} aria-hidden="true">
        <span className="scene-hover-kicker">
          {hoveredItem ? `3D ELEMENT · ${(hoveredItem.system ?? 'SHEET').toUpperCase()}` : readout.kicker}
        </span>
        <strong>{hoveredItem?.title ?? readout.title}</strong>
        <span>{hoveredItem?.detail ?? readout.detail}</span>
        {hoveredItem?.metrics && <small className="scene-hover-metrics">{hoveredItem.metrics}</small>}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {hoveredItem
          ? `${hoveredItem.title}. ${hoveredItem.detail}.`
          : `${readout.kicker}. ${readout.title}. ${readout.detail}.`}
      </p>

      {/* Interactive Fail-Closed Scale Stamp */}
      <button
        type="button"
        className={`scene-scale-stamp${scaleCalibrated ? ' is-calibrated' : ''}`}
        id="scene-title"
        onClick={() => onToggleScaleCalibrated?.(!scaleCalibrated)}
        title="Click to toggle 2-point scale calibration (1/8&quot; = 1'-0&quot;)"
      >
        <span className="stamp-icon" aria-hidden="true">
          {scaleCalibrated ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
        </span>
        <span>
          <strong>{scaleCalibrated ? 'Scale Verified · 1/8" = 1\'-0"' : 'Scale Unverified'}</strong>
          <small>{scaleCalibrated ? '48.5 LF unlocked · Click to reset' : 'Review required · Click to calibrate'}</small>
        </span>
      </button>

      <figcaption className="scene-caption">
        <span>SHEET M—201 · 3D EXTRUDED MEP RECONSTRUCTION</span>
        <span>{sceneError ? '2D fallback view' : 'Hover any 3D duct, VAV, pipe, or tray · Drag Z-LIFT slider'}</span>
      </figcaption>
    </figure>
  );
}

function FallbackPlan({ system, planOnly }: { system: ShowcaseSystem; planOnly: boolean }) {
  const show = (id: ShowcaseSystem) => system === 'all' || system === id;
  return (
    <div className="fallback-plan" role="img" aria-label="Synthetic MEP plan with three discipline layers">
      <svg viewBox="0 0 640 470" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="#707a76" strokeWidth="5" opacity=".72">
          <path d="M90 65H558V392H90zM278 65v112M278 255v137M420 65v80M420 230v162M278 255h142" />
        </g>
        {!planOnly && show('mechanical') && (
          <g fill="none" stroke="#005bff" strokeLinecap="square" strokeLinejoin="round">
            <path d="M134 174h154v77h172v-66h68" strokeWidth="20" opacity=".3" />
            <path d="M134 174h154v77h172v-66h68" strokeWidth="3" />
            <circle cx="286" cy="174" r="23" fill="#d7e7f5" strokeWidth="3" />
            <path className="fallback-flow" d="M134 174h154v77h172v-66h68" strokeWidth="2" strokeDasharray="7 9" />
          </g>
        )}
        {!planOnly && show('plumbing') && (
          <path d="M126 323h166v-32h124v54h77" fill="none" stroke="#1ca698" strokeWidth="8" />
        )}
        {!planOnly && show('electrical') && (
          <path d="M164 283h68v42h123v35h86" fill="none" stroke="#e59a38" strokeWidth="5" />
        )}
      </svg>
    </div>
  );
}
