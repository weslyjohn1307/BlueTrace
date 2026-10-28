# BlueTraceAI
### AI-Native Interactive Drawing Intelligence & MEP Takeoff Platform

BlueTraceAI is a precision plan takeoff and drawing review platform built for commercial Mechanical, Electrical, and Plumbing (MEP) contractors.

Unlike traditional software that relies either on manual clicking or inaccurate black-box batch extraction, BlueTraceAI operates on an interactive, point-of-need model: **The Drawing Sheet is the Interface**.

---

## Key Capabilities

1. **SheetScan (Automated Plan Directory)**
   - Automatically detects sheet numbers (e.g. `M-101`, `P-201`), discipline, sheet title, and engineering scale from title blocks upon upload using `muse-spark-1.3`.
2. **Point-of-Need Dimensioning**
   - Estimators hold a key or hover over a duct/pipe run on the 150 DPI canvas to view real-time dimension callouts extracted via lightweight cursor-crop OCR.
3. **Equipment Schedule-to-Plan Cross-Referencing**
   - High-density table extraction from equipment schedules (diffusers, VAV boxes, valves, pumps) mapped directly into the plan view as actionable takeoff items.
4. **Interactive Boundary Segmentation (SAM 3.1)**
   - One-click zero-shot polygon boundary segmentation for rooms, zones, and equipment footprints using Meta's `sam-3.1`.
5. **Deterministic Linear Linework Engine**
   - Sub-pixel native PDF vector extraction and paired double-line duct centerline tracing to ensure takeoff footages remain mathematically exact.
6. **Conversational Estimating Copilot**
   - Natural language drawing interrogation and takeoff calculations powered by `muse-wonder` with structured tool calling.

---

## Technology Stack

* **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Hardware-Accelerated Canvas (150 DPI), SVG Annotation Overlay.
* **Backend API**: FastAPI, Python 3.10+, SQLite transactional project store, Pydantic v2.
* **Perception & Reasoning Models**: Meta Model API (`https://api.meta.ai/v1`)
  - `muse-spark-1.3`: Multimodal Vision, Title Block extraction, Table JSON parsing, and Cursor-Crop OCR.
  - `sam-3.1`: Promptable point-and-click segmentation via the Responses API.
  - `muse-wonder`: Long-horizon reasoning, takeoff calculations, and copilot tool execution.
* **Vector Engine**: PyMuPDF (`fitz`), NetworkX, shapely.

---

## Project Structure

```text
bluetrace-ai/
├── docs/                      # Architectural specs, research, and design guides
│   ├── research/              # Dedicated research investigations
│   └── specs/                 # Data schemas and interface contracts
├── frontend/                  # React 19 interactive canvas application
├── src/                       # FastAPI backend & core algorithms
│   ├── api/                   # REST & streaming endpoints
│   ├── core_vector/           # Deterministic vector linework & scale engine
│   └── meta_services/         # Meta Model API integration layer
├── tests/                     # Automated unit and integration test suite
├── PLAN.md                    # 7-day development milestone roadmap
├── TASKS.md                   # Live task tracking and implementation checklist
└── pyproject.toml             # Python project dependencies
```
