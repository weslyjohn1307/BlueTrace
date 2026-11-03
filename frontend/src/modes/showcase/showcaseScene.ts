import * as THREE from 'three';

export type ShowcaseSystem = 'all' | 'mechanical' | 'plumbing' | 'electrical';
export type ShowcaseBeat = 'overview' | 'layers' | 'evidence' | 'review' | 'pipeline' | 'close';

export interface HoveredSceneItem {
  id: string;
  title: string;
  detail: string;
}

const PAGE = { width: 11.8, depth: 8.2, pixelWidth: 1416, pixelHeight: 984 };
const BLUE = 0x286f9f;
const GREEN = 0x327b6b;
const AMBER = 0xa96a32;
const STAGE = 0x111b20;

const BEAT_LAYOUT: Record<ShowcaseBeat, { lift: [number, number, number, number]; camera: [number, number, number]; look: [number, number, number]; rotation: number }> = {
  overview: { lift: [0.035, 0.07, 0.105, 0.14], camera: [10, 20, 13], look: [0, 0, 0], rotation: -0.22 },
  layers: { lift: [1.1, 2.05, 3, 3.85], camera: [10.8, 22, 14], look: [0, 0.28, 0], rotation: -0.3 },
  evidence: { lift: [0.025, 0.05, 0.08, 0.11], camera: [8, 18, 10], look: [-1.2, 0, -0.55], rotation: -0.12 },
  review: { lift: [0.045, 0.075, 0.11, 0.14], camera: [9, 19, 11], look: [0.5, 0, 0.1], rotation: -0.18 },
  pipeline: { lift: [0.55, 1.12, 1.7, 2.25], camera: [10.5, 22, 14], look: [0, 0.2, 0], rotation: -0.28 },
  close: { lift: [0.02, 0.04, 0.06, 0.08], camera: [9.8, 20, 12.2], look: [0, 0, 0], rotation: -0.18 },
};

function material(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.015, ...options });
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, transparent = true) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.pixelWidth;
  canvas.height = PAGE.pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  if (!transparent) {
    ctx.fillStyle = '#f2eee3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function setDraftStyle(ctx: CanvasRenderingContext2D, color = '#49575a', width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
}

