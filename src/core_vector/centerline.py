"""Midpoint corridor centerline derivation and elbow intersection synthesis.

Conforms to AGENTS.md § 1 and solves the 0.707 * W corner gap paradox at 90-degree
elbows via deterministic director-ray intersection math.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CenterlineOptions:
    """Configuration for boundary pairing and centerline corridor derivation.

    NOTE (divergence, comment only - thresholds intentionally unchanged):
    these legacy-branch defaults diverge from configs/l2/route-representation.yaml
    (there: min separation 2.0 pt, max separation 80.0 pt, paired-boundary
    min_overlap_fraction 0.50). Do not silently align them here; changing
    pairing thresholds is a separate, config-reviewed decision.
    """

    min_corridor_width_pt: float = 4.0
    max_corridor_width_pt: float = 120.0
    max_angle_delta_deg: float = 5.0
    min_overlap_fraction: float = 0.30
    discipline: str = "mechanical"
    default_system: str = "supply"


@dataclass
class CenterlineRun:
    """Continuous centerline run derived from paired boundaries or single-line routing."""

    run_id: str
    edge_a_id: str = ""
    edge_b_id: str = ""
    width_pt: float = 0.0
    points: list[tuple[float, float]] = field(default_factory=list)
    system: str = "supply"
    length_pt: float = 0.0
    status: str = "SUGGESTED"
    review_required: bool = False

    def __post_init__(self) -> None:
        if self.length_pt == 0.0 and len(self.points) >= 2:
            self.recompute_length()

    def recompute_length(self) -> float:
        total = 0.0
        for i in range(len(self.points) - 1):
            p0 = self.points[i]
            p1 = self.points[i + 1]
            total += math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        self.length_pt = total
        return total

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "edge_a_id": self.edge_a_id,
            "edge_b_id": self.edge_b_id,
            "width_pt": round(self.width_pt, 3),
            "points": [[round(p[0], 3), round(p[1], 3)] for p in self.points],
            "system": self.system,
            "length_pt": round(self.length_pt, 4),
            "status": self.status,
            "review_required": self.review_required,
        }


# Compatibility alias with AUDIT_AND_GAP_ANALYSIS_2026.md § 6.2
CenterlineCorridor = CenterlineRun


@dataclass
class ElbowSynthesisResult:
    """Result of synthesizing director-ray intersections at elbow turns."""

    connected_runs: list[CenterlineRun]
    synthesized_junctions: list[dict[str, Any]]
    unconnected_runs_count: int
    total_elbows_resolved: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_runs": len(self.connected_runs),
            "total_elbows_resolved": self.total_elbows_resolved,
            "unconnected_runs_count": self.unconnected_runs_count,
            "synthesized_junctions": self.synthesized_junctions,
        }


def _segment_angle_deg(x0: float, y0: float, x1: float, y1: float) -> float:
    """Compute segment angle in degrees in [0, 180)."""
    dx = x1 - x0
    dy = y1 - y0
    deg = math.degrees(math.atan2(dy, dx)) % 180.0
    return deg


def _extract_coords(b: dict[str, Any] | Any) -> tuple[str, float, float, float, float]:
    """Normalize boundary segment into (id, x0, y0, x1, y1)."""
    if isinstance(b, dict):
        b_id = str(b.get("id") or b.get("candidate_id") or b.get("edge_id") or "seg")
        if "points" in b and len(b["points"]) >= 2:
            pts = b["points"]
            return b_id, float(pts[0][0]), float(pts[0][1]), float(pts[1][0]), float(pts[1][1])
        return (
            b_id,
            float(b.get("x0", 0.0)),
            float(b.get("y0", 0.0)),
            float(b.get("x1", 0.0)),
            float(b.get("y1", 0.0)),
        )
    # Attribute based (e.g. LineworkSegment)
    b_id = getattr(b, "curve_parent_id", None) or "seg"
    return (
        b_id,
        float(getattr(b, "x0", 0.0)),
        float(getattr(b, "y0", 0.0)),
        float(getattr(b, "x1", 0.0)),
        float(getattr(b, "y1", 0.0)),
    )


def _mid_at_overlap(
    s: float,
    ax0: float,
    ay0: float,
    vax: float,
    vay: float,
    bx0: float,
    by0: float,
    bx1: float,
    by1: float,
    s_b0: float,
    s_b1: float,
) -> tuple[float, float]:
    """Midpoint between wall A (at arc-length s) and wall B (interpolated)."""
    pa = (ax0 + vax * s, ay0 + vay * s)
    denom = s_b1 - s_b0
    t = (s - s_b0) / denom if abs(denom) > 1e-9 else 0.0
    pb = (bx0 + (bx1 - bx0) * t, by0 + (by1 - by0) * t)
    return ((pa[0] + pb[0]) * 0.5, (pa[1] + pb[1]) * 0.5)


def derive_centerlines(
    boundaries: list[dict[str, Any] | Any],
    options: CenterlineOptions | None = None,
) -> list[CenterlineRun]:
    """Derive true equidistant centerline corridors from boundary segments.

    For mechanical discipline: pairs parallel double-line duct boundaries and derives
    their midpoint centerline.
    For single-line disciplines (plumbing/electrical): converts linear segments 1:1.

    Args:
        boundaries: List of boundary segment dicts or LineworkSegment objects.
        options: Centerline derivation options.

    Returns:
        List of CenterlineRun objects.
    """
    opts = options or CenterlineOptions()
    if not boundaries:
        return []

    # Single-line pass-through for plumbing / electrical
    if opts.discipline.lower() in ("plumbing", "electrical"):
        runs: list[CenterlineRun] = []
        for i, b in enumerate(boundaries):
            b_id, x0, y0, x1, y1 = _extract_coords(b)
            length = math.hypot(x1 - x0, y1 - y0)
            if length >= 0.01:
                runs.append(
                    CenterlineRun(
                        run_id=f"sl_run_{i+1}",
                        edge_a_id=b_id,
                        width_pt=0.0,
                        points=[(x0, y0), (x1, y1)],
                        system=opts.default_system,
                        length_pt=length,
                    )
                )
        return runs

    # Mechanical: double-line pairing
    norm_boundaries: list[tuple[str, float, float, float, float, float, float]] = []
    for b in boundaries:
        b_id, x0, y0, x1, y1 = _extract_coords(b)
        dx = x1 - x0
        dy = y1 - y0
        length = math.hypot(dx, dy)
        if length >= 0.10:
            ang = _segment_angle_deg(x0, y0, x1, y1)
            norm_boundaries.append((b_id, x0, y0, x1, y1, length, ang))

    used_indices: set[int] = set()
    centerlines: list[CenterlineRun] = []
    run_counter = 0

    n = len(norm_boundaries)
    for i in range(n):
        if i in used_indices:
            continue
        id_a, ax0, ay0, ax1, ay1, len_a, ang_a = norm_boundaries[i]
        vax = (ax1 - ax0) / len_a
        vay = (ay1 - ay0) / len_a
        # Normal vector to A
        nax = -vay
        nay = vax

        best_j: int | None = None
        best_overlap = 0.0
        best_width = 0.0
        best_midpoint: tuple[tuple[float, float], tuple[float, float]] | None = None
        best_partial_overlap = False

        for j in range(i + 1, n):
            if j in used_indices:
                continue
            _id_b, bx0, by0, bx1, by1, len_b, ang_b = norm_boundaries[j]

            # Angular parallelism check
            delta_ang = abs(ang_a - ang_b)
            if delta_ang > 90.0:
                delta_ang = 180.0 - delta_ang
            if delta_ang > opts.max_angle_delta_deg:
                continue

            # Align directions
            vbx = (bx1 - bx0) / len_b
            vby = (by1 - by0) / len_b
            dot = vax * vbx + vay * vby
            if dot < 0.0:
                # Reverse B
                bx0, by0, bx1, by1 = bx1, by1, bx0, by0

            # Perpendicular distance (corridor width)
            # Distance from B's midpoint to line A
            bmx = (bx0 + bx1) * 0.5
            bmy = (by0 + by1) * 0.5
            dist_perp = abs((bmx - ax0) * nax + (bmy - ay0) * nay)

            if (
                dist_perp < opts.min_corridor_width_pt
                or dist_perp > opts.max_corridor_width_pt
            ):
                continue

            # Longitudinal overlap along A's axis
            s_b0 = (bx0 - ax0) * vax + (by0 - ay0) * vay
            s_b1 = (bx1 - ax0) * vax + (by1 - ay0) * vay
            ov_min = max(0.0, min(s_b0, s_b1))
            ov_max = min(len_a, max(s_b0, s_b1))
            overlap_len = ov_max - ov_min

            overlap_fraction = overlap_len / max(min(len_a, len_b), 1e-6)
            if overlap_fraction < opts.min_overlap_fraction:
                continue

            if overlap_fraction > best_overlap:
                best_overlap = overlap_fraction
                best_j = j
                best_width = dist_perp

                # Clip the spine to the overlap window only: emitting the
                # midpoints of the full segment endpoints would invent
                # length where only one wall exists. Evaluate each wall at
                # the overlap window ends (interpolate each wall's own
                # endpoints to ov_min/ov_max along A's axis) and average.
                s_lo = min(s_b0, s_b1)
                s_hi = max(s_b0, s_b1)

                best_midpoint = (
                    _mid_at_overlap(
                        ov_min, ax0, ay0, vax, vay, bx0, by0, bx1, by1, s_b0, s_b1
                    ),
                    _mid_at_overlap(
                        ov_max, ax0, ay0, vax, vay, bx0, by0, bx1, by1, s_b0, s_b1
                    ),
                )
                # Either wall extending beyond the overlap window by more
                # than 1.0 pt means the corridor is only partially paired:
                # flag it (fail-closed) instead of shipping it as measured.
                best_partial_overlap = (
                    max(
                        ov_min - 0.0,
                        len_a - ov_max,
                        ov_min - s_lo,
                        s_hi - ov_max,
                    )
                    > 1.0
                )

        if best_j is not None and best_midpoint is not None:
            used_indices.add(i)
            used_indices.add(best_j)
            run_counter += 1
            m_start, m_end = best_midpoint
            c_len = math.hypot(m_end[0] - m_start[0], m_end[1] - m_start[1])

            centerlines.append(
                CenterlineRun(
                    run_id=f"run_{run_counter}",
                    edge_a_id=id_a,
                    edge_b_id=norm_boundaries[best_j][0],
                    width_pt=best_width,
                    points=[m_start, m_end],
                    system=opts.default_system,
                    length_pt=c_len,
                    review_required=best_partial_overlap,
                )
            )

    return centerlines


def _intersect_rays(
    p1: tuple[float, float],
    d1: tuple[float, float],
    p2: tuple[float, float],
    d2: tuple[float, float],
) -> tuple[float, float, float, float] | None:
    """Solve p1 + t*d1 = p2 + s*d2 for t and s.

    Returns:
        (t, s, int_x, int_y) or None if parallel / determinant ~ 0.
    """
    det = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
    if abs(det) < 1e-6:
        return None

    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]

    t = (dx * (-d2[1]) - dy * (-d2[0])) / det
    s = (d1[0] * dy - d1[1] * dx) / det

    ix = p1[0] + t * d1[0]
    iy = p1[1] + t * d1[1]
    return (t, s, ix, iy)


def synthesize_elbow_intersections(
    runs: list[CenterlineRun],
    max_corner_gap_pt: float = 30.0,
) -> ElbowSynthesisResult:
    """Synthesize director-ray intersections at elbow turns to solve the 0.707 * W gap paradox.

    Extends both runs to meet cleanly at the corner apex, resolving the topological
    disconnection caused by parallel wall boundary truncations.

    Args:
        runs: List of extracted or derived centerline runs.
        max_corner_gap_pt: Maximum Euclidean gap between centerline endpoints at an elbow.

    Returns:
        ElbowSynthesisResult with modified connected runs and synthesized junction records.
    """
    if len(runs) < 2:
        return ElbowSynthesisResult(
            connected_runs=runs,
            synthesized_junctions=[],
            unconnected_runs_count=len(runs),
            total_elbows_resolved=0,
        )

    # Work with copies of points
    active_runs = [
        CenterlineRun(
            run_id=r.run_id,
            edge_a_id=r.edge_a_id,
            edge_b_id=r.edge_b_id,
            width_pt=r.width_pt,
            points=list(r.points),
            system=r.system,
            length_pt=r.length_pt,
            status=r.status,
            review_required=r.review_required,
        )
        for r in runs
    ]

    synthesized_junctions: list[dict[str, Any]] = []
    used_endpoints: set[tuple[str, int]] = set()  # (run_id, endpoint_index 0 or 1)
    resolved_run_ids: set[str] = set()

    n = len(active_runs)
    for i in range(n):
        r1 = active_runs[i]
        if len(r1.points) < 2:
            continue

        p1_0 = r1.points[0]
        p1_1 = r1.points[-1]
        len1 = math.hypot(p1_1[0] - p1_0[0], p1_1[1] - p1_0[1])
        if len1 < 1e-4:
            continue

        # Unit vectors pointing outward from endpoints
        u1 = ((p1_1[0] - p1_0[0]) / len1, (p1_1[1] - p1_0[1]) / len1)
        # Outward at point 0: -u1; Outward at point -1: +u1
        r1_endpoints = [(0, p1_0, (-u1[0], -u1[1])), (len(r1.points) - 1, p1_1, (u1[0], u1[1]))]

        for ep1_idx, ep1_pt, ep1_dir in r1_endpoints:
            if (r1.run_id, ep1_idx) in used_endpoints:
                continue

            best_match: tuple[int, int, tuple[float, float], float, float, bool] | None = None
            best_gap = float("inf")

            for j in range(i + 1, n):
                r2 = active_runs[j]
                if len(r2.points) < 2:
                    continue

                p2_0 = r2.points[0]
                p2_1 = r2.points[-1]
                len2 = math.hypot(p2_1[0] - p2_0[0], p2_1[1] - p2_0[1])
                if len2 < 1e-4:
                    continue

                u2 = ((p2_1[0] - p2_0[0]) / len2, (p2_1[1] - p2_0[1]) / len2)
                r2_endpoints = [
                    (0, p2_0, (-u2[0], -u2[1])),
                    (len(r2.points) - 1, p2_1, (u2[0], u2[1])),
                ]

                # Width transitions are legitimate fitting geometry; the transition is recorded, not rejected.
                width_transition = False
                if r1.width_pt > 0.0 and r2.width_pt > 0.0:
                    w_ratio = max(r1.width_pt, r2.width_pt) / min(
                        r1.width_pt, r2.width_pt
                    )
                    width_transition = w_ratio > 2.0

                # Adaptive gap allowance scaled to duct width: 0.707 * W + margin
                max_w = max(r1.width_pt, r2.width_pt)
                effective_gap_limit = max(max_corner_gap_pt, 0.75 * max_w + 10.0)
                # Bounded apex travel: an endpoint may only be extended to
                # the apex by at most the 90-degree corner offset
                # (0.707 * W), floored at 12 pt for single-line routes.
                apex_travel_limit = max(0.707 * max_w, 12.0)

                for ep2_idx, ep2_pt, ep2_dir in r2_endpoints:
                    if (r2.run_id, ep2_idx) in used_endpoints:
                        continue

                    gap = math.hypot(ep2_pt[0] - ep1_pt[0], ep2_pt[1] - ep1_pt[1])
                    if gap > effective_gap_limit or gap < 1e-4:
                        continue

                    # Turning angle between outward directors must be a
                    # plausible elbow: 60-120 degrees. Near-collinear,
                    # shallow, or obtuse meetings are not elbows and must
                    # not be joined by guessing past the gap.
                    dot_dirs = ep1_dir[0] * ep2_dir[0] + ep1_dir[1] * ep2_dir[1]
                    turn_candidate_deg = math.degrees(
                        math.acos(max(-1.0, min(1.0, dot_dirs)))
                    )
                    if not (60.0 <= turn_candidate_deg <= 120.0):
                        continue

                    # Intersect director rays extending outward from both endpoints
                    sol = _intersect_rays(ep1_pt, ep1_dir, ep2_pt, ep2_dir)
                    if not sol:
                        continue
                    t, s, ix, iy = sol

                    # Rays must extend forward (or with minor negative tolerance <= 1.0 pt)
                    if t < -1.0 or s < -1.0:
                        continue

                    # Distance from each endpoint to the apex must stay
                    # within the bounded apex-travel limit.
                    d_apex1 = math.hypot(ix - ep1_pt[0], iy - ep1_pt[1])
                    d_apex2 = math.hypot(ix - ep2_pt[0], iy - ep2_pt[1])
                    if d_apex1 > apex_travel_limit or d_apex2 > apex_travel_limit:
                        continue

                    if gap < best_gap:
                        best_gap = gap
                        best_match = (j, ep2_idx, (ix, iy), gap, turn_candidate_deg, width_transition)

            if best_match is not None:
                match_j, match_ep2_idx, apex_pt, gap_val, turn_deg, match_width_transition = best_match
                r2 = active_runs[match_j]

                # Update endpoint 1
                if ep1_idx == 0:
                    r1.points[0] = apex_pt
                else:
                    r1.points[-1] = apex_pt
                r1.recompute_length()

                # Update endpoint 2
                if match_ep2_idx == 0:
                    r2.points[0] = apex_pt
                else:
                    r2.points[-1] = apex_pt
                r2.recompute_length()

                used_endpoints.add((r1.run_id, ep1_idx))
                used_endpoints.add((r2.run_id, match_ep2_idx))
                resolved_run_ids.add(r1.run_id)
                resolved_run_ids.add(r2.run_id)

                synthesized_junctions.append(
                    {
                        "run_a_id": r1.run_id,
                        "run_b_id": r2.run_id,
                        "intersection_pt": (round(apex_pt[0], 3), round(apex_pt[1], 3)),
                        "corner_gap_pt": round(gap_val, 3),
                        "turning_angle_deg": round(turn_deg, 1),
                        "width_transition": bool(match_width_transition),
                    }
                )

    resolved_count = len(synthesized_junctions)
    unconnected_count = len(active_runs) - len(resolved_run_ids)
    return ElbowSynthesisResult(
        connected_runs=active_runs,
        synthesized_junctions=synthesized_junctions,
        unconnected_runs_count=max(0, unconnected_count),
        total_elbows_resolved=resolved_count,
    )
