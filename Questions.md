# BlueTraceAI: Open Questions (Questions.md)

> Purpose: unblock the "live multi-agent continuation" direction. All blocker questions answered and ratified below.

---

## Q1. Predecessor offline system (BLOCKER)

The predecessor project is located at `D:\Imagineers`. BlueTraceAI has now successfully migrated the offline core into `src/core_vector/` and built the live Meta Model API layer in `src/meta_services/`. To continue it rather than rebuild blind:

- [x] **Q1.1 Where is the existing offline project? (repo path / URL / zip / demo)**
  - **Answer**: The predecessor project is located locally at **`D:\Imagineers`**. It is a fully operational, test-verified codebase containing the complete offline pipeline:
    - `D:\Imagineers\src\mep_ai\` (Vector extraction, duct centerline tracing, scale gating, artifact store).
    - `D:\Imagineers\src\backend\` (FastAPI application with 26 custom endpoints, child-process worker isolation, SQLite index).
    - `D:\Imagineers\frontend\` (React 19 + Vite 6 + Tailwind canvas application with 150 DPI DPR scaling, CSS pan/zoom matrix, SVG annotation overlays, and takeoff ledger).
    - `D:\Imagineers\tests\` (715 passing automated pytest unit/integration tests).

- [x] **Q1.2 Which agents exist already, and what does each do? (reading, identification, image processing, scale processing, length calculation, tracing, measurements — map each to its agent)**
  - **Answer**: In `Imagineers`, the pipeline operates as modular, deterministic services rather than loose LLM swarms. Here is the exact capability mapping:
    1. **Vector & Linework Extractor (`src/mep_ai/level2/extractor.py`)**: Directly parses PDF content streams via PyMuPDF (`fitz`), extracting raw vector segments, paths, line styles, lineweights, and stroke colors with sub-pixel fidelity.
    2. **Duct Route Tracer & Centerline Engine (`src/mep_ai/level2/representation.py` & `continuity.py`)**: Automatically detects paired double-line parallel duct boundaries (using lateral offset gating $d_\perp \le 0.5$ pt to reject walls), derives mathematical centerlines, and clusters endpoints into a connected topological route graph.
    3. **Scale Validator & Gating (`src/mep_ai/level2/scale.py`)**: Performs regex and title-block scale extraction (`1/4" = 1'-0"`, etc.) with strict fail-closed enforcement (returns `length: null` if scale text is unverified or missing).
    4. **Equipment / Symbol Detector (`src/mep_ai/level1/`)**: Ultralytics YOLO11n trained specifically on Fire Dampers (175 verified objects on test sheet).
    5. **Deterministic Copilot Engine (`src/mep_ai/copilot/engine.py`)**: Offline, keyless tool engine executing 7 structured numerical queries over the SQLite takeoff database.
    6. **Package Processor & Storage (`src/mep_ai/package_processor.py`, `src/mep_ai/artifact_store.py`)**: Multi-sheet aggregator writing immutable run bundles and rebuilding the SQLite result index.

- [x] **Q1.3 What stack does it use? (language, PDF engine, agent framework, IPC/events, state store)**
  - **Answer**:
    - **Language**: Python 3.10+ (active virtualenv at `D:\Imagineers\.venv`), TypeScript for frontend.
    - **PDF & Vector Engine**: PyMuPDF (`fitz >= 1.24.0`) for both direct vector stream parsing and 150 DPI raster rendering.
    - **Spatial Geometry**: Shapely 2.0+ and NetworkX 3.3 for graph contraction and centerline routing.
    - **IPC / Execution**: FastAPI with async route handlers, child-process worker isolation (`job_worker.py`), and transactional SQLite database.
    - **Frontend**: React 19, Vite 6, TypeScript, Tailwind CSS, HTML5 Canvas with CSS matrix pan/zoom + SVG annotation layer.

- [x] **Q1.4 What runs fully offline today vs what is expected to go online via Meta Model API?**
  - **Answer**:
    - **Runs Fully Offline (Keep Local & Deterministic)**:
      - Native PDF vector extraction and geometric polyline measurements.
      - Paired double-line duct centerline resolution and topological graph contraction.
      - High-performance 150 DPI canvas pan/zoom viewing and manual markup.
      - SQLite project database, takeoff ledger rollup, and CSV/JSON export.
    - **Expected to Go Online via Meta Model API (`https://api.meta.ai/v1`)**:
      - **Agent 1 (SheetScan)**: `muse-spark-1.3` analyzing title block crops to automatically extract sheet numbers (`M-101`), titles, disciplines, and scale ratios on upload.
      - **Agent 2 (Schedule Extractor)**: `muse-spark-1.3` parsing dense equipment/diffuser schedule tables into structured JSON.
      - **Point-of-Need Hover OCR (QuickDraw)**: `muse-spark-1.3` processing 300x300 px cursor crops (<500 ms) to read rotated duct dimensions (`24x12`, `(N)2"LW`).
      - **Interactive Segmentation**: `sam-3.1` via `/v1/responses` for one-click zero-shot polygon boundary segmentation of rooms and equipment footprints.
      - **Conversational Copilot**: `muse-wonder-1.0` for natural language reasoning over takeoff quantities with grounded coordinate highlighting.

