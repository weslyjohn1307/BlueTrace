"""Level 2 unified pipeline: PDF → structured measured linear runs.

Integrates:
  1. extractor.py  — ADR-001 (VECTOR-FIRST native PDF extraction + MEP filtering)
  2. scale.py      — ADR-002 (fail-closed scale gating)
  3. continuity.py — ADR-004 (deterministic collinear splicing + gap bridging)
  4. schema.py     — output contract (5-field public schema)

Plumbing taxonomy mapping: ADR-006 (duct_segment → pipe for plumbing discipline).

Entry point: run_l2_pipeline(pdf_path, page_num, discipline)

SCOPE LIMITATIONS (IMPLEMENTATION BASELINE — not production-validated):
  - This vertical slice operates on single-page PDFs from the training set.
  - The MEP filter uses stroke-attribute heuristics validated on 6 training sheets.
  - Physical lengths reflect the assembled geometric extent in PDF points converted
    via the validated scale ratio; they do NOT claim universal accuracy.
  - Double-line ductwork: length reflects the derived centerline corridor
    (paired boundary midpoints, centerline.py), not boundary perimeter.
    Mechanical boundaries not consumed by pairing fall back to legacy
    continuity assembly so no candidate linework is silently dropped.
  - Leftover boundaries with a plausible failed partner (see
    _has_plausible_failed_partner) are BOUNDARY_UNRESOLVED: flagged,
    excluded from rollups, SUGGESTED-only downstream. Leftovers with no
    such partner are inferred single-line representation (representation.py
    EXPLICIT_CENTERLINE / SINGLE_LINE_ROUTE; the topology classifier
    likewise promotes unassigned mechanical edges to single-line routes):
    measured once, unflagged. Limitation: a wall whose partner was
    filtered upstream is indistinguishable from single-line representation
    and is measured once as inferred single-line (provenance = inference,
    not verified).
"""

from __future__ import annotations

import collections
import copy
import hashlib
import json
import math
import re
import threading
from dataclasses import asdict
from pathlib import Path

import pymupdf
import yaml

from src.core_vector.centerline import (
    CenterlineOptions,
    derive_centerlines,
    synthesize_elbow_intersections,
)
from src.core_vector.continuity import assemble_runs, build_route_topology
from src.core_vector.extractor import (
    classify_page_role,
    detect_viewports,
    extract_line_segments,
    extract_raw_primitives,
    filter_mep_candidates,
    gate_semantic_candidates,
)
from src.core_vector.representation import classify_representation
from src.core_vector.scale import detect_scale
from src.core_vector.schema import (
    DrawingType,
    L2Result,
    LinearRun,
    ScaleDecision,
    ScaleStatus,
)


class _ThreadSafeLRUCache:
    def __init__(self, maxsize: int = 128) -> None:
        self.maxsize = maxsize
        self._cache: collections.OrderedDict[tuple, dict] = collections.OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple) -> dict | None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None

    def set(self, key: tuple, value: dict) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = copy.deepcopy(value)
            if len(self._cache) > self.maxsize:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


_L2_PIPELINE_CACHE = _ThreadSafeLRUCache(maxsize=128)


def clear_l2_cache() -> None:
    """Clear the Level 2 geometry pipeline LRU cache."""
    _L2_PIPELINE_CACHE.clear()


def _compute_file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


# --- Discipline detection (from filename and sheet text) ---
_DISCIPLINE_MECH_KEYWORDS = re.compile(
    r"(?:^|[^a-zA-Z])(MECH|MECHANICAL|HVAC|DUCT|DUCTWORK)(?:[^a-zA-Z]|$)", re.IGNORECASE
)
_DISCIPLINE_PLUMB_KEYWORDS = re.compile(
    r"(?:^|[^a-zA-Z])(PLUMB|PLUMBING|PIPE|PIPES|PIPELINE|PIPELINES|SANITARY|WATER|DRAINAGE)(?:[^a-zA-Z]|$)",
    re.IGNORECASE,
)

