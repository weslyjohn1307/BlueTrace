# BlueTraceAI: Goal-Based Task Tracking Matrix

> Reconciled 2026-10-30 against the real tree (HEAD `bfe275e` + uncommitted R-1 migration in working tree).
> Checked = built, tested, and true **in the working tree**. R-1 changes are not yet committed — see SUBMIT.
> Project stage: **Planning** (prototype slices built for validation; not production, not submitted).

## Phase 0: Blueprinting, Constitutions & Spec-Driven Planning (G-M0)

- [x] **RES-01**: Meta Model API Interface Specifications (`docs/research/RES-01-META-MODEL-INTERFACES.md`)
  - Documented exact payload formats for `muse-spark-1.3`, `sam-3.1` (Responses API), `muse-wonder-1.0`, and Files API (`/v1/files`).
- [x] **RES-02**: Point-of-Need Viewport & Cursor Crop UX (`docs/research/RES-02-POINT-OF-NEED-UX.md`)
  - Defined coordinate matrix transformations (screen CSS -> PDF pt -> 150 DPI render) and 300x300 px crop specs.
- [x] **RES-03**: Schedule Table Extraction & Entity Linking (`docs/research/RES-03-SCHEDULE-TO-PLAN-LINKING.md`)
  - Defined equipment schedule JSON schema and plan spatial index heuristics.
- [x] **RES-04**: BlueTraceAI MEP Agentic Architecture & ParseBench (`docs/research/RES-04-MEP-AGENTIC-ARCHITECTURE.md`)
  - Document the 4 bounded agent roles and "read cheaply first, reason visually selectively" principle.
- [x] **RES-05**: Deterministic Vector Linework & Scale Integrity (`docs/research/RES-05-DETERMINISTIC-VECTOR-GEOMETRY-SCALE.md`)
  - Document PyMuPDF vector path extraction, double-line duct centerline tracing, and fail-closed scale verification.
- [x] **SPEC-01**: Root Project Constitution (`AGENTS.md` and `CLAUDE.md`, strictly < 200 lines).
- [x] **SPEC-02**: Product Requirements & Intent (`Overview.md`).
- [x] **SPEC-03**: Locked Tech Stack Manifest (`Tech_stack.md`).
- [x] **SPEC-04**: Behavioral Technical Specs & Schema Contracts (`Data_models.md`).
- [x] **SPEC-05**: User Flows & 5 Mandatory Screen States (`User_flows.md`).
- [x] **SPEC-06**: Immutable Design System Contract (`DESIGN.md`).
- [x] **SPEC-07**: Architecture Decision Record (`docs/adr/ADR-001-hybrid-mep-architecture.md`).
- [x] **MEM-01**: Initialize Manus-Style 3-File Persistent Memory (`task_plan.md`, `findings.md`, `progress.md`, `State.md`).

---

## Phase 1: Environment & Scaffolding (G-M1)

- [x] **ENV-01**: Setup backend manifest (`pyproject.toml` with `fastapi`, `uvicorn`, `pymupdf`, `shapely`, `networkx`, `httpx`, `openai`, `pydantic`).
- [x] **ENV-02**: Setup Node.js frontend workspace with React 19, Vite, TypeScript, and Tailwind CSS.
- [x] **ENV-03**: Setup environment configuration (`.env.example` with zero secrets committed).
- [x] **ENV-04**: Create clean directory structure (`src/api`, `src/core_vector`, `src/meta_services`, `src/store`, `src/models`, `tests`, `frontend/`, `fixtures/`). Document reconnaissance lives in `core_vector.pipeline` + `meta_services.sheet_scanner` (no separate `src/document/` by design).

---

## Phase 2: Meta Model API Layer (G-M2)

