"""Adversarial stress-test harness for Milestone 4 verification.

Authored by Challenger 1 (teamwork_challenger).
Empirically tests and stress-tests:
1. `src/core_vector/linework.py`:
   - Adaptive cubic Bézier subdivision flatness error.
   - Arc length quadrature accuracy (Gauss-Legendre 3-point vs high-resolution numerical oracle).
   - Degenerate control points (collinear, collinear overshoot, coincident endpoints,
     all coincident, coincident tangents, cusps, S-curves, extreme curvature).
   - Quadratic Bézier subdivision, parabolic arc length correction, and the
     singularity / division hazard when endpoints are coincident.
2. `src/core_vector/centerline.py`:
   - Director-ray intersection math (_intersect_rays): 90°, 45°, 135°, collinear, parallel,
     skew/diverging, nearly-parallel ill-conditioned rays.
   - Synthesize elbow intersections: multi-angle turns, width transitions, gap limits,
     degenerate runs (0-length, single point), and chained run unconnected count accounting.
3. `frontend/src/workspace/components/SheetCanvas.tsx:251`:
   - Mathematical mapping of points squared to square feet via `areaPt2 * (scaleRatio / 864)^2`
     across standard US architectural scales (1/8"=1'-0", 1/4"=1'-0", 1/2"=1'-0", etc.).
   - Shoelace area calculation on convex and non-convex polygons.
   - Fail-closed handling on undefined, zero, or negative scale ratios.
   - ScaleValidator regex collision on `1-1/2" = 1'-0"`.
"""

from __future__ import annotations

import math

import pytest

from src.core_vector.centerline import (
    CenterlineRun,
    _intersect_rays,
    synthesize_elbow_intersections,
)
from src.core_vector.linework import (
    _eval_cubic_bezier_derivative,
    subdivide_cubic_bezier,
    subdivide_quad_bezier,
)
from src.core_vector.scale_validator import ScaleValidator

# ===========================================================================
# Reference Numerical Oracles for Linework Testing
# ===========================================================================

def _reference_simpson_cubic_arc_length(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 1000,
) -> float:
    """High-resolution composite Simpson's 3/8 rule oracle for cubic Bézier arc length."""
    if steps % 2 != 0:
        steps += 1
    h = 1.0 / steps
    total = 0.0

    for i in range(steps + 1):
        t = i * h
        d = _eval_cubic_bezier_derivative(p0, p1, p2, p3, t)
        speed = math.hypot(d[0], d[1])
        if i == 0 or i == steps:
            weight = 1.0
        elif i % 2 == 1:
            weight = 4.0
        else:
            weight = 2.0
        total += weight * speed

    return (h / 3.0) * total


# ===========================================================================
# 1. Linework Bézier Geometry & Quadrature Adversarial Tests
# ===========================================================================

