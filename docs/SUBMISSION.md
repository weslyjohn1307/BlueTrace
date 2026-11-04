# BlueTraceAI — Hackathon Submission Story

> **Meta Global AI Developer Hackathon (2026)**  
> **Track:** Indie Developer Track — *Push the Frontier*  
> **Author:** Wesly John  
> **Interactive Concept Showcase:** [weslyjohn1307.github.io/BlueTrace](https://weslyjohn1307.github.io/BlueTrace/)  
> **Repository:** [github.com/weslyjohn1307/BlueTrace](https://github.com/weslyjohn1307/BlueTrace)  
> **Master Demo Film (X Post):** [x.com/Weslyjohn1307/status/2118101699739140558](https://x.com/Weslyjohn1307/status/2118101699739140558)  
> **Master Demo Film (GitHub Web Player):** [`docs/assets/BlueTraceAI_Demo.mp4`](https://github.com/weslyjohn1307/BlueTrace/blob/master/docs/assets/BlueTraceAI_Demo.mp4) (2:00 min • 1080p • Voiceover Narration)

---

## 1. The Reality of Commercial Construction Bidding

In commercial construction, estimating is where jobs are won or lost.

Every Monday morning, mechanical, electrical, and plumbing (MEP) subcontractors receive massive drawing sets: fifty to two hundred large-format architectural sheets ($36 \times 48\text{ in}$, Arch E). By Thursday afternoon, they must submit a hard, binding dollar bid.

To build that bid, an estimator spends thirty to forty hours clicking through desktop viewer software or measuring with digitizer tablets. They trace thousands of feet of sheet metal ductwork, count every fire damper, diffuser, and VAV box, and cross-reference tiny equipment schedules tucked into sheet corners.

The economics are unforgiving:
- Subcontractor net profit margins typically run between **3% and 5%**.
- A **15% undercount** in ductwork linear footage or sheet metal weight can wipe out all profit on a commercial job.
- Overestimating out of caution means pricing too high and losing the award to a competitor.

Commercial estimating demands precision, yet it remains one of the most tedious manual bottlenecks in the entire building industry.

---

## 2. Why Feeding Blueprints to Standard Multimodal LLMs Fails

When developers first approach this problem, their first instinct is understandable: take a high-resolution blueprint PDF, send it to a multimodal vision model, and ask: *"How many linear feet of supply duct are on this sheet?"*

Every team that tests this in production hits three fundamental walls:

### 1. Resolution Loss
Large-format blueprints are dense technical schematics with thousands of vector lines and tiny $6\text{ pt}$ text callouts (like `30x16 SA-A`). When an image is downscaled to fit standard model resolution limits (e.g. $1024 \times 1024\text{ px}$), the linework turns into noise. Parallel duct walls merge into single dark strokes, and dimensions become unreadable blur.

### 2. Coordinate Prediction vs. Euclidean Geometry
Foundation models predict plausible token sequences; they do not calculate physical space. When an LLM estimates that a duct is *"around 42 feet long,"* it is generating what a plausible answer sounds like based on training data. In construction bidding, an ungrounded guess is dangerous.

### 3. Mixed Scales Across the Same Page
Blueprints rarely use a single scale. A standard mechanical sheet often contains an overall floor plan at $1/8" = 1'-0"$, an enlarged mechanical room layout at $1/4" = 1'-0"$, and connection details at $1/2" = 1'-0"$. A vision model inspecting the whole sheet cannot maintain distinct coordinate transformations across different viewports without drifting.

---

## 3. The Architecture: Deterministic Math Meets Foundation Models

To solve blueprint takeoff reliably, we have to divide the work based on what computers and models each do best:

> **Vectors measure. Models read. The estimator approves.**

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HYBRID DIVISION OF LABOR                        │
├───────────────────────────────────┬────────────────────────────────────┤
│   DETERMINISTIC LOCAL PYTHON      │      META FOUNDATION MODELS        │
│   (Geometry, Math, Persistence)   │   (Perception, Reading, Reasoning) │
├───────────────────────────────────┼────────────────────────────────────┤
│ • PyMuPDF vector path extraction  │ • Muse Spark 1.3: Point-of-need    │
│ • Shapely parallel wall pairing   │   micro-OCR on 150 DPI crops       │
│ • NetworkX centerline continuity  │ • SAM 3.1: Equipment polygon       │
│ • Verified scale ratio conversion │   boundary segmentation            │
│ • SQLite WAL transactional ledger │ • Muse Wonder 1.0: Copilot         │
│ • Fail-closed scale validator     │   reasoning over SQLite evidence   │
└───────────────────────────────────┴────────────────────────────────────┘
```

### Deterministic Local Engine (Geometry & Math)
- **PyMuPDF (`src/core_vector/extractor.py`):** Extracts raw PDF vector strokes directly from the document graphics state without raster loss.
- **Shapely (`src/core_vector/centerline.py`):** Identifies pairs of parallel duct strokes, checks aspect ratios and corridor widths, and computes true medial-axis centerlines.
- **NetworkX (`src/core_vector/continuity.py`):** Connects duct runs through elbows and tees to build a clean topological graph of the network.
- **Scale Math:** Vector points ($72\text{ pt/in}$, $864\text{ pt/ft}$) convert to physical feet only through an explicit, verified scale ratio:
  $$L_{\text{ft}} = \frac{L_{\text{pt}} \times S_{\text{ratio}}}{864}$$

### Meta Foundation Models (Reading & Reasoning)
- **Muse Spark 1.3 (`src/meta_services/client.py`):** Solves the resolution issue through **point-of-need cropping**. Rather than compressing the whole sheet, the interface sends small, high-resolution 150 DPI crops ($300 \times 300\text{ px}$) around the cursor. Spark reads duct sizes (`30x16`), airflow tags (`SA-A`), and CFM callouts in under 350 milliseconds.
- **SAM 3.1 (`src/meta_services/client.py`):** Isolates boundaries for non-rectangular mechanical equipment (such as chillers, pumps, and air handling units) where raw CAD strokes do not form closed geometric shapes.
- **Muse Wonder 1.0 (`src/agents/copilot_judge.py`):** Serves as the **Takeoff Copilot**. Wonder does not guess quantities from memory. When an estimator asks *"What is the total footage of low-pressure supply duct on Level 2?"*, Wonder queries the local SQLite database, calculates the total from verified items, and returns answers with clickable coordinate citations (`ev:M-201:duct:1420:850`) that smoothly pan the drawing canvas to the exact run.

---

## 4. Engineering Guardrails for Estimator Trust

Experienced estimators will not trust a black box that asks for blind faith. We built three core safeguards into the foundation:

### 1. Fail-Closed Scale Rule
If a drawing lacks a scale, has an uncalibrated graphic bar, or contains conflicting scale callouts between details, the system sets `scale_ratio = 0.0` and flags `review_required = True`.
- Detected duct runs appear on screen so the estimator can see the geometry.
- But linear footage remains locked at **0.00 ft**.
- The API blocks item approval (`HTTP 409 Conflict`) until the estimator verifies scale using the interactive two-point calibration tool (`PATCH /api/sheets/{sheet_id}/calibration`).
- **The system never guesses a scale.**

### 2. Estimator Sovereignty
AI should speed up the estimator's work, not replace their professional judgment.
- Every detected run lands in the SQLite ledger with status `SUGGESTED`.
- The estimator reviews items on the canvas with single-keystroke shortcuts (`A` to accept, `R` to reject, `C` to correct).
- Every override is saved in an append-only `review_events` table with structured reason codes.
- The commercial bid export contains only verified quantities approved by the human.

### 3. Clean Offline Behavior
If `MODEL_API_KEY` is not present, the workstation does not break or return fake data. The local vector engine, scale calibration, canvas viewer, review state machine, and CSV exports continue operating 100% locally on your machine. Model-backed features return clearly labeled offline notices (`mock = True`, `review_required = True`) or safely abstain.

---

## 5. What Was Built During the Hackathon

Over the hackathon, we built and polished a full-stack, desktop-grade workstation:

1. **Hardware-Accelerated 150 DPI Canvas (`frontend/`):**
   - Built with React 19, TypeScript, and Tailwind CSS.
   - Smooth 2D affine pan, zoom, and rotate navigation across multi-page PDF sets.
   - Virtualized sheet filmstrip supporting drawing packages of 100+ pages.
   - Trade layer filters to isolate HVAC (Division 23), Electrical (26), Plumbing (22), and Architectural backgrounds.
   - Interactive two-point scale calibration tool with live coordinate verification.

2. **Seven-Agent Product Pipeline (`src/agents/`):**
   - `00 Orchestrator`: Routes sheets by category and tracks stage execution traces.
   - `01 Sheet Scanner`: Parses title blocks, tags disciplines, and validates scales.
   - `02 Symbol Finder (L1)`: Extracts legend symbols first, then scans sheets at 150 DPI using class-aware NMS.
   - `03 Vector Tracer (L2)`: Pulls PDF vector strokes, pairs parallel duct walls, and resolves tees.
   - `04 Schedule Reconciler`: Compares schedule equipment counts against plan tags to flag unplaced units with ghost pins.
   - `05 Watchdog QA`: Checks for uncalibrated scales, count mismatches, and unreviewed runs.
   - `06 Copilot Judge`: Executes read-only SQL queries against the ledger and cites verified drawing coordinates.

3. **Standalone Single-Port Launcher (`scripts/start_standalone.py`):**
   - Single-command launcher serving both the compiled React 19 UI and the FastAPI backend on one local port (`8000`).
   - Clean shutdown with Windows Job Object process management.

4. **Master Demonstration Film (`docs/assets/BlueTraceAI_Demo.mp4`):**
   - High-definition 1080p walkthrough capturing the live CAD canvas, QuickDraw hover dimensioning, legend reconnaissance, grounded copilot queries, and takeoff export. Available on [X](https://x.com/Weslyjohn1307/status/2118101699739140558) and in the [GitHub web video player](https://github.com/weslyjohn1307/BlueTrace/blob/master/docs/assets/BlueTraceAI_Demo.mp4).

---

## 6. Real-World Drawing Benchmarks & Reproducibility

We tested BlueTraceAI against a real commercial mechanical drawing set included directly in the repository (`fixtures/mechanical/hvac_plan_level2.pdf`):

| Evaluation Target | Ground Truth Baseline | BlueTraceAI Measured | Result |
|---|---|---|---|
| **Centerline Runs** | 329 ground-truth runs | **329 runs extracted** | **0.00% count error** (100% topological recall) |
| **Calibrated Length** | 636.62 ft ($1/8" = 1'-0"$) | **636.62 ft** | Exact mathematical match |
| **Uncalibrated Scale Rule** | Fail-closed expectation | **0.00 ft (Flagged)** | 100% fail-closed compliance |
| **Geometry SHA-256 Cache** | Cold run: 23.47 seconds | **Warm run: 1.35 ms** | Instant repeat-load performance |
| **Coordinate Tiling Drift** | $\le 0.50\text{ pt}$ tolerance | **0.000000 pt drift** | Zero floating-point drift |
| **Schedule vs Plan QA** | 4 seeded discrepancies | **100% recall** (1 match, 1 ghost pin, 2 flags) | Zero missed anomalies |
| **Anti-Leak Audit** | Zero competitor tokens | **[PASS] 0 tokens** | Strict copyright compliance |

---

## 7. How to Test and Experience the Project

You can evaluate BlueTraceAI through three straightforward paths:

### 1. Watch the 2-Minute Master Demonstration Film
Watch the high-definition 1080p video showing the 150 DPI CAD workstation, QuickDraw hover reading, legend extraction, copilot questions, and takeoff export:  
- 🐦 **Watch on X:** [x.com/Weslyjohn1307/status/2118101699739140558](https://x.com/Weslyjohn1307/status/2118101699739140558)  
- 🎬 **Watch on GitHub (Web Player):** [`docs/assets/BlueTraceAI_Demo.mp4`](https://github.com/weslyjohn1307/BlueTrace/blob/master/docs/assets/BlueTraceAI_Demo.mp4)

### 2. Try the Interactive Web Showcase (In-Browser)
Explore the visual concepts—layer decomposition, scale calibration, and schedule reconciliation—directly in your browser without local installation:  
👉 **[weslyjohn1307.github.io/BlueTrace](https://weslyjohn1307.github.io/BlueTrace/)**

### 3. Run the Workstation Locally
Run the complete FastAPI backend and React 19 CAD workstation locally on a single port:
```powershell
# Clone and set up virtual environment
git clone https://github.com/weslyjohn1307/BlueTrace.git
cd BlueTrace
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
npm --prefix frontend ci

# Launch single-port workstation (UI + API on http://localhost:8000)
.\.venv\Scripts\python.exe scripts/start_standalone.py
```
Open `http://localhost:8000` to inspect real mechanical blueprints (`fixtures/mechanical/hvac_plan_level2.pdf`) with offline vector linework extraction, two-point scale calibration, and SQLite WAL ledger persistence.

---

## 8. Closing Reflection

BlueTraceAI was built out of respect for how tradespeople actually work.

In commercial construction, an estimator's signature on a bid is a serious commitment. Software built for this industry cannot afford to be an unpredictable black box that asks users for blind faith. It needs to be a precision tool: reading tiny callouts in milliseconds, tracing vector paths without human fatigue, and checking every number against the ledger before anyone hits submit.

By pairing Meta's newest models with deterministic vector geometry and human oversight, BlueTraceAI gives estimators their time back—without ever putting their company's bid at risk.
