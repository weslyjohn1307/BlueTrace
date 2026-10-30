# Prompt-Compliance & Demo-Readiness Audit — BlueTraceAI

- **Date:** 2026-10-30
- **Deadline in scope:** Meta Global AI Developer Hackathon — submissions close **Nov 4, 2026, 9:00 PM ET** (`docs/hackathon/HACKATHON_OVERVIEW.md:3`). That is **~4.5 working days** from this audit.
- **Scope:** the whole workspace against (a) `AGENTS.md`, (b) the two Downloads checklists, (c) the ten explicit asks in your prompt, and (d) the claim that the work was done "properly".
- **Method:** read-only review. Read all source, tests, configs and governance docs; re-ran every gate; no project file was modified. **The only file written is this audit.**
- **Supersedes:** `docs/AUDIT-2026-10-30-antigravity-slices-0-5.md` (also untracked). Its findings are folded in here; nothing in it is retracted.
- **Round 2:** a post-remediation re-audit of commit `21d1212` is appended as **§12**. It scores the fix, lists what is still open, and flags four issues the fix itself introduced.

---

## 0. Verdict in one paragraph

The repo has a **credible skeleton and an incredible demo**. The backend is small but real, the fixtures are genuine, and 107 tests pass. But the primary user path is **wired to an API that does not exist**, the "AI copilot" **never calls a model**, and the numbers it shows are **hardcoded constants presented as verified measurements**. That is the one failure mode `AGENTS.md` §2 forbids by name ("Never Hallucinate Dimensions"). Separately, **118 of 161 files are uncommitted** (the entire frontend among them), there is **no git remote**, and the governance files **contradict each other on whether the work is done**. On the checklists you supplied, the project passes roughly **1 in 4** applicable items. This is not a finished submission; it is a promising prototype with a fabricated demo layer. It is fixable in 4.5 days **only if scope is cut hard**, because the honest version of this product is a much smaller product than the one the UI currently advertises.

**Overall: 3.5 / 10 — not demo-ready. Remediable.**

| Dimension | Score | One-line justification |
|---|---|---|
| Architectural integrity | 2/10 | Frontend and backend share no contract; two competing scale engines. |
| Spec fidelity (AGENTS.md) | 2/10 | "Never hallucinate" and "fail-closed" are violated in shipped code paths. |
| Test integrity | 5/10 | 107 green tests, but the integration boundary is entirely mocked. |
| Security | 4/10 | No auth on a global-env mutation; arbitrary server-side file read. |
| Governance / context | 4/10 | Files exist and are detailed; they disagree about what is finished. |
| Tooling & deprecations | 5/10 | Lint clean where it runs; declared gates not installed; no CI at all. |
| Design system fidelity | 3/10 | `DESIGN.md` mandates a dark OKLCH system; UI ships light vellum with 37 raw hexes. |
| Demo readiness | 3/10 | The canvas is impressive; the data behind it is not real. |
| **Checklist compliance** | **~25%** | See §7; Phase 0/1/5/8 are the biggest holes. |

---

## 1. How to read the findings

| Severity | Meaning | Test |
|---|---|---|
| **P0** | Breaks the demo or breaches a stated invariant. Fix before anyone sees it. | Would a judge notice in 90 seconds, or would it produce a wrong quantity? |
| **P1** | Correctness/hygiene risk that will bite during the 4-day sprint. | Does it block work, corrupt state, or leak data? |
| **P2** | Drift, deprecation, or documentation debt. | Does it mislead the next agent or reviewer? |
| **P3** | Polish. | Nice to have. |

---

## 2. P0 — must fix before the demo

### P0-1. The UI cannot talk to the backend. At all.

- Frontend base URL: `/api/v1` (`frontend/src/api/client.ts:52`).
- Backend router prefix: `/api` (`src/api/routes.py:24`).
- Frontend calls a **runs/jobs/exports/copilot-query** surface (`client.ts:390` and throughout) that **does not exist** in this repo.
- Backend actually exposes only: `GET /api/health`, `POST /api/sheet-scan`, `POST /api/crop-ocr`, `POST /api/schedule/parse`, `POST /api/segment`, `POST /api/copilot`, `GET|POST /api/takeoff/items`, `GET /api/takeoff/summary`, `GET /api/takeoff/export/{csv,json}`, `POST|DELETE /api/auth/byok` (`routes.py:68–282`).
- `vite.config` proxies `/api`, but the client prefixes `/api/v1`, so even a correctly-mounted backend 404s.

**Consequence:** the 84 frontend tests pass because `apiClient` is mocked in every one of them. The app has **never** executed its own happy path against this server. A judge who clicks "Analyze" gets a network error (or, worse, the demo runs on hardcoded `DemoDataProvider` data and looks fine until asked a question).

**Fix:** pick one contract. Given the deadline, the cheapest correct move is to make the frontend call the real endpoints (`/api/crop-ocr`, `/api/takeoff/*`, `/api/copilot`) and delete the dead `/api/v1` client surface, rather than building a `/api/v1` façade over five endpoints.

### P0-2. Fabricated dimensions are returned as verified measurements.

This is the violation of `AGENTS.md` §2.1 and §2.2, and it is in three separate paths.

| Location | What it does | Why it is P0 |
|---|---|---|
| `src/meta_services/copilot.py:31` | Always answers `"Sheet ... is calibrated at 1/4" = 1'-0" (scale factor 48.0)"` | Hardcoded scale, regardless of sheet. |
| `copilot.py:36,65,79` | `scale_verified=True` unconditionally | Directly contradicts the fail-closed rule. |
| `copilot.py:46` | `count = len(equip_items) or 14` | Inventing `14` when the list is empty. |
| `copilot.py:64` | `referenced_item_ids=item_ids or ["item_01","item_02"]` | Fake citations to non-existent records. |
| `src/api/routes.py:111–113` | `detected_text="24x12"`, `width=24.0`, `height=12.0` defaults | Any unparsed VLM response becomes a plausible duct size. |
| `routes.py:124` | `confidence=result.get("confidence", 0.95)` | Fabricated 95% confidence. |
| `routes.py:128` | `review_required=False` | Fabricated measurement is auto-accepted. |
| `src/meta_services/schedule_parser.py:148,153` | `status="ACCEPTED"`, `confidence=0.95` | Mock rows (`VAV-01`, `EF-1`, …) are written to the ledger as human-approved. |

**Consequence:** the product's core claim — "measurements trace to physical vector coordinates and validated scale ratios" — is false in the code path a judge will exercise. This is worse than a missing feature, because it is *confident* wrong output in a domain (construction takeoff) where wrong quantities have real cost.

