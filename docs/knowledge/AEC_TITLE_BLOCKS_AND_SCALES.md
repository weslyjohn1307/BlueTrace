# AEC Title Blocks, Sheet Taxonomy, and Scale Verification

## 1. Architectural vs. Engineering Scales

### 1.1 Architectural Scales (Fractional)
Architectural drawings represent building interiors, HVAC duct layouts, and piping runs in fractional inches per foot:

| Scale String | Equation | Factor ($\text{inches per foot}$) | Scale Ratio ($\text{ft} / \text{pt}$) | Points per Foot ($\text{pt} / \text{ft}$) |
|--------------|----------|-----------------------------------|---------------------------------------|-------------------------------------------|
| `1/8" = 1'-0"` | $1/8" = 12"$ | $0.125$ in/ft | $0.111111$ | $9.0$ pt/ft |
| `3/16" = 1'-0"` | $3/16" = 12"$ | $0.1875$ in/ft | $0.074074$ | $13.5$ pt/ft |
| `1/4" = 1'-0"` | $1/4" = 12"$ | $0.25$ in/ft | $0.055556$ | $18.0$ pt/ft |
| `3/8" = 1'-0"` | $3/8" = 12"$ | $0.375$ in/ft | $0.037037$ | $27.0$ pt/ft |
| `1/2" = 1'-0"` | $1/2" = 12"$ | $0.5$ in/ft | $0.027778$ | $36.0$ pt/ft |
| `3/4" = 1'-0"` | $3/4" = 12"$ | $0.75$ in/ft | $0.018519$ | $54.0$ pt/ft |
| `1" = 1'-0"` | $1" = 12"$ | $1.0$ in/ft | $0.013889$ | $72.0$ pt/ft |
| `1-1/2" = 1'-0"` | $1.5" = 12"$ | $1.5$ in/ft | $0.009259$ | $108.0$ pt/ft |
| `3" = 1'-0"` | $3.0" = 12"$ | $3.0$ in/ft | $0.004630$ | $216.0$ pt/ft |

*Note: PDF geometry points are defined as $72 \text{ points} = 1.0 \text{ inch}$.*

### 1.2 Engineering Scales (Decimal / Civil)
Civil and site utility plans use engineering scale ratios:
- `1" = 10'` $\implies 1.0 \text{ in} = 120 \text{ in} \implies 7.2 \text{ pt/ft}$
- `1" = 20'` $\implies 1.0 \text{ in} = 240 \text{ in} \implies 3.6 \text{ pt/ft}$
- `1" = 30'` $\implies 1.0 \text{ in} = 360 \text{ in} \implies 2.4 \text{ pt/ft}$
- `1" = 40'` $\implies 1.0 \text{ in} = 480 \text{ in} \implies 1.8 \text{ pt/ft}$
- `1" = 50'` $\implies 1.0 \text{ in} = 600 \text{ in} \implies 1.44 \text{ pt/ft}$

---

## 2. Fail-Closed Scale Verification Protocol

### 2.1 The Multi-Signal Discrepancy Gate
A sheet cannot be marked as verified unless all available signals agree:
1. **Title Block Scale**: String extracted from title block or drawing header (e.g. `SCALE: 1/4" = 1'-0"`).
2. **Graphic Bar Scale**: Vector alternating black/white segments with labeled dimension marks ($0', 4', 8', 16'$).
3. **Dimension String Verification**: Extracted dimension text (e.g. `12'-6"`) compared against the vector linework length between witness lines.

### 2.2 Review Required Triggers
The system MUST emit `review_required = True` and withhold automatic linear takeoffs when:
- Multiple detail viewports with conflicting scales are present without unambiguous boundary demarcation.
- The title block states `SCALE: AS NOTED` or `SCALE: NONE`.
- Extracted dimension linework deviates by $> 3\%$ from the nominal scale ratio.
- The drawing has been scaled down or printed as "Fit to Printable Area" rather than "100% Actual Size" (causing non-standard shrink distortion).

---

## 3. Sheet Numbering Taxonomy

| Prefix | Discipline | Typical Drawing Content |
|--------|------------|-------------------------|
| `M` / `HVAC` | Mechanical | Ductwork, chillers, boilers, diffusers, VAV boxes, RTUs |
| `E` / `ELEC` | Electrical | Lighting fixtures, power panels, conduit, one-line diagrams |
| `P` / `PLUMB` | Plumbing | Domestic water, sanitary waste, vent piping, roof drains |
| `FP` / `FA` | Fire Protection | Sprinkler heads, standpipes, fire alarm pull stations |
| `A` / `ARCH` | Architectural | Floor plans, room partitions, door schedules, reflected ceiling plans (RCP) |
| `S` / `STRUC` | Structural | Foundation, column grid lines, steel framing, shear walls |
| `C` / `CIVIL` | Civil / Site | Grading, utilities, property boundaries, exterior paving |
| `G` / `GEN` | General | Cover sheet, sheet index, code compliance, abbreviations, legend |
