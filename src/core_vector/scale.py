"""Level 2 fail-closed scale gating (ADR-002).

Implements deterministic scale extraction and schematic drawing rejection based on
EXP-002, EXP-008, and EXP-009 evidence.

Authority: ADR-002 — Fail-Closed Scale Gating Invariant.

Invariants (non-negotiable):
  - NEVER default to a common architectural scale.
  - NEVER guess a scale from context or neighbouring sheets.
  - NEVER allow an LLM to fill or calculate a scale value.
  - length: null is always correct output for any non-VALID scale status.
"""

from __future__ import annotations

import re
from typing import Any

from src.core_vector.schema import (
    VIEW_BOUND_PARSER_VERSION,
    DrawingType,
    ScaleDecision,
    ScaleReasonCode,
    ScaleSourceType,
    ScaleStatus,
    ViewBoundScaleDecision,
    ViewBoundScaleStatus,
)

# --- Schematic detection keywords (EXP-008) ---
# If any of these are found in the sheet text or filename, the sheet is
# non-scaled and must fail closed.
_SCHEMATIC_RISER_KEYWORDS = re.compile(r"\bRISER\b|\bRISER DIAGRAM\b", re.IGNORECASE)
_PID_KEYWORDS = re.compile(
    r"\bINSTRUMENTATION\b|P&ID\b|\bPIPING AND INSTRUMENTATION\b", re.IGNORECASE
)
_LEGEND_KEYWORDS = re.compile(r"\bLEGEND\b|\bABBREVIATION\b|\bSCHEDULE\b", re.IGNORECASE)
_NTS_KEYWORDS = re.compile(r"\b(N\.?T\.?S\.?|NOT TO SCALE|SCALE:\s*N/A)\b", re.IGNORECASE)

# --- Sheet ID pattern: risers are typically P6xx, PP6xx (EXP-008) ---
_RISER_SHEET_ID_PATTERN = re.compile(r"^[A-Z]{1,3}6\d{2}$", re.IGNORECASE)

# --- Architectural scale regex (EXP-002) ---
# Matches: 1/8" = 1'-0", 1/4" = 1'-0", 1/2" = 1', etc.
_ARCH_SCALE_PATTERN = re.compile(
    r'(\d+)\s*/\s*(\d+)\s*["\']?\s*=\s*(\d+)\s*[\']\s*(?:-?\s*(\d+)\s*["\']?)?',
    re.IGNORECASE,
)

# Conversion constant: 1 foot = 12 inches = 12 * 72 pt = 864 pt
_INCHES_PER_FOOT = 12
_PT_PER_INCH = 72.0
_PT_PER_FOOT = _INCHES_PER_FOOT * _PT_PER_INCH  # 864.0
_M_PER_FOOT = 0.3048


def parse_architectural_scale(text: str) -> tuple[float, float, str] | None:
    """Parse an architectural scale string into conversion factors.

    Formula (EXP-002 / EXP-009):
      Ratio S = (num / den) / (feet * 12 + inches)
      ft_per_pt = 1.0 / (S * 72.0 * 12.0)
      m_per_pt  = ft_per_pt * 0.3048

    Returns:
      (ft_per_pt, m_per_pt, canonical_scale_text) or None if not matched.
    """
    match = _ARCH_SCALE_PATTERN.search(text)
    if not match:
        return None

    num = int(match.group(1))
    den = int(match.group(2))
    feet = int(match.group(3))
    inches = int(match.group(4)) if match.group(4) else 0

    real_total_inches = feet * _INCHES_PER_FOOT + inches
    if den == 0 or real_total_inches == 0:
        return None

    ratio = (num / den) / real_total_inches
    ft_per_pt = 1.0 / (ratio * _PT_PER_FOOT)
    m_per_pt = ft_per_pt * _M_PER_FOOT
    scale_text = f'{num}/{den}" = {feet}\'-{inches}"'
    return ft_per_pt, m_per_pt, scale_text


