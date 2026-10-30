# Estimating & Bid Workflow (What a Takeoff Is *For*)

> A takeoff is not the deliverable — a **priced, defensible bid** is.
> Agents producing quantities must know where their numbers land.

## 1. CSI MasterFormat — where MEP quantities live **[standard, verified]**

MasterFormat (CSI/CSC; 50 divisions since the 2004 expansion) organizes specs
and cost data. BlueTrace scope maps to the Facility Services subgroup:

| Division | Title |
|---|---|
| 21 | Fire Suppression |
| 22 | Plumbing |
| 23 | Heating, Ventilating, and Air Conditioning (HVAC) |
| 25 | Integrated Automation |
| 26 | Electrical |
| 27 | Communications |
| 28 | Electronic Safety and Security |

Ledger exports should carry enough structure (discipline, system, tag) for an
estimator to re-key quantities into these divisions without reinterpretation.
*(Division list verified against CSI MasterFormat divisions, retrieved
2026-10-30.)*

## 2. The bid pipeline **[standard]**

1. **Invitation / documents** — drawings + specs + addenda; scope review.
2. **Takeoff** — counts and lengths per system (this product's job).
3. **Pricing** — material (sheet metal by weight, devices by count) + labor
   units + equipment quotes (scheduled items often priced per tag/model).
4. **Review & markups** — waste factors, contingency, overhead/profit, bonds,
   taxes. *These are estimator judgments — never auto-apply them in code.*
5. **Bid submission** — alternates, allowances, exclusions, qualifications.
6. **Post-bid** — scope reviews, buyout, submittals, as-builts.

**Boundary:** BlueTrace ends at step 2 output + review trail (step 3 inputs).
Pricing, waste %, and contingency in UI concepts are illustrative only unless
an estimator entered them.

## 3. Quantity semantics estimators rely on

- **Count vs length vs area vs weight:** diffusers/dampers/VAVs count;
  duct/pipe measure by centerline length; duct material prices by surface
  area → weight (see `MEP_HVAC_STANDARDS.md` §1.3–1.4 formulas).
- **Fittings** are discrete units or an explicit allowance — the choice must
  be visible in the export, not baked in silently.
- **Tags are foreign keys** (plan ↔ schedule ↔ quote). A correct count with a
  lost tag still breaks pricing — protect tag fidelity above count fidelity.
- **Addenda change scope.** Quantities must be traceable to sheet + revision.

## 4. Licensing checkpoint **[requirement]**

PyMuPDF is AGPL/commercial dual-licensed. Any paid distribution of this
product requires resolving that license first (`RES-06`). SMACNA/ASHRAE/CSI
texts are licensed standards: this knowledge base paraphrases principles and
must not reproduce their tables verbatim beyond fair-use formulas already
present; licensed text prevails in disputes.

## Sources
CSI MasterFormat divisions (2020 ed., verified 2026-10-30); `RES-07` §2
parallel-products context; `MEP_HVAC_STANDARDS.md`.
