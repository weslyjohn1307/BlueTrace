from __future__ import annotations

import math
from pathlib import Path

import pytest

from src.core_vector.centerline import (
    CenterlineOptions,
    CenterlineRun,
    derive_centerlines,
    synthesize_elbow_intersections,
)
from src.core_vector.linework import (
    LineworkOptions,
    LineworkResult,
    LineworkSegment,
    extract_vector_linework,
    subdivide_cubic_bezier,
    subdivide_quad_bezier,
)
from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import (
    LegendScanner,
    LegendScanResult,
    LegendSymbolEntry,
    scan_sheet_legend,
)

# ---------------------------------------------------------------------------
# 1. Linework Extraction & Adaptive Bézier Tests
# ---------------------------------------------------------------------------


def test_linework_extracts_from_mechanical_fixture():
    """Verify clean vector linework extraction on real drawing fixture."""
    fixture_path = Path("fixtures/mechanical/hvac_plan_level2.pdf")
    assert fixture_path.exists()

    result = extract_vector_linework(fixture_path, page_index=0)
    assert isinstance(result, LineworkResult)
    assert result.page_width_pt == 3024.0
    assert result.page_height_pt == 2160.0
    assert len(result.segments) > 100
    assert result.total_raw_primitives > 0

    first_seg = result.segments[0]
    assert isinstance(first_seg, LineworkSegment)
    assert first_seg.length_pt > 0.0
    assert first_seg.source_type in ("line", "rect_edge", "curve_chord", "curve_quad")

    d = result.to_dict()
    assert d["segments_count"] == len(result.segments)
    assert d["page_width_pt"] == 3024.0


def test_linework_fail_closed_on_missing_or_invalid_page():
    """Fail-closed: missing file or bad page index raises ValueError."""
    with pytest.raises(ValueError, match="PDF file does not exist"):
        extract_vector_linework("fixtures/non_existent_blueprint.pdf", page_index=0)

    fixture_path = Path("fixtures/mechanical/hvac_plan_level2.pdf")
    with pytest.raises(ValueError, match="Page index 99 out of range"):
        extract_vector_linework(fixture_path, page_index=99)


def test_adaptive_cubic_bezier_subdivision_accuracy():
    """Subdivision of 90-deg circular arc must prevent the -10% chord undercount."""
    # 90-degree circular arc of radius R = 100.0 from (100, 0) to (0, 100)
    # Control points using standard cubic circle approximation factor k = 4/3*(sqrt(2)-1)
    k = 4.0 / 3.0 * (math.sqrt(2.0) - 1.0)  # ~0.55228475
    r = 100.0
    p0 = (r, 0.0)
    p1 = (r, r * k)
    p2 = (r * k, r)
    p3 = (0.0, r)

    # True arc length = pi/2 * R = 157.0796 pt
    true_arc_length = 0.5 * math.pi * r
    # Chord length from (100, 0) to (0, 100) = sqrt(100^2 + 100^2) = 141.42 pt (~10% undercount)
    single_chord_len = math.hypot(p3[0] - p0[0], p3[1] - p0[1])
    assert single_chord_len < 142.0

    # Adaptively subdivide with max chord error < 0.10 pt
    chords = subdivide_cubic_bezier(p0, p1, p2, p3, max_chord_error_pt=0.10, min_segments=8)
    assert len(chords) >= 8

    # Sum of chord lengths must accurately track the true arc length (> 156.9 pt)
    total_chord_length = sum(
        math.hypot(end[0] - start[0], end[1] - start[1]) for start, end, _ in chords
    )
    assert total_chord_length > 156.8
    assert abs(total_chord_length - true_arc_length) < 0.30

    # Arc length estimates on each chord must closely match the true arc
    total_estimated_arc = sum(arc_len for _, _, arc_len in chords)
    assert abs(total_estimated_arc - true_arc_length) < 0.10


def test_adaptive_quad_bezier_subdivision():
    """Subdivision of quadratic Bézier curve into chord segments."""
    p0 = (0.0, 0.0)
    p1 = (50.0, 60.0)
    p2 = (100.0, 0.0)

    chords = subdivide_quad_bezier(p0, p1, p2, max_chord_error_pt=0.10)
    assert len(chords) >= 4
    # All segments connected sequentially
    for i in range(len(chords) - 1):
        end_pt = chords[i][1]
        start_next = chords[i + 1][0]
        assert math.hypot(start_next[0] - end_pt[0], start_next[1] - end_pt[1]) < 1e-9


# ---------------------------------------------------------------------------
# 2. Centerline Derivation & Elbow Intersection Synthesis Tests
# ---------------------------------------------------------------------------


def test_derive_centerlines_parallel_duct_pairing():
    """Derive true equidistant centerline corridor between parallel boundaries."""
    # Double-line duct boundaries: Width = 36 pt, running horizontally from X=10 to X=210
    boundary_a = {"id": "wall_top", "x0": 10.0, "y0": 20.0, "x1": 210.0, "y1": 20.0}
    boundary_b = {"id": "wall_bot", "x0": 10.0, "y0": 56.0, "x1": 210.0, "y1": 56.0}

    runs = derive_centerlines([boundary_a, boundary_b])
    assert len(runs) == 1

    run = runs[0]
    assert isinstance(run, CenterlineRun)
    assert run.width_pt == pytest.approx(36.0, abs=0.1)
    assert run.length_pt == pytest.approx(200.0, abs=0.1)

    pts = run.points
    assert len(pts) == 2
    # Y-midpoint must be (20 + 56)/2 = 38.0
    assert pts[0][1] == pytest.approx(38.0, abs=0.1)
    assert pts[1][1] == pytest.approx(38.0, abs=0.1)


