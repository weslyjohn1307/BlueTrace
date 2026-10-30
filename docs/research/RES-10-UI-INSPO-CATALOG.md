# RES-10: UI Inspiration Catalog (bookmark + new resources, browser-verified)

> Note on numbering: the handoff asked for `RES-08-UI-INSPO-CATALOG.md`, but
> `RES-08` (BYOK templates) and `RES-09` (canvas/HIG) already exist. This file
> is `RES-10` to avoid overwriting. Content matches the handoff task exactly.

## Method

- Bookmark source: `C:\Users\DANIEL\Downloads\bookmarks.html` (~45 links, 4 folders).
- Tooling installed for this task (not added to `pyproject.toml` / `package.json`):
  `pip install playwright beautifulsoup4 lxml` + `playwright install chromium --only-shell`
  (Chrome Headless Shell 156.x). This is the "best out there" real-browser option —
  no package named "obsura" exists, so Playwright headless-shell was used.
- Real-browser verification this run (Playwright, `domcontentloaded` + 5s settle):
  `kokonutui.com`, `beautiful-ui-five.vercel.app`, `uselayouts.com/browse`.
  All other pages below were opened via fetch this run by parallel agents; any
  truncation or failure is noted per section. No component names are invented —
  every named pattern below was seen on the page.
- Prior attempt (Muse Code) stalled on sandbox blocks (npm cache, browser daemon
  paths). Playwright `--only-shell` avoids the full-browser daemon and works.

## 1. Bookmark sources (opened this run)

### 1.1 21st.dev — community components
- What it is: large copy-paste React + Tailwind registry with category counts.
- Best for us: `AI Chats (248)`, `AI Prompt Composer with Model Selector`,
  `Thought Chain`, `Agent Progress`, `Tool Invocation`, `Inline Citation`, `AI Diff`;
  `Tables (313)`, `Data Grid Table`, `Editable Data Table`, `Invoice History Table`;
  `Dashboards (400)`, `Dashboard with Collapsible Sidebar`, `Stats Bento`,
  `Charts & KPI Cards`; `Grids & Bento (620)`, `File Trees (61)`, `Maps (51)`.
- Links:
  - https://21st.dev/community/components
  - https://21st.dev/community/components/s/ai-chat
  - https://21st.dev/community/components/s/dashboard
  - https://21st.dev/community/components/s/table

### 1.2 component.gallery — The Component Gallery
- What it is: reference of 60 components / 95 design systems / 2,671 examples.
  Defines each pattern (not code).
- Best for us: `Drawer` (Tray, Flyout, Sheet), `Modal`, `Popover`, `Toast`, `Tooltip`;
  `Table` (sorting/filtering), `Pagination`, `Badge` (Tag, Chip), `Skeleton`,
  `Empty state`; `Card`, `Header`, `Navigation`, `Progress bar`, `Progress tracker
  (Stepper, Steps, Timeline)`; `Tree view`, `Carousel`.
- Links:
  - https://component.gallery/
  - https://component.gallery/components
  - https://component.gallery/components/table
  - https://component.gallery/components/drawer
  - https://component.gallery/components/empty-state

### 1.3 Aceternity UI
- What it is: 200+ copy-paste React/Tailwind/Motion marketing components, blocks,
  templates. Landing-focused, not AI-chat focused.
- Best for us: `Sidebar` (expandable), `Animated Modal`, `Animated Tooltip`,
  `Tabs`; `Bento Grid`, `Card Spotlight`, `Expandable Card`; `Timeline`,
  `World Map`, `GitHub Globe`; `Compare` (before/after slider), `Lens` (image zoom),
  `Draggable Card`, `Layout Grid`, `Tracing Beam`, `Grid and Dot Backgrounds`,
  `File Upload`.
- Links:
  - https://ui.aceternity.com/
  - https://ui.aceternity.com/components
  - https://ui.aceternity.com/components/sidebar
  - https://ui.aceternity.com/components/compare
  - https://ui.aceternity.com/components/file-upload
  - https://ui.aceternity.com/blocks/bento-grids

