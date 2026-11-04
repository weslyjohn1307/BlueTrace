# BlueTrace MEP UI Revamp — Agent Prompt

Copy the prompt below into the implementation agent working in `D:\bluetrace-ai`.

---

## Mission

You are improving the real BlueTraceAI MEP drawing and takeoff application. Work as a careful product designer and engineer. Revamp the user experience across the actual application, not just the upload screen or one attractive screenshot.

BlueTrace is an offline-capable MEP drawing intelligence and takeoff system. It combines local PDF/vector extraction, graph and node-based tracing, geometry and scale math, object/symbol detection, and model-assisted interpretation. Meta models may help with vision, OCR, tables, segmentation, and grounded copilot reasoning. Local algorithms own vector geometry and physical measurement. The engineer reviews evidence and controls consequential decisions.

The engineer may open a drawing package containing dozens or hundreds of large PDF pages, and potentially multiple PDFs. The engineer must be able to see and navigate the drawing while intake and agent work continue. Treat this as a professional engineering workstation, not a consumer upload wizard, a marketing page, a crime-scene scanner, or a decorative agent dashboard.

The goal is an interface with simple purpose, clear hierarchy, calm visual density, understandable agent behavior, and simple-to-maintain implementation. Use Linear and Apple Notes as quality references for clarity and restraint, not as templates to copy. Preserve BlueTrace’s identity, existing capabilities, engineering semantics, and functional wiring.

## Project evidence to read first

Before editing anything:

1. Read `AGENTS.md`, `agent-os/WORKFLOW.md`, and the current `agent-os/STATUS.md`. The status file owns current work/ownership. Do not edit a file another active task owns. If the status is stale relative to newer evidence, record the conflict and have its owner update it; do not silently rewrite shared coordination state.
2. Read `design-plans/mep-engineer-workspace-revamp.md`. It contains live package-run measurements, current UI findings, source recovery/job gaps, and a staged redesign proposal.
3. Trace the real application routes and rendered compositions starting at `frontend/src/app/AppRouter.tsx`, `GlobalTopNav.tsx`, `frontend/src/workspace/TakeoffWorkspace.tsx`, and the components/hooks they actually render. Inspect `src/api/`, `src/agents/`, `src/core_vector/`, `src/meta_services/`, `src/store/`, and `frontend/src/api/` only as needed to map each visible feature to its real contract.
4. Inspect the `/showcase` page and its styles as a visual reference. The showcase is explicitly scripted and synthetic. Reuse its effective hierarchy, spacing, brand expression, and restrained interaction ideas where appropriate. Do not treat its demo scene or simulated review state as working product functionality, and do not paste the marketing page into the dense engineering workspace.
5. Inspect `C:\Users\DANIEL\Downloads\BlueTrace_Brand_Pack_v2.zip` in place. Read `BRAND_GUIDELINES.md`, `brand-tokens.json`, and relevant SVG masters before changing brand elements. Prefer supplied SVG masters and icons. Do not invent a new logo or repeat the logo as decoration. Keep MEP overlay colors distinct from brand accent colors.
6. Read `internal-research/skill-vault/README.md` and `_vault-manifest.json` before consulting the skill vault. The vault is parked reference material, not an installed or active skill system. Search only for relevant UI/design/accessibility practices. Inspect a chosen archive’s manifest entry and its `SKILL.md` and scripts before trusting it. You may install a focused UI/design skill or tool if it materially helps this task; follow the vault activation procedure, check provenance and scripts, write the required BlueTrace-specific notes, and verify the canonical install. Do not install a second orchestrator, memory system, or competing hook/global configuration. Never execute scripts from an archive just because it is called a skill.
7. Check the current available tools for 21st.dev MCP. If it is connected, use it selectively for a specific component or inspiration, then adapt the result to BlueTrace’s brand, React/Tailwind conventions, evidence requirements, and real state. Do not assume that it is connected or claim to have used it if unavailable. Do not replace a whole screen with a generic generated dashboard. Before adding any library, inspect existing manifests and justify the need; prefer existing dependencies and tokens. The user authorizes installing what is genuinely needed, but keep every addition scoped and explain its value in the handoff.

## Owner-supplied visual evidence and component references

