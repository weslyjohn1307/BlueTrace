# PDF Geometry & Coordinate Math

> The deterministic core's primer. If a number cannot be derived through
> this chain, it is not a measurement.

## 1. Units and transforms **[code]**

- PDF user space: **points**, 72 pt = 1 inch. Page origin and rotation come
  from the page's MediaBox/rotation — always read them, never assume.
- Render scale at DPI *d*: `px = pt × d/72`. At the product's 150 DPI:
  factor **2.0833**; a 150 pt crop window renders to **312 px**.
- Real-world length: `L_real_ft = L_pt × ratio`, where `ratio` (ft/pt) comes
  only from a verified scale (architectural: e.g. 1/4"=1'-0" → 0.055556 ft/pt
  → 18 pt/ft; full table in `AEC_TITLE_BLOCKS_AND_SCALES.md`).
- Screen → page: invert the canvas pan/zoom transform *before* any crop or
  measurement; CSS pixels are not PDF points.

## 2. What PyMuPDF gives you **[code]**

- Vector paths: move/line/curve/rectangle ops with stroke/fill, line width,
  dash, color, and layer (OCG) where present. Curves (Bézier) must be
  flattened with a declared tolerance before length math.
- Text: spans with bboxes in points — the only trustworthy source for scale
  strings, dimension text, and tags on native PDFs. Scanned sheets have no
  vector/text layer; they route to VLM/OCR and lower trust.
- Raster renders (`get_pixmap(dpi=150, clip=...)`) for VLM crops and canvas.

## 3. Centerline derivation **[code]**

Rectangular duct is drawn as **paired parallel lines** (two walls). The
measurable object is the derived **centerline**: pair edges by proximity +
parallelism, average to a spine, then assemble spines into a graph
`G=(V,E)` (NetworkX): nodes = fittings/terminals/junctions, edges = runs.
Boundary-perimeter length is a **known wrong answer** — never report it as
duct length (this distinction is asserted in pipeline tests).

Tolerances (from `02-vector-geometry-eng`): orthogonal snap ≈ 5 pt,
collinear merge within 2°. Tolerances are code constants; cite the code,
don't re-derive them per task.

## 4. Precision rules

- Keep full float precision through the chain; round only at display.
- Every stored quantity carries provenance: sheet, page, viewport, geometry
  (bbox/coordinates), scale ratio + status, source (`VECTOR`, `QUICKDRAW_HOVER`,
  schedule link). Missing provenance = not a measurement.
- Bounding boxes from VLMs arrive normalized ([0,1000] per ParseBench
  convention) and must be denormalized through the same transform chain —
  mixing normalized and point coordinates is a classic silent corruption.

## Sources
This repo: `src/core_vector/` (extractor, representation, continuity, scale),
`tests/test_vector_pipeline.py`; `AEC_TITLE_BLOCKS_AND_SCALES.md`.
