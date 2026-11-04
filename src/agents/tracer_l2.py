"""Product Agent 03: Tracer L2 Linework Runs (code traces, Spark labels).

Deterministically extracts and measures duct/pipe runs using local vector topology,
enforces the Fail-Closed Scale Invariant, applies semantic labeling via native text
and point-of-need muse-spark-1.3, splits ambiguous junctions, and emits SUGGESTED
annotations with evidence IDs.
"""

from __future__ import annotations

import asyncio
import itertools
import logging
import math
import re
import time
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any, Literal

import pymupdf
from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import LineString, MultiPoint, Point, box
from shapely.ops import split as shapely_split
from shapely.strtree import STRtree

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentResult,
    BaseAgent,
    EvidenceIDGenerator,
    ScaleStatus,
)
from src.core_vector.pipeline import run_l2_pipeline
from src.meta_services.client import MetaModelClient
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)

# The topology pipeline retains detailed pairwise decisions. On unusually dense
# sheets this can grow superlinearly even when only a small fraction of PDF
# drawing objects are MEP routes. Use the bounded legacy vector assembler above
# this observed density, and keep every resulting run review-required.
_TOPOLOGY_DRAWING_OBJECT_LIMIT = 50_000


def _page_drawing_object_count(pdf_path: str | Path, page_index: int) -> int:
    """Count native vector drawing objects before choosing the topology path."""
    doc = pymupdf.open(str(pdf_path))
    try:
        if page_index < 0 or page_index >= doc.page_count:
            return 0
        return len(doc[page_index].get_drawings())
    finally:
        doc.close()

# AEC Regex Patterns for Duct and Pipe Dimensions
_RECT_DUCT_RE = re.compile(r"\b(\d{1,3})\s*[/xX×]\s*(\d{1,3})\b")
_ROUND_DUCT_RE = re.compile(r'\b(\d{1,2})"?\s*(?:dia|diameter|\u2205|ø|round|rd)\b', re.IGNORECASE)
_PIPE_DIM_RE = re.compile(r'\b(\d{1,2}(?:/\d{1,2})?|\d{1,2}\.\d+)"?\s*(?:CW|HW|SAN|GAS|P|PIPE)\b', re.IGNORECASE)

# System Classification Patterns
_SUPPLY_RE = re.compile(r"\b(SA|SUPPLY|SUP|S\.A\.)\b", re.IGNORECASE)
_RETURN_RE = re.compile(r"\b(RA|RETURN|RET|R\.A\.)\b", re.IGNORECASE)
_EXHAUST_RE = re.compile(r"\b(EA|EXHAUST|EXH|E\.A\.)\b", re.IGNORECASE)
_OUTSIDE_AIR_RE = re.compile(r"\b(OA|OUTSIDE|FRESH)\b", re.IGNORECASE)
_CW_RE = re.compile(r"\b(CW|DCW)\b", re.IGNORECASE)
_HW_RE = re.compile(r"\b(HW|DHW)\b", re.IGNORECASE)
_SAN_RE = re.compile(r"\b(SAN|SS|WASTE|SOIL)\b", re.IGNORECASE)


class PolylineGeometry(BaseModel):
    """Geometric polyline in PDF user space coordinates."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: Literal["polyline"] = "polyline"
    points: list[list[float]]  # [[x0, y0], [x1, y1], ...]
    coordinate_space: str = "pdf_user_space_pt"
    geometric_length_pt: float = 0.0
    scale_status: str = "UNVERIFIED"
    sheet_scale_status: str | None = None
    object_type: Literal["duct", "pipe"] = "duct"
    run_index: int | None = None
    source_object_id: str | None = None
    has_uncertainty: bool = False


class LinearRunSemantic(BaseModel):
    """Semantic attributes associated with a linear run."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    system: str = "General"
    object_type: Literal["duct", "pipe"] = "duct"
    dimension_label: str = "Unknown"
    confidence: float | None = None
    source: Literal["native_text", "spark_ocr", "stroke_color", "default"] = "default"
    detected_raw_text: str | None = None