The product owner re-supplied these files in `C:\Users\DANIEL\Downloads\`. Inspect them directly before making visual decisions. The brand pack and the product owner’s direct Lora + Inter selection govern where they conflict: preserve the supplied logo, brand tokens, and iconography; use Lora for workspace display/section headings, Inter for interface/body text, and IBM Plex Mono for technical values. Keep the official SVG wordmark intact rather than recreating it in text.

- `BlueTrace_Brand_Pack_v2.zip` and `BlueTrace Brand Identity System.png`: authoritative identity and logo artwork. Current pack tokens are Ink Navy `#0A0F1E`, BlueTrace Blue `#005BFF`, Signal Cyan `#37C6FF`, Surface `#E9F4FF`, and Cloud `#F5F7FA`. Blue is the primary brand signal; cyan is secondary. The pack names Inter Display/Inter/IBM Plex Mono; the owner’s explicit Lora + Inter choice is the approved workspace-specific override. Use the pack’s official marks, icons, minimum sizes, clear space, and linework motif.
- `Screenshot 2026-11-03 191220.png`: a BlueTrace concept workspace with a readable sheet context, deliberate system isolation controls, and a scale review state. Use its drawing-first composition and calm overlay logic. Its drawing and detections are synthetic and must not be presented as live application state.
- `2d61519ffce55e8ec149071680d92d4e.jpg`: a drawing-review reference with plan annotations and a sparse contextual toolbar. Use it to reason about clear sheet evidence and review markers; do not copy its company identity or imply unsupported collaboration features.
- `UI_UX Desktop Dashboard for Financial Controllers _ Construction Management (Formify).jpeg`: reference for generous spacing and a visible construction plan. Do not inherit its yellow/orange finance palette or its data widgets.
- `Agentic AI Construction SaaS Dashboard UI Design.jpeg`: reference only for a clear work-progress region. Avoid its glassy metric cards, gauges, blur, and synthetic KPI treatment in the engineering workspace.
- `videoframe_3077.png`: architectural drawing/model visual reference, not an application-screen reference. Let real PDFs and truthful overlays provide the product imagery; do not add a decorative 3D scene.
- The existing `/showcase` route and `frontend/src/modes/showcase/` are the nearest in-repository visual example. Reuse appropriate BlueTrace palette, drawing stage, and overlay treatment; keep its illustrative sheet and demo interactions out of production claims.