function drawBasePlan(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(0, 0, width, height);
  // A quiet paper tooth and registration marks make this read as a printed sheet, not a flat UI card.
  let seed = 11;
  for (let i = 0; i < 440; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const x = (seed / 2147483647) * width;
    seed = (seed * 16807) % 2147483647;
    const y = (seed / 2147483647) * height;
    ctx.fillStyle = i % 2 ? 'rgba(105,91,68,.035)' : 'rgba(255,255,255,.26)';
    ctx.fillRect(x, y, 1.7, 1.7);
  }

  setDraftStyle(ctx, '#455256', 2.4);
  ctx.strokeRect(47, 48, width - 94, height - 96);
  ctx.strokeRect(67, 68, width - 134, height - 136);
  // Plan geometry: room outlines and openings are deliberately schematic and labeled synthetic.
  setDraftStyle(ctx, '#596662', 3.2);
  const walls = [
    [156, 170, 1108, 170], [156, 170, 156, 710], [1108, 170, 1108, 710],
    [156, 710, 520, 710], [662, 710, 1108, 710], [520, 170, 520, 345],
    [520, 448, 520, 710], [810, 170, 810, 300], [810, 410, 810, 710],
    [520, 448, 810, 448], [900, 448, 1108, 448], [278, 448, 520, 448],
  ];
  walls.forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
  // Door swings, openings and a pair of fixture marks.
  ctx.strokeStyle = '#87928f'; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.arc(520, 448, 78, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(810, 410, 70, Math.PI * 1.5, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(208, 504, 118, 104); ctx.strokeRect(225, 520, 84, 72);
  ctx.strokeRect(954, 517, 94, 114); ctx.strokeRect(972, 535, 58, 76);
  // Room labels and light construction hatch.
  ctx.fillStyle = '#687570'; ctx.font = '500 20px Inconsolata, monospace';
  ctx.fillText('MECHANICAL', 210, 232); ctx.fillText('OPEN OFFICE', 575, 232); ctx.fillText('SERVICE', 902, 232); ctx.fillText('CORRIDOR', 585, 666);
  ctx.font = '400 15px Inconsolata, monospace'; ctx.fillText('SYNTHETIC PLAN / LEVEL 02', 92, 108);
  // Dimension strings.
  setDraftStyle(ctx, '#818b86', 1.2);
  [[156, 140, 1108, 140], [126, 170, 126, 710], [520, 724, 520, 762], [810, 724, 810, 762]].forEach(([x1,y1,x2,y2]) => { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });
  [156, 520, 810, 1108].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 132); ctx.lineTo(x, 150); ctx.stroke(); });
  [170, 448, 710].forEach((y) => { ctx.beginPath(); ctx.moveTo(117, y); ctx.lineTo(135, y); ctx.stroke(); });
  ctx.fillStyle = '#596660'; ctx.font = '400 15px Inconsolata, monospace'; ctx.textAlign = 'center';
  ctx.fillText('— — —', 338, 131); ctx.fillText('— — —', 675, 131); ctx.textAlign = 'left';
  // Title block and discipline legend anchor the plan in drawing culture.
  setDraftStyle(ctx, '#66726f', 1.3);
  ctx.strokeRect(67, 798, width - 134, 105); ctx.beginPath(); ctx.moveTo(790, 798); ctx.lineTo(790, 903); ctx.moveTo(1040, 798); ctx.lineTo(1040, 903); ctx.stroke();
  ctx.fillStyle = '#27353a'; ctx.font = '600 20px Inconsolata, monospace'; ctx.fillText('BLUE TRACE  /  MEP COORDINATION', 88, 832);
  ctx.fillStyle = '#78837f'; ctx.font = '400 15px Inconsolata, monospace'; ctx.fillText('SHEET M—201    •    CONCEPT PLAN    •    NOT TO SCALE', 88, 862);
  ctx.fillText('LEVEL 02', 813, 832); ctx.fillText('ISSUED FOR REVIEW', 813, 864);
  ctx.fillStyle = '#344148'; ctx.font = '600 29px Inconsolata, monospace'; ctx.fillText('M—201', 1061, 847);
  ctx.font = '400 14px Inconsolata, monospace'; ctx.fillText('ILLUSTRATIVE', 1061, 876);
}

function drawMechanical(ctx: CanvasRenderingContext2D) {
  // Supply route: a duct trace with branches, terminal boxes and diffuser symbols.
  ctx.save(); ctx.strokeStyle = '#286f9f'; ctx.lineWidth = 24; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel';
  ctx.beginPath(); ctx.moveTo(240, 390); ctx.lineTo(440, 390); ctx.lineTo(440, 330); ctx.lineTo(720, 330); ctx.lineTo(720, 398); ctx.lineTo(1000, 398); ctx.stroke();
  ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(440, 390); ctx.lineTo(440, 550); ctx.moveTo(720, 398); ctx.lineTo(720, 570); ctx.moveTo(880, 398); ctx.lineTo(880, 535); ctx.stroke();
  ctx.strokeStyle = '#eff5f4'; ctx.lineWidth = 2; ctx.setLineDash([10, 13]);
  ctx.beginPath(); ctx.moveTo(240, 390); ctx.lineTo(440, 390); ctx.lineTo(440, 330); ctx.lineTo(720, 330); ctx.lineTo(720, 398); ctx.lineTo(1000, 398); ctx.stroke(); ctx.restore();
  // VAV boxes and linear diffusers.
  [[440,390,'VAV—02'],[720,398,'VAV—03']].forEach(([x,y,label]) => {
    const px = Number(x); const py = Number(y);
    ctx.fillStyle = '#f5f2e8'; ctx.strokeStyle = '#286f9f'; ctx.lineWidth = 3; ctx.fillRect(px-34,py-27,68,54); ctx.strokeRect(px-34,py-27,68,54);
    ctx.fillStyle = '#286f9f'; ctx.font = '500 13px Inconsolata, monospace'; ctx.textAlign = 'center'; ctx.fillText(String(label),px,py+5);
  });
  [[440,550],[720,570],[880,535]].forEach(([x,y]) => {
    ctx.strokeStyle = '#286f9f'; ctx.lineWidth = 4;
    for (let i=0;i<5;i+=1) { ctx.beginPath(); ctx.moveTo(x-34+i*17,y-19); ctx.lineTo(x-34+i*17,y+19); ctx.stroke(); }
    ctx.strokeRect(x-44,y-24,88,48);
  });
  ctx.textAlign = 'left'; ctx.fillStyle = '#205d86'; ctx.font = '500 17px Inconsolata, monospace'; ctx.fillText('SA  /  SUPPLY', 504, 306); ctx.fillText('D—04', 263, 366);
}