class TracerL2Run(BaseModel):
    """Complete structured measured run conforming to Product Agent 03 output contract."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    run_id: str
    sheet_id: str
    polyline: PolylineGeometry
    system: str = "General"
    object_type: Literal["duct", "pipe"] = "duct"
    dimension_label: str = "Unknown"
    length_m: float | None = None
    total_length_ft: float = 0.0
    geometric_length_pt: float = 0.0
    status: Literal["SUGGESTED", "ACCEPTED", "CORRECTED", "REJECTED", "CANNOT_DETERMINE"] = "SUGGESTED"
    review_required: bool = True
    evidence_id: str
    continuity_status: str = "CONTINUOUS"
    uncertainty_codes: list[str] = Field(default_factory=list)
    flags: list[dict[str, Any]] = Field(default_factory=list)

    def to_takeoff_record(self, project_id: str) -> TakeoffRecord:
        """Convert to authoritative TakeoffRecord for TakeoffStore persistence."""
        category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"] = (
            "PIPING" if self.object_type == "pipe" else "DUCTWORK"
        )
        geom_dict = self.polyline.model_dump()
        geom_dict["length_m"] = self.length_m
        geom_dict["evidence_id"] = self.evidence_id
        if self.uncertainty_codes:
            geom_dict["uncertainty_codes"] = self.uncertainty_codes

        return TakeoffRecord(
            item_id=self.evidence_id,
            project_id=project_id,
            sheet_id=self.sheet_id,
            category=category,
            system=self.system,
            dimension_label=self.dimension_label,
            status=self.status,
            source="VECTOR_ENGINE",
            total_length_ft=self.total_length_ft,
            count=1,
            geometry=geom_dict,
            confidence=0.90 if self.polyline.points else None,
            review_required=self.review_required,
        )


class TracerL2Result(BaseModel):
    """Structured result returned by TracerL2Agent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sheet_id: str
    page_index: int = 0
    discipline: str = "MECHANICAL"
    runs: list[TracerL2Run] = Field(default_factory=list)
    run_count: int = 0
    total_length_m: float | None = None
    total_length_ft: float | None = None
    total_geometric_length_pt: float = 0.0
    scale_status: ScaleStatus = ScaleStatus.UNVERIFIED
    scale_ratio: float | None = None
    is_scale_valid: bool = False
    review_required: bool = True
    items: list[TakeoffRecord] = Field(default_factory=list)
    flags: list[dict[str, Any]] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    topology_branch_executed: bool = True
    metrics: dict[str, Any] = Field(default_factory=dict)


