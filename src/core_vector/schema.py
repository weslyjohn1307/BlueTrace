"""Level 2 output schema and data types.

Implements the locked 5-field public output contract defined in
docs/practical-constraints/06-OUTPUT-CONTRACT.md.

Public scored fields: object_type, location_or_path, confidence, length, sheet_id
Provenance sidecar: kept separate from scored fields (not leaked into submission JSON).
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class ScaleStatus(str, Enum):
    """Scale gating outcome codes (ADR-002 / 06-OUTPUT-CONTRACT.md)."""

    VALID = "VALID"
    SCALE_UNREADABLE = "SCALE_UNREADABLE"
    TITLE_BLOCK_MISSING = "TITLE_BLOCK_MISSING"
    NOT_TO_SCALE = "NOT_TO_SCALE"
    SCHEMATIC_RISER = "SCHEMATIC_RISER"
    PID_DIAGRAM = "PID_DIAGRAM"
    LEGEND_SHEET = "LEGEND_SHEET"
    GAP_UNCLOSED = "GAP_UNCLOSED"


class DrawingType(str, Enum):
    """Drawing classification codes (EXP-002 / EXP-008)."""

    PLAN_VIEW = "PLAN_VIEW"
    PLAN_VIEW_UNSCALED = "PLAN_VIEW_UNSCALED"
    SCHEMATIC_RISER = "SCHEMATIC_RISER"
    PID_DIAGRAM = "PID_DIAGRAM"
    LEGEND_OR_NOTES = "LEGEND_OR_NOTES"
    NOT_TO_SCALE = "NOT_TO_SCALE"
    UNKNOWN = "UNKNOWN"


class PageRole(str, Enum):
    """Page role classification codes (L2-02)."""

    PLAN_VIEW = "PLAN_VIEW"
    RISER_OR_SCHEMATIC = "RISER_OR_SCHEMATIC"
    SCHEDULE_OR_LEGEND = "SCHEDULE_OR_LEGEND"
    DETAIL = "DETAIL"
    MIXED_OR_UNKNOWN = "MIXED_OR_UNKNOWN"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class RejectionReason(str, Enum):
    """Audit reason codes for raw vector primitive decisions (L2-02)."""

    PROMOTED_SEMANTIC_CANDIDATE = "PROMOTED_SEMANTIC_CANDIDATE"
    REJECTED_PAGE_ROLE = "REJECTED_PAGE_ROLE"
    REJECTED_OUTSIDE_VIEWPORT = "REJECTED_OUTSIDE_VIEWPORT"
    REJECTED_EXACT_DUPLICATE = "REJECTED_EXACT_DUPLICATE"
    REJECTED_REVERSED_DUPLICATE = "REJECTED_REVERSED_DUPLICATE"
    REJECTED_MICRO_GEOMETRY = "REJECTED_MICRO_GEOMETRY"
    REJECTED_PAGE_OR_TITLE_BORDER = "REJECTED_PAGE_OR_TITLE_BORDER"
    REJECTED_GRID_OR_DIMENSION = "REJECTED_GRID_OR_DIMENSION"
    REJECTED_TEXT_OR_SYMBOL_ENVELOPE = "REJECTED_TEXT_OR_SYMBOL_ENVELOPE"
    REJECTED_STYLE_OR_DISCIPLINE_PROFILE = "REJECTED_STYLE_OR_DISCIPLINE_PROFILE"
    REJECTED_UNSUPPORTED_PRIMITIVE = "REJECTED_UNSUPPORTED_PRIMITIVE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class CandidateAccountingState(str, Enum):
    """Audit accounting state for every semantic candidate (L2-03-C1)."""

    EMITTED_SINGLE_LINE_ROUTE = "EMITTED_SINGLE_LINE_ROUTE"
    CONSUMED_BY_PAIRED_BOUNDARY = "CONSUMED_BY_PAIRED_BOUNDARY"
    BOUNDARY_UNRESOLVED = "BOUNDARY_UNRESOLVED"
    NON_ROUTE = "NON_ROUTE"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


@dataclass
class CandidateAccountingRecord:
    """Audit record ensuring 100% accountability for every semantic candidate (L2-03-C1)."""

    candidate_id: str
    fixture_id: str
    source_page_id: int | str
    discipline: str
    source_primitive_id: str
    accounting_state: str
    emitted_route_fragment_id: str | None = None
    consumed_by_route_fragment_id: str | None = None
    paired_candidate_id: str | None = None
    reason_codes: list[str] = field(default_factory=list)
    representation_rule_id: str = ""
    source_l2_02_artifact_hash: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize accounting record to dictionary for JSONL output."""
        return {
            "candidate_id": self.candidate_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "discipline": self.discipline,
            "source_primitive_id": self.source_primitive_id,
            "accounting_state": self.accounting_state,
            "emitted_route_fragment_id": self.emitted_route_fragment_id,
            "consumed_by_route_fragment_id": self.consumed_by_route_fragment_id,
            "paired_candidate_id": self.paired_candidate_id,
            "reason_codes": self.reason_codes,
            "representation_rule_id": self.representation_rule_id,
            "source_l2_02_artifact_hash": self.source_l2_02_artifact_hash,
        }


