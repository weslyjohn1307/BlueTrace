import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  ShowcaseScene,
  type HoveredSceneItem,
  type ShowcaseBeat,
  type ShowcaseSystem,
} from './showcaseScene';

interface ShowcaseSceneCanvasProps {
  beat: ShowcaseBeat;
  selectedSystem: ShowcaseSystem;
  onSelectSystem: (system: ShowcaseSystem) => void;
  hoveredItem: HoveredSceneItem | null;
  onHoverItem: (item: HoveredSceneItem | null) => void;
}

const systems: { id: ShowcaseSystem; label: string; color: string }[] = [
  { id: 'all', label: 'All systems', color: 'system-all' },
  { id: 'mechanical', label: 'Mechanical', color: 'system-mechanical' },
  { id: 'plumbing', label: 'Plumbing', color: 'system-plumbing' },
  { id: 'electrical', label: 'Electrical', color: 'system-electrical' },
];

export function ShowcaseSceneCanvas({
  beat,
  selectedSystem,
  onSelectSystem,
  hoveredItem,
  onHoverItem,
}: ShowcaseSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShowcaseScene | null>(null);
  const [sceneError, setSceneError] = useState(false);

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

  useEffect(() => sceneRef.current?.setBeat(beat), [beat]);
  useEffect(() => sceneRef.current?.setSystem(selectedSystem), [selectedSystem]);

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
      <div className="scene-meta scene-meta-top">
        <span className="scene-sheet-id">M—201</span>
        <span className="scene-disclosure"><span className="scene-disclosure-mark" />Illustrative demo</span>
      </div>

      {sceneError ? (
        <FallbackPlan system={selectedSystem} />
      ) : (
        <canvas ref={canvasRef} className="showcase-canvas" aria-hidden="true" />
      )}

      {!sceneError && <div ref={cursorRef} className="cad-cursor" aria-hidden="true"><span /></div>}

      <div className="scene-controls">
        <p className="scene-control-label">Isolate a system</p>
        <div className="scene-system-list" role="group" aria-label="Drawing system layers">
          {systems.map((system) => (
            <button
              key={system.id}
              type="button"
              className={`scene-system-button ${system.color}${selectedSystem === system.id ? ' is-active' : ''}`}
              aria-pressed={selectedSystem === system.id}
              onClick={() => onSelectSystem(system.id)}
            >
              <span className="scene-system-swatch" aria-hidden="true" />
              {system.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="scene-reset"
          onClick={() => {
            sceneRef.current?.resetView();
            onSelectSystem('all');
            onHoverItem(null);
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />
          Reset view
        </button>
        <button
          type="button"
          className="scene-inspect"
          onClick={() => {
            sceneRef.current?.inspectDuctRoute();
            onSelectSystem('mechanical');
            onHoverItem({ id: 'duct-main', title: 'Supply duct · route D-04', detail: 'Synthetic plan · mechanical layer' });
          }}
        >
          Inspect D-04
        </button>
      </div>

      <div className={`scene-hover-card${hoveredItem ? ' is-visible' : ''}`} aria-hidden="true">
        <span className="scene-hover-kicker">Drawing reference</span>
        <strong>{hoveredItem?.title ?? 'Hover over a marked route'}</strong>
        <span>{hoveredItem?.detail ?? 'Each highlight is part of a synthetic example.'}</span>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {hoveredItem ? `${hoveredItem.title}. ${hoveredItem.detail}.` : ''}
      </p>

      <div className="scene-scale-stamp" id="scene-title">
        <span className="stamp-icon" aria-hidden="true">!</span>
        <span><strong>Scale</strong><small>Review required</small></span>
      </div>

      <figcaption className="scene-caption">
        <span>CONCEPT PLAN · SYNTHETIC DATA</span>
        <span>{sceneError ? '2D fallback view' : 'Hover a route to inspect its context'}</span>
      </figcaption>
    </figure>
  );
}

function FallbackPlan({ system }: { system: ShowcaseSystem }) {
  const show = (id: ShowcaseSystem) => system === 'all' || system === id;
  return (
    <div className="fallback-plan" role="img" aria-label="Synthetic MEP plan with three discipline layers">
      <svg viewBox="0 0 640 470" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke="#707a76" strokeWidth="5" opacity=".72">
          <path d="M90 65H558V392H90zM278 65v112M278 255v137M420 65v80M420 230v162M278 255h142" />
        </g>
        {show('mechanical') && <g fill="none" stroke="#3f8fe8" strokeLinecap="square" strokeLinejoin="round">
          <path d="M134 174h154v77h172v-66h68" strokeWidth="20" opacity=".3" />
          <path d="M134 174h154v77h172v-66h68" strokeWidth="3" />
          <circle cx="286" cy="174" r="23" fill="#d7e7f5" strokeWidth="3" />
          <path className="fallback-flow" d="M134 174h154v77h172v-66h68" strokeWidth="2" strokeDasharray="7 9" />
        </g>}
        {show('plumbing') && <path d="M126 323h166v-32h124v54h77" fill="none" stroke="#52a494" strokeWidth="8" />}
        {show('electrical') && <path d="M164 283h68v42h123v35h86" fill="none" stroke="#e8a65c" strokeWidth="5" />}
      </svg>
    </div>
  );
}