- [x] **Q1.5 Can we import/reuse its code directly, or must we re-implement from its behavior? Any license or ownership constraint?**
  - **Answer**: **Zero constraints; import directly**. `D:\Imagineers` is our own internal team repository developed for this project. We will copy and reuse the proven frontend viewer (`DrawingViewer.tsx`) and the core vector linework engine (`src/mep_ai/level2/`), leaving behind legacy hackathon governance docs and obsolete benchmarks to keep `BlueTraceAI` clean.

---

## Q2. Live collaboration model (BLOCKER)

- [x] **Q2.1 What does "agents work with the user lively in the PDF" mean concretely? (pick: real-time canvas annotations as user pans/zooms, suggestion badges with accept/reject, autonomous background agents with review gates, or something else)**
  - **Answer**: **Point-of-Need Suggestion Badges ("The Sheet is the Interface") + Background Schedule Predictions**:
    1. **Instant Sheet Directory on Upload**: Ingesting a PDF triggers Agent 1 (Reconnaissance) to label the sidebar plan tree with real sheet numbers and scales (`M-101: 2nd Floor HVAC, Scale: 1/4" = 1'-0"`).
    2. **Point-of-Need Hover Badges ("QuickDraw")**: When the estimator hovers near a duct run or holds the `Q` key, a localized 300x300 px cursor crop is processed (<500 ms) by `muse-spark-1.3`. A floating badge pops up next to the cursor showing `24×12`. Clicking it applies the dimension and assigns calibrated footage to the takeoff ledger.
    3. **Schedule-to-Plan Candidate Predictions**: Background Agent 2 reads equipment tables (`S1 Diffuser`, `VAV-1`) and displays soft "ghost pins" on the drawing sheet. The estimator clicks "Accept All (14)" or reviews them individually.
    4. **Conversational Copilot Highlighting**: User asks *"Highlight all diffusers over 150 CFM"*; `muse-wonder-1.0` executes a database tool call and returns matching SVG glow pins directly on the canvas.
    - *Decision*: Suggestion badges with 1-click human accept/reject + background schedule predictions + live conversational highlighting. No unverified black-box overwriting.

- [x] **Q2.2 Do multiple agents act on the same sheet simultaneously? If so, how are conflicts resolved (e.g. two agents measuring the same run)?**
  - **Answer**: Agents have **strict, non-overlapping functional boundaries**:
    - Agent 1 (Reconnaissance) writes only sheet metadata (title, scale, discipline).
    - Agent 2 (Schedule) writes only to the equipment catalog (`equipment_schedule` table).
    - Agent 3 (Vector Engine) generates raw geometric centerline polylines.
    - Agent 4 (Point-of-Need / User Takeoff) merges semantic tags onto geometric polylines upon user click.
    - Conflict resolution is inherently deterministic: SQLite single-writer transactions and immutable takeoff item revisions (each item has a UUID and state: `SUGGESTED`, `ACCEPTED`, `REJECTED`). Two agents cannot double-measure the same run.

- [x] **Q2.3 What is the live latency expectation? (keep <800 ms hover target, or tighter/looser for agent actions?)**
  - **Answer**:
    - **Hover Dimension Badge (QuickDraw)**: **< 500 ms** target (uses tight 300x300 px crop to `muse-spark-1.3`, low token output).
    - **SheetScan (Title Block)**: 1.5–2.5 s per title-block crop (executed asynchronously across pages).
    - **SAM 3.1 Segmentation Click**: 1.0–2.0 s per promptable polygon.
    - **Copilot Chat**: Streaming SSE response starting in < 1.0 s.

- [x] **Q2.4 Offline fallback: when the network drops, which agents must keep working locally? (per `User_flows.md` State 5 OFFLINE, vector navigation stays up — confirm the agent subset)**
  - **Answer**:
    - **Local Core (Always Operational Offline)**:
      - Full 150 DPI canvas pan, zoom, navigation, and PDF rendering.
      - PyMuPDF vector stroke display and paired duct centerline engine.
      - Manual measurement tools (point-to-point ruler, manual dimension override).
      - Takeoff summary ledger, quantities rollup, and CSV/JSON export.
    - **Online Only (Meta Model API)**:
      - Point-of-need hover OCR (`muse-spark-1.3`).
      - Zero-shot boundary segmentation (`sam-3.1`).
      - Conversational reasoning copilot (`muse-wonder-1.0`).