@dataclass
class ViewportRecord:
    """Explicit viewport boundary record for a drawing page (L2-02)."""

    viewport_id: str
    sheet_id: str
    page_index: int
    view_role: str  # e.g. "plan_view", "detail", "whole_page"
    bounds_pt: list[float]  # [x0, y0, x1, y1] in PDF user space points
    is_primary: bool = True
    status: str = "VALID"  # "VALID" | "REVIEW_REQUIRED"
    confidence: float = 1.0


@dataclass
class DuplicateLineage:
    """Traceable lineage record for deduplicated raw primitives (L2-02)."""

    raw_vector_id: str
    retained_vector_id: str
    duplicate_type: str  # "EXACT_SAME_DIRECTION" | "EXACT_REVERSED"
    style_differences: dict[str, Any] = field(default_factory=dict)
    rejection_reason: str = ""


@dataclass
class SemanticCandidate:
    """Promoted semantic linework candidate passing page role, viewport, and profile gating."""

    candidate_id: str
    raw_vector_id: str
    discipline: str  # "mechanical" | "plumbing"
    x0: float
    y0: float
    x1: float
    y1: float
    stroke_width: float
    stroke_color: list[float] | None
    source_item_type: str
    length_pt: float
    viewport_id: str
    fill_color: list[float] | None = None
    drawing_type: str = "s"  # "s" (stroke), "f" (fill), "fs" (fill+stroke), "clip"
    dash_pattern: str | list[Any] | None = None
    layer: str = ""
    seqno: int = 0


@dataclass
class PrimitiveAuditRecord:
    """Audit record for every raw primitive accounting for its final state."""

    raw_vector_id: str
    fixture_id: str
    decision: str  # RejectionReason value
    retained_vector_id: str | None = None
    detail: str = ""


@dataclass
class RawSegment:
    """A raw 2-point line primitive extracted from a PDF page.

    Coordinates are in PDF user space points (72 pt/in, origin top-left).
    This is an intermediate extraction artifact, never emitted in public output.
    """

    x0: float
    y0: float
    x1: float
    y1: float
    stroke_width: float  # pt
    stroke_r: float  # 0.0–1.0
    stroke_g: float
    stroke_b: float
    source_item_type: str  # "l" (line), "re" (rect edge), "c" (curve approx)
    source_segment_count: int = 1  # count of merged primitives
    fill_r: float | None = None
    fill_g: float | None = None
    fill_b: float | None = None
    drawing_type: str = "s"
    dash_pattern: str | list[Any] | None = None
    layer: str = ""
    seqno: int = 0

    @property
    def length_pt(self) -> float:
        """Euclidean length in PDF points."""
        dx = self.x1 - self.x0
        dy = self.y1 - self.y0
        return (dx * dx + dy * dy) ** 0.5

    def is_degenerate(self) -> bool:
        """True if the segment has zero or near-zero length (< 1e-6 pt)."""
        return self.length_pt < 1e-6


