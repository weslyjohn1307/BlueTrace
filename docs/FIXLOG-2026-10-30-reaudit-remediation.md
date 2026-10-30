# Fix Log: Re-audit Remediation (§12 + N1–N8)

> Date: 2026-10-30. Covers the ranked re-audit list (§12 of
> `docs/AUDIT-2026-10-30-prompt-compliance.md`, commit `21d1212`) and the eight
> follow-up gaps (N1–N8). Work spans two sessions; this log credits who did
> what and says how each item was verified. Nothing here is claimed fixed
> without a file:line or a passing gate behind it.

## Ranked findings (R-1 … R-11)

| ID | Finding | Status | Fixed by | Verification |
|---|---|---|---|---|
| R-1 | Frontend called dead `/api/v1`; judge's first click 404s | **Fixed** | This session | Legacy surface deleted (28 methods, ~50 files); new `TakeoffWorkspace` flow calls only `/api/*`; `test_no_dead_namespace_in_client` + strict `test_every_client_endpoint_exists` green |
| R-2 | Tests mutated `os.environ` / shared dev DB | **Fixed** | Prior session (conftest), hardened this session | `tests/conftest.py`: sync autouse reset + explicit `isolated_takeoff_store` fixture; API tests wired to it |
| R-3 | Contract test hardcoded routes, never read `client.ts` | **Fixed** | Prior session (parser), strict this session | Parser + comment-strip; `LEGACY_DEAD` removed; missing-set must be empty (6/6 guard tests pass) |
| R-4 | `_byok_disabled_for_session` process-global | **Fixed** | Prior session (per-session set), +eviction sweep this session | `routes.py` `_disabled_sessions: set[str]` + lazy expiry sweep; `test_byok_opt_out_is_session_scoped` |
| R-5 | `external_model_used: true` hardcoded | **Fixed** | Prior session (passthrough), legacy adapter deleted this session | `CopilotPanel` renders `model_used` from the live response only |
| R-6 | Dual scale engines, no canonical choice | **Fixed (boundary)** | This session | Declared boundary in both module docstrings (`scale.py` = pipeline-internal gating, `scale_validator.py` = API parsing) + `test_scale_validator_reconciles_with_pipeline_scale` |
| R-7 | `client.ts` defaults to `/api/v1` | **Fixed** | This session | Client rewritten; default `/api`, all endpoints absolute, no special-case |
| R-8 | SQLite: no WAL/`busy_timeout`/FK; `INSERT OR REPLACE` resets `created_at` | **Fixed** | This session | `_session()` helper applies all three pragmas; upserts use `ON CONFLICT … DO UPDATE` preserving `created_at` |
| R-9 | YOLO copy in product UI | **Fixed** | This session | Workspace copy deleted with legacy UI; story mode reframed to legend-grounded VLM; sanitizer + boundary test forbid regressions |
| R-10 | `.env.example` wrong DB variable | **Fixed** | Prior session | `BLUETRACE_DB_PATH` documented |
| R-11 | No remote, no CI, LICENSE, pre-commit config | **Partial** | This session: `.github/workflows/ci.yml` added | No remote (needs owner action); LICENSE choice left to owner; `.pre-commit-config.yaml` deferred (hook already in `.git/hooks/`) |

## Follow-up gaps (N1–N8)

| ID | Gap | Status |
|---|---|---|
| N1 | No upload endpoint ("user drops PDF" impossible) | Fixed (prior session: `POST /api/upload`); wired to workspace drop zone this session |
| N2 | VLM shape string could 500 the endpoint | Fixed (prior session: `coerce_shape` validator in `schemas.py`) |
| N3 | `requires-python >=3.13` vs locked 3.10–3.13 | Fixed (prior session: restored `>=3.10`) |
| N4 | "MEP Design AI" brand remnants | Fixed (shared: prior session swept app files; this session fixed story/tests/docs stragglers) |
| N5 | `frontend/.env.example` pointed at `/api/v1` | Fixed (prior session) |
| N6 | BYOK DELETE wiped owner's env key | Fixed (prior session: per-session opt-out) |
| N7 | Video "transcripts" were CSS soup | Mitigated (prior session: `docs/meta_api/SESSION_*.md` guides). Honest note: these are syntheses from dev docs + our client code, not video transcripts |
| N8 | No Master-Checklist/ux-laws artifact | Fixed (prior session: `docs/COMPLIANCE-*.md`); this session corrected 4 stale lines (ADR count, test count, deleted file, removed ratchet) |

## New issues found while finishing (all fixed)

- `takeoff_store.py` referenced non-existent `it.coordinates_bbox` (CSV export crash) → uses `it.geometry`.
- `conftest.py` autouse fixture ran `asyncio.run` for every test → split into sync autouse reset + explicit async fixture; Windows selector-loop policy for locked-down runners.
- Contract parser matched `/api/...` inside a code comment → strips `//` comments before parsing.
- `WEAVE-AND-AI-TOOLING-DECISION.md` claimed an unbuilt `system_metrics` table, copilot `latency_ms`, and a Weave hook → reworded to planned/future.
- `TASKS.md` falsely checked DOC-04 (no legend extractor exists) and stale counts/paths → reconciled; `task_plan.md` synced.

## Still open (not this turn)

- VER-02 demo video, SUBMIT (remote + push), DOC-04 legend extractor, SEG-01 canvas trigger, pagination on list endpoints, LICENSE choice, `.pre-commit-config.yaml`, `system_metrics` table, Weave exporter hook.
- Backend TestClient/async tests need loopback sockets; they error in fully locked-down sandboxes (environmental, not code). CI runs them on a normal runner.

---

## Round 3 — Task-completion audit (2026-10-30, Planning stage)

Full detail: `docs/AUDIT-2026-10-30-prompt-compliance.md` §13. Fixes F-1…F-8:

- **F-2 (real bug)**: user PDF upload broken — frontend sent multipart `FormData`, backend rejects multipart by design. Proven multipart → 400 / raw → 200. Client now sends raw bytes + `?filename=`; frontend test corrected; 4 backend upload tests added. Backend suite 35 → **39 passed**.
- F-1: Playwright spec unused-var broke `eslint` (and would have broken CI) — fixed.
- F-3…F-7: `prd.json` synced with TASKS; `AGENTS.md` layout/commands corrected (no `src/document/`, configured `mypy`); `DESIGN.md` aligned to implemented light-vellum/Inconsolata system; META-05 "tool calling" overclaim corrected; stale test counts updated (39 backend / 25 frontend).
- F-8: `UI-UX-FLOWS.md` upload description corrected (raw/JSON, 150 MB).
- Gates after fixes: backend 39/39, frontend 25/25, build, ruff, mypy (configured), eslint, sanitizer — all green.
- Still open and expected at Planning stage: commit of R-1 working tree (94 entries), remote, LICENSE, VER-02, DOC-04, SEG-01 canvas trigger.
