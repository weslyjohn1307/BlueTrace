# BlueTraceAI: Persistent Task Plan (task_plan.md)

> Synced with TASKS.md on 2026-10-30. File paths below are the real ones
> (single `client.py`, no `src/document/`, `representation.py`+`continuity.py`
> instead of `centerline.py`).

## Master Phased Execution Blueprint

### Phase 0: Blueprinting, Constitutions & Spec-Driven Planning (G-M0)
- [x] RES-01: Meta Model API Interface Specifications (`docs/research/RES-01-META-MODEL-INTERFACES.md`)
- [x] RES-02: Point-of-Need Viewport & Cursor Crop UX (`docs/research/RES-02-POINT-OF-NEED-UX.md`)
- [x] RES-03: Schedule Table Extraction & Entity Linking (`docs/research/RES-03-SCHEDULE-TO-PLAN-LINKING.md`)
- [x] RES-04: BlueTraceAI MEP Agentic Architecture & ParseBench (`docs/research/RES-04-MEP-AGENTIC-ARCHITECTURE.md`)
- [x] RES-05: Deterministic Vector Linework & Scale Integrity (`docs/research/RES-05-DETERMINISTIC-VECTOR-GEOMETRY-SCALE.md`)
- [x] RES-06: Standalone Desktop Packaging Architecture (`docs/research/RES-06-STANDALONE-PACKAGING.md`)
- [x] RES-07: MEP Domain & Prior Art Analysis (`docs/research/RES-07-MEP-DOMAIN-AND-PRIOR-ART.md`)
- [x] RES-08: BYOK Application Patterns & Key Isolation (`docs/research/RES-08-BYOK-APPLICATION-TEMPLATES.md`)
- [x] RES-09: 60 FPS CAD Canvas Architecture & Weave Design HIG (`docs/research/RES-09-UI-COMPONENTS-AND-WEAVE-HIG.md`)
- [x] SWARM-01: Scaffold 8 Developer Swarm Agents in `.opencode/agents/` (Lead, Vector, Meta, Canvas, Takeoff, Silent Hunter, UX QA, Desktop)
- [x] SWARM-02: Antigravity Workspace Harness in `.agents/` (Hooks, Rules, Skills)
- [x] KNOW-01: Domain Knowledge Corpus in `docs/knowledge/` (SMACNA, Title Blocks & Scales, ParseBench arXiv:2604.08538, incumbent takeoff workflows)
- [x] KNOW-02: Agent context system — `docs/knowledge/INDEX.md` routing (agent → required packs), 6 new packs (sheet taxonomy, estimating/bid, PDF geometry, glossary/tags, VLM grounding, failure modes), every agent wired to its packs, guardrail rules 04–06 (knowledge-first, copyright, evidence-before-claims); fixed 12× surface-area formula error found in agent 05
- [x] TOOL-01: Knowledge Scraper & Obscura CDP Utility (`scripts/fetch_knowledge.py`)
- [x] CLI-01: Terminal Muse CLI execution verified (`muse` on PATH; machine-local path not recorded)
- [x] SPEC-01: Root Project Constitutions (`AGENTS.md` and `CLAUDE.md`, strictly < 200 lines)
- [x] SPEC-02: Product Requirements Document (`Overview.md`)
- [x] SPEC-03: Locked Tech Stack Manifest (`Tech_stack.md`)
- [x] SPEC-04: Behavioral Technical Specs & Schema Contracts (`Data_models.md`)
- [x] SPEC-05: User Flows & 5 Mandatory Screen States (`User_flows.md`)
- [x] SPEC-06: Immutable Design System Contract (`DESIGN.md`)
- [x] SPEC-07: Architecture Decision Record (`docs/adr/ADR-001-hybrid-mep-architecture.md`)
- [x] MEM-01: Initialize Manus-Style 3-File Persistent Memory (`task_plan.md`, `findings.md`, `progress.md`, `State.md`, `prd.json`)

### Phase 1: Environment & Scaffolding (G-M1)
- [x] ENV-01: Backend manifest (`pyproject.toml`)
- [x] ENV-02: React 19 frontend workspace (`frontend/`)
- [x] ENV-03: Environment configuration (`.env.example`, zero secrets)
- [x] ENV-04: Directory structure (`src/api`, `src/core_vector`, `src/meta_services`, `src/store`, `src/models`, `tests`)

### Phase 2: Meta Model API Layer (G-M2)
- [x] META-01: Base Meta Model Client (`src/meta_services/client.py`)
- [x] META-02: Vision & table parsing in `client.py` for `muse-spark-1.3`
- [x] META-03: SAM 3.1 segmentation in `client.py` via `/v1/responses`
- [x] META-04: Files API upload in `client.py` + `POST /api/files/upload`
- [x] META-05: Reasoning copilot (`src/meta_services/copilot.py`) for `muse-wonder-1.0`, SSE streaming
- [x] META-TEST: Mock/contract suite (`tests/test_meta_services.py`, `tests/test_api_contract.py`)

### Phase 3: Document Understanding & SheetScan (G-M3)
- [x] DOC-01: Page enumerator, text extractor, vector density (`sheet_scanner.py`, `pipeline.py`)
- [x] DOC-02: Discipline classifier + title block locator
- [x] DOC-03: Title block & scale interpreter (VLM + fail-closed vector validation)
- [ ] DOC-04: Legend table extractor (symbol→description; sheet detection only today)
- [x] DOC-05: Sheet metadata builder (`SheetMetadata` contracts)

### Phase 4: Deterministic Linework & Point-of-Need OCR (G-M4)
- [x] VEC-01: Vector extractor (`src/core_vector/extractor.py`)
- [x] VEC-02: Centerline tracer & topology (`representation.py`, `continuity.py`)
- [x] VEC-03: Fail-closed scale engines (`scale.py` + `scale_validator.py`, reconciled)
- [x] OCR-01: Hover crop endpoint (`POST /api/crop-ocr`, 150 pt window)
- [x] UI-01: Hover badge with click-to-apply (`HoverBadge.tsx` + `SheetCanvas.tsx`)

### Phase 5: Schedule Parsing & Entity Linking (G-M5)
- [x] SCHED-01: Schedule parser (`schedule_parser.py`, SUGGESTED-by-default)
- [x] SCHED-02: Tag→coordinate linking via page text blocks + ghost pins
- [x] UI-02: Ledger with accept/reject + CSV/JSON export (`LedgerPanel.tsx`)

### Phase 6: Copilot Reasoning & Interactive Canvas Demo (G-M6)
- [x] COPILOT-01: Grounded copilot with provenance + SSE (`CopilotPanel.tsx`)
- [x] SEG-01: `POST /api/segment` endpoint (canvas trigger future)
- [x] UI-03: 150 DPI canvas + sheet tree + evidence pins (`TakeoffWorkspace.tsx`)
- [x] VER-01: Suites green (39 backend / 25 frontend) + lint/type/audit gates
- [ ] VER-02: 3-minute video walkthrough demonstrating live takeoff workflow
- [ ] SUBMIT: Submission to Cerebral Valley (remote push + leak/history audit done 2026-10-30; see `docs/PLAN-STATUS.md`)
