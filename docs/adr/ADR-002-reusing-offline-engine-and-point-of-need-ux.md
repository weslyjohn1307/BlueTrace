# ADR-002: Reusing Offline Foundation & Evolving to Point-of-Need Multi-Agent Architecture

## Status
Accepted

## Date
2026-10-30

## Context
In our predecessor engineering project (`D:\Imagineers`), we developed and validated a full offline 2D MEP extraction pipeline backed by 715 unit/integration tests:
- Native vector extraction and double-line duct centerline derivation.
- Conservative topological graph routing and fail-closed scale validation.
- Fine-tuned Fire Damper detection and spatial vector matchers.
- High-performance 150 DPI SVG drawing viewer with hardware-accelerated transforms.

However, the predecessor operated primarily as a **batch processor** (upload -> queue full-page background extraction -> view static numbers in a table).

In the real world of mechanical estimating (exemplified by modern state-of-the-art point-of-need takeoff tools), estimators do not want to wait for slow full-sheet batch processing or interact with disconnected chat windows. **The drawing sheet is the interface**. Estimators need intelligence delivered directly at the point of need:
1. **QuickDraw**: Hovering near a duct run or holding a key (e.g., `Q`) renders a floating badge with one-click dimension application.
2. **Scheduled Item Predictions**: Parsing equipment tables (diffusers, VAV boxes) and projecting candidate matches onto the floor plan with one-click accept/reject.
3. **SheetScan**: Instantly recognizing sheet numbers, disciplines, and scale ratios on upload to build a navigable plan directory.
4. **Drawing Copilot**: A conversational assistant that understands drawing hierarchy and cites physical coordinates.

## Decision
1. **Reuse Battle-Tested Offline Foundation**:
   - Directly import and adapt the mathematical vector linework algorithms, paired duct centerline derivation, and 150 DPI canvas viewer from `Imagineers`.
   - Strictly sanitize and strip all legacy naming or hackathon tokens using `scripts/sanitize_import.py` and git pre-commit hooks.
2. **Evolve to Live Multi-Agent Architecture with Meta Model API**:
   - Deploy **Agent 1 (SheetScan)**: Fast background reconnaissance reading sheet title blocks and scales (`muse-spark-1.3`).
   - Deploy **Agent 2 (Schedule Extractor & Linker)**: High-density tabular parsing (`muse-spark-1.3`) cross-referenced to plan coordinate pins.
   - Deploy **Point-of-Need Hover OCR (QuickDraw)**: Sub-second 300x300 px cursor crops (`muse-spark-1.3`) rendering click-to-apply badges.
   - Deploy **Agent 3 (Interactive Segmentation)**: Promptable zero-shot boundary segmentation of rooms and equipment footprints via `sam-3.1`.
   - Deploy **Agent 4 (Conversational Copilot)**: Long-horizon reasoning over the project database via `muse-wonder-1.0` with coordinate highlighting.
3. **Preserve Mathematical Invariants**:
   - Models never guess footages or counts. All quantities trace directly to native vector geometry and verified scale factors.

## Consequences
- **Positive**:
  - Dramatically reduces time-to-value: estimators work interactively within seconds of uploading a PDF.
  - Sub-second latency (< 500ms) on hover dimensioning.
  - Zero hallucination on bid-critical linear footages and equipment counts.
  - Total isolation of legacy tokens via automated sanitization tooling.
- **Negative / Trade-offs**:
  - Requires maintaining live WebSocket/SSE streaming and cursor event tracking on the frontend canvas.
