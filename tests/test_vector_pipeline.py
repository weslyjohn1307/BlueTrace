"""Tests for src.core_vector.pipeline — Core vector linework and centerline extraction end-to-end.

Covers:
  - End-to-end pipeline on synthetic in-memory PDF fixtures
  - Valid architectural scale producing measured physical length
  - Unscaled floor plan producing length=None and SCALE_UNREADABLE (Fail-Closed Scale Rule)
  - Schematic riser producing length=None and SCHEMATIC_RISER
  - Shared output contract compliance (5-field schema)
  - Taxonomy mapping: duct_segment -> pipe for plumbing
  - Error handling (missing file, invalid page)
  - Real fixture verification:
      * Sheet M-201 Level 2 (329 verified runs, paired boundary centerline extraction)
      * P-104 Plumbing Level 4
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest

from src.core_vector.pipeline import run_l2_pipeline
from src.core_vector.scale import parse_architectural_scale
from src.core_vector.scale_validator import ScaleValidator


def _create_test_pdf(
    tmp_path: Path,
    filename: str,
    text: str,
    lines: list[tuple[tuple[float, float], tuple[float, float]]],
) -> Path:
    """Create a synthetic PDF with text and drawn line segments."""
    pdf_path = tmp_path / filename
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)

    # Insert text
    if text:
        page.insert_text((50, 50), text, fontsize=10)

    # Draw lines (thick black lines to pass MEP candidate filter)
    for (x0, y0), (x1, y1) in lines:
        shape = page.new_shape()
        shape.draw_line((x0, y0), (x1, y1))
        shape.finish(color=(0, 0, 0), width=1.5)
        shape.commit()

    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


class TestVectorPipelineSynthetic:
    def test_scaled_mechanical_plan_produces_measured_ducts(self, tmp_path: Path):
        """Scaled plan view: runs assembled, physical length calculated."""
        text = 'M-101 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (150.0, 100.0)),
            ((150.0, 100.0), (200.0, 100.0)),
            ((200.0, 100.0), (250.0, 100.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-101_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path)

        assert res["sheet_id"] == "M-101"
        assert res["scale_status"] == "VALID"
        assert res["scale_text"] == '1/8" = 1\'-0"'
        assert res["run_count"] == 1
        assert res["total_length_m"] is not None
        assert res["total_length_ft"] is not None

        obj = res["results"][0]
        assert obj["object_type"] == "duct"
        assert obj["sheet_id"] == "M-101"
        assert obj["confidence"] > 0.0
        assert obj["length"] is not None
        assert obj["length_unit"] == "m"
        assert obj["location_or_path"]["type"] == "polyline"
        assert len(obj["location_or_path"]["points"]) >= 2
        assert abs(obj["length"] - 5.08) < 0.1

    def test_unscaled_plan_fails_closed(self, tmp_path: Path):
        """Plan without scale text: geometry preserved, physical length is null (Fail-Closed Scale Rule)."""
        text = "M-201 MECHANICAL FLOOR PLAN - NO SCALE GIVEN"
        lines = [((100.0, 100.0), (200.0, 100.0))]
        pdf_path = _create_test_pdf(tmp_path, "M-201_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path)

        assert res["sheet_id"] == "M-201"
        assert res["scale_status"] == "SCALE_UNREADABLE"
        assert res["reason_code"] == "SCALE_UNREADABLE"
        assert res["total_length_m"] is None
        assert res["run_count"] == 1

        obj = res["results"][0]
        assert obj["length"] is None
        assert obj["length_unit"] is None
        assert obj["location_or_path"]["type"] == "polyline"

    def test_schematic_riser_fails_closed(self, tmp_path: Path):
        """Schematic riser: linework measurement skipped, length is null."""
        text = "PLUMBING RISER DIAGRAM\nSCALE: NTS"
        lines = [((100.0, 100.0), (200.0, 100.0))]
        pdf_path = _create_test_pdf(tmp_path, "P601_RISER.pdf", text, lines)

        res = run_l2_pipeline(pdf_path)

        assert res["sheet_id"] == "P601"
        assert res["scale_status"] == "SCHEMATIC_RISER"
        assert res["reason_code"] == "SCHEMATIC_RISER"
        assert res["total_length_m"] is None
        assert res["run_count"] == 0

    def test_plumbing_taxonomy_mapping(self, tmp_path: Path):
        """Plumbing drawings map duct_segment -> pipe."""
        text = 'P-101 PLUMBING SANITARY PLAN\nSCALE: 1/4" = 1\'-0"'
        lines = [((50.0, 50.0), (150.0, 50.0))]
        pdf_path = _create_test_pdf(tmp_path, "P101_PLUMBING_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path)

        assert res["discipline"] == "plumbing"
        assert len(res["results"]) == 1
        assert res["results"][0]["object_type"] == "pipe"

    def test_missing_file_raises_file_not_found(self):
        """Non-existent file raises FileNotFoundError (fail closed)."""
        with pytest.raises(FileNotFoundError):
            run_l2_pipeline("non_existent_drawing_path_12345.pdf")

    def test_invalid_page_raises_value_error(self, tmp_path: Path):
        """Page index out of bounds raises ValueError."""
        pdf_path = _create_test_pdf(tmp_path, "single_page.pdf", "TEXT", [])
        with pytest.raises(ValueError, match="does not exist"):
            run_l2_pipeline(pdf_path, page_num=99)


class TestRepresentativeFixtures:
    """End-to-end execution against real project fixtures."""

    _HVAC_PATH = Path("fixtures/mechanical/hvac_plan_level2.pdf")
    _PLUMBING_PATH = Path("fixtures/plumbing/plumbing_plan_level4.pdf")

    def test_topology_integration_hvac_plan_l2(self):
        """Sheet M-201 Level 2 must assemble exactly 329 verified centerline runs."""
        assert self._HVAC_PATH.exists(), f"Fixture missing: {self._HVAC_PATH}"

        res = run_l2_pipeline(self._HVAC_PATH, use_topology=True)
        assert "hvac_plan_level2" in res["sheet_id"].lower()
        assert res["discipline"] == "mechanical"
        assert res["run_count"] == 329
        assert res["result_count"] == 329
        assert res["total_length_m"] is None  # uncalibrated without scale string on page
        assert all(r["representation_family"] == "PAIRED_BOUNDARY_DERIVED" for r in res["results"])
        assert all(r["continuity_status"] is not None for r in res["results"])
        assert all(r["source_route_fragment_ids"] for r in res["results"])

    def test_calibrated_scale_hvac_plan_l2(self):
        """Sheet M-201 Level 2 with calibrated scale 1/4\" = 1'-0\" yields positive physical footage."""
        assert self._HVAC_PATH.exists()

        res = run_l2_pipeline(self._HVAC_PATH, scale_override='1/4" = 1\'-0"', use_topology=True)
        assert res["scale_status"] == "VALID"
        assert res["total_length_m"] is not None
        assert res["total_length_ft"] is not None
        assert res["total_length_ft"] > 100.0

    def test_plumbing_fixture_plumbing_plan_level4(self):
        """P-104 Plumbing plan extracts pipeline runs and classifies as plumbing."""
        assert self._PLUMBING_PATH.exists()

        res = run_l2_pipeline(self._PLUMBING_PATH)
        assert "plumbing_plan_level4" in res["sheet_id"].lower()
        assert res["discipline"] == "plumbing"
        assert res["run_count"] > 50
        assert res["results"][0]["object_type"] == "pipe"

    def test_scale_validator_reconciles_with_pipeline_scale(self):
        """M4 Reconciliation: ScaleValidator and pipeline scale agree on conversion factor."""
        test_scales = [
            ('1/8" = 1\'-0"', 96.0),
            ('1/4" = 1\'-0"', 48.0),
            ('3/8" = 1\'-0"', 32.0),
            ('1/2" = 1\'-0"', 24.0),
            ('3/4" = 1\'-0"', 16.0),
        ]
        for scale_text, expected_ratio in test_scales:
            # 1. ScaleValidator parsing
            ratio, status = ScaleValidator.parse_scale_string(scale_text)
            assert status == "VERIFIED"
            assert ratio == expected_ratio

            # 2. Pipeline scale.py parsing
            pipe_parsed = parse_architectural_scale(scale_text)
            assert pipe_parsed is not None
            ft_per_pt, _, _ = pipe_parsed

            # 3. Equivalence on 72.0 points (1 inch)
            val_feet, is_valid = ScaleValidator.points_to_feet(72.0, ratio)
            assert is_valid is True
            pipe_feet = round(72.0 * ft_per_pt, 2)
            assert val_feet == pipe_feet


