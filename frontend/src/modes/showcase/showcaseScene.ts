import * as THREE from 'three';

export type ShowcaseSystem = 'all' | 'mechanical' | 'plumbing' | 'electrical';
export type ShowcaseBeat =
  | 'overview'
  | 'intake'
  | 'recognition'
  | 'trace'
  | 'layers'
  | 'scale'
  | 'reconcile'
  | 'takeoff'
  | 'review'
  | 'export'
  | 'pipeline'
  | 'close';

export type ShowcaseReviewState = 'review' | 'accepted' | 'correct' | 'reject' | 'cannot-determine';

export interface HoveredSceneItem {
  id: string;
  title: string;
  detail: string;
  system?: Exclude<ShowcaseSystem, 'all'> | 'sheet';
  metrics?: string;
}

const PAGE = { width: 12.4, depth: 8.6, pixelWidth: 1600, pixelHeight: 1110 };
const INK_NAVY = 0x0a0f1e;
const BT_BLUE = 0x005bff;
const SIGNAL_CYAN = 0x37c6ff;
const MECH_BLUE = 0x2b7de9;
const PLUMB_TEAL = 0x1ca698;
const ELEC_AMBER = 0xe59a38;
const EMERALD = 0x10b981;
const ROSE = 0xf43f5e;

interface BeatLayout {
  lift: [number, number, number, number, number]; // [arch, mech, plumb, elec, annotation]
  camera: [number, number, number];
  look: [number, number, number];
  rotation: number;
  explodeFactor: number;
}

const BEAT_LAYOUT: Record<ShowcaseBeat, BeatLayout> = {
  overview: { lift: [0.06, 0.22, 0.38, 0.54, 0.72], camera: [9.8, 18.2, 12.4], look: [0, 0.15, 0], rotation: -0.24, explodeFactor: 0.22 },
  intake: { lift: [0.04, 0.12, 0.2, 0.28, 0.42], camera: [8.8, 17.6, 11.4], look: [-0.2, 0.08, 0.1], rotation: -0.14, explodeFactor: 0.12 },
  recognition: { lift: [0.05, 0.18, 0.3, 0.42, 0.6], camera: [7.6, 15.2, 9.6], look: [-0.65, 0.14, -0.35], rotation: -0.09, explodeFactor: 0.18 },
  trace: { lift: [0.06, 0.34, 0.14, 0.18, 0.68], camera: [7.4, 15.0, 9.5], look: [-0.45, 0.22, -0.25], rotation: -0.15, explodeFactor: 0.32 },
  layers: { lift: [0.28, 0.98, 1.68, 2.36, 3.02], camera: [11.4, 19.6, 14.2], look: [0, 1.15, 0], rotation: -0.34, explodeFactor: 1.0 },
  scale: { lift: [0.06, 0.28, 0.44, 0.6, 0.82], camera: [8.2, 16.2, 10.2], look: [-0.5, 0.18, -0.15], rotation: -0.12, explodeFactor: 0.28 },
  reconcile: { lift: [0.16, 0.62, 1.08, 1.52, 2.15], camera: [10.2, 18.4, 12.8], look: [0.25, 0.65, 0], rotation: -0.26, explodeFactor: 0.68 },
  takeoff: { lift: [0.12, 0.48, 0.82, 1.16, 1.58], camera: [9.8, 18.0, 12.2], look: [0.1, 0.45, 0.05], rotation: -0.22, explodeFactor: 0.5 },
  review: { lift: [0.08, 0.36, 0.58, 0.78, 1.08], camera: [8.4, 16.4, 10.6], look: [-0.2, 0.25, -0.1], rotation: -0.18, explodeFactor: 0.36 },
  export: { lift: [0.14, 0.52, 0.9, 1.28, 1.72], camera: [9.6, 18.2, 12.4], look: [0, 0.5, 0], rotation: -0.24, explodeFactor: 0.55 },
  pipeline: { lift: [0.22, 0.78, 1.34, 1.88, 2.42], camera: [10.8, 19.4, 13.6], look: [0, 0.85, 0], rotation: -0.3, explodeFactor: 0.8 },
  close: { lift: [0.08, 0.28, 0.48, 0.68, 0.92], camera: [9.6, 18.4, 12.2], look: [0, 0.2, 0], rotation: -0.2, explodeFactor: 0.3 },
};

function stdMaterial(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.18, ...options });
}

