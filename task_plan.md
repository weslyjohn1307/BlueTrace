# BlueTraceAI: Persistent Task Plan (task_plan.md)

## Master Phased Execution Blueprint

### Phase 0: Blueprinting, Constitutions & Spec-Driven Planning (G-M0)
- [x] RES-01: Meta Model API Interface Specifications (`docs/research/RES-01-META-MODEL-INTERFACES.md`)
- [x] RES-02: Point-of-Need Viewport & Cursor Crop UX (`docs/research/RES-02-POINT-OF-NEED-UX.md`)
- [x] RES-03: Schedule Table Extraction & Entity Linking (`docs/research/RES-03-SCHEDULE-TO-PLAN-LINKING.md`)
- [x] RES-04: BlueTraceAI MEP Agentic Architecture & ParseBench (`docs/research/RES-04-MEP-AGENTIC-ARCHITECTURE.md`)
- [x] RES-05: Deterministic Vector Linework & Scale Integrity (`docs/research/RES-05-DETERMINISTIC-VECTOR-GEOMETRY-SCALE.md`)
- [x] SPEC-01: Root Project Constitutions (`AGENTS.md` and `CLAUDE.md`, strictly < 200 lines)
- [x] SPEC-02: Product Requirements Document (`Overview.md`)
- [x] SPEC-03: Locked Tech Stack Manifest (`Tech_stack.md`)
- [x] SPEC-04: Behavioral Technical Specs & Schema Contracts (`Data_models.md`)
- [x] SPEC-05: User Flows & 5 Mandatory Screen States (`User_flows.md`)
- [x] SPEC-06: Immutable Design System Contract (`DESIGN.md`)
- [x] SPEC-07: Architecture Decision Record (`docs/adr/ADR-001-hybrid-mep-architecture.md`)
- [x] MEM-01: Initialize Manus-Style 3-File Persistent Memory (`task_plan.md`, `findings.md`, `progress.md`, `State.md`, `prd.json`)

### Phase 1: Environment & Scaffolding (G-M1)
- [x] ENV-01: Setup backend manifest (`pyproject.toml` with `fastapi`, `uvicorn`, `pymupdf`, `shapely`, `networkx`, `httpx`, `openai`, `pydantic`)
- [ ] ENV-02: Setup React 19 frontend workspace with Vite, TypeScript, and Tailwind CSS (`frontend/`)
- [x] ENV-03: Setup environment configuration (`.env.example` with documented keys)
- [x] ENV-04: Create clean backend directory structure (`src/api`, `src/core_vector`, `src/meta_services`, `src/document`, `src/models`, `tests`)

### Phase 2: Meta Model API Layer (G-M2)
- [ ] META-01: Base Meta Model Client (`src/meta_services/client.py`) with `https://api.meta.ai/v1` and Bearer auth
- [ ] META-02: Vision & Table Parser Wrapper (`src/meta_services/vision_parser.py`) for `muse-spark-1.3`
- [ ] META-03: SAM 3.1 Segmentation Client (`src/meta_services/sam_segmenter.py`) via `/v1/responses`
- [ ] META-04: Files API Client (`src/meta_services/files_client.py`) for PDF blueprint caching
- [ ] META-05: Reasoning Copilot Client (`src/meta_services/copilot_client.py`) for `muse-wonder-1.0` with structured tool calling
- [ ] META-TEST: Unit test suite verifying mock responses and payload schemas

### Phase 3: Document Understanding & SheetScan (G-M3)
- [ ] DOC-01: Native PDF page enumerator, text extractor, and vector density analyzer (`src/document/reconnaissance.py`)
- [ ] DOC-02: Discipline classifier (`M` Mechanical, `E` Electrical, `P` Plumbing) and title block locator
- [ ] DOC-03: Title block & scale interpreter using `muse-spark-1.3` on 300 DPI crops
- [ ] DOC-04: Legend table extractor linking symbols to engineering descriptions
- [ ] DOC-05: Document Map Builder producing `document_map.json`

### Phase 4: Deterministic Linework & Point-of-Need OCR (G-M4)
- [ ] VEC-01: PyMuPDF sub-pixel vector line/curve extractor (`src/core_vector/extractor.py`)
- [ ] VEC-02: Paired double-line duct centerline tracer & topological graph builder (`src/core_vector/centerline.py`)
- [ ] VEC-03: Conservative fail-closed scale validator (`src/core_vector/scale_validator.py`)
- [ ] OCR-01: Sub-second cursor hover crop endpoint (`POST /api/crop-ocr`) for 300x300 px crops
- [ ] UI-01: Frontend canvas hover dimension badge with click-to-apply takeoff action

### Phase 5: Schedule Parsing & Entity Linking (G-M5)
- [ ] SCHED-01: Tabular equipment schedule parser (`src/meta_services/schedule_parser.py`)
- [ ] SCHED-02: Spatial entity linking heuristic matching schedule tags (e.g. `VAV-1`, `S1`) to floor plan coordinate pins
- [ ] UI-02: Interactive takeoff ledger in frontend with accept/reject review workflow

### Phase 6: Copilot Reasoning & Interactive Canvas Demo (G-M6)
- [ ] COPILOT-01: Natural language takeoff assistant querying structured project SQLite database via `muse-wonder-1.0`
- [ ] SEG-01: One-click room and equipment polygon segmentation via `sam-3.1`
- [ ] UI-03: 150 DPI hardware-accelerated canvas viewer with synchronized page navigation and highlighted evidence
- [ ] VER-01: End-to-end integration test suite passing with 100% test pass rate
- [ ] VER-02: 3-minute video walkthrough demonstrating live takeoff workflow
- [ ] SUBMIT: Final repository cleanup, 4-command leak audit, and submission to Cerebral Valley
