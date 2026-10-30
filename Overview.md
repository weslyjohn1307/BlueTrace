# BlueTraceAI: Product Overview & Requirements (PRD)

## 1. Problem Statement
Commercial Mechanical, Electrical, and Plumbing (MEP) contractors bid on complex multi-million dollar projects under severe time constraints. Estimators manually review 50 to 500-page architectural and engineering drawing sets in PDF format.
- Manual takeoff in legacy desktop tools requires clicking every single duct segment, pipe fitting, and diffuser by hand, taking 40–80 hours per bid.
- Pure AI / VLM batch processors fail because they hallucinate linear dimensions, misinterpret multi-scale sheets, or act as disconnected chatbots that don't ground their answers in the physical drawing.

## 2. Product Solution
BlueTraceAI is a precision plan takeoff and drawing review platform where **The Drawing Sheet is the Interface**:
1. **SheetScan**: Ingestion pipeline that enumerates sheets, classifies disciplines (`M`, `E`, `P`), and reads title block numbers and engineering scales automatically.
2. **Point-of-Need Dimensioning**: Hovering over a duct or pipe run renders real-time dimension callouts extracted via lightweight 300x300 px cursor crops processed by `muse-spark-1.3`.
3. **Equipment Schedule-to-Plan Linking**: High-density mechanical tables (diffusers, VAVs, pumps) are extracted into structured matrices and cross-referenced with symbols on floor plans.
4. **SAM 3.1 Boundary Segmentation**: Instant one-click zero-shot polygon segmentation for rooms and equipment pads using Meta's `sam-3.1`.
5. **Deterministic Linework Engine**: Mathematical vector extraction and centerline tracing for exact footages.
6. **Conversational Copilot**: Natural language takeoff calculations grounded in the project database powered by `muse-wonder-1.0`.

## 3. Target Personas
- **Chief MEP Estimator**: Needs verified takeoff footages and counts that can be trusted in competitive contract bids.
- **Preconstruction Engineer**: Needs to quickly navigate multi-sheet sets, verify equipment schedules against floor plans, and flag design discrepancies.

## 4. Explicit Non-Goals (What BlueTraceAI Will NOT Do)
- **NOT a Generative CAD Authoring Tool**: BlueTraceAI is for plan review and takeoff; it does not generate or modify native `.dwg` / `.rvt` BIM models.
- **NOT a Black-Box Black Hole**: BlueTraceAI will never output ungrounded numbers. Every quantity must link to highlighted sheet coordinates.
- **NOT an Unbounded Autonomous Agent Swarm**: Agents operate in bounded, deterministic stages with explicit human review gates.

## 5. Success Metrics
- **Sub-Second Hover Latency**: Cursor crop OCR response time < 800ms.
- **100% Dimensional Traceability**: Every linear takeoff foot must point to a vector segment ID and verified scale factor.
- **Schedule Cross-Reference Accuracy**: > 90% precision linking equipment schedule tags (e.g., `VAV-1`) to floor plan spatial coordinates.