function canvasTexture(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  transparent = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.pixelWidth;
  canvas.height = PAGE.pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  if (!transparent) {
    ctx.fillStyle = '#f6f4ec';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function worldPoint(px: number, py: number, y = 0) {
  return new THREE.Vector3(
    (px / PAGE.pixelWidth - 0.5) * PAGE.width,
    y,
    (py / PAGE.pixelHeight - 0.5) * PAGE.depth,
  );
}

function drawBasePlan(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Warm engineering vellum sheet background
  ctx.fillStyle = '#f6f4ec';
  ctx.fillRect(0, 0, width, height);

  // Subtle blueprint micro-grid
  ctx.strokeStyle = 'rgba(0, 91, 255, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 60; x < width - 60; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, height - 60);
    ctx.stroke();
  }
  for (let y = 60; y < height - 60; y += 40) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(width - 60, y);
    ctx.stroke();
  }

  // Outer & inner CAD sheet border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, width - 84, height - 84);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(58, 58, width - 116, height - 116);

  // Structural Column Grid lines & Bubbles (A-E, 1-4)
  const colX = [180, 480, 780, 1080, 1260];
  const colLabels = ['A', 'B', 'C', 'D', 'E'];
  const rowY = [190, 440, 690, 840];
  const rowLabels = ['1', '2', '3', '4'];

  ctx.save();
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.32)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([12, 6, 3, 6]);
  colX.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 115);
    ctx.lineTo(x, 875);
    ctx.stroke();
  });
  rowY.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(115, y);
    ctx.lineTo(1310, y);
    ctx.stroke();
  });
  ctx.restore();

  // Grid bubbles
  ctx.font = '600 14px "IBM Plex Mono", Inconsolata, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  colX.forEach((x, idx) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, 96, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(colLabels[idx], x, 96);
  });
  rowY.forEach((y, idx) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(96, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(rowLabels[idx], 96, y);
  });

  // Architectural Room Partitions (2D footprint)
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  const walls: [number, number, number, number][] = [
    [180, 190, 1260, 190],
    [180, 190, 180, 840],
    [1260, 190, 1260, 840],
    [180, 840, 1260, 840],
    [480, 190, 480, 520],
    [480, 610, 480, 840],
    [780, 190, 780, 490],
    [780, 580, 780, 840],
    [1080, 190, 1080, 690],
    [180, 690, 720, 690],
    [830, 690, 1260, 690],
    [480, 440, 1080, 440],
  ];
  walls.forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });

  // Door swings
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(480, 520, 88, 0, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(780, 490, 88, 0, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(720, 690, 95, -Math.PI * 0.5, 0);
  ctx.stroke();

  // Room Numbers & Architectural Tags
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = '600 17px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('MECH ROOM 201', 215, 232);
  ctx.fillText('OPEN LAB BAY 202', 515, 232);
  ctx.fillText('CLEAN CORRIDOR 204', 515, 478);
  ctx.fillText('INSTRUMENT SUITE 203', 815, 232);
  ctx.fillText('ELEC / RISER 205', 1102, 232);
  ctx.fillText('SOUTH CIRCULATION 206', 215, 732);

  // 2D Ghost Footprints of MEP routes on the paper sheet (so lifting 3D shows the 2D origin!)
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 91, 255, 0.22)';
  ctx.lineWidth = 22;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(270, 360);
  ctx.lineTo(580, 360);
  ctx.lineTo(580, 310);
  ctx.lineTo(920, 310);
  ctx.lineTo(920, 540);
  ctx.lineTo(1160, 540);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(28, 166, 152, 0.24)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(250, 765);
  ctx.lineTo(640, 765);
  ctx.lineTo(640, 615);
  ctx.lineTo(1150, 615);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(229, 154, 56, 0.25)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(1180, 290);
  ctx.lineTo(1180, 785);
  ctx.lineTo(390, 785);
  ctx.lineTo(390, 540);
  ctx.stroke();
  ctx.restore();

  // Right-side Sheet Legend & Equipment Schedule Table on the PDF Sheet
  const rx = 1320;
  ctx.fillStyle = '#f0ede2';
  ctx.fillRect(rx, 72, 210, 810);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(rx, 72, 210, 810);

  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(rx, 72, 210, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('SYMBOL LEGEND · M-201', rx + 14, 90);

  const legendItems: [string, string][] = [
    ['#005bff', 'SUPPLY DUCT (SA)'],
    ['#2b7de9', 'VAV TERMINAL BOX'],
    ['#37c6ff', '4-WAY DIFFUSER'],
    ['#1ca698', 'CHILLED WATER (CW)'],
    ['#e59a38', 'CABLE TRAY (E-12)'],
  ];
  legendItems.forEach(([col, label], i) => {
    const ly = 130 + i * 34;
    ctx.fillStyle = col;
    ctx.fillRect(rx + 14, ly - 6, 22, 10);
    ctx.fillStyle = '#1e293b';
    ctx.font = '500 12px "IBM Plex Mono", Inconsolata, monospace';
    ctx.fillText(label, rx + 46, ly);
  });

  // Schedule Block on Sheet
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(rx, 320, 210, 34);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('MECHANICAL SCHEDULE', rx + 14, 338);

  const schedRows = [
    ['TAG', 'SIZE', 'CFM'],
    ['AHU-01', 'MAIN', '4,200'],
    ['VAV-01', '16x10', '950'],
    ['VAV-02', '24x12', '1,450'],
    ['VAV-03', '18x12', '1,100'],
    ['CD-01..6', '24x24', '350'],
  ];
  schedRows.forEach((row, idx) => {
    const sy = 376 + idx * 32;
    if (idx === 0) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(rx + 4, sy - 14, 202, 26);
    }
    ctx.fillStyle = idx === 0 ? '#0f172a' : '#334155';
    ctx.font = `${idx === 0 ? '600' : '500'} 12px "IBM Plex Mono", Inconsolata, monospace`;
    ctx.fillText(row[0], rx + 12, sy);
    ctx.fillText(row[1], rx + 88, sy);
    ctx.fillText(row[2], rx + 150, sy);
  });

  // Bottom Engineering Title Block
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(58, 900, width - 116, 146);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(58, 900, width - 116, 146);

  // Title block Brand Mark + Text
  ctx.fillStyle = '#005bff';
  ctx.fillRect(82, 926, 10, 92);
  ctx.fillStyle = '#37c6ff';
  ctx.fillRect(96, 952, 6, 66);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillText('BLUETRACE  ·  MEP DRAWING INTELLIGENCE', 120, 944);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 15px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('NORTH WING COORDINATION PLAN — LEVEL 02 MECHANICAL / PLUMBING / ELECTRICAL', 120, 978);
  ctx.fillStyle = '#37c6ff';
  ctx.fillText('SOURCE: VECTOR PDF SHEET  ·  150 DPI RASTER + NATIVE PATHS  ·  FAIL-CLOSED SCALE GATE', 120, 1010);

  // Sheet ID Stamp Box on right of Title Block
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(1140, 900);
  ctx.lineTo(1140, 1046);
  ctx.moveTo(1340, 900);
  ctx.lineTo(1340, 1046);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('DISCIPLINE', 1162, 932);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 18px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('MEP COORD', 1162, 962);
  ctx.fillStyle = '#f59e0b';
  ctx.font = '500 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('SCALE: SEE GATE', 1162, 1002);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('SHEET NUMBER', 1364, 932);
  ctx.fillStyle = '#37c6ff';
  ctx.font = '700 38px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('M-201', 1364, 978);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 13px "IBM Plex Mono", Inconsolata, monospace';
  ctx.fillText('REV 04 · IFC', 1364, 1014);
}

interface PulseParticle {
  mesh: THREE.Mesh;
  curve: THREE.Curve<THREE.Vector3>;
  t: number;
  speed: number;
  system: Exclude<ShowcaseSystem, 'all'>;
}