@dataclass
class ScaleDecision:
    """Result of the fail-closed scale gating stage (ADR-002).

    When status != VALID, physical_length MUST be None.
    Coordinates remain in PDF user space points regardless of scale status.
    """

    status: ScaleStatus
    drawing_type: DrawingType
    scale_text: str | None  # e.g. '1/8" = 1\'-0"'
    ft_per_pt: float | None  # conversion factor: PDF points → feet
    m_per_pt: float | None  # conversion factor: PDF points → metres (ft * 0.3048)
    reason_code: str | None  # reason code for null length, or None when VALID

    def to_physical_length_m(self, geometric_length_pt: float) -> float | None:
        """Convert geometric length (pt) to physical length (m), or None if ungated."""
        if self.status != ScaleStatus.VALID or self.m_per_pt is None:
            return None
        return geometric_length_pt * self.m_per_pt

    def to_physical_length_ft(self, geometric_length_pt: float) -> float | None:
        """Convert geometric length (pt) to feet, or None if ungated."""
        if self.status != ScaleStatus.VALID or self.ft_per_pt is None:
            return None
        return geometric_length_pt * self.ft_per_pt


class ScaleSourceType(str, Enum):
    """Provenance of a view-bound scale decision (L2-06)."""

    NATIVE_TEXT = "NATIVE_TEXT"
    GRAPHIC_SCALE = "GRAPHIC_SCALE"
    KNOWN_DIMENSION_CALIBRATION = "KNOWN_DIMENSION_CALIBRATION"
    DECLARED_MANUAL = "DECLARED_MANUAL"
    MANUAL_DEVELOPMENT_FIXTURE = "MANUAL_DEVELOPMENT_FIXTURE"
    NONE = "NONE"


class ViewBoundScaleStatus(str, Enum):
    """View-bound scale decision status (L2-06). Conversion requires VERIFIED_* or MANUAL_VALIDATION."""

    VERIFIED_AUTOMATIC = "VERIFIED_AUTOMATIC"
    VERIFIED_DECLARED = "VERIFIED_DECLARED"
    MANUAL_VALIDATION = "MANUAL_VALIDATION"
    PARSED_UNVERIFIED = "PARSED_UNVERIFIED"
    FAIL_CLOSED = "FAIL_CLOSED"


class ScaleReasonCode(str, Enum):
    """Stable reason codes for view-bound scale gating (L2-06 / ADR-002)."""

    SCALE_VERIFIED = "SCALE_VERIFIED"
    DECLARED_SCALE_VERIFIED = "DECLARED_SCALE_VERIFIED"
    MANUAL_VALIDATION = "MANUAL_VALIDATION"
    MANUAL_SCALE_VALIDATED = "MANUAL_SCALE_VALIDATED"
    TITLE_BLOCK_MISSING = "TITLE_BLOCK_MISSING"
    SCALE_TEXT_MISSING = "SCALE_TEXT_MISSING"
    SCALE_UNREADABLE = "SCALE_UNREADABLE"
    NOT_TO_SCALE = "NOT_TO_SCALE"
    SCHEMATIC_RISER = "SCHEMATIC_RISER"
    UNSUPPORTED_SCALE_FORMAT = "UNSUPPORTED_SCALE_FORMAT"
    SCALE_CONFLICT = "SCALE_CONFLICT"
    MIXED_VIEW_SCALE_UNBOUND = "MIXED_VIEW_SCALE_UNBOUND"
    VIEW_UNBOUND = "VIEW_UNBOUND"
    CROSS_CHECK_MISSING = "CROSS_CHECK_MISSING"
    CROSS_CHECK_FAILED = "CROSS_CHECK_FAILED"
    REDACTED_SCALE = "REDACTED_SCALE"


VIEW_BOUND_PARSER_VERSION = "l2-06-view-bound-scale-1.0.0"


