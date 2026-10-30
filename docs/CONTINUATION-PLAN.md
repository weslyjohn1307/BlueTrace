# BlueTraceAI: Continuation Plan (Imagineers → Meta Online Layer)

> Master durable record of the continuation direction agreed 2026-10-30.
> Supersedes the greenfield waterfall reading of `PLAN.md` G-M1..G-M6.
> Q&A source of truth: `Questions.md` (all answered). Decisions: `docs/adr/`.
> Status tracker: `State.md`.

## 1. Context

BlueTraceAI is a continuation of the internal offline predecessor at `D:\Imagineers`
(fully operational, test-verified). The offline deterministic pipeline is reused;
this repo adds the Meta Model API online layer (`muse-spark-1.3`, `sam-3.1`,
`muse-wonder-1.0`) and the live point-of-need agent UX on top. Verified read-only
2026-10-30; all paths below were confirmed to exist.

## 2. Verified predecessor map (D:\Imagineers)

| Capability | Predecessor path | BlueTraceAI target |
|---|---|---|
| Vector/linework extraction | `src/mep_ai/level2/extractor.py` | `src/core_vector/extractor.py` |
| Duct centerline + route graph | `src/mep_ai/level2/representation.py`, `continuity.py` | `src/core_vector/representation.py` + `continuity.py` (kept predecessor names) |
| Scale validation (fail-closed) | `src/mep_ai/level2/scale.py` | extend `src/core_vector/scale_validator.py` |
| Measurement + pipeline + schema | `src/mep_ai/level2/measurement.py`, `pipeline.py`, `schema.py` | `src/core_vector/`, `src/models/` |
| Package processor + artifact store | `src/mep_ai/package_processor.py`, `artifact_store.py` | folded into `core_vector.pipeline` + `store/takeoff_store` (no `src/document/` by design) |
| FastAPI + worker + SQLite index | `src/backend/api_v1.py`, `job_worker.py`, `result_index.py` | extend `src/api/`, new `src/store/` |
| Canvas viewer + takeoff ledger | `frontend/src/modes/live/DrawingViewer.tsx`, `TakeoffSummary.tsx` | superseded by R-1: new `SheetCanvas` + `LedgerPanel` (run-coupled viewer deleted) |
| Symbol detection (YOLO, damper-only) | `src/mep_ai/level1/` + `yolo11n.pt` | **REPLACED by VLM detection (ADR-003)** |
| Offline copilot (7 tools) | `src/mep_ai/copilot/engine.py` | reference for `muse-wonder-1.0` tool schema |

Reuse approved with zero IP constraints; migrate with BlueTraceAI naming per
`AGENTS.md` boundaries, adapting as needed (Q1.5, Q3-followup answer 3).

## 3. Locked decisions (from Questions.md)

- **Live model**: point-of-need suggestion badges ("QuickDraw") + background
  schedule ghost pins + copilot highlight pins. One-click accept/reject; no
  unverified black-box overwrites (Q2.1).
- **Agent boundaries** (non-overlapping): Reconnaissance writes sheet metadata;
  Schedule writes equipment catalog; Vector engine emits centerline polylines;
  Takeoff agent merges semantic tags on user click. Conflicts resolved by SQLite
  single-writer transactions + immutable item UUIDs with
  `SUGGESTED/ACCEPTED/REJECTED` states (Q2.2).
- **Latency budgets**: hover OCR < 500 ms; SheetScan 1.5–2.5 s/page async;
  SAM 1.0–2.0 s; copilot streaming first token < 1.0 s (Q2.3).
- **Offline subset**: canvas nav/render, vector display + centerlines, manual
  measurement, ledger + CSV/JSON export. Online-only: hover OCR, SAM, copilot,
  SheetScan/schedule VLM calls (Q2.4).
- **Crop definition**: 150 pt × 150 pt window in PDF space = 312×312 px
  (≈300×300 rounded) at 150 DPI ≈ 2.08 in² physical area (Q4.4).
- **Python**: 3.10+ conventions, 3.10–3.13 compatible (Q4.2).
- **API key**: live key exists via hackathon portal; all three models enabled
  (Q4.1). Key handling per `docs/specs/BYOK-SECURE-INTERFACE.md`.
- **Track + demo**: Startup track; 3-min single-sheet HVAC flow:
  SheetScan → Schedule linking → QuickDraw + tracing → SAM + copilot → Export (Q3.3).

## 4. Fixture picks (whole dataset available)

Actual dataset root: predecessor training directory in `D:\Imagineers\`.
(Note: names in early Q&A used `FIX-TRN-*` shorthand; real layout is per-page folders.)

1. **Primary (ducts/VAVs/diffusers)**: `training\mechanical\...\Avexis_page_22\Architecture and Mechanical_IFC Set_Avexis_page_22.pdf` + sibling ground-truth JSONs (329 verified runs).
2. **Detection comparison (dampers)**: `training\mechanical\...\PfMCC_50__CD_-_Drawings_page_118\` (168 verified GT symbols from 175 initial candidates; used to score VLM detection vs legacy YOLO).
3. **Plumbing breadth**: one `training\plumbing\` sheet (exact file picked at Slice 0).

Copied to `D:\bluetrace-ai\fixtures\` at Slice 0 with a `fixtures/README.md` map.

## 5. Slice execution plan (replaces waterfall order)

| Slice | Work | Gate |
|---|---|---|
| 0 | Fixtures + harness (`fixtures/`, README map) | PDFs + ground truth present; render check |
| 1 | Offline core migration (`level2/` → `src/core_vector/`, `src/document/`) + ported tests | Ported tests pass; run counts match ground truth |
| 2 | Backend uplift: SQLite takeoff store, ledger rollup, CSV/JSON export | `pytest tests/`; export round-trip |
| 3 | Frontend migration: `DrawingViewer`, `TakeoffSummary` → `frontend/` | `npm run build` + lint clean |
| 4 | Meta online layer: SheetScan, QuickDraw crop-OCR + badge, schedule extractor + ghost pins, VLM detection agent, SAM endpoint, streaming copilot | Each endpoint demoed on fixture; latency budgets met |
| 5 | BYOK secure interface per spec + leak audit | Audit commands clean; no secret in bundle/logs/git |
| 6 | Demo packaging: 3-min flow rehearsal, video, submit | Startup-track checklist + `SUBMIT` |

Standard gates every slice: `pytest tests/`, `ruff check src/`, frontend build/lint when touched.

## 6. Explicit non-goals (carried over)

- No YOLO weight migration or retraining (ADR-003).
- No `.dwg`/`.rvt` authoring; no ungrounded numbers; no unbounded agent swarm.
- No secrets in git/chat/logs (BYOK spec).
