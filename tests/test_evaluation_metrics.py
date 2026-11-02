"""Task-specific precision/recall evaluation metrics (TASK-EVAL-002)."""

from __future__ import annotations

import pytest

from src.meta_services.evaluator import box_iou, detection_metrics, match_detections


def _box(x0: float, y0: float, x1: float, y1: float, score: float = 1.0) -> dict:
    return {"bbox": [x0, y0, x1, y1], "score": score}


def test_box_iou_known_values() -> None:
    assert box_iou((0.0, 0.0, 10.0, 10.0), (0.0, 0.0, 10.0, 10.0)) == pytest.approx(1.0)
    assert box_iou((0.0, 0.0, 10.0, 10.0), (20.0, 20.0, 30.0, 30.0)) == pytest.approx(0.0)
    # Half-overlap on x: inter 50, union 150 -> 1/3.
    assert box_iou((0.0, 0.0, 10.0, 10.0), (5.0, 0.0, 15.0, 10.0)) == pytest.approx(1.0 / 3.0)


def test_perfect_detection_scores_one() -> None:
    dets = [_box(0.0, 0.0, 10.0, 10.0), _box(20.0, 20.0, 30.0, 30.0, 0.9)]
    gts = [{"bbox": [0.0, 0.0, 10.0, 10.0]}, {"bbox": [20.0, 20.0, 30.0, 30.0]}]
    metrics = detection_metrics(dets, gts)
    assert metrics["precision"] == pytest.approx(1.0)
    assert metrics["recall"] == pytest.approx(1.0)
    assert metrics["f1"] == pytest.approx(1.0)
    assert metrics["iou_mean"] == pytest.approx(1.0)
    assert metrics["true_positives"] == 2
    assert metrics["false_positives"] == 0
    assert metrics["false_negatives"] == 0
    assert metrics["num_detections"] == 2
    assert metrics["num_ground_truth"] == 2


def test_partial_detection_counts_fp_fn() -> None:
    dets = [
        _box(0.0, 0.0, 10.0, 10.0, 0.99),
        _box(100.0, 100.0, 110.0, 110.0, 0.5),
    ]
    gts = [{"bbox": [0.0, 0.0, 10.0, 10.0]}, {"bbox": [50.0, 50.0, 60.0, 60.0]}]
    metrics = detection_metrics(dets, gts)
    assert metrics["true_positives"] == 1
    assert metrics["false_positives"] == 1
    assert metrics["false_negatives"] == 1
    assert metrics["precision"] == pytest.approx(0.5)
    assert metrics["recall"] == pytest.approx(0.5)
    assert metrics["f1"] == pytest.approx(0.5)


def test_greedy_match_claims_each_truth_once() -> None:
    dets = [
        _box(0.0, 0.0, 10.0, 10.0, 0.9),
        _box(1.0, 1.0, 11.0, 11.0, 0.8),
    ]
    gts = [{"bbox": [0.0, 0.0, 10.0, 10.0]}]
    matched = match_detections(dets, gts)
    assert len(matched["matches"]) == 1
    assert matched["matches"][0][0] == 0
    assert matched["unmatched_detections"] == [1]
    assert matched["unmatched_ground_truth"] == []


def test_empty_inputs_populate_all_fields() -> None:
    metrics = detection_metrics([], [])
    for field in (
        "precision", "recall", "f1", "iou_mean", "iou_threshold",
        "true_positives", "false_positives", "false_negatives",
        "num_detections", "num_ground_truth",
    ):
        assert field in metrics
    assert metrics["precision"] == pytest.approx(1.0)
    assert metrics["recall"] == pytest.approx(1.0)

    metrics = detection_metrics([], [{"bbox": [0.0, 0.0, 5.0, 5.0]}])
    assert metrics["recall"] == pytest.approx(0.0)
    assert metrics["true_positives"] == 0
    assert metrics["false_negatives"] == 1
    assert metrics["iou_mean"] == pytest.approx(0.0)


def test_malformed_boxes_raise_fail_closed() -> None:
    with pytest.raises(ValueError):
        detection_metrics([{"bbox": [0.0, 0.0, 0.0, 10.0]}], [{"bbox": [0.0, 0.0, 5.0, 5.0]}])
    with pytest.raises(ValueError):
        detection_metrics([{"bbox": [0.0, 0.0, 5.0, 5.0]}], [{"bbox": [float("nan")] * 4}])
    with pytest.raises(ValueError):
        match_detections([{"bbox": "elsewhere"}], [])


def test_iou_threshold_gates_matches() -> None:
    dets = [_box(0.0, 0.0, 10.0, 10.0)]
    gts = [{"bbox": [5.0, 0.0, 15.0, 10.0]}]  # IoU = 1/3.
    assert detection_metrics(dets, gts, iou_threshold=0.25)["true_positives"] == 1
    assert detection_metrics(dets, gts, iou_threshold=0.5)["true_positives"] == 0
    with pytest.raises(ValueError, match="iou_threshold"):
        detection_metrics(dets, gts, iou_threshold=0.0)