class TestLineworkBezierSubdivision:
    """Stress tests adaptive Bézier subdivision flatness error and edge cases."""

    def test_flatness_error_bound_on_smooth_arc(self):
        """Verify that every chord segment's maximum deviation is <= max_chord_error_pt."""
        # Quarter circle approximation: r = 100 pt
        k = 0.5522847498 * 100.0
        p0 = (100.0, 0.0)
        p1 = (100.0, k)
        p2 = (k, 100.0)
        p3 = (0.0, 100.0)

        max_err = 0.05  # Tight tolerance (0.05 pt)
        chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=max_err, min_segments=4)

        assert len(chords) >= 4
        total_chord_len = sum(math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) for c in chords)
        total_arc_len = sum(c[2] for c in chords)

        # True quarter-circle length is ~ 100 * pi / 2 = 157.0796 pt
        exact_arc = 100.0 * math.pi / 2.0
        assert total_arc_len == pytest.approx(exact_arc, rel=1e-3)
        # Sum of chords is strictly less than arc length (chord inequality)
        assert total_chord_len < total_arc_len

    def test_quadrature_accuracy_against_simpson_oracle(self):
        """Stress-test 3-point Gauss-Legendre quadrature accuracy across various curvature regimes."""
        test_curves = [
            # Quarter circular arc
            ((0.0, 0.0), (0.0, 55.23), (44.77, 100.0), (100.0, 100.0)),
            # Inflection / S-curve
            ((0.0, 0.0), (30.0, 100.0), (70.0, -100.0), (100.0, 0.0)),
            # Cusp / hairpin turn
            ((0.0, 0.0), (100.0, 100.0), (0.0, 100.0), (100.0, 0.0)),
            # Straight line
            ((0.0, 0.0), (25.0, 25.0), (50.0, 50.0), (100.0, 100.0)),
        ]

        for p0, p1, p2, p3 in test_curves:
            chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.10, min_segments=8)
            subdivided_quad_len = sum(c[2] for c in chords)
            oracle_len = _reference_simpson_cubic_arc_length(p0, p1, p2, p3, steps=2000)

            # After subdivision into flat pieces, sum of 3-point GL quadrature must match oracle within 0.1%
            rel_err = abs(subdivided_quad_len - oracle_len) / oracle_len
            assert rel_err < 1e-3, f"Relative error {rel_err:.6f} exceeded 0.1% for curve {p0}-{p3}"

    def test_degenerate_all_coincident_points(self):
        """All control points coincident (0-length curve) must not crash, divide by zero, or produce NaN."""
        p = (42.0, 84.0)
        chords = subdivide_cubic_bezier(p, p, p, p, max_chord_error_pt=0.10, min_segments=8)
        assert len(chords) >= 1
        for start_pt, end_pt, arc_len in chords:
            assert start_pt == p
            assert end_pt == p
            assert arc_len == 0.0
            assert not math.isnan(arc_len)

    def test_degenerate_collinear_monotonic_points(self):
        """Strictly collinear points with monotonic progression must preserve exact straight length."""
        p0 = (0.0, 0.0)
        p1 = (20.0, 0.0)
        p2 = (60.0, 0.0)
        p3 = (100.0, 0.0)

        chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.10, min_segments=8)
        total_len = sum(c[2] for c in chords)
        assert total_len == pytest.approx(100.0, abs=1e-6)

        for start_pt, end_pt, _ in chords:
            assert start_pt[1] == pytest.approx(0.0, abs=1e-9)
            assert end_pt[1] == pytest.approx(0.0, abs=1e-9)

    def test_degenerate_collinear_overshoot_and_reversal(self):
        """Collinear control points with overshoot (P1 > P3, P2 < P0) must subdivide and capture reversal."""
        p0 = (0.0, 0.0)
        p1 = (150.0, 0.0)  # Overshoots 100
        p2 = (-50.0, 0.0)  # Reverses past 0
        p3 = (100.0, 0.0)

        chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.10, min_segments=8)
        total_arc = sum(c[2] for c in chords)
        oracle_len = _reference_simpson_cubic_arc_length(p0, p1, p2, p3, steps=2000)

        assert total_arc > 100.0
        assert total_arc == pytest.approx(oracle_len, rel=5e-3)

    def test_degenerate_closed_loop_coincident_endpoints(self):
        """P0 == P3 (closed teardrop loop) must subdivide into open chords and compute non-zero area/length."""
        p0 = (50.0, 50.0)
        p1 = (150.0, 150.0)
        p2 = (-50.0, 150.0)
        p3 = (50.0, 50.0)

        chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.10, min_segments=8)
        assert len(chords) >= 8
        total_arc = sum(c[2] for c in chords)
        oracle_len = _reference_simpson_cubic_arc_length(p0, p1, p2, p3, steps=2000)

        assert total_arc > 0.0
        assert total_arc == pytest.approx(oracle_len, rel=1e-3)

    def test_degenerate_stationary_cusp(self):
        """Bézier curve with a stationary cusp point (B'(t) = 0) must subdivide cleanly without NaN."""
        p0 = (0.0, 0.0)
        p1 = (0.0, 0.0)
        p2 = (1.0 / 3.0, 0.0)
        p3 = (1.0, 1.0)

        chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.01, min_segments=8)
        for _, _, arc_len in chords:
            assert not math.isnan(arc_len)
            assert arc_len >= 0.0

        total_arc = sum(c[2] for c in chords)
        oracle_len = _reference_simpson_cubic_arc_length(p0, p1, p2, p3, steps=2000)
        assert total_arc == pytest.approx(oracle_len, rel=1e-2)

    def test_extreme_coordinate_ranges(self):
        """Very small (1e-5 pt) and very large (1e5 pt) coordinates must maintain numerical stability."""
        scale_small = 1e-4
        chords_sm = subdivide_cubic_bezier(
            (0.0, 0.0),
            (scale_small * 0.5, scale_small * 1.0),
            (scale_small * 0.8, scale_small * 1.0),
            (scale_small, 0.0),
            max_chord_error_pt=1e-6,
            min_segments=8,
        )
        assert len(chords_sm) >= 8
        assert not any(math.isnan(c[2]) for c in chords_sm)

        scale_large = 1e5
        chords_lg = subdivide_cubic_bezier(
            (0.0, 0.0),
            (scale_large * 0.5, scale_large * 1.0),
            (scale_large * 0.8, scale_large * 1.0),
            (scale_large, 0.0),
            max_chord_error_pt=10.0,
            min_segments=8,
        )
        assert len(chords_lg) >= 8
        assert not any(math.isnan(c[2]) for c in chords_lg)

    def test_quadratic_bezier_subdivision_and_parabolic_correction(self):
        """Quadratic Bézier subdivision must handle parabolic curvature correction accurately."""
        p0 = (0.0, 0.0)
        p1 = (50.0, 50.0)
        p2 = (100.0, 0.0)

        chords = subdivide_quad_bezier(p0, p1, p2, max_chord_error_pt=0.10)
        assert len(chords) >= 2
        total_arc = sum(c[2] for c in chords)
        assert total_arc == pytest.approx(114.78, rel=5e-3)

    def test_quadratic_bezier_closed_loop_singularity_hazard(self):
        """When P0 == P2 and deviation <= max_chord_error_pt, the formula avoids 1e-6 division spike."""
        p0 = (0.0, 0.0)
        p1 = (0.0, 0.05)  # 0.05 pt loop (below default max_chord_error_pt = 0.10)
        p2 = (0.0, 0.0)   # Coincident with p0

        chords = subdivide_quad_bezier(p0, p1, p2, max_chord_error_pt=0.10)
        assert len(chords) == 1
        arc_len = chords[0][2]

        # Remediation: no division by 1e-6; length is bounded to actual perimeter without false length inflation
        assert arc_len <= 0.10
        assert arc_len == pytest.approx(0.05, abs=1e-3)

    def test_quadratic_bezier_fully_degenerate_point(self):
        """When P0 == P1 == P2, chord length and deviation are 0, returning 0.0 without errors."""
        p = (10.0, 20.0)
        chords = subdivide_quad_bezier(p, p, p, max_chord_error_pt=0.10)
        assert len(chords) == 1
        assert chords[0][0] == p
        assert chords[0][1] == p
        assert chords[0][2] == 0.0


