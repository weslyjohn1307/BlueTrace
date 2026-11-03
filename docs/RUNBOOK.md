# BlueTraceAI — Operator Runbook & Data Retention Guide

**Classification**: `USER_FACING` / `JUDGE_FACING`  
**Scope**: Standalone Workstation Deployment, Native Desktop Sidecar Packaging, BYOK Configuration, Fail-Closed Scale Governance, and SQLite Data Retention.

---

## 1. Deployment Modes

### Option A: Single-Port Standalone Workstation (`http://127.0.0.1:8000`)
Serves both the compiled React 19 production SPA (`frontend/dist/`) and the FastAPI backend (`src/api/main.py`) over a single local port:

```powershell
# Automatically builds frontend/dist if missing and launches Uvicorn on 127.0.0.1:8000
.\.venv\Scripts\python.exe scripts/start_standalone.py
```

- **Workstation UI**: `http://127.0.0.1:8000/`
- **Interactive OpenAPI Docs**: `http://127.0.0.1:8000/docs`
- **Health Probe**: `GET http://127.0.0.1:8000/api/health`
- **API Isolation**: Any unknown `/api` or `/api/*` route returns a structured JSON `HTTP 404` and never falls back to the HTML SPA.

### Option B: Packaged Windows Desktop Workstation (Tauri v2 + Python Sidecar)
Compiles the FastAPI + PyMuPDF + SQLite backend into an uncompressed `--onedir` bundle (`dist/bluetrace-core/`) supervised by a Tauri v2 Rust host (`src-tauri/`) with a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`):

```powershell
# 1. Validate sidecar spec and hidden imports (dry-run)
.\.venv\Scripts\python.exe scripts/build_sidecar.py --dry-run

# 2. Validate full packaging manifest (PyInstaller spec, Tauri config, NSIS, Ed25519 updater)
.\.venv\Scripts\python.exe scripts/validate_packaging_manifest.py

# 3. Build frontend production bundle
npm --prefix frontend run build

# 4. Build PyInstaller sidecar (when packaging for release)
.\.venv\Scripts\python.exe scripts/build_sidecar.py
```

---

## 2. Meta Model API & BYOK Configuration

BlueTraceAI enforces a strict hybrid architecture:
- **Deterministic Vector Engine (100% Local)**: PDF path extraction (`PyMuPDF`), parallel wall pairing, centerline synthesis (`Shapely`), continuity graph routing (`NetworkX`), and Euclidean scale math execute locally with zero cloud calls.
- **Point-of-Need Vision & Reasoning (`https://api.meta.ai/v1`)**:
  - `muse-spark-1.3`: 300x300 px hover micro-crop OCR, title block reconnaissance, legend exemplar parsing, and schedule table extraction.
  - `sam-3.1`: Polygon boundary refinement on candidate symbols.
  - `muse-wonder-1.0`: Read-only SQL tool-calling copilot and bidirectional evidence citation grounding.

### Setting the API Key
1. **Environment Variable**: Set `MODEL_API_KEY` in your local `.env` file (never committed to git; enforced by `.gitignore` and `scripts/sanitize_import.py --audit`).
2. **In-Workstation BYOK Modal**: Click the **API Key (BYOK)** button in the top navigation bar to supply a session-scoped key via `X-Meta-Api-Key` header.
3. **Offline / Unconfigured Behavior**: When no API key is configured, all Meta Model API clients abstain fail-closed (`confidence = 0.0`, `review_required = True`, `offline = True`) and never fabricate dimensions or polygons.

---

## 3. Fail-Closed Scale Governance & Troubleshooting

### Resolving `HTTP 409 Conflict` on Item Acceptance
Under Constitutional Rule 01 (`01-fail-closed-scale.md`):
- If a drawing sheet has no detected scale or conflicting scales (e.g., title block states `1/4" = 1'-0"` while a detail callout states `1/2" = 1'-0"`), the sheet is flagged with `review_required = True`, `scale_calibrated = False`, and `scale_ratio = 0.0`.
- Linear footage for all vector runs on an uncalibrated sheet is locked to `0.00 ft`.
- Attempting to transition a takeoff item to `ACCEPTED` returns `HTTP 409 Conflict`.

**Operator Remediation**:
1. Select the **Calibrate (`C`)** tool in the CAD canvas dock.
2. Click two endpoints of a known dimension on the drawing (minimum `10.0 pt` separation).
3. Enter the physical length in feet and inches in the **Scale Calibration Modal** and submit.
4. The backend atomically updates the sheet's `scale_ratio`, recalculates physical footage for all vector runs using $\frac{L_{pt} \times \text{ratio}}{864}$, and unlocks `ACCEPTED` status transitions.

---

## 4. Data Retention, Privacy & SQLite Storage

- **Local Transactional Database**: All projects, sheets, takeoff items, append-only review events, QA annotations, and engineer feedback telemetry are stored locally in `data/bluetrace.db` (or `%LOCALAPPDATA%\BlueTraceAI\data\bluetrace.db` in packaged desktop installs) using SQLite WAL (`Write-Ahead Logging`) mode.
- **Zero Drawing Leakage**: Client PDFs in `data/uploads/` and cached vector geometry stay strictly on the local workstation disk (`data/` is gitignored).
- **Training Eligibility Gate (`training_eligible = 0`)**: Engineer correction events captured in `engineer_feedback_events` default to `training_eligible = 0` and cannot be exported by `src/meta_services/dataset_curator.py` unless explicitly marked eligible, with strict package-level holdout splitting to prevent cross-sheet data leakage.
- **Backup & Reset**:
  - To back up workstation state, copy `data/bluetrace.db` while the server is stopped (or via `sqlite3 data/bluetrace.db ".backup backup.db"`).
