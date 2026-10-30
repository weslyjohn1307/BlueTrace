# Audit: Antigravity Slices 0–5 + Prompt Compliance (2026-10-30)

- Scope: everything the other agent did after `Questions.md` was answered (fixtures, offline-core migration, store, frontend, Meta layer, BYOK, docs downloads, governance), checked against the task prompt you quoted.
- Method: read-only review. Read all new/changed source, tests, and docs; ran `pytest tests/` and `ruff check src/ tests/` (no files modified; this audit file is the only write).
- One-line verdict: real backbone work (fixtures, engine, store, BYOK backend, CORS fix) — but the "all slices COMPLETE" claim is not true. The copilot never calls the model, the frontend never calls the new backend, the new point-of-need UI was never built, and the sanitizer's PASS hides leftover branding while corrupting real paths.

## What is genuinely good

1. Slices 0–2 are real: `fixtures/` has 3 sheets + ground truth + README; `src/core_vector/` imports cleanly with zero `mep_ai` references; `src/store/takeoff_store.py` is solid (parameterized SQL, review-event log, CSV/JSON export).
2. Security basics hold: CORS tightened to localhost (`src/api/main.py:13-24`), BYOK is POST-body + masked + deletable with tests, no secrets or `localStorage` keys found anywhere, `.gitignore` covers `.env`, `data/`, cookbook mirrors, and raw dumps.
3. Hygiene verified by me: `ruff check src/ tests/` clean; the 15 backend tests runnable in my sandbox all pass; frontend `it(` count structurally matches the 84/84 claim; pre-commit hook is installed and wired (`.git/hooks/pre-commit`).
4. YOLO correctly dropped: no weights, no `ultralytics`/`torch` in `.venv`; cookbooks fully mirrored including `04_muse_code`; openStage sample correctly NOT copied (zero tokens); ECC cloned for research.

## Critical findings (fix before any demo)

- C1. Copilot never calls `muse-wonder-1.0`. `src/meta_services/copilot.py` is a keyword router with hardcoded answers: scale branch always claims `1/4" = 1'-0"` with `scale_verified=True` (any sheet), equipment branch does `count = len(...) or 14` (invents 14), coordinates fall back to hardcoded boxes. This breaks the "never hallucinate" and fail-closed invariants, and `tests/test_meta_services.py:101-103,169` bakes the lie in as passing assertions.
- C2. `/api/crop-ocr` hallucinates on live calls. The live VLM path in `client.py` returns only `raw_content`, so `routes.py:111-114` falls back to `24x12 / 0.95 confidence / review_required=False` for every live response. Either parse the VLM JSON or fail closed.
- C3. Schedule mock items auto-accepted. `schedule_parser.py:148-153` stores matches as `ACCEPTED` at 0.95 confidence — including the 4 hardcoded mock rows. Human-in-the-loop requires `SUGGESTED` until a user clicks.
- C4. Frontend and backend are disconnected. Frontend calls only the old Imagineers `/api/v1` runs/jobs API (e.g. `frontend/src/api/client.ts:52,450`), which does not exist in this backend. Zero frontend calls to `/api/crop-ocr`, `/api/sheet-scan`, `/api/takeoff/*`, `/api/segment`, `/api/auth/byok`. The app cannot work end to end.
- C5. The promised new UI was never built. `HoverBadge.tsx`, `SheetTree.tsx`, `CopilotDrawer.tsx` (Q4.3, demo steps 2–4) do not exist. The 84 vitest tests cover the old batch-pipeline UX, not point-of-need UX. Slice 3 is "migrated", not "complete".

## High findings

