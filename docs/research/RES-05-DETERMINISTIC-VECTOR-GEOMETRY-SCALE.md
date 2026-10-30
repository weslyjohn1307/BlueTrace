# RES-05: Deterministic Vector Linework & Scale Integrity

## 1. The Core Engineering Invariant

In construction estimating, **inaccurate quantities lose bids or create catastrophic cost overruns**. 
While Large Multimodal Models (VLMs) excel at semantic categorization (recognizing that an object is an air diffuser or reading a text tag), **they must never be permitted to calculate linear footages or scale transformations via pixel estimation**.

BlueTraceAI enforces a strict separation:
$$\text{Total Length} = \sum_{i=1}^{n} \text{VectorSegmentLength}_i \times \text{ScaleRatio}$$
Where:
- $\text{VectorSegmentLength}_i$ is derived directly from PDF vector path geometry at sub-pixel resolution ($72\text{ pt/inch}$).
- $\text{ScaleRatio}$ is validated through a conservative, fail-closed scale verification engine.

---

## 2. Native PDF Vector Geometry Extraction

Using PyMuPDF (`fitz`), BlueTraceAI extracts vector drawing primitives without rasterizing the drawing to an image:

```text
PDF Drawing Primitives
       │
       ├── Line Segments (p1 -> p2)
       ├── Bezier Curves & Arcs
       └── Closed Rectangles / Polygons
              │
              ▼ (Filtering Non-Duct Geometry)
Layer & Stroke Filtering (Line weight, color, dashed styles)
              │
              ▼
Topological Linework Graph (Nodes = Vertices, Edges = Centerline Paths)
```

### Paired Double-Line Duct Centerline Generation
1. Commercial HVAC ductwork on 1/4" or 1/8" drawings is typically drawn as **paired parallel lines** representing the duct walls.
2. The extraction engine:
   - Identifies parallel segment pairs separated by standard duct widths (e.g. 6", 8", 10", 12", 14", 16", 18", 24").
   - Synthesizes the central centerline path equidistant between the parallel walls.
   - Calculates exact length along the centerline, preventing double-counting of duct wall perimeter.

---

## 3. The Conservative Fail-Closed Scale Rule

A major failure mode in automated takeoff software is applying the wrong scale (e.g. applying the 1/4" floor plan scale to an enlarged 1/2" mechanical room detail).

### Scale States:
1. **`VERIFIED`**: Scale string matched against standard architectural formats (e.g., `1/4" = 1'-0"`, `1/8" = 1'-0"`, `1:100`) AND corroborated by sheet title block coordinates or explicit calibration measurement.
2. **`UNVERIFIED`**: Multiple conflicting scale annotations detected on the sheet (e.g. plan + detail views), or scale string missing/unreadable.
3. **`CALIBRATED`**: User manually clicked two reference points (e.g. a known 30-foot grid line) and entered the dimension.

### Fail-Closed Behavior:
* If a sheet's scale state is `UNVERIFIED`:
  - The UI displays an amber warning badge on the canvas: `⚠️ Scale Unverified - Click to Calibrate`.
  - Calculated footages are displayed in PDF points with a clear `Review Required` warning.
  - The copilot explicitly states: *"The scale for sheet M-201 is unverified. Please confirm the sheet scale before exporting linear footages."*
