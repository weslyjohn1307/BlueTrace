# BlueTraceAI: Living Workspace State (State.md)

## Current Status: Continuation of D:\Imagineers (offline core) + Meta Online Layer
- **Active Phase**: R-1 migration done (single `/api` flow, legacy UI deleted); pre-demo packaging next. Direction: `docs/CONTINUATION-PLAN.md`; real flows: `docs/specs/UI-UX-FLOWS.md`; vision: `docs/PRODUCT-VISION.md`.
- **Baseline Date**: 2026-10-30 (re-audit remediation finished; see `docs/FIXLOG-2026-10-30-reaudit-remediation.md`)
- **Predecessor**: `D:\Imagineers` verified read-only (level2 engine, backend, viewer, 65 test files, training dataset).
- **Key decisions**: VLM detection replaces YOLO (`docs/adr/ADR-003-*`); BYOK server-side-only & session-scoped (`docs/specs/BYOK-SECURE-INTERFACE.md`); Q&A in `Questions.md` (all answered).

---

## Milestone Progress Matrix

| Slice / Milestone | Capability Focus | Status | Acceptance Gate |
|---|---|---|---|
| **Slice 0 / G-M0** | Fixtures & Ground-Truth Directory | **COMPLETE** | Avexis p22 (329 runs), PfMCC p118 (168 dampers), P104.1 plumbing imported; render check clean @ 150 DPI |
| **Slice 1 / G-M4** | Core Vector Extraction & Centerline Topology | **COMPLETE** | `src/core_vector/` (extractor, representation, continuity, reconciled scale engines) |
| **Slice 2 / G-M1** | SQLite Takeoff Store & Ledger Rollup | **COMPLETE** | `src/store/takeoff_store.py` (WAL, 1-click review, CSV/JSON export with coords) |
| **Slice 3 / G-M1** | Frontend Workspace & Point-of-Need UI | **COMPLETE** | New single flow (`TakeoffWorkspace`: upload→scan→canvas→ledger→copilot); legacy `/api/v1` UI deleted; 25 vitest green |
| **Slice 4 / G-M2-5**| Meta Model Online Layer | **COMPLETE** | SheetScan, live crop-OCR, schedule linking (SUGGESTED default), grounded copilot + SSE; `/api/segment` endpoint (no canvas trigger yet) |
| **Slice 5 / G-M0** | BYOK Secure Interface & Audit Compliance | **COMPLETE** | Session-scoped BYOK with expiry; contained file endpoints; hardened anti-leak audit passes |
| **Slice 6 / G-M6** | Startup Track Demo Packaging | Pending | 3-minute Avexis HVAC takeoff workflow rehearsal, submission checklist |

---

## Audit Remediations (2026-10-30 Audits)
- [x] **C1 (Copilot)**: Grounded in `TakeoffStore` and calls `muse-wonder-1.0`. Hardcoded scale (1/4" = 1'-0"), fake count (14), and fake IDs deleted. Fails closed with `scale_verified=False` when uncalibrated.
- [x] **C2 (Crop-OCR)**: Live VLM JSON parsing implemented. Fails closed with `review_required=True` on unparsed crops, eliminating fallback 24x12@0.95.
- [x] **C3 (Schedule HITL)**: Machine-extracted schedule rows default to `status="SUGGESTED"`, ensuring mandatory human review.
- [x] **C4 & C5 / R-1 (Frontend Contract)**: Legacy `/api/v1` surface deleted (~50 files); new single flow built and wired; strict contract test forbids regression.
- [x] **H1 & H2 (Branding & Paths)**: No legacy branding in product UI (docs history exempt); story copy reframed to VLM; dataset paths fixed; sanitizer enforces code + UI scopes.
- [x] **H3 & H4 (Security & BYOK)**: Path traversal protections in `/api/sheet-scan` (allow-listed directories, threadpool execution). Session-scoped in-memory BYOK (never mutates server `os.environ`).
- [x] **M1 & M4 (Test Isolation & Scale Engines)**: Added `BLUETRACE_DB_PATH` and `set_takeoff_store` test hooks. Added scale cross-validation test in `test_vector_pipeline.py`.

---

## Test & Quality Gates Summary
- **Backend Tests**: 39 passed (`pytest tests/`; TestClient/async tests need loopback sockets)
- **Backend Lint**: 0 errors (`ruff check src/ tests/ scripts/`)
- **Backend Type Check**: 0 errors (`mypy`)
- **Frontend Build**: `tsc -b && vite build` clean
- **Frontend Lint**: 0 errors, 0 warnings (`eslint .`)
- **Frontend Tests**: 25/25 passed (`vitest --run`)
- **Anti-Leak Audit**: `python scripts/sanitize_import.py --audit` PASSED (hardened scopes)
