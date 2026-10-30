<div align="center">

```text
██████╗ ██╗     ██╗   ██╗███████╗████████╗██████╗  █████╗  ██████╗███████╗
██╔══██╗██║     ██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝
██████╔╝██║     ██║   ██║█████╗     ██║   ██████╔╝███████║██║     █████╗
██╔══██╗██║     ██║   ██║██╔══╝     ██║   ██╔══██╗██╔══██║██║     ██╔══╝
██████╔╝███████╗╚██████╔╝███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗
╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝
```

# BlueTraceAI

### The drawing sheet is the interface — point-of-need MEP takeoff, with receipts

[![Stage: Planning](https://img.shields.io/badge/stage-planning-orange)](docs/PRODUCT-VISION.md)
[![Python 3.10–3.13](https://img.shields.io/badge/python-3.10--3.13-blue)](pyproject.toml)
[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)](src/api/)
[![React 19](https://img.shields.io/badge/frontend-React_19-61DAFB)](frontend/)
[![Backend tests: 39 passing](https://img.shields.io/badge/backend_tests-39_passing-brightgreen)](tests/)
[![Frontend tests: 25 passing](https://img.shields.io/badge/frontend_tests-25_passing-brightgreen)](frontend/src/test/)

<!-- After the GitHub repo is created, replace the two test badges above with the live Actions badge:
[![CI](https://github.com/<owner>/bluetrace-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/bluetrace-ai/actions/workflows/ci.yml)
-->

</div>

---

## The problem

A mechanical estimator pricing a commercial bid does the same punishing loop for every sheet:

1. Find the sheet, read its title block, confirm its scale.
2. Count and measure duct, pipe, and equipment — by hand, on paper or in a PDF viewer.
3. Cross-reference every schedule tag (`VAV-1`, `S1`, …) against the floor plan.
4. Type it all into a spreadsheet, hoping nothing was missed or mis-scaled.

It takes hours per bid, errors are invisible until installation, and a wrong scale silently corrupts every length on the sheet. Generic AI extraction makes this worse, not better: a model that *guesses* a dimension with confidence is a liability in a domain where quantities become purchase orders.

## What BlueTraceAI does differently

**Vectors measure. Models read. Humans approve.**

| Layer | Job | Rule |
|---|---|---|
| **Deterministic engine** (PyMuPDF, Shapely, NetworkX) | Extract native PDF vector linework, trace paired double-line duct centerlines, verify scale | Lengths come only from physical coordinates × a validated scale ratio |
| **Meta Model API** (`muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0`) | Read title blocks, schedule tables, and hover crops; answer questions about the sheet | Models propose; they never silently approve |
| **Human reviewer** | Accept or reject every suggestion in the ledger | Nothing enters the takeoff without a click |

And the invariant the whole system is built around:

> **Fail closed.** Unverified scale, unparsed crop, or missing confidence ⇒ `review_required`, visibly flagged — never a plausible-looking invented number.

Without an API key the app still works: it degrades to a visibly-labelled offline mode (confidence `0`, review required) instead of pretending to measure.

## See the flow (60 seconds)

```text
Upload PDF ──► SheetScan ──► Canvas (150 DPI) ──► Hover badge ──► Ledger ──► CSV / JSON
                  │                 │                │              │
                  │                 │                │              └─► Accept / reject (audited)
                  │                 │                └─► QuickDraw crop-OCR at your cursor
                  │                 └─► Schedule ghost pins ──────┘
                  └─► Sheet tree (multi-sheet sets)
                                     Copilot: "Ask the drawing" ──► cited evidence pins
```

1. **Open** — drop a PDF (or click a bundled fixture to try it instantly).
2. **Scan** — sheet number, title, discipline, and scale are read from the title block; scale status is shown green only when verified, amber otherwise.
3. **Point** — hover over a duct run (~400 ms, or press `Q`): a dimension badge appears at your cursor. Unsure results hide the Accept button.
4. **Review** — accepted items land in the ledger with coordinates and provenance; schedule tags become ghost pins to confirm.
5. **Ask** — question the sheet in plain language; answers cite the items and coordinates they came from, and say so when they came from the offline template instead of the model.
6. **Export** — download the reviewed takeoff as CSV or JSON.

## Demo — the real application

Screenshots below are captured from the running app (Avexis fixture sheet, Playwright suite in `frontend/tests/playwright/`), not mockups. Captured *without* an API key, so they show the honest offline behaviour: scale unverified, suggestions flagged for review, nothing auto-approved.

![QuickDraw hover badge on a real sheet — offline mode shows a review-required badge with no Accept button](docs/assets/demo-hover-badge.png)

*Point-of-need dimensioning: hover a duct run and the badge appears at your cursor. In offline mode it is amber and cannot be accepted — fail-closed, by design.*

![Takeoff workspace: sheet directory, 150 DPI canvas, and empty-ledger guidance](docs/assets/demo-workspace.png)

*The workspace: sheet tree (left), canvas (center), ledger/schedule (right). The amber banner is the scale gate doing its job.*

![Copilot drawer answering with provenance labels over the rendered sheet](docs/assets/demo-copilot.png)

*Ask the drawing: answers carry provenance (`offline template` vs the live model) and a scale warning when applicable.*

### Design concept (not the shipped UI)

![Stitch-generated concept exploration for a telemetry-style takeoff dashboard](docs/assets/concept-stitch-telemetry.jpg)

*Concept exploration generated with Stitch (`stitch_bluetrace_precision_takeoff_suite`). This is a design study — invented metrics, light theme, features we do not ship (pricing, Revit export). The shipped UI is the dark workspace above; the concept informs layout ideas only. Reproduce or re-capture real shots any time with the Playwright visual suite (`frontend/tests/playwright/ui-states.spec.ts`).*

## Capabilities — honest status per component

| Component | What it does | Status |
|---|---|---|
| **SheetScan** | Title-block reconnaissance (number, title, discipline, scale) | ✅ Working (`POST /api/sheet-scan`) |
| **150 DPI canvas** | Pan/zoom sheet viewer with sheet tree and evidence pins | ✅ Working (`SheetCanvas`) |
| **QuickDraw hover badge** | 150 pt cursor crop → dimension suggestion with confidence + latency | ✅ Working (`POST /api/crop-ocr`, fail-closed) |
| **Takeoff ledger** | SUGGESTED → ACCEPTED/REJECTED review, audit events, rollup | ✅ Working (`/api/takeoff/*`) |
| **Schedule linking** | Schedule table → tags matched to plan coordinates as ghost pins | ✅ Working (`POST /api/schedule/parse`) |
| **Copilot** | Natural-language Q&A grounded in the ledger, streamed (SSE) | ✅ Working (`/api/copilot`, `/api/copilot/stream`) |
| **BYOK key handling** | Bring-your-own Meta API key, session-scoped, masked, expiring | ✅ Working (`/api/auth/byok`) |
| **SAM 3.1 segmentation** | Concept-prompt polygon segmentation | 🔌 Endpoint only (`POST /api/segment`) — no canvas trigger yet |
| **Files API caching** | Upload drawings to Meta Files API | 🔌 Endpoint only (`POST /api/files/upload`) — not in the UI flow yet |
| **Legend extractor** | Symbol → description table parsing (DOC-04) | 🔭 Planned |
| **Desktop packaging** | Standalone Windows app (Electron + sidecar research) | 🔭 Researched ([RES-06](docs/research/RES-06-STANDALONE-PACKAGING.md)) |

Full per-screen behaviour, including all five screen states (loading / empty / error / success / offline): [`docs/specs/UI-UX-FLOWS.md`](docs/specs/UI-UX-FLOWS.md).

## Architecture

```text
┌──────────────────────────── Frontend (React 19) ────────────────────────────┐
│  TakeoffWorkspace ── UploadCard · SheetTree · SheetCanvas · HoverBadge      │
│                     LedgerPanel · SchedulePanel · CopilotDrawer · ByokDialog│
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │  /api/*  (single contract, test-enforced)
┌──────────────────────────────────┴──────────────────────────────────────────┐
│  FastAPI (Python 3.10–3.13)          src/api/routes.py                      │
│  ├─ Meta layer     src/meta_services/  muse-spark-1.3 · sam-3.1 · wonder-1.0│
│  ├─ Vector engine  src/core_vector/    PyMuPDF · centerlines · scale gates  │
│  ├─ Store          src/store/          SQLite (WAL) ledger + review events  │
│  └─ Schemas        src/models/         Pydantic v2 contracts                │
└─────────────────────────────────────────────────────────────────────────────┘
```

Design decisions are recorded, not remembered: [ADR-001 hybrid architecture](docs/adr/ADR-001-hybrid-mep-architecture.md) · [ADR-002 offline-engine reuse](docs/adr/ADR-002-reusing-offline-engine-and-point-of-need-ux.md) · [ADR-003 VLM replaces YOLO](docs/adr/ADR-003-vlm-detection-replaces-yolo.md).

## Quickstart

**Prerequisites:** Python 3.10–3.13, Node 20+ (developed on 24), Windows or any OS with the same toolchains.

```powershell
# 1 — Backend (terminal 1)
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload

# 2 — Frontend (terminal 2)
npm --prefix frontend ci
npm --prefix frontend run dev        # http://127.0.0.1:5173 (proxies /api → :8000)

# 3 — Try it: open the app and click a bundled fixture (Avexis HVAC plan).
#    No API key needed — vision features degrade visibly, vectors/ledger/export work.
```

**Optional — live Meta models:** copy `.env.example` to `.env` and set `MODEL_API_KEY`, or paste a key in the app's *AI key* dialog (session-scoped, never written to disk).

| Variable | Required | Purpose |
|---|---|---|
| `MODEL_API_KEY` | No | Meta Model API key for live vision/copilot (BYOK dialog works instead) |
| `META_API_BASE_URL` | No | API base, default `https://api.meta.ai/v1` |
| `BLUETRACE_DB_PATH` | No | SQLite path, default `data/takeoff.sqlite3` |

## Verification

Every claim above is gated. Run them all:

```powershell
.venv\Scripts\python.exe -m pytest tests/ -q                 # 39 passed
.venv\Scripts\python.exe -m ruff check src/ tests/ scripts/  # clean
.venv\Scripts\python.exe -m mypy                             # clean (scope in pyproject.toml)
.venv\Scripts\python.exe scripts/sanitize_import.py --audit  # anti-leak: PASS
npm --prefix frontend run test -- --run                      # 25 passed
npm --prefix frontend run lint                               # clean
npm --prefix frontend run build                              # clean
```

A contract test parses `frontend/src/api/client.ts` and fails if the UI ever calls an endpoint the backend does not expose — the bug class that once split this repo in two cannot return silently. CI mirrors these gates (`.github/workflows/ci.yml`).

**Benchmark fixtures** (real sheets + ground truth in `fixtures/`): Avexis p.22 — 329 verified centerline runs (asserted in `tests/test_vector_pipeline.py`); PfMCC p.118 — 168 damper annotations; P-104.1 plumbing level 4.

## Project structure

```text
bluetrace-ai/
├── src/
│   ├── api/            # FastAPI routes (/api/*) — the single frontend contract
│   ├── core_vector/    # Deterministic vector extraction, centerlines, scale math
│   ├── meta_services/  # Meta Model API clients, SheetScan, schedules, copilot
│   ├── models/         # Pydantic v2 schemas
│   └── store/          # SQLite takeoff ledger, rollup, review events, export
├── frontend/           # React 19 workspace (single flow: upload→scan→review→ask)
├── fixtures/           # Real MEP sheets + ground-truth annotations
├── configs/            # Pipeline thresholds and classification rules
├── scripts/            # Anti-leak sanitizer, doc tooling
├── tests/              # Backend suite (39) incl. frontend↔backend contract guard
├── docs/
│   ├── adr/            # Architecture decision records
│   ├── research/       # RES-01…07: interfaces, UX, domain & prior art, packaging
│   ├── specs/          # UI/UX flows, BYOK security, tooling decisions
│   └── PRODUCT-VISION.md
├── TASKS.md            # Task matrix — checked means built, tested, and true
└── AGENTS.md           # Project constitution (invariants, boundaries, gates)
```

## Documentation map

| Audience | Start here |
|---|---|
| **Users / estimators** | This README → [UI/UX flows](docs/specs/UI-UX-FLOWS.md) → [Product vision](docs/PRODUCT-VISION.md) |
| **Contributors** | [AGENTS.md](AGENTS.md) → [TASKS.md](TASKS.md) → [Data models](Data_models.md) → ADRs |
| **Reviewers / judges** | [Submission guide](docs/SUBMISSION.md) → [Fix log](docs/FIXLOG-2026-10-30-reaudit-remediation.md) → capability table above |
| **Domain researchers** | [RES-07 MEP domain & prior art](docs/research/RES-07-MEP-DOMAIN-AND-PRIOR-ART.md) → RES-01…06 |

## Stage & roadmap

**Current stage: Planning.** Prototype slices are built and verified; this is not a production release and has not been submitted anywhere.

- ✅ Phases 0–5: specs, backend, vector engine, workspace, Meta layer, BYOK
- 🔌 Endpoint-only: SAM canvas trigger, Files API in-flow
- 🔭 Next: legend extractor (DOC-04), demo walkthrough (VER-02), license choice, first remote push (SUBMIT)

Task-level truth lives in [`TASKS.md`](TASKS.md) and [`task_plan.md`](task_plan.md); audit history in [`docs/AUDIT-2026-10-30-prompt-compliance.md`](docs/AUDIT-2026-10-30-prompt-compliance.md).

## Limitations (read before trusting a number)

- Measurements require a **verified or calibrated scale**; otherwise the UI says so and quantities stay suggestions.
- Vision results are **proposals with confidence scores**, not measurements. Low/zero confidence blocks acceptance.
- The vector engine is validated on the bundled fixtures, not on arbitrary drawing sets — see fixture README for scope.
- SAM 3.1 and Files API are backend endpoints without finished UI flows (table above).
- Single-user local SQLite by design at this stage; no auth, no multi-tenant hosting story yet.

## Contributing & license

Contributions follow [`AGENTS.md`](AGENTS.md): conventional commits, atomic micro-commits per slice, all gates green, no secrets in git.

**License: not yet chosen** (owner decision pending) — do not assume reuse rights until a `LICENSE` file appears. Note for future distribution: PyMuPDF carries AGPL/commercial licensing terms that must be resolved before any paid packaging ([RES-06](docs/research/RES-06-STANDALONE-PACKAGING.md)).

## Remote setup (once your repo exists)

```powershell
git remote add origin https://github.com/<owner>/bluetrace-ai.git
git push -u origin master
```

Then swap the static test badges at the top for the live CI badge (commented template included there).
