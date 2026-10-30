# Visual Design Palette & Stitch Screen Integration

## 1. Executive Summary
This specification documents the visual design assets, screen designs, and UI engineering palette retrieved from the **Stitch project "BlueTrace Precision Takeoff Suite"** (Project ID: `11713715609258431991`) and the referenced **Behance Web-Based CAD Engineering Design Tool Case Study** (ID: `242348249`).

These assets elevate BlueTraceAI from a standard utilitarian prototype to an internationally competitive, visually exceptional CAD engineering workstation.

---

## 2. Inventory of Downloaded Stitch Screens

All screens have been downloaded, decoded from authenticated Stitch API endpoints, and stored locally in [`docs/stitch_assets/`](file:///d:/bluetrace-ai/docs/stitch_assets/) and [`frontend/public/stitch/`](file:///d:/bluetrace-ai/frontend/public/stitch/):

| # | Screen Title | Screen ID | Downloaded Image | HTML Code |
|---|--------------|-----------|------------------|-----------|
| 1 | **Complex Design Tool – UI/UX Case Study** | `15532215246368137046` | [`screen-01-complex-design-tool-case-study.jpeg`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-01-complex-design-tool-case-study.jpeg) | — |
| 2 | **CAD Engineering Inspection Diagram** | `2307975850243316781` | [`screen-02-download-1.jpeg`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-02-download-1.jpeg) | — |
| 3 | **Visual Telemetry Agent Demo** | `20c0f4e53d594d00902fc97bf7e6364f` | [`screen-03-visual-telemetry-agent-demo.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-03-visual-telemetry-agent-demo.png) | [`screen-03-visual-telemetry-agent-demo.html`](file:///d:/bluetrace-ai/docs/stitch_assets/code/screen-03-visual-telemetry-agent-demo.html) |
| 4 | **Animated Visual Telemetry Demo** | `0f3338262dbe4fbda819dcc5f6ebbfe7` | [`screen-04-animated-visual-telemetry-demo.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-04-animated-visual-telemetry-demo.png) | [`screen-04-animated-visual-telemetry-demo.html`](file:///d:/bluetrace-ai/docs/stitch_assets/code/screen-04-animated-visual-telemetry-demo.html) |
| 5 | **Marketing Kit & Campaign Copy** | `cc7af07600894688acb826c0796f2f7e` | [`screen-05-marketing-kit-campaign-copy.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-05-marketing-kit-campaign-copy.png) | [`screen-05-marketing-kit-campaign-copy.html`](file:///d:/bluetrace-ai/docs/stitch_assets/code/screen-05-marketing-kit-campaign-copy.html) |
| 6 | **Newsletter Header (Precision Dispatch)** | `c4df0e1d7f21404aab1530bc69bda25e` | [`screen-06-newsletter-header-precision-dispatch.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-06-newsletter-header-precision-dispatch.png) | — |
| 7 | **Banner Ad (Precision CAD Instrument)** | `6e352f9e3bd54355b8d3d6f50a9a9789` | [`screen-07-banner-ad-precision-instrument.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-07-banner-ad-precision-instrument.png) | — |
| 8 | **Social Media Telemetry Card** | `7bf14b615a3b4b7681bac044d2391024` | [`screen-08-social-card-telemetry.png`](file:///d:/bluetrace-ai/docs/stitch_assets/images/screen-08-social-card-telemetry.png) | — |

---

## 3. The Engineered CAD Visual Palette

Beyond basic flat palettes, the Stitch and Behance engineering studies contribute a sophisticated visual hierarchy:

### 3.1 Substrate & Drafting Canvas
- **Architectural Dot-Grid Canvas (`.cad-dot-grid`)**:
  - Dual radial gradients generating a precision drafting vellum grid:
    ```css
    radial-gradient(circle, #94a3b8 1px, transparent 1px),
    radial-gradient(circle, #cbd5e1 0.75px, transparent 0.75px)
    ```
  - Spacing: Primary grid $40\text{px} \times 40\text{px}$, micro-subdivision $8\text{px} \times 8\text{px}$.
  - Dark theme variant (`.cad-dot-grid-dark`): `#0b1326` base with slate-700/800 reticles.

### 3.2 Glassmorphic HUD & Telemetry Trays
- **Frosted Glass Elevation (`.glass-hud`)**:
  - Background: `rgba(255, 255, 255, 0.82)` with `backdrop-filter: blur(16px)`.
  - Dark frame: `rgba(15, 23, 42, 0.85)` with `backdrop-filter: blur(16px)` and 1px `#334155` border.
  - Active state (`.glass-hud-active`): Subtle cyan perimeter keyline glow (`rgba(14, 165, 233, 0.25)`).

### 3.3 Dynamic Flow & Telemetry Motion
- **Duct Flow Animation (`@keyframes ductFlow`)**:
  - Dash pattern: `stroke-dasharray: 6 3`.
  - Linear motion along the vector flow vector to provide instant visual indication of active airflow runs.
- **Radar Scanning Sweep (`@keyframes scanRadar`)**:
  - Continuous rotating conic gradient sweep simulating active AI perception during SheetScan page ingestion.

### 3.4 Color Hierarchy

| Role | Color Name | Hex Token | Use Case |
|------|------------|-----------|----------|
| Primary CAD Vector | Blueprint Cyan | `#0ea5e9` | Active takeoff centerlines, selected tools, verified pins |
| Secondary Dimension | CAD Gold | `#eab308` | VAV box callouts, diffuser CFM tags, candidate pills |
| Life Safety | Fire Damper Tangerine | `#ea580c` | Fire/smoke dampers, partition penetrations |
| Signal: Verified | Emerald Green | `#16a34a` | Human-approved takeoff items, calibrated scale badge |
| Signal: Warning | Amber | `#f59e0b` | Review-required flags, unverified scale status |
| Workstation Dark | Slate 950 / Deep Vellum | `#020617` / `#0b1326` | Drawing viewport substrate, floating HUD chrome |

---

## 4. Live Codebase Wiring
The design system tokens and textures have been compiled directly into:
- [`frontend/src/styles/index.css`](file:///d:/bluetrace-ai/frontend/src/styles/index.css): Added `.cad-dot-grid`, `.cad-dot-grid-dark`, `.glass-hud`, `.animate-duct-flow`, and `.animate-radar-sweep`.
- [`frontend/src/workspace/components/SheetCanvas.tsx`](file:///d:/bluetrace-ai/frontend/src/workspace/components/SheetCanvas.tsx): Configured with `.cad-dot-grid-dark` and `.cad-crosshair` for drafting precision.
