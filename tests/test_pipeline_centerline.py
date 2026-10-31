"""Tests for centerline corridor measurement in the legacy L2 pipeline branch.

Covers TASK-001: double-line mechanical ductwork must be measured along its
derived midpoint centerline (one run per corridor), not along both boundary
walls (which doubles the length). Elbow centreline endpoints must meet at
the shared director-ray apex, unpaired single lines must not be dropped,
and plumbing single-line pass-through must be preserved.

Expected values are derived from the drawn geometry:
  - Straight duct: boundaries y=100 / y=112, x=100->300, so the centerline
    is y=106, x=100->300 = 200 pt. At 1/8" = 1'-0" (9 pt per foot) that is
    200/9 ft. Legacy (use_centerline=False) counts both walls = 400 pt.
  - Elbow: horizontal pair as above (centerline 200 pt, ends at (300, 106))
    plus vertical pair x=300 / x=312, y=112->300 (centerline x=306,
    y=112->300 = 188 pt, starts at (306, 112)). The director-ray apex is
    (306, 106): each leg extends 6 pt (half the 12 pt corridor width), so
    the legs become 206 pt and 194 pt, total 400 pt.
"""

from __future__ import annotations

import math
from itertools import pairwise
from pathlib import Path

import pymupdf

from src.core_vector.pipeline import run_l2_pipeline


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


def _run_geometric_length_pt(result: dict) -> float:
    """Geometric length (pt) of one public result, from its polyline points."""
    points = result["location_or_path"]["points"]
    return sum(
        math.hypot(x1 - x0, y1 - y0)
        for (x0, y0), (x1, y1) in pairwise(points)
    )


def _total_geometric_length_pt(res: dict) -> float:
    return sum(_run_geometric_length_pt(r) for r in res["results"])