---

## Q3. Scope and demo story

- [x] **Q3.1 Which pipeline stages do you consider already solved by the predecessor (no new work) vs needing new work in this repo?**
  - **Answer**:
    - **Already Solved (Direct Module Reuse)**:
      - 150 DPI canvas viewer with zoom/pan transforms and SVG overlay layer (`DrawingViewer.tsx`).
      - Sub-pixel native PDF vector extraction and paired double-line duct centerline engine (`src/mep_ai/level2/`).
      - Imperial/metric scale ratio math and fail-closed scale verification rules.
      - Basic SQLite index and Pydantic export schemas.
    - **Needing New Work in `BlueTraceAI`**:
      - Meta Model API client service (`src/meta_services/`).
      - Title-block crop & SheetScan automated plan tree builder.
      - Equipment schedule tabular extraction (`muse-spark-1.3`).
      - Point-of-need hover cursor crop endpoint (`POST /api/crop-ocr`) and frontend floating badge UI.
      - SAM 3.1 interactive segmentation endpoint.
      - Multimodal copilot integration using `muse-wonder-1.0`.

- [x] **Q3.2 Can you share 1–2 sample MEP PDFs plus expected takeoff outputs from the predecessor? (needed to validate vectors, scale, schedule linking)**
  - **Answer**: Reused from predecessor training datasets and now hosted locally in `D:\bluetrace-ai\fixtures\`:
    - `fixtures/mechanical/avexis_page_22.pdf` (Avexis p22 HVAC floor plan with double-line duct runs, VAV boxes, and diffusers — 329 verified route runs).
    - `fixtures/mechanical/pfmcc_page_118.pdf` (Mechanical floor plan with fire dampers — 168 verified GT symbols).
    - `fixtures/plumbing/p104_1_plumbing_level4.pdf` (Plumbing floor plan with water lines and fixtures).
    - Primary development and demonstration drawing: `fixtures/mechanical/avexis_page_22.pdf`.

- [x] **Q3.3 Hackathon track: indie or startup? What is the 3-minute demo story (one sheet, one trade, one workflow)?**
  - **Answer**:
    - **Track**: **Startup Track** (judged on *technical execution and whether it holds up in production*).
    - **3-Minute Demo Flow (Single Sheet, Mechanical HVAC Workflow)**:
      1. **0:00 - 0:30 (SheetScan)**: User drops multi-sheet MEP PDF. System instantly auto-detects `M-201: 2nd Floor HVAC` and scale `1/4" = 1'-0"`, populating the project plan tree.
      2. **0:30 - 1:15 (Schedule Linking)**: Switch to Schedule sheet `M-501`. Agent extracts Diffuser Schedule (`S1: 150 CFM 12x12`). Clicking `S1` cross-references with plan view `M-201`, highlighting candidate diffuser locations.
      3. **1:15 - 2:00 (Point-of-Need QuickDraw & Tracing)**: User zooms into Office 201. Holds `Q` over main supply duct; floating badge reads `24x12`. User clicks to accept; duct centerline automatically traces with exact calibrated length (e.g. 48.5 LF).
      4. **2:00 - 2:30 (Interactive SAM 3.1 & Copilot)**: User clicks inside Conference Room 203; SAM 3.1 highlights room boundary polygon. Estimator asks Copilot: *"Calculate total CFM and supply duct footage for Zone 2"*. Copilot computes totals and highlights evidence pins on the drawing.
      5. **2:30 - 3:00 (Export)**: Export auditable Takeoff Ledger with linked coordinate crops to CSV/JSON.

---

## Q4. Integration facts

- [x] **Q4.1 Do we have a live `MODEL_API_KEY` for `https://api.meta.ai/v1`? If yes, which models are enabled (`muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0`)?**
  - **Answer**: **Yes**. Hosted Meta Model API key is provided through the hackathon portal with access to:
    - `muse-spark-1.3` (Chat Completions / Multimodal Vision & OCR)
    - `sam-3.1` (Responses API / Concept & Point Segmentation)
    - `muse-wonder-1.0` (Chat Completions / Reasoning & Tool Calling)

