# ParseBench (arXiv:2604.08538) VLM Document Understanding Principles

## 1. Executive Summary
ParseBench (*"ParseBench: A Document Parsing Benchmark for AI Agents"*, arXiv:2604.08538) provides rigorous foundational criteria for evaluating multimodal VLM performance in enterprise document extraction.

For BlueTraceAI, ParseBench principles dictate how we design prompt schemas, process multi-level mechanical schedule tables, and enforce visual grounding between model outputs and physical drawing pixels.

---

## 2. Five Core ParseBench Capabilities Applied to AEC Drawings

### 2.1 Table Structure Preservation
- **Challenge**: MEP schedules (Air Handling Unit schedules, VAV Box schedules, Fan schedules, Diffuser schedules) feature merged header cells (e.g. `COOLING COIL` spanning `MBH`, `GPM`, `EAT`, `LAT`), rotated text, and row striping.
- **ParseBench Invariant**: Semantic correctness requires that every data cell maintains strict hierarchical association with its column header path:
  $$\text{Path} = [\text{Group Header}] \to [\text{Sub-Header}] \to [\text{Unit of Measure}]$$
- **Implementation in `schedule_matcher.py`**: Do not flatten tables into raw text lines. Use `muse-spark-1.3` with structured JSON schema output forcing explicit headers and column indices.

### 2.2 Visual Grounding & Bounding Box Normalization
- **Challenge**: Estimators must verify where a data point originated on the sheet. Unanchored LLM outputs are unverifiable and create liability.
- **ParseBench Invariant**: Every extracted entity (schedule row, equipment tag, duct dimension callout) must return a normalized bounding box $[y_1, x_1, y_2, x_2] \in [0, 1000]$.
- **Pixel Mapping Formula**:
  $$x_{\text{px}} = \frac{x_{\text{norm}}}{1000} \times W_{\text{raster}}$$
  $$y_{\text{px}} = \frac{y_{\text{norm}}}{1000} \times H_{\text{raster}}$$

### 2.3 Semantic Formatting & Faithfulness
- **Zero Hallucination of Values**: If a CFM column is blank or marked with a dash (`-`), the parser must emit `null` rather than guessing a nominal airflow.
- **Preservation of Engineering Notation**: Fractions ($1/4"$, $3/8"$, $1-1/2"$), degree symbols ($^\circ\text{F}$), static pressure inches water gauge ($" \text{w.g.}$), and airflow ($CFM$) must be preserved without lossy float rounding.

### 2.4 Multi-Resolution Tiling & Localized Crops
- **Resolution Limit**: Construction sheets are large format (Arch D: $24" \times 36"$, Arch E: $36" \times 48"$). Feeding a full 300 DPI sheet ($10,800 \times 14,400$ pixels) directly into a VLM degrades small text legibility ($1/8"$ text becomes blurred).
- **ParseBench Best Practice**:
  1. Full-page low-resolution scan ($150 \text{ DPI}$) for global layout and title block detection.
  2. Targeted multi-resolution crops ($300 \times 300 \text{ px}$ to $1200 \times 1200 \text{ px}$ at full resolution) for localized symbol recognition and dimension text parsing.

### 2.5 Silent Failure Elimination
- **Adversarial Edge Cases**: Mismatched columns, missing keys, unexpected text abbreviations (`EXH` vs `EA`, `SUP` vs `SA`).
- **Fail-Closed Gate**: Pydantic schema validation traps unexpected values, logging them to review queues rather than causing silent pipeline termination or data corruption.
