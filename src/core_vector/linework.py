"""Deterministic vector path extraction and adaptive Bézier curve subdivision.

Conforms to AGENTS.md § 1 (Strict Hybrid Division of Labor) and ADR-001 (VECTOR-FIRST).
All spatial coordinates and linework trace directly to native PyMuPDF drawing paths.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import pymupdf


@dataclass
class LineworkOptions:
    """Configuration options for deterministic vector linework extraction."""

    dpi: int = 150
    curve_subdivision_segments: int = 8
    max_chord_error_pt: float = 0.10
    include_rect_edges: bool = True
    min_stroke_width_pt: float = 0.0
    max_stroke_width_pt: float = 100.0
    min_segment_length_pt: float = 0.01


@dataclass
class LineworkSegment:
    """Discrete vector segment in PDF user space points."""

    x0: float
    y0: float
    x1: float
    y1: float
    stroke_width_pt: float = 1.0
    stroke_color: tuple[float, float, float] | None = None
    source_type: Literal["line", "rect_edge", "curve_chord", "curve_quad"] = "line"
    curve_parent_id: str | None = None
    arc_length_pt: float = 0.0
    length_pt: float = 0.0

    def __post_init__(self) -> None:
        if self.length_pt == 0.0:
            self.length_pt = math.hypot(self.x1 - self.x0, self.y1 - self.y0)
        if self.arc_length_pt == 0.0:
            self.arc_length_pt = self.length_pt

    def to_dict(self) -> dict[str, Any]:
        return {
            "x0": self.x0,
            "y0": self.y0,
            "x1": self.x1,
            "y1": self.y1,
            "stroke_width_pt": self.stroke_width_pt,
            "stroke_color": self.stroke_color,
            "source_type": self.source_type,
            "curve_parent_id": self.curve_parent_id,
            "arc_length_pt": round(self.arc_length_pt, 4),
            "length_pt": round(self.length_pt, 4),
        }


# Compatibility alias with AUDIT_AND_GAP_ANALYSIS_2026.md § 6.2
ExtractedSegment = LineworkSegment


@dataclass
class LineworkResult:
    """Structured extraction outcome from a single PDF page."""

    segments: list[LineworkSegment] = field(default_factory=list)
    page_width_pt: float = 0.0
    page_height_pt: float = 0.0
    total_raw_primitives: int = 0
    subdivided_curve_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "segments_count": len(self.segments),
            "page_width_pt": self.page_width_pt,
            "page_height_pt": self.page_height_pt,
            "total_raw_primitives": self.total_raw_primitives,
            "subdivided_curve_count": self.subdivided_curve_count,
        }


def _point_to_line_distance(
    px: float, py: float, x0: float, y0: float, x1: float, y1: float
) -> float:
    """Compute perpendicular distance from point (px, py) to line segment (x0, y0)-(x1, y1)."""
    dx = x1 - x0
    dy = y1 - y0
    length_sq = dx * dx + dy * dy
    if length_sq < 1e-12:
        return math.hypot(px - x0, py - y0)
    u = ((px - x0) * dx + (py - y0) * dy) / length_sq
    u_clamped = max(0.0, min(1.0, u))
    proj_x = x0 + u_clamped * dx
    proj_y = y0 + u_clamped * dy
    return math.hypot(px - proj_x, py - proj_y)


def _eval_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    t: float,
) -> tuple[float, float]:
    """Evaluate cubic Bézier point at parameter t in [0, 1]."""
    u = 1.0 - t
    u2 = u * u
    u3 = u2 * u
    t2 = t * t
    t3 = t2 * t
    x = u3 * p0[0] + 3.0 * u2 * t * p1[0] + 3.0 * u * t2 * p2[0] + t3 * p3[0]
    y = u3 * p0[1] + 3.0 * u2 * t * p1[1] + 3.0 * u * t2 * p2[1] + t3 * p3[1]
    return (x, y)


def _eval_cubic_bezier_derivative(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    t: float,
) -> tuple[float, float]:
    """Evaluate cubic Bézier tangent vector B'(t)."""
    u = 1.0 - t
    # B'(t) = 3*(1-t)^2*(P1 - P0) + 6*(1-t)*t*(P2 - P1) + 3*t^2*(P3 - P2)
    dx = (
        3.0 * u * u * (p1[0] - p0[0])
        + 6.0 * u * t * (p2[0] - p1[0])
        + 3.0 * t * t * (p3[0] - p2[0])
    )
    dy = (
        3.0 * u * u * (p1[1] - p0[1])
        + 6.0 * u * t * (p2[1] - p1[1])
        + 3.0 * t * t * (p3[1] - p2[1])
    )
    return (dx, dy)


