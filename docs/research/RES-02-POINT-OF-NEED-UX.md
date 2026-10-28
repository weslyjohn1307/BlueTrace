# RES-02: Point-of-Need Viewport & Cursor Crop UX

## 1. Concept: "The Sheet is the Interface"
Rather than executing slow, full-page vision operations, real-time intelligence is delivered at the point of the user's cursor:
1. The user hovers over an element or holds the `Q` key.
2. The client captures a localized 300x300 pixel bounding box centered on the cursor.
3. The crop is sent to the backend and processed by `muse-spark-1.3`.
4. A floating suggestion badge appears next to the cursor (e.g. `24x12 Rectangular Duct`).
5. A single click assigns the dimension to the active takeoff item.

---

## 2. Coordinate System Mapping

```text
Screen Coordinates (CSS Pixels)
       │
       ▼ (Inverse Canvas Zoom / Pan Transform)
Page Coordinates (PDF Points at 72 DPI)
       │
       ▼ (DPI Scaling Factor: 150 / 72 = 2.083x)
Rendered Image Crop Coordinates (Pixels)
```

### Precision Crop Calculation
* Given cursor position $(x_{pdf}, y_{pdf})$:
  - $x_{min} = \max(0, x_{pdf} - 75)$
  - $y_{min} = \max(0, y_{pdf} - 75)$
  - $x_{max} = \min(width_{pdf}, x_{pdf} + 75)$
  - $y_{max} = \min(height_{pdf}, y_{pdf} + 75)$
* Extracted crop is 150 pt × 150 pt (rendered at 150 DPI = 312 × 312 pixels).
* This provides optimal resolution for small drafting text while keeping network payload under 80 KB.