class TestScaleValidatorSnapping:
    """TASK-CAL-001: two-point calibration ratio math + canonical snapping."""

    def test_scale_validator_snapping_exact_denominators(self):
        cases = [
            (96.0, '1/8" = 1\'-0"'),
            (64.0, '3/16" = 1\'-0"'),
            (48.0, '1/4" = 1\'-0"'),
            (32.0, '3/8" = 1\'-0"'),
            (24.0, '1/2" = 1\'-0"'),
            (16.0, '3/4" = 1\'-0"'),
            (12.0, '1" = 1\'-0"'),
            (8.0, '1-1/2" = 1\'-0"'),
            (4.0, '3" = 1\'-0"'),
        ]
        for ratio, expected in cases:
            assert ScaleValidator.derive_architectural_scale_string(ratio) == expected

    def test_scale_validator_snapping_within_tolerance(self):
        # 1% off 48 -> snaps to 1/4"
        assert ScaleValidator.derive_architectural_scale_string(48.0 * 1.01) == '1/4" = 1\'-0"'
        assert ScaleValidator.derive_architectural_scale_string(96.0 * 0.99) == '1/8" = 1\'-0"'

    def test_scale_validator_snapping_custom_outside_tolerance(self):
        label = ScaleValidator.derive_architectural_scale_string(50.0)
        assert label.startswith("Custom")
        assert label == 'Custom (1" = 4\'-2.0")'
        label2 = ScaleValidator.derive_architectural_scale_string(100.0)
        assert label2.startswith("Custom")
        assert label2 == 'Custom (1" = 8\'-4.0")'

    def test_scale_validator_snapping_ratio_math(self):
        # 10 ft real over 150 pt paper: (120 in * 72) / 150 = 57.6 -> Custom
        ratio = ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], 10.0)
        assert ratio == pytest.approx((10.0 * 12.0 * 72.0) / 150.0)
        assert ScaleValidator.derive_architectural_scale_string(ratio).startswith("Custom")
        # Exact 1/4" = 1'-0" (48): 12 in real over 18 pt paper -> 12*72/18 = 48
        ratio2 = ScaleValidator.calculate_scale_ratio((0.0, 0.0), (18.0, 0.0), 1.0)
        assert ratio2 == pytest.approx(48.0)
        assert ScaleValidator.derive_architectural_scale_string(ratio2) == '1/4" = 1\'-0"'
        # ft + in variant: 10 ft 6 in over 150 pt
        ratio3 = ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], 10.0, 6.0)
        assert ratio3 == pytest.approx(((10.0 * 12.0 + 6.0) * 72.0) / 150.0)

    def test_scale_validator_snapping_rejects_short_and_nonpositive(self):
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [4.9, 0.0], 10.0)
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([5.0, 5.0], [5.0, 5.0], 10.0)
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], 0.0)
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], -2.0)

    def test_scale_validator_snapping_rejects_bad_inches_range(self):
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], 10.0, 12.0)
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], 10.0, -1.0)
        with pytest.raises(ValueError):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [150.0, 0.0], -1.0, 0.0)

    def test_scale_validator_snapping_custom_string_format(self):
        # X = ratio // 12 ft, Y = round(ratio % 12, 1) in
        assert ScaleValidator.derive_architectural_scale_string(57.6) == 'Custom (1" = 4\'-9.6")'
