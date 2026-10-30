# BlueTraceAI Fixtures & Test Ground-Truth Directory

This directory stores representative MEP drawing sheets and verified ground-truth datasets reused from the offline predecessor for continuous verification, regression testing, and hackathon demonstration.

---

## 1. Fixture Inventory

### 1.1 Mechanical Primary Takeoff Sheet
- **File**: `fixtures/mechanical/avexis_page_22.pdf`
- **Discipline**: Mechanical (HVAC Ductwork & Equipment)
- **Sheet Dimensions**: 3024.0 x 2160.0 pt (42" x 30" Arch E1)
- **Render Output**: 6300 x 4500 px @ 150 DPI
- **Scale**: `1/4" = 1'-0"` (verified 48.0 scale factor)
- **Ground Truth**: `fixtures/mechanical/avexis_page_22_gt.json` (21 Flexible Duct annotations)
- **Duct Line Segments**: `fixtures/mechanical/avexis_page_22_detected_hvac.json` (4,541 raw duct segments, resolving to 329 verified continuous centerline runs)
- **Primary Demonstration**: Startup track 3-minute flow (SheetScan -> Schedule linking -> QuickDraw hover dimensioning -> Vector centerline tracing -> Takeoff rollup).

### 1.2 Mechanical Symbol Benchmark (Fire Dampers)
- **File**: `fixtures/mechanical/pfmcc_page_118.pdf`
- **Discipline**: Mechanical (HVAC Fire Protection & Dampers)
- **Sheet Dimensions**: 3024.0 x 2160.0 pt (42" x 30" Arch E1)
- **Render Output**: 6300 x 4500 px @ 150 DPI
- **Ground Truth**: `fixtures/mechanical/pfmcc_page_118_gt.json` (168 Fire Damper / FD verified annotations)
- **Purpose**: Comparative benchmark for `muse-spark-1.3` VLM symbol detection vs legacy single-class YOLO detector (ADR-003).

### 1.3 Plumbing Pipeline Sheet
- **File**: `fixtures/plumbing/p104_1_plumbing_level4.pdf`
- **Discipline**: Plumbing (Level 4 Plan - Area 1)
- **Sheet Dimensions**: 3024.0 x 2160.0 pt (42" x 30" Arch E1)
- **Render Output**: 6300 x 4500 px @ 150 DPI
- **Line Segments**: `fixtures/plumbing/p104_1_detected_pipelines.json` (pipeline vector linework)
- **Purpose**: Verification of pipeline centerline derivation and multi-discipline scale adaptation.

---

## 2. Coordinate System Specifications

- **Native PDF Points**: Origin $(0, 0)$ is top-left, units in points ($1\text{ pt} = \frac{1}{72}\text{ inch}$).
- **Canvas / Raster Pixel Space (@ 150 DPI)**:
  $$\text{pixel} = \text{point} \times \frac{150}{72} = \text{point} \times 2.083333$$
- **QuickDraw Crop Window**:
  - $150\text{ pt} \times 150\text{ pt}$ in PDF coordinate space.
  - Converts to $312.5\text{ px} \times 312.5\text{ px}$ (rendered as $312\text{ px} \times 312\text{ px}$ at 150 DPI).
  - Represents $2.08\text{ in} \times 2.08\text{ in}$ physical paper area.

---

## 3. Testing & Verification

To verify that all fixtures render cleanly without error:
```bash
.venv/Scripts/python -c "import pymupdf, pathlib; [print(p.name, pymupdf.open(p)[0].rect) for p in pathlib.Path('fixtures').rglob('*.pdf')]"
```
