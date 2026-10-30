# BlueTraceAI Project Constitution (AGENTS.md)

## 1. Architectural Invariants & Stack
- **Architecture**: Strict Hybrid Division.
  - Meta Model API (`https://api.meta.ai/v1`) for vision, OCR, table extraction, and copilot reasoning.
  - Local Python algorithms (PyMuPDF, NetworkX, Shapely) for vector extraction, centerline geometry, and scale math.
- **Backend**: Python 3.13+, FastAPI, SQLite (`aiosqlite`), Pydantic v2.
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Hardware-Accelerated 150 DPI Canvas.
- **Models**: `muse-spark-1.3` (Vision/OCR), `sam-3.1` (Responses API Segmentation), `muse-wonder-1.0` (Reasoning).

## 2. Strict Engineering Disciplines
1. **Never Hallucinate Dimensions**: Measurements must trace to physical vector coordinates and validated scale ratios.
2. **Fail-Closed Scale Rule**: Unverified or conflicting scales must be flagged as `"review_required"`.
3. **Point-of-Need Focus**: Real-time canvas hover interactions operate on 300x300 px crops for sub-second latency.
4. **Dependency Minimalism (DM)**: Do not add new external libraries without explicit justification. Check existing manifests first.
5. **Zero Secrets in Git**: No API keys, credentials, or `.env` files in git. All client API keys must use environment variables.

## 3. Directory Boundaries
- `src/api/`: FastAPI REST endpoints and request schemas.
- `src/core_vector/`: Deterministic vector linework, centerline tracing, and scale math.
- `src/meta_services/`: Meta Model API clients (`muse-spark-1.3`, `sam-3.1`, `muse-wonder-1.0`, Files API).
- `src/document/`: Document reconnaissance, sheet classification, and title block parsing.
- `frontend/`: React 19 interactive canvas application.
- `docs/`: Specs, research, and architecture decision records (`docs/adr/`).

## 4. Verification & Testing Commands
- Backend Tests: `pytest tests/`
- Backend Lint: `ruff check src/`
- Backend Type Check: `pyright src/` or `mypy src/`
- Frontend Build: `npm --prefix frontend run build`
- Frontend Lint: `npm --prefix frontend run lint`

## 5. Git Commit Protocol
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- Create atomic micro-commits before and after every major feature slice.