The owner also supplied a directory of component references. Prefer the current project’s own React/Tailwind primitives and selectively adapt useful application patterns from [shadcn/ui](https://ui.shadcn.com/), [Coss UI](https://coss.com/ui), [Kibo UI](https://www.kibo-ui.com/), [ReUI](https://reui.io/), and [21st.dev](https://21st.dev/community/components). Use [The Component Gallery](https://component.gallery/) as a pattern reference. These projects use different component foundations; do not install or paste a complete library into this app without proving compatibility and need. Avoid animation-focused marketing libraries for the PDF workstation. The 21st.dev MCP was not available in this session; its public examples may still be inspected, but do not claim MCP use. Figma is optional; no Figma file was supplied, and the live app plus existing showcase are sufficient design evidence for this pass. The named Hallmark skill was not found in the installed skills or parked skill vault; do not claim to use it.

## What live use has already shown

Use these as verified observations and design constraints, not as claims that every issue has already been fixed:

- The 7-page plumbing set completed in 156.58 seconds. The 25-page mechanical set completed in 1,131.24 seconds (18m51s) with 69 live `muse-spark-1.3` calls and 225,402 Meta tokens. Large packages are real workflows; a single-page smoke test is not package validation.
- The mechanical result contained 20,275 ledger records and 2,012 review flags. Four sheets had verified printed scale. Other pages included plans, details, schedules, legends, and information. Some disciplines were misclassified; legend candidates included annotation references; one schedule extraction was unparseable.
- A long ledger once pushed the PDF far below the viewport. A viewport-constrained layout fixed that specific failure. A later refresh restored some project state but did not restore the source PDF for rendering the page image. Job/source recovery remains a real product concern.
- The old laser-sweep loading animation and decorative/fabricated telemetry were removed in a prior slice. Do not reintroduce them. The canvas still has persistent controls/cards over the drawing and needs a deliberate composition pass.
- The current vector card has displayed a hard-coded 99.8% confidence whenever vector rows exist. Do not preserve or recreate confidence numbers that have no measured/calibrated source. Its scale indicator must follow authoritative `scale_status`, not merely the existence of a numeric ratio.
- An idle local server makes no Meta calls. Active analysis and explicit vision/crop interactions do. Keep cost/activity messaging truthful.
- Full details and run notes are in `fixtures/local_real_testing/README.md`. Local test PDFs are copied/renamed under `fixtures/local_real_testing/inputs/` and gitignored. Preserve originals and the ignore rule.

## Product experience to build

### PDF first, package-aware

When the engineer opens a PDF, show the PDF as soon as a preview is available. Do not leave the user staring at an empty drop zone while the entire package is processed. Keep page navigation and current-sheet preview usable while intake and specialist work proceed.

Build a package audit that can identify page count and propose sheet number/title, discipline, sheet type (plan, detail, legend, schedule, information, unknown), scale evidence, and likely legend/schedule relationships. Show evidence and uncertainty. Let the engineer correct consequential classifications and choose all likely plans, selected sheets, or a limited pass before expensive full analysis begins. Do not force users to process a single page when their real task is a multi-page set.

Do not invent a fixed completion time or use an HTTP request timeout as an ETA. Report observed stages and counts. Offer ETA/token ranges only when they come from measured per-stage history and are labeled as estimates. Keep the PDF visible while work runs.

### Calm engineering workspace

Make the drawing the visual center. Use a clear top bar, searchable sheet navigator, reserved canvas tool area, task-focused review inspector, and collapsible agent activity. Give each region a clear purpose and predictable scroll ownership. Keep frequent actions easy to reach, but move diagnostics and raw telemetry out of the default view. Ensure narrow screens use reachable drawers/menus instead of hiding required panels and their controls.

Use icon-first controls where the action is familiar and low-risk. Show the action name and shortcut on hover and keyboard focus, and keep accessible names in the DOM. Keep visible labels or an always-visible selected-tool explanation for specialized or consequential actions such as scale calibration, QuickDraw, or segmentation. Touch users need a tap-accessible label/help path; hover cannot be the only discovery method. Do not remove labels everywhere merely to make the screen sparse.

Move Meta API-key management into a real Settings page or panel. Do not leave key configuration as a prominent everyday header action. Keep a compact, truthful AI availability state in the header (AI available, local/offline only, or connection issue) with an accessible explanation and a route to Settings. Respect the current session-only key behavior and never place secrets in browser storage, logs, source, or Git.

Review every visible text label, separator, badge, tooltip, empty state, progress message, and repeated status. Remove middle-dot separators. Use plain language for actual engineers. Delete taglines, helper text, duplicate labels, raw agent IDs, fake telemetry, and internal jargon when the layout itself can make the action clear. Keep the minimum explanation necessary for safety, an engineering decision, data provenance, or a recoverable error. Use short labels with a specific meaning; no invented words or opaque abbreviations.

### Overlays and review

Keep the existing semantic MEP layer colors where they remain legible over real PDFs. Add independent visibility and counts for vector linework, detected components, schedule-linked/ghost items, citations/evidence, calibration, and review warnings. The legend should reflect the current visible layers and be collapsible. Never rely on color alone: pair it with a marker shape, line style, label, or status text. Link a canvas selection to its ledger row and evidence source. Keep persistent overlays from covering the drawing or each other.

Symbol/component detections must link to the legend exemplar and plan region that support the match. Separate countable components from keynote/detail references, matchlines, revision marks, and other annotations. Show abstention reasons instead of turning uncertainty into a quantity.

Scale is required for physical measurements, not every sheet. Information, legend, and schedule sheets may correctly have no scale. Show “Scale not needed for this sheet” when appropriate. For plan geometry, show the printed scale text/source or the exact missing/conflicting evidence; allow two-point calibration with named points and real units; explain which measurements will be recomputed; and keep unverified physical quantities unaccepted. Printed verification and engineer calibration are different evidence sources and must remain distinguishable.

### Real agents, not theater

Give the engineer a small stable hierarchy of named roles, grounded in actual capabilities wired in `src/agents/` and `src/meta_services/`. At minimum, consider Sheet Auditor, Sheet Reader, Legend and Component Reader, Vector Tracer, Schedule Reader, Quality Reviewer, and Engineering Copilot. Map each visible role to actual source code and status. If a role is only proposed or is not active for this run, do not show it as working.

Show concise events with page/sheet, role, stage, outcome, and evidence links. Distinguish waiting, working, needs engineer input, complete, could not determine, and failed. Say what changed in the drawing, not a stream of implementation logs. Keep model name, mock/live mode, latency, retries, and token counts in expandable diagnostics. Ask the engineer when a decision changes sheet routing, component identity, schedule linkage, or measured quantity; include source evidence and a “decide later” choice. Preserve the decision as a reviewable event.

## Non-negotiable engineering guardrails

- **Do not break or fake existing wiring.** Before changing a button, trace its handler → client method → endpoint/schema → backend/model/local algorithm → persistence → rendered state. Keep the same user capability working unless the approved UX change explicitly replaces it and the replacement is verified.
- **No mock UI presented as real.** Do not hard-code counts, agent activity, confidence, ETA, scale verification, model status, or successful output. A demo fixture may be labeled as synthetic/demo. UI states must reflect API responses and real run events.
- **Respect the hybrid architecture.** Meta handles vision/OCR/table interpretation and grounded reasoning. Local Python algorithms own vector geometry, centerline tracing, and scale math. Do not call a VLM for deterministic physical measurement or invent dimensions.
- **Fail closed on scale.** Unverified, missing, or conflicting scale stays `review_required` for plan quantities. Do not let a positive ratio alone mean verified. Non-plan sheets do not become errors merely because they have no scale.
- **Preserve offline paths.** Vector extraction and local review must remain usable where designed without Meta. Clearly identify which capability needs a live Meta connection.
- **Keep user files safe.** Use approved copied/renamed test PDFs; do not alter originals. Do not upload new/private PDFs to a third-party service outside the live-testing authorization already in the task. Do not commit datasets or secrets.
- **Preserve API contracts in visual-only slices.** Do not combine a broad visual redesign with hidden changes to routes, payloads, database schema, job semantics, or model prompts. When the UX genuinely needs a missing capability, write down the exact gap, inspect the current owner/status, make it a separate vertical slice with contract/migration coverage, then connect the UI to that real capability.
- **Protect concurrent ownership.** Re-read `agent-os/STATUS.md` before each implementation slice. Follow `agent-os/WORKFLOW.md`; do not touch files marked active-owned. Do not hand-edit generated `.agents/` or `.opencode/` runtime installs. Do not overwrite an existing incomplete plan.
- **Keep the change small enough to verify.** Implement one user-visible vertical slice at a time. Do not install an alternate agent framework. No dependency unless the need and existing alternatives are documented. No commit, push, merge, delete, or destructive cleanup without the user's exact approval.

## Visual and content direction

Use the supplied BlueTrace brand pack as the source of truth for logo, Ink Navy, BlueTrace Blue, Signal Cyan, and supplied product icons. Keep brand accent colors separate from MEP discipline colors. The mark should not become a watermark on every panel. Match existing app tokens before introducing new values.

Use the user’s visual references as principles, not absolute tokens:

- Aim for three or four clear text sizes and readable dense data. Avoid tiny captions; do not push engineering data below a legible size just to meet a numeric rule.
- Prefer semantic color roles and accessible contrast. Use Radix color guidance for semantic scales if it fits the current palette; do not install a color package merely to use its names or replace BlueTrace brand/MEP colors wholesale.
- Use consistent borders/dividers, optically aligned controls, and nested radii that look intentional. Avoid arbitrary corner radii, decorative shadows, colored stripe accents, and excessive borders.
- Keep motion minimal and functional, generally short ease-out transitions. Respect `prefers-reduced-motion`; never use an animation to imply a model or agent is active when it is not.
- Avoid visual clutter and false hierarchy. The PDF, current sheet, active task, and engineer decision should read first.

Do not blindly apply a numeric “0.5px border everywhere” rule if it produces weak contrast or inconsistent rendering. Follow the brand and existing tokens, then judge against real sheets and viewport sizes.

## Additional direction from the product owner

Earlier agents attempted UI work, but the result was not acceptable. Treat the live product and the user’s critique as evidence to improve from, not as a design to defend. The current workspace still reads as assembled/generated UI; replace generic card stacks, repeated cyan borders, tiny all-caps telemetry, and decorative status treatments with a deliberate, engineer-focused visual system. Keep the PDF and evidence at the center.

- Use the **classic Lora + Inter pairing**: Lora for restrained display/section headings and Inter for interface text and dense reading. Use the brand pack’s IBM Plex Mono only for code, IDs, coordinates, and measurements. Bundle fonts locally so offline use works. Do not swap these fonts for a generic dashboard pairing.
- Establish a small type scale with readable minimum sizes, consistent weights, line heights, and measure. Set spacing and panel widths from a repeatable scale; align nested content to shared edges; create clear gaps between groups. Check labels, status chips, tables, sheet names, and controls for clipping at real workstation sizes.
- The user authorizes Figma as an optional design aid and allows reference to well-built free component examples. A companion Figma file now exists at [BlueTraceAI — MEP Workstation](https://www.figma.com/design/0yC6uFwj7jNmsbqb20q4Om). Its imported captures are preliminary; the Figma MCP Starter-plan call limit prevented screenshot inspection and refinement. Continue using Figma only when it answers a concrete design question. Adapt patterns to BlueTrace’s current React/Tailwind system and actual handlers; do not paste a template or generated screen over working product flows. Do not add a library just to copy a reference.
- Apply relevant installed UI skills, including UI/UX Pro Max, Impeccable, layout/typography/accessibility guidance, and lintapple where available. Check for the named Hallmark skill/tool before claiming to use it; if it is absent, say so and continue with available skills. Do not install a competing orchestrator or edit generated runtime skill directories.
- Before implementation, state a specific art direction in the design notes: what the page should feel like for an MEP engineer, which existing brand cues remain, what competing visual noise is removed, and why the chosen type and spacing support long drawing review. The result must look intentionally designed for this product rather than like an AI dashboard.

## Required audit and execution process

1. **Baseline map:** list the routes/screens and key states. For every interactive component, record its actual handler/API/backend path and important response state. Mark anything unverified. Identify current tests and build/lint commands. Capture a browser baseline at desktop and narrow width if a live browser/server is available.
2. **Component audit:** review each screen and component individually for purpose, hierarchy, spacing, copy, discoverability, empty/loading/error/success/offline states, overlap, responsive reachability, accessibility, and whether the displayed value is real. Cite candidate problems with file path and line number. Separate visual/copy changes from interaction or contract changes.
3. **Plan against ownership:** choose small vertical slices in dependency order. Start with workspace composition and source/job usability that can be done without inventing backend state. For any required backend or schema gap, describe and isolate it explicitly; do not mask it with a front-end mock. Preserve current unrelated working-tree changes.
4. **Implement in thin slices:** for each slice, improve the whole user path, not just a static component. Update focused tests when behavior changes. Keep the application buildable. Do not claim the UI is “fully fixed” after one screen or one run.
5. **Verify live:** use the application in a browser with a real approved PDF. Check at least: idle/upload, preview while processing, package progress, multiple sheet types, scale verified/unverified/not-needed, symbol/evidence overlays, ledger review, Settings/AI status, errors/offline, refresh/reopen, and narrow viewport. Never spend Meta tokens just to test CSS; use live models only for the approved inference flows.
6. **Report:** give changed files, what each slice does, commands actually run and their raw result, live browser states checked, API/agent wiring preserved or intentionally changed, remaining findings, and any architecture decisions still open. Do not invent verification evidence.

## Design review checklist

Review every screen and component against these principles:

1. **One clear purpose:** the screen has a primary engineer task and action.
2. **PDF remains primary:** the drawing is visible as early and continuously as possible.
3. **Useful density:** remove repeated text and visual noise, not necessary decisions or evidence.
4. **Discoverable controls:** familiar tools can be icon-first; unfamiliar/high-risk actions remain understandable across pointer, keyboard, and touch.
5. **Evidence over theater:** displayed detections, confidence, scale, progress, cost, and agent activity are backed by real state.
6. **Distinct visual layers:** overlays are legible over real drawings, independently controllable, and not color-only.
7. **Honest sheet semantics:** type, discipline, scale requirement, and processing state are separate concepts.
8. **Recoverable long work:** big packages, errors, refresh, and reconnect do not strand the engineer or lose the source/run silently.
9. **Consistent language and hierarchy:** no middle-dot separators, made-up labels, redundant taglines, or helper copy compensating for confusing layout.
10. **Brand and accessibility:** BlueTrace identity, focus, contrast, keyboard/touch access, reduced motion, and readable type survive the redesign.

After the checklist, apply this instruction:

> Review every screen against these 10 rules. List violations with file paths and line numbers, then fix copy and visual issues in one pass. Preserve functionality, accessibility, and user workflows. Flag interaction changes separately for review. Run the relevant checks and summarize anything unresolved.

For this project, interpret “one pass” as one **bounded UI slice** after the baseline map, not a repository-wide rewrite. Continue through the remaining slices only while each stays within current ownership and can be verified without hiding a backend/API change. If interaction changes are necessary to deliver the stated UX, explain them in the plan and implement the smallest complete, tested change; do not silently change them under a visual-only label.

## Final handoff format

### What changed
- User-visible improvement and affected workflow.
- Files/components changed.

### Wiring and behavior
- Existing endpoints/events/state preserved.
- Any interaction or contract changes, with reason and coverage.

### Verification
- Exact commands and pass/fail counts from this run.
- Browser states and PDF/package size used.
- Meta calls/tokens only when actually used.

### Still unresolved
- Known visual, functional, or architecture gaps, prioritized.
- Ownership/dependencies and the next safe slice.

Do not claim completion of the full revamp until the acceptance criteria in `design-plans/mep-engineer-workspace-revamp.md` are met with live browser evidence.