@dataclass
class ViewBoundScaleDecision:
    """Scale decision bound to one page/view and coordinate transform (L2-06).

    Physical conversion is enabled only for VERIFIED_AUTOMATIC, VERIFIED_DECLARED,
    or MANUAL_VALIDATION after an independent cross-check. This object does not store route lengths.
    """

    scale_decision_id: str
    fixture_id: str
    source_page_id: str | int
    view_id: str | None
    view_bounds_pdf_pt: list[float]
    coordinate_transform_id: str
    source_type: ScaleSourceType
    raw_evidence_text: str | None
    raw_evidence_bbox_pdf_pt: list[float] | None
    parsed_notation: str | None
    paper_units: str | None
    real_units: str | None
    scale_ratio_denominator: float | None
    meters_per_pdf_point: float | None
    parser_version: str
    cross_check_type: str | None
    cross_check_source: str | None
    cross_check_expected_value: float | None
    cross_check_measured_value: float | None
    cross_check_relative_error: float | None
    cross_check_status: str | None
    status: ViewBoundScaleStatus
    reason_codes: list[str]
    manual_actor: str | None
    manual_source: str | None
    physical_conversion_enabled: bool
    view_bounds_source: str = "AUTOMATIC"

    def conversion_factor_m_per_pdf_point(self) -> float | None:
        """Return meters per PDF point only for verified conversion-enabled decisions."""
        verified = self.status in (
            ViewBoundScaleStatus.VERIFIED_AUTOMATIC,
            ViewBoundScaleStatus.VERIFIED_DECLARED,
            ViewBoundScaleStatus.MANUAL_VALIDATION,
        )
        if not verified or not self.physical_conversion_enabled:
            return None
        return self.meters_per_pdf_point

    def to_dict(self) -> dict[str, Any]:
        """Serialize without absolute filesystem paths."""
        return {
            "scale_decision_id": self.scale_decision_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "view_id": self.view_id,
            "view_bounds_pdf_pt": self.view_bounds_pdf_pt,
            "view_bounds_source": self.view_bounds_source,
            "coordinate_transform_id": self.coordinate_transform_id,
            "source_type": self.source_type.value
            if hasattr(self.source_type, "value")
            else str(self.source_type),
            "raw_evidence_text": self.raw_evidence_text,
            "raw_evidence_bbox_pdf_pt": self.raw_evidence_bbox_pdf_pt,
            "parsed_notation": self.parsed_notation,
            "paper_units": self.paper_units,
            "real_units": self.real_units,
            "scale_ratio_denominator": self.scale_ratio_denominator,
            "meters_per_pdf_point": self.meters_per_pdf_point,
            "parser_version": self.parser_version,
            "cross_check_type": self.cross_check_type,
            "cross_check_source": self.cross_check_source,
            "cross_check_expected_value": self.cross_check_expected_value,
            "cross_check_measured_value": self.cross_check_measured_value,
            "cross_check_relative_error": self.cross_check_relative_error,
            "cross_check_status": self.cross_check_status,
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "reason_codes": list(self.reason_codes),
            "manual_actor": self.manual_actor,
            "manual_source": self.manual_source,
            "physical_conversion_enabled": self.physical_conversion_enabled,
        }


@dataclass
class LinearRun:
    """An assembled continuous linear run produced by the continuity engine.

    A run is either:
    - CONTINUOUS: all fragments fully connected (or spliced)
    - GAP_UNCLOSED: one or more gaps > 10.0 pt that were not bridged
    """

    points: list[tuple[float, float]]  # polyline vertex list in PDF points
    category: str  # "duct_segment", "pipe", etc. — source annotation class
    object_type: str  # public output type: "duct", "pipe"
    has_unclosed_gaps: bool
    source_segment_count: int  # how many raw segments were merged into this run
    gap_count: int = 0  # number of GAP_UNCLOSED instances in this run

    @property
    def geometric_length_pt(self) -> float:
        """Sum of Euclidean distances between consecutive polyline vertices (pt)."""
        total = 0.0
        for i in range(len(self.points) - 1):
            dx = self.points[i + 1][0] - self.points[i][0]
            dy = self.points[i + 1][1] - self.points[i][1]
            total += (dx * dx + dy * dy) ** 0.5
        return total


@dataclass
class L2Result:
    """A single Level 2 output object conforming to the 5-field public contract.

    Scored fields (public): object_type, location_or_path, confidence, length, sheet_id
    Sidecar provenance: kept in provenance dict (not emitted in scored submission JSON).

    Length is in metres when scale is valid, otherwise None.
    Coordinates in location_or_path are in PDF user space points (72 pt/in).
    """

    # --- Scored public fields (locked 5-field contract) ---
    object_type: str  # "duct" | "pipe"
    location_or_path: dict[str, Any]  # {"type": "polyline", "points": [[x,y],...]}
    confidence: float  # 0.0–1.0
    length: float | None  # metres, or null when scale is invalid/unavailable
    sheet_id: str

    # --- Sidecar provenance (not scored, not emitted in public JSON) ---
    object_id: str = field(default_factory=lambda: f"OBJ-{uuid.uuid4().hex[:8].upper()}")
    kind: str = "linear"
    length_unit: str = "m"
    scale_status: str = "UNKNOWN"
    scale_text: str | None = None
    reason_code: str | None = None
    has_unclosed_gaps: bool = False
    source_segment_count: int = 0
    geometric_length_pt: float = 0.0
    source_annotation_class: str | None = None  # e.g. "duct_segment" for plumbing
    match_line_notes: list[str] = field(default_factory=list)

    def to_public_dict(self) -> dict[str, Any]:
        """Returns only the 5 scored public fields + kind/object_id for JSON output."""
        return {
            "object_id": self.object_id,
            "object_type": self.object_type,
            "kind": self.kind,
            "location_or_path": self.location_or_path,
            "confidence": self.confidence,
            "length": self.length,
            "length_unit": self.length_unit if self.length is not None else None,
            "sheet_id": self.sheet_id,
        }

    def to_full_dict(self) -> dict[str, Any]:
        """Returns all fields including sidecar provenance (for internal use)."""
        return asdict(self)


