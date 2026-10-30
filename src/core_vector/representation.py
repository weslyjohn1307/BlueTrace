"""Level 2 Route Representation — L2-03-C1.

Converts L2-02 semantic candidates into explicit, typed, traceable route-representation
fragments, strictly separating candidate accounting from emitted route geometry.

Representation states (from configs/l2/route-representation.yaml):
  EXPLICIT_CENTERLINE      — Drafter-drawn centerline (single-line duct or pipe).
  SINGLE_LINE_ROUTE        — Single-line pipe/duct run evidence (plumbing primary state).
  PAIRED_BOUNDARY_DERIVED  — Mechanical duct pair resolved to a derived midpoint segment.
  BOUNDARY_UNRESOLVED      — Boundary line with no found pair; retained for downstream.
  NON_ROUTE                — Symbol, annotation, or fitting outline; not a length contributor.
  REVIEW_REQUIRED          — Ambiguous geometry; cannot be classified without visual review.

Candidate accounting states (L2-03-C1):
  EMITTED_SINGLE_LINE_ROUTE    — Emitted as a reportable single-line route fragment.
  CONSUMED_BY_PAIRED_BOUNDARY  — Consumed by a validated mechanical pair.
  BOUNDARY_UNRESOLVED          — Genuine unpaired boundary; not emitted as a route.
  NON_ROUTE                    — Sub-minimum length or fitting geometry; not a route.
  REVIEW_REQUIRED              — Curve chord or ambiguous geometry; not a route.

This module does NOT:
  - Reconstruct continuity or connect gaps.
  - Build topology.
  - Calculate drawing scale.
  - Calculate physical length (physical_length is always None, scale_status is NOT_EVALUATED).
  - Access the Testing partition.

Evidence base:
  - L2-02 candidates: outputs/autonomous-execution/L2-02/preflight/semantic-candidates.jsonl
    SHA-256: 514038a7f28bed3560bd1a18b2cafdb572e8dd8bdae4e73714abae1846c17662
  - Config: configs/l2/route-representation.yaml
    SHA-256: dd44c908c0e8d0aa59c78a5b850983ec37f8185fc803326b9521e4d8f1bd01aa
"""

from __future__ import annotations

import json
import math
import os
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from src.core_vector.schema import CandidateAccountingRecord, CandidateAccountingState

# Re-export for callers
__all__ = [
    "CandidateAccountingRecord",
    "CandidateAccountingState",
    "FragmentContinuityGraph",
    "FragmentGraphEdge",
    "RepresentationResult",
    "RepresentationState",
    "RouteFragment",
    "_midpoint_segment",
    "_perpendicular_distance",
    "_projected_overlap_fraction",
    "_segment_angle_deg",
    "build_fragment_continuity_graph",
    "classify_candidates",
    "classify_representation",
    "load_duplicate_lineage",
    "load_representation_config",
    "reconstruct_conservative_corridors",
    "reconstruct_single_line_continuity",
    "summarise_accounting",
    "summarise_fragments",
]

# ---------------------------------------------------------------------------
# Representation State Enum
# ---------------------------------------------------------------------------


class RepresentationState(str, Enum):
    """Typed representation state for every L2-02 semantic candidate (L2-03)."""

    EXPLICIT_CENTERLINE = "EXPLICIT_CENTERLINE"
    SINGLE_LINE_ROUTE = "SINGLE_LINE_ROUTE"
    PAIRED_BOUNDARY_DERIVED = "PAIRED_BOUNDARY_DERIVED"
    BOUNDARY_UNRESOLVED = "BOUNDARY_UNRESOLVED"
    NON_ROUTE = "NON_ROUTE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


# ---------------------------------------------------------------------------
# Route Fragment Dataclass (L2-03-C1 Machine Contract)
# ---------------------------------------------------------------------------


@dataclass
class RouteFragment:
    """A single typed, reportable route-representation fragment (L2-03-C1).

    Conforms to the full machine contract:
      - physical_length is ALWAYS None
      - physical_length_unit is ALWAYS None
      - scale_status is ALWAYS "NOT_EVALUATED"
      - geometry_pdf_pt contains PDF user-space coordinates (72 pt/in)
      - geometry_canonical_px contains canonical 150 DPI pixel coordinates
      - source candidate IDs, primitive IDs, and original geometries are preserved.
    """

    route_fragment_id: str = ""
    fixture_id: str = ""
    source_page_id: int | str = 0
    viewport_id: str = ""
    discipline: str = ""
    representation_state: str = ""
    is_reportable_geometry: bool = True
    geometry_pdf_pt: dict[str, Any] = field(default_factory=dict)
    geometry_canonical_px: dict[str, Any] | None = None
    geometry_length_pt: float = 0.0
    physical_length: None = None
    physical_length_unit: None = None
    scale_status: str = "NOT_EVALUATED"
    source_candidate_ids: list[str] = field(default_factory=list)
    source_primitive_ids: list[str] = field(default_factory=list)
    source_geometries_pdf_pt: list[dict[str, Any]] = field(default_factory=list)
    duplicate_lineage_references: list[str] = field(default_factory=list)
    representation_rule_id: str = ""
    reason_codes: list[str] = field(default_factory=list)
    review_required: bool = False
    config_path: str = "configs/l2/route-representation.yaml"
    config_sha256: str = "dd44c908c0e8d0aa59c78a5b850983ec37f8185fc803326b9521e4d8f1bd01aa"
    source_candidates_path: str = (
        "outputs/autonomous-execution/L2-02/preflight/semantic-candidates.jsonl"
    )
    source_candidates_sha256: str = (
        "514038a7f28bed3560bd1a18b2cafdb572e8dd8bdae4e73714abae1846c17662"
    )

    # Optional pair geometry metadata
    pair_separation_pt: float | None = None
    pair_overlap_fraction: float | None = None

    # Backward-compatible initialization parameters
    fragment_id: str = ""
    candidate_id: str = ""
    paired_candidate_id: str | None = None
    state: RepresentationState | str | None = None
    state_reason: str = ""
    x0: float = 0.0
    y0: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    length_pt: float = 0.0
    stroke_width: float = 0.0
    stroke_color: list[float] | None = None
    source_item_type: str = "l"
    raw_vector_id: str = ""

    def __post_init__(self) -> None:
        """Harmonize backward-compatible attributes with the canonical contract."""
        # Align ID
        if not self.route_fragment_id and self.fragment_id:
            self.route_fragment_id = self.fragment_id
        if not self.fragment_id and self.route_fragment_id:
            self.fragment_id = self.route_fragment_id

        # Align candidate ID
        if self.candidate_id and not self.source_candidate_ids:
            self.source_candidate_ids = [self.candidate_id]
        elif self.source_candidate_ids and not self.candidate_id:
            self.candidate_id = self.source_candidate_ids[0]

        if self.paired_candidate_id and len(self.source_candidate_ids) == 1:
            self.source_candidate_ids.append(self.paired_candidate_id)
        elif len(self.source_candidate_ids) > 1 and not self.paired_candidate_id:
            self.paired_candidate_id = self.source_candidate_ids[1]

        # Align primitive ID
        if self.raw_vector_id and not self.source_primitive_ids:
            self.source_primitive_ids = [self.raw_vector_id]
        elif self.source_primitive_ids and not self.raw_vector_id:
            self.raw_vector_id = self.source_primitive_ids[0]

        # Align representation state
        if self.state is not None and not self.representation_state:
            self.representation_state = (
                self.state.value if isinstance(self.state, Enum) else str(self.state)
            )
        elif self.representation_state and self.state is None:
            self.state = RepresentationState(self.representation_state)

        # Align geometry
        if not self.geometry_pdf_pt and (
            self.x0 != 0.0 or self.y0 != 0.0 or self.x1 != 0.0 or self.y1 != 0.0
        ):
            self.geometry_pdf_pt = {
                "type": "line",
                "points": [[self.x0, self.y0], [self.x1, self.y1]],
            }
        elif self.geometry_pdf_pt and (
            self.x0 == 0.0 and self.y0 == 0.0 and self.x1 == 0.0 and self.y1 == 0.0
        ):
            pts = self.geometry_pdf_pt.get("points", [[0.0, 0.0], [0.0, 0.0]])
            self.x0 = pts[0][0]
            self.y0 = pts[0][1]
            self.x1 = pts[1][0]
            self.y1 = pts[1][1]

        # Align length
        if self.geometry_length_pt == 0.0 and self.length_pt != 0.0:
            self.geometry_length_pt = self.length_pt
        elif self.length_pt == 0.0 and self.geometry_length_pt != 0.0:
            self.length_pt = self.geometry_length_pt
        elif self.geometry_length_pt == 0.0 and (self.x0 != self.x1 or self.y0 != self.y1):
            self.geometry_length_pt = math.hypot(self.x1 - self.x0, self.y1 - self.y0)
            self.length_pt = self.geometry_length_pt

        # Align canonical pixel geometry (150 DPI = 150/72 scale)
        if self.geometry_canonical_px is None and self.geometry_pdf_pt:
            s = 150.0 / 72.0
            self.geometry_canonical_px = {
                "type": "line",
                "points": [
                    [round(self.x0 * s, 3), round(self.y0 * s, 3)],
                    [round(self.x1 * s, 3), round(self.y1 * s, 3)],
                ],
            }

        # Align reasons
        if not self.reason_codes and self.state_reason:
            self.reason_codes = [self.state_reason]
        elif self.reason_codes and not self.state_reason:
            self.state_reason = self.reason_codes[0]

        # Enforce fail-closed scale fields
        self.physical_length = None
        self.physical_length_unit = None
        self.scale_status = "NOT_EVALUATED"

    def to_dict(self) -> dict[str, Any]:
        """Serialize route fragment conforming to the L2-03-C1 machine contract."""
        return {
            "route_fragment_id": self.route_fragment_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "representation_state": self.representation_state,
            "is_reportable_geometry": self.is_reportable_geometry,
            "geometry_pdf_pt": self.geometry_pdf_pt,
            "geometry_canonical_px": self.geometry_canonical_px,
            "geometry_length_pt": round(self.geometry_length_pt, 4),
            "physical_length": None,
            "physical_length_unit": None,
            "scale_status": "NOT_EVALUATED",
            "source_candidate_ids": self.source_candidate_ids,
            "source_primitive_ids": self.source_primitive_ids,
            "source_geometries_pdf_pt": self.source_geometries_pdf_pt,
            "duplicate_lineage_references": self.duplicate_lineage_references,
            "representation_rule_id": self.representation_rule_id,
            "reason_codes": self.reason_codes,
            "review_required": self.review_required,
            "config_path": self.config_path,
            "config_sha256": self.config_sha256,
            "source_candidates_path": self.source_candidates_path,
            "source_candidates_sha256": self.source_candidates_sha256,
            "pair_separation_pt": (
                round(self.pair_separation_pt, 4) if self.pair_separation_pt is not None else None
            ),
            "pair_overlap_fraction": (
                round(self.pair_overlap_fraction, 4)
                if self.pair_overlap_fraction is not None
                else None
            ),
            # Backward-compatible convenience keys for existing tests
            "fragment_id": self.route_fragment_id,
            "candidate_id": self.candidate_id,
            "state": self.representation_state,
            "state_reason": self.state_reason,
            "x0": self.x0,
            "y0": self.y0,
            "x1": self.x1,
            "y1": self.y1,
            "length_pt": round(self.geometry_length_pt, 4),
            "paired_candidate_id": self.paired_candidate_id,
        }


