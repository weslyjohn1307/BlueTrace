# Building with Muse Spark and Muse Code: From Capabilities to Production

> **Source Session:** Meta Connect / Developers — *Building with Muse Spark and Muse Code: From Capabilities to Production*  
> **Target Audience:** Full-Stack Engineers, AI Tooling Engineers, BlueTraceAI Production Team

---

## 1. Executive Summary

This session demonstrates how to transition from prototype VLM queries to industrial-grade production systems using the Meta Model API and the Muse Code autonomous engineering toolchain. The core thesis is that production AI systems require strict deterministic verification around probabilistic neural model outputs.

---

## 2. Core Toolchain: The Muse Code Agent Framework

### 2.1 CLI Architecture & Headless Execution
- **`muse init`:** Bootstraps workspace configuration, permissions, system prompts, and rules.
- **`muse exec --headless`:** Executes non-interactive development tasks, test-driven refactoring, and automated verification loops.
- **`muse skills` & `muse mcp`:** Manages agent capabilities and MCP servers (Context7, GitHub, Sentry, SQLite).
- **`muse trace` & `muse export`:** Logs agent trajectories, tool invocations, token budgets, and structured execution traces for CI/CD auditability.

### 2.2 Dual-Tier Hybrid Division
- **Neural Perception Layer (Cloud):** Muse Spark 1.3 for visual OCR; SAM 3.1 for zero-shot promptable mask segmentation; Muse Wonder 1.0 for multi-hop semantic reasoning.
- **Deterministic Math Layer (Local):** Python algorithms (`PyMuPDF`, `Shapely`, `NetworkX`) for physical vector coordinate arithmetic, centerline tracing, and scale transformations.
- **Key Invariant:** Never permit a generative language model to perform coordinate geometry, scale multiplication, or takeoffs in isolation. All dimensions must be grounded in physical vector linework.

---

## 3. Production Patterns & Anti-Patterns

| Dimension | Anti-Pattern | Production Pattern |
|:---|:---|:---|
| **Scale Calculation** | Asking LLM to estimate drawing scale from visual proportions | Fail-closed regex and vector dimension line validation (`ScaleValidator`); uncalibrated sheets flagged `"UNVERIFIED"` |
| **Error Handling** | Inventing optimistic fallback dimensions (e.g. `24x12` duct) | Returning `parsed_dimension=None`, `confidence=0.0`, and `review_required=True` |
| **Key Governance** | Writing API keys to disk, logs, or shared environment variables | Session-scoped BYOK memory isolation with time-bounded expiration and per-session revocation |
| **Verification Gate** | Relying on unit tests with hardcoded mock answers | Contract integration testing asserting live schema fidelity and ratchet suites preventing legacy debt |

---

## 4. Application to BlueTraceAI

- Implemented in `src/meta_services/client.py` and `src/meta_services/copilot.py`.
- Automated testing via `pytest tests/` validating that offline mode cleanly reports `model_used=False` and `scale_verified=False` when running without API keys.
- Continuous verification across 35 backend tests, 84 frontend Vitest tests, and ESLint / Ruff / Mypy linters.