### 1.4 KokonutUI (Playwright-verified)
- What it is: open-source React + Tailwind + Motion + shadcn/ui library,
  102 free components. Live demos, installs via shadcn CLI/MCP. Has Pro tier.
- Best for us: `AI-01 AI Input Selector`, `AI-02 AI Input Search`,
  `AI-03 AI State Loading`, `AI-04 AI Text Loading`, `AI-05 AI Voice`,
  `AI-06 AI Tool Approval`, `AI-08 AI Inline Citations`, `AI-09 AI Diff Review`,
  `AI-10 AI Model Selector`, `AI-12 AI Conversation Branches`,
  `AI-13 AI Agent Lanes`, `AI-15 AI Message Queue`;
  `NV-05 Command Palette`, `NV-06 Smooth Drawer`, `NV-10 Stack Panel`;
  `CD-05 Widget Grid`, `CD-13 Metric Card`, `CD-14 Uptime Card`;
  `BG-05 Topo Background`, `BG-02 Background Paths`, `BG-01 Dot Field`.
- Links:
  - https://kokonutui.com/
  - https://kokonutui.com/docs
  - https://kokonutui.com/docs/ai/ai-prompt
  - https://kokonutui.com/docs/ai/ai-tool-approval
  - https://kokonutui.com/docs/ai/ai-citations
  - https://kokonutui.com/docs/ai/ai-diff-review
  - https://kokonutui.com/docs/navigation/smooth-drawer

### 1.5 Beautiful UI for AI-native interfaces (Playwright-verified)
- What it is: single-page gallery of 21 AI-interface primitives. Directly
  relevant to copilot + ledger.
- Best for us: `Loading State`, `Thinking`, `Streaming Text`, `Approval Card`,
  `Tool Chips`, `Task Rows`, `Chat`, `Prompt Bar`, `Recommendation Card`,
  `Context Cards`; `Diff Table`, `Records Table`, `Filter Table`;
  `Insight Cards`, `Sidebar Nav`, `Search`; `Flowchart`, `Agent Screen`,
  `Code Block`, `Fine-tune Card`, `Selection Actions`.
- Links:
  - https://beautiful-ui-five.vercel.app/ (single page, anchor sections)

### 1.6 Bklit UI — charts and data visualization
- What it is: chart library + Studio builder, 210 charts. Data-viz only, no chat.
- Best for us: `Area Chart`, `Bar Chart`, `Line Chart`, `Live Line Chart`,
  `Pie Chart`, `Gauge`, `Ring Chart`, `Radial Chart`, `Heatmap`, `Funnel`,
  `Sankey`, `Candlestick`, `Composed Chart`; utilities `Sparkline`, `Legend`,
  `Tooltip`, `Brush`, `Markers`, `Reference Area`, `Trend Line`, `Deadline`.
- Links:
  - https://bklit.com/
  - https://bklit.com/docs/components
  - https://bklit.com/docs/components/area-chart
  - https://bklit.com/docs/components/line-chart
  - https://bklit.com/docs/utility/tooltip

### 1.7 useLayouts (Playwright-verified)
- What it is: browse list of animated, physics-based React components.
- Best for us: `Prompt Box` (composer with model picker), `Curve Drawer`
  (side drawer with morphing edge), `Drawer Buttons`, `Create Menu`,
  `Bottom Menu` (expanding dock), `Dynamic Toolbar`, `Morphing Input`;
  `Infinite Canvas` (draggable endless canvas), `Scan Document`,
  `Dynamic Grid Gallery`, `Inline Edit`; `Bento Card`, `Magnified Bento`,
  `Discrete Tabs`; `List Item`, `Stacked List`, `Status Button`, `Client Card`.
- Links:
  - https://uselayouts.com/
  - https://uselayouts.com/browse
  - https://uselayouts.com/docs/components/prompt-box
  - https://uselayouts.com/docs/components/curve-drawer
  - https://uselayouts.com/docs/components/infinite-grid
  - https://uselayouts.com/docs/components/scan-document
  - https://uselayouts.com/docs/components/filter-interaction

