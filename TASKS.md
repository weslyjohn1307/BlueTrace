# BlueTraceAI: Task Tracking Matrix

## Phase 1: Research & Specifications (In Progress)

- [ ] **RES-01**: Meta Model API Interface Specifications (`docs/research/RES-01-META-MODEL-INTERFACES.md`)
  - Document exact payload formats for `muse-spark-1.3` (Chat Completions) and `sam-3.1` (Responses API).
- [ ] **RES-02**: Point-of-Need Viewport & Cursor Crop UX (`docs/research/RES-02-POINT-OF-NEED-UX.md`)
  - Define coordinate matrix transformations, crop bounding box calculation, and latency targets.
- [ ] **RES-03**: Schedule Table Extraction & Entity Linking (`docs/research/RES-03-SCHEDULE-TO-PLAN-LINKING.md`)
  - Define JSON schema for equipment schedules and linking heuristics to floor plan symbols.

---

## Phase 2: Environment & Core Setup

- [ ] **ENV-01**: Setup Python `.venv` with `openai`, `fastapi`, `pymupdf`, `uvicorn`, `pydantic`.
- [ ] **ENV-02**: Setup Node.js frontend workspace with React 19, Vite, and Tailwind CSS.
- [ ] **ENV-03**: Create verified Meta Model API test client (`src/meta_services/client.py`).

---

## Phase 3: Module Migration & Reusability

- [ ] **MIG-01**: Migrate React 150 DPI canvas viewer with hardware-accelerated pan/zoom.
- [ ] **MIG-02**: Migrate local PyMuPDF vector extraction and paired duct centerline engine.
- [ ] **MIG-03**: Implement clean FastAPI application skeleton and SQLite store.

---

## Phase 4: Feature Implementation

- [ ] **FEAT-01**: SheetScan Agent (`src/meta_services/sheet_scanner.py`).
- [ ] **FEAT-02**: Point-of-Need Hover OCR (`src/meta_services/hover_ocr.py` + `frontend/src/components/HoverBadge.tsx`).
- [ ] **FEAT-03**: Equipment Schedule Parser (`src/meta_services/schedule_parser.py`).
- [ ] **FEAT-04**: SAM 3.1 Interactive Boundary Segmentation (`src/meta_services/sam_segmenter.py`).
- [ ] **FEAT-05**: Conversational Estimating Copilot (`src/meta_services/copilot.py`).

---

## Phase 5: Verification & Packaging

- [ ] **VER-01**: Unit test suite passing across all vector and API parsing functions.
- [ ] **VER-02**: Record 3-minute video walkthrough demonstrating live takeoff workflow.
- [ ] **VER-03**: Final repository freeze and submission.