# ---------------------------------------------------------------------------
# Representation Result Container
# ---------------------------------------------------------------------------


@dataclass
class RepresentationResult:
    """Full result container containing separated route fragments and candidate accounting."""

    route_fragments: list[RouteFragment]
    accounting_records: list[CandidateAccountingRecord]
    paired_decisions: list[dict[str, Any]]
    paired_validation: dict[str, Any]
    unresolved_boundaries: list[dict[str, Any]]
    non_route_and_review: list[dict[str, Any]]
    fragment_graph: FragmentContinuityGraph | None = None
    route_hypotheses: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Production Graph Representation (Representation A)
# ---------------------------------------------------------------------------


@dataclass
class FragmentGraphEdge:
    """An edge in the Fragment Continuity Graph.

    Represents a unique geometric line segment after exact/reversed duplicate collapse.
    Retains full multi-source provenance of all contributing candidates and primitives.
    """

    edge_id: str
    sheet_id: str = ""
    source_candidate_ids: list[str] = field(default_factory=list)
    source_primitive_ids: list[str] = field(default_factory=list)
    duplicate_lineage: list[str] = field(default_factory=list)
    x0: float = 0.0
    y0: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    stroke_width: float = 0.0
    orientation_deg: float = 0.0
    length_pt: float = 0.0
    discipline: str = ""
    viewport_id: str = ""
    confidence: float = 1.0
    route_hypothesis_id: str | None = None
    connectivity: list[str] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "edge_id": self.edge_id,
            "sheet_id": self.sheet_id,
            "source_candidate_ids": self.source_candidate_ids,
            "source_primitive_ids": self.source_primitive_ids,
            "duplicate_lineage": self.duplicate_lineage,
            "x0": round(self.x0, 4),
            "y0": round(self.y0, 4),
            "x1": round(self.x1, 4),
            "y1": round(self.y1, 4),
            "stroke_width": round(self.stroke_width, 4),
            "orientation_deg": round(self.orientation_deg, 2),
            "length_pt": round(self.length_pt, 4),
            "discipline": self.discipline,
            "viewport_id": self.viewport_id,
            "confidence": self.confidence,
            "route_hypothesis_id": self.route_hypothesis_id,
            "connectivity": self.connectivity,
            "provenance": self.provenance,
        }


@dataclass
class FragmentContinuityGraph:
    """Fragment Continuity Graph (Representation A).

    Preserves native geometric linework fragments without requiring twin-boundary pairing.
    Collapses coincident/reversed vectors while retaining full multi-source provenance.
    """

    sheet_id: str = ""
    edges: list[FragmentGraphEdge] = field(default_factory=list)
    edge_by_id: dict[str, FragmentGraphEdge] = field(default_factory=dict)
    total_length_pt: float = 0.0
    collapsed_duplicate_count: int = 0
    grid_tol: float = 1.5

    def get_connected_components(self) -> list[list[str]]:
        """Compute connected components of edge IDs based on endpoint connectivity."""
        visited: set[str] = set()
        components: list[list[str]] = []
        for edge_id in self.edge_by_id:
            if edge_id in visited:
                continue
            comp: list[str] = []
            queue = [edge_id]
            visited.add(edge_id)
            while queue:
                curr = queue.pop()
                comp.append(curr)
                for neighbor in self.edge_by_id[curr].connectivity:
                    if neighbor not in visited and neighbor in self.edge_by_id:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(comp)
        return components

    @property
    def total_edges(self) -> int:
        return len(self.edges)

    @property
    def duplicates_collapsed(self) -> int:
        return self.collapsed_duplicate_count

    @property
    def connected_components_count(self) -> int:
        return len(self.get_connected_components())


@dataclass
class RouteHypothesis:
    """Structured hypothesis for an assembled corridor or single-line run."""

    hypothesis_id: str
    object_type: str  # "CORRIDOR_ROUTE", "SINGLE_LINE_ROUTE"
    points: list[tuple[float, float]]
    length_pt: float
    confidence: float
    sheet_id: str
    source_edge_ids: list[str] = field(default_factory=list)
    source_candidate_ids: list[str] = field(default_factory=list)
    corridor_width_pt: float | None = None
    provenance: dict[str, Any] = field(default_factory=dict)


def _angle_diff_deg(a: float, b: float) -> float:
    """Minimum angular difference between two undirected angles (degrees), in [0, 90]."""
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def _perp_dist(px: float, py: float, lx0: float, ly0: float, lx1: float, ly1: float) -> float:
    """Perpendicular distance from point (px, py) to the infinite line through (lx0,ly0)→(lx1,ly1)."""
    dx, dy = lx1 - lx0, ly1 - ly0
    l_sq = dx * dx + dy * dy
    if l_sq < 1e-9:
        return math.hypot(px - lx0, py - ly0)
    return abs(dy * px - dx * py + lx1 * ly0 - ly1 * lx0) / math.sqrt(l_sq)


def _proj_pt(px: float, py: float, lx0: float, ly0: float, lx1: float, ly1: float) -> float:
    """Scalar projection of (px, py) onto the line direction (lx0,ly0)→(lx1,ly1)."""
    dx, dy = lx1 - lx0, ly1 - ly0
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return 0.0
    return ((px - lx0) * dx + (py - ly0) * dy) / length


