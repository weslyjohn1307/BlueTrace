# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository structure reorganization: relocated draft planning and task specifications to `docs/planning/`.
- Root storefront governance manifests: `LICENSE` (Apache-2.0), `CONTRIBUTING.md`, `SECURITY.md`, and `CHANGELOG.md`.
- Comprehensive 2026 SDLC Master Audit & Architectural Gap Analysis report (`docs/AUDIT_AND_GAP_ANALYSIS_2026.md`).
- Multi-agent operating system configuration (`agent-os/`) and routing matrix.

---

## [0.1.0] - 2026-10-31

### Added
- **Core Vector Geometry Engine (`src/core_vector/`)**:
  - Sub-pixel native vector extraction using PyMuPDF drawing paths.
  - Fail-Closed Scale Invariant (`ScaleValidator`) enforcing `review_required` on missing or conflicting scale notations.
  - Topological route network representation with NetworkX graph clustering and segment continuity tracing.
  - Linear ductwork and single-line piping corridor derivations.
- **Meta Model Services Suite (`src/meta_services/`)**:
  - Integration with Meta Model API (`https://api.meta.ai/v1`).
  - Document vision, title block OCR, and schedule extraction via `muse-spark-1.3`.
  - Promptable interactive spatial segmentation via `sam-3.1` Responses API.
  - Structured copilot reasoning and tool-calling execution via `muse-wonder-1.0`.
  - Files API upload and byte caching integration.
- **Transactional Takeoff Store (`src/store/`)**:
  - Local high-concurrency SQLite storage using `aiosqlite` in Write-Ahead Logging (WAL) mode.
  - Immutable takeoff item schemas, category rollups, and audit review events.
- **CAD Canvas Workstation (`frontend/`)**:
  - React 19 and Tailwind CSS v4 workstation application.
  - Hardware-accelerated 150 DPI canvas viewer with 2D affine transformation matrix math.
  - Sub-400ms Doherty responsive interaction loops, live panning, zooming, and crop coordinate mapping.
  - Interactive takeoff ledger drawer with status acceptance, rejection, and quantity rollups.
- **Security & Secret Isolation**:
  - Bring-Your-Own-Key (BYOK) memory-only credential isolation (`/api/settings/byok`).
  - Strict key masking in all diagnostic logging and health responses.
  - Instant session revocation purges.
- **Sanitization & Quality Assurance**:
  - Deterministic anti-leak sanitizer guard (`scripts/sanitize_import.py`) enforcing trademark protection.
  - 53 backend unit, integration, and contract tests (`pytest`).
  - 28 frontend unit and component tests (`vitest`).
  - Domain knowledge corpus in `docs/knowledge/` covering HVAC standards, title blocks, and prompt contracts.
