# Knowledge Base Index — Read Before You Act

> Quality of output is bounded by quality of context. This index is the
> contract between the knowledge base and every agent: **load your packs
> before producing domain output**, cite the pack + section you relied on,
> and treat anything not in a pack (or the code) as unknown — flag it,
> never invent it. See `.agents/rules/04-knowledge-first.md`.

## Packs

| Pack | Owns | Primary agents |
|---|---|---|
| [MEP_HVAC_STANDARDS](MEP_HVAC_STANDARDS.md) | SMACNA duct math, gauges, ASHRAE device/damper classes | 05, 03 |
| [AEC_TITLE_BLOCKS_AND_SCALES](AEC_TITLE_BLOCKS_AND_SCALES.md) | Architectural/engineering scales, pt/ft math, multi-signal scale gate | 02, 03 |
| [AEC_SHEET_TAXONOMY_AND_VIEW_TYPES](AEC_SHEET_TAXONOMY_AND_VIEW_TYPES.md) | Discipline sheet numbering, view types, scale contexts (NTS, details, risers) | 02, 03, 05 |
| [AEC_TAKEOFF_AND_ESTIMATING_WORKFLOWS](AEC_TAKEOFF_AND_ESTIMATING_WORKFLOWS.md) | Point-of-need loop, calibration doctrine, markups, exports | 01, 04, 05 |
| [ESTIMATING_AND_BID_WORKFLOW](ESTIMATING_AND_BID_WORKFLOW.md) | CSI MasterFormat divisions, bid stages, waste/contingency, addenda | 05, 01 |
| [MEP_GLOSSARY_AND_TAG_TAXONOMY](MEP_GLOSSARY_AND_TAG_TAXONOMY.md) | Tag prefixes as foreign keys, units, abbreviations | 05, 03, 06 |
| [PDF_GEOMETRY_AND_COORDINATES](PDF_GEOMETRY_AND_COORDINATES.md) | PDF points, DPI transforms, vector paths, centerline graphs, tolerances | 02, 06 |
| [VLM_GROUNDING_AND_PROMPT_CONTRACTS](VLM_GROUNDING_AND_PROMPT_CONTRACTS.md) | Meta model roles, JSON contracts, confidence & grounding rules | 03, 06 |
| [FAILURE_MODES_AND_REVIEW_GATES](FAILURE_MODES_AND_REVIEW_GATES.md) | Fail-closed taxonomy, silent-failure patterns, HITL states | 06, 07, all |
| [PARSEBENCH_VLM_BLUEPRINT_EXTRACTION](PARSEBENCH_VLM_BLUEPRINT_EXTRACTION.md) | VLM parsing evaluation principles for AEC documents | 03 |

Related, outside this folder: `docs/research/RES-01…10` (interfaces, prior art,
packaging, BYOK, canvas), `docs/specs/UI-UX-FLOWS.md` (the one real flow),
`AGENTS.md` (invariants), `.agents/rules/` (guardrails).

## Agent → required packs

| Agent | Must load before acting |
|---|---|
| 01 Lead Orchestrator | INDEX, FAILURE_MODES, ESTIMATING_AND_BID_WORKFLOW |
| 02 Vector Geometry Eng | PDF_GEOMETRY, AEC_TITLE_BLOCKS_AND_SCALES, AEC_SHEET_TAXONOMY |
| 03 Meta Model Eng | VLM_GROUNDING, PARSEBENCH, AEC_TITLE_BLOCKS_AND_SCALES, GLOSSARY |
| 04 CAD Canvas Craftsman | AEC_TAKEOFF workflows, FAILURE_MODES (§HITL states), DESIGN.md |
| 05 Takeoff Domain Expert | MEP_HVAC_STANDARDS, ESTIMATING_AND_BID_WORKFLOW, GLOSSARY, workflows |
| 06 Silent Failure Hunter | FAILURE_MODES, PDF_GEOMETRY, VLM_GROUNDING |
| 07 Anti-Slop UX QA | FAILURE_MODES (HITL), workflows, DESIGN.md, ux-laws skill |
| 08 Desktop Packaging Eng | RES-06, ESTIMATING_AND_BID_WORKFLOW (§licensing note) |

## Maintenance rules

1. **One fact, one home.** Duplicated formulas drift (a 12× surface-area error
   once lived in agent 05 while the correct formula sat here). Agents cite
   packs; packs hold the math.
2. **Mark epistemic status.** Every quantitative claim is one of: *code*
   (asserted by tests), *standard* (cite SMACNA/ASHRAE/CSI — licensed text
   prevails), *requirement* (not yet implemented), or *unverified* (say so).
3. **Internal research stays internal.** Material naming third-party products
   lives in `internal-research/` (gitignored). Only scrubbed generic
   derivatives enter this folder. Enforced by the copyright guard.
4. **Update the pack when the code changes**, in the same commit.