**Fix:** every one of these paths must return `review_required=True` / `status="SUGGESTED"` when the source is a default or a mock, and the defaults must be removed so absence of data is an error, not `24x12`. `scale_verified` must be computed from `scale_validator` output, never typed by hand.

### P0-3. The work is not committed, and there is no remote.

- `git rev-list --count HEAD` → **6 commits**; last commit `3a66647`.
- `git status --porcelain -uall` → **128 entries**, of which **118 are untracked**.
- `git ls-files` → **43 tracked files**. The entire `frontend/`, all fixtures, all new tests, `docs/specs/`, `configs/`, and the offline-docs downloader are untracked.
- `git remote -v` → **empty**. There is no off-machine copy.
- `CLAUDE.md` is **deleted in the worktree** but still in `HEAD` (` D CLAUDE.md`), i.e. the constitution was removed and the deletion not recorded.

**Consequence:** one disk failure or one bad `git clean` erases the submission. This is the single highest-expected-loss item in the audit, and it is also the cheapest to fix (minutes).

### P0-4. The "AI" features are template matching, not model calls.

`src/meta_services/copilot.py` is a keyword router with literal answer strings. The docstring says `muse-wonder-1.0`; the code never constructs a request. Same pattern in `schedule_parser.py` (hardcoded `VAV-01`, `VAV-02`, `EF-1`, `S1`). `MetaClient` does have real call paths, but the copilot never reaches them.

**Consequence:** the hackathon's central judging axis is "creative & deep integration of Meta models". A judge who asks the copilot an off-script question gets a canned string. This is detectable in one question and unrecoverable in credibility terms.

**Fix (minimum):** route `/api/copilot` through `client` with a real prompt + a strict JSON schema, and keep the keyword router only as an explicit offline fallback that is *labelled* as such in the response (`mode: "offline_template"`).

### P0-5. The demo path does not contain the promised point-of-need UI.

Per the prior audit and confirmed by file listing, `HoverBadge.tsx`, `SheetTree.tsx`, and `CopilotDrawer.tsx` do not exist. What exists is `WorkspaceApp.tsx` + a story mode. The 300×300 hover-crop endpoint (`/api/crop-ocr`) has **no caller in the frontend**. The story pages (`storyContent.ts:47,80`) still explain YOLO/DETR as the detection approach, which contradicts ADR-003.

**Consequence:** the headline claim ("real-time canvas hover interactions operate on 300×300 px crops for sub-second latency") is unexercised. The 84 tests validate the old batch-pipeline UX.

---

## 3. P1 — fix during the sprint

### P1-1. Two scale engines that can disagree.

- `src/core_vector/scale.py` — 1,076 lines, used by `pipeline.py`; cites `ADR-002/004/006` with meanings that **do not match** the repo's ADRs, and references a non-existent `docs/STATUS.md`.
- `src/core_vector/scale_validator.py` — 52 lines, used by `SheetScanner`.
- They are not layered; they are parallel. A sheet can be "verified" by one and "review_required" by the other.

**Fix:** declare `scale_validator.py` canonical (it is the small, testable one), make `scale.py` a thin adapter or delete it, and add a cross-check test that asserts agreement on the fixtures.

### P1-2. `POST /api/auth/byok` is unauthenticated and mutates process-global `os.environ`.

- `routes.py:271` — no session, no auth, no expiry.
- Any caller can overwrite the server's key; `DELETE` wipes it for everyone.
- `docs/specs/BYOK-SECURE-INTERFACE.md` specifies session-scoped + expiry, and its checklist is unchecked.

**Fix:** scope the key to a signed session cookie, never touch `os.environ`, and expire it. If time is short, disable the endpoint for the demo rather than ship a global-key overwrite.

### P1-3. `POST /api/sheet-scan` reads an arbitrary server-side path.

`routes.py:83–95` passes `request.pdf_path` straight to `scanner.scan_page()` → `pymupdf.open`. That is arbitrary local file read (and a sync blocking call inside an `async def`). It also 404s with the user-supplied path echoed back.

**Fix:** accept an upload (`UploadFile`), cap size, store under a random name in `data/uploads/`, and validate magic bytes. Blocking work goes to `run_in_threadpool`.

### P1-4. Governance contradicts itself about completion.

| File | Claim |
|---|---|
| `State.md`, `progress.md` | Slices 0–5 **COMPLETE** |
| `TASKS.md`, `task_plan.md` | Phases 2–6 **unchecked** |
| `prd.json` | all milestones **`pending`** |
| `README.md:85` | "Python **3.10+**" vs `AGENTS.md` "3.13+" |
| `pyproject.toml:6,35` | `requires-python = ">=3.10"`, ruff `py310` — venv is **3.13.13** |

An agent reading this repo cannot tell what is done. That is the definition of a context-maintenance failure.

### P1-5. The declared type-check gate does not exist.

`pyproject.toml:26` lists `mypy>=1.13.0` in dev dependencies; `python -m mypy` → **No module named mypy**. `AGENTS.md` §4 lists `pyright`/`mypy` as a verification command. A gate nobody can run is not a gate.

### P1-6. `yaml` is imported but undeclared.

`pipeline.py` and `scale.py` `import yaml`; `PyYAML 6.0.3` is present in the venv but absent from `pyproject.toml` dependencies. A clean install breaks the core engine. This also violates `AGENTS.md` §2.4 (dependency minimalism) in the sense that the manifest is not the source of truth.

### P1-7. The primary review action is not persisted.

`frontend/src/workspace/WorkspaceApp.tsx` `handleReview` mutates local state only; `ReviewPanel.tsx` (used by `RunViewer`) does call `appendReviewEvent` (`ReviewPanel.tsx:79`). So in the workspace — the screen you will demo — clicking accept/reject leaves no audit trail, while the code that does persist sits on a route you may not show.

### P1-8. Test isolation is not real.

- Tests write to the production-path DB `data/takeoff.sqlite3` (49 KB, present, gitignored). No per-test tmp store.
- `pytest-of-DANIEL/` exists in the repo root with permission-denied ACLs and is **not** gitignored; it breaks recursive globs and will break a clean clone.
- `tests/` flip between mock and live depending on ambient `MODEL_API_KEY`.

**Fix:** `tmp_path` fixtures + `monkeypatch.setenv`, and add `pytest-of-*/` to `.gitignore`.

---

## 4. P2 / P3 — drift, deprecations, polish