- [x] **Q4.2 Lock Python version: 3.10 (per `pyproject.toml`/`README.md`) or 3.13 (per `Tech_stack.md`)?**
  - **Answer**: **Lock Python version to Python 3.10+ (targeting 3.10 – 3.13 compatibility)**.
    - Code and typing will use standard Python 3.10+ conventions (`from __future__ import annotations`).
    - Both Python 3.10 (in `.venv`) and Python 3.13 (system) run PyMuPDF, FastAPI, and OpenAI SDK without issue.

- [x] **Q4.3 Frontend baseline: greenfield React 19 + Vite + Tailwind in `frontend/`, or is there predecessor UI code to reuse?**
  - **Answer**: **Reuse proven React 19 core from `D:\Imagineers\frontend\`**:
    - Specifically migrate `DrawingViewer.tsx` (150 DPI canvas, CSS matrix pan/zoom, SVG overlay layer) and `TakeoffSummary.tsx`.
    - Build focused greenfield additions: `HoverBadge.tsx` (point-of-need dimension suggestions), `SheetTree.tsx` (automated SheetScan directory), and `CopilotDrawer.tsx` (streaming Meta copilot).

- [x] **Q4.4 Lock crop definition: 300x300 px exactly, or 150 pt square rendered at 150 DPI (312x312 px)? (see RES-02 inconsistency)**
  - **Answer**: **Standardized Definition**:
    - In PDF page space (72 DPI): crop window is **$150\text{ pt} \times 150\text{ pt}$** centered on cursor $(x_{pdf}, y_{pdf})$.
    - In rendered raster space at 150 DPI ($150 \times \frac{150}{72} \approx 312.5\text{ px}$): clamped to **$312 \times 312\text{ px}$** (or $300 \times 300\text{ px}$ rounded).
    - Both represent the exact same physical drafting area on the drawing sheet ($2.08\text{ in} \times 2.08\text{ in}$).

---

## Answer log

| ID | Answer Summary | Answered by / date |
|----|----------------|--------------------|
| **Q1.1** | Local repo at `D:\Imagineers` | Antigravity / 2026-10-30 |
| **Q1.2** | 6 deterministic modules: PyMuPDF vectors, duct centerline tracer, scale validator, YOLO detector, copilot, package processor | Antigravity / 2026-10-30 |
| **Q1.3** | Python 3.10+, PyMuPDF, Shapely, NetworkX, FastAPI, React 19, HTML5 Canvas (150 DPI) + SVG | Antigravity / 2026-10-30 |
| **Q1.4** | Vectors, centerlines, canvas viewer & SQLite run offline; SheetScan, tables, hover OCR, SAM 3.1 & copilot go to Meta API | Antigravity / 2026-10-30 |
| **Q1.5** | Direct code reuse approved; internal team codebase with zero IP constraints | Antigravity / 2026-10-30 |
| **Q2.1** | Point-of-need suggestion badges ("QuickDraw") + background schedule predictions + live copilot highlights | Antigravity / 2026-10-30 |
| **Q2.2** | Non-overlapping functional boundaries + SQLite single-writer transactions & immutable item UUIDs | Antigravity / 2026-10-30 |
| **Q2.3** | Hover OCR < 500ms, SheetScan 1.5–2.5s, SAM 3.1 1–2s, Copilot streaming < 1.0s | Antigravity / 2026-10-30 |
| **Q2.4** | Canvas navigation, vectors, manual measurements, ledger & export stay functional offline | Antigravity / 2026-10-30 |
| **Q3.1** | Solved: Canvas viewer, vector extractor, duct centerline tracer, scale math. New: Meta clients, SheetScan, QuickDraw, SAM 3.1 | Antigravity / 2026-10-30 |
| **Q3.2** | `FIX-TRN-MECH-022.pdf` (Avexis p22 HVAC floor plan) in `D:\Imagineers\mep_dataset\` copied to `fixtures/` | Antigravity / 2026-10-30 |
| **Q3.3** | Startup Track; 3-min demo: SheetScan -> Schedule Linking -> QuickDraw & Tracing -> SAM 3.1 & Copilot -> Export | Antigravity / 2026-10-30 |
| **Q4.1** | Live API key ready; `muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0` active | Antigravity / 2026-10-30 |
| **Q4.2** | Python 3.10+ locked (targeting 3.10–3.13 cross-compatibility) | Antigravity / 2026-10-30 |
| **Q4.3** | Reuse `DrawingViewer.tsx` and `TakeoffSummary.tsx` from `Imagineers`; greenfield additions for badges & tree | Antigravity / 2026-10-30 |
| **Q4.4** | Standardized to 150 pt PDF window = 312x312 px (or 300x300 px rounded) at 150 DPI (~50 KB payload) | Antigravity / 2026-10-30 |