# ---------------------------------------------------------------------------
# L2-04 Topology and Continuity Graph Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class CollinearMergeDecision:
    """Audit record for a collinear splice evaluation between two fragments (L2-04)."""

    decision_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    representation_family: str
    input_fragment_ids: list[str]
    output_run_id: str | None = None
    angle_difference_deg: float = 0.0
    lateral_offset_pt: float = 0.0
    longitudinal_gap_pt: float = 0.0
    overlap_length_pt: float = 0.0
    rule_id: str = "RULE-COLLINEAR-SPLICE"
    status: str = "ACCEPTED"  # "ACCEPTED" | "REJECTED"
    rejection_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "representation_family": self.representation_family,
            "input_fragment_ids": self.input_fragment_ids,
            "output_run_id": self.output_run_id,
            "angle_difference_deg": round(self.angle_difference_deg, 4),
            "lateral_offset_pt": round(self.lateral_offset_pt, 4),
            "longitudinal_gap_pt": round(self.longitudinal_gap_pt, 4),
            "overlap_length_pt": round(self.overlap_length_pt, 4),
            "rule_id": self.rule_id,
            "status": self.status,
            "rejection_reason": self.rejection_reason,
        }


@dataclass
class GapBridgeDecision:
    """Audit record for a bounded gap bridge evaluation (L2-04)."""

    bridge_relation_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    representation_family: str
    source_run_ids: list[str] = field(default_factory=list)
    bridge_geometry: dict[str, Any] = field(default_factory=dict)
    inferred_gap_length_pt: float = 0.0
    angle_difference_deg: float = 0.0
    lateral_offset_pt: float = 0.0
    rule_id: str = "RULE-BOUNDED-GAP-BRIDGE"
    status: str = "ACCEPTED"  # "ACCEPTED" | "REJECTED"
    output_run_id: str | None = None
    rejection_reason: str | None = None
    reason: str = "BOUNDED_GAP_BRIDGE"
    uncertainty: str = "INFERRED_GEOMETRIC_CONNECTION"
    physical_length: None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "bridge_relation_id": self.bridge_relation_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "representation_family": self.representation_family,
            "source_run_ids": self.source_run_ids,
            "output_run_id": self.output_run_id,
            "bridge_geometry": self.bridge_geometry,
            "inferred_gap_length_pt": round(self.inferred_gap_length_pt, 4),
            "angle_difference_deg": round(self.angle_difference_deg, 4),
            "lateral_offset_pt": round(self.lateral_offset_pt, 4),
            "rule_id": self.rule_id,
            "status": self.status,
            "rejection_reason": self.rejection_reason,
            "reason": self.reason,
            "uncertainty": self.uncertainty,
            "physical_length": None,
        }


@dataclass
class UnclosedGapRecord:
    """Audit record for an unclosed or rejected gap in linework (L2-04)."""

    gap_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    incident_fragment_or_run_ids: list[str] = field(default_factory=list)
    gap_distance_pt: float = 0.0
    reason_code: str = "EXCEEDS_MAX_GAP"
    coordinates_pdf_pt: list[list[float]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "gap_id": self.gap_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "incident_fragment_or_run_ids": self.incident_fragment_or_run_ids,
            "gap_distance_pt": round(self.gap_distance_pt, 4),
            "reason_code": self.reason_code,
            "coordinates_pdf_pt": self.coordinates_pdf_pt,
        }


