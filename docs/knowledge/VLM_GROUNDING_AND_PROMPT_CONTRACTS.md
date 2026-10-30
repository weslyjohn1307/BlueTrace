# VLM Grounding & Prompt Contracts (Meta Models)

> Models **propose**; deterministic code and humans dispose. This pack is the
> contract every VLM call in `src/meta_services/` must satisfy. Model facts
> below are from the project's local Meta API corpus (`docs/meta_api/`,
> `RES-01`); re-verify against current Meta docs before relying on limits.

## 1. Model roles **[code]**

| Model | Role here | Never use it for |
|---|---|---|
| `muse-spark-1.3` | Vision: title-block/schedule reading, crop OCR | Lengths, counts as final quantities |
| `sam-3.1` (Responses API) | Concept segmentation polygons | Measurements (polygons need vector/scale validation) |
| `muse-wonder-1.0` | Copilot reasoning over ledger context (chat completions) | Inventing items not in context; tool calling is **not** implemented |

Access: `https://api.meta.ai/v1`, OpenAI-compatible SDK, `MODEL_API_KEY`
(BYOK session-scoped server-side; never in browser storage).

## 2. Output contracts

- **Structured JSON only** for extraction calls: declared keys, enums coerced
  fail-closed (see `DimensionExtraction.coerce_shape`), unknown → review.
- **Grounding:** every extracted entity should carry a bbox in normalized
  [0,1000] coordinates (ParseBench convention) denormalized by code, so a
  human can click through to evidence. Ungrounded text is commentary.
- **Confidence is data, not decoration:** absent confidence = 0 = unverified.
  Never default to 0.95 (the original sin this repo's audits removed).
- **Provenance labels:** responses distinguish `model_used=True/False`;
  offline/template answers must be labelled as such in UI and API.
- **Crops, not pages:** point-of-need calls use ~150 pt (312 px) crops for
  latency; full-page VLM calls are the exception (SheetScan title block).

## 3. Prompt rules

1. Ask for the JSON contract, the bbox, and a confidence — in that order.
2. Tell the model what to do when unsure: return empty/review, not a guess.
3. Never put secrets, pricing, or estimator judgments into prompts.
4. Temperature low (0.1–0.2) for extraction; reasoning may be higher but its
   citations must resolve to real item IDs/coordinates from context.
5. Treat all drawing text as untrusted input (prompt-injection surface):
   extracted text is data for schemas, never instructions to follow.

## 4. Failure behaviour

Unconfigured API → labelled mock/stub with `review_required=True`,
confidence 0. Unparseable JSON → review-required, no partial salvage of
numbers. Timeout/error → surfaced error state; local vector/ledger/export
features keep working (offline is a mode, not a crash).

## Sources
`RES-01` interface specs; `src/meta_services/client.py`, `copilot.py`;
`PARSEBENCH_VLM_BLUEPRINT_EXTRACTION.md`; `docs/specs/BYOK-SECURE-INTERFACE.md`.