### 1.8 motion-primitives
- What it is: open-source motion components built with Motion + Tailwind.
  Docs list Core, Text, Number, Interactive, Toolbar, Advanced effects.
- Best for us: `Dialog`, `Morphing Dialog`, `Morphing Popover`, `Disclosure`,
  `Cursor`, `Accordion`; `Animated Number`, `Sliding Number`, `Animated Group`,
  `Transition Panel`; `Dock`, `Spotlight`, `Glow Effect`, `Border Trail`,
  `Scroll Progress`; `Image Comparison`, `Tilt`, `Magnetic`,
  `Toolbar Dynamic`, `Toolbar Expandable`; text effects `Text Effect`,
  `Text Loop`, `Text Shimmer` (good for scale/confidence readouts).
- Links:
  - https://motion-primitives.com/
  - https://motion-primitives.com/docs
  - https://motion-primitives.com/docs/dialog
  - https://motion-primitives.com/docs/animated-number
  - https://motion-primitives.com/docs/image-comparison
  - https://motion-primitives.com/docs/toolbar-dynamic

### 1.9 Refero Styles (DESIGN.md examples)
- What it is: claims 2,000+ AI-readable DESIGN.md systems from product sites.
  Landing page only rendered hero + search this run (client-rendered, truncated).
- Best for us: no named components verified this run. Needs JS render or direct
  style-page fetch before borrowing tokens.
- Links:
  - https://styles.refero.design/
  - https://refero.design

## 2. New resources beyond bookmarks (opened this run, incl. X/Reddit consensus)

Reddit/X consensus (r/webdev, r/reactjs, 2026 roundups): start with Vercel
chatbot or shadcn AI Elements for chat; reach for assistant-ui for tool calls /
generative UI; CopilotKit for agent + human-in-the-loop. Tremor + Shadcn Admin
are the most repeated dashboard answers.

### 2.1 assistant-ui
- What it is: React chat primitives (`Thread`, `Composer`, `Message`,
  `BranchPicker`, `ActionBar`). Runtimes for AI SDK, LangGraph, custom backend.
  MIT, shadcn-style theming.
- Best for us: copilot drawer (full chat panel, streaming, attachments).
- Link: https://www.assistant-ui.com

### 2.2 shadcn AI Elements (current home, replaces Vercel Elements Nov 2026)
- What it is: official shadcn copy-paste AI patterns: `Chat`, `Message`,
  `Prompt Input`, `Reasoning`, `Tool`, `Plan`, `Sources`, `Suggestion`,
  `Confirmation`.
- Best for us: copilot drawer; upload (`Attachment`); schedule (`Plan`/`Task`/`Queue`).
- Link: https://ui.shadcn.com/docs/ai-elements

### 2.3 Vercel AI Elements + chatbot template (reference only)
- What it is: same set as above (`Message`, `Conversation`, `Prompt Input`,
  `Reasoning`, `Tool`, `Sources`); full template with Auth + Postgres history.
  Deprecated end Nov 2026, moving to §2.2.
- Best for us: copilot drawer reference; sidebar thread-history pattern for nav.
- Links:
  - https://ai-sdk.dev/elements/overview
  - https://vercel.com/templates/next.js/chatbot
  - https://github.com/vercel/chatbot

### 2.4 Blazity shadcn-chatbot-kit
- What it is: ready chat blocks — auto-scroll, file-upload input, prompt
  suggestions, copy/rate actions, markdown highlight, dark/light.
- Best for us: copilot drawer; upload file-input pattern.
- Link: https://www.shadcn.io/template/blazity-shadcn-chatbot-kit

### 2.5 CopilotKit
- What it is: prebuilt `<CopilotChat>`, generative UI, frontend tools, shared
  state, human-in-the-loop approvals. AG-UI protocol.