@dataclass
class JunctionDecision:
    """Audit record for a classified graph junction relation (L2-04)."""

    junction_id: str
    node_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    node_type: str  # "SIMPLE_ENDPOINT" | "ISOLATED_ENDPOINT" | "BEND" | "T_JUNCTION_CANDIDATE" | "CROSSING_CANDIDATE" | "AMBIGUOUS_JUNCTION" | "GAP_BRIDGE_NODE"
    degree: int = 1
    incident_edge_ids: list[str] = field(default_factory=list)
    incident_run_ids: list[str] = field(default_factory=list)
    included_angles_deg: list[float] = field(default_factory=list)
    main_pair_run_ids: list[str] | None = None
    branch_run_ids: list[str] | None = None
    crossing_pairs: list[list[str]] | None = None
    uncertainty_codes: list[str] = field(default_factory=list)
    reason_code: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "junction_id": self.junction_id,
            "node_id": self.node_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "node_type": self.node_type,
            "degree": self.degree,
            "incident_edge_ids": self.incident_edge_ids,
            "incident_run_ids": self.incident_run_ids,
            "included_angles_deg": [round(a, 2) for a in self.included_angles_deg],
            "main_pair_run_ids": self.main_pair_run_ids,
            "branch_run_ids": self.branch_run_ids,
            "crossing_pairs": self.crossing_pairs,
            "uncertainty_codes": self.uncertainty_codes,
            "reason_code": self.reason_code,
        }


@dataclass
class GraphNode:
    """A deterministic graph node produced by endpoint clustering (L2-04)."""

    node_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    coordinate_pdf_pt: list[float]  # [x, y]
    coordinate_canonical_px: list[float] | None = None  # [px_x, px_y]
    degree: int = 1
    node_type: str = "SIMPLE_ENDPOINT"
    incident_edge_ids: list[str] = field(default_factory=list)
    incident_route_run_ids: list[str] = field(default_factory=list)
    relation_ids: list[str] = field(default_factory=list)
    source_fragment_ids: list[str] = field(default_factory=list)
    connectivity_status: str = "CONNECTED"
    uncertainty_codes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "coordinate_pdf_pt": [round(c, 4) for c in self.coordinate_pdf_pt],
            "coordinate_canonical_px": (
                [round(c, 3) for c in self.coordinate_canonical_px]
                if self.coordinate_canonical_px is not None
                else None
            ),
            "degree": self.degree,
            "node_type": self.node_type,
            "incident_edge_ids": self.incident_edge_ids,
            "incident_route_run_ids": self.incident_route_run_ids,
            "relation_ids": self.relation_ids,
            "source_fragment_ids": self.source_fragment_ids,
            "connectivity_status": self.connectivity_status,
            "uncertainty_codes": self.uncertainty_codes,
        }


@dataclass
class GraphEdge:
    """A deterministic graph edge connecting two graph nodes along a route run (L2-04)."""

    edge_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    route_run_id: str
    start_node_id: str
    end_node_id: str
    polyline_pdf_pt: dict[str, Any] = field(default_factory=dict)
    source_lineage: dict[str, Any] = field(default_factory=dict)
    representation_family: str = ""
    geometry_length_pt: float = 0.0
    physical_length: None = None
    scale_status: str = "NOT_EVALUATED"

    def to_dict(self) -> dict[str, Any]:
        return {
            "edge_id": self.edge_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "route_run_id": self.route_run_id,
            "start_node_id": self.start_node_id,
            "end_node_id": self.end_node_id,
            "polyline_pdf_pt": self.polyline_pdf_pt,
            "source_lineage": self.source_lineage,
            "representation_family": self.representation_family,
            "geometry_length_pt": round(self.geometry_length_pt, 4),
            "physical_length": None,
            "scale_status": "NOT_EVALUATED",
        }


