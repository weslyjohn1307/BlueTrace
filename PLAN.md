# BlueTraceAI: Development & Architecture Plan

## 1. System Tenets

1. **Human-in-the-Loop Supremacy**: AI provides suggestions, badges, and automated pre-fills at the point of need. The estimator remains in control and validates findings with one click.
2. **Strict Hybrid Division**:
   - Meta Models handle vision, semantic classification, OCR, and reasoning.
   - Local Deterministic Algorithms handle linear pixel-to-foot conversions, vector geometry, and math. Never guess or hallucinate dimensions.
3. **Sub-Second Latency on Focus**: Full-page vision is deferred to background indexing. Real-time interactions (such as hover dimensions) operate on tight 300x300 px crops for sub-second response times.

---

## 2. 7-Day Milestone Schedule (Oct 28 - Nov 4)

| Milestone | Phase | Key Objective | Deliverables |
|---|---|---|---|
| **M1** | Scaffolding & Setup | Clean workspace, environment, and module migration | Initialized virtualenv, migrated React viewer, clean vector engine |
| **M2** | Meta Model Integration | Establish verified connection to Meta Model API | Client wrapper for `muse-spark-1.3`, `sam-3.1`, and `muse-wonder` |
| **M3** | SheetScan Pipeline | Automated title-block reader and plan tree generator | Upload PDF -> automatic sheet numbers, titles, and scale ratios |
| **M4** | Point-of-Need OCR | Cursor hover dimension detection | Pressing hover key over duct run renders click-to-apply dimension badge |
| **M5** | Schedule Parser | Tabular equipment extraction & floor plan matching | Schedule sheet parsing -> interactive equipment ledger |
| **M6** | Copilot & SAM 3.1 | Multimodal chat assistant & click-to-segment | Natural language takeoff queries & room polygon segmentation |
| **M7** | System Polish & Demo | End-to-end integration test & video recording | Polished UI walkthrough video and documentation freeze |
| **M8** | Final Release | Final deployment & submission | Project submission to hackathon platform |