- Best for us: copilot drawer if agent acts on canvas/ledger; generative UI cards
  for canvas badge.
- Link: https://www.copilotkit.ai

### 2.6 Cult UI
- What it is: 154 free shadcn animated components. Includes kanban-board,
  analytics-chart, collab-toolbar, agent-suggest-card-stack; paid AI SDK Agents
  blocks (table-editor artifact, chart artifact).
- Best for us: ledger (kanban/table artifact), schedule (kanban-board),
  nav (collab-toolbar).
- Link: https://cult-ui.com

### 2.7 OriginUI (Base-UI library)
- What it is: 529 particles. Has `Composer` (chat input with mentions/slash),
  `Drawer`/`Sheet`, `Command` palette, `Table`, `Chart`.
- Best for us: copilot drawer (`Composer` + `Drawer`), nav (`Command`),
  ledger (`Table`).
- Link: https://originui.com

### 2.8 TanStack Table v9
- What it is: headless table engine — sorting, filtering, grouping, aggregation,
  expansion, pinning, column visibility. Official shadcn/ui + Base UI examples.
- Best for us: ledger (takeoff table grouped by CSI division, totals), schedule.
- Link: https://tanstack.com/table

### 2.9 Tremor (now Vercel)
- What it is: 35+ React + Tailwind + Radix chart/dashboard components
  (area/bar/donut, Tracker, Bar Lists, KPI cards, filters). 300+ blocks.
- Best for us: ledger summaries, schedule (dashboard KPIs, cost rollups).
- Link: https://tremor.so

### 2.10 Shadcn Admin (Vite + React + TS template)
- What it is: free admin template, 10+ pages, command-palette search,
  light/dark, RTL. Live demo + GitHub.
- Best for us: nav (sidebar + command palette), ledger/schedule page layouts.
- Link: https://www.shadcn.io/template/satnaing-shadcn-admin

### 2.11 tldraw SDK
- What it is: infinite canvas SDK (51k stars) — shapes/tools, camera controls,
  multiplayer sync, custom shapes. `npm create tldraw`.
- Best for us: canvas badge overlay inspiration only (BlueTrace keeps its own
  150 DPI canvas); upload drag-drop patterns.
- Link: https://tldraw.dev

### 2.12 React Flow
- What it is: node-based editor library (38.8k stars, MIT) — custom nodes/edges,
  minimap, controls.
- Best for us: schedule (plan flow view), canvas badge (node toolbar/minimap).
- Link: https://reactflow.dev

## 3. Bookmarked but not deep-scraped (inventoried from bookmarks.html)

Listed here so nothing is lost; open before borrowing. Links are exact URLs
from the bookmark file: `resources.criodo.com/resources/ui-component-gallery`,
`sv-chan.vercel.app`, `vasooo.vercel.app`, `lottiefiles.com/free-animations/lottieflow`,
`lordicon.com`, `thenounproject.com`, `motion-vocabulary.vercel.app`,
`animejs.com`, `motion.dev`, `visbug.web.app`, `pixso.net`,
`stitch.withgoogle.com`, `whimsical.com`, `designeverywhere.co`,
`designarena.ai`, `mobbin.com`, `godly.website`, `ui-skills.com/skills`,
`open-design.ai`, `unikist.com`, `github.com/Appllama/appllama-skills`,
`supply.madebyoversight.com`, `github.com/gholtsap/lintapple`,
`shapes.framer.website`, `shapeoholic.live`, `svgdoodles.com`,
`figma.com/community/file/1278067419991143588/svg-world-map`, `getwaves.io`,
`app.haikei.app` / `haikei.app`, `undraw.co/illustrations`,
`drawkit.com/search-results`, `shadergradient.co`, `neat.firecms.co`,
`backgrounds.supply/gradient-lab`.

## 4. Mapping to BlueTrace components

