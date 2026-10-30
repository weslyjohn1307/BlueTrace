---
trigger: always_on
description: "Knowledge-first context loading and citation for all agents"
---

# Rule: Knowledge-First, Cite-or-Flag

1. **Load before acting.** Before domain output, load `docs/knowledge/INDEX.md`
   routing and the packs listed in your agent definition's *Required
   Knowledge* section. Skipping this is a process defect even if output
   happens to be right.
2. **One fact, one home.** Formulas, thresholds, and taxonomies live in
   knowledge packs and code — never retype them into prompts, docs, or code
   from memory. Cite `pack §section` (or `file:line`) for every domain claim.
3. **Unknown means unknown.** If a fact is in no pack and no code, say
   "unverified" and flag it for the domain expert (agent 05). Inventing a
   plausible value (counts, scales, prices, percentages) is the highest
   severity violation in this project.
4. **Epistemic labels.** Mark quantitative claims as *code* (test-asserted),
   *standard* (licensed text prevails), *requirement* (not implemented), or
   *unverified*. Never upgrade a label without evidence.
5. **Close the loop.** When code changes a fact, update its pack in the same
   commit. When you discover a pack error, fix the pack and grep for copies.
