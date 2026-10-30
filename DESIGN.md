# BlueTraceAI: Design System & Visual Contract (DESIGN.md)

## 1. Design Philosophy: Industrial Precision & High Density

BlueTraceAI is a professional CAD/takeoff tool for estimators and preconstruction engineers, not a generic consumer SaaS. 
- **High-Density Utilitarian Layout**: Swiss typographic discipline, compact table rows (32px height), strict 4px grid spacing rhythm.
- **Dark Blueprint Canvas**: Drawing canvas optimized for architectural contrast with dark slate drafting background.
- **Sub-Second Feedback**: Micro-interactions timed between 150ms and 250ms with hardware-accelerated pan/zoom.

---

## 2. Color System (OKLCH Tokens & CSS Variables)

```css
:root {
  /* Surface & Background */
  --bg-app: oklch(0.14 0.01 240);          /* Deep charcoal canvas surface */
  --bg-surface: oklch(0.18 0.015 240);      /* Card & panel background */
  --bg-surface-elevated: oklch(0.22 0.02 240); /* Modal & floating badges */
  --border-subtle: oklch(0.28 0.02 240);    /* Clean technical divider */
  --border-focus: oklch(0.65 0.18 215);     /* Focus outline ring */

  /* Typography & Text */
  --text-primary: oklch(0.96 0.005 240);   /* WCAG 2.2 AAA body & title text */
  --text-secondary: oklch(0.75 0.01 240);  /* Labels, metadata, dimensions */
  --text-muted: oklch(0.55 0.01 240);      /* Inactive elements, disabled */

  /* MEP Discipline System Colors */
  --mep-supply: oklch(0.68 0.16 220);      /* Supply Air (Cyan Blue) */
  --mep-return: oklch(0.70 0.18 145);      /* Return Air (Kelly Green) */
  --mep-exhaust: oklch(0.70 0.20 45);      /* Exhaust Air (Safety Amber) */
  --mep-plumbing: oklch(0.62 0.19 280);    /* Plumbing Piping (Violet Blue) */
  --mep-electrical: oklch(0.80 0.18 85);   /* Electrical Power (Drafting Gold) */

  /* Status Colors */
  --status-verified: oklch(0.72 0.18 150);
  --status-review: oklch(0.75 0.16 70);
  --status-error: oklch(0.65 0.22 25);
}
```

---

## 3. Typography Scale & Fonts

- **Technical Data & Code**: JetBrains Mono or Fira Code (`font-mono`) for coordinates, dimensions, footages, and sheet IDs.
- **Interface & Labels**: Inter or system sans-serif (`font-sans`) with tight tracking (`tracking-tight`).
- **Scale**:
  - Micro / Badges: `0.75rem` (12px) - uppercase for technical codes.
  - Secondary: `0.875rem` (14px).
  - Body / Table cells: `0.9375rem` (15px).
  - Section Headers: `1.125rem` (18px) with `font-semibold`.

---

## 4. The 10-Point Anti-Slop Ban List

1. **NO "VibeCode Purple"**: Banned `bg-indigo-500` and gradient buttons. Colors must follow the technical MEP palette.
2. **NO Low-Contrast Perma-Dark Body Text**: All text must pass WCAG 2.2 AA (minimum 4.5:1 ratio).
3. **NO Gradient-Clipped Headlines**: Keep all headings solid, legible, and unpretentious.
4. **NO Em-Dash Left Border Stripes**: Banned decorative `border-l-4 border-indigo-500` strips on cards.
5. **NO Fake Emojis as UI Icons**: Use SVG icons from `lucide-react` (never 🚀, ⚡, ✨ in the toolbar).
6. **NO Generic SaaS Running Order**: Interface is a two-pane drawing workspace (Canvas + Sidebar/Inspector).
7. **NO Unrounded/Bento Box Jumble**: Clean grid panels with 4px borders and 8px radii.
8. **NO Marketing Copy Clichés**: No "Supercharge", "Unleash", or "Elevate".
9. **NO Decorative Numerals**: Non-sequential cards do not get fake `01 / 02 / 03` badges.
10. **NO Unchecked Scale Hallucinations**: UI must explicitly show scale ratio (e.g. `1/4" = 1'-0" [Ratio: 48.0]`) with verification badge.
