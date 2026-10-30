---
trigger: always_on
description: "Evidence-before-claims for trackers, docs, and handoffs"
---

# Rule: Evidence Before Claims

1. **Checked means verified.** A task checkbox, status line, or "COMPLETE"
   label requires: code path exists, a test or manual run proves it, and the
   claim names its evidence (`file:line`, test name, commit). Otherwise mark
   it partial/planned with the gap stated.
2. **Counts come from execution.** Test totals, run counts, and benchmarks
   are quoted only from a run you performed or a test that asserts them —
   never from memory, older docs, or another agent's summary.
3. **Separate the epistemic layers** in every report: what you *read*,
   what you *ran*, what you *inferred*. Inferences get labelled as such.
4. **No silent scope upgrades.** Endpoint-only work is not a UI feature;
   research is not implementation; a renamed file is not a scrubbed file.
   Say which one it is (see `docs/PLAN-STATUS.md` for the house style).
5. **Handoffs state leftovers.** Every handoff/PR description lists what is
   *not* done and what could not be verified (e.g. CI result, live API),
   so the next agent inherits truth, not momentum.