def detect_scale(
    page_text: str,
    sheet_id: str,
    filename: str,
    scale_override: str | None = None,
) -> ScaleDecision:
    """Deterministic scale extraction and schematic rejection gate (ADR-002).

    Processing order (EXP-002, EXP-008):
      1. Explicit scale override (if verified/provided by caller) → VALID
      2. P&ID / instrumentation diagram detection → FAIL-CLOSED (PID_DIAGRAM)
      3. Schematic riser detection (text + sheet ID pattern) → FAIL-CLOSED (SCHEMATIC_RISER)
      4. Not-to-scale keyword detection (NTS, NOT TO SCALE, SCALE: N/A) → FAIL-CLOSED (NOT_TO_SCALE)
      5. Architectural scale regex parsing in text/filename → VALID if matched
      6. Legend/schedule sheet detection (if not a plan view) → FAIL-CLOSED (LEGEND_SHEET)
      7. No scale found → SCALE_UNREADABLE (FAIL-CLOSED)

    Args:
        page_text: Raw text extracted from the PDF page (page.get_text("text")).
        sheet_id: AEC sheet identifier (e.g. "M-3.1", "P601").
        filename: PDF filename for additional heuristic context.
        scale_override: Optional explicit scale string (e.g. '1/8" = 1\\'-0"').

    Returns:
        ScaleDecision with status, drawing_type, conversion factors, and reason_code.
        ft_per_pt and m_per_pt are None for any non-VALID status.
    """
    # 1. Caller-provided scale override (e.g. for ground-truth benchmark calibration)
    if scale_override:
        parsed = parse_architectural_scale(scale_override) or parse_metric_scale(scale_override)
        if parsed:
            ft_per_pt, m_per_pt, scale_text = parsed
            return ScaleDecision(
                status=ScaleStatus.VALID,
                drawing_type=DrawingType.PLAN_VIEW,
                scale_text=scale_text,
                ft_per_pt=ft_per_pt,
                m_per_pt=m_per_pt,
                reason_code=None,
            )

    combined = page_text + " " + filename

    # 2. P&ID / Instrumentation
    if _PID_KEYWORDS.search(combined):
        return ScaleDecision(
            status=ScaleStatus.PID_DIAGRAM,
            drawing_type=DrawingType.PID_DIAGRAM,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleStatus.PID_DIAGRAM.value,
        )

    # 3. Schematic riser (keyword + sheet ID pattern P6xx, PP6xx per EXP-008)
    is_riser_keyword = bool(_SCHEMATIC_RISER_KEYWORDS.search(combined))
    is_riser_sheet_id = bool(_RISER_SHEET_ID_PATTERN.match(sheet_id))
    if is_riser_keyword or is_riser_sheet_id:
        return ScaleDecision(
            status=ScaleStatus.SCHEMATIC_RISER,
            drawing_type=DrawingType.SCHEMATIC_RISER,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleStatus.SCHEMATIC_RISER.value,
        )

    # 4. Not-to-scale keyword (NTS, NOT TO SCALE, SCALE: N/A)
    if _NTS_KEYWORDS.search(combined):
        return ScaleDecision(
            status=ScaleStatus.NOT_TO_SCALE,
            drawing_type=DrawingType.NOT_TO_SCALE,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleStatus.NOT_TO_SCALE.value,
        )

    # 4b. Unsupported scale format (SCALE: AS NOTED, SCALE: VARIES, etc. per ADR-002)
    if _UNSUPPORTED_SCALE_PATTERN.search(combined) or re.search(
        r"\bSCALE\s*:\s*AS\s+INDICATED\b", combined, re.IGNORECASE
    ):
        return ScaleDecision(
            status=ScaleStatus.SCALE_UNREADABLE,
            drawing_type=DrawingType.PLAN_VIEW_UNSCALED,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleReasonCode.UNSUPPORTED_SCALE_FORMAT.value,
        )

    # 5. Scale parsing (architectural & metric) in page text only.
    # Filename is never scale evidence (L2-06).
    # Collect unique candidate notations across lines to detect conflicts.
    cand_notations: set[str] = set()
    first_parsed: tuple[float, float, str] | None = None
    for line in page_text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        p = parse_architectural_scale(line_str) or parse_metric_scale(line_str)
        if p:
            cand_notations.add(p[2])
            if first_parsed is None:
                first_parsed = p

    # Fallback search across full text if line breaks split notation
    if not first_parsed:
        first_parsed = parse_architectural_scale(page_text) or parse_metric_scale(page_text)
        if first_parsed:
            cand_notations.add(first_parsed[2])

    if len(cand_notations) > 1:
        # Multiple conflicting scale statements on sheet without viewport disambiguation -> fail closed
        return ScaleDecision(
            status=ScaleStatus.SCALE_UNREADABLE,
            drawing_type=DrawingType.PLAN_VIEW_UNSCALED,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleReasonCode.SCALE_CONFLICT.value,
        )

    if first_parsed:
        ft_per_pt, m_per_pt, scale_text = first_parsed
        return ScaleDecision(
            status=ScaleStatus.VALID,
            drawing_type=DrawingType.PLAN_VIEW,
            scale_text=scale_text,
            ft_per_pt=ft_per_pt,
            m_per_pt=m_per_pt,
            reason_code=None,
        )

    # 6. Legend/schedule sheet detection
    # In AEC sets, a plan sheet with a note mentioning 'SCHEDULE' is NOT a legend sheet.
    # A sheet is a legend/schedule sheet only if its title or filename is explicitly a legend.
    is_plan = bool(
        re.search(r"\b(PLAN|FLOOR PLAN|CONSTRUCTION PLAN|DUCTWORK|AREA)\b", combined, re.IGNORECASE)
    )
    is_legend_title = bool(
        re.search(
            r"\b(SYMBOLS?\s+LEGEND|LEGEND\s+AND\s+ABBREVIATIONS?|GENERAL\s+NOTES?\s+AND\s+LEGEND|ABBREVIATIONS?)\b",
            combined,
            re.IGNORECASE,
        )
    )
    if is_legend_title and not is_plan:
        return ScaleDecision(
            status=ScaleStatus.LEGEND_SHEET,
            drawing_type=DrawingType.LEGEND_OR_NOTES,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleStatus.LEGEND_SHEET.value,
        )

    # 7. No scale found — fail closed (ADR-002)
    # Plan views without readable title block receive PLAN_VIEW_UNSCALED
    if is_plan:
        return ScaleDecision(
            status=ScaleStatus.SCALE_UNREADABLE,
            drawing_type=DrawingType.PLAN_VIEW_UNSCALED,
            scale_text=None,
            ft_per_pt=None,
            m_per_pt=None,
            reason_code=ScaleStatus.SCALE_UNREADABLE.value,
        )

    return ScaleDecision(
        status=ScaleStatus.SCALE_UNREADABLE,
        drawing_type=DrawingType.UNKNOWN,
        scale_text=None,
        ft_per_pt=None,
        m_per_pt=None,
        reason_code=ScaleStatus.SCALE_UNREADABLE.value,
    )


