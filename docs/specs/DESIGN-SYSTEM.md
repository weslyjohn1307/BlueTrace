# BlueTraceAI: Design System & Visual Contract

## 1. Design Philosophy: Industrial Precision & High Density

BlueTraceAI is a professional CAD/takeoff tool for estimators and preconstruction engineers, not a generic consumer SaaS.
- **High-Density Utilitarian Layout**: Swiss typographic discipline, compact table rows (32px height), strict 4px grid spacing rhythm.
- **Two Surfaces**: The takeoff workspace (`TakeoffWorkspace`) uses dark slate chrome (`bg-slate-950`) around the sheet canvas for drafting contrast; landing/story/demo surfaces use the light vellum system. Canonical tokens live in `frontend/src/styles/index.css`.
- **Sub-Second Feedback**: Micro-interactions timed between 150ms and 250ms with hardware-accelerated pan/zoom.

---

## 2. Color System (OKLCH Tokens & CSS Variables)

Canonical values are in `frontend/src/styles/index.css` (`:root`, OKLCH only — no raw hex). Summary of the implemented light system:

```css
:root {
  --color-vellum: oklch(0.984 0.003 247.858);   /* app background (landing/story) */
  --color-paper: oklch(1 0 0);
  --color-slate-ink: oklch(0.208 0.042 265.755); /* primary text */
  --color-slate-caption: oklch(0.446 0.043 257.281);
  --color-hairline: oklch(0.929 0.013 255.508);
  --color-blueprint-teal: oklch(0.553 0.094 205.2); /* brand / supply */
  --color-danger: oklch(0.577 0.245 27.325);
  --color-success: oklch(0.648 0.2 131.684);
  --color-warning: oklch(0.666 0.179 58.318);
  /* Category tokens: --cat-fire-damper / --cat-wshp / --cat-linear-grille / --cat-duct-route / --cat-pipe-route */
}
```

The workspace chrome uses Tailwind slate/cyan utilities on dark (`slate-950/900`) — a deliberate drafting-contrast choice, not a token violation. Status must never rely on color alone: pair with icon + text (see `HoverBadge`, scale badge in `TakeoffWorkspace`).

---

## 3. Typography Scale & Fonts

As implemented (`frontend/package.json` `@fontsource/*`, `index.css`):
- **Technical Data & Code**: Inconsolata (`font-mono`) for coordinates, dimensions, footages, and sheet IDs.
- **Interface & Labels**: Libre Franklin (`font-sans`) with tight tracking.
- **Headings**: STIX Two Text (`.font-heading`), serif — print/drawing register.
- **Scale**:
  - Micro / Badges: `0.75rem` (12px) - uppercase for technical codes.
  - Secondary: `0.875rem` (14px).
  - Body / Table cells: `0.9375rem` (15px).
  - Section Headers: `1.125rem` (18px) with `font-semibold`.

---

## 4. The 10-Point Anti-Slop Design Invariants

1. **Precision MEP Palette**: Colors follow the technical MEP palette (Supply, Return, Exhaust, Fire Life Safety). Banned generic gradient buttons.
2. **Accessible Contrast Ratios**: All text passes WCAG 2.2 AA (minimum 4.5:1 ratio).
3. **Solid, Clear Typography**: Solid, legible headings; no decorative text clipping.
4. **Architectural Grid Alignment**: Standard clean borders and structural spacing.
5. **Standard CAD SVG Icons**: Vector icons from `lucide-react` representing technical tools.
6. **Dedicated Engineering Workspace**: Two-pane drawing workspace (Canvas + Sidebar/Inspector).
7. **Clean Structured Panels**: 4px structural borders and 8px radii.
8. **Professional AEC Language**: Monospace formatting for dimensions, CFM airflow, and coordinates.
9. **Traceable Quantities**: Clear data provenance with links to sheet coordinates and scale validation.
10. **Fail-Closed Scale Indication**: UI explicitly displays scale ratio and verification badge (e.g. `1/4" = 1'-0" [Ratio: 48.0]`).
