# BlueTraceAI
### AI-Native Interactive Drawing Intelligence & MEP Takeoff Platform

BlueTraceAI is a precision plan takeoff and drawing review platform built for commercial Mechanical, Electrical, and Plumbing (MEP) contractors.

Unlike traditional software that relies either on manual clicking or inaccurate black-box batch extraction, BlueTraceAI operates on an interactive, point-of-need model inspired by state-of-the-art estimating software like Incumbent: **The Drawing Sheet is the Interface**.

---

## Architectural Evolution: Offline Foundation to Live Multi-Agent Assistant

BlueTraceAI is an evolution of our team's battle-tested offline engineering pipeline (developed in `Imagineers`, backed by 700+ automated unit/integration tests). 

Rather than treating plan review as a static, disconnected batch extraction job, BlueTraceAI builds a **live, multi-agent collaboration layer** powered by Meta's newest frontier models (`muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0`, Files API) working side-by-side with the estimator in real time on the drawing canvas:

```
┌────────────────────────────────────────────────────────────────────────┐
│               BlueTraceAI Interactive Review Workspace                 │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ 150 DPI Hardware-Accelerated SVG Canvas Viewer                 │   │
│   │                                                                │   │
│   │  [Sheet M-201]              [Point-of-Need QuickDraw Badge]    │   │
│   │   ═══════════════════════►  ┌─────────────────────────────┐    │   │
│   │   Supply Air Duct Run       │ 24x12 Rectangular Duct      │    │   │
│   │   (Native Vector Linework)  │ [Click to Apply: 48.5 LF]   │    │   │
│   │                             └─────────────────────────────┘    │   │
│   │                                                                │   │
│   │  [Schedule Predictions Pins]     [SAM 3.1 Room Polygon]        │   │
│   │  Diffuser S1 (150 CFM, 12x12)    Zone 2 / Conf Room 203        │   │
│   └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴────────────────────────┐
          │                                                  │
          ▼                                                  ▼
┌───────────────────────────────────┐    ┌───────────────────────────────────┐
│ Meta Model API (Online Agentic)   │    │ Deterministic Engine (Offline)    │
│ - muse-spark-1.3: Hover OCR &     │    │ - PyMuPDF native vector stream    │
│   title-block SheetScan           │    │ - Paired double-line centerline   │
│ - sam-3.1: Zero-shot segmentation │    │ - Fail-closed scale verification  │
│ - muse-wonder-1.0: Copilot chat   │    │ - SQLite immutable takeoff store  │
└───────────────────────────────────┘    └───────────────────────────────────┘
```

---

## Key Capabilities

1. **SheetScan (Automated Plan Directory)**
   - Automatically detects sheet numbers (e.g. `M-101`, `P-201`), discipline, sheet title, and engineering scale from title blocks upon upload using `muse-spark-1.3`.
2. **Point-of-Need Dimensioning (QuickDraw)**
   - Estimators hold a key (e.g. `Q`) or hover over a duct/pipe run on the 150 DPI canvas to view real-time dimension callouts extracted via lightweight 300x300 px cursor-crop OCR (< 500 ms latency).
3. **Equipment Schedule-to-Plan Cross-Referencing (Predictions)**
   - High-density table extraction from equipment schedules (diffusers, VAV boxes, valves, pumps) mapped directly onto the floor plan as actionable takeoff items with 1-click accept/reject.
4. **Interactive Boundary Segmentation (SAM 3.1)**
   - One-click zero-shot polygon boundary segmentation for rooms, zones, and equipment footprints using Meta's `sam-3.1`.
5. **Deterministic Linear Linework Engine (Offline Core)**
   - Sub-pixel native PDF vector extraction and paired double-line duct centerline tracing to ensure takeoff footages remain mathematically exact. Never guess or hallucinate dimensions.
6. **Conversational Estimating Copilot (Natural Language Takeoff Assistant)**
   - Natural language drawing interrogation and takeoff calculations powered by `muse-wonder-1.0` with structured tool calling and highlighted coordinate pins.

---

## Anti-Leak Sanitization Guardian

To ensure strict code isolation and cleanliness when importing components and datasets from predecessor projects, BlueTraceAI includes an automated anti-leak guardian (`scripts/sanitize_import.py`) bound to `.git/hooks/pre-commit`:

```bash
# Run audit across workspace
python scripts/sanitize_import.py --audit

# In-place sanitize imported files
python scripts/sanitize_import.py --sanitize-all

# Cleanly import a file from another directory
python scripts/sanitize_import.py --import-file /path/to/source.py src/target.py
```

---

## Technology Stack

* **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Hardware-Accelerated Canvas (150 DPI), SVG Annotation Overlay.
* **Backend API**: FastAPI, Python 3.10+, SQLite transactional project store, Pydantic v2.
* **Perception & Reasoning Models**: Meta Model API (`https://api.meta.ai/v1`)
  - `muse-spark-1.3`: Multimodal Vision, Title Block extraction, Table JSON parsing, and Cursor-Crop OCR.
  - `sam-3.1`: Promptable point-and-click segmentation via the Responses API.
  - `muse-wonder-1.0`: Long-horizon reasoning, takeoff calculations, and copilot tool execution.
  - Files API: Single-upload PDF drawing caching via `POST /v1/files`.
* **Vector Engine**: PyMuPDF (`fitz`), NetworkX, Shapely.

---

## Project Structure

```text
bluetrace-ai/
├── configs/                   # Routing thresholds and classification rules
├── docs/                      # Architectural specs, research, and design guides
│   ├── adr/                   # Architecture Decision Records (ADR-001, ADR-002, ADR-003)
│   ├── hackathon/             # Hackathon rules, tracks, and submission guidelines
│   ├── meta_api/              # Curated Meta Model API documentation & index
│   ├── research/              # Dedicated research investigations (RES-01 to RES-05)
│   └── specs/                 # Technical specifications (BYOK, Point-of-Need UX)
├── fixtures/                  # Ground-truth MEP blueprint test sheets & annotations
├── frontend/                  # React 19 interactive canvas application
├── scripts/                   # Sanitization guardian and tooling scripts
│   └── sanitize_import.py     # Anti-leak validator & clean-importer
├── src/                       # FastAPI backend & core algorithms
│   ├── api/                   # REST endpoints & request contracts
│   ├── core_vector/           # Deterministic vector linework & scale engine
│   ├── meta_services/         # Meta Model API integration layer
│   ├── models/                # Pydantic v2 domain schemas
│   └── store/                 # SQLite transactional takeoff store & rollup
├── tests/                     # Automated unit and integration test suite
├── PLAN.md                    # Capability-based milestone roadmap
├── TASKS.md                   # Live task tracking matrix
├── pyproject.toml             # Python project dependencies
└── .env.example               # Documented environment template
```


---

## Remote Repository & Pre-Submission Git Setup

To push this repository to your remote GitHub host prior to hackathon submission:

```bash
# 1. Add your remote GitHub repository
git remote add origin https://github.com/<your-username>/bluetrace-ai.git

# 2. Set master branch
git branch -M master

# 3. Push code, tests, and artifacts
git push -u origin master
```

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for the complete judge walkthrough and submission details.
