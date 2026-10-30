# Failure Modes & Review Gates

> The catalogue of ways this system can be wrong, and the gate that catches
> each. Owned by agent 06; every agent must know the rows in its area.

## 1. Fail-closed taxonomy **[code]**

| Failure | Detection | System behaviour |
|---|---|---|
| Scale unverified/conflicting | Multi-signal gate (title vs bar vs dimension string) | `scale_status=UNVERIFIED`, lengths blocked, amber UI |
| Schematic/riser sheet measured | View-type/scale gating in pipeline | Reject measurement; counts only |
| Crop OCR unparsed / confidence absent | JSON contract validation | `review_required=True`, confidence 0, Accept hidden |
| VLM shape string unknown | Enum coercion | Fail-closed default + review, never a 500 |
| Schedule tag unmatched | Tag→coordinate linking | Ghost/unplaced list for manual placement; `SUGGESTED`, never auto-accepted |
| Prefix collision (`FD`, `SD`) | Discipline/system context | Ambiguity flagged for human, both meanings preserved |
| Normalized vs point coords mixed | Provenance + transform chain | Treat as corruption; recompute via `PDF_GEOMETRY` chain |
| Boundary perimeter reported as duct length | Centerline derivation tests | Test failure — perimeter is a known wrong answer |
| Mock data presented as real | `mock`/`model_used` provenance flags | Labelled offline/template in API + UI, confidence 0 |
| Endpoint/payload drift (FE↔BE) | Contract test parses `client.ts` vs OpenAPI | CI failure |
| Cross-session key bleed | Session-scoped BYOK tests | Per-session opt-out; no `os.environ` mutation |

## 2. Silent-failure patterns to hunt (agent 06 checklist)

- Defaults that invent values (`or 14`, `get("confidence", 0.95)`).
- `except: pass` / catch-all that converts errors into empty results.
- Status auto-promotion (`SUGGESTED` → `ACCEPTED` without a user event).
- Provenance asserted instead of computed (`external_model_used: true`).
- Tests that mock the very boundary they claim to verify.
- Docs/trackers claiming features with no code path (search before asserting).
- Formula drift between agent prompts and knowledge packs (cite, don't copy).

## 3. Human-in-the-loop states

`SUGGESTED` (machine) → `ACCEPTED` / `REJECTED` (human, audited as review
events). UI must always show which state an item is in, why (confidence,
scale status), and the evidence (coordinates) behind it. Loading / empty /
error / success / offline states are specified per screen in
`docs/specs/UI-UX-FLOWS.md` — an unhandled state is a defect.

## 4. Gate stack (all must pass before a slice is "done")

`pytest` (44) · contract guard · sanitizer/copyright audit · `ruff` ·
configured `mypy` · `eslint` · `tsc`/build · vitest (25) · Playwright smoke
(manual/local until CI job exists). A green subset is not a green slice.

## Sources
Audit history `docs/AUDIT-2026-10-30-prompt-compliance.md` (§2, §12, §13);
`tests/test_sanitizer_guard.py`; `.agents/rules/01-fail-closed-scale.md`.