def _estimate_cubic_arc_length(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
) -> float:
    """Accurately estimate cubic Bézier arc length via 3-point Gauss-Legendre quadrature."""
    # Gauss-Legendre points on [-1, 1] mapped to [0, 1]: t_i = 0.5 * (1 + x_i)
    # x_i = 0, +/- sqrt(3/5)
    r = 0.7745966692414834  # sqrt(3/5)
    t1 = 0.5 * (1.0 - r)
    t2 = 0.5
    t3 = 0.5 * (1.0 + r)
    w1 = 5.0 / 18.0
    w2 = 8.0 / 18.0
    w3 = 5.0 / 18.0

    d1 = _eval_cubic_bezier_derivative(p0, p1, p2, p3, t1)
    d2 = _eval_cubic_bezier_derivative(p0, p1, p2, p3, t2)
    d3 = _eval_cubic_bezier_derivative(p0, p1, p2, p3, t3)

    len1 = math.hypot(d1[0], d1[1])
    len2 = math.hypot(d2[0], d2[1])
    len3 = math.hypot(d3[0], d3[1])

    return (w1 * len1 + w2 * len2 + w3 * len3)


def subdivide_cubic_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    max_chord_error_pt: float = 0.10,
    min_segments: int = 8,
    max_depth: int = 7,
    depth: int = 0,
) -> list[tuple[tuple[float, float], tuple[float, float], float]]:
    """Adaptively subdivide cubic Bézier curve into chord segments.

    Enforces maximum chord deviation < max_chord_error_pt (default 0.10 pt)
    while preserving true arc length along the curve.

    Returns:
        List of ((start_x, start_y), (end_x, end_y), arc_length_pt)
    """
    d1 = _point_to_line_distance(p1[0], p1[1], p0[0], p0[1], p3[0], p3[1])
    d2 = _point_to_line_distance(p2[0], p2[1], p0[0], p0[1], p3[0], p3[1])
    max_dev = max(d1, d2)

    # Respect minimum segments requirement at shallow depths
    requires_subdivision = (2**depth) < min_segments

    if not requires_subdivision and (max_dev <= max_chord_error_pt or depth >= max_depth):
        arc_len = _estimate_cubic_arc_length(p0, p1, p2, p3)
        return [(p0, p3, arc_len)]

    # De Casteljau subdivision at t = 0.5
    p01 = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
    p12 = ((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5)
    p23 = ((p2[0] + p3[0]) * 0.5, (p2[1] + p3[1]) * 0.5)

    p012 = ((p01[0] + p12[0]) * 0.5, (p01[1] + p12[1]) * 0.5)
    p123 = ((p12[0] + p23[0]) * 0.5, (p12[1] + p23[1]) * 0.5)

    p0123 = ((p012[0] + p123[0]) * 0.5, (p012[1] + p123[1]) * 0.5)

    left = subdivide_cubic_bezier(
        p0, p01, p012, p0123, max_chord_error_pt, min_segments, max_depth, depth + 1
    )
    right = subdivide_cubic_bezier(
        p0123, p123, p23, p3, max_chord_error_pt, min_segments, max_depth, depth + 1
    )
    return left + right


def subdivide_quad_bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    max_chord_error_pt: float = 0.10,
    max_depth: int = 7,
    depth: int = 0,
) -> list[tuple[tuple[float, float], tuple[float, float], float]]:
    """Adaptively subdivide quadratic Bézier curve into chord segments."""
    dev = _point_to_line_distance(p1[0], p1[1], p0[0], p0[1], p2[0], p2[1])
    if dev <= max_chord_error_pt or depth >= max_depth:
        # Straight chord approximation with arc length from chord + parabolic correction
        chord_len = math.hypot(p2[0] - p0[0], p2[1] - p0[1])
        if chord_len < 1e-6:
            arc_len = dev if dev > 1e-6 else 0.0
            return [(p0, p2, arc_len)]
        arc_len = chord_len + (8.0 * dev * dev) / (3.0 * chord_len)
        return [(p0, p2, arc_len)]

    p01 = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
    p12 = ((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5)
    p012 = ((p01[0] + p12[0]) * 0.5, (p01[1] + p12[1]) * 0.5)

    left = subdivide_quad_bezier(p0, p01, p012, max_chord_error_pt, max_depth, depth + 1)
    right = subdivide_quad_bezier(p012, p12, p2, max_chord_error_pt, max_depth, depth + 1)
    return left + right


def extract_vector_linework(
    pdf_path: Path | str,
    page_index: int = 0,
    options: LineworkOptions | None = None,
) -> LineworkResult:
    """Extract clean PyMuPDF drawing paths with adaptive Bézier subdivision.

    Args:
        pdf_path: File path to drawing PDF.
        page_index: 0-based page index.
        options: Extraction and subdivision thresholds.

    Returns:
        LineworkResult containing all extracted segments, dimensions, and primitive stats.

    Raises:
        ValueError: If PDF cannot be opened or page_index is out of range.
    """
    opts = options or LineworkOptions()
    path_obj = Path(pdf_path)
    if not path_obj.exists():
        raise ValueError(f"PDF file does not exist: {pdf_path}")

    try:
        doc = pymupdf.open(str(path_obj))
    except Exception as exc:
        raise ValueError(f"Could not open PDF drawing '{pdf_path}': {exc}") from exc

    try:
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(
                f"Page index {page_index} out of range for document with {len(doc)} pages"
            )

        page = doc[page_index]
        page_rect = page.rect
        width_pt = float(page_rect.width)
        height_pt = float(page_rect.height)

        try:
            drawings = page.get_drawings()
        except Exception as exc:
            raise ValueError(f"Failed to extract drawings from page {page_index}: {exc}") from exc

        segments: list[LineworkSegment] = []
        raw_primitives = 0
        curve_counter = 0

        for drawing in drawings:
            color = drawing.get("color")
            stroke_color: tuple[float, float, float] | None = None
            if color and len(color) >= 3:
                stroke_color = (float(color[0]), float(color[1]), float(color[2]))

            stroke_width = float(drawing.get("width") or 1.0)
            if (
                stroke_width < opts.min_stroke_width_pt
                or stroke_width > opts.max_stroke_width_pt
            ):
                continue

            for item in drawing.get("items", []):
                kind = item[0]
                raw_primitives += 1

                if kind == "l":
                    # Direct straight line
                    p0, p1 = item[1], item[2]
                    seg = LineworkSegment(
                        x0=float(p0.x),
                        y0=float(p0.y),
                        x1=float(p1.x),
                        y1=float(p1.y),
                        stroke_width_pt=stroke_width,
                        stroke_color=stroke_color,
                        source_type="line",
                    )
                    if seg.length_pt >= opts.min_segment_length_pt:
                        segments.append(seg)

                elif kind == "re" and opts.include_rect_edges:
                    # Rectangle boundary edges
                    rect = item[1]
                    corners = [
                        (float(rect.x0), float(rect.y0)),
                        (float(rect.x1), float(rect.y0)),
                        (float(rect.x1), float(rect.y1)),
                        (float(rect.x0), float(rect.y1)),
                    ]
                    for i in range(4):
                        c0 = corners[i]
                        c1 = corners[(i + 1) % 4]
                        seg = LineworkSegment(
                            x0=c0[0],
                            y0=c0[1],
                            x1=c1[0],
                            y1=c1[1],
                            stroke_width_pt=stroke_width,
                            stroke_color=stroke_color,
                            source_type="rect_edge",
                        )
                        if seg.length_pt >= opts.min_segment_length_pt:
                            segments.append(seg)

                elif kind == "c":
                    # Cubic Bézier curve
                    curve_counter += 1
                    curve_id = f"c_{curve_counter}"
                    cp0, cp1, cp2, cp3 = item[1], item[2], item[3], item[4]
                    chords = subdivide_cubic_bezier(
                        (float(cp0.x), float(cp0.y)),
                        (float(cp1.x), float(cp1.y)),
                        (float(cp2.x), float(cp2.y)),
                        (float(cp3.x), float(cp3.y)),
                        max_chord_error_pt=opts.max_chord_error_pt,
                        min_segments=opts.curve_subdivision_segments,
                    )
                    for start_pt, end_pt, arc_len in chords:
                        seg = LineworkSegment(
                            x0=start_pt[0],
                            y0=start_pt[1],
                            x1=end_pt[0],
                            y1=end_pt[1],
                            stroke_width_pt=stroke_width,
                            stroke_color=stroke_color,
                            source_type="curve_chord",
                            curve_parent_id=curve_id,
                            arc_length_pt=arc_len,
                        )
                        if seg.length_pt >= opts.min_segment_length_pt:
                            segments.append(seg)

                elif kind == "qu":
                    # Quadratic Bézier curve
                    curve_counter += 1
                    curve_id = f"qu_{curve_counter}"
                    cp0, cp1, cp2 = item[1], item[2], item[3]
                    chords = subdivide_quad_bezier(
                        (float(cp0.x), float(cp0.y)),
                        (float(cp1.x), float(cp1.y)),
                        (float(cp2.x), float(cp2.y)),
                        max_chord_error_pt=opts.max_chord_error_pt,
                    )
                    for start_pt, end_pt, arc_len in chords:
                        seg = LineworkSegment(
                            x0=start_pt[0],
                            y0=start_pt[1],
                            x1=end_pt[0],
                            y1=end_pt[1],
                            stroke_width_pt=stroke_width,
                            stroke_color=stroke_color,
                            source_type="curve_quad",
                            curve_parent_id=curve_id,
                            arc_length_pt=arc_len,
                        )
                        if seg.length_pt >= opts.min_segment_length_pt:
                            segments.append(seg)

        return LineworkResult(
            segments=segments,
            page_width_pt=width_pt,
            page_height_pt=height_pt,
            total_raw_primitives=raw_primitives,
            subdivided_curve_count=curve_counter,
        )
    finally:
        doc.close()
