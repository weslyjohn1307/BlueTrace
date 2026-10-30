# MEP Glossary & Tag Taxonomy

> Tags are **foreign keys**: plan tag → schedule row → priced item. Preserve
> tag strings exactly (case, dashes, suffixes); never normalize them away.

## 1. HVAC tag prefixes **[standard; extended in RES-07 §1]**

| Prefix | Meaning | Counted as |
|---|---|---|
| `VAV-` | Variable-air-volume terminal unit | Each, keyed to VAV schedule (max/min CFM, inlet, reheat) |
| `FPB-` | Fan-powered box | Each |
| `SD / D-` | Supply diffuser | Each, neck + CFM from diffuser schedule |
| `RG / R-` | Return grille/register | Each |
| `EG / E-` | Exhaust grille | Each |
| `FD` | Fire damper (UL 555, fusible link) | Each, life-safety — never merge with VD |
| `SD` (damper context) | Smoke damper | Each — prefix collision with supply diffuser; disambiguate by sheet/system context, flag ambiguity |
| `FSD` | Combination fire/smoke damper | Each |
| `VD / VCD` | Volume (control) damper | Each |
| `AHU- / FCU- / EF- / CU-` | Air handler / fan-coil / exhaust fan / condensing unit | Each, schedule-priced |
| `SIL-` | Silencer / sound attenuator | Each |

Plumbing fixtures: `WC` water closet, `LAV` lavatory, `UR` urinal, `WH` water
heater, `FD` floor drain — note `FD` collides with fire damper; discipline
context (M vs P sheet) decides, uncertainty flags.

## 2. Units & abbreviations

| Term | Meaning | Agent rule |
|---|---|---|
| CFM | Cubic feet per minute (airflow) | Schedule value; never derive from geometry |
| AFF | Above finished floor | Mounting height note, not a length to add |
| LF | Linear feet | Centerline length only |
| w.g. | Inches water gauge (static pressure) | Drives duct gauge class in SMACNA context |
| TDC/TDF | Transverse duct/flange connections | Fitting/joint language, not run length |
| NTS | Not to scale | Schematic — counts only, never measure |
| ESP / NC | External static pressure / noise criteria | VAV schedule fields |
| `24x12`, `16/10` | Duct WxH inches (rect) / spiral sizes | First number is width as drawn; preserve order |

## 3. Systems (for ledger grouping)

Supply, Return, Exhaust/Relief, Outside air; hydronic supply/return;
refrigerant; domestic hot/cold water; sanitary/vent; gas. System assignment
comes from sheet context + schedule, not from line color alone.

## Sources
`RES-07` §1 tag taxonomy; `MEP_HVAC_STANDARDS.md` §2 device/damper classes.
