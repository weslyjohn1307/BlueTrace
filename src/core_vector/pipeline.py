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
  - Double-line ductwork: length reflects duct boundary perimeter, not centerline
    (open question per docs/STATUS.md §Open Decisions).
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict
from pathlib import Path

import pymupdf
import yaml

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
        fixture_id: Optional fixture identifier (e.g. "FIX-TRN-MECH-022").
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

    errors: list[str] = []

    doc = pymupdf.open(str(path))
    try:
        if page_num >= len(doc):
            raise ValueError(f"Page {page_num} does not exist in {path.name} ({len(doc)} pages)")

        page = doc[page_num]
        page_text = page.get_text("text")
        pdf_stem = path.stem
        fname = path.name

        # 1. Sheet identity
        sheet_id = _extract_sheet_id(page_text, pdf_stem, page_num)

        # 2. Discipline
        disc = discipline or _infer_discipline(path, page_text, sheet_id=sheet_id)
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
        if filtered_count > 0:
            if (
                scale.status == ScaleStatus.VALID
                or scale.drawing_type == DrawingType.PLAN_VIEW_UNSCALED
            ):
                # Extract and assemble even for unscaled plans — produce geometry, not length
                runs = assemble_runs(candidates, source_class, pub_type)
            elif scale.drawing_type in (DrawingType.PLAN_VIEW, DrawingType.UNKNOWN):
                runs = assemble_runs(candidates, source_class, pub_type)
            else:
                # Schematic/riser/legend — do not process linework
                errors.append(
                    f"Drawing type {scale.drawing_type.value} — linework extraction skipped; "
                    f"length: null (ADR-002 fail-closed)"
                )

        # 8. Build structured output
        l2_results = _runs_to_l2_results(runs, scale, sheet_id, match_line_notes)

        # 9. Rollup totals
        measured_lengths = [r.length for r in l2_results if r.length is not None]
        total_m = round(sum(measured_lengths), 4) if measured_lengths else None
        total_ft = round(total_m / 0.3048, 2) if total_m is not None else None

        return {
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
            "total_length_m": total_m,
            "total_length_ft": total_ft,
            "results": [r.to_public_dict() for r in l2_results],
            "errors": errors,
        }
    finally:
        doc.close()
