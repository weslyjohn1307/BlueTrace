# BlueTraceAI: Product Vision (the finished product)

> What the product is when it is done, who it serves, and how a job flows
> through it end to end. The demo is slice one of this picture.

## The product in one paragraph

BlueTraceAI is a professional-grade Windows takeoff application with an AI layer:
an estimator drops in a drawing set and works the sheet itself — hovering to
dimension, linking schedules to plan tags, asking questions in plain language —
while deterministic geometry does the measuring and vision models do the
reading. Every number carries its evidence (coordinates, legend source, scale
status, model provenance) or an honest `review_required`. Nothing self-approves;
the estimator's click is what turns AI output into a priced takeoff.

## Who it serves

- **MEP estimators** at mechanical, electrical, and plumbing subcontractors doing
  commercial takeoff (design-bid-build and design-assist).
- **Preconstruction managers** reviewing coverage: every tag accounted for,
  every scale region calibrated, every addendum delta flagged.
- **Small shops** that cannot afford a full-time VDC/BIM seat but live in PDFs.

## A job, end to end

1. **Intake.** Drop a 200-sheet set (or open one sheet). SheetScan inventories
   every page overnight or in minutes: number, title, discipline, scale region
   map, legend/schedule detection. Multi-sheet tree with per-sheet scale status.
2. **Calibrate once.** Scale engine reads title blocks, bar scales, and vector
   DPI per viewport, cross-checks against a known gridline dimension, and flags
   conflicts for one-click confirmation. NTS details and risers are fenced off,
   never silently scaled.
3. **Take off the sheet.** Hover any run for instant dimensions (QuickDraw);
   trace runs for footage with fitting inference at vertices; watch the ledger
   fill. Symbols detect against the sheet's own legend, each count carrying
   legend provenance and confidence.
4. **Link schedules.** Schedules parse into typed rows; plan tags join to rows;
   ghost pins mark every candidate on canvas for one-click accept. Continued
   schedules and remarks-column models resolve, not just the clean tables.
5. **Ask.** "How many 24x12 VAVs on level 2, and their total CFM?" The copilot
   answers from the ledger with cited coordinates that highlight on the sheet —
   model answers labeled as model answers, template answers labeled as such.
6. **Reconcile revisions.** Addendum arrives: overlay diff flags added, moved,
   deleted, and re-scheduled scope; nothing silently carries over.
7. **Price and export.** Ledger exports (CSV/JSON, then estimating integrations)
   with dimension + system + spec bucketing intact, ready for gauge tables and
   labor units. Full audit trail: who accepted what, when, on what evidence.

## What makes it different (and defensible)

- **Local-first truth:** vectors, scale math, ledger, and export run on the
  machine. The cloud is for reading and reasoning, never for measuring.
- **Legend-first perception:** reads each sheet's own legend before detecting,
  so it survives the per-engineer symbol variance that kills template matching.
- **Fail-closed everything:** unverified scale, unparsed crop, unlinked tag —
  all surface as review work, never as confident wrong numbers.
- **The sheet is the interface:** review happens where the evidence lives (pins,
  badges, highlights), not in a separate report to cross-reference.

## Non-goals (staying out)

- Replacing the estimator's judgment or the engineer of record's design.
- BIM authoring (we read drawings and models; we don't edit Revit).
- Fully autonomous bidding (no black-box lump sums; the human prices).
- Consumer/mobile-first (desktop Windows is the job; web companion later).

## Completed Milestone & Roadmap to v1

**Delivered in the Hackathon Release:**
Multi-sheet batch sheet intake, 150 DPI drawing canvas with hardware acceleration, point-of-need QuickDraw hover OCR with `muse-spark-1.3`, legend exemplar parsing with spatial tiling, deterministic vector centerline extraction, fail-closed scale validation, schedule reconciliation with ghost pin candidates, watchdog QA anomaly checks, grounded copilot reasoning with `muse-wonder-1.0`, single-port standalone server, and 1080p demo film.

**Future v1 Roadmap:**
Revision overlay diff, SAM automated canvas segmentation trigger, commercial estimating software integrations (CSI format), and multi-user cloud workspace synchronization.
