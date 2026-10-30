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
      * Avexis Page 22 (329 verified runs, paired boundary centerline extraction)
      * P104.1 Plumbing Level 4
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

    _AVEXIS_PATH = Path("fixtures/mechanical/avexis_page_22.pdf")
    _PLUMBING_PATH = Path("fixtures/plumbing/p104_1_plumbing_level4.pdf")

    def test_topology_integration_avexis_p22(self):
        """Avexis Page 22 must assemble exactly 329 verified centerline runs."""
        assert self._AVEXIS_PATH.exists(), f"Fixture missing: {self._AVEXIS_PATH}"

        res = run_l2_pipeline(self._AVEXIS_PATH, use_topology=True)
        assert "avexis_page_22" in res["sheet_id"].lower()
        assert res["discipline"] == "mechanical"
        assert res["run_count"] == 329
        assert res["result_count"] == 329
        assert res["total_length_m"] is None  # uncalibrated without scale string on page
        assert all(r["representation_family"] == "PAIRED_BOUNDARY_DERIVED" for r in res["results"])
        assert all(r["continuity_status"] is not None for r in res["results"])
        assert all(r["source_route_fragment_ids"] for r in res["results"])

    def test_calibrated_scale_avexis_p22(self):
        """Avexis Page 22 with calibrated scale 1/4\" = 1'-0\" yields positive physical footage."""
        assert self._AVEXIS_PATH.exists()

        res = run_l2_pipeline(self._AVEXIS_PATH, scale_override='1/4" = 1\'-0"', use_topology=True)
        assert res["scale_status"] == "VALID"
        assert res["total_length_m"] is not None
        assert res["total_length_ft"] is not None
        assert res["total_length_ft"] > 100.0

    def test_plumbing_fixture_p104_1(self):
        """P104.1 Plumbing plan extracts pipeline runs and classifies as plumbing."""
        assert self._PLUMBING_PATH.exists()

        res = run_l2_pipeline(self._PLUMBING_PATH)
        assert res["sheet_id"] == "P104.1"
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
