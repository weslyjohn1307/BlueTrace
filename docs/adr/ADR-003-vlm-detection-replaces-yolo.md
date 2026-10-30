# ADR-003: VLM-Based Symbol Detection Replaces YOLO Detector

## Status
Accepted (2026-10-30). Source: Questions.md Q4-followup.

## Context
The predecessor (`D:\Imagineers`) ships an Ultralytics YOLO11n detector trained on
a single class (fire dampers, 175 verified objects) plus ~72 MB of weights
(`yolo11n.pt`, `rtdetr-l.pt`). Extending it to the dozens of MEP symbol classes
(diffusers, VAVs, valves, pumps, fixtures) requires per-class data collection and
retraining — a struggle that blocks breadth. We now have live Meta Model API
access with `muse-spark-1.3` vision.

## Decision
Do not migrate or retrain the YOLO detector. Replace it with a VLM detection
agent:

1. Agent 2 (legend interpreter) reads each sheet's legend block and builds a
   symbol→label map for that sheet only.
2. The detection agent runs `muse-spark-1.3` over 150 DPI tiles with the legend
   map as context, returning strict-JSON `{bbox, label, confidence}` per tile.
3. Agent 4 (evidence verifier) corroborates hits against the native PDF
   text/vector layer; weak hits fail closed into `SUGGESTED` ghost pins for
   one-click human accept/reject.

`sam-3.1` remains separate: click-to-segment rooms/equipment, not symbol detection.

## Consequences
- Positive: unlimited symbol breadth without retraining; no weight files in repo;
  per-sheet legend grounding reduces cross-sheet bleed; human-in-the-loop fits
  the demo story and the fail-closed invariant.
- Negative: dense full-sheet counting precision will trail a trained per-class
  detector; tiled VLM detection is background/async (seconds per sheet), never on
  the <500 ms hover path.
- Validation: score VLM detections against dataset ground truth (Avexis 329 runs,
  PfMCC 175 dampers) and quote measured precision in the demo.