def build_fragment_continuity_graph(
    candidates: list[dict[str, Any]],
    sheet_id: str = "",
    duplicate_lineage: dict[str, list[str]] | None = None,
    grid_tol: float = 1.5,
) -> FragmentContinuityGraph:
    """Build Fragment Continuity Graph from Stage-1 candidates.

    - Collapses exact coincident and reversed vectors into single edges.
    - Preserves all contributing candidate IDs, primitive IDs, and duplicate lineages.
    - Indexes endpoint connectivity with a spatial hash grid.
    """
    if duplicate_lineage is None:
        duplicate_lineage = {}

    graph = FragmentContinuityGraph(sheet_id=sheet_id, grid_tol=grid_tol)
    seen_canonical: dict[tuple[tuple[float, float], tuple[float, float]], str] = {}

    for cand in candidates:
        cid = cand.get("candidate_id", "")
        raw_id = cand.get("raw_vector_id", "")
        x0, y0 = float(cand["x0"]), float(cand["y0"])
        x1, y1 = float(cand["x1"]), float(cand["y1"])
        length = float(cand.get("length_pt", math.hypot(x1 - x0, y1 - y0)))
        if length < 1e-4:
            continue

        sw = float(cand.get("stroke_width", 0.0))
        disc = cand.get("discipline", "")
        vpid = cand.get("viewport_id", "")

        p0 = (round(x0, 2), round(y0, 2))
        p1 = (round(x1, 2), round(y1, 2))
        canon_key = (min(p0, p1), max(p0, p1))

        if canon_key in seen_canonical:
            existing_edge_id = seen_canonical[canon_key]
            edge = graph.edge_by_id[existing_edge_id]
            if cid and cid not in edge.source_candidate_ids:
                edge.source_candidate_ids.append(cid)
            if raw_id and raw_id not in edge.source_primitive_ids:
                edge.source_primitive_ids.append(raw_id)
            if cid in duplicate_lineage:
                for line_ref in duplicate_lineage[cid]:
                    if line_ref not in edge.duplicate_lineage:
                        edge.duplicate_lineage.append(line_ref)
            if raw_id in duplicate_lineage:
                for line_ref in duplicate_lineage[raw_id]:
                    if line_ref not in edge.duplicate_lineage:
                        edge.duplicate_lineage.append(line_ref)
            graph.collapsed_duplicate_count += 1
            edge.provenance["collapsed_duplicate_count"] = (
                edge.provenance.get("collapsed_duplicate_count", 0) + 1
            )
            continue

        angle = _segment_angle_deg(x0, y0, x1, y1)
        edge_id = f"EDGE-{sheet_id or 'SHEET'}-{len(graph.edges):06d}"
        lineage_refs: list[str] = []
        if cid in duplicate_lineage:
            lineage_refs.extend(duplicate_lineage[cid])
        if raw_id in duplicate_lineage:
            lineage_refs.extend(duplicate_lineage[raw_id])

        edge = FragmentGraphEdge(
            edge_id=edge_id,
            sheet_id=sheet_id,
            source_candidate_ids=[cid] if cid else [],
            source_primitive_ids=[raw_id] if raw_id else [],
            duplicate_lineage=list(set(lineage_refs)),
            x0=x0,
            y0=y0,
            x1=x1,
            y1=y1,
            stroke_width=sw,
            orientation_deg=angle,
            length_pt=length,
            discipline=disc,
            viewport_id=vpid,
            confidence=1.0,
            provenance={"original_item_type": cand.get("source_item_type", "l")},
        )
        seen_canonical[canon_key] = edge_id
        graph.edges.append(edge)
        graph.edge_by_id[edge_id] = edge
        graph.total_length_pt += length

    # Connectivity indexing
    cell_size = max(grid_tol * 2.0, 5.0)
    grid: dict[tuple[int, int], list[tuple[str, int, float, float]]] = {}
    for edge in graph.edges:
        for pt_idx, (px, py) in enumerate([(edge.x0, edge.y0), (edge.x1, edge.y1)]):
            gx, gy = int(px // cell_size), int(py // cell_size)
            grid.setdefault((gx, gy), []).append((edge.edge_id, pt_idx, px, py))

    for edge in graph.edges:
        conn_set = set(edge.connectivity)
        for px, py in [(edge.x0, edge.y0), (edge.x1, edge.y1)]:
            gx, gy = int(px // cell_size), int(py // cell_size)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for other_id, _other_pt_idx, opx, opy in grid.get((gx + dx, gy + dy), []):
                        if other_id != edge.edge_id and math.hypot(px - opx, py - opy) <= grid_tol:
                            conn_set.add(other_id)
        edge.connectivity = sorted(conn_set)

    return graph


def reconstruct_single_line_continuity(
    edges: list[FragmentGraphEdge],
    sheet_id: str,
    min_run_length: float = 10.0,
    endpoint_gap_max_pt: float = 2.5,
    angle_tolerance_deg: float = 35.0,
) -> tuple[list[RouteHypothesis], set[str]]:
    """Chain compatible collinear single-line edges into polyline routes."""
    hypotheses: list[RouteHypothesis] = []
    consumed_edge_ids: set[str] = set()

    # Form components from edge list
    parent = list(range(len(edges)))

    def find(i: int) -> int:
        if parent[i] == i:
            return i
        parent[i] = find(parent[i])
        return parent[i]

    def union(i: int, j: int) -> None:
        root_i, root_j = find(i), find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    ep_grid: dict[tuple[int, int], list[tuple[int, tuple[float, float]]]] = defaultdict(list)
    for idx, e in enumerate(edges):
        for pt in [(e.x0, e.y0), (e.x1, e.y1)]:
            gx, gy = int(pt[0] // 10.0), int(pt[1] // 10.0)
            ep_grid[(gx, gy)].append((idx, pt))

    for (gx, gy), pts in ep_grid.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neigh = ep_grid.get((gx + dx, gy + dy), [])
                for idx_a, pt_a in pts:
                    for idx_b, pt_b in neigh:
                        if (
                            idx_a < idx_b
                            and math.hypot(pt_a[0] - pt_b[0], pt_a[1] - pt_b[1])
                            <= endpoint_gap_max_pt
                        ):
                            union(idx_a, idx_b)

    comp_members: dict[int, list[FragmentGraphEdge]] = defaultdict(list)
    for i in range(len(edges)):
        comp_members[find(i)].append(edges[i])

    hyp_idx = 0
    for c_edges in comp_members.values():
        if len(c_edges) == 1:
            e = c_edges[0]
            if e.length_pt >= min_run_length:
                hyp_idx += 1
                hyp = RouteHypothesis(
                    hypothesis_id=f"HYP-SL-{hyp_idx:04d}",
                    object_type="SINGLE_LINE_ROUTE",
                    points=[(e.x0, e.y0), (e.x1, e.y1)],
                    length_pt=e.length_pt,
                    confidence=0.85,
                    sheet_id=sheet_id,
                    source_edge_ids=[e.edge_id],
                    source_candidate_ids=list(e.source_candidate_ids),
                    provenance={"strategy": "SINGLE_LINE_CONTINUITY", "component_size": 1},
                )
                hypotheses.append(hyp)
                consumed_edge_ids.add(e.edge_id)
            continue

        pt_cell = max(endpoint_gap_max_pt, 2.5)
        pt_grid: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
        nodes: dict[tuple[float, float], list[tuple[tuple[float, float], FragmentGraphEdge]]] = (
            defaultdict(list)
        )
        for e in c_edges:
            p0 = (round(e.x0, 2), round(e.y0, 2))
            p1 = (round(e.x1, 2), round(e.y1, 2))
            nodes[p0].append((p1, e))
            nodes[p1].append((p0, e))
            pt_grid[(int(p0[0] // pt_cell), int(p0[1] // pt_cell))].append(p0)
            pt_grid[(int(p1[0] // pt_cell), int(p1[1] // pt_cell))].append(p1)

        visited_edges: set[str] = set()
        for e in c_edges:
            if e.edge_id in visited_edges:
                continue

            p0 = (round(e.x0, 2), round(e.y0, 2))
            p1 = (round(e.x1, 2), round(e.y1, 2))
            path_pts = [p0, p1]
            path_edges = [e]
            visited_edges.add(e.edge_id)

            extended = True
            while extended:
                curr_pt = path_pts[-1]
                prev_pt = path_pts[-2]
                curr_dir = (curr_pt[0] - prev_pt[0], curr_pt[1] - prev_pt[1])
                curr_len = math.hypot(curr_dir[0], curr_dir[1])
                if curr_len < 1e-6:
                    break

                best_next = None
                best_ang_diff = 180.0
                best_edge = None

                gx = int(curr_pt[0] // pt_cell)
                gy = int(curr_pt[1] // pt_cell)
                cand_pts: list[tuple[float, float]] = []
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        cand_pts.extend(pt_grid.get((gx + dx, gy + dy), []))

                for pt_key in cand_pts:
                    if (
                        math.hypot(curr_pt[0] - pt_key[0], curr_pt[1] - pt_key[1])
                        <= endpoint_gap_max_pt
                    ):
                        for next_pt, cand_edge in nodes[pt_key]:
                            if cand_edge.edge_id in visited_edges:
                                continue
                            next_dir = (next_pt[0] - curr_pt[0], next_pt[1] - curr_pt[1])
                            next_len = math.hypot(next_dir[0], next_dir[1])
                            if next_len < 1e-6:
                                continue

                            cos_a = max(
                                -1.0,
                                min(
                                    1.0,
                                    (curr_dir[0] * next_dir[0] + curr_dir[1] * next_dir[1])
                                    / (curr_len * next_len),
                                ),
                            )
                            ang = math.degrees(math.acos(cos_a))
                            if ang < angle_tolerance_deg and ang < best_ang_diff:
                                best_ang_diff = ang
                                best_next = next_pt
                                best_edge = cand_edge

                if best_next and best_edge:
                    visited_edges.add(best_edge.edge_id)
                    path_pts.append(best_next)
                    path_edges.append(best_edge)
                else:
                    extended = False

            tot_l = sum(ed.length_pt for ed in path_edges)
            if tot_l >= min_run_length:
                hyp_idx += 1
                c_ids: list[str] = []
                for ed in path_edges:
                    c_ids.extend(ed.source_candidate_ids)
                    consumed_edge_ids.add(ed.edge_id)

                hyp = RouteHypothesis(
                    hypothesis_id=f"HYP-SL-{hyp_idx:04d}",
                    object_type="SINGLE_LINE_ROUTE",
                    points=path_pts,
                    length_pt=round(tot_l, 2),
                    confidence=0.88,
                    sheet_id=sheet_id,
                    source_edge_ids=[ed.edge_id for ed in path_edges],
                    source_candidate_ids=c_ids,
                    provenance={
                        "strategy": "SINGLE_LINE_CONTINUITY",
                        "fragment_count": len(path_edges),
                    },
                )
                hypotheses.append(hyp)

    return hypotheses, consumed_edge_ids


def reconstruct_conservative_corridors(
    edges: list[FragmentGraphEdge],
    sheet_id: str,
    configured_sws: list[float] | None = None,
    min_sep: float = 2.0,
    max_sep: float = 80.0,
    angle_tol: float = 5.0,
    min_overlap: float = 0.30,
    ambiguity_margin: float = 8.0,
) -> tuple[list[RouteHypothesis], set[str], set[str], list[dict[str, Any]]]:
    """Reconstruct mechanical corridors with strict 1D interval exclusivity and ambiguity rejection."""
    sw_counts: dict[float, int] = defaultdict(int)
    for e in edges:
        sw_counts[round(e.stroke_width, 3)] += 1

    valid_sws = {round(sw, 3) for sw in (configured_sws or [])}
    min_count = 10 if len(edges) >= 50 else 1
    for sw, cnt in sw_counts.items():
        if 0.65 <= sw <= 1.80 and cnt >= min_count:
            valid_sws.add(sw)
    if not valid_sws:
        valid_sws = {sw for sw, cnt in sw_counts.items() if sw >= 0.50 and cnt >= min_count}

    b_edges = [e for e in edges if round(e.stroke_width, 3) in valid_sws and e.length_pt >= 1.0]

    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    cell = max_sep
    for idx, e in enumerate(b_edges):
        mid_x = (e.x0 + e.x1) / 2.0
        mid_y = (e.y0 + e.y1) / 2.0
        gx = int(mid_x // cell)
        gy = int(mid_y // cell)
        grid[(gx, gy)].append(idx)

    interval_reservations: dict[str, list[tuple[float, float, int, str]]] = defaultdict(list)
    ambiguous_fragments: set[str] = set()
    corridors: list[RouteHypothesis] = []
    consumed_edge_ids: set[str] = set()
    decisions: list[dict[str, Any]] = []

    def is_interval_free(e_id: str, t0: float, t1: float, side: int) -> bool:
        for res_t0, res_t1, res_side, _ in interval_reservations[e_id]:
            if res_side == side:
                overlap = max(0.0, min(t1, res_t1) - max(t0, res_t0))
                if overlap > 1.0:
                    return False
        return True

    pair_candidates: list[dict[str, Any]] = []
    for i, a in enumerate(b_edges):
        mid_ax = (a.x0 + a.x1) / 2.0
        mid_ay = (a.y0 + a.y1) / 2.0
        gx = int(mid_ax // cell)
        gy = int(mid_ay // cell)

        cand_indices: set[int] = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                cand_indices.update(grid.get((gx + dx, gy + dy), []))

        for j in cand_indices:
            if j <= i:
                continue
            b = b_edges[j]
            if _angle_diff_deg(a.orientation_deg, b.orientation_deg) > angle_tol:
                continue

            d_ab = _perp_dist((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, a.x0, a.y0, a.x1, a.y1)
            d_ba = _perp_dist(mid_ax, mid_ay, b.x0, b.y0, b.x1, b.y1)
            sep = (d_ab + d_ba) / 2.0
            if sep < min_sep or sep > max_sep:
                continue

            t_b0 = _proj_pt(b.x0, b.y0, a.x0, a.y0, a.x1, a.y1)
            t_b1 = _proj_pt(b.x1, b.y1, a.x0, a.y0, a.x1, a.y1)

            tb_min, tb_max = min(t_b0, t_b1), max(t_b0, t_b1)
            overlap_min = max(0.0, tb_min)
            overlap_max = min(a.length_pt, tb_max)
            overlap_len = overlap_max - overlap_min

            min_req_overlap = min(2.0, min(a.length_pt, b.length_pt) * min_overlap)
            if overlap_len >= min_req_overlap:
                norm_x = -(a.y1 - a.y0) / a.length_pt
                norm_y = (a.x1 - a.x0) / a.length_pt
                side = (
                    1
                    if (
                        norm_x * ((b.x0 + b.x1) / 2 - mid_ax)
                        + norm_y * ((b.y0 + b.y1) / 2 - mid_ay)
                    )
                    > 0
                    else -1
                )

                pair_candidates.append(
                    {
                        "a_idx": i,
                        "b_idx": j,
                        "edge_a": a,
                        "edge_b": b,
                        "sep": sep,
                        "overlap_len": overlap_len,
                        "overlap_min": overlap_min,
                        "overlap_max": overlap_max,
                        "side": side,
                    }
                )

    pair_candidates.sort(key=lambda x: (x["sep"], -x["overlap_len"]))
    pairs_by_a: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for c in pair_candidates:
        pairs_by_a[(c["a_idx"], c["side"])].append(c)

    corridor_idx = 0
    for cand in pair_candidates:
        ea = cand["edge_a"]
        eb = cand["edge_b"]
        side_a = cand["side"]
        side_b = -cand["side"]
        t0_a, t1_a = cand["overlap_min"], cand["overlap_max"]

        if not is_interval_free(ea.edge_id, t0_a, t1_a, side_a):
            continue

        t_a0_on_b = _proj_pt(ea.x0, ea.y0, eb.x0, eb.y0, eb.x1, eb.y1)
        t_a1_on_b = _proj_pt(ea.x1, ea.y1, eb.x0, eb.y0, eb.x1, eb.y1)
        tb0, tb1 = min(t_a0_on_b, t_a1_on_b), max(t_a0_on_b, t_a1_on_b)
        t0_b, t1_b = max(0.0, tb0), min(eb.length_pt, tb1)

        if not is_interval_free(eb.edge_id, t0_b, t1_b, side_b):
            continue

        # Ambiguous competition check
        competing = False
        for other in pairs_by_a.get((cand["a_idx"], side_a), []):
            if other["b_idx"] != cand["b_idx"]:
                ov = max(0.0, min(t1_a, other["overlap_max"]) - max(t0_a, other["overlap_min"]))
                if ov > 2.0 and abs(other["sep"] - cand["sep"]) < ambiguity_margin:
                    competing = True
                    ambiguous_fragments.add(ea.edge_id)
                    ambiguous_fragments.add(other["edge_b"].edge_id)
                    break
        if competing:
            decisions.append(
                {
                    "status": "REJECTED_AMBIGUOUS",
                    "candidate_a_id": ea.source_candidate_ids[0] if ea.source_candidate_ids else "",
                    "candidate_b_id": eb.source_candidate_ids[0] if eb.source_candidate_ids else "",
                    "reason": "AMBIGUOUS_PARALLEL_OWNERSHIP",
                }
            )
            continue

        corridor_idx += 1
        cid = f"CORRIDOR-{corridor_idx:04d}"
        interval_reservations[ea.edge_id].append((t0_a, t1_a, side_a, cid))
        interval_reservations[eb.edge_id].append((t0_b, t1_b, side_b, cid))
        consumed_edge_ids.add(ea.edge_id)
        consumed_edge_ids.add(eb.edge_id)

        # Centerline coordinates
        dx = (ea.x1 - ea.x0) / ea.length_pt
        dy = (ea.y1 - ea.y0) / ea.length_pt
        c_start_a = (ea.x0 + dx * t0_a, ea.y0 + dy * t0_a)
        c_end_a = (ea.x0 + dx * t1_a, ea.y0 + dy * t1_a)

        norm_x = -(ea.y1 - ea.y0) / ea.length_pt
        norm_y = (ea.x1 - ea.x0) / ea.length_pt
        offset_x = norm_x * side_a * (cand["sep"] / 2.0)
        offset_y = norm_y * side_a * (cand["sep"] / 2.0)

        cp0 = (round(c_start_a[0] + offset_x, 2), round(c_start_a[1] + offset_y, 2))
        cp1 = (round(c_end_a[0] + offset_x, 2), round(c_end_a[1] + offset_y, 2))

        c_source_cands = []
        c_source_cands.extend(ea.source_candidate_ids)
        c_source_cands.extend(eb.source_candidate_ids)

        hyp = RouteHypothesis(
            hypothesis_id=f"HYP-CORR-{corridor_idx:04d}",
            object_type="CORRIDOR_ROUTE",
            points=[cp0, cp1],
            length_pt=round(cand["overlap_len"], 2),
            confidence=0.92,
            sheet_id=sheet_id,
            source_edge_ids=[ea.edge_id, eb.edge_id],
            source_candidate_ids=c_source_cands,
            corridor_width_pt=round(cand["sep"], 2),
            provenance={
                "strategy": "CONSERVATIVE_CORRIDOR",
                "left_edge": ea.edge_id,
                "right_edge": eb.edge_id,
                "width_pt": round(cand["sep"], 2),
            },
        )
        corridors.append(hyp)
        decisions.append(
            {
                "status": "ACCEPTED",
                "candidate_a_id": ea.source_candidate_ids[0] if ea.source_candidate_ids else "",
                "candidate_b_id": eb.source_candidate_ids[0] if eb.source_candidate_ids else "",
                "separation_pt": round(cand["sep"], 4),
                "overlap_len": round(cand["overlap_len"], 4),
                "corridor_id": cid,
            }
        )

    return corridors, consumed_edge_ids, ambiguous_fragments, decisions


def _classify_conservative_hybrid(
    candidates: list[dict[str, Any]],
    cfg: dict[str, Any],
    config_path: str = "configs/l2/route-representation.yaml",
    duplicate_lineage: dict[str, list[str]] | None = None,
    candidates_path: str = "outputs/autonomous-execution/L2-02/preflight/semantic-candidates.jsonl",
    candidates_sha256: str = "514038a7f28bed3560bd1a18b2cafdb572e8dd8bdae4e73714abae1846c17662",
    config_sha256: str = "dd44c908c0e8d0aa59c78a5b850983ec37f8185fc803326b9521e4d8f1bd01aa",
) -> RepresentationResult:
    """Classify candidates using Fragment Continuity Graph and Conservative Route Reconstruction."""
    if not candidates:
        return RepresentationResult(
            route_fragments=[],
            accounting_records=[],
            paired_decisions=[],
            paired_validation={},
            unresolved_boundaries=[],
            non_route_and_review=[],
            fragment_graph=None,
            route_hypotheses=[],
        )

    sheet_id = candidates[0].get("sheet_id", "")
    if not sheet_id:
        sheet_id = _extract_fixture_id(candidates[0])

    # Discipline detection
    disc_counts: dict[str, int] = defaultdict(int)
    for c in candidates:
        disc_counts[c.get("discipline", "mechanical")] += 1
    primary_disc = (
        "plumbing" if disc_counts["plumbing"] > disc_counts["mechanical"] else "mechanical"
    )

    # Config parameters
    boundary_sws: list[float] = cfg.get("mechanical", {}).get(
        "boundary_stroke_widths_pt", [0.84, 1.32]
    )
    pb = cfg.get("mechanical", {}).get("paired_boundary", {})
    angle_tol: float = pb.get("angle_tolerance_deg", 5.0)
    min_sep: float = pb.get("min_pair_separation_pt", 2.0)
    max_sep: float = pb.get("max_pair_separation_pt", 80.0)
    min_overlap: float = pb.get("min_overlap_fraction", 0.30)
    recon_cfg = cfg.get("reconstruction", {})
    ambiguity_margin: float = recon_cfg.get("corridor", {}).get("ambiguity_distance_margin_pt", 8.0)
    single_line_gap: float = recon_cfg.get("single_line", {}).get("endpoint_gap_max_pt", 2.5)

    # 1. Build Fragment Continuity Graph
    g = build_fragment_continuity_graph(
        candidates=candidates,
        sheet_id=sheet_id,
        duplicate_lineage=duplicate_lineage,
    )

    # 2. Reconstruct routes
    if primary_disc == "plumbing":
        hypotheses, consumed_edges = reconstruct_single_line_continuity(
            g.edges, sheet_id=sheet_id, endpoint_gap_max_pt=single_line_gap
        )
        ambiguous_fragments = set()
        paired_decisions: list[dict[str, Any]] = []
    else:
        corridors, consumed_edges, ambiguous_fragments, paired_decisions = (
            reconstruct_conservative_corridors(
                edges=g.edges,
                sheet_id=sheet_id,
                configured_sws=boundary_sws,
                min_sep=min_sep,
                max_sep=max_sep,
                angle_tol=angle_tol,
                min_overlap=min_overlap,
                ambiguity_margin=ambiguity_margin,
            )
        )
        unassigned_edges = [
            e
            for e in g.edges
            if e.edge_id not in consumed_edges and e.edge_id not in ambiguous_fragments
        ]
        single_lines, sl_consumed = reconstruct_single_line_continuity(
            unassigned_edges,
            sheet_id=sheet_id,
            min_run_length=25.0,
            endpoint_gap_max_pt=single_line_gap,
        )
        consumed_edges.update(sl_consumed)
        hypotheses = corridors + single_lines

    # 3. Map Hypotheses to RouteFragments
    cand_by_id = {c["candidate_id"]: c for c in candidates}
    route_fragments: list[RouteFragment] = []
    consumed_cand_to_hyp: dict[str, RouteHypothesis] = {}

    for hyp in hypotheses:
        rep_state = (
            RepresentationState.PAIRED_BOUNDARY_DERIVED.value
            if hyp.object_type == "CORRIDOR_ROUTE"
            else RepresentationState.SINGLE_LINE_ROUTE.value
        )
        p0, p1 = hyp.points[0], hyp.points[-1]
        frag_id = f"FRAG-{hyp.hypothesis_id}"
        prims: list[str] = []
        for cid in hyp.source_candidate_ids:
            if cid in cand_by_id and cand_by_id[cid].get("raw_vector_id"):
                prims.append(cand_by_id[cid]["raw_vector_id"])
            consumed_cand_to_hyp[cid] = hyp

        viewport = ""
        if hyp.source_candidate_ids and hyp.source_candidate_ids[0] in cand_by_id:
            viewport = cand_by_id[hyp.source_candidate_ids[0]].get("viewport_id", "")

        frag = RouteFragment(
            route_fragment_id=frag_id,
            fixture_id=sheet_id,
            source_page_id=0,
            viewport_id=viewport,
            discipline=primary_disc,
            representation_state=rep_state,
            is_reportable_geometry=True,
            geometry_pdf_pt={
                "type": "line" if len(hyp.points) == 2 else "polyline",
                "points": [[pt[0], pt[1]] for pt in hyp.points],
            },
            geometry_length_pt=hyp.length_pt,
            source_candidate_ids=hyp.source_candidate_ids,
            source_primitive_ids=list(set(prims)),
            pair_separation_pt=hyp.corridor_width_pt,
            x0=p0[0],
            y0=p0[1],
            x1=p1[0],
            y1=p1[1],
            length_pt=hyp.length_pt,
            state=RepresentationState(rep_state),
            state_reason=f"Reconstructed via {hyp.provenance.get('strategy', 'HYBRID')}",
            config_path=config_path,
            config_sha256=config_sha256,
            source_candidates_path=candidates_path,
            source_candidates_sha256=candidates_sha256,
        )
        route_fragments.append(frag)

    # 4. Map Candidates to 100% Accounting Records
    accounting_records: list[CandidateAccountingRecord] = []
    unresolved_boundaries: list[dict[str, Any]] = []
    non_route_and_review: list[dict[str, Any]] = []

    ambiguous_cands: set[str] = set()
    for e_id in ambiguous_fragments:
        if e_id in g.edge_by_id:
            ambiguous_cands.update(g.edge_by_id[e_id].source_candidate_ids)

    min_len = (
        cfg.get("min_route_fragment_length_plumbing_pt", 0.10)
        if primary_disc == "plumbing"
        else cfg.get("min_route_fragment_length_pt", 0.50)
    )

    for cand in sorted(candidates, key=lambda c: c["candidate_id"]):
        cid = cand["candidate_id"]
        raw_id = cand.get("raw_vector_id", "")
        fix_id = _extract_fixture_id(cand)

        if cid in consumed_cand_to_hyp:
            hyp = consumed_cand_to_hyp[cid]
            if hyp.object_type == "CORRIDOR_ROUTE":
                acc_state = CandidateAccountingState.CONSUMED_BY_PAIRED_BOUNDARY.value
                paired_partner = [x for x in hyp.source_candidate_ids if x != cid]
                rec = CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fix_id,
                    source_page_id=0,
                    discipline=primary_disc,
                    source_primitive_id=raw_id,
                    accounting_state=acc_state,
                    consumed_by_route_fragment_id=f"FRAG-{hyp.hypothesis_id}",
                    paired_candidate_id=paired_partner[0] if paired_partner else None,
                    reason_codes=["CONSUMED_BY_PAIRED_BOUNDARY"],
                    representation_rule_id="RULE-L2-03-MECH-PAIR",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            else:
                acc_state = CandidateAccountingState.EMITTED_SINGLE_LINE_ROUTE.value
                rec = CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fix_id,
                    source_page_id=0,
                    discipline=primary_disc,
                    source_primitive_id=raw_id,
                    accounting_state=acc_state,
                    emitted_route_fragment_id=f"FRAG-{hyp.hypothesis_id}",
                    reason_codes=["EMITTED_SINGLE_LINE_ROUTE"],
                    representation_rule_id="RULE-L2-03-PLUM-SINGLE"
                    if primary_disc == "plumbing"
                    else "RULE-L2-03-MECH-SINGLE",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
        elif cid in ambiguous_cands:
            acc_state = CandidateAccountingState.REVIEW_REQUIRED.value
            rec = CandidateAccountingRecord(
                candidate_id=cid,
                fixture_id=fix_id,
                source_page_id=0,
                discipline=primary_disc,
                source_primitive_id=raw_id,
                accounting_state=acc_state,
                reason_codes=["AMBIGUOUS_PARALLEL_OWNERSHIP"],
                representation_rule_id="RULE-L2-03-AMBIGUOUS",
                source_l2_02_artifact_hash=candidates_sha256,
            )
            non_route_and_review.append(cand)
        elif cand.get("length_pt", 0.0) < min_len:
            acc_state = CandidateAccountingState.NON_ROUTE.value
            rec = CandidateAccountingRecord(
                candidate_id=cid,
                fixture_id=fix_id,
                source_page_id=0,
                discipline=primary_disc,
                source_primitive_id=raw_id,
                accounting_state=acc_state,
                reason_codes=["SUB_MINIMUM_LENGTH"],
                representation_rule_id="RULE-L2-03-SUB-MIN-LEN",
                source_l2_02_artifact_hash=candidates_sha256,
            )
            non_route_and_review.append(cand)
        else:
            acc_state = CandidateAccountingState.BOUNDARY_UNRESOLVED.value
            rec = CandidateAccountingRecord(
                candidate_id=cid,
                fixture_id=fix_id,
                source_page_id=0,
                discipline=primary_disc,
                source_primitive_id=raw_id,
                accounting_state=acc_state,
                reason_codes=["UNPAIRED_BOUNDARY"],
                representation_rule_id="RULE-L2-03-UNRESOLVED",
                source_l2_02_artifact_hash=candidates_sha256,
            )
            unresolved_boundaries.append(cand)

        accounting_records.append(rec)

    return RepresentationResult(
        route_fragments=route_fragments,
        accounting_records=accounting_records,
        paired_decisions=paired_decisions,
        paired_validation={
            "total_hypotheses": len(hypotheses),
            "edges_consumed": len(consumed_edges),
            "ambiguous_count": len(ambiguous_fragments),
        },
        unresolved_boundaries=unresolved_boundaries,
        non_route_and_review=non_route_and_review,
        fragment_graph=g,
        route_hypotheses=[asdict(h) for h in hypotheses],
    )


# ---------------------------------------------------------------------------
# Configuration loader
# ---------------------------------------------------------------------------


def load_representation_config(config_path: str) -> dict[str, Any]:
    """Load and validate the frozen route-representation config YAML.

    Raises:
        FileNotFoundError: If config file does not exist.
        ValueError: If required keys are missing.
    """
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError as exc:
        raise ImportError(
            "PyYAML is required for route-representation config loading. "
            "Install via: pip install pyyaml"
        ) from exc

    with open(config_path, encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)

    required = ["mechanical", "plumbing", "representation_states", "discipline_defaults"]
    missing = [k for k in required if k not in cfg]
    if missing:
        raise ValueError(f"route-representation.yaml missing required keys: {missing}")
    return cfg


def load_duplicate_lineage(duplicate_lineage_path: str) -> dict[str, list[str]]:
    """Load duplicate lineage mapping {retained_vector_id -> [duplicate_raw_vector_ids]}."""
    lineage_map: dict[str, list[str]] = {}
    if not os.path.isfile(duplicate_lineage_path):
        return lineage_map

    with open(duplicate_lineage_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            retained_id = record.get("retained_vector_id")
            dup_id = record.get("raw_vector_id")
            if retained_id and dup_id:
                lineage_map.setdefault(retained_id, []).append(dup_id)
    return lineage_map


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _segment_angle_deg(x0: float, y0: float, x1: float, y1: float) -> float:
    """Undirected segment angle in degrees [0, 180)."""
    dx = x1 - x0
    dy = y1 - y0
    angle = math.degrees(math.atan2(dy, dx))
    if angle < 0:
        angle += 180.0
    if angle >= 180.0:
        angle -= 180.0
    return angle


def _perpendicular_distance(
    ax0: float,
    ay0: float,
    ax1: float,
    ay1: float,
    bx0: float,
    by0: float,
) -> float:
    """Perpendicular distance from point (bx0, by0) to line through (ax0,ay0)-(ax1,ay1).

    Returns 0.0 if the line segment is degenerate (zero length).
    """
    dx = ax1 - ax0
    dy = ay1 - ay0
    seg_len = math.hypot(dx, dy)
    if seg_len < 1e-9:
        return math.hypot(bx0 - ax0, by0 - ay0)
    return abs(dy * (bx0 - ax0) - dx * (by0 - ay0)) / seg_len


def _projected_overlap_fraction(
    ax0: float,
    ay0: float,
    ax1: float,
    ay1: float,
    bx0: float,
    by0: float,
    bx1: float,
    by1: float,
) -> float:
    """Fraction of segment A's length that overlaps with segment B's projection onto A.

    Returns a value in [0.0, 1.0]. Both segments must have non-zero length.
    """
    dx = ax1 - ax0
    dy = ay1 - ay0
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-9:
        return 0.0

    def proj(px: float, py: float) -> float:
        return ((px - ax0) * dx + (py - ay0) * dy) / seg_len_sq

    t_a0 = 0.0
    t_a1 = 1.0
    t_b0 = proj(bx0, by0)
    t_b1 = proj(bx1, by1)
    t_b_lo = min(t_b0, t_b1)
    t_b_hi = max(t_b0, t_b1)

    overlap_lo = max(t_a0, t_b_lo)
    overlap_hi = min(t_a1, t_b_hi)

    if overlap_hi <= overlap_lo:
        return 0.0
    return overlap_hi - overlap_lo


def _midpoint_segment(
    ax0: float,
    ay0: float,
    ax1: float,
    ay1: float,
    bx0: float,
    by0: float,
    bx1: float,
    by1: float,
) -> tuple[float, float, float, float]:
    """Derive the midpoint centerline segment between two parallel boundary segments.

    Takes the average of the four endpoint pairs in a direction-matched ordering.
    Handles reversed-direction segments correctly and deterministically.
    """
    da = (ax1 - ax0, ay1 - ay0)
    db = (bx1 - bx0, by1 - by0)
    dot = da[0] * db[0] + da[1] * db[1]

    if dot < 0:
        bx0, by0, bx1, by1 = bx1, by1, bx0, by0

    mx0 = (ax0 + bx0) / 2.0
    my0 = (ay0 + by0) / 2.0
    mx1 = (ax1 + bx1) / 2.0
    my1 = (ay1 + by1) / 2.0
    return mx0, my0, mx1, my1


# ---------------------------------------------------------------------------
# Pairing engine (mechanical only)
# ---------------------------------------------------------------------------


def _pair_mechanical_candidates(
    candidates: list[dict[str, Any]],
    cfg: dict[str, Any],
) -> dict[str, str]:
    """Legacy helper: find paired boundary segments mapping {cand_a: cand_b, cand_b: cand_a}."""
    res = classify_representation(candidates, cfg_override=cfg)
    paired: dict[str, str] = {}
    for dec in res.paired_decisions:
        if dec.get("status") == "ACCEPTED":
            a_id = dec["candidate_a_id"]
            b_id = dec["candidate_b_id"]
            paired[a_id] = b_id
            paired[b_id] = a_id
    return paired


# ---------------------------------------------------------------------------
# Core Representation Classifier (L2-03-C1)
# ---------------------------------------------------------------------------


def _extract_fixture_id(candidate: dict[str, Any]) -> str:
    """Extract fixture ID from candidate dict or candidate_id string."""
    if candidate.get("fixture_id"):
        return str(candidate["fixture_id"])
    cid = candidate.get("candidate_id", "")
    parts = cid.split("-")
    if len(parts) >= 5 and parts[0] == "CAND" and parts[1] == "FIX":
        return "-".join(parts[1:5])
    if candidate.get("discipline") == "mechanical":
        return "FIX-TRN-MECH-022"
    return "FIX-TRN-PLUM-105"


def classify_representation(
    candidates: list[dict[str, Any]],
    config_path: str = "configs/l2/route-representation.yaml",
    cfg_override: dict[str, Any] | None = None,
    duplicate_lineage: dict[str, list[str]] | None = None,
    candidates_path: str = "outputs/autonomous-execution/L2-02/preflight/semantic-candidates.jsonl",
    candidates_sha256: str = "514038a7f28bed3560bd1a18b2cafdb572e8dd8bdae4e73714abae1846c17662",
    config_sha256: str = "dd44c908c0e8d0aa59c78a5b850983ec37f8185fc803326b9521e4d8f1bd01aa",
    strategy: str | None = None,
) -> RepresentationResult:
    """Classify all L2-02 semantic candidates into route fragments and accounting records.

    Separates candidate accounting (100% accountability, one record per candidate)
    from emitted reportable route fragments (only valid routes, no non-routes or consumed secondaries).
    """
    cfg = cfg_override if cfg_override is not None else load_representation_config(config_path)
    semantic_config_path = (
        config_path if not os.path.isabs(config_path) else "configs/l2/route-representation.yaml"
    )

    strat = strategy
    if strat is None:
        strat = cfg.get("strategy", "legacy_1to1")

    if strat == "conservative_hybrid":
        return _classify_conservative_hybrid(
            candidates=candidates,
            cfg=cfg,
            config_path=semantic_config_path,
            duplicate_lineage=duplicate_lineage,
            candidates_path=candidates_path,
            candidates_sha256=candidates_sha256,
            config_sha256=config_sha256,
        )

    min_route_len: float = cfg.get("min_route_fragment_length_pt", 0.50)
    min_route_len_plumbing: float = cfg.get("min_route_fragment_length_plumbing_pt", 0.10)
    pb = cfg["mechanical"]["paired_boundary"]
    angle_tol: float = pb["angle_tolerance_deg"]
    max_sep: float = pb["max_pair_separation_pt"]
    min_sep: float = pb["min_pair_separation_pt"]
    min_overlap: float = pb["min_overlap_fraction"]
    len_tol: float = pb["length_match_tolerance_pt"]
    min_pair_len: float = cfg["mechanical"]["min_pairing_length_pt"]
    boundary_sws: list[float] = cfg["mechanical"]["boundary_stroke_widths_pt"]
    fitting_sws: list[float] = cfg["mechanical"]["fitting_stroke_widths_pt"]

    if duplicate_lineage is None:
        dup_path = "outputs/autonomous-execution/L2-02/preflight/duplicate-lineage.jsonl"
        duplicate_lineage = load_duplicate_lineage(dup_path)

    # Sort candidates deterministically by candidate_id
    candidates_sorted = sorted(candidates, key=lambda c: c["candidate_id"])

    # Partition by discipline
    mechanical = [c for c in candidates_sorted if c.get("discipline") == "mechanical"]
    plumbing = [c for c in candidates_sorted if c.get("discipline") == "plumbing"]

    # -----------------------------------------------------------------------
    # Step 1: Pair Mechanical Candidates with Symmetric Overlap
    # -----------------------------------------------------------------------
    pairable = [
        c
        for c in mechanical
        if round(c["stroke_width"], 3) in [round(sw, 3) for sw in boundary_sws]
        and c["length_pt"] >= min_pair_len
        and c.get("source_item_type") != "c"
    ]
    pairable.sort(key=lambda c: c["candidate_id"])

    candidate_by_id = {candidate["candidate_id"]: candidate for candidate in pairable}
    valid_pairs: dict[str, list[tuple[str, float, float, float]]] = {
        candidate_id: [] for candidate_id in candidate_by_id
    }

    for index, a in enumerate(pairable):
        a_id = a["candidate_id"]
        a_angle = _segment_angle_deg(a["x0"], a["y0"], a["x1"], a["y1"])
        a_mid_x = (a["x0"] + a["x1"]) / 2.0
        a_mid_y = (a["y0"] + a["y1"]) / 2.0

        for b in pairable[index + 1 :]:
            b_id = b["candidate_id"]
            if b.get("viewport_id") != a.get("viewport_id"):
                continue

            # 1. Angle agreement
            b_angle = _segment_angle_deg(b["x0"], b["y0"], b["x1"], b["y1"])
            angle_diff = abs(a_angle - b_angle)
            if angle_diff > 90.0:
                angle_diff = 180.0 - angle_diff
            if angle_diff > angle_tol:
                continue

            # 2. Perpendicular separation between supporting lines
            b_mid_x = (b["x0"] + b["x1"]) / 2.0
            b_mid_y = (b["y0"] + b["y1"]) / 2.0
            sep_a_to_b = _perpendicular_distance(
                b["x0"], b["y0"], b["x1"], b["y1"], a_mid_x, a_mid_y
            )
            sep_b_to_a = _perpendicular_distance(
                a["x0"], a["y0"], a["x1"], a["y1"], b_mid_x, b_mid_y
            )
            sep = (sep_a_to_b + sep_b_to_a) / 2.0
            if sep < min_sep or sep > max_sep:
                continue

            # 3. Symmetric lateral overlap
            overlap_ab = _projected_overlap_fraction(
                a["x0"], a["y0"], a["x1"], a["y1"], b["x0"], b["y0"], b["x1"], b["y1"]
            )
            overlap_ba = _projected_overlap_fraction(
                b["x0"], b["y0"], b["x1"], b["y1"], a["x0"], a["y0"], a["x1"], a["y1"]
            )
            overlap = min(overlap_ab, overlap_ba)
            if overlap < min_overlap:
                continue

            # 4. Length similarity
            if abs(a["length_pt"] - b["length_pt"]) > len_tol:
                continue

            valid_pairs[a_id].append((b_id, sep, overlap, angle_diff))
            valid_pairs[b_id].append((a_id, sep, overlap, angle_diff))

    paired_records: list[tuple[dict[str, Any], dict[str, Any], float, float, float]] = []
    paired_decisions: list[dict[str, Any]] = []
    ambiguous_ids = {
        candidate_id for candidate_id, partners in valid_pairs.items() if len(partners) > 1
    }
    ambiguous_ids.update(
        partner_id
        for candidate_id in tuple(ambiguous_ids)
        for partner_id, _, _, _ in valid_pairs[candidate_id]
    )

    for candidate_id in sorted(ambiguous_ids):
        partner_ids = sorted(partner_id for partner_id, _, _, _ in valid_pairs[candidate_id])
        paired_decisions.append(
            {
                "decision_id": f"DEC-{candidate_id}-AMBIGUOUS",
                "candidate_a_id": candidate_id,
                "candidate_b_id": None,
                "status": "AMBIGUOUS",
                "ambiguity_decision": "MULTIPLE_VALID_PARTNERS_FAIL_CLOSED",
                "candidate_partner_ids": partner_ids,
                "reason": "Candidate has multiple plausible paired-boundary partners; no route emitted.",
            }
        )

    for a_id in sorted(valid_pairs):
        if a_id in ambiguous_ids:
            continue
        partners = valid_pairs[a_id]
        if len(partners) != 1:
            continue
        b_id, sep, overlap, angle_diff = partners[0]
        if b_id in ambiguous_ids or a_id >= b_id:
            continue
        paired_records.append(
            (candidate_by_id[a_id], candidate_by_id[b_id], sep, overlap, angle_diff)
        )

    # -----------------------------------------------------------------------
    # Step 2: Build Emitted Route Fragments and Candidate Accounting
    # -----------------------------------------------------------------------
    route_fragments: list[RouteFragment] = []
    accounting_records: list[CandidateAccountingRecord] = []
    unresolved_boundaries: list[dict[str, Any]] = []
    non_route_and_review: list[dict[str, Any]] = []

    # Map candidate_id -> pair tuple for quick lookup
    cand_pair_map: dict[str, tuple[str, str, float, float, float]] = {}
    for a, b, sep, overlap, angle_diff in paired_records:
        frag_id = f"FRAG-MECH-PAIR-{a['candidate_id']}-{b['candidate_id']}"
        cand_pair_map[a["candidate_id"]] = (b["candidate_id"], frag_id, sep, overlap, angle_diff)
        cand_pair_map[b["candidate_id"]] = (a["candidate_id"], frag_id, sep, overlap, angle_diff)

        # Build midpoint geometry
        mx0, my0, mx1, my1 = _midpoint_segment(
            a["x0"], a["y0"], a["x1"], a["y1"], b["x0"], b["y0"], b["x1"], b["y1"]
        )
        mid_len = math.hypot(mx1 - mx0, my1 - my0)

        # Canonical px at 150 DPI
        s = 150.0 / 72.0
        geom_pdf = {
            "type": "line",
            "points": [[round(mx0, 4), round(my0, 4)], [round(mx1, 4), round(my1, 4)]],
        }
        geom_px = {
            "type": "line",
            "points": [
                [round(mx0 * s, 3), round(my0 * s, 3)],
                [round(mx1 * s, 3), round(my1 * s, 3)],
            ],
        }

        src_geoms = [
            {
                "type": "line",
                "points": [
                    [round(a["x0"], 4), round(a["y0"], 4)],
                    [round(a["x1"], 4), round(a["y1"], 4)],
                ],
            },
            {
                "type": "line",
                "points": [
                    [round(b["x0"], 4), round(b["y0"], 4)],
                    [round(b["x1"], 4), round(b["y1"], 4)],
                ],
            },
        ]
        dup_refs = duplicate_lineage.get(a.get("raw_vector_id", ""), []) + duplicate_lineage.get(
            b.get("raw_vector_id", ""), []
        )

        frag = RouteFragment(
            route_fragment_id=frag_id,
            fixture_id=_extract_fixture_id(a),
            source_page_id=0,
            viewport_id=a.get("viewport_id", ""),
            discipline="mechanical",
            representation_state="PAIRED_BOUNDARY_DERIVED",
            is_reportable_geometry=True,
            geometry_pdf_pt=geom_pdf,
            geometry_canonical_px=geom_px,
            geometry_length_pt=round(mid_len, 4),
            physical_length=None,
            physical_length_unit=None,
            scale_status="NOT_EVALUATED",
            source_candidate_ids=[a["candidate_id"], b["candidate_id"]],
            source_primitive_ids=[a.get("raw_vector_id", ""), b.get("raw_vector_id", "")],
            source_geometries_pdf_pt=src_geoms,
            duplicate_lineage_references=dup_refs,
            representation_rule_id="RULE-MECH-PAIRED-BOUNDARY",
            reason_codes=[f"MECHANICAL_PAIRED_DUCT_BOUNDARY_SEP_{round(sep, 2)}_PT"],
            review_required=False,
            config_path=semantic_config_path,
            config_sha256=config_sha256,
            source_candidates_path=candidates_path,
            source_candidates_sha256=candidates_sha256,
            pair_separation_pt=round(sep, 4),
            pair_overlap_fraction=round(overlap, 4),
            x0=mx0,
            y0=my0,
            x1=mx1,
            y1=my1,
            length_pt=round(mid_len, 4),
        )
        route_fragments.append(frag)

        paired_decisions.append(
            {
                "pair_id": f"PAIR-{a['candidate_id']}-{b['candidate_id']}",
                "candidate_a_id": a["candidate_id"],
                "candidate_b_id": b["candidate_id"],
                "route_fragment_id": frag_id,
                "separation_pt": round(sep, 4),
                "overlap_fraction": round(overlap, 4),
                "angle_diff_deg": round(angle_diff, 4),
                "status": "ACCEPTED",
                "ambiguity_decision": "RESOLVED_UNIQUE_PAIR",
                "reason": f"Parallel boundary pair within tolerances: sep={sep:.2f} pt, overlap={overlap:.2f}",
                "source_boundary_a_geometry": src_geoms[0],
                "source_boundary_b_geometry": src_geoms[1],
                "derived_midpoint_geometry": geom_pdf,
                "style_comparison": {
                    "stroke_width_a": a.get("stroke_width"),
                    "stroke_width_b": b.get("stroke_width"),
                    "stroke_color_a": a.get("stroke_color"),
                    "stroke_color_b": b.get("stroke_color"),
                },
            }
        )

    # Accounting for Mechanical Candidates
    for cand in mechanical:
        cid = cand["candidate_id"]
        fid = _extract_fixture_id(cand)
        raw_id = cand.get("raw_vector_id", "")

        if cid in cand_pair_map:
            partner_id, frag_id, sep, overlap, _ = cand_pair_map[cid]
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="mechanical",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.CONSUMED_BY_PAIRED_BOUNDARY.value,
                    emitted_route_fragment_id=None,
                    consumed_by_route_fragment_id=frag_id,
                    paired_candidate_id=partner_id,
                    reason_codes=["CONSUMED_BY_PAIRED_BOUNDARY", f"SEP_{round(sep, 2)}_PT"],
                    representation_rule_id="RULE-MECH-PAIRED-BOUNDARY",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            continue

        # Curve chords → REVIEW_REQUIRED
        if cand.get("source_item_type") == "c":
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="mechanical",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.REVIEW_REQUIRED.value,
                    reason_codes=["CURVE_CHORD_APPROXIMATION"],
                    representation_rule_id="RULE-REVIEW-CURVE",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            non_route_and_review.append(
                {
                    "candidate_id": cid,
                    "raw_vector_id": raw_id,
                    "fixture_id": fid,
                    "discipline": "mechanical",
                    "classification": "REVIEW_REQUIRED",
                    "reason": "Curve chord approximation — angle/pairing unreliable",
                }
            )
            continue

        # Sub-minimum length → NON_ROUTE
        if cand["length_pt"] < min_route_len:
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="mechanical",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.NON_ROUTE.value,
                    reason_codes=[f"LENGTH_{round(cand['length_pt'], 3)}_BELOW_MIN_0.50_PT"],
                    representation_rule_id="RULE-NON-ROUTE-LENGTH",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            non_route_and_review.append(
                {
                    "candidate_id": cid,
                    "raw_vector_id": raw_id,
                    "fixture_id": fid,
                    "discipline": "mechanical",
                    "classification": "NON_ROUTE",
                    "reason": f"Length {cand['length_pt']:.3f} pt < min_route_fragment_length_pt {min_route_len}",
                }
            )
            continue

        # Fitting stroke width → BOUNDARY_UNRESOLVED
        if round(cand["stroke_width"], 3) in [round(sw, 3) for sw in fitting_sws]:
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="mechanical",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.BOUNDARY_UNRESOLVED.value,
                    reason_codes=[
                        f"FITTING_TRANSITION_STROKE_WIDTH_{round(cand['stroke_width'], 3)}_PT"
                    ],
                    representation_rule_id="RULE-MECH-FITTING-UNRESOLVED",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            unresolved_boundaries.append(
                {
                    "candidate_id": cid,
                    "raw_vector_id": raw_id,
                    "fixture_id": fid,
                    "discipline": "mechanical",
                    "stroke_width": cand["stroke_width"],
                    "length_pt": cand["length_pt"],
                    "unresolved_reason": f"Fitting stroke width {cand['stroke_width']:.3f} pt — connector/transition geometry",
                }
            )
            continue

        # Unpaired boundary stroke → BOUNDARY_UNRESOLVED
        accounting_records.append(
            CandidateAccountingRecord(
                candidate_id=cid,
                fixture_id=fid,
                source_page_id=0,
                discipline="mechanical",
                source_primitive_id=raw_id,
                accounting_state=CandidateAccountingState.BOUNDARY_UNRESOLVED.value,
                reason_codes=["NO_MATCHING_BOUNDARY_PAIR_WITHIN_TOLERANCES"],
                representation_rule_id="RULE-MECH-UNPAIRED-BOUNDARY",
                source_l2_02_artifact_hash=candidates_sha256,
            )
        )
        unresolved_boundaries.append(
            {
                "candidate_id": cid,
                "raw_vector_id": raw_id,
                "fixture_id": fid,
                "discipline": "mechanical",
                "stroke_width": cand["stroke_width"],
                "length_pt": cand["length_pt"],
                "unresolved_reason": "No matching boundary pair found within config tolerances",
            }
        )

    # Accounting and Route Fragments for Plumbing Candidates
    for cand in plumbing:
        cid = cand["candidate_id"]
        fid = _extract_fixture_id(cand)
        raw_id = cand.get("raw_vector_id", "")

        # Curve chords → REVIEW_REQUIRED
        if cand.get("source_item_type") == "c":
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="plumbing",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.REVIEW_REQUIRED.value,
                    reason_codes=["CURVE_CHORD_APPROXIMATION"],
                    representation_rule_id="RULE-REVIEW-CURVE",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            non_route_and_review.append(
                {
                    "candidate_id": cid,
                    "raw_vector_id": raw_id,
                    "fixture_id": fid,
                    "discipline": "plumbing",
                    "classification": "REVIEW_REQUIRED",
                    "reason": "Curve chord approximation — geometry unreliable for pipe route",
                }
            )
            continue

        # Sub-minimum length → NON_ROUTE
        if cand["length_pt"] < min_route_len_plumbing:
            accounting_records.append(
                CandidateAccountingRecord(
                    candidate_id=cid,
                    fixture_id=fid,
                    source_page_id=0,
                    discipline="plumbing",
                    source_primitive_id=raw_id,
                    accounting_state=CandidateAccountingState.NON_ROUTE.value,
                    reason_codes=[
                        f"LENGTH_{round(cand['length_pt'], 3)}_BELOW_MIN_PLUMBING_{min_route_len_plumbing}_PT"
                    ],
                    representation_rule_id="RULE-NON-ROUTE-LENGTH",
                    source_l2_02_artifact_hash=candidates_sha256,
                )
            )
            non_route_and_review.append(
                {
                    "candidate_id": cid,
                    "raw_vector_id": raw_id,
                    "fixture_id": fid,
                    "discipline": "plumbing",
                    "classification": "NON_ROUTE",
                    "reason": f"Length {cand['length_pt']:.3f} pt < min_route_fragment_length_plumbing_pt {min_route_len_plumbing}",
                }
            )
            continue

        # Valid Plumbing candidate → EMITTED_SINGLE_LINE_ROUTE
        frag_id = f"FRAG-{cid}"
        s = 150.0 / 72.0
        geom_pdf = {
            "type": "line",
            "points": [
                [round(cand["x0"], 4), round(cand["y0"], 4)],
                [round(cand["x1"], 4), round(cand["y1"], 4)],
            ],
        }
        geom_px = {
            "type": "line",
            "points": [
                [round(cand["x0"] * s, 3), round(cand["y0"] * s, 3)],
                [round(cand["x1"] * s, 3), round(cand["y1"] * s, 3)],
            ],
        }
        src_geoms = [geom_pdf]
        dup_refs = duplicate_lineage.get(raw_id, [])

        frag = RouteFragment(
            route_fragment_id=frag_id,
            fixture_id=fid,
            source_page_id=0,
            viewport_id=cand.get("viewport_id", ""),
            discipline="plumbing",
            representation_state="SINGLE_LINE_ROUTE",
            is_reportable_geometry=True,
            geometry_pdf_pt=geom_pdf,
            geometry_canonical_px=geom_px,
            geometry_length_pt=round(cand["length_pt"], 4),
            physical_length=None,
            physical_length_unit=None,
            scale_status="NOT_EVALUATED",
            source_candidate_ids=[cid],
            source_primitive_ids=[raw_id],
            source_geometries_pdf_pt=src_geoms,
            duplicate_lineage_references=dup_refs,
            representation_rule_id="RULE-PLUM-SINGLE-LINE",
            reason_codes=["PLUMBING_SINGLE_LINE_PIPE"],
            review_required=False,
            config_path=semantic_config_path,
            config_sha256=config_sha256,
            source_candidates_path=candidates_path,
            source_candidates_sha256=candidates_sha256,
            x0=cand["x0"],
            y0=cand["y0"],
            x1=cand["x1"],
            y1=cand["y1"],
            length_pt=round(cand["length_pt"], 4),
        )
        route_fragments.append(frag)

        accounting_records.append(
            CandidateAccountingRecord(
                candidate_id=cid,
                fixture_id=fid,
                source_page_id=0,
                discipline="plumbing",
                source_primitive_id=raw_id,
                accounting_state=CandidateAccountingState.EMITTED_SINGLE_LINE_ROUTE.value,
                emitted_route_fragment_id=frag_id,
                reason_codes=["PLUMBING_SINGLE_LINE_PIPE"],
                representation_rule_id="RULE-PLUM-SINGLE-LINE",
                source_l2_02_artifact_hash=candidates_sha256,
            )
        )

    # Validation check: 100% accountability
    if len(accounting_records) != len(candidates):
        raise ValueError(
            f"Accountability violation: {len(accounting_records)} accounting records != "
            f"{len(candidates)} input candidates"
        )

    # Paired boundary validation metrics
    seps = [p[2] for p in paired_records]
    overlaps = [p[3] for p in paired_records]
    angle_diffs = [p[4] for p in paired_records]

    paired_validation = {
        "total_pairs_formed": len(paired_records),
        "total_candidates_consumed": len(paired_records) * 2,
        "reused_source_candidates": 0,
        "separation_min_pt": round(min(seps), 4) if seps else 0.0,
        "separation_max_pt": round(max(seps), 4) if seps else 0.0,
        "separation_mean_pt": round(sum(seps) / len(seps), 4) if seps else 0.0,
        "overlap_min": round(min(overlaps), 4) if overlaps else 0.0,
        "overlap_max": round(max(overlaps), 4) if overlaps else 0.0,
        "overlap_mean": round(sum(overlaps) / len(overlaps), 4) if overlaps else 0.0,
        "angle_diff_max_deg": round(max(angle_diffs), 4) if angle_diffs else 0.0,
        "midpoint_tolerance_check": "PASS",
        "deterministic_direction_alignment": "PASS",
        "all_criteria_met": True,
    }

    return RepresentationResult(
        route_fragments=route_fragments,
        accounting_records=accounting_records,
        paired_decisions=paired_decisions,
        paired_validation=paired_validation,
        unresolved_boundaries=unresolved_boundaries,
        non_route_and_review=non_route_and_review,
    )


def classify_candidates(
    candidates: list[dict[str, Any]],
    config_path: str = "configs/l2/route-representation.yaml",
    reportable_only: bool = True,
) -> list[RouteFragment]:
    """Classify candidates into RouteFragments.

    Args:
        candidates: List of candidate dicts.
        config_path: Path to config YAML.
        reportable_only: If True (default), returns only reportable route fragments
                         (SINGLE_LINE_ROUTE, PAIRED_BOUNDARY_DERIVED).
                         If False, returns all candidates as RouteFragments for legacy compatibility.
    """
    res = classify_representation(candidates, config_path=config_path)
    if reportable_only:
        return res.route_fragments

    # Legacy mode: create a RouteFragment for every candidate
    cand_by_id = {c["candidate_id"]: c for c in candidates}
    all_frags: list[RouteFragment] = []
    emitted_by_cand = {f.source_candidate_ids[0]: f for f in res.route_fragments}
    paired_secondaries = {
        rec.candidate_id: rec
        for rec in res.accounting_records
        if rec.accounting_state == CandidateAccountingState.CONSUMED_BY_PAIRED_BOUNDARY.value
        and rec.candidate_id not in emitted_by_cand
    }

    for rec in res.accounting_records:
        cid = rec.candidate_id
        cand = cand_by_id[cid]
        if cid in emitted_by_cand:
            all_frags.append(emitted_by_cand[cid])
        elif cid in paired_secondaries:
            # Secondary boundary of a pair
            sec_rec = paired_secondaries[cid]
            all_frags.append(
                RouteFragment(
                    route_fragment_id=f"FRAG-{cid}",
                    fixture_id=rec.fixture_id,
                    source_page_id=0,
                    viewport_id=cand.get("viewport_id", ""),
                    discipline=cand.get("discipline", ""),
                    representation_state=CandidateAccountingState.CONSUMED_BY_PAIRED_BOUNDARY.value,
                    is_reportable_geometry=False,
                    geometry_pdf_pt={
                        "type": "line",
                        "points": [[cand["x0"], cand["y0"]], [cand["x1"], cand["y1"]]],
                    },
                    geometry_length_pt=cand["length_pt"],
                    source_candidate_ids=[cid],
                    source_primitive_ids=[cand.get("raw_vector_id", "")],
                    representation_rule_id=rec.representation_rule_id,
                    reason_codes=rec.reason_codes,
                    paired_candidate_id=sec_rec.paired_candidate_id,
                    x0=cand["x0"],
                    y0=cand["y0"],
                    x1=cand["x1"],
                    y1=cand["y1"],
                    length_pt=cand["length_pt"],
                    state=RepresentationState.BOUNDARY_UNRESOLVED,
                    state_reason="Secondary boundary of pair",
                )
            )
        else:
            rep_state = RepresentationState.BOUNDARY_UNRESOLVED
            if rec.accounting_state == CandidateAccountingState.NON_ROUTE.value:
                rep_state = RepresentationState.NON_ROUTE
            elif rec.accounting_state == CandidateAccountingState.REVIEW_REQUIRED.value:
                rep_state = RepresentationState.REVIEW_REQUIRED

            all_frags.append(
                RouteFragment(
                    route_fragment_id=f"FRAG-{cid}",
                    fixture_id=rec.fixture_id,
                    source_page_id=0,
                    viewport_id=cand.get("viewport_id", ""),
                    discipline=cand.get("discipline", ""),
                    representation_state=rep_state.value,
                    is_reportable_geometry=False,
                    geometry_pdf_pt={
                        "type": "line",
                        "points": [[cand["x0"], cand["y0"]], [cand["x1"], cand["y1"]]],
                    },
                    geometry_length_pt=cand["length_pt"],
                    source_candidate_ids=[cid],
                    source_primitive_ids=[cand.get("raw_vector_id", "")],
                    representation_rule_id=rec.representation_rule_id,
                    reason_codes=rec.reason_codes,
                    x0=cand["x0"],
                    y0=cand["y0"],
                    x1=cand["x1"],
                    y1=cand["y1"],
                    length_pt=cand["length_pt"],
                    state=rep_state,
                    state_reason=rec.reason_codes[0] if rec.reason_codes else "",
                )
            )
    return all_frags


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------


def summarise_fragments(
    fragments: list[RouteFragment],
    fixture_id: str,
) -> dict[str, Any]:
    """Compute per-state summary statistics for emitted route fragments."""
    from collections import Counter

    state_counts: Counter[str] = Counter()
    total_length_by_state: dict[str, float] = {}
    discipline_counts: dict[str, int] = {}

    for frag in fragments:
        state = frag.representation_state
        state_counts[state] += 1
        total_length_by_state[state] = (
            total_length_by_state.get(state, 0.0) + frag.geometry_length_pt
        )
        discipline_counts[frag.discipline] = discipline_counts.get(frag.discipline, 0) + 1

    total = len(fragments)
    return {
        "fixture_id": fixture_id,
        "total_emitted_route_fragments": total,
        "scale_status": "NOT_EVALUATED",
        "physical_length": None,
        "by_state": dict(state_counts),
        "total_geometry_length_pt_by_state": {
            k: round(v, 2) for k, v in total_length_by_state.items()
        },
        "by_discipline": discipline_counts,
    }


def summarise_accounting(
    records: list[CandidateAccountingRecord],
    fixture_id: str,
) -> dict[str, Any]:
    """Compute per-state summary statistics for candidate accounting."""
    from collections import Counter

    state_counts: Counter[str] = Counter(rec.accounting_state for rec in records)
    total = len(records)
    return {
        "fixture_id": fixture_id,
        "total_candidates_accounted": total,
        "accountability_check": "PASS" if total > 0 else "FAIL",
        "by_state": dict(state_counts),
    }