# --- View-bound scale decisions (L2-06) ---

_METRIC_RATIO_PATTERN = re.compile(r"\b1\s*:\s*(\d{2,4})\b")
_REDACTED_PATTERN = re.compile(
    r"SCALE\s*[:\s]*(?:\[[^\]]*REDACT(?:ED)?[^\]]*\]|X{3,}|\*{3,}|#+)",
    re.IGNORECASE,
)
_UNSUPPORTED_SCALE_PATTERN = re.compile(
    r"SCALE\s*[:\s]+(AS\s+NOTED|NONE|VARIES|SEE\s+DRAWING)",
    re.IGNORECASE,
)
_M_PER_INCH = 0.0254


def is_testing_path(path: str | None) -> bool:
    """True when a path identity includes the competition Testing partition."""
    if not path:
        return False
    normalized = path.replace("\\", "/").lower()
    return "/testing/" in normalized or normalized.startswith("testing/")


def parse_metric_scale(text: str) -> tuple[float, float, str] | None:
    """Parse an observed metric ratio `1:N` into conversion factors (EXP-002).

    Requires an explicit SCALE token, or a string that is only the ratio.
    C_pt_to_m = 0.0254 / (72 * S) with S = 1/N.
    """
    stripped = text.strip()
    match = _METRIC_RATIO_PATTERN.search(stripped)
    if not match:
        return None
    has_scale_word = bool(re.search(r"\bSCALE\b", stripped, re.IGNORECASE))
    only_ratio = bool(re.fullmatch(r"1\s*:\s*\d{2,4}", stripped))
    if not has_scale_word and not only_ratio:
        return None
    denominator = int(match.group(1))
    if denominator == 0:
        return None
    scale_ratio = 1.0 / denominator
    m_per_pt = _M_PER_INCH / (_PT_PER_INCH * scale_ratio)
    ft_per_pt = m_per_pt / _M_PER_FOOT
    return ft_per_pt, m_per_pt, f"1:{denominator}"


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


def _center_in_bounds(bbox: list[float], bounds: list[float]) -> bool:
    cx, cy = _bbox_center(bbox)
    return bounds[0] <= cx <= bounds[2] and bounds[1] <= cy <= bounds[3]


def _notation_from_parse(text: str) -> tuple[str, float, float, str, str, float] | None:
    """Return (notation, m_per_pt, ft_per_pt, paper_units, real_units, denominator)."""
    arch = parse_architectural_scale(text)
    if arch:
        ft_per_pt, m_per_pt, notation = arch
        # S = paper_in / real_in; 1/8" = 1'-0" => S = (1/8)/12 = 1/96
        match = _ARCH_SCALE_PATTERN.search(text)
        if match:
            num = int(match.group(1))
            den = int(match.group(2))
            feet = int(match.group(3))
            inches = int(match.group(4)) if match.group(4) else 0
            real_inches = feet * _INCHES_PER_FOOT + inches
            denominator = real_inches / (num / den) if num else None
        else:
            denominator = None
        return notation, m_per_pt, ft_per_pt, "in", "in", float(denominator or 0.0)
    metric = parse_metric_scale(text)
    if metric:
        ft_per_pt, m_per_pt, notation = metric
        denominator = float(notation.split(":")[1])
        return notation, m_per_pt, ft_per_pt, "paper", "real", denominator
    return None


def parse_dimension_callout(text: str) -> tuple[float, str] | None:
    """Parse a printed dimension callout string into physical value and unit.

    Supports imperial feet/inches (e.g. '15\' - 6 3/16"', '4\' - 3"', '10\' 0"', '2\'-5"')
    and metric dimensions (e.g. '1200 mm', '3.5 m').

    Returns (value_in_feet, 'ft') for imperial, (value_in_meters, 'm') for metric, or None.
    """
    cleaned = text.strip()

    # Metric: e.g. "1200 mm", "3.5 m", "1500mm"
    m_metric = re.match(r"^(\d+(?:\.\d+)?)\s*(mm|m)\b", cleaned, re.IGNORECASE)
    if m_metric:
        val = float(m_metric.group(1))
        unit = m_metric.group(2).lower()
        if unit == "mm":
            return val / 1000.0, "m"
        return val, "m"

    # Imperial with fraction: e.g. 15' - 6 3/16", 8' -6-1/2", 15'-6 3/16"
    m_frac = re.match(
        r"""^(\d+)\s*['\u2019]\s*[- ]*\s*(\d+)\s*[- ]+\s*(\d+)\s*/\s*(\d+)\s*["\u201d]?$""",
        cleaned,
    )
    if m_frac:
        feet = int(m_frac.group(1))
        inches = int(m_frac.group(2))
        frac_num = int(m_frac.group(3))
        frac_den = int(m_frac.group(4))
        total_inches = feet * 12.0 + inches + (frac_num / frac_den if frac_den else 0.0)
        return total_inches / 12.0, "ft"

    # Imperial without fraction: e.g. 4' - 3", 10' 0", 2'-5", 3' - 9"
    m_imp = re.match(
        r"""^(\d+)\s*['\u2019]\s*[- ]*\s*(\d+)\s*["\u201d]?$""",
        cleaned,
    )
    if m_imp:
        feet = int(m_imp.group(1))
        inches = int(m_imp.group(2))
        total_inches = feet * 12.0 + inches
        return total_inches / 12.0, "ft"

    # Feet only: e.g. 10' or 10'-0"
    m_feet = re.match(r"""^(\d+)\s*['\u2019]$""", cleaned)
    if m_feet:
        return float(m_feet.group(1)), "ft"

    # Simple inches only: e.g. 6" or 12"
    m_inch = re.match(r"""^(\d+(?:\.\d+)?)\s*["\u201d]$""", cleaned)
    if m_inch:
        val = float(m_inch.group(1))
        return val / 12.0, "ft"

    return None


