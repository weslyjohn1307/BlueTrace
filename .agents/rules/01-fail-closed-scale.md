---
trigger: always_on
description: "Fail-closed scale invariant for BlueTraceAI"
---

# Rule: Fail-Closed Scale Invariant

1. **Never Hallucinate Dimensions**: All spatial calculations and takeoffs must trace directly to extracted vector paths and a validated scale ratio.
2. **Review Required on Ambiguity**: If a sheet has:
   - Multiple conflicting scales (e.g. title block says $1/4"=1'-0"$ but detail callout says $1/2"=1'-0"$), or
   - No detected scale and no manual calibration bar,
   the system MUST set `review_required = True`, `scale_ratio = 0.0`, and alert the human estimator.
3. **No Guessing**: Never default to a standard scale like $1/8"=1'-0"$ or $1/4"=1'-0"$ without explicit verification.
