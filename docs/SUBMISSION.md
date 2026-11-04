# BlueTraceAI — Hackathon Submission Story

> **Meta Global AI Developer Hackathon (2026)**  
> **Track:** Indie Developer & Startup Track — *Push the Frontier*  
> **Author:** Wesly John  
> **Interactive Showcase:** [weslyjohn1307.github.io/BlueTrace](https://weslyjohn1307.github.io/BlueTrace/)  
> **Repository:** [github.com/weslyjohn1307/BlueTrace](https://github.com/weslyjohn1307/BlueTrace)  
> **Demo Film:** `film/out/bluetrace-film-master.mp4` (Included in repository release assets)

---

## 1. The Problem That Kept Us Up

In commercial building construction, estimating is where projects are won or lost.

Every Monday morning, mechanical, electrical, and plumbing (MEP) subcontractors receive massive drawing sets—fifty to two hundred large-format architectural sheets ($36" \times 48"$, Arch E). By Thursday afternoon, they must submit a hard, binding dollar bid.

To calculate that bid, human estimators spend thirty to forty grueling hours hunched over digitizer tablets or clicking point-by-point through desktop viewer software. They trace thousands of linear feet of sheet metal ductwork, count every fire damper and VAV box, and cross-reference tiny schedules tucked into drawing corners.

The economic reality is unforgiving:
- Commercial subcontractor net margins hover between **3% and 5%**.
- A **15% error** in ductwork metal tonnage or linear footage doesn't just cut into profits—it can bankrupt a family-owned trade contractor on a single job.
- Conversely, overestimating out of fear means bidding too high and losing the job to a competitor.

When we set out to build BlueTraceAI, we asked ourselves: *Why hasn't artificial intelligence solved this yet?*

---

## 2. The Trap: Why Generic AI Fails on Blueprints

The standard instinct in modern AI development is simple: take the blueprint PDF, pass it into a multimodal Vision-Language Model (VLM), and ask: *"How many linear feet of supply duct are on this sheet?"*

Every team that tries this approach hits a brick wall. Here is why:

### 1. Resolution Collapse
Large-format blueprints are dense engineering schematics containing thousands of vector paths and micro-typography annotations ($6\text{ pt}$ labels like `30x16 SA-A`). Downsampling a $5000 \times 3500\text{ px}$ drawing to fit a standard model context window ($1024 \times 1024\text{ px}$) destroys the drawing. Line weights blur together, text callouts turn into illegible noise, and parallel duct walls become solid blobs.

### 2. Probabilistic Geometry
Foundation models are probabilistic sequence predictors. They are brilliant at semantic understanding, pattern recognition, and synthesis, but they possess **no native Euclidean coordinate space**. When an LLM says a duct is *"approximately 42 feet long,"* it isn't measuring; it is guessing what a plausible duct length sounds like. In construction bidding, an ungrounded guess is worse than useless—it is dangerous.

### 3. Scale Chaos & Multi-Scale Sheets
Blueprints rarely have one uniform scale. A single mechanical sheet frequently features an overall floor plan at $1/8" = 1'-0"$, an enlarged mechanical room plan at $1/4" = 1'-0"$, and equipment connection details at $1/2" = 1'-0"$. A vision model processing the whole image cannot reliably maintain distinct coordinate transformations across different viewports.

---

## 3. The Core Breakthrough: The Hybrid Division of Labor

We realized that to solve takeoff, we had to reject the idea of an "all-in-one" black box. Instead, we established an absolute architectural boundary:

> **Vectors measure. Models interpret. Engineers approve.**

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HYBRID DIVISION OF LABOR                        │
├───────────────────────────────────┬────────────────────────────────────┤
│   DETERMINISTIC LOCAL PYTHON      │      META FOUNDATION MODELS        │
│   (Geometry, Math, Persistence)   │   (Perception, Reading, Reasoning) │
├───────────────────────────────────┼────────────────────────────────────┤
│ • PyMuPDF vector path extraction  │ • Muse Spark 1.3: Point-of-need    │
│ • Shapely parallel wall pairing   │   micro-OCR & legend exemplars     │
│ • NetworkX centerline & T-junction│ • SAM 3.1: Equipment polygon       │
│ • Validated scale math conversion │   boundary segmentation            │
│ • SQLite WAL transactional ledger │ • Muse Wonder 1.0: Copilot         │
│ • Fail-closed scale validator     │   reasoning over SQLite evidence   │
└───────────────────────────────────┴────────────────────────────────────┘
```

### Local Deterministic Engine (The Precision Ruler)
- **PyMuPDF (`src/core_vector/extractor.py`):** Extracts pristine PDF vector linework directly from the document graphics state without rasterization loss.
- **Shapely (`src/core_vector/centerline.py`):** Identifies pairs of parallel stroke segments, verifies aspect ratios and duct corridor widths, and computes mathematical medial-axis centerlines.
- **NetworkX (`src/core_vector/continuity.py`):** Splices continuous runs, resolves elbows and T-junctions, and builds an accurate topological graph of the ventilation network.
- **Scale Math:** PDF point lengths ($72\text{ pt/in}$, $864\text{ pt/ft}$) convert to physical linear feet only through an explicit, verified scale ratio:
  $$L_{\text{ft}} = \frac{L_{\text{pt}} \times S_{\text{ratio}}}{864}$$

### Meta Foundation Models (The Intelligent Eyes & Brain)
- **Muse Spark 1.3 (`src/meta_services/client.py`):** Solves the resolution problem through **point-of-need cropping**. Instead of downsampling the sheet, the frontend sends high-resolution $150\text{ DPI}$ crops ($300 \times 300\text{ px}$) around the cursor. Spark reads duct dimensions (`30x16`), airflow designations (`SA-A`), and CFM callouts with sub-350ms latency.
- **SAM 3.1 (`src/meta_services/client.py`):** Provides instant boundary segmentation for complex, non-orthogonal mechanical equipment (chillers, air handling units, cooling towers) where raw vector strokes alone do not form closed primitives.
- **Muse Wonder 1.0 (`src/agents/copilot_judge.py`):** Acts as the **Takeoff Copilot-Judge**. Wonder does not make up facts. When an estimator asks *"What is the total footage of low-pressure supply duct on Level 2?"*, Wonder executes read-only SQL queries against the local SQLite ledger, verifies the data, and returns answers with clickable coordinate citations (`ev:M-201:duct:1420:850`) that smoothly pan and zoom the drawing canvas.

---

## 4. Architectural Invariants: The Guardrails

To build trust with seasoned construction estimators, we baked strict engineering invariants into the system core:

### 1. Fail-Closed Scale Invariant
If a drawing has no detected scale, an uncalibrated scale bar, or conflicting scale notes between details, the system flags `scale_ratio = 0.0` and `review_required = True`.
- Detected linework is drawn on the canvas so the estimator can see the geometry.
- But **linear footage remains 0.00 ft**.
- The API returns `HTTP 409 Conflict` if anyone attempts to accept uncalibrated items into the ledger before performing two-point calibration (`PATCH /api/sheets/{sheet_id}/calibration`).
- **We never guess a scale.**

### 2. Estimator Sovereignty (Human-in-the-Loop)
AI should accelerate the professional, not replace their judgment.
- Every proposed measurement enters the SQLite database with status `SUGGESTED`.
- The estimator reviews items on the canvas with single-keystroke shortcuts (`A` to accept, `R` to reject, `C` to correct).
- Every decision is recorded immutably in `review_events` with structured reason codes.
- The commercial bid export contains only verified quantities.

### 3. Graceful Offline Abstention
If `MODEL_API_KEY` is not present, the system does not crash or simulate fake responses. The local vector engine, scale calibration, canvas navigation, ledger state machine, and CSV exports continue running 100% locally. Model-backed features return clearly labeled offline states (`mock = True`, `confidence = 0.0`) or abstain fail-closed.

---

## 5. What We Built During the Hackathon

Over the course of the hackathon, we built and polished a full-stack, desktop-grade workstation:

1. **Hardware-Accelerated 150 DPI Drawing Workstation (`frontend/`):**
   - Built with React 19, TypeScript, and Tailwind CSS.
   - Smooth 2D affine pan, zoom, and rotate navigation across multi-page PDF sets.
   - Virtualized sheet filmstrip supporting packages up to 100+ pages with an in-memory budget.
   - Layer decomposition controls to isolate HVAC (Division 23), Electrical (26), Plumbing (22), and Architectural backgrounds.
   - Interactive two-point scale calibration tool.

2. **Seven-Agent Product Pipeline (`src/agents/`):**
   - `00 Orchestrator`: Multi-sheet router and trace logger (`src/agents/orchestrator.py`).
   - `01 Sheet Scanner`: Title block parser and scale validator (`src/meta_services/sheet_scanner.py`).
   - `02 Symbol Finder (L1)`: Legend exemplar parser and spatial tile scanner (`src/agents/finder_l1.py`).
   - `03 Vector Tracer (L2)`: Native PDF vector extractor and corridor splicer (`src/agents/tracer_l2.py`).
   - `04 Schedule Reconciler`: Equipment tag vs. plan count matcher (`src/agents/schedule_reconciler.py`).
   - `05 Watchdog QA`: Rule-based anomaly checker and persistent QA annotation generator (`src/agents/watchdog_qa.py`).
   - `06 Copilot Judge`: Evidence-grounded SQLite query engine and citation resolver (`src/agents/copilot_judge.py`).

3. **Standalone Single-Port Launcher & Desktop Packaging:**
   - Single-command launcher (`python scripts/start_standalone.py`) that serves the compiled React 19 frontend and FastAPI backend on one local port (`8000`).
   - Tauri v2 + PyInstaller desktop sidecar configuration with Windows Job Object process management (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) for zero-leak process termination.

4. **Master Demo Film & Remotion Suite (`film/`):**
   - High-fidelity Remotion project capturing the real UI, live hover interactions, legend reconnaissance, copilot queries, and takeoff export at 1080p 60fps.

---

## 6. Real-World Evaluation & Benchmarks

We validated BlueTraceAI against real commercial HVAC drawing sets (`fixtures/mechanical/hvac_plan_level2.pdf`):

| Evaluation Target | Baseline / Ground Truth | BlueTraceAI Measured | Accuracy / Performance |
|---|---|---|---|
| **Centerline Runs** | 329 ground-truth runs | **329 runs extracted** | **0.00% count error** (100% topological recall) |
| **Calibrated Length** | 636.62 ft ($1/8" = 1'-0"$) | **636.62 ft** | Exact mathematical match |
| **Uncalibrated Scale Safety** | Fail-closed expectation | **0.00 ft (Flagged)** | 100% fail-closed compliance |
| **Geometry SHA-256 Cache** | Cold run: 23.47 seconds | **Warm run: 1.35 ms** | Instant repeat-load performance |
| **Coordinate Tiling Drift** | $\le 0.50\text{ pt}$ tolerance | **0.000000 pt drift** | Zero floating-point drift |
| **Schedule vs Plan QA** | 4 seeded discrepancies | **100% recall** (1 match, 1 ghost pin, 2 flags) | Zero missed anomalies |
| **Sanitizer Anti-Leak Audit** | Zero competitor tokens | **[PASS] 0 tokens** | Strict copyright compliance |

---

## 7. Submission Readiness Checklist

Use this checklist to verify the submission and repository health:

- [x] **Core Architecture Documented:** ADR-001, ADR-002, ADR-003 in `docs/adr/`.
- [x] **Hybrid Division of Labor Enforced:** Deterministic vector geometry separated from Meta model inference.
- [x] **Fail-Closed Scale Invariant Active:** Unverified scale blocks ledger confirmation.
- [x] **Standalone Single-Port Launcher Operational:** `python scripts/start_standalone.py`.
- [x] **Zero Secrets in Repository:** Verified via `.env.example` and git history.
- [x] **Sanitizer Anti-Leak Audit Passed:** `python scripts/sanitize_import.py --audit`.
- [x] **Interactive GitHub Pages Showcase Live:** [weslyjohn1307.github.io/BlueTrace](https://weslyjohn1307.github.io/BlueTrace/).
- [x] **Master Video Film Rendered:** `film/out/bluetrace-film-master.mp4`.
- [x] **High-Res Visual Assets Embedded:** Official brand SVGs, vector architecture diagram, and 1080p UI screenshots in `README.md` and `docs/assets/`.

---

## 8. Closing Reflection

BlueTraceAI was born from a deep respect for the trades and a refusal to settle for generative illusions. 

Artificial intelligence in engineering should not be a black box that asks users for blind faith. It should be a precision instrument: a magnifying glass that reads microscopic notes in a millisecond, a tireless draftsman that traces vector paths with mathematical perfection, and an infallible auditor that checks every number against the ledger.

By pairing Meta's frontier models with deterministic vector algorithms and human-in-the-loop oversight, BlueTraceAI gives estimators their time back—without ever gambling their company's bottom line.