def extract_native_text_lines(page: Any) -> list[tuple[str, list[float]]]:
    """Extract line-level text strings and exact bounding boxes from PDF page dict."""
    lines: list[tuple[str, list[float]]] = []
    text_dict = page.get_text("dict")
    for b in text_dict.get("blocks", []):
        if "lines" in b:
            for l_entry in b["lines"]:
                txt = "".join(s.get("text", "") for s in l_entry.get("spans", [])).strip()
                bbox = [round(c, 4) for c in l_entry.get("bbox", [0.0, 0.0, 0.0, 0.0])]
                if txt:
                    lines.append((txt, bbox))
    return lines


def collect_scale_candidates(text_blocks: list[tuple[str, list[float]]]) -> list[dict]:
    """Collect parsed scale candidates from native text blocks (not filenames)."""
    candidates: list[dict] = []
    for text, bbox in text_blocks:
        if not text:
            continue
        for line in text.splitlines():
            line_str = line.strip()
            if not line_str:
                continue
            parsed = _notation_from_parse(line_str)
            if parsed is None:
                continue
            notation, m_per_pt, ft_per_pt, paper_units, real_units, denominator = parsed
            candidates.append(
                {
                    "text": line_str,
                    "bbox_pdf_pt": list(bbox),
                    "notation": notation,
                    "meters_per_pdf_point": m_per_pt,
                    "ft_per_pt": ft_per_pt,
                    "paper_units": paper_units,
                    "real_units": real_units,
                    "scale_ratio_denominator": denominator,
                }
            )
    return candidates


def detect_scale_candidates(
    text_blocks: list[tuple[str, list[float]]] | None = None,
    page_text: str | None = None,
    source_page_id: str | int = 0,
    candidate_view_id: str | None = None,
) -> list[dict[str, Any]]:
    """Detect and structure scale candidate records across native text blocks (L2-06 / SCALE-01 / SCALE-01-C1).

    Separates multiple scale statements into distinct candidate records.
    Handles imperial architectural, metric ratios, NTS, redacted, and unsupported formats.
    """
    candidates: list[dict[str, Any]] = []
    raw_units: list[tuple[str, list[float]]] = []

    if text_blocks:
        for item in text_blocks:
            if not item or not item[0]:
                continue
            raw_t = item[0]
            bbox = list(item[1]) if len(item) > 1 and item[1] else [0.0, 0.0, 0.0, 0.0]
            lines = [ln.strip() for ln in raw_t.splitlines() if ln.strip()]
            if len(lines) <= 1:
                raw_units.append((raw_t.strip(), bbox))
            else:
                # Vertical interpolation of block bounding box across lines if multiline block
                h = (bbox[3] - bbox[1]) / len(lines) if len(bbox) == 4 else 0.0
                for idx, line in enumerate(lines):
                    line_bbox = (
                        [bbox[0], bbox[1] + idx * h, bbox[2], bbox[1] + (idx + 1) * h]
                        if len(bbox) == 4
                        else [0.0, 0.0, 0.0, 0.0]
                    )
                    raw_units.append((line, line_bbox))
    elif page_text:
        lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
        for line in lines:
            raw_units.append((line, [0.0, 0.0, 0.0, 0.0]))

    for stripped, bbox in raw_units:
        if not stripped:
            continue

        # 1. Redacted scale check
        if _REDACTED_PATTERN.search(stripped):
            candidates.append(
                {
                    "original_text": stripped,
                    "parsed_ratio": None,
                    "unit_system": "redacted",
                    "text_bbox_pdf_pt": list(bbox),
                    "source_page_id": source_page_id,
                    "candidate_view_id": candidate_view_id,
                    "evidence_source": ScaleSourceType.NATIVE_TEXT.value,
                    "status": "REDACTED",
                    "reason": ScaleReasonCode.REDACTED_SCALE.value,
                    "meters_per_pdf_point": None,
                    "scale_ratio_denominator": None,
                }
            )
            continue

        # 2. NTS / Not To Scale check
        if _NTS_KEYWORDS.search(stripped):
            candidates.append(
                {
                    "original_text": stripped,
                    "parsed_ratio": None,
                    "unit_system": "not_to_scale",
                    "text_bbox_pdf_pt": list(bbox),
                    "source_page_id": source_page_id,
                    "candidate_view_id": candidate_view_id,
                    "evidence_source": ScaleSourceType.NATIVE_TEXT.value,
                    "status": "NOT_TO_SCALE",
                    "reason": ScaleReasonCode.NOT_TO_SCALE.value,
                    "meters_per_pdf_point": None,
                    "scale_ratio_denominator": None,
                }
            )
            continue

        # 3. Unsupported scale format check (AS NOTED, AS INDICATED, VARIES)
        if _UNSUPPORTED_SCALE_PATTERN.search(stripped) or re.search(
            r"\bSCALE\s*:\s*AS\s+INDICATED\b", stripped, re.IGNORECASE
        ):
            candidates.append(
                {
                    "original_text": stripped,
                    "parsed_ratio": None,
                    "unit_system": "unsupported",
                    "text_bbox_pdf_pt": list(bbox),
                    "source_page_id": source_page_id,
                    "candidate_view_id": candidate_view_id,
                    "evidence_source": ScaleSourceType.NATIVE_TEXT.value,
                    "status": "UNSUPPORTED_FORMAT",
                    "reason": ScaleReasonCode.UNSUPPORTED_SCALE_FORMAT.value,
                    "meters_per_pdf_point": None,
                    "scale_ratio_denominator": None,
                }
            )
            continue

        # 4. Architectural scale check
        arch = parse_architectural_scale(stripped)
        if arch:
            _ft_pt, m_pt, notat = arch
            match = _ARCH_SCALE_PATTERN.search(stripped)
            den = None
            if match:
                num = int(match.group(1))
                d_val = int(match.group(2))
                feet = int(match.group(3))
                inches = int(match.group(4)) if match.group(4) else 0
                real_inches = feet * _INCHES_PER_FOOT + inches
                den = real_inches / (num / d_val) if num else None
            candidates.append(
                {
                    "original_text": stripped,
                    "parsed_ratio": notat,
                    "unit_system": "imperial",
                    "text_bbox_pdf_pt": list(bbox),
                    "source_page_id": source_page_id,
                    "candidate_view_id": candidate_view_id,
                    "evidence_source": ScaleSourceType.NATIVE_TEXT.value,
                    "status": "VALID_CANDIDATE",
                    "reason": "ARCHITECTURAL_SCALE_PARSED",
                    "meters_per_pdf_point": m_pt,
                    "scale_ratio_denominator": den,
                }
            )
            continue

        # 5. Metric scale check
        metric = parse_metric_scale(stripped)
        if metric:
            _ft_pt, m_pt, notat = metric
            den_val = float(notat.split(":")[1])
            candidates.append(
                {
                    "original_text": stripped,
                    "parsed_ratio": notat,
                    "unit_system": "metric",
                    "text_bbox_pdf_pt": list(bbox),
                    "source_page_id": source_page_id,
                    "candidate_view_id": candidate_view_id,
                    "evidence_source": ScaleSourceType.NATIVE_TEXT.value,
                    "status": "VALID_CANDIDATE",
                    "reason": "METRIC_SCALE_PARSED",
                    "meters_per_pdf_point": m_pt,
                    "scale_ratio_denominator": den_val,
                }
            )
            continue

    return candidates


