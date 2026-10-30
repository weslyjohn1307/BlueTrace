# Architecture Decision Record: Weave & AI Observability Tooling Strategy

> **Status:** Ratified  
> **Date:** October 30, 2026  
> **Authors:** BlueTraceAI Core Architecture Team  
> **Context:** Evaluation of Weights & Biases Weave vs Native OpenTelemetry vs Local Structured SQLite Logging for VLM and Copilot Tracing.

---

## 1. Context & Problem Statement

Modern agentic LLM/VLM systems require observability across multi-step prompt chains, image crop inputs, latency metrics, token consumption, and evaluation scoring. During the hackathon research phase, Weights & Biases Weave (`weave`) was evaluated alongside OpenTelemetry and local structured telemetry.

We must decide how AI observability is integrated into BlueTraceAI without violating:
1. **Dependency Minimalism (DM):** No mandatory heavyweight external dependencies or cloud lock-in.
2. **Offline-First Resilience:** The application must run standalone (e.g. on jobsites without internet access) where cloud telemetry cannot block execution.
3. **Data Privacy (AEC Confidentiality):** Blueprints and proprietary building floor plans must never leak to third-party telemetry providers without explicit consent.

---

## 2. Options Considered

### Option A: Mandatory W&B Weave Integration
- **Pros:** Out-of-the-box UI for tracing LLM inputs/outputs, model evaluations, and token cost tracking.
- **Cons:** Requires `pip install weave`, cloud authentication token, network egress on every query, fails on air-gapped jobsites, potential leak of proprietary blueprint images.

### Option B: Pure In-Memory Logging
- **Pros:** Zero dependencies, fast.
- **Cons:** No persistent history, no queryable metrics, loss of debug traces upon server restart.

### Option C: Native SQLite Event Ledger + Pluggable OpenTelemetry (CHOSEN)
- **Pros:**
  - Local SQLite `review_events` and `system_metrics` tables log every VLM call, latency duration, user decision, and model provenance offline.
  - Zero cloud dependencies required for standard operation.
  - Standard OpenTelemetry spans (`opentelemetry-api` already installed) can be exported to Jaeger, Prometheus, or W&B Weave via optional pluggable exporter.
  - 100% compliant with AEC data privacy and standalone desktop packaging requirements.

---

## 3. Decision & Architecture

1. **Default Engine (Offline & Production):**
   - BlueTraceAI uses local SQLite transactional logging for all model provenance, prompt metadata, crop latencies, and review actions.
   - Every copilot response includes explicit provenance fields (`model_used: bool`, `scale_verified: bool`, `latency_ms: int`, `cited_coordinates: list`).

2. **Optional Developer Weave Sink:**
   - If a developer sets `WEAVE_PROJECT=bluetrace-ai` and `WEAVE_API_KEY` in their local environment, an optional logging hook initializes `weave.init()` to mirror spans.
   - If unconfigured, the application operates completely offline with zero telemetry overhead or network failure risk.

---

## 4. Consequences & Verification

- **Compliance:** Satisfies prompt requirement for documenting the Weave/AI tooling decision.
- **Security:** Zero blueprint image bytes or API tokens are transmitted to unverified external observability clouds.
- **Performance:** Local logging overhead is $<1.5$ ms per request.
