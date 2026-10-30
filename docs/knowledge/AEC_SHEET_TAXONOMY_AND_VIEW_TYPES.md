# AEC Sheet Taxonomy & View Types

> Status markers: **[code]** asserted by this repo · **[standard]** industry
> convention · **[requirement]** not yet implemented.

## 1. Sheet numbering by discipline **[standard]**

US AEC sets prefix sheet numbers by discipline (AIA CAD Layer Guidelines /
National CAD Standard conventions):

| Prefix | Discipline | Typical contents |
|---|---|---|
| `G` | General | Cover, sheet index, symbols/legends, code summary |
| `C` | Civil | Site plan, grading, utilities (engineering scales) |
| `A` | Architectural | Floor plans, elevations, sections, details, schedules (door/finish) |
| `S` | Structural | Framing, foundations, details |
| `M` | Mechanical | HVAC plans, duct layouts, mechanical schedules, risers |
| `P` | Plumbing | Domestic water, sanitary, gas, fixtures |
| `E` | Electrical | Power, lighting, panel schedules |
| `FP` / `FA` | Fire protection / alarm | Sprinklers, devices |

Numbering within a discipline is sequential by floor then detail sheets
(e.g. `M-101` first-floor HVAC plan, `M-201` second floor, `M-501+` details).
**Implication for agents:** sheet number is a *prior*, never proof. Classifier
output must agree with title-block text and content; conflicts fail closed
(see `AEC_TITLE_BLOCKS_AND_SCALES.md` multi-signal gate).

## 2. View types on a sheet, and what scale means in each

| View | Scale behaviour | Takeoff rule |
|---|---|---|
| Floor/ceiling plan | One stated scale (title block) | Measurable when verified |
| Detail (enlarged plan, section) | Own scale, usually larger (`1/2"`, `1-1/2"`…) | Independent calibration per viewport |
| Riser / schematic diagram | **Not to scale (NTS)** by design | **Never measure lengths** — counts/topology only **[code: pipeline rejects schematics]** |
| Schedule sheet | No geometry | Tables only; joins by tag |
| Legend sheet | No geometry | Symbol definitions; feeds DOC-04 (planned) |
| Notes/general sheet | No geometry | Requirements text |

**Non-negotiable:** a single sheet can contain multiple viewports at different
scales. Any length must carry the viewport it was measured in; a global
per-sheet ratio is a bug, not a simplification.

## 3. Title block anatomy **[standard]**

Bottom/right strip typically carries: project name/number, sheet number +
title, drawn/checked initials, date, revisions, and **scale statement(s)** —
sometimes "AS NOTED" when views differ (then per-view scale labels govern).
Title-block OCR that returns a single scale on an "AS NOTED" sheet must be
treated as UNVERIFIED for plan views until per-view evidence agrees.

## 4. Drawing-set lifecycle

Issuance stages (SD → DD → CD → IFC → addenda/bulletins → as-builts) mean the
*same sheet number* recurs with changes. Agents must never merge quantities
across revisions silently; revision/date is part of a sheet's identity.

## Sources
AIA/NCS sheet-identification conventions; this repo's `scale.py` schematic
rejection tests (`tests/test_vector_pipeline.py`); `RES-07` §1–2.
