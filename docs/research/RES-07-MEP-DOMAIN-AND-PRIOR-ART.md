# RES-07: MEP Domain Knowledge & Prior Art

> Researched 2026-10-30. What estimators actually do, what competitors automate,
> what the literature says works — and where BlueTraceAI fits.

## 1. How estimators work (the domain)

### Ductwork (SMACNA rules)
- Governing standard: **SMACNA HVAC Duct Construction Standards**. Gauge is a function of largest duct dimension + pressure class + reinforcement/joint type — never size alone.
- Pressure classes (in. w.g.): low ≤2", medium 2–6", high >6". Same 24" duct at 2" vs 6" w.g. prices differently (gauge + stiffeners).
- Three families price differently: **rectangular** (lb = perimeter × length × psf(gauge) + fittings + hangers), **round/spiral** (linear ft by diameter), **flex** (linear ft). Fittings (elbows, transitions, taps) count separately; liner/insulation changes shop vs field cost.
- The estimator reads duct size labels (`24x12`, `Ø14`), the pressure-class note, and the spec section — then picks a gauge table. **BlueTrace implication:** dimension + system + pressure class must travel together on every takeoff item; a bare `24x12` without system context misprices.

### Piping
- Sizing systems coexist: IPS/NPS steel (Sch 40/80), CTS copper, DWV cast iron/PVC, plus PEX, Victaulic, med-gas, hydronic. Each service (CHWS/R, HWS/R, domestic, sanitary, vent, storm, gas) takes off as **linear ft by size + material + insulation**, plus fitting/valve/device counts.
- Drawings are schematic: the estimator takes off **as drawn** (`2" CHWS`), flags conflicts with risers/schedules, never re-engineers. Labor is size-dependent and non-linear — one missed size break corrupts material and labor both.
- **BlueTrace implication:** pipe labels must keep service + size + material; size transitions on a run are first-class events, not noise.

### Scales (where estimates die)
- Floor plans: 1/8"=1'-0" (large commercial), 1/4"=1'-0" (small), 3/16" compromise; enlarged plans/details up to 1-1/2"=1'. Site/civil use engineer scale; metric uses 1:100/1:50/1:20.
- Failure modes: **multiple scales per sheet** (plan + details + risers, some NTS), wrong embedded scale in scanned PDFs, reduced ARCH D→C prints. Every scale region needs independent calibration. Estimating doctrine: calibrate gridline-to-gridline, never trust printed scale.
- **BlueTrace implication:** per-viewport scale detection with fail-closed `review_required` on conflict is the highest-leverage feature in the product (see §4).

### Symbols, tags, schedules
- **The per-sheet legend governs.** No universal MEP symbol set; same office symbol varies by engineer. Never match symbols against a global library.
- Mechanical tags: `VAV-`, `D-/SD-` supply, `R-/RG-` return, `EG-` exhaust, `VCD/VD/MVD` dampers, `FD/SD/FSD` life-safety, `AHU-/FCU-/EF-/CU-` equipment. Plumbing: `WC/LAV/UR/FD/WH`.
- Tags are **foreign keys**: plan tag → schedule row → manufacturer model + CFM + accessories + labor. Schedules key on TAG (VAV schedule: max/min CFM, inlet, reheat, ESP, NC; diffuser schedule: neck/face, CFM, pattern, model). Schedules span sheets, continue across pages, and change by addendum.
- **BlueTrace implication:** tag→schedule join is the product's second engine. Losing a tag breaks pricing even when the count is right.

### Manual takeoff today (Traditional Desktop PDF Viewers / PlanSwift)
- **Standard Desktop Takeoff Tools**: per-region calibration, viewports for multi-scale sheets, count + symbol-search find, measure tools, markups list → spreadsheet.
- **PlanSwift**: point-and-click digitizing, assemblies/formulas (duct run auto-adds hangers), trade templates, overlay compare.
- Both still force the estimator to read legends, calibrate every viewport, classify every symbol/run, hand-link tags to schedules, and re-check addenda. Hours go to counting and measuring, not pricing. That manual core is what we automate.

## 2. Parallel products (one line each)