| ID | Finding | Evidence |
|---|---|---|
| P2-1 | `pytest-asyncio` deprecation warning on every run: `asyncio_default_fixture_loop_scope` unset | reproduced in `pytest tests/` output |
| P2-2 | `scripts/` fails lint: 13 errors (UP035/UP006 `typing.List/Tuple`, unused imports, BLE001) | `ruff check src tests scripts` → 13 |
| P2-3 | `DESIGN.md` mandates dark OKLCH blueprint + Inter/JetBrains; UI ships light "Autodesk HIG" vellum, Libre Franklin/STIX/Inconsolata, **37 raw hex** values in `styles/index.css` | `frontend/package.json` fonts; `index.css` |
| P2-4 | No `prefers-reduced-motion` (0 occurrences) and no `:focus-visible` styling (0 occurrences) anywhere in `frontend/src` | grep count |
| P2-5 | YOLO still advertised in the live UI despite ADR-003 ("VLM detection replaces YOLO"): "YOLO11n model weights loaded and verified", "YOLOv11 neural detector for fire dampers" | `WorkspaceTopNav.tsx:220`, `WorkspaceApp.tsx:739`, `ContextualInspector.tsx:157`, `ComponentsSection.tsx:62`, `GlobalTopNav.tsx:159` |
| P2-6 | Sample drawing labelled "Avexis P.21" but fixture is page 22 | `WorkspaceApp.tsx`; `fixtures/mechanical/avexis_page_22.pdf` |
| P2-7 | `ModeBanner.tsx:20` displays "FastAPI /api/v1" — the contract that does not exist | `ModeBanner.tsx:20` |
| P2-8 | 404 page says "MEP Design AI" (pre-rename brand) | app router |
| P2-9 | SQLite: new connection per call, no WAL, no `busy_timeout`, no single-writer discipline, no pagination; `INSERT OR REPLACE` resets `created_at`; FK enforcement off | `src/store/takeoff_store.py` |
| P2-10 | DB path drift: store defaults to `data/takeoff.sqlite3`; `.env.example` documents `DATABASE_PATH=data/bluetrace.db`, which is never read | `takeoff_store.py`; `.env.example` |
| P2-11 | `findings.md:5–11` asserts an "Official Judging Rubric" with prize splits and weights; **0 matches** for those numbers in the scraped hackathon page | `HACKATHON_OVERVIEW.md` has none |
| P2-12 | Damper count inconsistent across docs: 168 / 175 / 32 | `findings.md`, `fixtures/README.md`, `State.md` |
| P2-13 | "329 centerline runs" conflicts with `pipeline.py`'s own docstring, which says the length is duct **boundary perimeter, not centerline**, and "not production-validated" | `pipeline.py` |
| P2-14 | `README.md` omits `src/store`, `configs/`, `fixtures/`, `docs/meta_api`, `docs/specs` from the tree; "ADR-001, ADR-002" but three ADRs exist | `README.md` |
| P2-15 | `AGENTS.md` directory boundaries do not mention `src/store/`, `configs/`, `scripts/`, `fixtures/`, `data/` | `AGENTS.md` §3 |
| P3-1 | `frontend/` has no README; root has no LICENSE, CHANGELOG, CONTRIBUTING, SECURITY, `.editorconfig`, Makefile | filesystem |
| P3-2 | No lockfile discipline on the Python side; frontend has `package-lock.json` (good) | filesystem |
| P3-3 | 572 kB single JS chunk warning on build | `npm run build` |
| P3-4 | Playwright config has no `webServer`, no npm script, and is never run | `frontend/playwright.config.ts` |
| P3-5 | Story content contains unverifiable hard metrics (`789,516 annotations`, `80.1%`, `100%`, commit `0ebbc80d`) and "Cloud API Calls 0", which contradicts the Meta-API dependency | `storyContent.ts` |
| P3-6 | Story/branding still shows "Imagineers" in 5+ components | prior audit, `GlobalTopNav.tsx:60` et al. |

---

## 5. Claim vs. reality

| Claim (in repo) | Reality | Verdict |
|---|---|---|
| "Never hallucinate dimensions" | `24x12`, `14`, `1/4"=1'-0"`, `0.95` are literals | **False** |
| "Fail-closed scale rule" | `scale_verified=True` hardcoded; `review_required=False` | **False** |
| "Copilot via muse-wonder-1.0" | keyword router, no API call | **False** |
| "Slices 0–5 COMPLETE" | `prd.json` all `pending`; phases 2–6 unchecked | **Contradicted** |
| "Frontend + backend integrated" | `/api/v1` vs `/api`; zero matching routes | **False** |
| "YOLO dropped" | YOLO in live UI copy in 5+ places | **Partly false** |
| "Official Judging Rubric 30/25/20/25" | not present in the scraped source | **Unverified** |
| "Meta docs were not downloaded" (your claim) | **They were** — see §6.1 | **Your premise is wrong** |
| "Offline docs available to future agents" | gitignored (`docs/meta_api/*.txt`, `*.raw`, cookbook dirs) and downloader untracked | **False for a clone** |
| "150 DPI hardware-accelerated canvas" | canvas exists and is the strongest asset | **True** |
| "Parameterized SQL, no string concat" | true in `takeoff_store.py` | **True** |
| "Backend tests 23 / frontend 84 pass" | reproduced: 23 passed; 84/84 | **True** |

---

## 6. Direct answers to what you asked for

You asked for ten distinct things in the prompt. Here is the status of each, without hedging.

### 6.1 "The hackathon docs were not downloaded" — **this is wrong, but the underlying worry is right**

They **were** downloaded, and thoroughly:

- `docs/meta_api/meta_overview.{raw,txt}`, `meta_quickstart.{raw,txt}`, `meta_models.{raw,txt}`
- `docs/meta_api/meta-model-cookbook/` (full repo: `01_api_fundamentals` … `07_sam`, `04_muse_code`)
- `docs/meta_api/meta-oss-cookbook/`
- three video transcripts (`video_muse_spark`, `video_building_muse_code`, `video_superintelligence_blueprint`)
- `docs/hackathon/HACKATHON_OVERVIEW.md` with the real deadline

So the failure is not acquisition, it is **durability and curation**:

1. `.gitignore:20–24` excludes the cookbooks, every `*.raw` and every `*.txt`. A fresh clone gets **none** of it.
2. `scripts/download_meta_docs.py` — the only thing that could reproduce it — is **untracked**.
3. There is no `docs/meta_api/README.md` index, so an agent cannot find the right file among ~3 MB of dumps.
4. The `.txt` transcripts are large CSS/JS soup (Facebook page noise), not usable text.

**Correction to your model of the situation:** an earlier agent did the research. A *future* agent (or a judge cloning the repo) sees an empty folder. Fix by committing an index + the distilled facts, not the raw dumps.