# --- Sheet identity regex (shared with batch_runner.py) ---
_SHEET_ID_REGEX = re.compile(
    r"(?:^|[\W_])([MPE]|FP|PP)\s*[-._]?\s*(\d{1,4}(?:[._]\d+)?)(?:[\W_]|$)",
    re.IGNORECASE,
)


def _infer_discipline(pdf_path: Path, page_text: str, sheet_id: str = "") -> str:
    """Infer MEP discipline from sheet_id, filename, and page text."""
    if sheet_id.startswith("P") and not sheet_id.startswith("PP"):
        return "plumbing"
    if sheet_id.startswith("M"):
        return "mechanical"

    combined = str(pdf_path) + " " + page_text
    if _DISCIPLINE_PLUMB_KEYWORDS.search(combined):
        return "plumbing"
    if _DISCIPLINE_MECH_KEYWORDS.search(combined):
        return "mechanical"
    return "mechanical"  # Default for ambiguous — treats as duct


def _object_type_for_discipline(discipline: str) -> tuple[str, str]:
    """Return (source_annotation_class, public_object_type) for the discipline.

    ADR-006: plumbing duct_segment annotations map to public "pipe".
    Mechanical duct_segment annotations map to public "duct".
    """
    if discipline == "plumbing":
        return "duct_segment", "pipe"
    return "duct_segment", "duct"


def _extract_sheet_id(page_text: str, pdf_stem: str, page_num: int) -> str:
    """Extract AEC sheet ID from text, with deterministic stem fallback."""
    lines = [line.strip() for line in page_text.split("\n") if line.strip()]
    for line in lines[-30:]:
        match = _SHEET_ID_REGEX.search(line)
        if match:
            prefix = match.group(1).upper()
            num = match.group(2).replace("_", ".")
            sep = "-" if "-" in match.group(0) else ""
            return f"{prefix}{sep}{num}"

    # Fallback to inspecting the PDF stem
    stem_match = _SHEET_ID_REGEX.search(pdf_stem)
    if stem_match:
        prefix = stem_match.group(1).upper()
        num = stem_match.group(2).replace("_", ".")
        sep = "-" if "-" in stem_match.group(0) else ""
        return f"{prefix}{sep}{num}"

    return f"{pdf_stem}_p{page_num + 1}"


# Public API aliases
extract_sheet_id = _extract_sheet_id
infer_discipline = _infer_discipline

# --- Plausible-failed-partner heuristics (Refined Fix 1, domain ruling) ---
# These are documented heuristics, NOT standards (not SMACNA/ASHRAE or any
# drafting standard). They decide only whether an unpaired leftover looks
# like one wall of a failed double-line pair (BOUNARY_UNRESOLVED) versus
# inferred single-line representation. Bounds are deliberately looser than
# the legacy pairing gates in centerline.CenterlineOptions so failures of
# those gates are still caught:
#   angle:    <= 10 deg (2x the legacy 5 deg pairing tolerance)
#   offset:   >= 4.0 pt (the legacy min corridor width; excludes
#             collinear/coincident splices) and <= 240.0 pt (2x the legacy
#             120 pt max corridor width, centerline.py CenterlineOptions)
#   overlap:  >= 5.0 pt longitudinal overlap (legacy overlap computation)
_PLAUSIBLE_MAX_ANGLE_DELTA_DEG = 10.0
_PLAUSIBLE_MIN_OFFSET_PT = 4.0
_PLAUSIBLE_MAX_OFFSET_PT = 240.0
_PLAUSIBLE_MIN_OVERLAP_PT = 5.0


def _seg_geometry(seg: object) -> tuple[float, float, float, float, float, float]:
    """Return (x0, y0, x1, y1, length_pt, angle_deg in [0, 180)) for a segment."""
    x0, y0 = float(getattr(seg, "x0", 0.0)), float(getattr(seg, "y0", 0.0))
    x1, y1 = float(getattr(seg, "x1", 0.0)), float(getattr(seg, "y1", 0.0))
    length = math.hypot(x1 - x0, y1 - y0)
    angle = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180.0
    return x0, y0, x1, y1, length, angle


