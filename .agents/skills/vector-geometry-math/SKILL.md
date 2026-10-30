---
name: vector-geometry-math
description: Guidelines and mathematical formulas for PDF vector linework, centerline tracing, scale calibration, and aspect ratio checks.
---

# Vector Geometry Math Skill

Use this skill when implementing or modifying geometry routines in `src/core_vector/`.

## Core Formulas
1. **Scale Ratio Calculation**:
   $$\text{scale\_ratio} = \frac{\text{real\_world\_feet}}{\text{pdf\_points}}$$
   Example: For $1/4" = 1'-0"$, 1 foot real-world equals $0.25 \times 72 = 18$ points. Thus:
   $$\text{scale\_ratio} = \frac{1.0}{18.0} \approx 0.055555\dots \text{ ft/pt}$$

2. **Duct Surface Area & Weight**:
   - Rectangular: $A_{\text{sqft}} = \frac{2 \times (W + H) \times L}{12}$ (where $W, H$ are in inches, $L$ in feet).
   - Round: $A_{\text{sqft}} = \frac{\pi \times D \times L}{12}$ (where $D$ is in inches, $L$ in feet).

3. **SMACNA Aspect Ratio Invariant**:
   $$\text{aspect\_ratio} = \frac{\max(W, H)}{\min(W, H)}$$
   If $\text{aspect\_ratio} > 4.0$, flag as `reinforcement_required = True`.