### 6.2 Deprecations — inventory against §11 of the Master Checklist

| Registry item | Present here? | Action |
|---|---|---|
| Monolithic `.cursorrules` / `AGENDS.md` typo | No `.cursorrules`; `AGENTS.md` is ~80 lines (under 200) | ✅ good |
| Python `typing.List` / `typing.Tuple` (PEP 585) | **Yes** — UP035/UP006 in `scripts/` | `ruff --fix` |
| `pytest-asyncio` implicit loop scope | **Yes** — warning every run | set `asyncio_default_fixture_loop_scope = "function"` |
| Live `litellm==1.107.0` compromise | not used | ✅ |
| OpenCode `< 1.18.33` RCE | your runtime is current | ✅ |
| Stateful MCP / SSE transport | no MCP at all | N/A (see 6.9) |
| `mypy` declared but absent | **Yes** | install or delete the claim |
| `requires-python >=3.10` vs 3.13+ | **Yes** | bump + `target-version = "py313"` |
| `INSERT OR REPLACE` (destroys `created_at`) | **Yes** | use `ON CONFLICT DO UPDATE` |
| Sync I/O in `async def` | **Yes** (`routes.py:91`, PyMuPDF) | `run_in_threadpool` |
| FastAPI `@app.on_event` | not present (lifespan used) | ✅ |

There is **no systematic deprecation sweep** in this repo. The two real ones (ruff `scripts/`, pytest-asyncio) are trivial; the rest are version/claim mismatches.

### 6.3 "Proper project setup" — largely absent

Present: `pyproject.toml`, `.gitignore`, `.env.example` (root + frontend), `AGENTS.md`, `DESIGN.md`, ADRs, `docs/`.