| BlueTrace component | Borrow from (traced above) | Links |
|---|---|---|
| `SheetCanvas` (pan/zoom 150 DPI viewer) | useLayouts `Infinite Canvas`; Aceternity `Compare` + `Lens`; motion-primitives `Image Comparison`, `Toolbar Dynamic`; tldraw camera/controls (inspiration only) | §1.7, §1.3, §1.8, §2.11 |
| `HoverBadge` (cursor dimension badge) | Beautiful UI `Tool Chips`, `Context Cards`; KokonutUI `AI-08 Inline Citations`; React Flow node toolbar/minimap; motion-primitives `Text Shimmer`, `Animated Number` | §1.5, §1.4, §2.12, §1.8 |
| `LedgerPanel` (accept/reject + export) | Beautiful UI `Diff Table`, `Records Table`, `Filter Table`; 21st.dev `Data Grid Table`, `Editable Data Table`; TanStack Table grouping/aggregation; Cult UI table-editor artifact; Tremor KPI cards | §1.5, §1.1, §2.8, §2.6, §2.9 |
| `SchedulePanel` | 21st.dev `Project Data Table`, `Timelines`; Cult UI kanban-board; TanStack Table; Tremor Tracker/Bar Lists; React Flow plan view | §1.1, §2.6, §2.8, §2.9, §2.12 |
| `CopilotPanel` / `CopilotDrawer` (streaming chat) | shadcn AI Elements `Chat`, `Prompt Input`, `Reasoning`, `Tool`, `Sources`; assistant-ui `Thread`/`Composer`; KokonutUI AI-01–AI-16 series; Beautiful UI `Chat`, `Prompt Bar`, `Thinking`, `Streaming Text`, `Approval Card`; useLayouts `Prompt Box`, `Curve Drawer` | §2.2, §2.1, §1.4, §1.5, §1.7 |
| `UploadCard` | Aceternity `File Upload`; Blazity file-upload input; shadcn AI Elements `Attachment`; useLayouts `Scan Document` | §1.3, §2.4, §2.2, §1.7 |
| `SheetTree` (file tree) | component.gallery `Tree view`; 21st.dev `File Trees (61)`; Shadcn Admin sidebar | §1.2, §1.1, §2.10 |
| `GlobalTopNav` + `ModeBanner` | component.gallery `Header`, `Navigation`; KokonutUI `NV-05 Command Palette`, `NV-09 Status Island`; OriginUI `Command`; Shadcn Admin command palette; Cult UI collab-toolbar | §1.2, §1.4, §2.7, §2.10, §2.6 |
| `ByokDialog` | component.gallery `Modal`, `Popover`; motion-primitives `Dialog`, `Morphing Dialog`; KokonutUI `NV-06 Smooth Drawer` | §1.2, §1.8, §1.4 |
| Icons / motion | Phosphor Icons, Lordicon, LottieFiles (bookmarked); Motion.dev, Anime.js, Motion Vocabulary (bookmarked); use `lucide-react` only in product per DESIGN.md §4 | §3 |
| Landing/story/demo surfaces | Aceternity Bento/Feature Sections; 21st.dev Dashboards/Stats Bento; Tremor blocks; Shadcn Admin layouts; Godly/Mobbin/Unikist (bookmarked, open before use) | §1.3, §1.1, §2.9, §2.10 |

## 5. What to actually steal first (smallest useful set)

1. Copilot drawer: shadcn AI Elements `Prompt Input` + `Reasoning` + `Sources`
   (§2.2) with KokonutUI `AI-03 Loading` / `AI-06 Approval` states (§1.4).
2. Ledger: TanStack Table grouping + Beautiful UI `Diff Table` accept/reject row
   (§2.8, §1.5).
3. Canvas badge: Beautiful UI `Tool Chips` + motion-primitives `Animated Number`
   for scale readout (§1.5, §1.8). Scale badge always shown per DESIGN.md §4.10.
4. Nav: Shadcn Admin command palette + KokonutUI `NV-05` pattern (§2.10, §1.4).

## 6. Complete Free UI directory (user-supplied list, opened this run)