export class ShowcaseScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-7.5, 7.5, 7.5, -7.5, 0.1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly root = new THREE.Group();

  // 5 elevated 3D layers: [0: arch, 1: mechanical, 2: plumbing, 3: electrical, 4: annotation/schedule]
  private readonly layers: THREE.Group[] = [];
  private readonly layerGroups: Record<Exclude<ShowcaseSystem, 'all'>, THREE.Group> = {
    mechanical: new THREE.Group(),
    plumbing: new THREE.Group(),
    electrical: new THREE.Group(),
  };
  private readonly archGroup = new THREE.Group();
  private readonly annotationGroup = new THREE.Group();

  private readonly hitTargets: THREE.Mesh[] = [];
  private readonly focusMarkers: THREE.Mesh[] = [];
  private readonly pulseParticles: PulseParticle[] = [];
  private readonly routeMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly textures: THREE.Texture[] = [];

  private scanBeamGroup = new THREE.Group();
  private reconcileArcsGroup = new THREE.Group();
  private scaleWitnessGroup = new THREE.Group();
  private stageOverlayTexture: THREE.CanvasTexture | null = null;

  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private readonly onHover: (item: HoveredSceneItem | null) => void;

  private hoveredId: string | null = null;
  private currentBeat: ShowcaseBeat = 'overview';
  private currentSystem: ShowcaseSystem = 'all';
  private customExplodeFactor: number | null = null;
  private planOnly = false;
  private scaleCalibrated = false;
  private reviewDecision: ShowcaseReviewState = 'review';

  private targetPointerX = 0;
  private targetPointerY = 0;
  private targetRotation = -0.24;
  private readonly currentLook = new THREE.Vector3(0, 0.15, 0);
  private rafId = 0;
  private previousTime = 0;
  private elapsedTime = 0;
  private active = true;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onHover: (item: HoveredSceneItem | null) => void) {
    this.canvas = canvas;
    this.onHover = onHover;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    // Architectural studio lighting
    this.scene.add(new THREE.HemisphereLight(0xf8fafc, 0x0f172a, 1.65));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.6);
    keyLight.position.set(-8, 18, 11);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x37c6ff, 1.15);
    fillLight.position.set(10, 9, -10);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x005bff, 8, 24, 1.8);
    rimLight.position.set(0, 6, -9);
    this.scene.add(rimLight);

    this.scene.add(this.root);
    this.buildComplete3DStack();

    this.camera.position.set(9.8, 18.2, 12.4);
    this.camera.lookAt(this.currentLook);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();

    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.setBeat('overview');
    this.startLoop();
  }

  setBeat(beat: ShowcaseBeat) {
    this.currentBeat = beat;
    this.customExplodeFactor = null;
    this.applyCurrentLayout();
    this.updateStageOverlay();
    this.requestFrame();
  }

  setExplodeFactor(factor: number) {
    const clamped = Math.max(0, Math.min(1, factor));
    this.customExplodeFactor = clamped;
    this.applyCurrentLayout();
    this.requestFrame();
  }

  setExploded(exploded: boolean) {
    this.setExplodeFactor(exploded ? 1.0 : 0.12);
  }

  setSystem(system: ShowcaseSystem) {
    this.currentSystem = system;
    this.updateLayerVisibility();
    this.requestFrame();
  }

  setPlanOnly(planOnly: boolean) {
    this.planOnly = planOnly;
    this.updateLayerVisibility();
    this.requestFrame();
  }

  setScaleCalibrated(calibrated: boolean) {
    this.scaleCalibrated = calibrated;
    this.updateScaleAndReviewColors();
    this.updateStageOverlay();
    this.requestFrame();
  }

  setReviewDecision(decision: ShowcaseReviewState) {
    this.reviewDecision = decision;
    this.updateScaleAndReviewColors();
    this.updateStageOverlay();
    this.requestFrame();
  }

  inspectDuctRoute() {
    this.setPlanOnly(false);
    this.setSystem('mechanical');
    this.setBeat('trace');
    this.setHovered({
      id: 'duct-main',
      title: 'Supply Trunk · Route D-04 (24"x12")',
      detail: 'Paired double-line vector corridor · 6 segments · 8 vertices',
      system: 'mechanical',
      metrics: this.scaleCalibrated ? '48.5 LF · SMACNA 24 GA · Verified' : '48.5 LF (Withheld · Scale Unverified)',
    });
  }

  resetView() {
    this.planOnly = false;
    this.currentSystem = 'all';
    this.customExplodeFactor = null;
    this.updateLayerVisibility();
    this.setBeat('overview');
    this.setHovered(null);
  }

  private updateLayerVisibility() {
    this.archGroup.visible = !this.planOnly;
    Object.entries(this.layerGroups).forEach(([key, group]) => {
      group.visible = !this.planOnly && (this.currentSystem === 'all' || this.currentSystem === key);
    });
    this.annotationGroup.visible = !this.planOnly;
    this.reconcileArcsGroup.visible =
      !this.planOnly && (this.currentBeat === 'reconcile' || this.currentBeat === 'takeoff' || this.currentBeat === 'export');
    this.scaleWitnessGroup.visible =
      !this.planOnly && (this.currentBeat === 'scale' || this.currentBeat === 'trace' || this.currentBeat === 'review');
  }

  private applyCurrentLayout() {
    const layout = BEAT_LAYOUT[this.currentBeat];
    const baseLifts = BEAT_LAYOUT.layers.lift;
    const factor = this.customExplodeFactor !== null ? this.customExplodeFactor : layout.explodeFactor;

    this.layers.forEach((layer, idx) => {
      const targetLift =
        this.customExplodeFactor !== null
          ? Math.max(0.02, baseLifts[idx] * factor)
          : layout.lift[idx];
      layer.userData.targetY = this.planOnly ? 0.01 : targetLift;
    });

    this.camera.userData.targetPosition = layout.camera;
    this.camera.userData.targetLook = new THREE.Vector3(...layout.look);
    this.targetRotation = layout.rotation;
    this.updateLayerVisibility();
  }

  private buildComplete3DStack() {
    // 0. Base Architectural Paper Sheet (y = 0)
    const baseGroup = new THREE.Group();
    baseGroup.position.y = -0.04;
    this.root.add(baseGroup);

    const shadowTex = canvasTexture((ctx, w, h) => {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.1, w * 0.5, h * 0.5, w * 0.55);
      grad.addColorStop(0, 'rgba(10, 15, 30, 0.34)');
      grad.addColorStop(0.7, 'rgba(10, 15, 30, 0.12)');
      grad.addColorStop(1, 'rgba(10, 15, 30, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }, true);
    this.textures.push(shadowTex);
    const shadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE.width + 1.4, PAGE.depth + 1.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.1;
    this.root.add(shadowMesh);

    const sheetSlab = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE.width, 0.08, PAGE.depth),
      stdMaterial(0xf6f4ec, { roughness: 0.88, metalness: 0.02 }),
    );
    baseGroup.add(sheetSlab);
    this.addWireEdges(sheetSlab, 0x475569, 0.45);

    const basePlanTex = canvasTexture((ctx, w, h) => drawBasePlan(ctx, w, h), false);
    this.textures.push(basePlanTex);
    const basePlanMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE.width - 0.1, PAGE.depth - 0.1),
      new THREE.MeshBasicMaterial({ map: basePlanTex }),
    );
    basePlanMesh.rotation.x = -Math.PI / 2;
    basePlanMesh.position.y = 0.042;
    baseGroup.add(basePlanMesh);

    // Dynamic 2D Stage Overlay on top of the PDF sheet
    this.stageOverlayTexture = canvasTexture(() => {}, true);
    this.textures.push(this.stageOverlayTexture);
    const overlayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE.width - 0.1, PAGE.depth - 0.1),
      new THREE.MeshBasicMaterial({
        map: this.stageOverlayTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    overlayMesh.rotation.x = -Math.PI / 2;
    overlayMesh.position.y = 0.052;
    this.root.add(overlayMesh);

    // 3D Laser Scan Beam for Beat 01 (Intake)
    const beamGeo = new THREE.BoxGeometry(0.08, 0.45, PAGE.depth - 0.4);
    const beamMat = new THREE.MeshBasicMaterial({
      color: SIGNAL_CYAN,
      transparent: true,
      opacity: 0.75,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 0.22;
    const beamGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, PAGE.depth - 0.4),
      new THREE.MeshBasicMaterial({
        color: SIGNAL_CYAN,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beamGlow.rotation.x = -Math.PI / 2;
    beamGlow.position.y = 0.06;
    this.scanBeamGroup.add(beamMesh, beamGlow);
    this.root.add(this.scanBeamGroup);

    // Register 5 elevated 3D layers
    this.layers.push(
      this.archGroup,
      this.layerGroups.mechanical,
      this.layerGroups.plumbing,
      this.layerGroups.electrical,
      this.annotationGroup,
    );
    this.layers.forEach((layer) => this.root.add(layer));

    this.buildArchitecturalLayer();
    this.buildMechanical3DLayer();
    this.buildPlumbing3DLayer();
    this.buildElectrical3DLayer();
    this.buildAnnotationAndScheduleLayer();
  }

  private buildArchitecturalLayer() {
    const wallMat = stdMaterial(0x64748b, { roughness: 0.7, metalness: 0.1, transparent: true, opacity: 0.55 });
    const wallSegments: [number, number, number, number][] = [
      [180, 190, 1260, 190],
      [180, 190, 180, 840],
      [1260, 190, 1260, 840],
      [180, 840, 1260, 840],
      [480, 190, 480, 490],
      [780, 190, 780, 470],
      [1080, 190, 1080, 690],
      [180, 690, 700, 690],
      [840, 690, 1260, 690],
    ];
    wallSegments.forEach(([x1, y1, x2, y2]) => {
      const p1 = worldPoint(x1, y1);
      const p2 = worldPoint(x2, y2);
      const len = p1.distanceTo(p2);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.05), wallMat);
      wall.position.copy(p1).add(p2).multiplyScalar(0.5);
      wall.position.y = 0.09;
      wall.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      this.archGroup.add(wall);
    });

    // Structural Columns at Grid Intersections
    const colMat = stdMaterial(0x334155, { roughness: 0.5, metalness: 0.25 });
    [180, 480, 780, 1080, 1260].forEach((cx) => {
      [190, 440, 690, 840].forEach((cy) => {
        const pt = worldPoint(cx, cy);
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.11), colMat);
        col.position.set(pt.x, 0.12, pt.z);
        this.archGroup.add(col);
      });
    });
  }

  private buildMechanical3DLayer() {
    const group = this.layerGroups.mechanical;
    this.addLayerFrame(group, BT_BLUE);

    // 1. 3D AHU-01 Air Handling Unit in Mech Room 201
    const ahuPos = worldPoint(280, 360);
    const ahuGroup = new THREE.Group();
    ahuGroup.position.set(ahuPos.x, 0.18, ahuPos.z);

    const ahuBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.34, 0.58),
      stdMaterial(0x123a78, { roughness: 0.32, metalness: 0.45 }),
    );
    ahuGroup.add(ahuBody);
    this.addWireEdges(ahuBody, SIGNAL_CYAN, 0.85);

    const ahuPlenum = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.26, 0.42),
      stdMaterial(BT_BLUE, { roughness: 0.3, metalness: 0.35 }),
    );
    ahuPlenum.position.set(0.54, -0.02, 0);
    ahuGroup.add(ahuPlenum);
    this.addWireEdges(ahuPlenum, 0xffffff, 0.6);
    group.add(ahuGroup);

    this.registerHitTarget(ahuBody, {
      id: 'ahu-01',
      title: 'AHU-01 · Main Supply Air Handler',
      detail: 'Mech Room 201 · 4,200 CFM · Schedule matched',
      system: 'mechanical',
      metrics: 'CSI 23 73 13 · Supply Fan + Chilled Water Coil',
    });
    this.addVerticalDropLine(group, ahuPos.x, ahuPos.z, BT_BLUE);

    // 2. 3D Rectangular Supply Duct Trunk (Route D-04)
    const ductMat = stdMaterial(MECH_BLUE, {
      roughness: 0.3,
      metalness: 0.32,
      emissive: new THREE.Color(BT_BLUE),
      emissiveIntensity: 0.12,
    });
    this.routeMaterials.push(ductMat);

    const trunkNodes: [number, number][] = [
      [340, 360],
      [580, 360],
      [580, 310],
      [920, 310],
      [920, 540],
      [1160, 540],
    ];

    for (let i = 0; i < trunkNodes.length - 1; i += 1) {
      const p1 = worldPoint(trunkNodes[i][0], trunkNodes[i][1], 0.16);
      const p2 = worldPoint(trunkNodes[i + 1][0], trunkNodes[i + 1][1], 0.16);
      const len = p1.distanceTo(p2) + 0.16;
      const width = i < 3 ? 0.24 : 0.19;
      const segMesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, width), ductMat);
      segMesh.position.copy(p1).add(p2).multiplyScalar(0.5);
      segMesh.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      group.add(segMesh);
      this.addWireEdges(segMesh, 0x9edfff, 0.75);

      this.registerHitTarget(segMesh, {
        id: 'duct-main',
        title: `Supply Trunk · Route D-04 (Seg 0${i + 1})`,
        detail: '24"x12" Galvanized Rectangular Duct · Paired boundary centerline',
        system: 'mechanical',
        metrics: 'SMACNA 24 GA · Double-line corridor midpoint',
      });
    }

    // Secondary Branch Runs to Diffusers
    const branches: [[number, number], [number, number]][] = [
      [[580, 360], [580, 565]],
      [[740, 310], [740, 545]],
      [[920, 410], [1035, 410]],
    ];
    const branchMat = stdMaterial(0x3e8ccb, { roughness: 0.36, metalness: 0.25 });
    branches.forEach(([start, end], idx) => {
      const p1 = worldPoint(start[0], start[1], 0.14);
      const p2 = worldPoint(end[0], end[1], 0.14);
      const len = p1.distanceTo(p2);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.11), branchMat);
      mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
      mesh.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      group.add(mesh);
      this.addWireEdges(mesh, 0xcbe7ff, 0.6);
      this.registerHitTarget(mesh, {
        id: `duct-branch-${idx + 1}`,
        title: `Supply Branch · SB-0${idx + 1} (12"x8")`,
        detail: 'Branch runout feeding ceiling diffuser terminal',
        system: 'mechanical',
        metrics: 'CSI 23 31 13 · Low-pressure branch takeoff',
      });
    });

    // 3. 3D VAV Terminal Boxes (VAV-01, VAV-02, VAV-03)
    const vavSpecs: { px: number; py: number; tag: string; cfm: string; size: string }[] = [
      { px: 475, py: 360, tag: 'VAV-01', cfm: '950 CFM', size: '16"x10" Inlet' },
      { px: 580, py: 360, tag: 'VAV-02', cfm: '1,450 CFM', size: '24"x12" Inlet' },
      { px: 920, py: 395, tag: 'VAV-03', cfm: '1,100 CFM', size: '18"x12" Inlet' },
    ];
    vavSpecs.forEach((vav) => {
      const pos = worldPoint(vav.px, vav.py, 0.18);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 0.34),
        stdMaterial(0x005bff, { roughness: 0.25, metalness: 0.4 }),
      );
      box.position.copy(pos);
      group.add(box);
      this.addWireEdges(box, 0xffffff, 0.9);

      // Reheat control actuator box on side of VAV
      const actuator = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.14, 0.1),
        stdMaterial(SIGNAL_CYAN, { roughness: 0.2, metalness: 0.3 }),
      );
      actuator.position.set(pos.x, pos.y + 0.04, pos.z + 0.2);
      group.add(actuator);

      this.addVerticalDropLine(group, pos.x, pos.z, SIGNAL_CYAN);
      this.registerHitTarget(box, {
        id: vav.tag.toLowerCase(),
        title: `${vav.tag} · Variable Air Volume Terminal`,
        detail: `${vav.size} · ${vav.cfm} · Hot Water Reheat Coil`,
        system: 'mechanical',
        metrics: 'OCR Callout + Schedule Row Reconciled',
      });

      // Focus ring on VAV-02
      if (vav.tag === 'VAV-02') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.28, 0.34, 48),
          new THREE.MeshBasicMaterial({
            color: SIGNAL_CYAN,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.04, pos.z);
        ring.userData.focusMarker = true;
        group.add(ring);
        this.focusMarkers.push(ring);
      }
    });

    // 4. 3D 4-Way Ceiling Diffuser Terminals
    const diffusers: [number, number, string][] = [
      [580, 565, 'CD-01'],
      [740, 545, 'CD-02'],
      [1035, 410, 'CD-03'],
      [1160, 540, 'CD-04'],
    ];
    diffusers.forEach(([px, py, tag]) => {
      const pos = worldPoint(px, py, 0.1);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.05, 0.32),
        stdMaterial(0xe9f4ff, { roughness: 0.3, metalness: 0.2 }),
      );
      plate.position.copy(pos);
      this.addWireEdges(plate, BT_BLUE, 0.85);
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 0.12, 16),
        stdMaterial(MECH_BLUE),
      );
      neck.position.set(pos.x, pos.y + 0.07, pos.z);
      group.add(plate, neck);
      this.addVerticalDropLine(group, pos.x, pos.z, MECH_BLUE);
      this.registerHitTarget(plate, {
        id: tag.toLowerCase(),
        title: `${tag} · 4-Way Supply Ceiling Diffuser`,
        detail: '24"x24" Face · 10" Neck · 350 CFM',
        system: 'mechanical',
        metrics: 'Symbol Finder Exemplar Match (IoU 0.94)',
      });
    });

    // 5. Glowing 3D Vector Centerline Spline + Topological Nodes + Traveling Pulses
    const curvePoints = trunkNodes.map(([x, y]) => worldPoint(x, y, 0.26));
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.05);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(120));
    const centerline = new THREE.Line(
      lineGeo,
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.16,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.95,
      }),
    );
    centerline.computeLineDistances();
    group.add(centerline);

    // Node vertices along the centerline
    curvePoints.forEach((pt, idx) => {
      const nodeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 16),
        new THREE.MeshBasicMaterial({ color: SIGNAL_CYAN }),
      );
      nodeMesh.position.copy(pt);
      group.add(nodeMesh);
      if (idx === 1 || idx === 3) {
        this.addVerticalDropLine(group, pt.x, pt.z, BT_BLUE);
      }
    });

    // Create 3 traveling vector pulse spheres along the mechanical centerline
    for (let i = 0; i < 3; i += 1) {
      const pulseMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 16, 16),
        new THREE.MeshBasicMaterial({ color: SIGNAL_CYAN }),
      );
      group.add(pulseMesh);
      this.pulseParticles.push({
        mesh: pulseMesh,
        curve,
        t: i / 3,
        speed: 0.22,
        system: 'mechanical',
      });
    }

    // 6. 3D Scale Gate Witness Bar above Route D-04
    const wStart = worldPoint(340, 255, 0.28);
    const wEnd = worldPoint(920, 255, 0.28);
    const wLen = wStart.distanceTo(wEnd);
    const witnessBar = new THREE.Mesh(
      new THREE.BoxGeometry(wLen, 0.03, 0.03),
      new THREE.MeshBasicMaterial({ color: ELEC_AMBER }),
    );
    witnessBar.position.copy(wStart).add(wEnd).multiplyScalar(0.5);
    witnessBar.userData.scaleWitness = true;
    const tickL = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.14, 0.24),
      new THREE.MeshBasicMaterial({ color: ELEC_AMBER }),
    );
    tickL.position.copy(wStart);
    tickL.userData.scaleWitness = true;
    const tickR = tickL.clone();
    tickR.position.copy(wEnd);
    tickR.userData.scaleWitness = true;
    this.scaleWitnessGroup.add(witnessBar, tickL, tickR);
    group.add(this.scaleWitnessGroup);
  }

  private buildPlumbing3DLayer() {
    const group = this.layerGroups.plumbing;
    this.addLayerFrame(group, PLUMB_TEAL);

    const pipeMat = stdMaterial(PLUMB_TEAL, {
      roughness: 0.28,
      metalness: 0.38,
      emissive: new THREE.Color(PLUMB_TEAL),
      emissiveIntensity: 0.08,
    });

    const pipeNodes: [number, number][] = [
      [250, 765],
      [640, 765],
      [640, 615],
      [1150, 615],
      [1150, 390],
    ];
    const pipePoints = pipeNodes.map(([x, y]) => worldPoint(x, y, 0.12));
    const pipeCurve = new THREE.CatmullRomCurve3(pipePoints, false, 'catmullrom', 0.04);
    const tubeGeo = new THREE.TubeGeometry(pipeCurve, 80, 0.055, 16, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, pipeMat);
    group.add(tubeMesh);

    this.registerHitTarget(tubeMesh, {
      id: 'pipe-cw-01',
      title: 'Chilled Water Main · Route P-02 (4" Ø)',
      detail: 'Single-line topological pipe network · Copper Type L',
      system: 'plumbing',
      metrics: 'CSI 22 11 16 · 3 isolation valves + vertical riser stack',
    });

    // Vertical Riser Column & Isolation Valves
    const riserPos = worldPoint(1150, 390, 0.12);
    const riserStack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.55, 20),
      stdMaterial(0x0f766e, { roughness: 0.25, metalness: 0.45 }),
    );
    riserStack.position.set(riserPos.x, 0.26, riserPos.z);
    group.add(riserStack);
    this.addVerticalDropLine(group, riserPos.x, riserPos.z, PLUMB_TEAL);
    this.registerHitTarget(riserStack, {
      id: 'riser-p02',
      title: 'Vertical Hydronic Riser · ST-02',
      detail: 'Floor-to-floor penetration collar · Elevation adder +14.0 ft',
      system: 'plumbing',
      metrics: 'Automatic vertical drop/riser footage adder',
    });

    // Valve stations along the pipe
    [
      [440, 765, 'GV-01 · Gate Valve'],
      [640, 690, 'CV-02 · Check Valve'],
      [900, 615, 'BV-03 · Balancing Valve'],
    ].forEach(([px, py, label], idx) => {
      const vp = worldPoint(Number(px), Number(py), 0.12);
      const valve = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 18, 18),
        stdMaterial(0xe6fffa, { roughness: 0.2, metalness: 0.3 }),
      );
      valve.position.copy(vp);
      this.addWireEdges(valve, PLUMB_TEAL, 0.9);
      group.add(valve);
      this.addVerticalDropLine(group, vp.x, vp.z, PLUMB_TEAL);
      this.registerHitTarget(valve, {
        id: `valve-${idx + 1}`,
        title: String(label),
        detail: '4" Flanged Hydronic Valve Assembly',
        system: 'plumbing',
        metrics: 'Counted fitting · Linked to Piping Schedule',
      });
    });

    // Pulse particle on plumbing route
    for (let i = 0; i < 2; i += 1) {
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0x5eead4 }),
      );
      group.add(pMesh);
      this.pulseParticles.push({
        mesh: pMesh,
        curve: pipeCurve,
        t: i * 0.5,
        speed: 0.18,
        system: 'plumbing',
      });
    }
  }

  private buildElectrical3DLayer() {
    const group = this.layerGroups.electrical;
    this.addLayerFrame(group, ELEC_AMBER);

    const trayMat = stdMaterial(ELEC_AMBER, {
      roughness: 0.32,
      metalness: 0.4,
      emissive: new THREE.Color(ELEC_AMBER),
      emissiveIntensity: 0.08,
    });

    const trayNodes: [number, number][] = [
      [1180, 290],
      [1180, 785],
      [390, 785],
      [390, 540],
    ];
    for (let i = 0; i < trayNodes.length - 1; i += 1) {
      const p1 = worldPoint(trayNodes[i][0], trayNodes[i][1], 0.1);
      const p2 = worldPoint(trayNodes[i + 1][0], trayNodes[i + 1][1], 0.1);
      const len = p1.distanceTo(p2) + 0.12;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.14), trayMat);
      tray.position.copy(p1).add(p2).multiplyScalar(0.5);
      tray.rotation.y = -Math.atan2(p2.z - p1.z, p2.x - p1.x);
      group.add(tray);
      this.addWireEdges(tray, 0xfef08a, 0.75);
      this.registerHitTarget(tray, {
        id: 'tray-e12',
        title: 'Cable Tray · Circuit E-12 (12" Ladder)',
        detail: 'Feeder route from Panel EM-2A to Mech Room 201',
        system: 'electrical',
        metrics: 'CSI 26 05 36 · NEC 40% Conduit/Tray Fill Verified',
      });
    }

    // 3D Panelboard EM-2A in Elec Room 205
    const panelPos = worldPoint(1180, 270, 0.2);
    const panelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.38, 0.16),
      stdMaterial(0xb45309, { roughness: 0.3, metalness: 0.45 }),
    );
    panelMesh.position.copy(panelPos);
    group.add(panelMesh);
    this.addWireEdges(panelMesh, 0xfde68a, 0.9);
    this.addVerticalDropLine(group, panelPos.x, panelPos.z, ELEC_AMBER);
    this.registerHitTarget(panelMesh, {
      id: 'panel-em2a',
      title: 'Panelboard · EM-2A (480Y/277V)',
      detail: 'Elec / Riser Room 205 · 225A Main Breaker',
      system: 'electrical',
      metrics: 'Feeds AHU-01 & VAV Reheat Circuits · 270° total bends (< 360° NEC limit)',
    });

    // Junction Boxes
    [
      [1180, 785, 'JB-01'],
      [780, 785, 'JB-02'],
      [390, 785, 'JB-03'],
    ].forEach(([px, py, tag]) => {
      const jp = worldPoint(Number(px), Number(py), 0.12);
      const jb = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.18),
        stdMaterial(0xfef3c7, { roughness: 0.3, metalness: 0.2 }),
      );
      jb.position.copy(jp);
      this.addWireEdges(jb, ELEC_AMBER, 0.9);
      group.add(jb);
      this.registerHitTarget(jb, {
        id: String(tag).toLowerCase(),
        title: `${tag} · 480V Pull / Junction Box`,
        detail: 'NEMA 1 Enclosure · Corridor ceiling plenum',
        system: 'electrical',
        metrics: 'Bend accumulator reset point (NEC Art. 358)',
      });
    });

    const eCurve = new THREE.CatmullRomCurve3(
      trayNodes.map(([x, y]) => worldPoint(x, y, 0.16)),
      false,
    );
    const ePulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
    );
    group.add(ePulse);
    this.pulseParticles.push({
      mesh: ePulse,
      curve: eCurve,
      t: 0.25,
      speed: 0.2,
      system: 'electrical',
    });
  }

  private buildAnnotationAndScheduleLayer() {
    // Floating 3D Schedule & Legend Plane on the right side of the sheet
    const schedCardTex = canvasTexture((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // Floating Legend & Schedule Card
      const rx = 1285;
      ctx.fillStyle = 'rgba(10, 15, 30, 0.94)';
      ctx.fillRect(rx, 80, 255, 420);
      ctx.strokeStyle = '#37c6ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(rx, 80, 255, 420);

      ctx.fillStyle = '#005bff';
      ctx.fillRect(rx, 80, 255, 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px "IBM Plex Mono", Inconsolata, monospace';
      ctx.fillText('SCHEDULE RECONCILER', rx + 16, 106);

      const rows = [
        ['AHU-01', '1 PLAN / 1 SCHED', '#37c6ff'],
        ['VAV-01', '1 PLAN / 1 SCHED', '#10b981'],
        ['VAV-02', '1 PLAN / 1 SCHED', '#10b981'],
        ['VAV-03', '1 PLAN / 1 SCHED', '#10b981'],
        ['CD-01..4', '4 PLAN / 4 SCHED', '#37c6ff'],
        ['P-02 CW', 'VERIFIED RISER', '#1ca698'],
      ];
      rows.forEach(([tag, status, col], i) => {
        const y = 158 + i * 54;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(rx + 12, y - 22, 231, 42);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 15px "IBM Plex Mono", Inconsolata, monospace';
        ctx.fillText(tag, rx + 22, y + 3);
        ctx.fillStyle = col;
        ctx.font = '500 12px "IBM Plex Mono", Inconsolata, monospace';
        ctx.fillText(status, rx + 108, y + 3);
      });
    }, true);
    this.textures.push(schedCardTex);

    const cardPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE.width - 0.1, PAGE.depth - 0.1),
      new THREE.MeshBasicMaterial({
        map: schedCardTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    cardPlane.rotation.x = -Math.PI / 2;
    cardPlane.position.y = 0.02;
    this.annotationGroup.add(cardPlane);

    // 3D Parabolic Reconciliation Arcs connecting Schedule Card to VAV-01, VAV-02, VAV-03
    const schedOrigin = worldPoint(1290, 260, 0.02);
    const targets: [number, number, number][] = [
      [475, 360, BT_BLUE],
      [580, 360, SIGNAL_CYAN],
      [920, 395, EMERALD],
    ];
    targets.forEach(([tx, ty, color], idx) => {
      const targetPt = worldPoint(tx, ty, -1.1);
      const midPt = new THREE.Vector3(
        (schedOrigin.x + targetPt.x) * 0.5,
        0.55 + idx * 0.14,
        (schedOrigin.z + targetPt.z) * 0.5,
      );
      const arcCurve = new THREE.QuadraticBezierCurve3(schedOrigin, midPt, targetPt);
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcCurve.getPoints(48));
      const arcLine = new THREE.Line(
        arcGeo,
        new THREE.LineDashedMaterial({
          color,
          dashSize: 0.18,
          gapSize: 0.09,
          transparent: true,
          opacity: 0.9,
        }),
      );
      arcLine.computeLineDistances();
      this.reconcileArcsGroup.add(arcLine);
    });
    this.annotationGroup.add(this.reconcileArcsGroup);
  }

  private addLayerFrame(group: THREE.Group, color: number) {
    // Subtle translucent technical reference frame per discipline layer
    const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(PAGE.width - 0.5, 0.01, PAGE.depth - 0.5));
    const frame = new THREE.LineSegments(
      frameGeo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.38 }),
    );
    group.add(frame);
  }

  private addVerticalDropLine(parent: THREE.Group, x: number, z: number, color: number) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.05, z),
      new THREE.Vector3(x, -2.4, z),
    ]);
    const line = new THREE.Line(
      geom,
      new THREE.LineDashedMaterial({
        color,
        dashSize: 0.08,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.42,
      }),
    );
    line.computeLineDistances();
    parent.add(line);
  }

  private addWireEdges(mesh: THREE.Mesh, color: number, opacity: number) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 20),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    edges.position.copy(mesh.position);
    edges.quaternion.copy(mesh.quaternion);
    edges.scale.copy(mesh.scale);
    mesh.parent?.add(edges);
  }

  private registerHitTarget(mesh: THREE.Mesh, item: HoveredSceneItem) {
    mesh.userData.hoverItem = item;
    this.hitTargets.push(mesh);
  }

  private updateScaleAndReviewColors() {
    let targetHex = MECH_BLUE;
    if (this.currentBeat === 'review') {
      if (this.reviewDecision === 'accepted' || this.reviewDecision === 'correct') targetHex = EMERALD;
      else if (this.reviewDecision === 'reject') targetHex = ROSE;
      else targetHex = ELEC_AMBER;
    } else if (this.scaleCalibrated) {
      targetHex = BT_BLUE;
    }

    this.routeMaterials.forEach((mat) => {
      mat.color.setHex(targetHex);
    });

    const witnessColor = this.scaleCalibrated ? EMERALD : ELEC_AMBER;
    this.scaleWitnessGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.scaleWitness) {
        (child.material as THREE.MeshBasicMaterial).color.setHex(witnessColor);
      }
    });
  }

  private updateStageOverlay() {
    const canvas = this.stageOverlayTexture?.image as HTMLCanvasElement | undefined;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !this.stageOverlayTexture) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const drawBadge = (label: string, x: number, y: number, bg = '#0a0f1e', border = '#37c6ff', fg = '#ffffff') => {
      ctx.save();
      ctx.font = '600 15px "IBM Plex Mono", Inconsolata, monospace';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = bg;
      ctx.fillRect(x - 10, y - 20, tw + 20, 30);
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 10, y - 20, tw + 20, 30);
      ctx.fillStyle = fg;
      ctx.fillText(label, x, y);
      ctx.restore();
    };

    const drawCornerBox = (x: number, y: number, w: number, h: number, color = '#37c6ff') => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(55, 198, 255, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    };

    const beat = this.currentBeat;
    if (beat === 'intake') {
      drawCornerBox(58, 900, width - 116, 146, '#005bff');
      drawCornerBox(1320, 72, 210, 235, '#37c6ff');
      drawCornerBox(1320, 320, 210, 235, '#10b981');
      drawBadge('SHEETSCAN · TITLE BLOCK M-201', 90, 882, '#0a0f1e', '#005bff');
      drawBadge('SYMBOL LEGEND LOCKED', 1080, 110, '#0a0f1e', '#37c6ff');
      drawBadge('EQUIPMENT SCHEDULE LOCKED', 1040, 355, '#0a0f1e', '#10b981');
    } else if (beat === 'recognition') {
      drawCornerBox(425, 310, 100, 100, '#37c6ff');
      drawCornerBox(530, 310, 100, 100, '#005bff');
      drawCornerBox(870, 345, 100, 100, '#37c6ff');
      drawBadge('VAV-01 · 950 CFM', 385, 292, '#0a0f1e', '#37c6ff');
      drawBadge('VAV-02 · 24"x12" · 1,450 CFM', 530, 292, '#005bff', '#ffffff');
      drawBadge('VAV-03 · 1,100 CFM', 855, 326, '#0a0f1e', '#37c6ff');
    } else if (beat === 'trace') {
      drawBadge('VECTOR CORRIDOR · ROUTE D-04 · 6 SEGMENTS', 520, 270, '#0a0f1e', '#37c6ff');
    } else if (beat === 'scale') {
      if (this.scaleCalibrated) {
        drawBadge('SCALE CALIBRATED · 1/8" = 1\'-0" · 48.5 LF VERIFIED', 440, 240, '#064e3b', '#10b981');
      } else {
        drawBadge('SCALE UNVERIFIED · PHYSICAL FOOTAGE WITHHELD', 440, 240, '#451a03', '#f59e0b', '#fef3c7');
      }
    } else if (beat === 'reconcile') {
      drawBadge('SCHEDULE ↔ PLAN RECONCILIATION · 4/4 MATCHED', 520, 240, '#0a0f1e', '#10b981');
    } else if (beat === 'takeoff') {
      drawBadge(
        this.scaleCalibrated
          ? 'PROPOSED LEDGER ROW · D-04 · 48.5 LF READY'
          : 'PROPOSED LEDGER ROW · D-04 · REVIEW REQUIRED',
        480,
        240,
        '#0a0f1e',
        this.scaleCalibrated ? '#10b981' : '#f59e0b',
      );
    } else if (beat === 'review') {
      const labelMap: Record<ShowcaseReviewState, string> = {
        review: 'HITL GATE · AWAITING ENGINEER DECISION',
        accepted: 'ENGINEER ACCEPTED · COMMITTED TO LEDGER',
        correct: 'ENGINEER CORRECTED · DIMENSION UPDATED',
        reject: 'ENGINEER REJECTED · EXCLUDED FROM TOTALS',
        'cannot-determine': 'FLAGGED CANNOT DETERMINE · ESCALATED',
      };
      drawBadge(labelMap[this.reviewDecision], 480, 240, '#0a0f1e', '#37c6ff');
    } else if (beat === 'export') {
      drawBadge('PROVENANCE CHAIN · SHEET M-201 → VECTOR D-04 → LEDGER', 430, 240, '#0a0f1e', '#005bff');
    }

    this.stageOverlayTexture.needsUpdate = true;
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    const aspect = width / height;
    const viewHeight = Math.max(16.8, 13.6 / aspect);
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }

  private handlePointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.targetPointerX = this.pointer.y * 0.04;
    this.targetPointerY = this.pointer.x * 0.065;
    this.pickObject();
  };

  private handlePointerLeave = () => {
    this.pointer.set(2, 2);
    this.targetPointerX = 0;
    this.targetPointerY = 0;
    this.setHovered(null);
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') this.handlePointerMove(event);
    this.pickObject();
  };

  private handleVisibilityChange = () => {
    this.active = document.visibilityState === 'visible';
    if (this.active) this.startLoop();
    else cancelAnimationFrame(this.rafId);
  };

  private pickObject() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visibleTargets = this.hitTargets.filter((mesh) => {
      let curr: THREE.Object3D | null = mesh;
      while (curr) {
        if (!curr.visible) return false;
        curr = curr.parent;
      }
      return true;
    });
    const hit = this.raycaster.intersectObjects(visibleTargets, false)[0];
    if (!hit) {
      this.setHovered(null);
      return;
    }
    const item = hit.object.userData.hoverItem as HoveredSceneItem | undefined;
    this.setHovered(item ?? null);
  }

  private setHovered(item: HoveredSceneItem | null) {
    if (this.hoveredId === (item?.id ?? null)) return;
    this.hoveredId = item?.id ?? null;
    this.onHover(item);
  }

  private requestFrame() {
    if (this.reducedMotion) {
      this.snapToTargets();
      this.render();
      return;
    }
    this.startLoop();
  }

  private startLoop() {
    if (this.reducedMotion) {
      this.snapToTargets();
      this.render();
      return;
    }
    if (!this.rafId && this.active && !this.disposed) {
      this.previousTime = performance.now();
      this.rafId = requestAnimationFrame(this.animate);
    }
  }

  private animate = (time: number) => {
    if (this.disposed || !this.active) {
      this.rafId = 0;
      return;
    }
    const delta = Math.min((time - (this.previousTime || time)) / 1000, 0.05);
    this.previousTime = time;
    this.elapsedTime += delta;
    const mix = 1 - Math.exp(-delta * 6.0);

    // Smooth camera & root parallax interpolation
    this.root.rotation.x += (-0.05 + this.targetPointerX - this.root.rotation.x) * mix;
    this.root.rotation.y += (this.targetRotation + this.targetPointerY - this.root.rotation.y) * mix;

    // Smooth layer elevation interpolation
    this.layers.forEach((layer) => {
      const targetY = Number(layer.userData.targetY ?? 0);
      layer.position.y += (targetY - layer.position.y) * mix;
    });

    // Camera position & lookAt
    const camTarget = this.camera.userData.targetPosition as number[] | undefined;
    if (camTarget) {
      this.camera.position.x += (camTarget[0] + this.targetPointerY * 2.4 - this.camera.position.x) * mix;
      this.camera.position.y += (camTarget[1] + this.targetPointerX * 2.0 - this.camera.position.y) * mix;
      this.camera.position.z += (camTarget[2] - this.camera.position.z) * mix;
    }
    const lookTarget = this.camera.userData.targetLook as THREE.Vector3 | undefined;
    if (lookTarget) {
      this.currentLook.lerp(lookTarget, mix);
      this.camera.lookAt(this.currentLook);
    }

    // Continuous 60fps simulated motions:
    // 1. Traveling vector pulses along duct, pipe, and tray centerlines
    this.pulseParticles.forEach((p) => {
      p.t = (p.t + delta * p.speed) % 1.0;
      const pt = p.curve.getPointAt(p.t);
      p.mesh.position.copy(pt);
      const pulseScale = 0.85 + 0.35 * Math.sin(this.elapsedTime * 6 + p.t * 12);
      p.mesh.scale.setScalar(pulseScale);
    });

    // 2. Intake laser scan beam sweep
    this.scanBeamGroup.visible = this.currentBeat === 'intake' && !this.planOnly;
    if (this.scanBeamGroup.visible) {
      const sweep = Math.sin(this.elapsedTime * 1.45) * (PAGE.width * 0.44);
      this.scanBeamGroup.position.x = sweep;
    }

    // 3. Focus ring gentle pulse
    this.focusMarkers.forEach((ring) => {
      const s = 1.0 + 0.14 * Math.sin(this.elapsedTime * 4.2);
      ring.scale.setScalar(s);
    });

    this.render();
    this.rafId = requestAnimationFrame(this.animate);
  };

  private snapToTargets() {
    this.scanBeamGroup.visible = false;
    this.root.rotation.set(-0.05 + this.targetPointerX, this.targetRotation + this.targetPointerY, 0);
    this.layers.forEach((layer) => {
      layer.position.y = Number(layer.userData.targetY ?? 0);
    });
    const camTarget = this.camera.userData.targetPosition as number[] | undefined;
    if (camTarget) this.camera.position.set(camTarget[0], camTarget[1], camTarget[2]);
    const lookTarget = this.camera.userData.targetLook as THREE.Vector3 | undefined;
    if (lookTarget) {
      this.currentLook.copy(lookTarget);
      this.camera.lookAt(this.currentLook);
    }
  }

  private render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.scene.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.textures.forEach((tex) => tex.dispose());
    this.renderer.dispose();
  }
}

export { INK_NAVY };
