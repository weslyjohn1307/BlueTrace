# ADR-001: Strict Hybrid Division for MEP Takeoff & Document Intelligence

## Status
Accepted

## Date
2026-10-30

## Context
Commercial MEP plan takeoff requires processing large ($24 \times 36$ in to $36 \times 48$ in) multi-sheet drawing PDFs containing dense line networks (HVAC ducts, hydronic piping, electrical conduit), microscopic text annotations (6–8pt), and complex equipment schedules.

Two competing architectural extremes exist:
1. **Pure Computer Vision / Deterministic Pipeline**: Traditional heuristic OCR and OpenCV contour tracing. This approach is brittle, fails to recognize varied architectural drawing conventions, cannot understand schedule tables, and has zero conversational capabilities.
2. **Pure End-to-End VLM Pipeline**: Passing entire drawing sheets to multimodal LLMs (e.g., GPT-4o, Claude 3.5, Gemini 1.5, Llama 3.2 Vision). Because VLMs downsample large images to fit context limits (e.g. 1024–2048px), fine vector line continuity is destroyed, small 1/8" text is blurred, and models hallucinate linear footages and counts.

Furthermore, under the hackathon and MEP evaluation standards, linear measurement and symbol counting constitute the bulk of objective scoring. A conversational assistant that guesses lengths will fail.

## Decision
We adopt a **Strict Hybrid Division** governed by the axiom: *"Read cheaply first, reason visually selectively, calculate deterministically."*

1. **Local Deterministic Linework & Scale Engine**:
   - PyMuPDF (`fitz`) parses native PDF vector paths (lines, arcs, beziers) directly at sub-pixel resolution ($72\text{ pt/inch}$).
   - NetworkX and Shapely build topological graphs and trace centerlines between paired double-line duct walls.
   - Scale math ($Length = Points \times Ratio$) is strictly deterministic.
   - Scale validation is fail-closed: unverified or conflicting scales trigger a `"review_required"` flag.
2. **Meta Model API Layer (`https://api.meta.ai/v1`)**:
   - `muse-spark-1.3`: Handles semantic visual perception—title block sheet extraction, high-density equipment schedule table parsing, and 300x300 px cursor hover OCR.
   - `sam-3.1`: Performs interactive, promptable zero-shot boundary segmentation (rooms, zones, equipment pads) via the Responses API (`/v1/responses`).
   - `muse-wonder-1.0`: Serves as the conversational copilot, executing structured tool calls over the local project SQLite database to answer takeoff queries.
   - Files API (`/v1/files`): Caches uploaded multi-page blueprint PDFs once to avoid re-transmitting large files.

## Consequences
- **Positive**:
  - Eliminates VLM dimensional hallucination; footages are mathematically exact.
  - Sub-second latency (< 500ms) on interactive cursor hover via targeted 300x300 px crops.
  - Transparent visual grounding: every quantity returned cites exact sheet coordinates and vector segment IDs.
  - Token efficiency: full sheets are never dumped blindly into LLM context.
- **Negative / Trade-offs**:
  - Requires maintaining dual runtimes (Python FastAPI backend for vector/AI logic + React 19 frontend for canvas rendering).
  - Scanned/rasterized PDFs without vector layers require raster skeletonization fallback or manual calibration.