def _plausible_partners(
    idx: int,
    geoms: list[tuple[float, float, float, float, float, float]],
) -> list[tuple[int, float]]:
    """Candidates satisfying (a)-(c) for segment idx, as (other_idx, signed_offset).

    Signed offset is the perpendicular distance of the candidate midpoint
    from idx's line, signed by idx's normal (its sign partitions the two
    sides of idx's line). Angle/offset/overlap mirror the legacy pairing
    computation in centerline.derive_centerlines.
    """
    ax0, ay0, ax1, ay1, len_a, ang_a = geoms[idx]
    if len_a < 1e-9:
        return []
    vax, vay = (ax1 - ax0) / len_a, (ay1 - ay0) / len_a
    nax, nay = -vay, vax
    out: list[tuple[int, float]] = []
    for j, (bx0, by0, bx1, by1, len_b, ang_b) in enumerate(geoms):
        if j == idx or len_b < 1e-9:
            continue
        # (a) angle difference (legacy undirected formulation, [0, 90])
        delta = abs(ang_a - ang_b)
        if delta > 90.0:
            delta = 180.0 - delta
        if delta > _PLAUSIBLE_MAX_ANGLE_DELTA_DEG:
            continue
        # (b) perpendicular offset of candidate midpoint from idx's line
        signed = ((bx0 + bx1) * 0.5 - ax0) * nax + ((by0 + by1) * 0.5 - ay0) * nay
        if not (_PLAUSIBLE_MIN_OFFSET_PT <= abs(signed) <= _PLAUSIBLE_MAX_OFFSET_PT):
            continue
        # (c) longitudinal overlap along idx's axis (legacy computation)
        s_b0 = (bx0 - ax0) * vax + (by0 - ay0) * vay
        s_b1 = (bx1 - ax0) * vax + (by1 - ay0) * vay
        overlap_len = min(len_a, max(s_b0, s_b1)) - max(0.0, min(s_b0, s_b1))
        if overlap_len < _PLAUSIBLE_MIN_OVERLAP_PT:
            continue
        out.append((j, signed))
    return out


def _has_plausible_failed_partner(
    idx: int,
    geoms: list[tuple[float, float, float, float, float, float]],
) -> bool:
    """True if segment idx has a plausible failed partner in the full pool.

    (d) mutually-nearest: a candidate counts only if it is the nearest
    plausible neighbour on its side of idx AND idx is the nearest
    plausible neighbour on its (corresponding) side of the candidate.
    Nearest-per-side also encodes "no other candidate intervening between
    them": any intervening plausible candidate would be nearer to both.
    The pool is ALL deduped candidates (consumed + leftover), so a
    leftover whose parallel neighbour was consumed by another pair is
    still unresolved.
    """
    partners = _plausible_partners(idx, geoms)
    # Nearest per side of idx.
    nearest_by_side: dict[int, tuple[int, float]] = {}
    for j, signed in partners:
        side = 1 if signed > 0 else -1
        if side not in nearest_by_side or abs(signed) < abs(nearest_by_side[side][1]):
            nearest_by_side[side] = (j, signed)
    for j, _signed in nearest_by_side.values():
        # Mutual check: idx must be nearest on its side of candidate j.
        reverse = _plausible_partners(j, geoms)
        mine = [s for k, s in reverse if k == idx]
        if not mine:
            continue
        my_side = 1 if mine[0] > 0 else -1
        nearest_on_my_side = min(
            (abs(s) for _k, s in reverse if (1 if s > 0 else -1) == my_side),
            default=None,
        )
        if nearest_on_my_side is not None and abs(mine[0]) <= nearest_on_my_side + 1e-9:
            return True
    return False