def _make_lazy_test_pdf(path: Path) -> None:
    """Five-page synthetic set: scaled mechanical plan lines on every page."""
    doc = pymupdf.open()
    try:
        for i in range(5):
            page = doc.new_page(width=612, height=792)
            page.insert_text((50, 50), f'M-10{i} MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"', fontsize=10)
            shape = page.new_shape()
            shape.draw_line((100.0, 100.0 + i), (200.0, 100.0 + i))
            shape.finish(color=(0, 0, 0), width=1.5)
            shape.commit()
        doc.save(str(path))
    finally:
        doc.close()


async def test_lazy_vector_extraction(isolated_takeoff_store, monkeypatch):
    """TASK-INTK-004: first view runs + persists, repeat views are cached; 4-slot LRU."""
    from starlette.testclient import TestClient

    from src.api import routes as routes_mod
    from src.api.main import app

    store = isolated_takeoff_store
    pdf_path = Path("data/test_lazy_linework.pdf")
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _make_lazy_test_pdf(pdf_path)
        rel = "data/test_lazy_linework.pdf"

        calls = {"count": 0}
        real_run = routes_mod.run_l2_pipeline

        def _counting_run(*args, **kwargs):
            calls["count"] += 1
            return real_run(*args, **kwargs)

        monkeypatch.setattr(routes_mod, "run_l2_pipeline", _counting_run)
        routes_mod._linework_pixmap_cache.clear()

        await store.insert_sheet(
            sheet_id="m-100_p0",
            project_id="lazy_proj",
            page_index=0,
            sheet_number="M-100",
            sheet_title="Mechanical Plan",
            discipline="MECHANICAL",
            scale_raw='1/8" = 1\'-0"',
            scale_ratio=96.0,
            scale_status="VERIFIED",
            width_pt=612.0,
            height_pt=792.0,
        )

        client = TestClient(app)
        first = client.get("/api/sheets/m-100_p0/linework", params={"pdf_path": rel})
        assert first.status_code == 200
        body = first.json()
        assert body["cached"] is False
        assert body["items_created"] >= 1
        assert len(body["items"]) == body["items_created"]
        assert calls["count"] == 1

        second = client.get("/api/sheets/m-100_p0/linework", params={"pdf_path": rel})
        assert second.status_code == 200
        assert second.json()["cached"] is True
        assert calls["count"] == 1  # repeat view must not re-run the engine

        # 4-slot LRU: warming 5 distinct pages keeps only the 4 most recent.
        routes_mod._linework_pixmap_cache.clear()
        for i in range(5):
            routes_mod._warm_linework_pixmap(str(pdf_path), i)
        assert len(routes_mod._linework_pixmap_cache) == 4
        assert (str(pdf_path), 0) not in routes_mod._linework_pixmap_cache
        assert (str(pdf_path), 4) in routes_mod._linework_pixmap_cache
    finally:
        pdf_path.unlink(missing_ok=True)