# ===========================================================================
# 2. Centerline Director-Ray Intersection & Synthesis Adversarial Tests
# ===========================================================================

class TestCenterlineDirectorRayIntersection:
    """Stress tests director-ray intersection math across various elbow configurations."""

    def test_intersect_rays_90_degree_orthogonal(self):
        """90° turn: orthogonal rays must intersect at exact coordinate apex."""
        sol = _intersect_rays((10.0, 0.0), (1.0, 0.0), (15.0, 5.0), (0.0, -1.0))
        assert sol is not None
        t, s, ix, iy = sol
        assert t == pytest.approx(5.0)
        assert s == pytest.approx(5.0)
        assert ix == pytest.approx(15.0)
        assert iy == pytest.approx(0.0)

    def test_intersect_rays_45_degree_elbow(self):
        """45° deflection elbow (135° interior): ray intersection must be exact."""
        c45 = math.sqrt(2.0) / 2.0
        sol = _intersect_rays((10.0, 0.0), (1.0, 0.0), (15.0, 5.0), (-c45, -c45))
        assert sol is not None
        t, s, ix, iy = sol
        assert t == pytest.approx(0.0, abs=1e-6)
        assert s == pytest.approx(5.0 * math.sqrt(2.0), abs=1e-6)
        assert ix == pytest.approx(10.0, abs=1e-6)
        assert iy == pytest.approx(0.0, abs=1e-6)

    def test_intersect_rays_135_degree_sharp_turn(self):
        """135° sharp turn (45° interior): acute elbow director rays must resolve cleanly."""
        c45 = math.sqrt(2.0) / 2.0
        sol = _intersect_rays((0.0, 0.0), (1.0, 0.0), (10.0, 5.0), (c45, -c45))
        assert sol is not None
        _, _, ix, iy = sol
        assert ix == pytest.approx(15.0, abs=1e-6)
        assert iy == pytest.approx(0.0, abs=1e-6)

    def test_intersect_rays_collinear_and_parallel_return_none(self):
        """Collinear and parallel rays have determinant 0 and must return None (fail closed)."""
        assert _intersect_rays((0.0, 0.0), (1.0, 0.0), (20.0, 0.0), (-1.0, 0.0)) is None
        assert _intersect_rays((0.0, 0.0), (1.0, 0.0), (20.0, 0.0), (1.0, 0.0)) is None
        assert _intersect_rays((0.0, 0.0), (1.0, 0.0), (0.0, 10.0), (1.0, 0.0)) is None
        assert _intersect_rays((0.0, 0.0), (0.0, 1.0), (10.0, 0.0), (0.0, 1.0)) is None

    def test_intersect_rays_nearly_parallel_below_epsilon(self):
        """Rays with determinant < 1e-6 must safely return None to prevent numerical explosion."""
        d1 = (1.0, 0.0)
        eps = 5e-7
        d2 = (math.cos(eps), math.sin(eps))
        sol = _intersect_rays((0.0, 0.0), d1, (0.0, 1.0), d2)
        assert sol is None

    def test_intersect_rays_diverging_skew_negative_parameters(self):
        """Diverging rays pointing away from each other produce negative t and s parameters."""
        sol = _intersect_rays((0.0, 0.0), (-1.0, 0.0), (10.0, 10.0), (0.0, 1.0))
        assert sol is not None
        t, s, _, _ = sol
        assert t < -1.0
        assert s < -1.0


