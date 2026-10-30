---
name: silent-failure-hunter
description: Audits code for silent failures, unhandled exceptions, zero-division hazards, and unvalidated enum conversions.
---

# Silent Failure Hunter Skill

Use this skill when reviewing pull requests, inspecting API endpoints, or performing adversarial reliability audits.

## Focus Areas
1. **Pydantic Enum Ingestion**: Look for endpoints where raw client or VLM strings are cast directly into `Literal[...]` without a fail-closed validator.
2. **Coordinate & Scale Hazards**: Look for `scale_ratio = target_len / vector_len` without checking if `vector_len <= 0`.
3. **Async Timeouts & Connection Drops**: Look for `httpx.AsyncClient` calls without timeout configurations or error handling for HTTP 429/503.
4. **Empty List Reductions**: Look for `min(...)`, `max(...)`, or `mean(...)` on lists that might be empty.
