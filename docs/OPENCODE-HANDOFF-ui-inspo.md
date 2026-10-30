# Handoff: UI Inspiration Catalog + Stitch Prompt (run in OpenCode)

## Intent (why this task exists)

Agents should reuse real, proven component work instead of building every UI
piece from scratch. Reuse saves time and reduces slop. This task catalogs
existing UI work worth stealing from, maps it to BlueTraceAI's components,
and produces a Stitch prompt grounded in that real work.

## Context

- Repo: BlueTraceAI, this directory. Stack: React 19, Vite, Tailwind v4,
  Lucide icons. Design contract: `DESIGN.md` + `frontend/src/styles/index.css`
  (OKLCH tokens, dark slate workspace, blueprint-teal accent, Inconsolata /
  Libre Franklin / STIX Two Text).
- Existing UI (`frontend/src/`): `TakeoffWorkspace`, `SheetCanvas` (pan/zoom
  sheet viewer), `HoverBadge` (cursor dimension badge), `SheetTree`,
  `LedgerPanel` (accept/reject + export), `SchedulePanel`, `CopilotPanel` /
  `CopilotDrawer` (streaming chat), `ByokDialog`, `UploadCard`, `GlobalTopNav`,
  `ModeBanner`. Real flows: `docs/specs/UI-UX-FLOWS.md`.
- Anti-slop rules: `DESIGN.md` §4 (no purple gradients, no emoji icons,
  WCAG AA, scale badge always shown). Keep all output consistent with them.

## Input

- `C:\Users\DANIEL\Downloads\bookmarks.html` — ~45 bookmarked links in 4
  folders: (1) UI component libraries & primitives, (2) motion/animation/icons,
  (3) inspiration/systems/AI-UI tools, (4) SVGs/shapes/gradients.
- Prior attempt (Muse Code) stalled on sandbox blocks (npm cache, browser
  daemon paths). Prefer OpenCode's browser/scraping options and real-browser
  rendering — these gallery sites are JS-heavy and static fetch truncates them.

## Task

1. Scrape the highest-value gallery pages with a real browser (prioritize:
   21st.dev AI-chat/dashboard/table sections, Aceternity components, KokonutUI
   docs incl. AI section, motion-primitives docs, Bklit charts, Beautiful UI
   AI-native primitives, useLayouts browse, component.gallery, Refero styles).
   Extract per page: what it offers, named components/patterns, URLs.
2. Find additional resources beyond the bookmarks that fit BlueTrace needs:
   AI chat/drawer UI kits, data-table/ledger patterns, canvas/whiteboard UI
   inspiration (e.g. tldraw-style), dashboard kits.
3. Map findings to BlueTrace components: which real-world pattern each of our
   components (canvas, badge, ledger, schedule, copilot, upload, nav) should
   borrow from, with links.
4. Document everything in `docs/research/RES-08-UI-INSPO-CATALOG.md`:
   one section per source (what it is, best components for us, links), plus
   the mapping table.
5. Write a Stitch-optimized prompt for the demo screens (workspace + landing +
   story), following this repo's `enhance-prompt` skill format: one-line
   purpose, `DESIGN SYSTEM (REQUIRED)` block from our tokens, numbered page
   structure per screen, UI/UX keywords, no slop. Deliver it in chat (copy-paste
   ready), not just in a file.

## Constraints

- Read-only on existing code; only ADD the RES-08 doc (and fix nothing else
  unless asked).
- Plain, simple language. No fabricated component names — every recommendation
  must trace to a page actually opened this run.
- No secrets, no new dependencies, no commits unless asked.
