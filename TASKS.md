# BlueTraceAI: Goal-Based Task Tracking Matrix

## Phase 0: Blueprinting, Constitutions & Spec-Driven Planning (G-M0)

- [x] **RES-01**: Meta Model API Interface Specifications (`docs/research/RES-01-META-MODEL-INTERFACES.md`)
  - Documented exact payload formats for `muse-spark-1.3`, `sam-3.1` (Responses API), `muse-wonder-1.0`, and Files API (`/v1/files`).
- [x] **RES-02**: Point-of-Need Viewport & Cursor Crop UX (`docs/research/RES-02-POINT-OF-NEED-UX.md`)
  - Defined coordinate matrix transformations (screen CSS -> PDF pt -> 150 DPI render) and 300x300 px crop specs.
- [x] **RES-03**: Schedule Table Extraction & Entity Linking (`docs/research/RES-03-SCHEDULE-TO-PLAN-LINKING.md`)
  - Defined equipment schedule JSON schema and plan spatial index heuristics.
- [ ] **RES-04**: CTD 2026 MEP Design AI & ParseBench Architecture (`docs/research/RES-04-CTD2026-MEP-AGENTIC-ARCHITECTURE.md`)
  - Document the 4 bounded agent roles and "read cheaply first, reason visually selectively" principle.
- [ ] **RES-05**: Deterministic Vector Linework & Scale Integrity (`docs/research/RES-05-DETERMINISTIC-VECTOR-GEOMETRY-SCALE.md`)
  - Document PyMuPDF vector path extraction, double-line duct centerline tracing, and fail-closed scale verification.
- [ ] **SPEC-01**: Root Project Constitution (`AGENTS.md` and `CLAUDE.md`, strictly < 200 lines).
- [ ] **SPEC-02**: Product Requirements & Intent (`Overview.md`).
- [ ] **SPEC-03**: Locked Tech Stack Manifest (`Tech_stack.md`).
- [ ] **SPEC-04**: Behavioral Technical Specs & Schema Contracts (`Data_models.md`).
- [ ] **SPEC-05**: User Flows & 5 Mandatory Screen States (`User_flows.md`).
- [ ] **SPEC-06**: Immutable Design System Contract (`DESIGN.md`).
- [ ] **SPEC-07**: Architecture Decision Record (`docs/adr/ADR-001-hybrid-mep-architecture.md`).
- [ ] **MEM-01**: Initialize Manus-Style 3-File Persistent Memory (`task_plan.md`, `findings.md`, `progress.md`, `State.md`).

---

## Phase 1: Environment & Scaffolding (G-M1)

- [ ] **ENV-01**: Setup Python virtual environment & dependencies (`pyproject.toml` with `fastapi`, `uvicorn`, `pymupdf`, `shapely`, `networkx`, `httpx`, `openai`, `pydantic`).
- [ ] **ENV-02**: Setup Node.js frontend workspace with React 19, Vite, TypeScript, and Tailwind CSS.
- [ ] **ENV-03**: Setup environment configuration (`.env.example` with zero secrets committed).
- [ ] **ENV-04**: Create clean directory structure (`src/api`, `src/core_vector`, `src/meta_services`, `src/document`, `src/models`, `tests`).

---

## Phase 2: Meta Model API Layer (G-M2)

- [ ] **META-01**: Core Meta Model Client (`src/meta_services/client.py`) supporting base URL `https://api.meta.ai/v1`, Bearer auth, and token management.
- [ ] **META-02**: Vision & Table Parser Wrapper (`src/meta_services/vision_parser.py`) for `muse-spark-1.3`.
- [ ] **META-03**: SAM 3.1 Segmentation Client (`src/meta_services/sam_segmenter.py`) via `/v1/responses`.
- [ ] **META-04**: Files API Client (`src/meta_services/files_client.py`) for PDF blueprint upload and caching.
- [ ] **META-05**: Reasoning Copilot Client (`src/meta_services/copilot_client.py`) for `muse-wonder-1.0` with structured tool calling.
- [ ] **META-TEST**: Unit test suite verifying all payload structures and mock response handling.

---

## Phase 3: Document Understanding & SheetScan (G-M3)

- [ ] **DOC-01**: Native PDF page enumerator, text extractor, and vector density analyzer (`src/document/reconnaissance.py`).
- [ ] **DOC-02**: Discipline classifier (`M` Mechanical, `E` Electrical, `P` Plumbing) and title block locator.
- [ ] **DOC-03**: Title block & scale interpreter using `muse-spark-1.3` on 300 DPI high-res crops.
- [ ] **DOC-04**: Legend table extractor linking graphical symbols to engineering descriptions.
- [ ] **DOC-05**: Document Map Builder outputting structured `document_map.json`.

---

## Phase 4: Deterministic Linework & Point-of-Need OCR (G-M4)

- [ ] **VEC-01**: PyMuPDF sub-pixel vector line/curve extractor (`src/core_vector/extractor.py`).
- [ ] **VEC-02**: Paired double-line duct centerline tracer & topological graph builder (`src/core_vector/centerline.py`).
- [ ] **VEC-03**: Conservative fail-closed scale validator (`src/core_vector/scale_validator.py`).
- [ ] **OCR-01**: Sub-second cursor hover crop endpoint (`POST /api/crop-ocr`) processing 300x300 px crops.
- [ ] **UI-01**: Frontend canvas hover dimension badge with click-to-apply takeoff action.

---

## Phase 5: Schedule Parsing & Entity Linking (G-M5)

- [ ] **SCHED-01**: Tabular equipment schedule parser (`src/meta_services/schedule_parser.py`) outputting structured equipment matrices.
- [ ] **SCHED-02**: Spatial entity linking heuristic matching schedule tags (e.g. `VAV-1`, `S1`) to floor plan coordinate pins.
- [ ] **UI-02**: Interactive takeoff ledger in frontend with accept/reject review workflow and visual grounding.

---

## Phase 6: Copilot Reasoning & Interactive Canvas Demo (G-M6)

- [ ] **COPILOT-01**: Natural language takeoff assistant querying structured project SQLite database via `muse-wonder-1.0`.
- [ ] **SEG-01**: One-click room and equipment polygon segmentation via `sam-3.1`.
- [ ] **UI-03**: 150 DPI hardware-accelerated canvas viewer with synchronized page navigation and highlighted evidence.
- [ ] **VER-01**: End-to-end integration test suite passing with 100% test pass rate.
- [ ] **VER-02**: 3-minute video walkthrough demonstrating live takeoff workflow.
- [ ] **SUBMIT**: Final repository cleanup, 4-command leak audit, and submission to Cerebral Valley.