function drawPlumbing(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#327b6b'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(240, 625); ctx.lineTo(380, 625); ctx.lineTo(380, 575); ctx.lineTo(590, 575); ctx.lineTo(590, 618); ctx.lineTo(956, 618); ctx.lineTo(956, 540); ctx.stroke();
  ctx.lineWidth = 5; ctx.setLineDash([3,14]); ctx.strokeStyle = '#f3f2e9'; ctx.stroke(); ctx.setLineDash([]);
  [[380,575],[590,618],[956,618]].forEach(([x,y])=>{ ctx.beginPath(); ctx.arc(x,y,13,0,Math.PI*2); ctx.fillStyle='#f4f0e6'; ctx.fill(); ctx.strokeStyle='#327b6b'; ctx.lineWidth=4; ctx.stroke(); });
  ctx.fillStyle='#347366'; ctx.font='500 16px Inconsolata, monospace'; ctx.fillText('CW RETURN  /  P—02', 620, 598);
}

function drawElectrical(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#a96a32'; ctx.lineWidth = 7; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel';
  ctx.beginPath(); ctx.moveTo(260, 270); ctx.lineTo(360, 270); ctx.lineTo(360, 520); ctx.lineTo(620, 520); ctx.lineTo(620, 660); ctx.lineTo(918, 660); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(845, 660); ctx.lineTo(845, 704); ctx.moveTo(360, 340); ctx.lineTo(300, 340); ctx.stroke();
  [[360,270],[360,520],[620,520],[620,660],[845,660]].forEach(([x,y])=>{
    ctx.fillStyle='#f2eee3'; ctx.strokeStyle='#a96a32'; ctx.lineWidth=4; ctx.fillRect(x-11,y-11,22,22); ctx.strokeRect(x-11,y-11,22,22);
  });
  ctx.fillStyle='#995f2d'; ctx.font='500 15px Inconsolata, monospace'; ctx.fillText('CIRCUIT E—12', 648, 646);
}

function worldPoint(px: number, py: number) {
  return new THREE.Vector3((px / PAGE.pixelWidth - 0.5) * PAGE.width, 0, (py / PAGE.pixelHeight - 0.5) * PAGE.depth);
}