def bind_scale_candidates_to_views(
    candidates: list[dict[str, Any]],
    views: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Spatially bind scale candidate records to drawing view boundaries (SCALE-01 / SCALE-01-C1).

    Args:
        candidates: List of candidate scale dictionaries.
        views: List of view dicts, each with 'view_id', 'bounds_pt', and optional 'title'.

    Returns:
        Mapping from view_id to list of bound scale candidate records.
    """
    view_bindings: dict[str, list[dict[str, Any]]] = {v["view_id"]: [] for v in views}

    for c in candidates:
        bbox = c.get("text_bbox_pdf_pt") or [0.0, 0.0, 0.0, 0.0]

        # Check direct containment
        containing_views = [
            v
            for v in views
            if v.get("bounds_pt")
            and len(v["bounds_pt"]) == 4
            and _center_in_bounds(bbox, v["bounds_pt"])
        ]
        if len(containing_views) == 1:
            v_id = containing_views[0]["view_id"]
            c_copy = dict(c)
            c_copy["candidate_view_id"] = v_id
            view_bindings[v_id].append(c_copy)
            continue

        # If not directly inside, associate by closest view boundary (within tolerance 250 pt)
        best_v = None
        min_dist = float("inf")
        cx, cy = _bbox_center(bbox)
        for v in views:
            bounds = v.get("bounds_pt")
            if not bounds or len(bounds) != 4:
                continue
            dx = max(bounds[0] - cx, 0.0, cx - bounds[2])
            dy = max(bounds[1] - cy, 0.0, cy - bounds[3])
            dist = (dx * dx + dy * dy) ** 0.5
            if dist < min_dist:
                min_dist = dist
                best_v = v

        if best_v and min_dist <= 250.0:
            v_id = best_v["view_id"]
            c_copy = dict(c)
            c_copy["candidate_view_id"] = v_id
            view_bindings[v_id].append(c_copy)

    return view_bindings


def evaluate_cross_check(
    expected: float | None,
    measured: float | None,
    relative_error_limit: float = 0.02,
) -> tuple[str, float | None]:
    """Compare an independent measured value to an expected real value."""
    if expected is None or measured is None:
        return "MISSING", None
    if expected == 0:
        return "FAILED", None
    relative_error = abs(measured - expected) / abs(expected)
    if relative_error <= relative_error_limit:
        return "PASS", relative_error
    return "FAILED", relative_error


def _fail_closed(
    *,
    scale_decision_id: str,
    fixture_id: str,
    source_page_id: str | int,
    view_id: str | None,
    view_bounds_pdf_pt: list[float],
    coordinate_transform_id: str,
    reason: ScaleReasonCode,
    extra_reasons: list[str] | None = None,
    source_type: ScaleSourceType = ScaleSourceType.NONE,
    raw_evidence_text: str | None = None,
    raw_evidence_bbox_pdf_pt: list[float] | None = None,
    parsed_notation: str | None = None,
    paper_units: str | None = None,
    real_units: str | None = None,
    scale_ratio_denominator: float | None = None,
    meters_per_pdf_point: float | None = None,
    parser_version: str = VIEW_BOUND_PARSER_VERSION,
    cross_check_type: str | None = None,
    cross_check_source: str | None = None,
    cross_check_expected_value: float | None = None,
    cross_check_measured_value: float | None = None,
    cross_check_relative_error: float | None = None,
    cross_check_status: str | None = None,
    manual_actor: str | None = None,
    manual_source: str | None = None,
    view_bounds_source: str = "AUTOMATIC",
) -> ViewBoundScaleDecision:
    reasons = [reason.value]
    if extra_reasons:
        for code in extra_reasons:
            if code not in reasons:
                reasons.append(code)
    return ViewBoundScaleDecision(
        scale_decision_id=scale_decision_id,
        fixture_id=fixture_id,
        source_page_id=source_page_id,
        view_id=view_id,
        view_bounds_pdf_pt=list(view_bounds_pdf_pt),
        view_bounds_source=view_bounds_source,
        coordinate_transform_id=coordinate_transform_id,
        source_type=source_type,
        raw_evidence_text=raw_evidence_text,
        raw_evidence_bbox_pdf_pt=raw_evidence_bbox_pdf_pt,
        parsed_notation=parsed_notation,
        paper_units=paper_units,
        real_units=real_units,
        scale_ratio_denominator=scale_ratio_denominator,
        meters_per_pdf_point=meters_per_pdf_point,
        parser_version=parser_version,
        cross_check_type=cross_check_type,
        cross_check_source=cross_check_source,
        cross_check_expected_value=cross_check_expected_value,
        cross_check_measured_value=cross_check_measured_value,
        cross_check_relative_error=cross_check_relative_error,
        cross_check_status=cross_check_status,
        status=ViewBoundScaleStatus.FAIL_CLOSED,
        reason_codes=reasons,
        manual_actor=manual_actor,
        manual_source=manual_source,
        physical_conversion_enabled=False,
    )


def decide_view_bound_scale(
    *,
    fixture_id: str,
    source_page_id: str | int,
    view_id: str | None,
    view_bounds_pdf_pt: list[float],
    coordinate_transform_id: str,
    page_text: str,
    text_blocks: list[tuple[str, list[float]]] | None = None,
    eligible_plan_view_count: int = 1,
    title_block_missing: bool = False,
    declared_manual: dict | None = None,
    cross_check: dict | None = None,
    cross_checks: list[dict] | None = None,
    source_path: str | None = None,
    parser_version: str = VIEW_BOUND_PARSER_VERSION,
    cross_check_relative_error_limit: float = 0.05,
    scale_decision_id: str | None = None,
    manual_validation: bool = False,
    view_bounds_source: str = "AUTOMATIC",
) -> ViewBoundScaleDecision:
    """Produce one view-bound fail-closed scale decision (L2-06 / SCALE-01 / SCALE-01-C1).

    Does not calculate route physical length. Filename is not scale evidence.
    Conversion is enabled only after independent cross-check on a verified or manual validation status.
    """
    decision_id = scale_decision_id or f"SD-{fixture_id}-{source_page_id}-{view_id or 'UNBOUND'}"
    bounds = list(view_bounds_pdf_pt) if view_bounds_pdf_pt else []

    if is_testing_path(source_path):
        raise ValueError("Testing partition is prohibited for L2-06 scale decisions")

    if not view_id or len(bounds) != 4:
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds or [0.0, 0.0, 0.0, 0.0],
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.VIEW_UNBOUND,
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    combined_text = page_text or ""
    if _PID_KEYWORDS.search(combined_text) or _SCHEMATIC_RISER_KEYWORDS.search(combined_text):
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.SCHEMATIC_RISER,
            raw_evidence_text=combined_text[:240] or None,
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )
    if _NTS_KEYWORDS.search(combined_text):
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.NOT_TO_SCALE,
            raw_evidence_text=combined_text[:240] or None,
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    if eligible_plan_view_count > 1:
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.MIXED_VIEW_SCALE_UNBOUND,
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    if _REDACTED_PATTERN.search(combined_text):
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.REDACTED_SCALE,
            raw_evidence_text=combined_text[:240],
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    blocks = text_blocks or []
    if not blocks and combined_text.strip():
        blocks = [(combined_text, bounds)]
    in_view_blocks = [
        (text, bbox) for text, bbox in blocks if not bbox or _center_in_bounds(list(bbox), bounds)
    ]
    work_blocks = in_view_blocks or blocks

    if any(_UNSUPPORTED_SCALE_PATTERN.search(text) for text, _ in work_blocks):
        hit = next(text for text, _ in work_blocks if _UNSUPPORTED_SCALE_PATTERN.search(text))
        parsed_try = _notation_from_parse(hit)
        if parsed_try is None:
            return _fail_closed(
                scale_decision_id=decision_id,
                fixture_id=fixture_id,
                source_page_id=source_page_id,
                view_id=view_id,
                view_bounds_pdf_pt=bounds,
                coordinate_transform_id=coordinate_transform_id,
                reason=ScaleReasonCode.UNSUPPORTED_SCALE_FORMAT,
                source_type=ScaleSourceType.NATIVE_TEXT,
                raw_evidence_text=hit[:240],
                parser_version=parser_version,
                view_bounds_source=view_bounds_source,
            )

    candidates = collect_scale_candidates(work_blocks)
    unique_notations = {c["notation"] for c in candidates}
    if len(unique_notations) > 1:
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.SCALE_CONFLICT,
            source_type=ScaleSourceType.NATIVE_TEXT,
            raw_evidence_text=" | ".join(sorted(unique_notations)),
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    scale_tokens = [
        text
        for text, _ in work_blocks
        if re.search(r"\bSCALE\b", text, re.IGNORECASE)
        and _notation_from_parse(text) is None
        and not _NTS_KEYWORDS.search(text)
        and not _UNSUPPORTED_SCALE_PATTERN.search(text)
        and not _REDACTED_PATTERN.search(text)
    ]
    if not candidates and scale_tokens:
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.SCALE_UNREADABLE,
            source_type=ScaleSourceType.NATIVE_TEXT,
            raw_evidence_text=scale_tokens[0][:240],
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    all_checks: list[dict] = []
    if cross_checks:
        all_checks.extend(cross_checks)
    elif cross_check:
        all_checks.append(cross_check)

    cc_status = "MISSING"
    cc_type = None
    cc_source = None
    cc_expected = None
    cc_measured = None
    cc_error = None

    if all_checks:
        pass_count = 0
        max_err = 0.0
        sources = []
        types = []
        for chk in all_checks:
            c_t = chk.get("type", "KNOWN_DIMENSION")
            c_s = chk.get("source", "cross-check")
            c_exp = chk.get("expected_value")
            c_meas = chk.get("measured_value")
            c_lim = chk.get("error_limit", cross_check_relative_error_limit)
            st, err = evaluate_cross_check(c_exp, c_meas, c_lim)
            types.append(str(c_t))
            sources.append(str(c_s))
            if err is not None:
                max_err = max(max_err, err)
            if st == "PASS":
                pass_count += 1
            else:
                cc_status = "FAILED"
                break
        else:
            if pass_count == len(all_checks) and pass_count > 0:
                cc_status = "PASS"
        cc_type = " | ".join(types)
        cc_source = " | ".join(sources)
        cc_expected = all_checks[0].get("expected_value")
        cc_measured = all_checks[0].get("measured_value")
        cc_error = max_err

    if declared_manual is not None:
        actor = (declared_manual.get("actor") or "").strip()
        source = (declared_manual.get("source") or "").strip()
        notation = declared_manual.get("notation")
        declared_view = declared_manual.get("view_id")
        if not actor or not source or not notation or declared_view != view_id:
            return _fail_closed(
                scale_decision_id=decision_id,
                fixture_id=fixture_id,
                source_page_id=source_page_id,
                view_id=view_id,
                view_bounds_pdf_pt=bounds,
                coordinate_transform_id=coordinate_transform_id,
                reason=ScaleReasonCode.SCALE_UNREADABLE,
                extra_reasons=[ScaleReasonCode.VIEW_UNBOUND.value]
                if declared_view != view_id
                else [],
                source_type=ScaleSourceType.DECLARED_MANUAL,
                raw_evidence_text=notation,
                parser_version=parser_version,
                manual_actor=actor or None,
                manual_source=source or None,
                view_bounds_source=view_bounds_source,
            )
        parsed_manual = _notation_from_parse(str(notation))
        if parsed_manual is None:
            return _fail_closed(
                scale_decision_id=decision_id,
                fixture_id=fixture_id,
                source_page_id=source_page_id,
                view_id=view_id,
                view_bounds_pdf_pt=bounds,
                coordinate_transform_id=coordinate_transform_id,
                reason=ScaleReasonCode.UNSUPPORTED_SCALE_FORMAT,
                source_type=ScaleSourceType.DECLARED_MANUAL,
                raw_evidence_text=str(notation),
                parser_version=parser_version,
                manual_actor=actor,
                manual_source=source,
                view_bounds_source=view_bounds_source,
            )
        man_notation, m_per_pt, _ft, paper_units, real_units, denominator = parsed_manual
        if (cross_check is None and cross_checks is None) or cc_status == "MISSING":
            return _fail_closed(
                scale_decision_id=decision_id,
                fixture_id=fixture_id,
                source_page_id=source_page_id,
                view_id=view_id,
                view_bounds_pdf_pt=bounds,
                coordinate_transform_id=coordinate_transform_id,
                reason=ScaleReasonCode.CROSS_CHECK_MISSING,
                source_type=ScaleSourceType.DECLARED_MANUAL,
                raw_evidence_text=str(notation),
                parsed_notation=man_notation,
                paper_units=paper_units,
                real_units=real_units,
                scale_ratio_denominator=denominator,
                meters_per_pdf_point=m_per_pt,
                parser_version=parser_version,
                cross_check_status="MISSING",
                manual_actor=actor,
                manual_source=source,
                view_bounds_source=view_bounds_source,
            )
        if cc_status != "PASS":
            return _fail_closed(
                scale_decision_id=decision_id,
                fixture_id=fixture_id,
                source_page_id=source_page_id,
                view_id=view_id,
                view_bounds_pdf_pt=bounds,
                coordinate_transform_id=coordinate_transform_id,
                reason=ScaleReasonCode.CROSS_CHECK_FAILED,
                source_type=ScaleSourceType.DECLARED_MANUAL,
                raw_evidence_text=str(notation),
                parsed_notation=man_notation,
                paper_units=paper_units,
                real_units=real_units,
                scale_ratio_denominator=denominator,
                meters_per_pdf_point=m_per_pt,
                parser_version=parser_version,
                cross_check_type=cc_type,
                cross_check_source=cc_source,
                cross_check_expected_value=cc_expected,
                cross_check_measured_value=cc_measured,
                cross_check_relative_error=cc_error,
                cross_check_status="FAILED",
                manual_actor=actor,
                manual_source=source,
                view_bounds_source=view_bounds_source,
            )
        return ViewBoundScaleDecision(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            view_bounds_source=view_bounds_source,
            coordinate_transform_id=coordinate_transform_id,
            source_type=ScaleSourceType.DECLARED_MANUAL,
            raw_evidence_text=str(notation),
            raw_evidence_bbox_pdf_pt=None,
            parsed_notation=man_notation,
            paper_units=paper_units,
            real_units=real_units,
            scale_ratio_denominator=denominator,
            meters_per_pdf_point=m_per_pt,
            parser_version=parser_version,
            cross_check_type=cc_type,
            cross_check_source=cc_source,
            cross_check_expected_value=cc_expected,
            cross_check_measured_value=cc_measured,
            cross_check_relative_error=cc_error,
            cross_check_status="PASS",
            status=ViewBoundScaleStatus.VERIFIED_DECLARED,
            reason_codes=[ScaleReasonCode.DECLARED_SCALE_VERIFIED.value],
            manual_actor=actor,
            manual_source=source,
            physical_conversion_enabled=True,
        )

    if not candidates:
        reason = (
            ScaleReasonCode.TITLE_BLOCK_MISSING
            if title_block_missing
            else ScaleReasonCode.SCALE_TEXT_MISSING
        )
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=reason,
            parser_version=parser_version,
            view_bounds_source=view_bounds_source,
        )

    chosen = candidates[0]
    parsed_fields = {
        "source_type": ScaleSourceType.NATIVE_TEXT,
        "raw_evidence_text": chosen["text"][:240],
        "raw_evidence_bbox_pdf_pt": chosen["bbox_pdf_pt"],
        "parsed_notation": chosen["notation"],
        "paper_units": chosen["paper_units"],
        "real_units": chosen["real_units"],
        "scale_ratio_denominator": chosen["scale_ratio_denominator"],
        "meters_per_pdf_point": chosen["meters_per_pdf_point"],
    }

    if (cross_check is None and cross_checks is None) or cc_status == "MISSING":
        return ViewBoundScaleDecision(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            view_bounds_source=view_bounds_source,
            coordinate_transform_id=coordinate_transform_id,
            parser_version=parser_version,
            cross_check_type=cc_type,
            cross_check_source=cc_source,
            cross_check_expected_value=cc_expected,
            cross_check_measured_value=cc_measured,
            cross_check_relative_error=cc_error,
            cross_check_status="MISSING",
            status=ViewBoundScaleStatus.PARSED_UNVERIFIED,
            reason_codes=[ScaleReasonCode.CROSS_CHECK_MISSING.value],
            manual_actor=None,
            manual_source=None,
            physical_conversion_enabled=False,
            **parsed_fields,
        )

    if cc_status != "PASS":
        return _fail_closed(
            scale_decision_id=decision_id,
            fixture_id=fixture_id,
            source_page_id=source_page_id,
            view_id=view_id,
            view_bounds_pdf_pt=bounds,
            coordinate_transform_id=coordinate_transform_id,
            reason=ScaleReasonCode.CROSS_CHECK_FAILED,
            parser_version=parser_version,
            cross_check_type=cc_type,
            cross_check_source=cc_source,
            cross_check_expected_value=cc_expected,
            cross_check_measured_value=cc_measured,
            cross_check_relative_error=cc_error,
            cross_check_status="FAILED",
            view_bounds_source=view_bounds_source,
            **parsed_fields,
        )

    # Truthful classification of manual validation (SCALE-01-C1)
    is_manual = (
        manual_validation
        or view_bounds_source == "MANUAL_DEVELOPMENT_FIXTURE"
        or (cc_source and "MANUAL" in str(cc_source).upper())
    )
    status_val = (
        ViewBoundScaleStatus.MANUAL_VALIDATION
        if is_manual
        else ViewBoundScaleStatus.VERIFIED_AUTOMATIC
    )
    reason_code_val = (
        ScaleReasonCode.MANUAL_VALIDATION.value
        if is_manual
        else ScaleReasonCode.SCALE_VERIFIED.value
    )

    return ViewBoundScaleDecision(
        scale_decision_id=decision_id,
        fixture_id=fixture_id,
        source_page_id=source_page_id,
        view_id=view_id,
        view_bounds_pdf_pt=bounds,
        view_bounds_source=view_bounds_source,
        coordinate_transform_id=coordinate_transform_id,
        parser_version=parser_version,
        cross_check_type=cc_type,
        cross_check_source=cc_source,
        cross_check_expected_value=cc_expected,
        cross_check_measured_value=cc_measured,
        cross_check_relative_error=cc_error,
        cross_check_status="PASS",
        status=status_val,
        reason_codes=[reason_code_val],
        manual_actor=None,
        manual_source=None,
        physical_conversion_enabled=True,
        **parsed_fields,
    )
