# BlueTraceAI: Architecture & Capability-Driven Lifecycle Plan

## 1. System Tenets

1. **Human-in-the-Loop Supremacy**: AI provides suggestions, badges, and automated pre-fills at the point of need. The estimator remains in control and validates findings with one click.
2. **Strict Hybrid Division**:
   - **Meta Models** handle vision, semantic classification, OCR, tabular schedule parsing, and copilot reasoning.
   - **Local Deterministic Algorithms** handle linear pixel-to-foot conversions, vector linework tracing, centerline generation, and math. Never guess or hallucinate dimensions.
3. **Sub-Second Latency on Focus**: Full-page vision is deferred to background indexing. Real-time interactions (such as hover dimensions) operate on tight 300x300 px crops for sub-second response times.
4. **Drawing-Aware Document Understanding**: Rather than a dumb batch scraper, the system acts as an interactive engineering assistant grounded in sheet hierarchy, title blocks, discipline tags, and schedule-to-plan cross-references (inspired by ParseBench arXiv:2604.08538).

---

## 2. Goal-Based Milestone Lifecycle (G-M0 to G-M6)

Progression between milestones is strictly gated by verified acceptance criteria and automated tests, independent of arbitrary calendar dates.

| Milestone | Phase Focus | Core Goal (Definition of Done) | Key Deliverables & Gates |
|---|---|---|---|
| **G-M0** | **Governance & SDLC Setup** | Establish Phase 0 specifications, SDLC master checklist standards, and project memory files. | Committed `CLAUDE.md`, `AGENTS.md`, `Overview.md`, `Tech_stack.md`, `Data_models.md`, `User_flows.md`, `DESIGN.md`, `ADR-001`, and Manus memory (`task_plan.md`, `findings.md`, `progress.md`). |
| **G-M1** | **Scaffolding & Core Environment** | Initialize Python backend and React 19 frontend workspaces with zero security leaks or dependency collisions. | `pyproject.toml`, FastAPI skeleton, SQLite store, React 19 + Vite + Tailwind setup, clean `.gitignore`, verified `.env.example`. |
| **G-M2** | **Meta Model API Layer** | Connect and verify interfaces to Meta Model API (`https://api.meta.ai/v1`) using official protocols. | Unit-tested client wrappers for `muse-spark-1.3` (Chat Completions/OCR), `sam-3.1` (Responses API Segmentation), `muse-wonder-1.0` (Reasoning Copilot), and Files API (`/v1/files`). |
| **G-M3** | **SheetScan & Document Reconnaissance** | Multi-sheet PDF ingestion with automatic discipline classification, title block extraction, and scale validation. | Native vector/text parser + targeted `muse-spark-1.3` visual inspection for title blocks and legend areas; structured `document_map.json` output. |
| **G-M4** | **Deterministic Linework & Point-of-Need OCR** | Native PDF vector centerline tracing + real-time sub-second cursor crop dimensioning. | PyMuPDF vector graph tracer, fail-closed scale validator, 300x300 px cursor hover crop API with client-side suggestion badge. |
| **G-M5** | **Schedule Parsing & Floor Plan Linking** | Extract tabular mechanical/electrical schedules and spatially link equipment tags to plan locations. | Tabular JSON extraction via `muse-spark-1.3` + spatial entity linking to plan symbols with interactive accept/reject ledger. |
| **G-M6** | **Copilot Reasoning & Interactive Canvas Demo** | Conversational engineering assistant with verified tool calling and SAM 3.1 boundary segmentation in 150 DPI viewer. | Natural language takeoff queries over structured DB via `muse-wonder-1.0`, one-click room polygon segmentation via `sam-3.1`, end-to-end demo walkthrough video. |

---

## 3. Quality Release Invariants

1. **Zero Secret Leaks**: No API keys or tokens committed to Git or exposed in client bundles.
2. **Deterministic Math**: Linear measurements must trace back to physical PDF vector coordinates and validated scale factors.
3. **Fail-Closed Scale Rule**: If scale annotations are missing, conflicting, or unverified, mark measurements as `"review_required"` rather than estimating.
4. **Context Budgeting**: Keep active model session context under 50% capacity; dump findings to disk after every two exploratory actions.