| Product | What it automates |
|---|---|
| Standard Desktop Takeoff Tools | Manual digital takeoff: calibrated measure/count, symbol search, markups-to-spreadsheet; estimator classifies everything |
| PlanSwift | Manual 2D digitizing with assemblies/formulas and trade templates; no auto-detect |
| STACK | Cloud takeoff + estimating with AI-accelerated measure/count and bid management |
| Autodesk Takeoff / ACC | 2D + 3D (Revit/BIM) takeoff synced to cost; quantities from model objects + sheets |
| Procore Estimating (Esticom) | Cloud takeoff-to-bid for specialty trades, Procore project sync |
| ProEst | Database-driven estimating + bid management + CRM |
| Causeway / CATO / BIM Measure | UK QS estimating with CAD/BIM 2D/3D takeoff and lifecycle costing |
| Kreo (2D Takeoff) | Cloud AI 2D takeoff: auto-measure/count, 2D→BIM path |
| Beam AI | Done-for-you takeoff service: plans in, human-reviewed quantities in 24–72h |
| Togal.AI | Deep-learning auto-detect/measure/count on plans in seconds (also inside eTakeoff via SnapAI) |
| Countfire | Template-match symbol auto-count across hundreds of PDFs with auto-scale |
| Ediphi | Parametric estimating from minimal inputs; re-costs on scope change |
| ConWize | Tender-phase bidding platform: pipeline, sub-bid automation, analytics |
| eTakeoff Dimension (+ SnapAI) | Veteran Windows takeoff with AI-assisted auto-count/measure |

Nobody owns the combination we target: **local-first deterministic geometry + legend-grounded VLM + estimator-in-the-loop review on the sheet itself.** Cloud auto-takeoff tools (Togal, Kreo, STACK) black-box the quantities; services (Beam) are slow loops; manual tools (PlanSwift, legacy PDF markup tools) automate nothing.

## 3. Methods & papers that matter

- **ParseBench (2026)**: ~2,000 human-verified pages, 169K+ rules across tables, charts, faithfulness, formatting, grounding. Closest public proxy for "did the schedule table survive parsing faithfully."
- **TableTransformer / TATR, TableFormer / OTSL (IBM Docling)**: DETR/transformer table detection + structure; the right baseline if our VLM schedule parsing needs a specialist stage.
- **LayoutLMv2/v3, LayoutXLM**: joint text+layout+image pre-training — the right architecture family for tag↔schedule key-value joins at scale.
- **Donut, Pix2Struct, Nougat, GOT**: OCR-free / specialist document models; cheaper and more precise than general VLMs on fixed schemas, at the cost of fine-tuning.
- **Rezvanifar et al. (2020) + UVic thesis**: YOLO-on-tiles symbol spotting + hybrid vector+pixel fusion for floor plans. Practical takeaway, validated across the field: winners do **tiled detection + legend-conditioned classes + vector-primitive fusion**, never whole-sheet single-shot detection. Our ADR-003 architecture matches this consensus with a VLM instead of a trained detector.
- **IEEE Access (2023), ObjNet (2025)**: Mask R-CNN / YOLOv8 variants for MEP/architectural symbols on dense plans; confirm the density problem is real and unsolved by vanilla detectors.
- **2024–25 survey consensus ("OCR → VLM")**: split pipeline — specialist for OCR/structure + general VLM for reasoning/verification — beats either alone on cost/latency/accuracy. Our division (PyMuPDF/Shapely geometry + `muse-spark-1.3` perception + `muse-wonder-1.0` reasoning) is exactly this split.

## 4. What still fails (industry) → where we win

1. **Scale errors** (wrong scale trusted, one scale for multi-viewport sheets, NTS details scaled) → our fail-closed per-viewport scale engine that emits `review_required` instead of a silent wrong number.
2. **Symbol variance** (no universal set, rotated/mirrored instances, congested sheets) → legend-first detection: read the sheet's own legend, then detect conditioned on it, with provenance.
3. **Schedule linking** (plan tag ≠ schedule tag, merged cells, remarks-column models) → typed schedule rows + tag join + ghost-pin review on canvas.
4. **Schematic vs geometric truth** (offsets "by contractor", riser ≠ plan, scope hidden in notes/keynotes) → copilot over ledger + notes, citing coordinates.
5. **Revision drift** (addenda renumber/move/reclass) → cross-sheet dedup + revision diff (roadmap).
6. **Bucketing** (right count, wrong gauge/schedule/insulation bucket prices wrong) → dimension + system + spec traveling together on every item.

The through-line: the industry fails on **trust** (silent wrong numbers) more than on recall. Every BlueTraceAI output carries its evidence or its doubt — coordinates, legend source, scale status, model provenance — and the estimator's one click turns it into auditable takeoff.