def test_derive_centerlines_single_line_plumbing():
    """Plumbing single-line runs pass through 1:1 without double-boundary pairing."""
    boundaries = [
        {"id": "pipe_1", "x0": 50.0, "y0": 100.0, "x1": 250.0, "y1": 100.0},
        {"id": "pipe_2", "x0": 250.0, "y0": 100.0, "x1": 250.0, "y1": 300.0},
    ]

    runs = derive_centerlines(
        boundaries,
        options=CenterlineOptions(discipline="plumbing", default_system="Domestic Water"),
    )
    assert len(runs) == 2
    assert runs[0].length_pt == pytest.approx(200.0, abs=0.1)
    assert runs[1].length_pt == pytest.approx(200.0, abs=0.1)
    assert runs[0].system == "Domestic Water"


def test_synthesize_elbow_intersections_solves_corner_gap_paradox():
    """Solve the 0.707 * W corner gap paradox at 90-deg elbows via director rays."""
    # Horizontal duct: W = 36 pt. Overlap ends at X = 100.0. Centerline Y = 50.0
    # Endpoint is at (100.0, 50.0)
    run_horiz = CenterlineRun(
        run_id="run_h",
        width_pt=36.0,
        points=[(0.0, 50.0), (100.0, 50.0)],
        system="Supply Air",
    )

    # Vertical duct: W = 36 pt. Overlap ends at Y = 68.0. Centerline X = 118.0
    # Endpoint is at (118.0, 68.0)
    # Corner gap D = sqrt(18^2 + 18^2) = 25.456 pt (~ 0.7071 * W)
    run_vert = CenterlineRun(
        run_id="run_v",
        width_pt=36.0,
        points=[(118.0, 68.0), (118.0, 200.0)],
        system="Supply Air",
    )

    gap_before = math.hypot(118.0 - 100.0, 68.0 - 50.0)
    assert gap_before == pytest.approx(25.456, abs=0.01)

    # Director-ray intersection synthesis
    res = synthesize_elbow_intersections([run_horiz, run_vert], max_corner_gap_pt=30.0)
    assert res.total_elbows_resolved == 1
    assert len(res.synthesized_junctions) == 1

    junction = res.synthesized_junctions[0]
    # Intersection apex must be exactly at (118.0, 50.0)
    assert junction["intersection_pt"] == (118.0, 50.0)
    assert junction["corner_gap_pt"] == pytest.approx(25.456, abs=0.01)
    assert junction["turning_angle_deg"] == pytest.approx(90.0, abs=1.0)

    # Both connected runs now meet at the corner apex (118.0, 50.0)
    h_end = res.connected_runs[0].points[-1]
    v_start = res.connected_runs[1].points[0]
    assert h_end == (118.0, 50.0)
    assert v_start == (118.0, 50.0)
    # Gap is now eliminated (0.0 pt)
    gap_after = math.hypot(v_start[0] - h_end[0], v_start[1] - h_end[1])
    assert gap_after == 0.0


# ---------------------------------------------------------------------------
# 3. Legend Scanner & Mock Mode Tests
# ---------------------------------------------------------------------------


def test_legend_scanner_mechanical_mock_mode():
    """LegendScanner runs in mock mode returning structured symbols and abbreviations."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    assert client.is_configured() is False

    scanner = LegendScanner(client=client)
    res = scanner.scan_sheet("fixtures/mechanical/hvac_plan_level2.pdf", page_index=0)

    assert isinstance(res, LegendScanResult)
    assert res.legend_detected is True
    assert res.legend_bbox_pt is not None
    assert res.mock is True
    assert res.review_required is False
    assert len(res.symbols) >= 4

    labels = [s.label for s in res.symbols]
    assert "SD" in labels
    assert "RG" in labels
    assert "FD" in labels
    assert "VAV" in labels

    assert "CFM" in res.abbreviations
    assert "VAV" in res.abbreviations
    assert res.abbreviations["CFM"] == "Cubic Feet per Minute"

    d = res.to_dict()
    assert d["symbols_count"] == len(res.symbols)
    assert d["mock"] is True


def test_legend_scanner_plumbing_mock_mode():
    """LegendScanner adapts symbol taxonomy when scanning plumbing fixtures."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    res = scan_sheet_legend("fixtures/plumbing/plumbing_plan_level4.pdf", client=client)

    assert res.legend_detected is True
    labels = [s.label for s in res.symbols]
    assert "CO" in labels or "FD" in labels or "BV" in labels
    assert "SAN" in res.abbreviations or "CW" in res.abbreviations


def test_legend_scanner_fail_closed_on_missing_file():
    """Fail-closed: missing PDF raises ValueError."""
    with pytest.raises(ValueError, match="PDF drawing file not found"):
        scan_sheet_legend("fixtures/missing_blueprint.pdf")


# ---------------------------------------------------------------------------
# 4. Interface Typing and Fail-Closed Default Invariants
# ---------------------------------------------------------------------------


def test_scaffolding_dataclass_defaults():
    """Verify dataclasses fail closed with safe defaults."""
    lo = LineworkOptions()
    assert lo.max_chord_error_pt == 0.10
    assert lo.curve_subdivision_segments == 8

    co = CenterlineOptions()
    assert co.max_angle_delta_deg == 5.0
    assert co.min_corridor_width_pt == 4.0

    entry = LegendSymbolEntry(
        symbol_id="test",
        label="T",
        description="Test",
        system="General",
    )
    assert entry.status == "SUGGESTED"
    assert entry.confidence == 0.95