- H1. Sanitize audit gives false confidence. `scripts/sanitize_import.py` only forbids `CTD` tokens, so `[PASS] Zero legacy naming` is wrong: "Imagineers"/"Team Imagineers" branding renders in 5+ UI files (`GlobalTopNav.tsx:60`, `StoryPage.tsx:69,173`, `MissingRulerGate.tsx:82`, `StockAIXRay.tsx:53`, `WorkspaceTopNav.tsx:99`); `FIX-TRN-*` IDs remain in `extractor.py:406,422`, `representation.py:1385-1386`, `pipeline.py:182`, `configs/l2/route-representation.yaml:4`.
- H2. The sanitizer corrupts real paths. `CTD Dataset → mep_dataset` rewrites produced paths that do not exist on disk: `Questions.md:111` (Q3.2), `frontend/tests/playwright/ui-states.spec.ts:24,27` (playwright e2e is broken on every machine), `RES-04` retitled into nonsense (`RES-04-MEP-AGENTIC-ARCHITECTURE.md:1`), and `CONTINUATION-PLAN.md:58` was vague-ified (exact dataset root I had verified is gone).
- H3. `/api/sheet-scan` takes a raw server `pdf_path` (`routes.py:50-52` → `pymupdf.open` in `sheet_scanner.py:33`). Path traversal / arbitrary server file read. Must become upload-based or allow-listed before any shared demo.
- H4. BYOK is process-global, not session-scoped. `routes.py:277` sets `os.environ` for the whole server (any caller overwritesiani; `DELETE` wipes even the owner's dev key; no auth). Spec (`BYOK-SECURE-INTERFACE.md`) says session-scoped with expiry — implement that.
- H5. Trackers contradict reality. `TASKS.md` and `task_plan.md` show Phase 2–6 (and ENV-02) unchecked while `State.md` claims slices 0–5 COMPLETE; both still cite deleted `CLAUDE.md` (SPEC-01); `CONTINUATION-PLAN.md:27,83` still points at `ADR-002` for the VLM decision although the file is now `ADR-003`.

## Medium / low findings

- M1. Tests pollute the dev DB and depend on env: API tests write into `data/takeoff.sqlite3` (49 KB, present); mock-vs-live flips on ambient `MODEL_API_KEY`; BYOK test mutates process env (a mid-test failure cascades). Use tmp stores + monkeypatched config.
- M2. Dependency drift unexamined: `openai 3.41`, `fastapi 0.162`, `pymupdf 2.0` installed against loose `>=` pins, no lockfile; the live VLM path has never run against openai v3. Pin or verify before demo.
- M3. Downloads are uncurated: the 3 video `.txt` files are ~360 KB each of Facebook CSS soup (useless); dev.meta.ai `.txt` files have JS/nav preamble; no `docs/meta_api/README` index exists, so agents cannot "read and follow" ~3 MB of dumps.
- M4. Two scale engines, no canonical choice: `core_vector/scale.py` (47 KB, used by pipeline) vs `scale_validator.py` (used by SheetScan) can diverge. Pick one or define the boundary.
- M5. Damper count drift unexplained: 175 (Q&A) vs 168 (fixtures README/State). Reconcile or the benchmark slide is wrong.
- M6. Small code issues: `sheet_scanner.py:21` imports privates (`_extract_sheet_id`, `_infer_discipline`); VLM discipline at line 80 is always overwritten at line 103; CSV export has no coordinates though the demo story promises "linked coordinate crops" in the export; status transitions accept any→any; `schedule_parser.py:145` hides a category mismatch with `type: ignore`.
- M7. Features listed but never wired: Files API upload exists in `client.py` but no route/caller; SSE/streaming copilot promised (Q2.3 <1.0 s) but the endpoint is plain request/response; Tailwind v4 installed vs `Tech_stack.md` 3.4+ (spec drift); frontend fonts (Inconsolata/Libre Franklin/STIX) differ from `DESIGN.md` (Inter/JetBrains Mono).
- M8. Doc nits: `README.md` project tree omits `src/store`, `configs`, `fixtures`, `docs/meta_api`, `docs/specs`; claims "ADR-001, ADR-002" (there are 3); "Cooper-Style" (`README.md:60`) is unexplained jargon; `Questions.md:9` intro ("no implementation exists in this repo") is now stale; `AGENTS.md` directory boundaries don't mention the new `src/store`, `configs/`, `scripts/`, `fixtures/`, `data/` dirs.

## Prompt-item compliance

| Demand | Verdict |
|---|---|
| Remove all deprecations | NOT DONE — no audit artifact; only transitive package-lock notices exist |
| Project setup | PARTIAL — venv + scaffold good; trackers stale, constitution deleted (below) |
| Context maintenance + governance | PARTIAL — State/progress updated, but they contradict TASKS/task_plan; silent edits to my docs |
| Muse-from-terminal tasking | UNVERIFIABLE — no transcripts/logs in repo (`.muse/` empty + gitignored) |
| Strict weave design | NO EVIDENCE — zero "weave" references; styling is predecessor-carried |
| Cerebral Valley details download | FAILED — explicitly requested, still missing (only old overview) |
| dev.meta.ai overview/quickstart/models | PARTIAL — downloaded, needs curation (M3) |
| Cookbooks (API, fundamentals, muse-code, OSS) | DONE — mirrored + gitignored (unindexed, see M3) |
| On-demand session videos | FAILED IN EFFECT — fetched as CSS soup, unusable |
| Offline readable for agents | FAILED — no index/summaries |
| Install all SDKs | MOSTLY — backend + node present; openai-v3 risk open (M2) |
| Forward plan: named agents, how many, YOLO/architecture | PARTIAL — ADR-002 names 5 agents; no staffing/concurrency plan; YOLO→VLM done (ADR-003) but VLM detection itself unbuilt |
| Human-in-loop, researches, problem statement | PARTIAL — problem statement exists; zero new researches; C1/C3 violate HITL |
| Plain language, humaniser, de-verbose | NO EVIDENCE — no tool/config; docs still verbose |
| Master Checklist + ux-laws compliance check | NOT DONE — both source files exist in Downloads, no compliance artifact in repo |
| Superpowers, Context7, all tools | NOT DONE — `.agents/` and `.muse/` empty, no MCP configs |
| ECC-style autonomous setup (research first) | CLONED ONLY — `docs/research/ECC/` present + gitignored, nothing adopted |
| Don't copy openStage sample | DONE — correctly not copied |
| Break into parts, clean up, document | PARTIAL — sliced and mostly documented; cleanup failed (H1, C5, M8) |

## Suggested fix order (top 10)

1. C1: make copilot call `muse-wonder-1.0` with store tools; delete hardcoded scale/count/coords; fail closed when unverified. Fix the tests that assert the hardcoded answers.
2. C2: parse live crop-OCR JSON properly; on parse failure return `review_required=True`, never 24x12@0.95.
3. C3: default all machine-proposed records to `SUGGESTED`.
4. C4+C5: build the three missing components and wire frontend to the new `/api/*` endpoints (or cut scope honestly in State.md).
5. H3: remove raw `pdf_path` from `/api/sheet-scan` (upload or allow-list).
6. H1+H2: extend sanitizer scope (Imagineers/FIX-TRN/mep_ai), fix UI branding + playwright paths, restore the true dataset paths in Q3.2/CONTINUATION-PLAN.
7. H4: session-scoped BYOK with expiry; never let DELETE wipe the owner's env key.
8. H5+M8: reconcile TASKS/task_plan with State (or retire waterfall trackers); restore or formally remove CLAUDE.md; fix ADR-002→003 refs; update AGENTS.md boundaries.
9. M1+M2: isolate API tests from dev DB/env; pin or verify `openai>=3` live path with one real keyed call.
10. Prompt leftovers: download the hackathon details page; replace video soup with real summaries or drop it; write the Master-Checklist/ux-laws compliance note; index `docs/meta_api/`; decide weave/superpowers/Context7/ECC (adopt or explicitly defer in State.md).

## Limits of this audit

- `pytest`: 15/15 runnable tests passed here; 8 TestClient tests could not run in this sandbox (local socket blocked, WinError 10013 — environmental, not code). The 23/23 claim is plausible, not confirmed by me.
- Frontend build/tests not executed (static count matches 84); live Meta API paths never exercised (no key in this shell, by design).
- "Muse from terminal" activity and any verbal agreements are invisible from repo artifacts.
