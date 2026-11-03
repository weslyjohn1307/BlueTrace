# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Interactive project showcase deployed through GitHub Pages.
- CI coverage for Python 3.10–3.13, frontend checks, dependency updates, and CodeQL analysis.

### Changed
- Historic explainer links now open the current showcase.
- Main navigation no longer displays unverified benchmark or agent-status claims.
- Contributor and security guidance now reflects the public project setup.

## [0.1.0] - 2026-10-31

### Added
- **Core Vector Geometry Engine (`src/core_vector/`)**:
- Native vector extraction using PyMuPDF drawing paths.
  - Fail-Closed Scale Invariant (`ScaleValidator`) enforcing `review_required` on missing or conflicting scale notations.
  - Topological route network representation with NetworkX graph clustering and segment continuity tracing.
  - Linear ductwork and single-line piping corridor derivations.
- **Meta Model Services Suite (`src/meta_services/`)**:
  - Integration with Meta Model API (`https://api.meta.ai/v1`).
  - Document vision, title block OCR, and schedule extraction via `muse-spark-1.3`.
  - Promptable interactive spatial segmentation via `sam-3.1` Responses API.
  - Copilot reasoning over takeoff evidence.
  - Files API upload and byte caching integration.
- **Transactional Takeoff Store (`src/store/`)**:
  - Local high-concurrency SQLite storage using `aiosqlite` in Write-Ahead Logging (WAL) mode.
  - Immutable takeoff item schemas, category rollups, and audit review events.
- **CAD Canvas Workstation (`frontend/`)**:
  - React 19 and Tailwind CSS v4 workstation application.
  - Canvas viewer with 2D affine transformation math for drawing coordinates.
  - Interactive panning, zooming, and crop coordinate mapping.
  - Interactive takeoff ledger drawer with status acceptance, rejection, and quantity rollups.
- **Security & Secret Isolation**:
  - Environment-based API key configuration.
- **Sanitization & Quality Assurance**:
  - Deterministic anti-leak sanitizer guard (`scripts/sanitize_import.py`) enforcing trademark protection.
  - Automated backend and frontend tests.