export class ShowcaseScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 80);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(2, 2);
  private readonly root = new THREE.Group();
  private readonly layers: THREE.Group[] = [];
  private readonly layerGroups: Record<Exclude<ShowcaseSystem,'all'>, THREE.Group> = {
    mechanical: new THREE.Group(), plumbing: new THREE.Group(), electrical: new THREE.Group(),
  };
  private readonly hitTargets: THREE.Mesh[] = [];
  private readonly focusMarkers: THREE.Mesh[] = [];
  private readonly layerShadows: THREE.Mesh[] = [];
  private readonly layerStocks: THREE.Mesh[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver;
  private readonly onHover: (item: HoveredSceneItem | null) => void;
  private hoveredId: string | null = null;
  private targetPointerX = 0;
  private targetPointerY = 0;
  private targetRotation = -0.22;
  private readonly currentLook = new THREE.Vector3(0, 0, 0);
  private rafId = 0;
  private previousTime = 0;
  private active = true;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, onHover: (item: HoveredSceneItem | null) => void) {
    this.canvas = canvas;
    this.onHover = onHover;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = false;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(38, 34), material(STAGE, { roughness: 0.94 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.82; this.scene.add(ground);
    this.scene.add(new THREE.HemisphereLight(0xfff8ea, 0x18272d, 1.8));
    const key = new THREE.DirectionalLight(0xffeed7, 3.1); key.position.set(-7, 14, 10); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9bc7ec, 1.35); fill.position.set(9, 7, -9); this.scene.add(fill);
    const rim = new THREE.PointLight(0xe6a95c, 9, 20, 2); rim.position.set(-1, 5, -8); this.scene.add(rim);

    this.scene.add(this.root);
    this.createPlanStack();
    this.camera.position.set(10, 20, 13); this.camera.lookAt(this.currentLook);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas); this.resize();
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.startFrame();
  }

  setBeat(beat: ShowcaseBeat) {
    const layout = BEAT_LAYOUT[beat];
    this.layers.forEach((layer, index) => { layer.userData.targetY = layout.lift[index] ?? 0; });
    this.camera.userData.targetPosition = layout.camera;
    this.camera.userData.targetLook = new THREE.Vector3(...layout.look);
    this.targetRotation = layout.rotation;
    this.requestMotion();
  }

  setSystem(system: ShowcaseSystem) {
    Object.entries(this.layerGroups).forEach(([key, group]) => { group.visible = system === 'all' || system === key; });
    this.requestMotion();
  }

  inspectDuctRoute() {
    this.setSystem('mechanical');
    this.setBeat('evidence');
    this.setHovered({ id: 'duct-main', title: 'Supply duct · route D-04', detail: 'Synthetic plan · mechanical layer' });
  }

  resetView() {
    this.setSystem('all');
    this.setBeat('overview');
    this.setHovered(null);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.rafId); this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.scene.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
        node.geometry.dispose(); const mats = Array.isArray(node.material) ? node.material : [node.material]; mats.forEach((mat) => mat.dispose());
      }
    });
    this.textures.forEach((texture) => texture.dispose()); this.renderer.dispose();
  }

  private createPlanStack() {
    const base = new THREE.Group(); base.position.y = -0.04; this.root.add(base);
    const baseShadow = this.makeShadowPlane(0.34); baseShadow.position.y = -0.09; this.root.add(baseShadow);
    const baseSheet = new THREE.Mesh(new THREE.BoxGeometry(PAGE.width, 0.085, PAGE.depth), material(0xf4f0e6, { roughness: 0.9 }));
    base.add(baseSheet); this.addSheetEdges(baseSheet, 0x887f6e, 0.4);
    const baseArt = this.makeArtPlane((ctx,w,h)=>drawBasePlan(ctx,w,h), false); baseArt.position.y = 0.047; base.add(baseArt);

    const definitions = [
      { id: 'mechanical' as const, color: BLUE, draw: drawMechanical },
      { id: 'plumbing' as const, color: GREEN, draw: drawPlumbing },
      { id: 'electrical' as const, color: AMBER, draw: drawElectrical },
    ];
    definitions.forEach((definition, index) => {
      const group = this.layerGroups[definition.id]; group.userData.targetY = 0.035 * (index + 1); this.layers.push(group); this.root.add(group);
      const layerShadow = this.makeShadowPlane(0.045); layerShadow.position.y = 0.011; this.root.add(layerShadow); this.layerShadows.push(layerShadow);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(PAGE.width, 0.035, PAGE.depth), new THREE.MeshPhysicalMaterial({ color: 0xf7f4ed, roughness: 0.5, metalness: 0.02, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 0.5, clearcoatRoughness: 0.36 }));
      this.layerStocks.push(stock);
      stock.position.y = 0; group.add(stock); this.addSheetEdges(stock, definition.color, 0.64);
      const art = this.makeArtPlane(definition.draw, true); art.position.y = 0.021; group.add(art);
      this.addRegistrationMarks(group, definition.color);
      if (definition.id === 'mechanical') this.addRouteTargets(group, definition.color);
    });
    // Annotations and legend are printed on a clear top film.
    const annotation = new THREE.Group(); annotation.userData.targetY = 0.14; this.layers.push(annotation); this.root.add(annotation);
    const film = new THREE.Mesh(new THREE.BoxGeometry(PAGE.width, 0.018, PAGE.depth), new THREE.MeshPhysicalMaterial({ color: 0xe7ece9, roughness: 0.26, metalness: 0.12, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1 }));
    film.position.y = 0; film.castShadow = true; annotation.add(film); this.addSheetEdges(film, 0x73868a, 0.33);
    const noteArt = this.makeArtPlane((ctx,w)=>this.drawAnnotationLayer(ctx,w), true); noteArt.position.y = 0.012; annotation.add(noteArt);
    this.layers[3] = annotation;
  }

  private makeShadowPlane(opacity: number) {
    const texture = canvasTexture((ctx, width, height) => {
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.08, width * 0.5, height * 0.5, width * 0.55);
      gradient.addColorStop(0, 'rgba(0,0,0,.42)'); gradient.addColorStop(0.64, 'rgba(0,0,0,.18)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }, true);
    this.textures.push(texture);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(PAGE.width + 0.8, PAGE.depth + 0.8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    shadow.rotation.x = -Math.PI / 2; return shadow;
  }

  private makeArtPlane(draw: (ctx: CanvasRenderingContext2D,w:number,h:number)=>void, transparent: boolean) {
    const texture = canvasTexture(draw, transparent); this.textures.push(texture);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(PAGE.width - 0.14, PAGE.depth - 0.14), new THREE.MeshBasicMaterial({ map: texture, transparent, side: THREE.DoubleSide, depthWrite: false }));
    art.rotation.x = -Math.PI / 2; art.castShadow = false; art.receiveShadow = false; return art;
  }

  private drawAnnotationLayer(ctx: CanvasRenderingContext2D, width: number) {
    ctx.fillStyle = 'rgba(30,45,50,.75)'; ctx.font = '500 16px Inconsolata, monospace'; ctx.fillText('LEGEND / M—201', 1140, 190);
    const items = [['#286f9f','MECHANICAL'],['#327b6b','PLUMBING'],['#a96a32','ELECTRICAL']];
    items.forEach(([color,label],i)=>{ ctx.fillStyle=color; ctx.fillRect(1140,222+i*36,18,4); ctx.fillStyle='#56645f'; ctx.font='400 15px Inconsolata, monospace'; ctx.fillText(label,1170,229+i*36); });
    ctx.strokeStyle='rgba(53,79,86,.45)'; ctx.lineWidth=1.3; ctx.setLineDash([5,7]);
    ctx.beginPath(); ctx.moveTo(100,120); ctx.lineTo(width-100,120); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#476c7a'; ctx.font='500 15px Inconsolata, monospace'; ctx.fillText('TRACE  /  SOURCE REGION E—04', 835, 748);
  }

  private addSheetEdges(mesh: THREE.Mesh, color: number, opacity: number) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 24), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    edges.position.copy(mesh.position); edges.quaternion.copy(mesh.quaternion); edges.scale.copy(mesh.scale); mesh.parent?.add(edges);
  }

  private addRegistrationMarks(parent: THREE.Group, color: number) {
    const marks = [[-5.55,-3.72],[-5.55,3.72],[5.55,-3.72],[5.55,3.72]];
    marks.forEach(([x,z])=>{
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x-0.09,0.024,z),new THREE.Vector3(x+0.09,0.024,z),new THREE.Vector3(x,0.024,z-0.09),new THREE.Vector3(x,0.024,z+0.09)]);
      parent.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:0.55})));
    });
  }

  private addRouteTargets(parent: THREE.Group, color: number) {
    const points = [[240,390],[440,390],[440,330],[720,330],[720,398],[1000,398]].map(([x,y])=>worldPoint(x,y));
    for(let i=0;i<points.length-1;i+=1){
      const start=points[i]; const end=points[i+1]; const delta=new THREE.Vector3().subVectors(end,start); const len=delta.length();
      const target=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,len,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0.001,depthWrite:false}));
      target.position.copy(start).add(end).multiplyScalar(0.5); target.position.y=0.052; target.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      target.userData.demoId='duct-main'; target.userData.title='Supply duct · route D-04'; target.userData.detail='Synthetic plan · evidence region E-04'; parent.add(target); this.hitTargets.push(target);
    }
    const trace = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,0.058,p.z))),new THREE.LineDashedMaterial({color,transparent:true,opacity:0.9,dashSize:0.13,gapSize:0.075}));
    trace.computeLineDistances(); trace.userData.trace=true; trace.userData.targetOpacity=0.38; parent.add(trace);
    const focus = new THREE.Mesh(new THREE.RingGeometry(0.13,0.17,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.82,side:THREE.DoubleSide}));
    const anchor=worldPoint(440,390); focus.rotation.x=-Math.PI/2; focus.position.set(anchor.x,0.065,anchor.z); focus.userData.focusMarker=true; focus.userData.targetScale=0.01; focus.scale.setScalar(0.01); parent.add(focus); this.focusMarkers.push(focus);
  }

  private applyBeatCamera(layout: typeof BEAT_LAYOUT[ShowcaseBeat]) {
    this.camera.userData.targetPosition = layout.camera; this.camera.userData.targetLook = new THREE.Vector3(...layout.look); this.targetRotation = layout.rotation;
  }

  private resize() {
    const parent=this.canvas.parentElement; if(!parent)return; const width=Math.max(1,parent.clientWidth);const height=Math.max(1,parent.clientHeight);
    const aspect=width/height; const viewHeight=Math.max(18.4, 13.8/aspect); this.camera.left=-viewHeight*aspect/2;this.camera.right=viewHeight*aspect/2;this.camera.top=viewHeight/2;this.camera.bottom=-viewHeight/2;
    this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);this.render();
  }

  private handlePointerMove = (event: PointerEvent) => {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    this.targetPointerX=this.pointer.y*0.028;this.targetPointerY=this.pointer.x*0.045;this.pickObject();this.requestMotion();
  };
  private handlePointerLeave = () => { this.pointer.set(2,2);this.targetPointerX=0;this.targetPointerY=0;this.setHovered(null);this.requestMotion(); };
  private handlePointerDown = (event: PointerEvent) => { if(event.pointerType==='touch')this.handlePointerMove(event);this.pickObject(); };
  private handleVisibilityChange = () => { this.active=document.visibilityState==='visible';if(this.active)this.requestMotion();else cancelAnimationFrame(this.rafId); };

  private pickObject() {
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const visible=this.hitTargets.filter(item=>item.visible&&item.parent?.visible);
    const hit=this.raycaster.intersectObjects(visible,false)[0];
    if(!hit){this.setHovered(null);return;}
    const {demoId,title,detail}=hit.object.userData as {demoId:string;title:string;detail:string};
    this.setHovered(demoId?{id:demoId,title,detail}:null);
  }
  private setHovered(item:HoveredSceneItem|null){
    if(this.hoveredId===item?.id)return;
    this.hoveredId=item?.id??null;
    this.scene.traverse(node=>{
      if(node.userData.focusMarker)node.userData.targetScale=this.hoveredId?1:0.01;
      if(node.userData.trace)node.userData.targetOpacity=this.hoveredId?0.94:0.38;
    });
    this.onHover(item);
    this.requestMotion();
  }

  private requestMotion() {
    if(this.reducedMotion){this.snapToTargets();this.render();return;}
    if(this.rafId||!this.active||this.disposed)return;this.rafId=requestAnimationFrame(this.animate);
  }
  private animate=(time:number)=>{
    if(this.disposed||!this.active){this.rafId=0;return;}
    const delta=Math.min((time-(this.previousTime||time))/1000,0.05);this.previousTime=time;const mix=1-Math.exp(-delta*5.2);
    this.root.rotation.x+=(-0.06+this.targetPointerX-this.root.rotation.x)*mix;
    this.root.rotation.y+=(this.targetRotation+this.targetPointerY-this.root.rotation.y)*mix;
    this.layers.forEach((layer)=>{const target=Number(layer.userData.targetY??0);layer.position.y+=(target-layer.position.y)*mix;});
    this.layerShadows.forEach((shadow,index)=>{const lift=this.layers[index]?.position.y??0;const target=Math.min(0.18,0.045+lift*0.085);const mat=shadow.material as THREE.MeshBasicMaterial;mat.opacity+=(target-mat.opacity)*mix;});
    this.layerStocks.forEach((stock,index)=>{const lift=this.layers[index]?.position.y??0;const target=Math.min(0.48,0.18+lift*0.095);(stock.material as THREE.MeshPhysicalMaterial).opacity+=(target-(stock.material as THREE.MeshPhysicalMaterial).opacity)*mix;});
    this.scene.traverse(node=>{
      if(node.userData.focusMarker){const target=Number(node.userData.targetScale??0.01);node.scale.setScalar(node.scale.x+(target-node.scale.x)*mix);}
      if(node.userData.trace&&node instanceof THREE.Line){const target=Number(node.userData.targetOpacity??0.38);(node.material as THREE.LineDashedMaterial).opacity+=(target-(node.material as THREE.LineDashedMaterial).opacity)*mix;}
    });
    const camera=this.camera.userData.targetPosition as number[]|undefined;
    if(camera){this.camera.position.x+=(camera[0]+this.targetPointerY*2-this.camera.position.x)*mix;this.camera.position.y+=(camera[1]+this.targetPointerX*2-this.camera.position.y)*mix;this.camera.position.z+=(camera[2]-this.camera.position.z)*mix;}
    const look=this.camera.userData.targetLook as THREE.Vector3|undefined;if(look){this.currentLook.lerp(look,mix);this.camera.lookAt(this.currentLook);}
    this.render();this.rafId=this.hasMotion()?requestAnimationFrame(this.animate):0;
  };
  private hasMotion(){
    const camera=this.camera.userData.targetPosition as number[]|undefined;const look=this.camera.userData.targetLook as THREE.Vector3|undefined;
    return Boolean(camera&&(Math.abs(this.camera.position.x-camera[0]-this.targetPointerY*2)>0.003||Math.abs(this.camera.position.y-camera[1]-this.targetPointerX*2)>0.003||Math.abs(this.camera.position.z-camera[2])>0.003))||
      Boolean(look&&this.currentLook.distanceTo(look)>0.003)||Math.abs(this.root.rotation.y-(this.targetRotation+this.targetPointerY))>0.002||
      Math.abs(this.root.rotation.x-(-0.06+this.targetPointerX))>0.002||
      this.layers.some(layer=>Math.abs(layer.position.y-Number(layer.userData.targetY??0))>0.003)||
      this.focusMarkers.some(node=>Math.abs(node.scale.x-Number(node.userData.targetScale??0.01))>0.003);
  }
  private snapToTargets(){
    const layout=BEAT_LAYOUT.overview;this.root.rotation.set(-0.06+this.targetPointerX,this.targetRotation+this.targetPointerY,0);
    this.layers.forEach(layer=>{layer.position.y=Number(layer.userData.targetY??0);});
    const camera=this.camera.userData.targetPosition as number[]|undefined;if(camera)this.camera.position.set(camera[0],camera[1],camera[2]);
    const look=this.camera.userData.targetLook as THREE.Vector3|undefined;this.currentLook.copy(look??new THREE.Vector3(...layout.look));this.camera.lookAt(this.currentLook);
    this.scene.traverse(node=>{if(node.userData.focusMarker)node.scale.setScalar(Number(node.userData.targetScale??0.01));if(node.userData.trace&&node instanceof THREE.Line)(node.material as THREE.LineDashedMaterial).opacity=Number(node.userData.targetOpacity??0.38);});
  }
  private render(){if(!this.disposed)this.renderer.render(this.scene,this.camera);}
  private startFrame(){
    this.applyBeatCamera(BEAT_LAYOUT.overview);this.layers.forEach((layer,index)=>{layer.userData.targetY=BEAT_LAYOUT.overview.lift[index]??0;});this.requestMotion();
  }
}
