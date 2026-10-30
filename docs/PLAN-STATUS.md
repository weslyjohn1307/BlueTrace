# Plan Status — What's Built, What's Left

> Single tracking view. Synced 2026-10-30 against `TASKS.md`, `task_plan.md`,
> `State.md`, `prd.json`, the test suites, and git history
> (`weslyjohn1307/BlueTrace`, `master`).
> Stage: **Planning** — prototype slices are built and verified; this is not a
> production release and nothing has been submitted to the hackathon yet.

## Built and verified

| Area | Evidence |
|---|---|
| **Specs & governance (Phase 0)** | RES-01…10, SPEC-01…07, ADRs 001–003, `PRODUCT-VISION.md`, `UI-UX-FLOWS.md`; trackers reconciled (`prd.json` synced) |
| **Backend API** | 19 `/api/*` endpoints (`src/api/routes.py`): health, sheet-scan, page-image/text, crop-ocr, schedule, segment, upload, files/upload, copilot + SSE, takeoff CRUD/summary/export, BYOK |
| **Vector engine** | PyMuPDF extraction, paired centerlines, topology; Avexis p.22 = **329 runs asserted in tests**; scale boundary declared (`scale.py` vs `scale_validator.py`) |
| **Meta layer** | `muse-spark-1.3` SheetScan/crop-OCR/schedules, `sam-3.1` endpoint, `muse-wonder-1.0` copilot grounded in the ledger with `model_used` provenance |
| **Frontend (single flow)** | `TakeoffWorkspace`: upload → scan → 150 DPI canvas → HoverBadge → ledger → schedule → copilot; legacy `/api/v1` UI deleted |
| **Truthfulness invariants** | Fail-closed scale/crop paths, `SUGGESTED` by default, no fabricated dimensions; enforced by tests, not just docs |
| **Store** | SQLite WAL + FK + `busy_timeout`, `created_at`-preserving upserts, review-event audit, CSV/JSON export with coordinates |
| **Security** | Session-scoped BYOK (expiry, per-session opt-out), contained PDF paths, upload magic-byte checks, no secrets in git |
| **Copyright guard** | Third-party product names purged from tree *and history* pre-push; sanitizer + pytest guard + internal-research sanctuary prevent return |
| **Agent harness & knowledge** | 8 swarm agents wired to required knowledge packs via `docs/knowledge/INDEX.md` (10 packs), `.agents/` hooks + rules 01–06 (fail-closed, dependency, anti-slop, knowledge-first, copyright, evidence), 4 skills |
| **Demo & repo** | Real-app screenshots in README (`docs/assets/`, Playwright-captured), Stitch concept labelled as concept; CI workflow committed; **pushed to GitHub** (`master` tracking `origin/master`) |
| **Gates (last verified)** | Backend **44 passed**, frontend **25 passed**, Playwright smoke 3 passed, `ruff`/`mypy`/`eslint`/`tsc`/build/sanitizer all clean |

## Left — product features

| # | Item | Notes |
|---|---|---|
| L-1 | **DOC-04 legend extractor** | Symbol→description linking; only legend *sheet detection* exists today (scale gating) |
| L-2 | **SEG-01 canvas trigger** | `/api/segment` endpoint works; no one-click UI wiring yet |
| L-3 | **Files API in-flow** | `/api/files/upload` endpoint only; workspace doesn't use it |
| L-4 | **Two-point graphic scale calibration** | Requirement recorded in knowledge corpus; title-block parsing only today |
| L-5 | **Aspect-ratio reinforcement flag** | SMACNA >4:1 requirement recorded; no check in `src/` yet |
| L-6 | **Ledger pagination** | List endpoints return everything; fine at fixture scale |
| L-7 | **Upload-dir configurability** | Tests write to real `data/uploads/` (gitignored, harmless) |

## Left — demo, submission, hygiene

| # | Item | Owner / notes |
|---|---|---|
| L-8 | **VER-02 demo video** | 3-minute live takeoff walkthrough; not started |
| L-9 | **SUBMIT to Cerebral Valley** | Remote push ✅ done; final submission itself not done |
| L-10 | **CI first-run result** | Workflow pushed but result unverified from here — check Actions tab |
| L-11 | **README live CI badge** | Swap static test badges (template commented in README) once L-10 is green |
| L-12 | **LICENSE choice** | Owner decision; deliberately not fabricated |
| L-13 | **Purge-backup deletion** | Local Temp backup of pre-purge history; owner deletes after confirming GitHub |
| L-14 | **`.pre-commit-config.yaml`** | Hook exists locally only; portable config deferred |
| L-15 | **Stitch asset intake** | Other agent's in-flight `docs/stitch_assets/` + `frontend/public/stitch/` (uncommitted); large PNGs (up to 2.3 MB) need labelling/optimization review before commit |
| L-16 | **Playwright in CI** | Suite runs locally (3 passed); no CI job yet |

## Deliberately deferred (post-Planning)

Production-readiness items from the master checklist — multi-user auth,
hosting, billing caps, queues, observability, desktop packaging build
(RES-06 is research only). Not started, not claimed.

## How to read the trackers

- `TASKS.md` / `task_plan.md` — task checkboxes (3 open: DOC-04, VER-02, SUBMIT)
- `State.md` — milestone matrix and gate summary
- `prd.json` — milestone states (G-M3/G-M6 `in_progress`, rest `completed`)
- This file — built-vs-left in one place; update it whenever a checkbox moves
