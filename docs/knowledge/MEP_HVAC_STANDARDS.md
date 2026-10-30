# SMACNA & ASHRAE MEP/HVAC Engineering Knowledge Base

## 1. SMACNA HVAC Duct Construction Standards (Metal and Flexible)

### 1.1 Core Principles
Duct takeoff calculations require converting linear duct centerlines into physical sheet metal surface area, gauge weight, and fitting counts based on SMACNA standards.

### 1.2 Rectangular Duct Aspect Ratios
- **Definition**: $\text{Aspect Ratio} = \frac{\max(W, H)}{\min(W, H)}$
- **SMACNA Baseline Rule**: Recommended aspect ratio is $\le 3:1$. The strict engineering threshold is $\le 4:1$.
- **Structural Consequence**: Rectangular ducts with aspect ratios $> 4:1$ experience severe deflection on the wide unsupported panel under static pressure ($\pm 1"$, $2"$, $3"$ w.g.).
- **Design Requirement (not yet implemented)**: BlueTraceAI should flag any duct with aspect ratio $> 4:1$ (e.g. `reinforcement_required = True`), advising the estimator that intermediate tie-rods or heavier gauge transverse joints (TDC/TDF) are required. No aspect-ratio check exists in `src/` today; this is a requirement for the build stage, not a shipped feature.

### 1.3 Surface Area & Weight Calculations
- **Rectangular Duct Surface Area**:
  $$A_{\text{sqft}} = \frac{2 \times (W + H) \times L}{12}$$
  Where:
  - $W$: Duct width in inches
  - $H$: Duct height in inches
  - $L$: Duct length in feet
- **Round Spiral Duct Surface Area**:
  $$A_{\text{sqft}} = \frac{\pi \times D \times L}{12}$$
  Where:
  - $D$: Duct diameter in inches
  - $L$: Duct length in feet
- **Flat Oval Duct Surface Area**:
  $$A_{\text{sqft}} = \frac{(\pi \times H + 2 \times (W - H)) \times L}{12}$$
  Where $W > H$.

### 1.4 Galvanized Steel Sheet Metal Gauge Weights
Standard SMACNA sheet metal weights used for material cost estimation:

| Gauge | Thickness (in) | Nominal Weight ($lb/ft^2$) | Common Application |
|-------|----------------|----------------------------|--------------------|
| 26 ga | 0.0217"        | 0.906                      | Residential / Small runouts ($\le 12"$) |
| 24 ga | 0.0276"        | 1.156                      | Standard low pressure branches ($13" - 30"$) |
| 22 ga | 0.0336"        | 1.406                      | Medium pressure mains ($31" - 54"$) |
| 20 ga | 0.0396"        | 1.656                      | Heavy commercial mains ($55" - 84"$) |
| 18 ga | 0.0516"        | 2.156                      | Large industrial / Smoke exhaust ($> 84"$) |

---

## 2. ASHRAE Blueprint Symbols & Classifications

### 2.1 Air Distribution & Terminal Devices
- **Supply Diffuser (SD)**: Square or linear slot ceiling diffuser with CFM callout and neck size (e.g. `24x24 / 10" neck / 350 CFM`). Vector symbol: Square with four diagonal arrows pointing outward from center.
- **Return Grille (RG)**: Perforated or eggcrate ceiling return. Vector symbol: Rectangle with single diagonal line slash.
- **Exhaust Grille (EG)**: Wall or ceiling exhaust. Vector symbol: Rectangle with an "X" cross pattern.

### 2.2 Life Safety & Control Dampers
- **Fire Damper (FD)**: UL 555 rated mechanical barrier held open by a fusible link ($165^\circ\text{F}$ or $212^\circ\text{F}$). Symbol: Duct break with shaded or hatched rectangle and "FD" label.
- **Smoke Damper (SD)**: Motorized damper tied to smoke detector controls. Symbol: Shaded rectangle with "SD" label and actuator circle.
- **Combination Fire/Smoke Damper (FSD)**: Rated for both temperature barrier and smoke isolation. Symbol: Hatched rectangle with "FSD" callout.
- **Volume Damper (VD)**: Manual balancing damper. Symbol: Diagonal blade with handle indicator.

### 2.3 Variable Air Volume (VAV) & Terminal Units
- **Single-Duct VAV Box**: Modulates airflow to a zone with internal velocity sensor and actuator. Callout syntax: `VAV-1-1 (650 Max CFM / 200 Min CFM)`.
- **Fan-Powered Box (FPB)**: VAV box with integrated booster fan and electric/hot water heating coil.

---

## 3. System Color Coding Standard (Weave AEC HIG)
To ensure instant visual comprehension on technical drawings:
- **Supply Air**: Dodger Blue (`#3b82f6`)
- **Return Air**: Emerald Green (`#10b981`)
- **Exhaust / Relief Air**: Amber / Tangerine (`#f59e0b`)
- **Outside / Fresh Air**: Purple (`#8b5cf6`)
- **Fire & Smoke Life Safety**: Crimson Red (`#ef4444`)
- **Review Required / Discrepancy**: Neon Amber / Warning Glow (`#f59e0b` with 500ms pulse)