@dataclass
class RouteRun:
    """An assembled continuous polyline route run (L2-04)."""

    route_run_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    representation_family: str
    polyline_pdf_pt: dict[str, Any] = field(default_factory=dict)
    polyline_canonical_px: dict[str, Any] | None = None
    source_route_fragment_ids: list[str] = field(default_factory=list)
    source_candidate_ids: list[str] = field(default_factory=list)
    source_primitive_ids: list[str] = field(default_factory=list)
    merge_relation_ids: list[str] = field(default_factory=list)
    bridge_relation_ids: list[str] = field(default_factory=list)
    start_node_id: str = ""
    end_node_id: str = ""
    topology_relation_ids: list[str] = field(default_factory=list)
    geometry_length_pt: float = 0.0  # Diagnostic length excluding inferred bridges
    overlap_removed_length_pt: float = 0.0
    inferred_bridge_length_pt: float = 0.0
    physical_length: None = None
    physical_length_unit: None = None
    scale_status: str = "NOT_EVALUATED"
    continuity_status: str = "CONTINUOUS"
    uncertainty_codes: list[str] = field(default_factory=list)
    source_artifact_hash: str = ""
    config_hash: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "route_run_id": self.route_run_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "representation_family": self.representation_family,
            "polyline_pdf_pt": self.polyline_pdf_pt,
            "polyline_canonical_px": self.polyline_canonical_px,
            "source_route_fragment_ids": self.source_route_fragment_ids,
            "source_candidate_ids": self.source_candidate_ids,
            "source_primitive_ids": self.source_primitive_ids,
            "merge_relation_ids": self.merge_relation_ids,
            "bridge_relation_ids": self.bridge_relation_ids,
            "start_node_id": self.start_node_id,
            "end_node_id": self.end_node_id,
            "topology_relation_ids": self.topology_relation_ids,
            "geometry_length_pt": round(self.geometry_length_pt, 4),
            "overlap_removed_length_pt": round(self.overlap_removed_length_pt, 4),
            "inferred_bridge_length_pt": round(self.inferred_bridge_length_pt, 4),
            "physical_length": None,
            "physical_length_unit": None,
            "scale_status": "NOT_EVALUATED",
            "continuity_status": self.continuity_status,
            "uncertainty_codes": self.uncertainty_codes,
            "source_artifact_hash": self.source_artifact_hash,
            "config_hash": self.config_hash,
        }


@dataclass
class FragmentAccountingRecord:
    """100% accounting record for an input route fragment during topology assembly (L2-04)."""

    route_fragment_id: str
    fixture_id: str
    discipline: str
    representation_state: str
    assigned_route_run_id: str
    status: str  # "CONSOLIDATED_COLLINEAR" | "GAP_BRIDGED" | "ISOLATED" | "UNMODIFIED"
    merge_relation_ids: list[str] = field(default_factory=list)
    bridge_relation_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "route_fragment_id": self.route_fragment_id,
            "fixture_id": self.fixture_id,
            "discipline": self.discipline,
            "representation_state": self.representation_state,
            "assigned_route_run_id": self.assigned_route_run_id,
            "status": self.status,
            "merge_relation_ids": self.merge_relation_ids,
            "bridge_relation_ids": self.bridge_relation_ids,
        }


@dataclass
class EndpointClusterDecision:
    """Audit record for endpoint clustering decisions (L2-04-C1)."""

    decision_id: str
    fixture_id: str
    source_page_id: int | str
    viewport_id: str
    discipline: str
    route_run_id: str
    endpoint_role: str  # "START" or "END"
    coordinate_pdf_pt: list[float]
    assigned_node_id: str
    cluster_seed_endpoint_id: str
    distance_to_seed_pt: float = 0.0
    status: str = (
        "ASSIGNED_CLUSTER"  # "ASSIGNED_CLUSTER" | "SEED_NEW_CLUSTER" | "CONFLICT_PREVENTED"
    )
    reason_code: str = "CROSS_RUN_CLUSTER"  # "CROSS_RUN_CLUSTER" | "SEED_ENDPOINT" | "SAME_RUN_ENDPOINT_CLUSTER_CONFLICT_PREVENTED"

    @property
    def reason(self) -> str:
        return self.reason_code

    @property
    def clustering_rule_or_reason(self) -> str:
        return self.reason_code

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "viewport_id": self.viewport_id,
            "discipline": self.discipline,
            "route_run_id": self.route_run_id,
            "endpoint_role": self.endpoint_role,
            "coordinate_pdf_pt": [round(c, 4) for c in self.coordinate_pdf_pt],
            "assigned_node_id": self.assigned_node_id,
            "cluster_seed_endpoint_id": self.cluster_seed_endpoint_id,
            "distance_to_seed_pt": round(self.distance_to_seed_pt, 4),
            "status": self.status,
            "reason_code": self.reason_code,
        }
