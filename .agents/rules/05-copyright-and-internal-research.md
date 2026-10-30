---
trigger: always_on
description: "Copyright guard: third-party product material stays internal"
---

# Rule: Copyright & Internal Research

1. **Never commit third-party product names** (the takeoff/CAD products named
   in the sanitizer guard), their URLs, logos, or copied text — in code, docs,
   filenames, commit messages, or PR text. Enforced by
   `scripts/sanitize_import.py --audit` (pre-commit + CI) and
   `tests/test_sanitizer_guard.py`; the guard files themselves are the only
   place the literals may appear, as patterns.
2. **Internal research sanctuary.** Competitive teardowns, comparisons, and
   scraped product material live only in `internal-research/` (gitignored).
   Scraper output about third-party products (`scripts/fetch_knowledge.py`)
   goes there, not into `docs/knowledge/`.
3. **What may be published:** original, generic synthesis — workflows,
   invariants, requirements — with no product attribution. When in doubt,
   keep it internal and ask.
4. **Standards text** (SMACNA/ASHRAE/CSI) is licensed: paraphrase principles,
   cite the standard, never reproduce tables verbatim. Formulas already in
   packs are the ceiling.
5. **Generated concept art** with invented metrics must be labelled
   "concept — not the shipped UI" wherever it appears (see README Demo).