class TracerL2Agent(BaseAgent):
    """Product Agent 03: Tracer L2 Linework Runs.

    Deterministically extracts and measures duct/pipe runs using local vector topology,
    enforces the Fail-Closed Scale Invariant, applies semantic labeling via native text
    and point-of-need muse-spark-1.3, splits ambiguous junctions, and emits SUGGESTED
    annotations with evidence IDs.
    """

    agent_id: str = AgentID.AGENT_03_TRACER_L2.value
    agent_name: str = "Product Agent 03 (Tracer L2 Linework)"
    agent_version: str = "1.0.0"
    is_llm_agent: bool = False
    use_topology: bool = True

    def __init__(
        self,
        client: MetaModelClient | None = None,
        use_topology: bool = True,
        representation_config_path: str | Path = "configs/l2/route-representation.yaml",
        topology_config_path: str | Path = "configs/l2/continuity-topology.yaml",
        store: TakeoffStore | None = None,
    ) -> None:
        self.client = client or MetaModelClient()
        self.use_topology = use_topology
        self.rep_config_path = Path(representation_config_path)
        self.topo_config_path = Path(topology_config_path)
        self.store = store

    # -----------------------------------------------------------------------
    # Subsystem A: Deterministic Vector Extraction
    # -----------------------------------------------------------------------
    def extract_linework_runs(
        self,
        pdf_path: str | Path,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        discipline: str | None = None,
        scale_status: ScaleStatus | str | None = None,
        scale_ratio: float | None = None,
        scale_override: str | None = None,
        use_topology: bool | None = None,
    ) -> list[dict[str, Any]]:
        """Extract deterministic linear runs using vector topology pipeline."""
        disc = discipline or (sheet_metadata.discipline.lower() if sheet_metadata else "mechanical")
        run_topo = self.use_topology if use_topology is None else use_topology
        dense_page = False
        if run_topo:
            try:
                dense_page = (
                    _page_drawing_object_count(pdf_path, page_index)
                    > _TOPOLOGY_DRAWING_OBJECT_LIMIT
                )
            except (OSError, RuntimeError, ValueError) as exc:
                # A failed preflight must not weaken scale or geometry handling;
                # continue through the normal deterministic topology pipeline.
                logger.debug("Vector density preflight unavailable: %s", exc)

        try:
            # Primary execution: topology branch
            pipeline_result = run_l2_pipeline(
                pdf_path=pdf_path,
                page_num=page_index,
                discipline=disc,
                scale_override=scale_override,
                use_topology=run_topo and not dense_page,
                use_centerline=not dense_page,
                representation_config_path=self.rep_config_path,
                topology_config_path=self.topo_config_path,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Topology pipeline run failed (%s); attempting fallback", exc)
            try:
                pipeline_result = run_l2_pipeline(
                    pdf_path=pdf_path,
                    page_num=page_index,
                    discipline=disc,
                    scale_override=scale_override,
                    use_topology=False,
                    use_centerline=True,
                )
            except Exception as fallback_exc:  # noqa: BLE001
                logger.warning("Pipeline fallback also failed: %s", fallback_exc)
                return []

        # Topology can successfully return an empty plan result on dense vector
        # sheets without raising. For unscaled plans only, retry the legacy
        # deterministic assembler so geometry remains available for engineer
        # review; never use this path to create scaled measurements.
        used_review_fallback = dense_page
        if (
            run_topo
            and not pipeline_result.get("results")
            and pipeline_result.get("filtered_count", 0) > 0
            and pipeline_result.get("drawing_type") == "PLAN_VIEW_UNSCALED"
            and pipeline_result.get("scale_status") in {"SCALE_UNREADABLE", "UNVERIFIED"}
        ):
            try:
                pipeline_result = run_l2_pipeline(
                    pdf_path=pdf_path,
                    page_num=page_index,
                    discipline=disc,
                    scale_override=scale_override,
                    use_topology=False,
                    use_centerline=False,
                    representation_config_path=self.rep_config_path,
                    topology_config_path=self.topo_config_path,
                )
                used_review_fallback = True
            except Exception as fallback_exc:  # noqa: BLE001
                logger.warning("Unscaled-plan review fallback failed: %s", fallback_exc)
                return []

        raw_segment_count = pipeline_result.get("raw_segment_count", 0)
        if raw_segment_count == 0:
            # Raster-only or empty sheet: fail closed with zero fabricated linework
            return []

        raw_results = pipeline_result.get("results", [])
        runs: list[dict[str, Any]] = []

        for item in raw_results:
            points: list[list[float]] = []
            if "location_or_path" in item and isinstance(item["location_or_path"], dict):
                points = item["location_or_path"].get("points", [])
            elif "polyline" in item:
                points = item["polyline"]
            elif "geometry" in item and isinstance(item["geometry"], dict):
                points = item["geometry"].get("points", [])

            geo_len = float(item.get("geometric_length_pt", 0.0))
            if not geo_len and points and len(points) >= 2:
                # Calculate Euclidean length in points
                geo_len = sum(
                    math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    for p1, p2 in itertools.pairwise(points)
                )

            obj_type = item.get("object_type", "duct")
            category = "PIPING" if obj_type == "pipe" else "DUCTWORK"

            run = {
                    "run_id": item.get("object_id") or item.get("run_id") or f"run_{uuid.uuid4().hex[:8]}",
                    "category": category,
                    "system": item.get("system", "General"),
                    "dimension_label": item.get("dimension_label", "Unknown"),
                    "object_type": obj_type,
                    "polyline": points,
                    "geometry": {"type": "polyline", "points": points},
                    "length_pt": geo_len,
                    "continuity_status": item.get("continuity_status", "CONTINUOUS"),
                    "uncertainty_codes": item.get("uncertainty_codes", []),
                }
            if used_review_fallback:
                fallback_code = (
                    "TOPOLOGY_DENSITY_FALLBACK" if dense_page else "TOPOLOGY_EMPTY_FALLBACK"
                )
                run["uncertainty_codes"] = [*run["uncertainty_codes"], fallback_code]
                run["continuity_status"] = "REVIEW_REQUIRED"
            runs.append(run)

        return runs

    # -----------------------------------------------------------------------
    # Subsystem B: Strict Fail-Closed Scale Rule & Takeoff Conversion
    # -----------------------------------------------------------------------
    def to_takeoff_records(
        self,
        raw_runs: list[dict[str, Any]],
        sheet_meta: SheetMetadata,
        ev_gen: EvidenceIDGenerator,
        project_id: str | None = None,
    ) -> list[TakeoffRecord]:
        """Convert linear runs to TakeoffRecords enforcing Fail-Closed Scale Rule."""
        records: list[TakeoffRecord] = []
        is_scale_valid = (
            sheet_meta.scale_status in (ScaleStatus.VERIFIED.value, ScaleStatus.CALIBRATED.value, "VERIFIED", "CALIBRATED")
            and sheet_meta.scale_ratio is not None
            and sheet_meta.scale_ratio > 0.0
        )
        proj_id = project_id or getattr(ev_gen, "project_id", "default_project") or "default_project"

        for run in raw_runs:
            points: list[list[float]] = []
            if "polyline" in run and isinstance(run["polyline"], list):
                points = run["polyline"]
            elif "geometry" in run and isinstance(run["geometry"], dict):
                points = run["geometry"].get("points", [])

            geo_len_pt = float(run.get("length_pt", 0.0))
            if not geo_len_pt and points and len(points) >= 2:
                geo_len_pt = sum(
                    math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    for p1, p2 in itertools.pairwise(points)
                )

            # Apply Fail-Closed Scale Formula
            if is_scale_valid and sheet_meta.scale_ratio is not None:
                # (geo_len_pt / 72.0 pt/in) * (scale_ratio in_reality / 12.0 in/ft)
                length_ft = round((geo_len_pt / 72.0) * (sheet_meta.scale_ratio / 12.0), 4)
                length_m: float | None = round(length_ft * 0.3048, 4)
            else:
                # LOCKED TO ZERO when scale is unverified or conflicting
                length_ft = 0.0
                length_m = None

            category_val = run.get("category", "DUCTWORK").upper()
            category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"] = (
                "PIPING" if category_val == "PIPING" else "DUCTWORK"
            )

            run_id = str(run.get("run_id") or uuid.uuid4().hex[:8])
            evidence_id = ev_gen.mint_item_evidence(sheet_meta.sheet_id, category, run_id.replace("RUN-", "").lower())

            geom: dict[str, Any] = {
                "type": "polyline",
                "points": points,
                "length_m": length_m,
                "evidence_id": evidence_id,
                "geometric_length_pt": geo_len_pt,
            }
            if run.get("uncertainty_codes"):
                geom["uncertainty_codes"] = run["uncertainty_codes"]

            record = TakeoffRecord(
                item_id=evidence_id,
                project_id=proj_id,
                sheet_id=sheet_meta.sheet_id,
                category=category,
                system=run.get("system", "General"),
                dimension_label=run.get("dimension_label", "Unknown"),
                status="SUGGESTED",
                source="VECTOR_ENGINE",
                total_length_ft=length_ft,
                count=1,
                geometry=geom,
                confidence=0.90 if points else None,
                review_required=True,
            )
            records.append(record)

        return records

    # -----------------------------------------------------------------------
    # Subsystem C: Spark Semantic Labeling Engine
    # -----------------------------------------------------------------------
    def label_run_semantics(
        self,
        run: dict[str, Any],
        nearby_text: str | None = None,
        page: pymupdf.Page | None = None,
    ) -> dict[str, Any]:
        """Assign system classification and dimension label without altering vector geometry."""
        labeled = dict(run)
        # Invariant: deep copy geometry points to guarantee vector coordinates are never mutated
        if "geometry" in labeled and isinstance(labeled["geometry"], dict):
            pts = labeled["geometry"].get("points", [])
            labeled["geometry"] = dict(labeled["geometry"])
            labeled["geometry"]["points"] = [p[:] for p in pts]

        text_to_check = nearby_text or ""
        if not text_to_check and page is not None and "polyline" in labeled:
            pts = labeled["polyline"]
            if pts:
                # Find nearby words on page
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                clip = pymupdf.Rect(min(xs) - 25.0, min(ys) - 25.0, max(xs) + 25.0, max(ys) + 25.0)
                words = page.get_text("words", clip=clip) or []
                text_to_check = " ".join(w[4] for w in words)

        # 1. System Recognition
        if _SUPPLY_RE.search(text_to_check):
            labeled["system"] = "SupplyAir"
        elif _RETURN_RE.search(text_to_check):
            labeled["system"] = "ReturnAir"
        elif _EXHAUST_RE.search(text_to_check):
            labeled["system"] = "ExhaustAir"
        elif _OUTSIDE_AIR_RE.search(text_to_check):
            labeled["system"] = "OutsideAir"
        elif _CW_RE.search(text_to_check):
            labeled["system"] = "DomesticColdWater"
        elif _HW_RE.search(text_to_check):
            labeled["system"] = "DomesticHotWater"
        elif _SAN_RE.search(text_to_check):
            labeled["system"] = "Sanitary"

        # 2. Dimension Recognition
        m_rect = _RECT_DUCT_RE.search(text_to_check)
        if m_rect:
            labeled["dimension_label"] = f"{m_rect.group(1)}x{m_rect.group(2)}"
        else:
            m_round = _ROUND_DUCT_RE.search(text_to_check)
            if m_round:
                labeled["dimension_label"] = f'{m_round.group(1)}" dia'
            else:
                m_pipe = _PIPE_DIM_RE.search(text_to_check)
                if m_pipe:
                    labeled["dimension_label"] = f'{m_pipe.group(1)}" pipe'

        return labeled

    # -----------------------------------------------------------------------
    # Subsystem D: Ambiguous Junction & Broken Continuity Split Machine
    # -----------------------------------------------------------------------
    def resolve_junction_topology(
        self, paths: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Detect ambiguous intersections; split paths instead of bridging and emit flags.

        Geometric Invariant:
        When two or more linear runs cross in their interior, each intersecting polyline
        is split into distinct sub-segments at the intersection point (x, y). Each resulting
        sub-segment inherits the parent's semantic attributes, receives an updated run_id,
        recalculates its geometric length, sets continuity_status='REVIEW_REQUIRED', and adds
        'AMBIGUOUS_JUNCTION' to its uncertainty_codes.
        """
        if len(paths) < 2:
            return list(paths), []

        split_paths: list[dict[str, Any]] = []
        flags: list[dict[str, Any]] = []

        # 1. Build valid LineStrings and map to original path indices
        valid_lines: list[LineString] = []
        valid_indices: list[int] = []

        for idx, p in enumerate(paths):
            pts = p.get("polyline") or p.get("geometry", {}).get("points") or []
            if len(pts) >= 2:
                try:
                    ls = LineString(pts)
                    if ls.length > 1e-4:
                        valid_lines.append(ls)
                        valid_indices.append(idx)
                except Exception:  # noqa: BLE001, S110
                    pass

        if len(valid_lines) < 2:
            return list(paths), []

        # 2. Query spatial index for interior crossing intersections
        tree = STRtree(valid_lines)
        pairs = tree.query(valid_lines, predicate="crosses")

        split_points_per_path: dict[int, list[Point]] = {}

        for a, b in zip(pairs[0], pairs[1]):
            if a >= b:
                continue
            orig_a = valid_indices[a]
            orig_b = valid_indices[b]
            ls_a = valid_lines[a]
            ls_b = valid_lines[b]

            try:
                inter = ls_a.intersection(ls_b)
            except Exception:  # noqa: BLE001, S112
                continue

            inter_pts: list[Point] = []
            if inter.geom_type == "Point":
                inter_pts = [inter]
            elif inter.geom_type == "MultiPoint":
                inter_pts = list(inter.geoms)

            for pt in inter_pts:
                if ls_a.distance(pt) < 1e-5 and ls_b.distance(pt) < 1e-5:
                    split_points_per_path.setdefault(orig_a, []).append(pt)
                    split_points_per_path.setdefault(orig_b, []).append(pt)
                    flags.append({
                        "flag_id": uuid.uuid4().hex[:12],
                        "type": "AMBIGUOUS_JUNCTION_SPLIT",
                        "severity": "WARNING",
                        "message": (
                            f"Crossing junction between path {orig_a} and {orig_b} "
                            f"at ({pt.x:.1f}, {pt.y:.1f}) split without bridging."
                        ),
                        "paths": [orig_a, orig_b],
                        "coordinates": [round(pt.x, 2), round(pt.y, 2)],
                    })

        # 2b. Query spatial index for Tee-junctions (one endpoint touches interior of another run)
        touch_pairs = tree.query(valid_lines, predicate="touches")
        for a, b in zip(touch_pairs[0], touch_pairs[1]):
            if a >= b:
                continue
            orig_a = valid_indices[a]
            orig_b = valid_indices[b]
            ls_a = valid_lines[a]
            ls_b = valid_lines[b]

            try:
                inter = ls_a.intersection(ls_b)
            except Exception:  # noqa: BLE001, S112
                continue

            inter_pts = []
            if inter.geom_type == "Point":
                inter_pts = [inter]
            elif inter.geom_type == "MultiPoint":
                inter_pts = list(inter.geoms)

            for pt in inter_pts:
                dist_bound_a = ls_a.boundary.distance(pt) if not ls_a.boundary.is_empty else float("inf")
                dist_bound_b = ls_b.boundary.distance(pt) if not ls_b.boundary.is_empty else float("inf")
                a_interior = dist_bound_a > 1e-4 and ls_a.distance(pt) < 1e-5
                b_interior = dist_bound_b > 1e-4 and ls_b.distance(pt) < 1e-5
                if a_interior or b_interior:
                    if a_interior:
                        split_points_per_path.setdefault(orig_a, []).append(pt)
                    if b_interior:
                        split_points_per_path.setdefault(orig_b, []).append(pt)
                    flags.append({
                        "flag_id": uuid.uuid4().hex[:12],
                        "type": "AMBIGUOUS_JUNCTION_SPLIT",
                        "junction_subtype": "TEE",
                        "severity": "WARNING",
                        "message": (
                            f"Tee-junction between path {orig_a} and {orig_b} "
                            f"at ({pt.x:.1f}, {pt.y:.1f}) split on trunk without bridging."
                        ),
                        "paths": [orig_a, orig_b],
                        "coordinates": [round(pt.x, 2), round(pt.y, 2)],
                    })

        # 3. Split intersecting polylines at crossing points
        for idx, p in enumerate(paths):
            if idx not in split_points_per_path:
                split_paths.append(p)
                continue

            pts_to_split = split_points_per_path[idx]
            orig_poly = p.get("polyline") or p.get("geometry", {}).get("points") or []
            try:
                ls = LineString(orig_poly)
                splitter = MultiPoint(pts_to_split) if len(pts_to_split) > 1 else pts_to_split[0]
                split_res = shapely_split(ls, splitter)
                sub_geoms = [list(g.coords) for g in split_res.geoms if len(g.coords) >= 2]
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to split polyline at junction: %s", exc)
                sub_geoms = [orig_poly]

            if not sub_geoms:
                sub_geoms = [orig_poly]

            for s_idx, sg in enumerate(sub_geoms):
                sub_p = dict(p)
                sub_p["run_id"] = f"{p.get('run_id', f'run_{idx}')}_split_{s_idx}"
                sub_p["polyline"] = [list(c) for c in sg]
                sub_p["geometry"] = {"type": "polyline", "points": sub_p["polyline"]}
                sub_p["continuity_status"] = "REVIEW_REQUIRED"
                unc = list(p.get("uncertainty_codes", []))
                if "AMBIGUOUS_JUNCTION" not in unc:
                    unc.append("AMBIGUOUS_JUNCTION")
                sub_p["uncertainty_codes"] = unc
                sub_p["length_pt"] = sum(
                    math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    for p1, p2 in itertools.pairwise(sub_p["polyline"])
                )
                split_paths.append(sub_p)

        return split_paths, flags

    # -----------------------------------------------------------------------
    # Main BaseAgent Execution Interfaces
    # -----------------------------------------------------------------------
    async def run(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        sheet_id: str | None = None,
        discipline: str | None = None,
        scale_status: ScaleStatus | str | None = None,
        scale_ratio: float | None = None,
        scale_override: str | None = None,
        use_topology: bool | None = None,
        **kwargs: Any,
    ) -> AgentResult:
        """Run full linework tracing synchronously."""
        events: list[AgentEvent] = []
        items: list[TakeoffRecord] = []
        flags: list[dict[str, Any]] = []

        async for ev in self.run_stream(
            context,
            page_index=page_index,
            sheet_metadata=sheet_metadata,
            sheet_id=sheet_id,
            discipline=discipline,
            scale_status=scale_status,
            scale_ratio=scale_ratio,
            scale_override=scale_override,
            use_topology=use_topology,
            **kwargs,
        ):
            events.append(ev)
            if ev.event_type == AgentEventType.ITEMS_EMITTED:
                raw_items = ev.payload.get("items", [])
                items = [it if isinstance(it, TakeoffRecord) else TakeoffRecord(**it) for it in raw_items]
            elif ev.event_type == AgentEventType.FLAG_RAISED:
                flags.append(ev.payload)

        pdf_stem = context.pdf_path.stem if context.pdf_path is not None else "sheet"
        sheet_ident = sheet_id or (sheet_metadata.sheet_id if sheet_metadata else f"{pdf_stem}_p{page_index}")
        return AgentResult(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=True,
            sheet_id=sheet_ident,
            review_required=True,
            items=items,
            flags=flags,
            events=events,
        )

    def _label_runs_from_pdf(
        self, pdf_path: str | Path, page_index: int, runs: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Index page words once, then label runs without repeated clipped PDF scans."""
        doc = pymupdf.open(str(pdf_path))
        try:
            page = doc[page_index]
            if not runs:
                return []
            words = page.get_text("words") or []
            word_boxes = [box(float(word[0]), float(word[1]), float(word[2]), float(word[3])) for word in words]
            word_tree = STRtree(word_boxes) if word_boxes else None
            labeled: list[dict[str, Any]] = []
            for run in runs:
                points = run.get("polyline") or run.get("geometry", {}).get("points", [])
                nearby_text = ""
                if points and word_tree is not None:
                    xs = [float(point[0]) for point in points]
                    ys = [float(point[1]) for point in points]
                    clip = box(min(xs) - 25.0, min(ys) - 25.0, max(xs) + 25.0, max(ys) + 25.0)
                    word_indices = sorted(int(index) for index in word_tree.query(clip, predicate="intersects"))
                    nearby_text = " ".join(str(words[index][4]) for index in word_indices)
                labeled.append(self.label_run_semantics(run, nearby_text=nearby_text))
            return labeled
        finally:
            doc.close()

    async def run_stream(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        sheet_id: str | None = None,
        discipline: str | None = None,
        scale_status: ScaleStatus | str | None = None,
        scale_ratio: float | None = None,
        scale_override: str | None = None,
        use_topology: bool | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream linework tracing execution events."""
        start_time = time.monotonic()
        job_id = context.job_id
        pdf_path = context.pdf_path
        if pdf_path is None:
            raise ValueError("AgentContext.pdf_path is required for TracerL2Agent")
        ev_gen = context.evidence_generator
        disc = discipline or (sheet_metadata.discipline.lower() if sheet_metadata else "mechanical")
        sheet_ident = sheet_id or (sheet_metadata.sheet_id if sheet_metadata else f"{pdf_path.stem}_p{page_index}")

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.STARTED,
            sheet_id=sheet_ident,
            page_index=page_index,
            progress=0.0,
            message=f"Starting linework tracing on {sheet_ident}",
            payload={"discipline": disc, "sheet_id": sheet_ident},
        )

        # 1. Deterministic vector linework extraction
        extract_task = asyncio.create_task(asyncio.to_thread(
            self.extract_linework_runs,
            pdf_path=pdf_path,
            page_index=page_index,
            sheet_metadata=sheet_metadata,
            discipline=disc,
            scale_status=scale_status,
            scale_ratio=scale_ratio,
            scale_override=scale_override,
            use_topology=use_topology,
        ))
        while not extract_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(extract_task), timeout=5.0)
            except TimeoutError:
                elapsed = round(time.monotonic() - start_time, 1)
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.PROGRESS,
                    sheet_id=sheet_ident,
                    page_index=page_index,
                    progress=0.10,
                    message=f"Vector topology extraction is still running ({elapsed}s)",
                    payload={"phase": "vector_extraction", "elapsed_seconds": elapsed},
                )
        runs = await extract_task

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=sheet_ident,
            page_index=page_index,
            progress=0.40,
            message=f"Extracted {len(runs)} raw linework runs via vector topology",
            payload={"runs_extracted": len(runs)},
        )

        # 2. Semantic labeling pass
        fallback_review = bool(runs) and all(
            any(
                code in r.get("uncertainty_codes", [])
                for code in ("TOPOLOGY_EMPTY_FALLBACK", "TOPOLOGY_DENSITY_FALLBACK")
            )
            for r in runs
        )
        if fallback_review:
            # Avoid per-run text lookups on thousands of fallback geometries.
            # Their semantics and connectivity remain explicitly unreviewed.
            labeled_runs = runs
        else:
            label_task = asyncio.create_task(asyncio.to_thread(
                self._label_runs_from_pdf, pdf_path, page_index, runs
            ))
            while not label_task.done():
                try:
                    await asyncio.wait_for(asyncio.shield(label_task), timeout=5.0)
                except TimeoutError:
                    elapsed = round(time.monotonic() - start_time, 1)
                    yield AgentEvent(
                        job_id=job_id,
                        agent_id=self.agent_id,
                        event_type=AgentEventType.PROGRESS,
                        sheet_id=sheet_ident,
                        page_index=page_index,
                        progress=0.55,
                        message=f"Semantic labeling is still running ({elapsed}s)",
                        payload={"phase": "semantic_labeling", "elapsed_seconds": elapsed},
                    )
            labeled_runs = await label_task

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=sheet_ident,
            page_index=page_index,
            progress=0.65,
            message="Completed semantic labeling pass on extracted runs",
            payload={"runs_labeled": len(labeled_runs)},
        )

        # 3. Ambiguous junction topology resolution & splitting
        if fallback_review:
            split_runs = labeled_runs
            density_fallback = any(
                "TOPOLOGY_DENSITY_FALLBACK" in run.get("uncertainty_codes", [])
                for run in labeled_runs
            )
            fallback_code = (
                "TOPOLOGY_DENSITY_FALLBACK" if density_fallback else "TOPOLOGY_EMPTY_FALLBACK"
            )
            junction_flags: list[dict[str, Any]] = [{
                "flag_id": uuid.uuid4().hex[:12],
                "type": fallback_code,
                "severity": "HIGH",
                "message": (
                    "This sheet exceeds the topology density budget. Deterministic vector fallback "
                    "geometry is shown for engineer review; connectivity and system labels are unresolved."
                    if density_fallback
                    else "Topology extraction returned no routes. Deterministic fallback geometry is shown "
                    "for engineer review; connectivity and system labels are unresolved."
                ),
                "run_count": len(labeled_runs),
            }]
        else:
            split_runs, junction_flags = self.resolve_junction_topology(labeled_runs)

        # Intersections are audit details, but emitting one live event per
        # crossing floods the package review surface on dense CAD sheets.
        # Keep the count, subtype breakdown, affected path ids, and a few
        # example coordinates in one review flag per sheet.
        ambiguous_flags = [
            flag for flag in junction_flags
            if flag.get("type") == "AMBIGUOUS_JUNCTION_SPLIT"
        ]
        if len(ambiguous_flags) > 1:
            subtype_counts: dict[str, int] = {}
            affected_paths: set[int] = set()
            sample_coordinates: list[list[float]] = []
            for flag in ambiguous_flags:
                subtype = str(flag.get("junction_subtype", "CROSSING"))
                subtype_counts[subtype] = subtype_counts.get(subtype, 0) + 1
                paths: list[Any] = flag.get("paths", []) if isinstance(flag.get("paths"), list) else []
                affected_paths.update(path for path in paths if isinstance(path, int))
                coordinates = flag.get("coordinates")
                if isinstance(coordinates, list) and len(sample_coordinates) < 8:
                    sample_coordinates.append(coordinates)
            junction_flags = [
                flag for flag in junction_flags
                if flag.get("type") != "AMBIGUOUS_JUNCTION_SPLIT"
            ]
            junction_flags.append({
                "flag_id": uuid.uuid4().hex[:12],
                "type": "AMBIGUOUS_JUNCTION_SPLIT",
                "severity": "WARNING",
                "message": (
                    f"{len(ambiguous_flags)} ambiguous junctions were kept split on this sheet. "
                    "Review the affected linework before accepting connected runs."
                ),
                "junction_count": len(ambiguous_flags),
                "junction_subtypes": subtype_counts,
                "affected_path_count": len(affected_paths),
                "sample_coordinates": sample_coordinates,
            })

        # Emit junction flags as AgentEventType.FLAG_RAISED
        for flag in junction_flags:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sheet_ident,
                page_index=page_index,
                progress=0.75,
                message=str(flag.get("message") or "Ambiguous junction split without bridging"),
                payload=flag,
            )

        # 4. Create or resolve SheetMetadata
        disc_clean: Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"] = "MECHANICAL"
        disc_upper = disc.upper()
        if disc_upper in ("MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"):
            disc_clean = disc_upper  # type: ignore[assignment]

        scale_status_val: Literal["VERIFIED", "UNVERIFIED", "CALIBRATED"] = "UNVERIFIED"
        raw_scale = str(scale_status.value if isinstance(scale_status, ScaleStatus) else (scale_status or "UNVERIFIED")).upper()
        if raw_scale in ("VERIFIED", "UNVERIFIED", "CALIBRATED"):
            scale_status_val = raw_scale  # type: ignore[assignment]

        meta = sheet_metadata or SheetMetadata(
            sheet_id=sheet_ident,
            page_index=page_index,
            sheet_number=f"M-{page_index + 1}",
            sheet_title="HVAC Plan",
            discipline=disc_clean,
            scale_status=scale_status_val,
            scale_ratio=scale_ratio,
            width_pt=1000.0,
            height_pt=800.0,
        )

        # 5. Construct TakeoffRecords with Fail-Closed Scale Rule
        records = (
            []
            if fallback_review
            else self.to_takeoff_records(split_runs, meta, ev_gen, project_id=context.project_id)
        )

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.ITEMS_EMITTED,
            sheet_id=sheet_ident,
            page_index=page_index,
            progress=0.90,
            message=(
                f"Suppressed {len(split_runs)} fallback linework candidates; topology needs engineer review"
                if fallback_review
                else f"Emitted {len(records)} linear linework takeoff items"
            ),
            payload={
                "items": [r.model_dump() for r in records],
                "item_count": len(records),
                "candidate_count": len(split_runs),
                "suppressed_fallback": fallback_review,
                "review_required": fallback_review,
            },
        )

        elapsed = round(time.monotonic() - start_time, 2)
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.COMPLETED,
            sheet_id=sheet_ident,
            page_index=page_index,
            progress=1.0,
            message=f"Linework tracer completed in {elapsed}s: {len(records)} runs processed",
            payload={"items_count": len(records), "elapsed_seconds": elapsed},
        )
