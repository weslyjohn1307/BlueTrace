"""Static gold-standard benchmark fixture runner (TASK-EVAL-001).

Validates the deterministic coordinate pipeline against immutable
ground-truth drawing fixtures (``fixtures/mechanical/*_gt.json``):

- Schema gate: every fixture carries usable images/annotations with
  finite, positive-area COCO boxes inside the raster bounds.
- Geometry gate: each ground-truth box round-trips through the tiling
  math (sheet px -> tile-normalized -> PDF points via
  ``untile_candidate``) and lands within +/-0.5 pt of the direct
  px-to-pt conversion. A drift beyond tolerance means the pipeline
  geometry no longer measures what the fixtures prove.
- Counterpart gate: machine-produced ``*_detected_*.json`` siblings share
  the fixture image geometry (same raster size).

No model runs here; fixtures are the frozen verdict.
"""

from __future__ import annotations

import glob
import json
import math
import os
from pathlib import Path

import pytest

from src.meta_services.tiling import SheetTilingEngine, SymbolCandidate, untile_candidate

FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures"
GT_GLOB_PATTERNS = ("mechanical/*_gt.json", "plumbing/*_gt.json")
GT_TOLERANCE_PT = 0.5
PX_TO_PT_AT_150_DPI = 72.0 / 150.0


def _gt_files() -> list[Path]:
    found: list[Path] = []
    for pattern in GT_GLOB_PATTERNS:
        found.extend(Path(p) for p in sorted(glob.glob(str(FIXTURE_ROOT / pattern))))
    return found


def _load_gt(path: Path) -> dict:
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    assert isinstance(data, dict), f"{path.name} must hold a JSON object"
    return data


def _coco_to_pt_corners(bbox: list[float]) -> tuple[float, float, float, float]:
    x, y, w, h = (float(v) for v in bbox)
    return (
        x * PX_TO_PT_AT_150_DPI,
        y * PX_TO_PT_AT_150_DPI,
        (x + w) * PX_TO_PT_AT_150_DPI,
        (y + h) * PX_TO_PT_AT_150_DPI,
    )


def _containing_tile(tiles: list, x0: float, y0: float, x1: float, y1: float):
    """First tile fully containing the px box (overlap guarantees one)."""
    for tile in tiles:
        if (
            tile.x_offset_px <= x0
            and x1 <= tile.x_offset_px + tile.width_px
            and tile.y_offset_px <= y0
            and y1 <= tile.y_offset_px + tile.height_px
        ):
            return tile
    raise AssertionError(f"No tile contains box {(x0, y0, x1, y1)!r}")


@pytest.mark.parametrize("gt_path", _gt_files(), ids=lambda p: Path(str(p)).name)
def test_ground_truth_schema_valid(gt_path: Path) -> None:
    data = _load_gt(Path(str(gt_path)))
    images = {img["id"]: img for img in data.get("images", [])}
    assert images, f"{gt_path} has no images"
    categories = {cat["id"] for cat in data.get("categories", [])}
    assert categories, f"{gt_path} has no categories"
    annotations = data.get("annotations", [])
    assert annotations, f"{gt_path} has no annotations"
    for ann in annotations:
        assert ann["image_id"] in images, f"annotation {ann.get('id')} has unknown image"
        assert ann["category_id"] in categories, f"annotation {ann.get('id')} has unknown category"
        bbox = ann["bbox"]
        assert isinstance(bbox, list) and len(bbox) == 4
        x, y, w, h = (float(v) for v in bbox)
        assert all(math.isfinite(v) for v in (x, y, w, h))
        assert w > 0 and h > 0, f"annotation {ann.get('id')} has non-positive area"
        img = images[ann["image_id"]]
        assert 0 <= x and 0 <= y and x + w <= img["width"] and y + h <= img["height"], (
            f"annotation {ann.get('id')} escapes the raster"
        )
        assert float(ann.get("area", w * h)) == pytest.approx(w * h, rel=1e-3)


@pytest.mark.parametrize("gt_path", _gt_files(), ids=lambda p: Path(str(p)).name)
def test_pipeline_geometry_matches_ground_truth_within_half_point(gt_path: Path) -> None:
    """Every GT box survives the tile round-trip within +/-0.5 pt."""
    data = _load_gt(Path(str(gt_path)))
    worst = 0.0
    checked = 0
    for img in data["images"]:
        width, height = int(img["width"]), int(img["height"])
        engine = SheetTilingEngine(sheet_width_px=width, sheet_height_px=height)
        tiles = engine.tile_sheet()
        for ann in [a for a in data["annotations"] if a["image_id"] == img["id"]]:
            x, y, w, h = (float(v) for v in ann["bbox"])
            tile = _containing_tile(tiles, x, y, x + w, y + h)
            tile_bbox = (
                (x - tile.x_offset_px) / 1.024,
                (y - tile.y_offset_px) / 1.024,
                (x + w - tile.x_offset_px) / 1.024,
                (y + h - tile.y_offset_px) / 1.024,
            )
            candidate = SymbolCandidate(
                symbol_label="BENCH",
                tile_col=tile.col,
                tile_row=tile.row,
                x_offset_px=tile.x_offset_px,
                y_offset_px=tile.y_offset_px,
                tile_bbox=tile_bbox,
                confidence=1.0,
            )
            got = untile_candidate(candidate)
            want = _coco_to_pt_corners([x, y, w, h])
            for g, e in zip(got, want):
                drift = abs(g - e)
                worst = max(worst, drift)
                assert drift <= GT_TOLERANCE_PT, (
                    f"annotation {ann.get('id')}: corner drift {drift:.4f} pt > "
                    f"{GT_TOLERANCE_PT} pt tolerance"
                )
            checked += 1
    assert checked > 0
    print(f"\n{os.path.basename(str(gt_path))}: {checked} boxes, worst drift {worst:.6f} pt")


def test_detected_counterparts_share_image_geometry() -> None:
    """Machine-produced siblings reuse the fixture raster geometry."""
    pairs = 0
    for gt_path in _gt_files():
        stem = gt_path.name.split("_gt.json")[0]
        siblings = sorted(gt_path.parent.glob(f"{stem}_detected_*.json"))
        if not siblings:
            continue
        gt = _load_gt(gt_path)
        gt_image = gt["images"][0]
        for sibling in siblings:
            with open(sibling, encoding="utf-8") as handle:
                detected = json.load(handle)
            det_image = detected["images"][0]
            assert det_image["width"] == gt_image["width"]
            assert det_image["height"] == gt_image["height"]
            assert len(detected.get("annotations", [])) > 0
            pairs += 1
    if pairs == 0:
        pytest.skip("No machine-produced detected fixture siblings found in repo")
    assert pairs >= 1, "expected at least one gt/detected fixture pair"