- [x] **META-01**: Core Meta Model Client (`src/meta_services/client.py`) supporting base URL `https://api.meta.ai/v1`, Bearer auth, and token management.
- [x] **META-02**: Vision & Table Parser Wrapper (`src/meta_services/client.py`) for `muse-spark-1.3`.
- [x] **META-03**: SAM 3.1 Segmentation Client (`src/meta_services/client.py`) via `/v1/responses`.
- [x] **META-04**: Files API Client (`src/meta_services/client.py`) for PDF blueprint upload and caching.
- [x] **META-05**: Reasoning Copilot Client (`src/meta_services/copilot.py`) for `muse-wonder-1.0` with context-grounded chat completions (ledger context injected as JSON; no function/tool calling — see `client.py:query_reasoning`).
- [x] **META-TEST**: Unit & contract test suite verifying all payload structures and mock response handling (`tests/test_meta_services.py`, `tests/test_api_contract.py`).

---

## Phase 3: Document Understanding & SheetScan (G-M3)

- [x] **DOC-01**: Native PDF page enumerator, text extractor, and vector density analyzer (`src/meta_services/sheet_scanner.py`, `src/core_vector/pipeline.py`).
- [x] **DOC-02**: Discipline classifier (`M` Mechanical, `E` Electrical, `P` Plumbing) and title block locator.
- [x] **DOC-03**: Title block & scale interpreter using `muse-spark-1.3` on 150 DPI high-res crops with fail-closed vector validation.
- [ ] **DOC-04**: Legend table extractor linking graphical symbols to engineering descriptions. Legend *sheet detection* exists for scale gating (`scale.py`); symbol→description extraction is future work (ADR-003 agent 2).
- [x] **DOC-05**: Document Map & Sheet Metadata Builder outputting structured `SheetMetadata` contracts.

---

## Phase 4: Deterministic Linework & Point-of-Need OCR (G-M4)

- [x] **VEC-01**: PyMuPDF sub-pixel vector line/curve extractor (`src/core_vector/extractor.py`).
- [x] **VEC-02**: Paired double-line duct centerline tracer & topological graph builder (`src/core_vector/representation.py`, `continuity.py`).
- [x] **VEC-03**: Conservative fail-closed scale validator (`src/core_vector/scale_validator.py`, `scale.py`).
- [x] **OCR-01**: Sub-second cursor hover crop endpoint (`POST /api/crop-ocr`) processing 150 pt crops.
- [x] **UI-01**: Frontend canvas hover dimension badge with click-to-apply takeoff action (`HoverBadge.tsx`).

---

## Phase 5: Schedule Parsing & Entity Linking (G-M5)

- [x] **SCHED-01**: Tabular equipment schedule parser (`src/meta_services/schedule_parser.py`) outputting structured equipment matrices with `SUGGESTED` default status.
- [x] **SCHED-02**: Spatial entity linking heuristic matching schedule tags (e.g. `VAV-1`, `S1`) to floor plan coordinate pins.
- [x] **UI-02**: Interactive takeoff ledger in frontend with accept/reject review workflow and visual grounding.

---

## Phase 6: Copilot Reasoning & Interactive Canvas Demo (G-M6)

- [x] **COPILOT-01**: Natural language takeoff assistant querying structured project SQLite database via `muse-wonder-1.0` with streaming SSE (`/api/copilot/stream`).
- [x] **SEG-01**: Room and equipment polygon segmentation via `sam-3.1` (`POST /api/segment`, mock-backed + contract-tested). Canvas one-click trigger is future work.
- [x] **UI-03**: 150 DPI hardware-accelerated canvas viewer with synchronized page navigation and highlighted evidence.
- [x] **VER-01**: Backend suite (39 tests) + frontend suite (25 tests) green; `ruff check src/ tests/ scripts/`, `mypy` (configured scope in `pyproject.toml`, 12 files — not `mypy src/`), `tsc`, `eslint`, sanitizer audit clean. Verified 2026-10-30 in Round-3 audit (`docs/AUDIT-2026-10-30-prompt-compliance.md` §13). Note: TestClient/async tests need loopback sockets and cannot run in fully locked-down sandboxes.
- [ ] **VER-02**: 3-minute video walkthrough demonstrating live takeoff workflow.
- [ ] **SUBMIT**: Remote git push, final leak audit verification, and submission to Cerebral Valley.
