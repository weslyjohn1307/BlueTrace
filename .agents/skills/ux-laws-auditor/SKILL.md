---
name: ux-laws-auditor
description: Checklist and evaluation rules for the 12 Laws of UX applied to engineering CAD interfaces.
---

# UX Laws Auditor Skill

Use this skill when reviewing frontend components in `frontend/src/`.

## Key Verification Gates
1. **Doherty Threshold**: Is there a visible response within 400ms for every user interaction?
2. **Fitts's Law**: Are primary action buttons (Pan, Calibrate, Run Takeoff, Export) at least 40px tall with keyboard access?
3. **Jakob's Law**: Does the drawing viewport pan and zoom identically to industry standards (Figma/DesktopT)?
4. **Miller's Law**: Are complex item lists chunked into manageable batches with search and filters?
5. **Error Prevention (Slips vs Mistakes)**: Does deleting a takeoff item require confirmation or provide undo?
