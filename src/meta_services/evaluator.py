"""Task-specific precision/recall evaluation harness.

Deterministic metric computation for OCR, symbol detection, and schedule
row extraction benchmarks. Models never run here: this module scores
already-produced boxes against immutable ground truth.

Fail-closed rules:
  - Malformed boxes (wrong arity, non-finite, zero/negative area) raise
    ``ValueError`` -- a benchmark must never silently drop a prediction.
  - Every returned dict populates ALL metric fields, including degenerate
    inputs (empty detections and/or empty ground truth).
"""

from __future__ import annotations

import math
from typing import Any

Box = tuple[float, float, float, float]


def _coerce_box(value: object, *, field: str) -> Box:
    """Validate a ``[x0, y0, x1, y1]`` box; raise ``ValueError`` when unmeasurable."""
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(f"{field} must be [x0, y0, x1, y1], got {value!r}")
    try:
        coords = tuple(float(v) for v in value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must hold four numeric coords: {exc}") from exc
    if any(not math.isfinite(v) for v in coords):
        raise ValueError(f"{field} must be finite, got {coords!r}")
    x0, y0, x1, y1 = coords
    if not (x0 < x1 and y0 < y1):
        raise ValueError(f"{field} must have positive area, got {coords!r}")
    return (x0, y0, x1, y1)


def box_iou(a: Box, b: Box) -> float:
    """2D intersection-over-union of two ``[x0, y0, x1, y1]`` boxes."""
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if inter <= 0.0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def _det_box(det: dict[str, Any], index: int) -> tuple[Box, float]:
    if not isinstance(det, dict):
        raise TypeError(f"detections[{index}] must be a dict, got {det!r}")
    box = _coerce_box(det.get("bbox"), field=f"detections[{index}].bbox")
    try:
        score = float(det.get("score", 1.0))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"detections[{index}].score must be numeric: {exc}") from exc
    if not math.isfinite(score):
        raise ValueError(f"detections[{index}].score must be finite, got {score!r}")
    return box, score


def match_detections(
    detections: list[dict[str, Any]],
    ground_truth: list[dict[str, Any]],
    *,
    iou_threshold: float = 0.5,
) -> dict[str, Any]:
    """Greedily match detections to ground truth by descending score.

    Each detection matches at most one ground-truth box (highest IoU at or
    above threshold); each ground-truth box is claimed at most once.
    Returns ``{"matches": [(det_idx, gt_idx, iou)], "unmatched_detections":
    [...], "unmatched_ground_truth": [...], "iou_threshold": ...}``.
    """
    if not 0.0 < iou_threshold <= 1.0:
        raise ValueError(f"iou_threshold must lie in (0, 1], got {iou_threshold!r}")
    det_boxes = [_det_box(det, i) for i, det in enumerate(detections)]
    gt_boxes = [
        _coerce_box(gt.get("bbox"), field=f"ground_truth[{i}].bbox")
        if isinstance(gt, dict)
        else _coerce_box(None, field=f"ground_truth[{i}].bbox")
        for i, gt in enumerate(ground_truth)
    ]
    order = sorted(range(len(det_boxes)), key=lambda i: det_boxes[i][1], reverse=True)
    claimed: set[int] = set()
    matches: list[tuple[int, int, float]] = []
    unmatched_detections: list[int] = []
    for det_idx in order:
        box, _ = det_boxes[det_idx]
        best_gt, best_iou = -1, iou_threshold
        for gt_idx, gt_box in enumerate(gt_boxes):
            if gt_idx in claimed:
                continue
            iou = box_iou(box, gt_box)
            if iou >= best_iou:
                best_gt, best_iou = gt_idx, iou
        if best_gt >= 0:
            claimed.add(best_gt)
            matches.append((det_idx, best_gt, best_iou))
        else:
            unmatched_detections.append(det_idx)
    unmatched_ground_truth = [i for i in range(len(gt_boxes)) if i not in claimed]
    return {
        "matches": matches,
        "unmatched_detections": unmatched_detections,
        "unmatched_ground_truth": unmatched_ground_truth,
        "iou_threshold": iou_threshold,
    }


def detection_metrics(
    detections: list[dict[str, Any]],
    ground_truth: list[dict[str, Any]],
    *,
    iou_threshold: float = 0.5,
) -> dict[str, Any]:
    """Score detections vs ground truth: precision/recall/F1/IoU dict.

    All fields are always populated. Degenerate convention (documented):
    empty detections AND empty ground truth agree vacuously (precision =
    recall = F1 = 1.0, counts 0); a one-sided empty input scores 0.0 on the
    affected ratios. ``iou_mean`` is the mean IoU over true positives
    (0.0 when there are none).
    """
    matched = match_detections(detections, ground_truth, iou_threshold=iou_threshold)
    matches = matched["matches"]
    tp = len(matches)
    fp = len(matched["unmatched_detections"])
    fn = len(matched["unmatched_ground_truth"])
    precision = tp / (tp + fp) if (tp + fp) else 1.0 if not ground_truth else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    iou_mean = sum(iou for _, _, iou in matches) / tp if tp else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "iou_mean": iou_mean,
        "iou_threshold": iou_threshold,
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "num_detections": len(detections),
        "num_ground_truth": len(ground_truth),
    }