class TestCenterlineSynthesizeElbowIntersections:
    """Stress tests `synthesize_elbow_intersections` across AEC ductwork configurations."""

    def test_synthesize_90_degree_elbow_apex_fusion(self):
        """Standard 90° duct turn: endpoints must extend to meet at exact apex."""
        r1 = CenterlineRun(
            run_id="run_1",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=24.0,
            points=[(0.0, 0.0), (100.0, 0.0)],
            system="SUPPLY",
            length_pt=100.0,
        )
        r2 = CenterlineRun(
            run_id="run_2",
            edge_a_id="e3",
            edge_b_id="e4",
            width_pt=24.0,
            points=[(110.0, 10.0), (110.0, 100.0)],
            system="SUPPLY",
            length_pt=90.0,
        )

        res = synthesize_elbow_intersections([r1, r2], max_corner_gap_pt=30.0)
        assert res.total_elbows_resolved == 1
        assert len(res.synthesized_junctions) == 1

        j = res.synthesized_junctions[0]
        assert j["intersection_pt"] == (110.0, 0.0)
        assert j["turning_angle_deg"] == pytest.approx(90.0, abs=0.1)

        assert res.connected_runs[0].points[-1] == (110.0, 0.0)
        assert res.connected_runs[1].points[0] == (110.0, 0.0)
        assert res.connected_runs[0].length_pt == pytest.approx(110.0)
        assert res.connected_runs[1].length_pt == pytest.approx(100.0)

    def test_synthesize_width_transition_adapts_gap_limit(self):
        """Width transition (e.g. 36 pt to 12 pt) dynamically expands corner gap limit."""
        r1 = CenterlineRun(
            run_id="run_wide",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=36.0,
            points=[(0.0, 0.0), (100.0, 0.0)],
            system="SUPPLY",
            length_pt=100.0,
        )
        r2 = CenterlineRun(
            run_id="run_narrow",
            edge_a_id="e3",
            edge_b_id="e4",
            width_pt=12.0,
            points=[(120.0, 15.0), (120.0, 100.0)],
            system="SUPPLY",
            length_pt=85.0,
        )

        res = synthesize_elbow_intersections([r1, r2], max_corner_gap_pt=20.0)
        assert res.total_elbows_resolved == 1
        assert res.synthesized_junctions[0]["intersection_pt"] == (120.0, 0.0)

    def test_synthesize_collinear_runs_rejected(self):
        """Collinear runs (dot_dirs > 0.95) must NOT be synthesized as elbows."""
        r1 = CenterlineRun(
            run_id="run_a",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=20.0,
            points=[(0.0, 0.0), (50.0, 0.0)],
            system="SUPPLY",
            length_pt=50.0,
        )
        r2 = CenterlineRun(
            run_id="run_b",
            edge_a_id="e3",
            edge_b_id="e4",
            width_pt=20.0,
            points=[(55.0, 0.0), (105.0, 0.0)],
            system="SUPPLY",
            length_pt=50.0,
        )

        res = synthesize_elbow_intersections([r1, r2], max_corner_gap_pt=30.0)
        assert res.total_elbows_resolved == 0
        assert len(res.synthesized_junctions) == 0

    def test_synthesize_gap_exceeding_limit_rejected(self):
        """Runs with corner gap exceeding effective limit must remain unconnected."""
        r1 = CenterlineRun(
            run_id="r1",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=10.0,
            points=[(0.0, 0.0), (100.0, 0.0)],
            system="SUPPLY",
            length_pt=100.0,
        )
        r2 = CenterlineRun(
            run_id="r2",
            edge_a_id="e3",
            edge_b_id="e4",
            width_pt=10.0,
            points=[(200.0, 100.0), (200.0, 200.0)],
            system="SUPPLY",
            length_pt=100.0,
        )

        res = synthesize_elbow_intersections([r1, r2], max_corner_gap_pt=30.0)
        assert res.total_elbows_resolved == 0
        assert res.unconnected_runs_count == 2

    def test_synthesize_degenerate_and_empty_inputs(self):
        """Empty list, single run, or zero-length runs must handle gracefully without crashing."""
        assert synthesize_elbow_intersections([]).total_elbows_resolved == 0
        r_single = CenterlineRun(
            run_id="s1",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=10.0,
            points=[(0.0, 0.0), (50.0, 0.0)],
            system="SUPPLY",
            length_pt=50.0,
        )
        assert synthesize_elbow_intersections([r_single]).total_elbows_resolved == 0

        r_zero = CenterlineRun(
            run_id="z1",
            edge_a_id="e1",
            edge_b_id="e2",
            width_pt=10.0,
            points=[(0.0, 0.0), (0.0, 0.0)],
            system="SUPPLY",
            length_pt=0.0,
        )
        res = synthesize_elbow_intersections([r_single, r_zero])
        assert res.total_elbows_resolved == 0

    def test_synthesize_chained_runs_unconnected_count_accounting(self):
        """Verify unconnected_runs_count formula in chained runs (A-B-C) with disconnected run D."""
        rA = CenterlineRun("A", "e1", "e2", 20.0, [(0.0, 0.0), (50.0, 0.0)], "SUPPLY", 50.0)
        rB = CenterlineRun("B", "e3", "e4", 20.0, [(55.0, 5.0), (55.0, 60.0)], "SUPPLY", 55.0)
        rC = CenterlineRun("C", "e5", "e6", 20.0, [(60.0, 65.0), (120.0, 65.0)], "SUPPLY", 60.0)
        rD = CenterlineRun("D", "e7", "e8", 20.0, [(500.0, 500.0), (550.0, 500.0)], "SUPPLY", 50.0)

        res = synthesize_elbow_intersections([rA, rB, rC, rD], max_corner_gap_pt=30.0)
        assert res.total_elbows_resolved == 2

        # Remediation: resolved_run_ids tracks {A, B, C}, accurately reporting disconnected D as 1 unconnected run
        assert res.unconnected_runs_count == 1