def _runs_to_l2_results(
    runs: list[LinearRun],
    scale: ScaleDecision,
    sheet_id: str,
    match_line_notes: list[str],
) -> list[L2Result]:
    """Convert assembled LinearRuns + scale decision into L2Result objects."""
    results: list[L2Result] = []
    for run in runs:
        if len(run.points) < 2:
            continue  # Skip degenerate single-point chains

        geo_pt = run.geometric_length_pt

        # Physical length: None when scale is not VALID (ADR-002)
        length_m = scale.to_physical_length_m(geo_pt)

        results.append(
            L2Result(
                object_type=run.object_type,
                location_or_path={
                    "type": "polyline",
                    "points": [[pt[0], pt[1]] for pt in run.points],
                    "coordinate_space": "pdf_user_space_pt",
                },
                confidence=0.90,  # Deterministic extraction — high but not 1.0
                length=round(length_m, 4) if length_m is not None else None,
                sheet_id=sheet_id,
                length_unit="m",
                scale_status=scale.status.value,
                scale_text=scale.scale_text,
                reason_code=scale.reason_code,
                has_unclosed_gaps=run.has_unclosed_gaps,
                source_segment_count=run.source_segment_count,
                geometric_length_pt=round(geo_pt, 4),
                source_annotation_class=run.category,
                match_line_notes=match_line_notes,
            )
        )
    return results