Missing (all expected by the checklist's Phase 0 / Phase 8):

- `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`
- `Makefile` or task runner (so `pytest`/`ruff`/`npm` are one command)
- CI (`.github/` does not exist) — **no gate runs on push**
- `.pre-commit-config.yaml` (a hook exists only in `.git/hooks/pre-commit`, machine-local, and calls bare `python`)
- Lockfile for Python
- `frontend/README.md`
- Python lint/type config that matches the 3.13 runtime

Root also violates the checklist's **12-file ceiling** (task scratchpads `findings.md`, `progress.md`, `State.md`, `prd.json`, `task_plan.md`, `Questions.md` all live at root and are exactly what Phase 8 says to purge before publishing).

### 6.4 "Context maintenance" — files exist, the mechanism does not

The Manus 3-file pattern is *nominally* present (`task_plan.md`, `findings.md`, `progress.md`) plus `State.md`. But:

- no `preToolUse` hook forcing a re-read of the plan;
- no `postToolUse` hook updating `progress.md`;
- no `stop` hook running tests before the agent ends;
- no append-only discipline — `State.md` and `progress.md` are rewritten claims, not logs;
- the three files disagree with `TASKS.md`/`prd.json` (P1-4), which means they are not trustworthy as memory.

So: **context scaffolding without context enforcement.** An agent that trusts `State.md` will believe the product works.

### 6.5 Agent architecture & naming

What exists: prose. `docs/` describes a "multi-agent collaboration layer"; `RES-04-MEP-AGENTIC-ARCHITECTURE.md` exists, but there is **no executable agent definition anywhere** — no `.opencode/`, no `opencode.json`, no subagent configs, no tool permissions, no skills, no commands.

What the prompt asked for ("plan the agent architecture/naming") is therefore **unfulfilled in the only sense that matters**: an agent you can run.

Recommended minimal architecture (fits the 4 days, names in the repo's existing `RES-`/`ADR-` style):

| Agent | Role | Tools | Boundary |
|---|---|---|---|
| `scout` | sheet reconnaissance, title block, scale candidate extraction | read-only files, muse-spark-1.3 | never writes ledger |
| `tracer` | deterministic vector/centerline (no LLM) | PyMuPDF, Shapely, NetworkX | pure function of bytes |
| `auditor` | scale reconciliation + fail-closed gate | `scale_validator` only | can veto, cannot approve |
| `estimator` | ledger writes, review events | store (write) | requires `auditor` pass |
| `copilot` | Q&A over ledger | muse-wonder-1.0, read-only store | **read-only**, must cite item IDs |

Naming rule to adopt now: one noun per file (`scout.py`, `tracer.py`…); no `_v2`, no `_new`, no agent monologue comments — this is also checklist §6.1.

**YOLO removal is incomplete.** ADR-003 says VLM replaces YOLO, the dependency is gone, but the *product surface* still sells YOLO (P2-5). Either remove the copy or the ADR is theatre. Given `sam-3.1` + `muse-spark-1.3` are genuinely available and better suited, remove the copy — it takes an hour and removes an obvious "this agent didn't finish the migration" tell.

### 6.6 Problem statement — it is stated as a feature list, not a problem

Current framing (README) leads with models and a collaboration layer. A judge needs, in this order:

1. **Who** — a mechanical estimator at a subcontractor, under bid deadline.
2. **What hurts** — manual quantity takeoff from PDF plans is hours of counting and scaling, and errors are expensive and invisible until install.
3. **Why now** — VLM + segmentation finally read drawings; deterministic geometry handles the part LLMs must not guess.
4. **What we do** — vectors measure, models read, humans approve; every number traceable to a coordinate and a verified scale.
5. **What we do not do** — no fabrication, no auto-accept, no "trust the model" numbers.

Right now #5 is contradicted by the code (P0-2). Fixing the code is what makes the statement true.

### 6.7 Verbosity / "humaniser"

Not applied. Evidence: `README.md` is ~90 lines of model-name prose with ASCII art; `docs/` contains multiple overlapping narratives (`CONTINUATION-PLAN.md`, `State.md`, `progress.md`, `Questions.md`, `findings.md`) that restate the same status. The checklist's own advice (context < 50%, progressive disclosure) is violated by the repo's own documentation.

A humaniser pass means: one README (problem → demo GIF → quickstart → architecture → limits), delete the rest, and move status into a single `State.md` that is *appended*, not rewritten.

### 6.8 "Weave design" — the term does not exist in this repo

`weave` appears **32 times**, all inside the vendored `docs/research/ECC/**/quarkus-tdd/SKILL.md` (Java `advice.weaveByToString`). Zero occurrences in project code, docs, `DESIGN.md`, or the two Downloads checklists.

So "strictly follow weave design" is **undefined and unverifiable**. Either you mean a specific design system you have elsewhere, or you mean `DESIGN.md`. If it is `DESIGN.md`, the UI fails it (P2-3). Ask for the source before anyone claims compliance — an agent cannot follow a spec that isn't in the workspace.

### 6.9 Superpowers / Context7 / ECC / autonomous setup — not installed

- `docs/research/ECC/` exists as **cloned reading material** (gitignored). Not installed, not wired.
- **No MCP servers at all.** No Context7. `~/.config/opencode/opencode.json` defines the Meta provider and muse models only.
- **No skills directory, no commands, no permissions, no subagents** in the project.
- `muse` **is** installed and usable: `Muse Code 1.4.14`, with `muse exec` (headless), `muse init`, `muse skills`, `muse mcp`, `muse trace`, `muse export`.

So the "autonomous setup" was **researched, not installed**. The tool to do it (`muse init`) is sitting there unused. That is the gap: 30 minutes of `muse init` + `muse mcp add context7` would have satisfied three checklist phases.

### 6.10 Cleanup list (mechanical, ~2 hours)

1. `git add -A && git commit` — then push to a remote. **Do this first.**
2. Add `pytest-of-*/` to `.gitignore`; delete the stray directory.
3. Delete or restore `CLAUDE.md` (currently deleted-but-tracked).
4. `ruff check scripts --fix`.
5. Set `asyncio_default_fixture_loop_scope = "function"`.
6. Bump `requires-python` to `>=3.13`, `target-version = "py313"`.
7. Add `pyyaml` to dependencies.
8. Remove YOLO copy from the 6 UI files.
9. Unify DB path to `data/bluetrace.db` **or** fix `.env.example` — one of the two.
10. Move root scratchpads (`findings.md`, `progress.md`, `State.md`, `prd.json`, `task_plan.md`) into `.agent/` before publish, or accept that Phase 8 fails.
11. Add `LICENSE`, `SECURITY.md`, `frontend/README.md`, `Makefile`.
12. Add `.github/workflows/ci.yml` running the four real gates.

---

## 7. Compliance matrix — the two Downloads checklists

### 7.1 Universal Vibe Coding & AI SDLC Master Checklist (2026)

Legend: **Met** / **Partial** / **Missing** / **N/A**.

| Phase | Status | What is actually there | What is missing |
|---|---|---|---|
| **0 — Blueprinting & SDD** | **Partial (≈50%)** | `AGENTS.md` (<200 lines ✅), `Overview.md`, `Tech_stack.md`, `Data_models.md`, `User_flows.md`, `DESIGN.md`, 3 ADRs, `State.md`, `prd.json`, `task_plan.md` | No `/vibe-research → /vibe-prd` style loop; blueprint files contradict each other; no committed sign-off; `design` contract unimplemented |
| **1 — Guardrails, rules, MCP** | **Missing (≈10%)** | `AGENTS.md` only | No glob-scoped rules; no `.context/` packs; no architecture graph; **no MCP config at all**; no Context7; no tool ceiling; no secret interpolation (nothing to interpolate) |
| **2 — Context engineering** | **Partial (≈40%)** | 3-file memory present by name; `State.md` handoff | No hooks (`preToolUse`/`postToolUse`/`stop`); no 2-action rule; no 3-strike protocol; no subagent isolation; no `/compact` discipline; files disagree with trackers |
| **3 — Anti-slop UI/UX** | **Partial (≈30%)** | A deliberate visual direction (vellum/CAD metaphor), real tokens, lucide icons, no purple-gradient slop ✅ | No taste-skill/`MASTER.md` preflight; design system not followed (37 raw hex); no slop audit; no wireframe/vision self-verification; no reduced-motion; no focus-visible |
| **4 — Implementation systems** | **Partial (≈35%)** | Vertical-ish layout under `src/`; deterministic core separated from adapters ✅; slices attempted | No Ralph/OODA loop; no worktree isolation; HITL is *inverted* (auto-ACCEPTED); micro-commits violated (128 uncommitted); no self-review artifacts |
| **5 — Quality engineering & CI** | **Missing (≈15%)** | `pytest` 23 ✅, `vitest` 84 ✅, `ruff` clean on `src tests` ✅, `eslint` clean ✅ | **No CI**; no `ai-verify`; no `gitleaks`; no pre-commit in VCS; no coverage gate; no golden/visual tests; Playwright unused; no memory-leak test; no contract tests between client and server (the P0-1 bug would have been caught by one) |
| **6 — Production readiness** | **Missing (≈15%)** | Parameterized SQL ✅; CORS tightened ✅; no secrets in git ✅ | No auth; no RLS/roles; no soft deletes; no UTC audit columns beyond `created_at`; no backups; no ACID wrapping; no UUIDs (string IDs); no billing caps; no queues; no OWASP LLM01/06/07 defenses; BYOK is process-global |
| **7 — Post-launch/observability** | **Missing (≈5%)** | `latency_ms` is measured | No correlation IDs; no metrics; no runbooks; no maintenance flag; no drift scans; no incident→memory loop |
| **8 — Repo sanitization** | **Missing (≈20%)** | `.gitignore` covers `.env`, `data/`, raw dumps ✅; no weights ✅ | Root scratchpads present (explicitly listed for purge); 12-file ceiling exceeded; no LICENSE/CHANGELOG/CONTRIBUTING/SECURITY; no 10-section README; no release tag; local-path/personal fingerprints not swept |
| **§11 — Deprecation registry** | **Partial (≈40%)** | No deprecated MCP/`litellm`/`.cursorrules`; `AGENTS.md` not `AGENDS.md` ✅ | `typing.List/Tuple`; pytest-asyncio scope; `mypy` phantom gate; Python version drift; `INSERT OR REPLACE`; sync-in-async |

**Aggregate: ~25% of applicable items.** The failure is concentrated in Phases 1, 5, 6, 7 — i.e. *everything that turns a prototype into a repo other people can run*.

### 7.2 UX Laws checklist — spot audit

| Section | Assessment | Evidence |
|---|---|---|
| 1. Motor / interaction cost (Fitts) | **Design intent good, unverified** | The 300×300 hover-crop idea is exactly right for Fitts' law, but `/api/crop-ocr` has no UI caller, so the interaction does not exist to test |
| 2. Decision & cognitive load | **At risk** | Three parallel modes (Demo / Live / Story) + `GlobalTopNav` + `WorkspaceTopNav` + `ModeBanner` = competing chrome; a first-time judge must choose a mode before understanding the product |
| 3. Familiarity & consistency | **Mixed** | The CAD/vellum metaphor is strong and domain-appropriate; but "MEP Design AI", "Imagineers", "YOLO11n", and "FastAPI /api/v1" all contradict the current product |
| 4. Gestalt / visual perception | **Weak** | 37 hardcoded hex values in one stylesheet defeats similarity/proximity consistency; spacing rhythm not tokenized |
| 5. Memory laws (recognition > recall) | **Fails** | Review decisions are not persisted in the workspace (P1-7), so the user must remember what they accepted |
| 6. Feedback, control & performance | **Partial** | `latency_ms` computed and returned; 8 `aria-live`/`role="status"` usages ✅; but no streaming, no progress feedback for long scans, and the reported latency is not surfaced |
| 7. Emotional / experience | **N/A** | No onboarding, no empty-state coaching beyond `EmptyPanel` |
| 8. Error prevention & forgiveness | **Fails** | Fail-open defaults (`24x12`, `0.95`, `review_required=False`) are the opposite of error prevention; no undo |
| 9. Persuasion / behavioral econ | **N/A** | — |
| 10. Meta laws | **Not applied** | No severity scoring, no audit artifacts, no `*.VQA.md` |
| 11. Dark-pattern red lines | **At risk** | "Cloud API Calls 0", fabricated annotation counts, and "model weights loaded and verified" are false confidence cues in a decision-support tool — this reads as deceptive UI even if unintended |
| 12. Severity scoring | **Absent** | No audit was ever run with the checklist's own scale |

**UX verdict: the aesthetic is above hackathon average; the interaction contract is unverified, and the trust surface actively misleads.** In a takeoff tool, trust *is* the product.

---

## 8. Was the work done "properly"?

No — but the failure is structural, not lazy.

**What was genuinely done well**

1. The deterministic core is real and correctly separated from the model layer. That is the hard architectural call, and it was made correctly.
2. The fixtures are real PDFs with ground truth. Most hackathon repos have none.
3. `AGENTS.md` is disciplined: <200 lines, clear boundaries, explicit invariants, exact commands.
4. The design has a point of view. Vellum/CAD is the right metaphor for estimators, and it avoids every item on the anti-slop ban list.
5. Verification hygiene on the *narrow* gates is good: `ruff`, `eslint`, `tsc`, 107 tests, all green.

**Why it still fails**

1. **Breadth without a stop-hook.** The prompt asked for ~10 major deliverables. The agent produced files for all of them and verified almost none end-to-end. A `stop` hook that ran "does the frontend reach the backend?" would have caught the single most damaging bug in the repo.
2. **Plausibility substituted for truth.** Where a real value was unavailable, the code supplied a believable one (`24x12`, `14`, `0.95`, `scale_verified=True`). In a measurement product this is the worst possible failure mode, and it is the exact one `AGENTS.md` was written to prevent.
3. **Governance as artifact, not mechanism.** `State.md`, `prd.json`, `task_plan.md` exist in the *shape* the checklist wants, but nothing enforces them, so they drifted into contradiction within days.
4. **The prompt itself invited this.** It bundled research, setup, architecture, design, cleanup, and two 60 KB checklists into one request. That is beyond a single session's verification budget. A correct response would have been to **sequence** it (setup → contract → one vertical slice → polish) and refuse the rest until the first slice ran end-to-end. Instead everything was attempted in parallel, which is why 118 files are uncommitted and the happy path was never executed.

**On the cut-off risk you flagged:** the evidence is consistent with work that stopped mid-stream rather than concluded — 118 untracked files, a deleted-but-tracked `CLAUDE.md`, contradictory completion claims, and a frontend built against a backend that was never wired. Whether or not a session was actually truncated, the repo *presents* as truncated. That matters independently, because the next agent inherits the same ambiguity.

**The honest one-liner:** this is a strong prototype wearing a finished product's clothes. Remove the costume (P0-2), connect the nervous system (P0-1), and commit it (P0-3), and it becomes a credible submission.

---

## 9. Five-day plan (Oct 30 → Nov 4, 9 PM ET)

Ordered by risk reduction per hour. Do not reorder.

**Day 0 — tonight, ~2 hours (protects everything else)**

1. `git add -A && git commit -m "chore: snapshot working tree before compliance sprint"`.
2. Create a private remote and push. **No remote = no submission.**
3. Delete `pytest-of-DANIEL/`, add `pytest-of-*/` to `.gitignore`.
4. Resolve `CLAUDE.md` (restore or commit the deletion).

**Day 1 — truth and contract (~8h)**

5. Kill every fabricated default: `copilot.py:31/36/46/64/79`, `routes.py:111–113/124/128`, `schedule_parser.py:148/153`. Return `review_required=True` / `SUGGESTED` on any fallback. Add one test per path asserting the fail-closed behaviour.
6. Delete the dead `/api/v1` client surface; point the app at the five real endpoints. Add **one** contract test that hits the real FastAPI app via `TestClient` and asserts every endpoint the client calls exists.
7. Pick `scale_validator.py` as canonical; make `scale.py` delegate to it; test agreement on the fixtures.

**Day 2 — make the AI real (~8h)**

8. Route `/api/copilot` to `muse-wonder-1.0` with a JSON schema. Keep the template router only as a labelled offline fallback.
9. If the live VLM path has never run against the installed `openai` version (prior audit flagged v3.41), run it once today. This is a schedule risk, not a code risk — discover it now, not on Nov 3.
10. Persist workspace reviews (`appendReviewEvent`), so the audit trail is real.

**Day 3 — the differentiator (~8h)**

11. Build the one interaction that proves the thesis: hover a duct → 300×300 crop → `/api/crop-ocr` → badge with dimension **and** `review_required` state. One component, one endpoint, one test. If it is not working by end of day, cut it and say so.
12. Remove YOLO copy from the 6 UI files; fix "MEP Design AI", "P.21", "Imagineers", "FastAPI /api/v1".

**Day 4 — presentation and publish (~8h)**

13. Rewrite `README.md`: problem → 20-second demo GIF → quickstart → architecture diagram → limits table. Delete the other narratives or move them to `.agent/`.
14. Record the demo video against the **real** path, showing a fail-closed rejection. That single moment is worth more to judges than any accuracy percentage.
15. Add `LICENSE`, `SECURITY.md`, `Makefile`, `.github/workflows/ci.yml`.
16. Push, tag, submit. Do not leave submission to Nov 4.

**Day 5 — buffer only.** If anything above slipped, it lands here. Do not plan new features.

**Cut list (decide now, not later):** Files API upload, SSE streaming copilot, Playwright e2e, story mode, admin surface, RLS, queues. None of these change the verdict; P0-2 does.

---

## 10. What not to do

- **Do not add features.** The gap is truthfulness and wiring, not surface area.
- **Do not "fix" the demo by making mocks more convincing.** That converts a credibility problem into a disqualification risk.
- **Do not move the frontend to `/api/v1` to match the client.** It is five endpoints; rename the client, not the server.
- **Do not install ECC/Superpowers/Context7 as a checklist ritual this week.** `muse init` + Context7 is 30 minutes and worth it; a full MCP stack is a distraction from P0-1.
- **Do not rewrite `scale.py` (1,076 lines).** Delegate to the 52-line validator and move on.
- **Do not claim the Downloads checklists are satisfied.** They are ~25%. Say what is true in the README's limitations table; judges reward candour and punish discovered overclaiming.

---

## 11. Appendix — reproduction

```powershell
# repo state
git rev-list --count HEAD          # 6
git status --porcelain -uall       # 128 entries (118 untracked)
git ls-files                       # 43 tracked
git remote -v                      # (empty)

# gates
.venv\Scripts\python.exe -m pytest tests/ -q          # 23 passed + PytestDeprecationWarning
.venv\Scripts\python.exe -m ruff check src tests      # clean
.venv\Scripts\python.exe -m ruff check src tests scripts  # 13 errors
.venv\Scripts\python.exe -m mypy --version            # No module named mypy
npm --prefix frontend run build                       # passes, 572 kB chunk warning
npm --prefix frontend run lint                        # clean
npm --prefix frontend run test -- --run               # 84/84

# contract mismatch
Select-String -Path src/api/routes.py -Pattern 'APIRouter\('        # prefix="/api"
Select-String -Path frontend/src/api/client.ts -Pattern "api/v1"   # '/api/v1'

# design drift
(Select-String -Path frontend/src/styles/index.css -Pattern '#[0-9a-fA-F]{6}' -AllMatches).Count  # 37
(Get-ChildItem frontend/src -Recurse -Include *.css,*.tsx | Select-String 'prefers-reduced-motion').Count  # 0
(Get-ChildItem frontend/src -Recurse -Include *.css,*.tsx | Select-String 'focus-visible').Count           # 0

# missing infrastructure
Test-Path .github, .opencode, opencode.json, .pre-commit-config.yaml   # all False

# undefined term
# "weave" → 32 hits, all inside docs/research/ECC/**/quarkus-tdd/SKILL.md
```

**Evidence index (highest-value files):** `src/api/routes.py:24,111–128,271` · `src/meta_services/copilot.py:31,36,46,64` · `src/meta_services/schedule_parser.py:148,153` · `frontend/src/api/client.ts:52` · `frontend/src/workspace/WorkspaceApp.tsx:739` · `frontend/src/styles/index.css` · `pyproject.toml:6,26,35` · `TASKS.md` vs `State.md` · `findings.md:5–11`.

---

*This audit made no code changes. The only file written is this report. Findings are reproducible with the commands above; where a claim could not be verified from primary sources, it is marked Unverified rather than asserted.*

---
---

# Round 2 — Post-Remediation Review

**Re-audited:** 2026-10-30, after commit `21d1212` ("remediate audit findings, enforce fail-closed truthfulness, unify api contracts, and secure byok").
**Revised score: 5.5 / 10** (up from 3.5). Real progress, but the headline bug is only half-fixed.

## 12.1 Genuinely fixed — verified, with evidence

| Finding | Before | Now | Evidence |
|---|---|---|---|
| P0-3 uncommitted work | 118 untracked | **0 untracked, 167 tracked, clean tree** | `git status -uall` |
| P0-2 copilot fabrication | `or 14`, fake IDs, hardcoded scale | reads `store.get_sheet()`, `scale_verified = scale_status in ("VERIFIED","CALIBRATED")` | `copilot.py:31–37` |
| P0-2 copilot never calls model | keyword router only | real `muse-wonder-1.0` path when `client.is_configured()` | `copilot.py:45` |
| P0-2 crop-ocr defaults | `24x12` / `0.95` / `review_required=False` | fails closed to `parsed_dimension=None`, `confidence=0.0`, `review_required=True` when unparsed | `routes.py:155–164` |
| P0-2 schedule auto-accept | `status="ACCEPTED"` | `status="SUGGESTED"` | `schedule_parser.py:152` |
| P1-3 arbitrary file read | raw `pdf_path` → PyMuPDF | resolve + containment check + `.pdf` suffix + `run_in_threadpool` | `routes.py:120–138` |
| P1-2 BYOK global `os.environ` | process-wide key overwrite | session-scoped dict with expiry, `X-Session-ID` | `routes.py:29–57,329–358` |
| P1-5 phantom mypy gate | not installed | `mypy 2.4.1` installed + `[tool.mypy]` | `pyproject.toml:43` |
| P1-6 undeclared `yaml` | imported, not declared | `pyyaml>=6.0.0` declared | `pyproject.toml:19` |
| P1-4 Python version drift | `>=3.10`, `py310` | `>=3.13`, `py313` | `pyproject.toml:6,36` |
| P2-1 pytest-asyncio warning | unset | `asyncio_default_fixture_loop_scope = "function"` | `pyproject.toml:40` |
| P2-2 ruff failures in `scripts/` | 13 errors | **All checks passed** | `ruff check src tests scripts` |
| P2-15 AGENTS boundaries | omitted 6 dirs | `src/store`, `src/models`, `configs`, `scripts`, `fixtures`, `data` added | `AGENTS.md:23–28` |
| Governance | `CLAUDE.md` deleted-but-tracked | restored | root listing |
| Test coverage | 23 tests | **25 passed**, incl. `test_api_contract.py`, `test_byok_security.py`, fail-closed assertions | `pytest tests/ -q` |

The fail-closed work is the important part and it is done correctly in the backend. Credit where due.

## 12.2 Still open — ranked

### **R-1 (P0, unchanged in substance). The "Analyze" button still 404s.**

The contract was *added* but never *migrated*. The client now contains both a working surface and the old dead one, and the app uses the dead one.

- `client.ts:263` `getHealth()` → `/health` → resolves to `/api/v1/health` → **404**.
- `useAnalysisWorkflow.ts:142–151` calls, in order: `getHealth()`, `getVersion()`, `createProject()`, `uploadDrawing()`, `getDrawingPreflight()` — **all legacy, all `/api/v1/*`, all 404**.
- `useAnalysisWorkflow` is mounted by the root route (`WorkspaceApp.tsx:179`), so the failure is on first interaction, and it is swallowed into a generic *"Failed to inspect uploaded drawing"* (`useAnalysisWorkflow.ts:165–167`) — which will read as a product bug, not a wiring bug.
- 28 legacy client methods, called from 11 UI files (`WorkspaceApp.tsx` 8, `RunViewer.tsx` 11, `LiveDataProvider.tsx` 8, `ProjectsView.tsx` 4, `ExportPanel.tsx` 4, …) — 48 call sites in total.
- Exactly **one** UI component consumes a real endpoint: `AskTheDrawingDrawer.tsx:176` → `queryCopilot` → `/api/copilot`.

**Net:** the only thing in the UI that can talk to this backend is the copilot drawer. Everything a judge clicks first cannot.

**Fix (half a day, highest value):** either (a) rewrite the six workflow calls to `scanSheet` / `parseSchedule` / takeoff endpoints and delete the project/run/job layer, or (b) delete the legacy surface and the screens that need it, and make the demo a single honest flow: upload → scan sheet → review suggestions → ask copilot. Option (b) is faster and more truthful.

### **R-2 (P0). Still no git remote.**

`git remote -v` → empty, with 167 files and 8.5 MB of fixtures now in one local commit. The commit-only half of P0-3 is fixed; the durability half is not. One `git push` closes it.

### **R-3 (P1). The new contract test gives false confidence.**

`tests/test_api_contract.py` is described as *"asserting that all frontend API client endpoints connect cleanly to the FastAPI backend"* — but it **hardcodes the backend's own routes** and never reads `frontend/src/api/client.ts`. Consequently it passes while 28 client methods point at `/api/v1/*` that do not exist. This is the same failure mode as the old sanitizer: a check that reports PASS on the thing it does not check.

**Fix:** parse `client.ts` for `request<T>('...')` literals, resolve them through the same base-URL rule, and assert each against `app.routes`. ~40 lines, and it would have caught R-1.

### **R-4 (P1). One user's "clear key" silently downgrades everyone.**

`_byok_disabled_for_session: bool` (`routes.py:30`) is a **process-global flag**, checked at `routes.py:56`. After any client calls `DELETE /api/auth/byok`, every subsequent request from every session returns `MetaModelClient(api_key="mock_key_unconfigured")` — i.e. the whole server silently falls back to mock behaviour until someone re-configures a key.

That is a cross-session DoS *and* a silent correctness downgrade, which is precisely the audit's central theme. Make the flag session-scoped (`_disabled_sessions: set[str]`), and have the mock fallback be visible in the response (`mode: "offline"`), not silent.

Also: `_session_keys` has no eviction sweep — expired entries are only removed when that session is accessed again.

### **R-5 (P1). Provenance is still asserted, not computed.**

`client.ts:470` hardcodes `external_model_used: true` on every copilot response, regardless of whether the backend used `muse-wonder-1.0` or the template fallback. The backend now knows the difference; the client throws that knowledge away. Return the backend's actual `mode` and pass it through.

### **R-6 (P1). Two scale engines, still unreconciled.**

`scale.py` is 45,801 bytes; `scale_validator.py` is 2,352. `pipeline.py:42` still imports `detect_scale` from `scale.py`. Nothing changed here. The dual-engine risk described in §3/P1-1 is intact.

### **R-7 (P2). The version trap is still armed.**

`client.ts:52` still defaults `baseUrl` to `/api/v1`. The `request()` helper special-cases endpoints beginning with `api/` (`client.ts:63–66`), which is why the new calls work — but **any future method written without the `api/` prefix silently lands on the dead namespace**. That is how this bug happened the first time. Delete the default (or set it to `/api`) once the legacy surface is gone.

### **R-8 (P2). Store durability unchanged.**

`INSERT OR REPLACE` at `takeoff_store.py:129,151,188,221` (resets `created_at`); no `PRAGMA journal_mode=WAL`, `busy_timeout`, or `foreign_keys=ON` anywhere. P2-9 stands.

### **R-9 (P2). Copy and design drift unchanged.**

- YOLO: **10 occurrences** remain in `frontend/src`, including `WorkspaceTopNav.tsx` ("YOLO11n model weights loaded and verified") — a false claim, still.
- "MEP Design AI" in 5 non-test files (`AppRouter.tsx:22`, `GlobalTopNav.tsx:51`, `WorkspaceShell.tsx:68`, `StoryHeader.tsx:32`, `StoryPage.tsx:144`) plus `WorkspaceTopNav.tsx:90`.
- `index.css`: **37 raw hex**, **0 `oklch`** — `DESIGN.md` still unimplemented.
- **0** `prefers-reduced-motion`, **0** `:focus-visible`.
- `/api/v1` still rendered in UI copy (3 sites).

### **R-10 (P2). Config name drift.**

`.env.example:15` documents `DATABASE_PATH=data/bluetrace.db`; the code reads `BLUETRACE_DB_PATH` with default `data/takeoff.sqlite3` (`routes.py:66`). Setting the documented variable does nothing.

### **R-11 (P2). Infrastructure still absent.**

`.github/`, `.pre-commit-config.yaml`, `.opencode/`, `opencode.json`, `LICENSE` — **all still missing**. No CI, so none of the fixes above are gated against regression. `State.md:4,18` still claims "Slice 3 — Point-of-Need UI — COMPLETE", which remains untrue (no crop UI consumes `extractCropOcr`).

## 12.3 Small new nits found while re-checking

1. `routes.py:169` — `confidence` still defaults to `0.95` on the success path, and `routes.py:166` accepts `width=0.0` (the guard tests `is None`, not falsy). A model response of `{"width": 0}` yields a "0x0 Rectangular Duct" badge with 95% confidence and `review_required=False`.
2. `getHealth` and `getMetaHealth` both exist (`client.ts:263` vs `:514`); only the second is correct, and only the first is called.
3. `scanSheet` takes a **server-side path string**, so even with containment the browser cannot use it — an upload endpoint is still needed before any real UI can drive it.
4. `test_api_contract.py` creates real rows in the real DB (no `tmp_path`), so P1-8 test isolation is still open.

## 12.4 Shortest path from 5.5 to submission

Three items, in this order, and nothing else:

1. **`git remote add` + push** (10 minutes). Eliminates the only unrecoverable risk left.
2. **Pick one flow and make it real** (half a day). Recommended: delete the project/run/job legacy surface and demo `upload → scanSheet → review SUGGESTED items → copilot`. This removes R-1, R-7, and most of R-9's confusion at once.
3. **Make the contract test read `client.ts`** (1 hour). It is the cheapest permanent guard against R-1 recurring, and it converts the test suite's biggest false claim into its most useful check.

Everything else in this document is polish relative to those three. The backend now tells the truth; the frontend still points at a backend that never existed.