Scraped with Obscura `fetch --dump text` (`.scrape-cache/ui-dir/`, gitignored,
29/29 fetched, 2026-10-30) plus webfetch agents. Only names actually seen are
listed. Cross-check notes: Obscura confirms Kibo (41 components / 28 blocks /
1101 patterns), ReUI (agent-ready + MCP), Eldora (150+), Animata (157+), Joly
(50+), Neobrutalism (64), 8bitcn v2 (+35 blocks), Tremor (35+ / 300+ blocks),
coss.com (529 particles). Obscura was blocked on uiverse.io (cookie wall),
cuicui.day (shadow-tree error), assistant-ui (load error) and GitHub (session
noise) — those entries rest on the successful webfetch pass. YouTube links
returned only generic page chrome (no title/transcript), so they are listed as
unverified — do not cite video contents.

### 6.1 Core copy-paste + shadcn ecosystem

- shadcn/ui (https://ui.shadcn.com/): base copy-paste library this whole
  directory extends. Seen: Dashboard blocks, Analytics/Transactions/Spending
  sidebar, alerts (Claimable Balance, Payout Threshold), Dialog, Sheet/Drawer,
  Data Table docs, area charts, `New Chat` AI demo block.
  Links: /docs/components, /blocks, /charts/area, /docs/ai-elements.
- Magic UI (https://magicui.design/): 150+ animated landing effects (bento
  grids, marquees, beams). Homepage is showcase-heavy; no chat/table/canvas
  seen. New: `/docs/components/floating-3d-particles`.
- coss.com/ui, formerly Origin UI (https://coss.com/ui): 529 particles on Base
  UI. Seen: `Composer` (chat input, mentions/slash), `Drawer` (swipe, snap
  points), `Sheet`, `Dialog`, `Command`, `Table`. Links: /ui/chat,
  /ui/docs/components/composer, /ui/docs/components/table,
  /ui/docs/components/drawer.
- React Bits (https://reactbits.dev/): animated text/cursor/card/background
  components. Categories: Text Animations, Animations, Components, Backgrounds,
  Micro Interactions. No chat/table/dashboard seen.
- Cult UI (https://www.cult-ui.com/): 154 free shadcn components. Seen:
  `Analytics Chart`, `Kanban board`, `Agent Suggest Card Stack`,
  `Table Editor Artifact` (spreadsheet + AI chat), `Chart Generation Artifact`,
  `Data Analysis Agent` (CSV/JSON upload). Links: /docs/components/kanban-board,
  /docs/components/analytics-chart, plus aisdkagents.com patterns.
- Kibo UI (https://www.kibo-ui.com/): 41 components, 28 blocks, 1101 patterns.
  Seen: `Table`, `Gantt`, `Kanban`, `List`, `Calendar`, `Mini Calendar`,
  `Editor`, `Dropzone`, `Code Block`, `Collaborative Canvas` (live
  cursors/avatars), `Roadmap` (Gantt/Calendar/Kanban/Table), `Form`; patterns
  for data-table, dialog, drawer, sheet, chart. No AI chat seen.
- ReUI (https://reui.io/): 1,264 components + 27 primitives, MCP server +
  Agent Skills. Seen: AI Chat (13 blocks), Agent Activity (5), AI Usage (4),
  Agents (10); Message, Message Scroller, Bubble, Questionnaire, Autocomplete;
  Data Grid Base (9) + Advanced (17: editing, grouping, virtualization), Table
  (17), Receipt, Billing, Inventory (11); Dashboard (8), App Shell (36), Stat,
  Charts, Gantt (7), Kanban (10), Event Calendar, Schedule, Timeline;
  Whiteboard (2), Flow (4), Digital Twin (2). Install pattern
  `pnpm dlx shadcn@latest add @reui/<block>`.
- Skiper UI (https://skiper-ui.com/): 106+ shadcn add-ons (mix free/paid).
  Examples seen: image reveal, drag-and-scroll, dynamic island, tooltips. No
  chat/table/dashboard/canvas seen.
- Eldora UI (https://www.eldoraui.site/): 150+ animated components, shadcn
  companion. Demos seen: OTP auth, testimonials slider, map. No chat/table
  names seen.
- Fancy Components (https://www.fancycomponents.dev/): microinteractions.
  Seen via docs: Text (20: Highlighter, Typewriter, Scramble, Number Ticker),
  Physics (Elastic Line, Gravity, Cursor Attractor), Background (Animated
  Gradient with SVG, Pixel Trail), Blocks (Drag Elements, Marquee Along SVG
  Path, Stacking Cards). No chat/table/dashboard seen.
- Animata (https://animata.design/): 157+ animated components, MIT. Seen:
  Widget (Alarm Clock, Battery), Graphs (Bar, Donut, Gauge), Bento grid, Card
  Spread/Stack, List, Skeleton, Tabs, Overlay Modal, Progress/Timeline/Spinner,
  `AI Button` docs page. No chat/canvas editor seen.
- CuiCui application-ui (https://cuicui.day/application-ui): app screens.
  Seen: `Settings`, `Tree` (Root/Nested Folder), `Table of Contents`,
  `Search Bars`, `Notification`, `Authentication`. No chat/table/dashboard
  seen. Successor noted: control-ui.dev.
- Joly UI (https://jolyui.dev/): 50+ shadcn/ui components, React 19 +
  Tailwind v4, Radix. Only generic categories seen (buttons, forms, nav,
  modals, text animations). No chat/table names seen.
- blocks.so (https://blocks.so/): copy-paste shadcn blocks. Seen with counts:
  AI Chat (3, /chat), AI Components (5, /ai), Dashboard (1, /dashboard),
  Tables (5, /tables), Dialogs (12), Sidebar (6), Stats (15), Command Menu
  (4), File Upload (6), Form Layout (5), Onboarding (7).
- Tailark (https://tailark.com/): paid shadcn marketing registry. Fetch
  truncated after hero; block catalog not visible. No chat/table seen.

### 6.2 AI chat + generative UI kits

- assistant-ui (§2.1 deepened): primitives `Thread`, `Composer`, `Message`,
  `MessagePart`, `BranchPicker`, `ActionBar`, `Suggestion`, `ThreadList`,
  `AssistantModal` (floating copilot), `Attachment` (drag-drop/paste),
  `ChainOfThought` (reasoning accordion), `SelectionToolbar`, Generative UI
  cards, Speech/dictation/TTS, virtualization, editing. Every docs URL + `.md`
  returns markdown; `llms-full.txt` available.
- Prompt Kit (https://github.com/ibelick/prompt-kit): shadcn-based AI chat
  blocks, 3.1k stars, MIT. Install
  `npx shadcn@latest add prompt-kit/[component]`; usage
  `@/components/ui/prompt-input` (`PromptInput` named explicitly). Chat only;
  no table/dashboard seen.

### 6.3 Full-stack libraries, dashboards, multi-framework

- HeroUI, formerly NextUI (https://heroui.com/): React Aria + Tailwind v4
  library. Fetch showed only start links (components, MCP server, Agent
  Skills, CLI, llms.txt). No component names seen.
- daisyUI (https://daisyui.com/): Tailwind plugin, pure-CSS class names, 68
  components, framework-agnostic, no JS. Examples: `btn`, `card`, `toggle`.
  No AI chat seen.
- Uiverse.io (https://uiverse.io/): 7,467 community elements (HTML/CSS,
  Tailwind, React, Figma). Groups: Card Components, Forms & Inputs, Loading
  UI, Tooltips & Patterns. No chat/table/dashboard library seen.
- Tremor (§2.9 deepened): Area Chart, DonutChart, Tracker, Bar Lists, Data
  Bars, Spark Charts, Progress Circles, KPI cards; workspace table example
  (Workspace/Owner/Status/Region/Capacity/Costs/Last edited); Date Range
  Picker, filters; templates at blocks.tremor.so.
- Float UI (https://floatui.com/): Tailwind components + templates (HTML,
  React, Vue, Svelte). Example: team list. No chat/table names seen.
- shadcn-svelte (https://www.shadcn-svelte.com/): Svelte shadcn port.
  Homepage mock shows dashboard + ledger patterns (sidebar, savings progress,
  contribution chart, payout threshold). Sections: Components, Blocks,
  Charts/area.
- Bits UI (https://www.bits-ui.com/): headless Svelte primitives v2. No named
  chat/table/dashboard seen.
- Neobrutalism.dev (https://www.neobrutalism.dev/): 64 brutalist shadcn/Base
  UI components + Charts. No chat/table names seen.
- 8bitcn/ui (https://www.8bitcn.com/): retro 8-bit shadcn components, v2 +35
  blocks. Only Docs/Components/Blocks/Themes seen.
- BG.IBELICK (https://bg.ibelick.com/): copy-paste Tailwind/Vanilla background
  snippets only. Backdrop inspiration, nothing else.

### 6.4 Master lists + videos (directories, not components)

- Awesome Shadcn UI (https://github.com/birobirobiro/awesome-shadcn-ui,
  20.7k stars): lists `assistant-ui`, `shadcn-chat`, `shadcn-chatbot-kit`,
  `agents-ui` (voice), `nexus-ui` (AI primitives); `adapttable` (URL-synced
  data table), `niko-table`, `shadcn-table-v2`, `tnks-data-table`,
  `TableCraft`; `shadcn-admin`, `dnd-dashboard`, `tremor`. Fetch truncated at
  ~half the page.
- Awesome Design Dev (https://github.com/noobnooc/awesome-design-dev):
  directory naming Shadcn, Radix, Magic UI, Aceternity, Cult UI, Headless UI,
  Uiverse, Neobrutalism, Origin UI, daisyUI, HeroUI, Base UI, Park UI. Link
  farm only.
- YouTube (unverified, chrome-only fetch): Beyond Fireship
  (watch?v=RPa3_AD1_Vs), Codevolution (watch?v=xhXvB2xRhMM), React Bits
  Showcase (watch?v=pnk_lVDNDR4). No title/transcript returned — open in a
  browser before citing.

## 7. Mapping addendum (user directory → BlueTrace)

| BlueTrace component | Borrow from (§6) |
|---|---|
| `CopilotDrawer` | assistant-ui `AssistantModal`, `ChainOfThought`, `Attachment`, Generative UI; Prompt Kit `PromptInput`; ReUI AI Chat (13) + Agent Activity (5); blocks.so `/chat`, `/ai` |
| `LedgerPanel` | ReUI Data Grid Advanced (grouping, editing, virtualization) + Receipt/Billing; Kibo `Table`; Cult UI Table Editor Artifact; Tremor workspace table; Awesome list `adapttable`, `tnks-data-table` |
| `SchedulePanel` | Kibo `Gantt`, `Kanban`, `Calendar`, `Roadmap`; ReUI Gantt (7), Kanban (10), Schedule, Timeline |
| `SheetCanvas` | Kibo `Collaborative Canvas` (live cursors); ReUI Whiteboard (2), Flow (4), Digital Twin (2); Fancy Drag Elements; BG.IBELICK backdrops |
| `UploadCard` | Kibo `Dropzone`; blocks.so File Upload (6); assistant-ui `Attachment` |
| `SheetTree` | CuiCui `Tree` (Root/Nested Folder); ReUI App Shell (36) |
| `GlobalTopNav` / `ModeBanner` | coss.com `Command`; blocks.so Command Menu (4), Sidebar (6); shadcn-svelte Blocks |
| `ByokDialog` / dialogs | blocks.so Dialogs (12); coss.com `Dialog`, `Drawer`, `Sheet` |
| Landing/story | Magic UI effects; React Bits text/backgrounds; Fancy physics; Animata widgets/graphs; Eldora blocks; Tailark pages; Uiverse cards/loaders; daisyUI themes; Neobrutalism/8bitcn only if a themed demo is wanted |