class TestCenterlinePipeline:
    def test_straight_double_line_duct_measures_centerline_not_perimeter(
        self, tmp_path: Path
    ):
        """Two parallel walls collapse to a single 200 pt centerline run."""
        text = 'M-101 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 112.0), (300.0, 112.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-101_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["scale_status"] == "VALID"
        assert res["run_count"] == 1
        assert res["centerline_run_count"] == 1
        assert res["unpaired_boundary_count"] == 0
        assert res["results"][0]["object_type"] == "duct"
        # Single centerline, not both walls: 200 pt, not ~400 pt.
        assert abs(_total_geometric_length_pt(res) - 200.0) < 2.0
        # 1/8" = 1'-0" -> 9 pt per foot, so 200 pt = 200/9 ft.
        assert res["total_length_ft"] is not None
        assert abs(res["total_length_ft"] - 200.0 / 9.0) < 0.5

        legacy = run_l2_pipeline(pdf_path, discipline="mechanical", use_centerline=False)
        assert legacy["run_count"] == 2
        legacy_total = _total_geometric_length_pt(legacy)
        assert abs(legacy_total - 400.0) < 2.0
        ratio = legacy_total / _total_geometric_length_pt(res)
        assert abs(ratio - 2.0) < 0.05

    def test_elbow_double_line_shares_director_ray_apex(self, tmp_path: Path):
        """Horizontal + vertical corridors meet at the identical apex point."""
        text = 'M-102 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            # Horizontal duct walls (centerline y=106, x=100->300)
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 112.0), (300.0, 112.0)),
            # Vertical duct walls (centerline x=306, y=112->300)
            ((300.0, 112.0), (300.0, 300.0)),
            ((312.0, 112.0), (312.0, 300.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-102_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["scale_status"] == "VALID"
        assert res["run_count"] == 2
        assert res["centerline_run_count"] == 2
        assert res["elbows_resolved"] >= 1
        assert res["unpaired_boundary_count"] == 0
        assert len(res["results"]) == 2

        # Apex (306, 106): midpoint corner extended half a width (6 pt)
        # past each pre-apex centerline endpoint ((300, 106) and (306, 112)).
        apex = (306.0, 106.0)
        for result in res["results"]:
            points = [tuple(p) for p in result["location_or_path"]["points"]]
            assert any(
                math.hypot(px - apex[0], py - apex[1]) < 0.01 for px, py in points
            ), f"run does not share apex {apex}: {points}"

        # Legs extended to apex: 200+6 and 188+6; no dropped corner linework.
        lengths = sorted(_run_geometric_length_pt(r) for r in res["results"])
        assert abs(lengths[0] - 194.0) < 2.0
        assert abs(lengths[1] - 206.0) < 2.0
        total = _total_geometric_length_pt(res)
        assert 390.0 < total < 410.0
        assert abs(total - 400.0) < 5.0

    def test_unpaired_single_mechanical_line_is_not_dropped(self, tmp_path: Path):
        """A lone mechanical line has no pair; legacy assembly must keep it."""
        text = 'M-103 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [((100.0, 100.0), (300.0, 100.0))]
        pdf_path = _create_test_pdf(tmp_path, "M-103_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["run_count"] == 1
        assert res["centerline_run_count"] == 0
        assert res["unpaired_boundary_count"] == 1
        assert abs(_total_geometric_length_pt(res) - 200.0) < 2.0
        # Domain ruling (Option 2): a leftover with no plausible parallel
        # partner is inferred single-line representation - measured normally
        # (counted once), NOT flagged.
        assert res["results"][0].get("has_unclosed_gaps") is not True
        assert not res["results"][0].get("uncertainty_codes")
        assert res["unresolved_run_count"] == 0
        assert res["single_line_run_count"] == 1
        assert res["total_length_m"] is not None
        assert res["total_length_ft"] is not None
        assert abs(res["total_length_ft"] - 200.0 / 9.0) < 0.5

    def test_plumbing_single_line_pass_through_preserved(self, tmp_path: Path):
        """Plumbing single-line routes pass through 1:1 as pipe."""
        text = 'P-101 PLUMBING PLAN\nSCALE: 1/4" = 1\'-0"'
        lines = [((100.0, 150.0), (300.0, 150.0))]
        pdf_path = _create_test_pdf(tmp_path, "P101_PLUMBING_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="plumbing")

        assert res["discipline"] == "plumbing"
        assert res["run_count"] == 1
        assert res["centerline_run_count"] == 1
        assert len(res["results"]) == 1
        assert res["results"][0]["object_type"] == "pipe"
        assert abs(_total_geometric_length_pt(res) - 200.0) < 2.0

    def test_both_walls_unpaired_are_flagged_and_excluded_from_totals(
        self, tmp_path: Path
    ):
        """Walls 130 pt apart exceed the 120 pt max corridor width: no pair."""
        text = 'M-104 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 230.0), (300.0, 230.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-104_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["scale_status"] == "VALID"
        assert res["centerline_run_count"] == 0
        # Runs are present (flagged, not dropped) ...
        assert res["run_count"] >= 1
        assert len(res["results"]) >= 1
        for result in res["results"]:
            assert result["has_unclosed_gaps"] is True
            assert result["uncertainty_codes"] == ["BOUNDARY_UNRESOLVED"]
        assert res["unresolved_run_count"] >= 1
        # ... but none of them is a measured centerline, so no rollup.
        assert res["total_length_m"] is None
        assert res["total_length_ft"] is None

    def test_staggered_walls_clip_centerline_to_overlap_only(
        self, tmp_path: Path
    ):
        """Wall B ends early: spine covers the 120 pt overlap, not ~160 pt."""
        text = 'M-105 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),  # wall A: 200 pt
            ((100.0, 112.0), (220.0, 112.0)),  # wall B: 120 pt, staggered
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-105_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["centerline_run_count"] == 1
        assert len(res["results"]) == 1
        # Overlap window is x=100->220 along y=106: 120 pt. The pre-fix code
        # averaged the full endpoints and reported ~160 pt.
        assert abs(_run_geometric_length_pt(res["results"][0]) - 120.0) < 2.0
        # Fix 2 flag -> Fix 1 emission: partial overlap is fail-closed.
        assert res["results"][0]["has_unclosed_gaps"] is True
        assert res["results"][0]["uncertainty_codes"] == [
            "CENTERLINE_PARTIAL_OVERLAP"
        ]
        assert res["unresolved_run_count"] >= 1
        assert res["total_length_m"] is None
        assert res["total_length_ft"] is None

    def test_near_miss_shallow_angle_is_not_synthesized_as_elbow(
        self, tmp_path: Path
    ):
        """Corridors meeting at ~150 deg must not be joined as an elbow."""
        text = 'M-106 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        # Horizontal corridor: centerline (100,106)->(300,106).
        # Diagonal corridor at 30 deg: centerline (308,110)->(394.6,160),
        # walls offset +/-6 pt perpendicular to its direction.
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 112.0), (300.0, 112.0)),
            ((305.0, 115.196), (391.603, 165.196)),
            ((311.0, 104.804), (397.603, 154.804)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-106_MECH_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="mechanical")

        assert res["centerline_run_count"] == 2
        # Turning angle between outward directors is ~150 deg, outside the
        # 60-120 deg elbow gate (Fix 3): no apex is synthesized.
        assert res["elbows_resolved"] == 0
        # Endpoints are unchanged (no extension toward a guessed apex).
        all_points = [
            tuple(pt)
            for r in res["results"]
            for pt in r["location_or_path"]["points"]
        ]
        assert any(
            math.hypot(px - 300.0, py - 106.0) < 0.01 for px, py in all_points
        )
        assert any(
            math.hypot(px - 308.0, py - 110.0) < 1.0 for px, py in all_points
        )


    def test_angle_failure_pair_is_flagged(self, tmp_path: Path):
        """Walls at ~8 deg: fails legacy 5 deg pairing, plausible at 10 deg."""
        text = 'M-107 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 112.0), (298.057, 139.832)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-107_MECH_PLAN.pdf", text, lines)
        res = run_l2_pipeline(pdf_path, discipline="mechanical")
        assert res["centerline_run_count"] == 0
        assert res["single_line_run_count"] == 0
        assert res["unresolved_run_count"] >= 1
        for result in res["results"]:
            assert result["has_unclosed_gaps"] is True
            assert result["uncertainty_codes"] == ["BOUNDARY_UNRESOLVED"]
        assert res["total_length_m"] is None
        assert res["total_length_ft"] is None

    def test_overlap_failure_pair_is_flagged(self, tmp_path: Path):
        """Parallel walls, overlap 20pt/200pt=0.10 (<0.30 legacy): flagged."""
        text = 'M-108 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((280.0, 112.0), (480.0, 112.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-108_MECH_PLAN.pdf", text, lines)
        res = run_l2_pipeline(pdf_path, discipline="mechanical")
        assert res["centerline_run_count"] == 0
        assert res["single_line_run_count"] == 0
        assert res["unresolved_run_count"] >= 1
        for result in res["results"]:
            assert result["has_unclosed_gaps"] is True
            assert result["uncertainty_codes"] == ["BOUNDARY_UNRESOLVED"]
        assert res["total_length_m"] is None
        assert res["total_length_ft"] is None

    def test_distant_parallel_single_lines_are_measured_not_flagged(
        self, tmp_path: Path
    ):
        """Lines 400 pt apart (>240 pt bound): inferred single-line, measured."""
        text = 'M-109 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 500.0), (300.0, 500.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-109_MECH_PLAN.pdf", text, lines)
        res = run_l2_pipeline(pdf_path, discipline="mechanical")
        assert res["centerline_run_count"] == 0
        assert res["unresolved_run_count"] == 0
        assert res["single_line_run_count"] == 2
        assert abs(_total_geometric_length_pt(res) - 400.0) < 2.0
        for result in res["results"]:
            assert result.get("has_unclosed_gaps") is not True
            assert not result.get("uncertainty_codes")
        assert res["total_length_ft"] is not None
        assert abs(res["total_length_ft"] - 400.0 / 9.0) < 0.5

    def test_leftover_whose_neighbour_was_consumed_is_flagged(
        self, tmp_path: Path
    ):
        """Three walls y=100/112/124: first two pair, third is unresolved.

        Its nearest parallel neighbour (y=112, 12 pt away) was consumed by
        the successful pair; the partner search pool includes consumed
        candidates, so the leftover is BOUNDARY_UNRESOLVED, not single-line.
        """
        text = 'M-110 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"'
        lines = [
            ((100.0, 100.0), (300.0, 100.0)),
            ((100.0, 112.0), (300.0, 112.0)),
            ((100.0, 124.0), (300.0, 124.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "M-110_MECH_PLAN.pdf", text, lines)
        res = run_l2_pipeline(pdf_path, discipline="mechanical")
        assert res["centerline_run_count"] == 1
        assert res["single_line_run_count"] == 0
        assert res["unresolved_run_count"] >= 1
        flagged = [
            r
            for r in res["results"]
            if r.get("uncertainty_codes") == ["BOUNDARY_UNRESOLVED"]
        ]
        assert len(flagged) == 1
        assert flagged[0]["has_unclosed_gaps"] is True
        assert res["total_length_ft"] is not None
        assert abs(res["total_length_ft"] - 200.0 / 9.0) < 0.5

    def test_plumbing_corner_small_gap_joins_at_apex(self, tmp_path: Path):
        """Single-line plumbing convention: a 90 deg corner with a small
        endpoint gap IS joined at the director-ray apex (documented actual
        behavior). Legs (100,150)->(200,150) and (204,154)->(204,250) meet
        at apex (204, 150), so the joined legs measure 104 + 100 = 204 pt.
        """
        text = 'P-102 PLUMBING PLAN\nSCALE: 1/4" = 1\'-0"'
        lines = [
            ((100.0, 150.0), (200.0, 150.0)),
            ((204.0, 154.0), (204.0, 250.0)),
        ]
        pdf_path = _create_test_pdf(tmp_path, "P102_PLUMBING_PLAN.pdf", text, lines)

        res = run_l2_pipeline(pdf_path, discipline="plumbing")

        assert res["discipline"] == "plumbing"
        assert res["elbows_resolved"] >= 1
        apex = (204.0, 150.0)
        for result in res["results"]:
            points = [tuple(pt) for pt in result["location_or_path"]["points"]]
            assert any(
                math.hypot(px - apex[0], py - apex[1]) < 0.01 for px, py in points
            ), f"plumbing leg does not reach apex {apex}: {points}"
        assert abs(_total_geometric_length_pt(res) - 204.0) < 2.0

