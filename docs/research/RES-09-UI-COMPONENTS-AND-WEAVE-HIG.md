# RES-09: 60 FPS CAD Canvas Architecture & Weave Design HIG

## 1. Executive Summary
This document defines the high-performance frontend architecture for BlueTraceAI's interactive CAD canvas and Weave Design Human Interface Guidelines (HIG).
Engineering drawings contain thousands of vector linework primitives, text blocks, and equipment callouts. Rendering them smoothly at 60 FPS while supporting real-time AI perception requires decoupling the canvas render loop from React state and adhering to strict performance patterns.

---

## 2. 60 FPS Canvas Performance Architecture

### 2.1 The React Virtual DOM Bottleneck
In standard React applications, updating component state on mouse movement (`mousemove`) triggers continuous reconciliation, layout recalculation, and GC thrashing. For large CAD blueprints, this drops frame rates to $<15$ FPS.

### 2.2 Decoupled Transformation Loop (`useRef` + `requestAnimationFrame`)
To maintain a locked 60 FPS during high-frequency pan and zoom operations:
1. **Mutable View State**: Store current transformation coordinates in a mutable `useRef` object rather than React `useState`:
   ```typescript
   const viewState = useRef<{ scale: number; x: number; y: number }>({
     scale: 1.0,
     x: 0,
     y: 0,
   });
   ```
2. **Synchronized Redraw**: Bind pointer drag events directly to native DOM event listeners and schedule canvas redraws via `requestAnimationFrame`:
   ```typescript
   function handlePointerMove(e: PointerEvent) {
     if (!isDragging.current) return;
     viewState.current.x += e.movementX;
     viewState.current.y += e.movementY;
     requestAnimationFrame(drawCanvas);
   }
   ```
3. **Screen-Space Invariant Line Width**: In technical CAD blueprints, vector lines must stay crisp and constant-width regardless of zoom level:
   ```typescript
   ctx.lineWidth = 1.0 / viewState.current.scale;
   ```

---

## 3. Weave Design Human Interface Guidelines (HIG)

### 3.1 Design Philosophy: "Instrument Grade"
BlueTraceAI is a precision engineering instrument, not a generic consumer web application. Its visual language prioritizes:
- **High Information Density**: Compact toolbars, monospace numerical values, unambiguous system color coding.
- **Sub-Second Feedback (Doherty Threshold $<400$ms)**: Instant optimistic UI updates for drawing clicks, hover inspection, and ledger operations.
- **Fail-Closed Amber Alerts**: Pulsing amber highlights for uncalibrated sheets or ambiguous dimensions.

### 3.2 Engineering Loaders & Micro-Interactions

#### A. Blueprint Radar Scan Loader
Used during multi-resolution sheet reconnaissance and global title block extraction:
- Concentric range rings ($25\%, 50\%, 75\%, 100\%$).
- Conic gradient radar sweep rotating at $360^\circ / 3.0\text{s}$.
- Emerald or Cyan target blips pinging on detected equipment nodes.

#### B. Laser Scan Blueprint Loader
Used during linear duct extraction and centerline tracing:
- Architectural blueprint grid background (`20px x 20px`).
- Horizontal laser sweep line animating across the drawing bounding box.
- Monospace telemetry readout: `SYS.CAD // VLM_SCAN // 150 DPI // 100%`.

### 3.3 Component System Primitives
- **Icons**: Lucide React (`Ruler`, `Crosshair`, `Sparkles`, `Layers`, `Download`, `Search`, `FileText`).
- **Toolbars**: Floating horizontal dock centered at top or bottom of viewport, elevation `shadow-xl`, backdrop blur `backdrop-blur-md`.
- **Keyboard Accelerators**:
  - `V`: Pointer / Select mode.
  - `H` / `Spacebar`: Pan canvas mode.
  - `C`: Scale Calibration tool.
  - `Q`: QuickDraw hover dimension trigger.
  - `Cmd/Ctrl + Z`: Undo takeoff action.
  - `Cmd/Ctrl + E`: Export takeoff ledger.