# ===========================================================================
# 3. SheetCanvas.tsx:251 Area Calculation Mathematical Verification
# ===========================================================================

class TestSheetCanvasAreaFormula:
    """Verifies that `areaPt2 * Math.pow(scaleRatio / 864, 2)` mathematically maps to square feet."""

    def _calculate_shoelace_area(self, points: list[tuple[float, float]]) -> float:
        """Mirrors the exact Shoelace implementation from SheetCanvas.tsx lines 241-248."""
        n = len(points)
        area = 0.0
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            area += x1 * y2 - x2 * y1
        return abs(area) / 2.0

    def _convert_to_sq_ft(self, area_pt2: float, scale_ratio: float | None) -> float | None:
        """Mirrors the exact conversion from SheetCanvas.tsx line 251."""
        if scale_ratio is not None and scale_ratio > 0:
            return area_pt2 * ((scale_ratio / 864.0) ** 2)
        return None

    @pytest.mark.parametrize(
        ("scale_str", "scale_ratio", "pt_per_foot"),
        [
            ('1/8" = 1\'-0"', 96.0, 9.0),    # 72 * (1/8) = 9 pt per real foot
            ('3/16" = 1\'-0"', 64.0, 13.5),  # 72 * (3/16) = 13.5 pt per real foot
            ('1/4" = 1\'-0"', 48.0, 18.0),   # 72 * (1/4) = 18 pt per real foot
            ('3/8" = 1\'-0"', 32.0, 27.0),   # 72 * (3/8) = 27 pt per real foot
            ('1/2" = 1\'-0"', 24.0, 36.0),   # 72 * (1/2) = 36 pt per real foot
            ('3/4" = 1\'-0"', 16.0, 54.0),   # 72 * (3/4) = 54 pt per real foot
            ('1" = 1\'-0"', 12.0, 72.0),     # 72 * 1 = 72 pt per real foot
            ('3" = 1\'-0"', 4.0, 216.0),     # 72 * 3 = 216 pt per real foot
        ],
    )
    def test_area_formula_across_all_standard_architectural_scales(
        self, scale_str: str, scale_ratio: float, pt_per_foot: float
    ):
        """Verify area formula for a 10 ft x 10 ft (100 sq ft) rectangular equipment box."""
        # Confirm ScaleValidator yields exact scale_ratio
        parsed_ratio, status = ScaleValidator.parse_scale_string(scale_str)
        assert status == "VERIFIED"
        assert parsed_ratio == scale_ratio

        # In PDF points, a 10 ft by 10 ft equipment pad has:
        w_pt = 10.0 * pt_per_foot
        h_pt = 10.0 * pt_per_foot
        pad_pts = [(0.0, 0.0), (w_pt, 0.0), (w_pt, h_pt), (0.0, h_pt)]

        area_pt2 = self._calculate_shoelace_area(pad_pts)
        assert area_pt2 == pytest.approx(w_pt * h_pt)

        # Line 251 formula evaluation
        area_sqft = self._convert_to_sq_ft(area_pt2, scale_ratio)
        assert area_sqft is not None
        # Must exactly equal 100.0 sq ft
        assert area_sqft == pytest.approx(100.0, abs=1e-6)

    def test_area_formula_for_1_and_a_half_inch_scale(self):
        """Verify the mathematical mapping for 1-1/2" = 1'-0" (scaleRatio = 8.0, 108 pt/ft)."""
        scale_ratio = 8.0
        pt_per_foot = 108.0
        w_pt = 10.0 * pt_per_foot
        h_pt = 10.0 * pt_per_foot
        pad_pts = [(0.0, 0.0), (w_pt, 0.0), (w_pt, h_pt), (0.0, h_pt)]

        area_pt2 = self._calculate_shoelace_area(pad_pts)
        area_sqft = self._convert_to_sq_ft(area_pt2, scale_ratio)
        assert area_sqft == pytest.approx(100.0, abs=1e-6)

    def test_scale_validator_1_and_a_half_inch_regex_collision(self):
        """Verify 1-1/2" = 1'-0" parses accurately without colliding with 1/2"."""
        parsed_ratio, status = ScaleValidator.parse_scale_string('1-1/2" = 1\'-0"')
        assert status == "VERIFIED"
        assert parsed_ratio == 8.0

    def test_area_formula_non_convex_l_shaped_equipment(self):
        """Verify Shoelace + scale conversion on non-convex L-shaped air handling unit."""
        # Scale: 1/4" = 1'-0" (scaleRatio = 48.0, 1 ft = 18 pt)
        # AHU footprint: 20 ft x 10 ft with an 8 ft x 5 ft cutout
        # Total area in reality = (20 * 10) - (8 * 5) = 200 - 40 = 160.0 sq ft
        scale_ratio = 48.0
        pt = 18.0

        poly = [
            (0.0, 0.0),
            (20.0 * pt, 0.0),
            (20.0 * pt, 5.0 * pt),
            (12.0 * pt, 5.0 * pt),
            (12.0 * pt, 10.0 * pt),
            (0.0, 10.0 * pt),
        ]

        area_pt2 = self._calculate_shoelace_area(poly)
        area_sqft = self._convert_to_sq_ft(area_pt2, scale_ratio)
        assert area_sqft == pytest.approx(160.0, abs=1e-6)

    def test_area_formula_fail_closed_on_unverified_scale(self):
        """Unverified, zero, negative, or undefined scale must strictly return undefined (None)."""
        poly = [(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)]
        area_pt2 = self._calculate_shoelace_area(poly)

        assert self._convert_to_sq_ft(area_pt2, None) is None
        assert self._convert_to_sq_ft(area_pt2, 0.0) is None
        assert self._convert_to_sq_ft(area_pt2, -48.0) is None

    def test_area_formula_degenerate_collinear_polygon(self):
        """Degenerate polygon with collinear vertices must produce 0.0 sq ft without NaN."""
        collinear_pts = [(0.0, 0.0), (50.0, 50.0), (100.0, 100.0)]
        area_pt2 = self._calculate_shoelace_area(collinear_pts)
        assert area_pt2 == 0.0
        area_sqft = self._convert_to_sq_ft(area_pt2, 48.0)
        assert area_sqft == 0.0