def run_l2_pipeline(
    pdf_path: str | Path,
    page_num: int = 0,
    discipline: str | None = None,
    scale_override: str | None = None,
    use_topology: bool = False,
    use_centerline: bool = True,
    fixture_id: str | None = None,
    representation_config_path: str | Path = "configs/l2/route-representation.yaml",
    topology_config_path: str | Path = "configs/l2/continuity-topology.yaml",
    strategy: str | None = None,
) -> dict:
    """Execute the Level 2 vertical slice on a single PDF page.

    Pipeline:
      PDF → vector extraction (ADR-001) → MEP filter → scale gate (ADR-002)
      → continuity assembly (ADR-004) → physical length → structured output

    Args:
        pdf_path: Path to the source PDF file (Training data only).
        page_num: Zero-indexed page number to process (default 0).
        discipline: Optional override for discipline inference ("mechanical"/"plumbing").
                    If None, inferred from sheet ID, filename, and page text.
        scale_override: Optional explicit scale string (e.g. '1/8" = 1\'-0"').
                        When None, scale is detected strictly from drawing text.
        use_topology: When True, run accepted Level 2 representation & topology pipeline (L2-03, L2-04-C1, G2).
        use_centerline: Legacy branch only. When True (default), mechanical
                        double-line boundaries are paired into midpoint
                        centerline corridors (with elbow apex synthesis) and
                        unpaired boundaries fall back to continuity assembly;
                        when False, the exact legacy boundary-perimeter
                        assembly runs unchanged.
        fixture_id: Optional fixture identifier (e.g. "hvac_plan_level2").
        representation_config_path: Route representation YAML config path.
        topology_config_path: Continuity topology YAML config path.
        strategy: Route representation strategy ("conservative_hybrid" or "legacy_1to1").
                  When None, determined by representation config YAML.

    Returns:
        A dict with keys:
          sheet_id:         AEC sheet identifier
          scale_status:     ScaleStatus value string
          scale_text:       Parsed scale string or None
          reason_code:      Reason for null length, or None
          drawing_type:     DrawingType value string
          raw_segment_count: Total raw segments extracted
          filtered_count:   MEP candidate count after filter
          rejected_count:   Raw segments rejected by filter
          run_count:        Number of assembled linear runs
          results:          List of dicts (L2Result.to_public_dict())
          total_length_m:   Sum of measured lengths (m), or None if scale invalid
          total_length_ft:  Sum of measured lengths (ft), or None
          discipline:       Inferred or provided discipline
          errors:           List of non-fatal error/warning strings

    Raises:
        FileNotFoundError: If the PDF file does not exist.
        RuntimeError: If PyMuPDF fails to open the document (propagated — fail closed).
    """
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    # Thread-safe LRU cache keyed by (pdf_hash, page_num, discipline, options_hash)
    pdf_hash = _compute_file_sha256(path)
    options_tuple = (
        scale_override,
        use_topology,
        use_centerline,
        fixture_id,
        str(representation_config_path),
        str(topology_config_path),
        strategy,
    )
    options_hash = hashlib.sha256(repr(options_tuple).encode("utf-8")).hexdigest()
    disc_norm = (
        discipline.strip().lower()
        if isinstance(discipline, str) and discipline.strip()
        else None
    )
    cache_key = (pdf_hash, page_num, disc_norm, options_hash)

    cached_result = _L2_PIPELINE_CACHE.get(cache_key)
    if cached_result is not None:
        return cached_result

    errors: list[str] = []

    doc = pymupdf.open(str(path))
    try:
        if page_num < 0 or page_num >= len(doc):
            raise ValueError(f"Page {page_num} does not exist in {path.name} ({len(doc)} pages)")

        page = doc[page_num]
        page_text = page.get_text("text")
        pdf_stem = path.stem
        fname = path.name

        # 1. Sheet identity
        sheet_id = _extract_sheet_id(page_text, pdf_stem, page_num)

        # 2. Discipline
        disc = disc_norm or _infer_discipline(path, page_text, sheet_id=sheet_id)
        resolved_disc_key = (
            pdf_hash,
            page_num,
            disc.strip().lower() if isinstance(disc, str) else disc,
            options_hash,
        )
        if resolved_disc_key != cache_key:
            cached_by_disc = _L2_PIPELINE_CACHE.get(resolved_disc_key)
            if cached_by_disc is not None:
                _L2_PIPELINE_CACHE.set(cache_key, cached_by_disc)
                return cached_by_disc
        source_class, pub_type = _object_type_for_discipline(disc)

        # 3. Fail-closed scale gating (ADR-002)
        scale = detect_scale(page_text, sheet_id, fname, scale_override=scale_override)

        # 4. Extract match-line notes (EXP-008/009)
        match_line_notes: list[str] = []
        ml_matches = re.findall(r"\d+\s*/\s*[A-Z]\d+(?:\.\d+)?", page_text)
        if ml_matches:
            match_line_notes = list(set(ml_matches))

        if use_topology:
            # Accepted Level 2 pipeline: representation + topology (L2-03, L2-04-C1, G2)
            fixture_id_val = fixture_id
            if not fixture_id_val:
                fixture_manifest_path = Path(
                    "docs/autonomous-execution/contracts/FIXTURE-MANIFEST.json"
                )
                if fixture_manifest_path.exists():
                    try:
                        fman = json.loads(fixture_manifest_path.read_text(encoding="utf-8"))
                        for fix in fman.get("fixtures", []):
                            if fix.get("sheet_id_metadata", {}).get("sheet_id") == sheet_id:
                                fixture_id_val = fix.get("fixture_id")
                                break
                            rel = fix.get("relative_path", "")
                            if rel and (path.name in rel or Path(rel).name == path.name):
                                fixture_id_val = fix.get("fixture_id")
                                break
                    except (OSError, json.JSONDecodeError, KeyError):
                        pass
            if not fixture_id_val:
                fixture_id_val = f"FIX-{sheet_id}"

            primitives = extract_raw_primitives(page, fixture_id_val, page_num)
            raw_count = len(primitives)

            role, _ = classify_page_role(page, {"page_role": "plan_view"})
            viewports = detect_viewports(page, sheet_id, disc, fixture_id_val)

            candidates, _audit, dlineage = gate_semantic_candidates(
                primitives=primitives,
                discipline=disc,
                viewports=viewports,
                fixture_id=fixture_id_val,
                page_role=role,
                page_width=page.rect.width,
                page_height=page.rect.height,
            )
            filtered_count = len(candidates)

            cands_dicts = [asdict(c) for c in candidates]
            dup_map: dict[str, list[str]] = {}
            for d in dlineage:
                dup_map.setdefault(d.retained_vector_id, []).append(d.raw_vector_id)
            strat = strategy
            rep_res = classify_representation(
                candidates=cands_dicts,
                duplicate_lineage=dup_map,
                config_path=str(representation_config_path),
                strategy=strat,
            )
            frags_dicts = [f.to_dict() for f in rep_res.route_fragments]
            acc_dicts = [a.to_dict() for a in rep_res.accounting_records]

            with open(topology_config_path, encoding="utf-8") as f:
                topo_config = yaml.safe_load(f)

            topo_res = build_route_topology(
                route_fragments=frags_dicts,
                candidate_accounting=acc_dicts,
                config=topo_config,
            )
            route_runs = topo_res["route_runs"]

            l2_results = []
            for run in route_runs:
                rd = run.to_dict()
                rd.update(
                    {
                        "object_id": run.route_run_id,
                        "object_type": pub_type,
                        "kind": "linear",
                        "location_or_path": run.polyline_pdf_pt,
                        "confidence": None,
                        "length": None,
                        "sheet_id": sheet_id,
                        "scale_status": scale.status.value,
                        "scale_text": scale.scale_text,
                        "reason_code": scale.reason_code,
                        "route_run_id": run.route_run_id,
                        "representation_family": run.representation_family,
                        "continuity_status": run.continuity_status,
                        "source_route_fragment_ids": run.source_route_fragment_ids,
                        "source_candidate_ids": run.source_candidate_ids,
                        "source_primitive_ids": run.source_primitive_ids,
                        "source_artifact_hash": run.source_artifact_hash,
                        "uncertainty_codes": run.uncertainty_codes,
                        "geometric_length_pt": round(run.geometry_length_pt, 4),
                        "match_line_notes": match_line_notes,
                    }
                )
                rd["fixture_id"] = sheet_id
                l2_results.append(rd)

            total_geo_pt = round(sum(r.get("geometric_length_pt", 0.0) for r in l2_results), 2)
            total_m = None
            total_ft = None
            if scale.status == ScaleStatus.VALID:
                for r in l2_results:
                    geo_pt = r.get("geometric_length_pt", 0.0)
                    lm = scale.to_physical_length_m(geo_pt)
                    if lm is not None:
                        r["length"] = round(lm, 4)
                        r["length_unit"] = "m"
                measured = [r["length"] for r in l2_results if r.get("length") is not None]
                if measured:
                    total_m = round(sum(measured), 4)
                    total_ft = round(total_m / 0.3048, 2)

            out = {
                "sheet_id": sheet_id,
                "scale_status": scale.status.value,
                "scale_text": scale.scale_text,
                "reason_code": scale.reason_code,
                "drawing_type": scale.drawing_type.value,
                "discipline": disc,
                "raw_segment_count": raw_count,
                "filtered_count": filtered_count,
                "rejected_count": raw_count - filtered_count,
                "raw_l2_candidate_count": raw_count,
                "raw_evidence_retained": True,
                "run_count": len(route_runs),
                "result_count": len(l2_results),
                "total_length_m": total_m,
                "total_length_ft": total_ft,
                "total_geometric_length_pt": total_geo_pt,
                "results": l2_results,
                "errors": errors,
            }
            if rep_res.fragment_graph is not None:
                g = rep_res.fragment_graph
                out["graph_stats"] = {
                    "graph_edges": g.total_edges,
                    "graph_length_pt": g.total_length_pt,
                    "duplicate_edges_collapsed": g.duplicates_collapsed,
                    "connected_components": g.connected_components_count,
                    "route_hypotheses": len(rep_res.route_hypotheses),
                    "ambiguous_fragments": rep_res.paired_validation.get("ambiguous_count", 0),
                    "isolated_fragments": len(rep_res.unresolved_boundaries),
                    "rejected_fragments": len(rep_res.non_route_and_review),
                }
            _L2_PIPELINE_CACHE.set(cache_key, out)
            return out

        # 5. Vector extraction (ADR-001)
        raw_segments = extract_line_segments(page)
        raw_count = len(raw_segments)

        # 6. MEP candidate filtering
        candidates, rejected = filter_mep_candidates(raw_segments)
        filtered_count = len(candidates)

        # 7. If scale is not valid, we still extract geometry but produce no lengths
        #    (fail-closed — coordinates are preserved; length is null)
        runs: list[LinearRun] = []
        # Per-run uncertainty codes aligned by list position with `runs`
        # (empty list = unflagged / measured). Flagged runs stay in the
        # output (fail-closed = flagged, not dropped) but are excluded
        # from the length rollups and gate the takeoff ledger downstream.
        run_uncertainty_codes: list[list[str]] = []
        centerline_run_count = 0
        elbows_resolved = 0
        unpaired_boundary_count = 0
        deduped_segment_count = 0
        unconnected_runs_count = 0
        single_line_run_count = 0
        if filtered_count > 0:
            if (
                scale.status == ScaleStatus.VALID
                or scale.drawing_type == DrawingType.PLAN_VIEW_UNSCALED
            ) or scale.drawing_type in (DrawingType.PLAN_VIEW, DrawingType.UNKNOWN):
                # Extract and assemble even for unscaled plans — produce geometry, not length
                if use_centerline and candidates:
                    # Collapse exact-duplicate segments first (same endpoints
                    # in either direction — e.g. the forward/reverse pair
                    # PyMuPDF returns for one stroked line). Legacy assembly
                    # merges these via collinear splicing; without this the
                    # same wall would pair twice and double-count again.
                    deduped_candidates: list = []
                    seen_keys: set = set()
                    for seg in candidates:
                        key = tuple(
                            sorted(
                                (
                                    (round(seg.x0, 3), round(seg.y0, 3)),
                                    (round(seg.x1, 3), round(seg.y1, 3)),
                                )
                            )
                        )
                        if key not in seen_keys:
                            seen_keys.add(key)
                            deduped_candidates.append(seg)
                    # Centerline corridors, not boundary perimeters: pair
                    # mechanical double-line boundaries into midpoint runs,
                    # then extend 90-degree elbows to their shared apex.
                    boundary_dicts = [
                        {
                            "id": f"seg_{i}",
                            "x0": seg.x0,
                            "y0": seg.y0,
                            "x1": seg.x1,
                            "y1": seg.y1,
                        }
                        for i, seg in enumerate(deduped_candidates)
                    ]
                    deduped_segment_count = len(candidates) - len(deduped_candidates)
                    derived = derive_centerlines(
                        boundary_dicts, CenterlineOptions(discipline=disc)
                    )
                    elbow_result = synthesize_elbow_intersections(derived)
                    # Post-filter emitted runs only: degenerate centerlines
                    # neither count nor consume their boundary segments.
                    centerline_runs = [
                        cr for cr in elbow_result.connected_runs if len(cr.points) >= 2
                    ]
                    centerline_run_count = len(centerline_runs)
                    elbows_resolved = elbow_result.total_elbows_resolved
                    unconnected_runs_count = elbow_result.unconnected_runs_count
                    consumed_ids = {
                        edge_id
                        for cr in centerline_runs
                        for edge_id in (cr.edge_a_id, cr.edge_b_id)
                        if edge_id
                    }
                    leftover = [
                        seg
                        for i, seg in enumerate(deduped_candidates)
                        if f"seg_{i}" not in consumed_ids
                    ]
                    unpaired_boundary_count = len(leftover)
                    # Centerline runs come first; leftover-boundary runs are
                    # appended after them (tracked by list position below).
                    runs = [
                        LinearRun(
                            points=list(cr.points),
                            category=source_class,
                            object_type=pub_type,
                            has_unclosed_gaps=bool(cr.review_required),
                            source_segment_count=2 if cr.edge_b_id else 1,
                        )
                        for cr in centerline_runs
                    ]
                    run_uncertainty_codes = [
                        ["CENTERLINE_PARTIAL_OVERLAP"] if cr.review_required else []
                        for cr in centerline_runs
                    ]
                    if leftover:
                        # Refined Fix 1 (domain ruling, Option 2 with bounds):
                        # partition leftovers BEFORE assemble_runs. A leftover
                        # with a plausible failed partner anywhere in the full
                        # deduped pool (consumed or leftover) is
                        # BOUNDARY_UNRESOLVED (flagged, excluded from rollups);
                        # the rest are inferred single-line representation,
                        # assembled separately and measured once, unflagged.
                        # No silent drop either way: both groups keep the
                        # legacy continuity assembly.
                        geoms = [_seg_geometry(s) for s in deduped_candidates]
                        leftover_idx = [
                            i
                            for i in range(len(deduped_candidates))
                            if f"seg_{i}" not in consumed_ids
                        ]
                        unresolved_idx = {
                            i
                            for i in leftover_idx
                            if _has_plausible_failed_partner(i, geoms)
                        }
                        unresolved_segs = [
                            deduped_candidates[i] for i in leftover_idx if i in unresolved_idx
                        ]
                        single_line_segs = [
                            deduped_candidates[i]
                            for i in leftover_idx
                            if i not in unresolved_idx
                        ]
                        if unresolved_segs:
                            start = len(runs)
                            runs.extend(
                                assemble_runs(unresolved_segs, source_class, pub_type)
                            )
                            for r_idx in range(start, len(runs)):
                                runs[r_idx].has_unclosed_gaps = True
                                run_uncertainty_codes.append(["BOUNDARY_UNRESOLVED"])
                        if single_line_segs:
                            start = len(runs)
                            runs.extend(
                                assemble_runs(single_line_segs, source_class, pub_type)
                            )
                            single_line_run_count = len(runs) - start
                            run_uncertainty_codes.extend(
                                [] for _ in range(len(runs) - start)
                            )
                else:
                    runs = assemble_runs(candidates, source_class, pub_type)
                    run_uncertainty_codes = [[] for _ in runs]
            else:
                # Schematic/riser/legend — do not process linework
                errors.append(
                    f"Drawing type {scale.drawing_type.value} — linework extraction skipped; "
                    f"length: null (ADR-002 fail-closed)"
                )

        # 8. Build structured output
        l2_results = _runs_to_l2_results(runs, scale, sheet_id, match_line_notes)

        # Inject fail-closed flags into the emitted (public) dicts: the
        # takeoff store gates ACCEPTED on has_unclosed_gaps /
        # uncertainty_codes in these dicts, so flagged runs must carry
        # them here, not only on the internal L2Result sidecar.
        if len(run_uncertainty_codes) != len(l2_results):
            # _runs_to_l2_results only skips degenerate (<2 pt) runs, which
            # the branches above already filter; a mismatch would silently
            # misalign flags, so pad/truncate defensively to result order.
            run_uncertainty_codes = (
                run_uncertainty_codes + [[]] * len(l2_results)
            )[: len(l2_results)]
        public_results: list[dict] = []
        for result, codes in zip(l2_results, run_uncertainty_codes, strict=True):
            public = result.to_public_dict()
            if codes:
                public["has_unclosed_gaps"] = True
                public["uncertainty_codes"] = list(codes)
            public_results.append(public)
        unresolved_run_count = sum(1 for codes in run_uncertainty_codes if codes)

        # 9. Rollup totals — unflagged runs only; None if none qualify.
        measured_lengths = [
            result.length
            for result, codes in zip(l2_results, run_uncertainty_codes, strict=True)
            if result.length is not None and not codes
        ]
        total_m = round(sum(measured_lengths), 4) if measured_lengths else None
        total_ft = round(total_m / 0.3048, 2) if total_m is not None else None

        pipeline_output = {
            "sheet_id": sheet_id,
            "scale_status": scale.status.value,
            "scale_text": scale.scale_text,
            "reason_code": scale.reason_code,
            "drawing_type": scale.drawing_type.value,
            "discipline": disc,
            "raw_segment_count": raw_count,
            "filtered_count": filtered_count,
            "rejected_count": rejected,
            "run_count": len(runs),
            "result_count": len(l2_results),
            "centerline_run_count": centerline_run_count,
            "elbows_resolved": elbows_resolved,
            "unpaired_boundary_count": unpaired_boundary_count,
            "unresolved_run_count": unresolved_run_count,
            "single_line_run_count": single_line_run_count,
            "unconnected_runs_count": unconnected_runs_count,
            "deduped_segment_count": deduped_segment_count,
            "total_length_m": total_m,
            "total_length_ft": total_ft,
            "results": public_results,
            "errors": errors,
        }
        _L2_PIPELINE_CACHE.set(cache_key, pipeline_output)
        if resolved_disc_key != cache_key:
            _L2_PIPELINE_CACHE.set(resolved_disc_key, pipeline_output)
        return pipeline_output
    finally:
        doc.close()
