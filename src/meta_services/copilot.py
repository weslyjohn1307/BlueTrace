"""BlueTraceAI Copilot: Conversational Takeoff Assistant via muse-wonder-1.0.

Provides drawing-aware engineering assistance:
  - Answers natural language questions about duct runs, diffusers, equipment, and scale
  - Deterministically queries the local TakeoffStore and drawing vectors
  - Cites physical drawing coordinates so the UI can highlight supporting evidence
  - Adheres strictly to the invariant: never hallucinates unverified dimensions.

Grounding contract (FAIL_CLOSED.md, product agent 06):
  - Every cited coordinate is a physical PDF-point bounding box
    ``[x1, y1, x2, y2]`` derived from geometry actually stored in
    ``TakeoffStore``. Citations are selected deterministically from store
    records by query intent (and the caller's selection box); they are
    never recovered by substring-matching model prose.
  - ``scale_verified`` is True only when the sheet status is
    VERIFIED/CALIBRATED *and* a finite, positive ``scale_ratio`` is stored.
    Every answer for an unverified sheet carries an explicit
    ``scale_status: UNVERIFIED`` fail-closed warning, on both the live and
    the offline path.
  - With no configured Meta Model API (or any live-call failure), the
    copilot falls back to a deterministic ledger template labelled
    ``OFFLINE_TEMPLATE`` with ``model_used=False``. It never fabricates
    counts, lengths, or coordinates, and never raises to the caller.
"""

from __future__ import annotations

import math
from typing import Any

from src.meta_services.client import MetaModelClient
from src.models.schemas import CopilotQueryRequest, CopilotQueryResponse
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

# Half-extent (PDF points) of the highlight box drawn around a stored
# point location. Display padding only -- never a measurement.
_POINT_HALF_EXTENT_PT = 20.0

# Maximum citations attached to one answer; the ledger itself is unbounded.
_MAX_CITATIONS = 10
_MAX_CONTEXT_ITEMS = 20

_SCALE_WORDS = ("scale", "calibrat", "ratio", "dimension")
_EQUIPMENT_WORDS = ("diffuser", "vav", "equipment", "damper", "fan", "fixture", "terminal")
_EQUIPMENT_LABEL_WORDS = ("diffuser", "vav", "damper", "fan", "terminal", "grille", "register")
_DUCT_WORDS = ("duct", "pipe", "piping", "linework", "length", "footage", "linear", "run")


def _finite_float(value: Any) -> float | None:
    """Return ``value`` as a finite float, or None for anything else."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _coerce_bbox4(values: Any) -> list[float] | None:
    """Normalize a 4-number sequence to an ordered [x1, y1, x2, y2] box."""
    if not isinstance(values, (list, tuple)) or len(values) != 4:
        return None
    checked: list[float] = []
    for value in values:
        number = _finite_float(value)
        if number is None:
            return None
        checked.append(number)
    x1, y1, x2, y2 = checked
    return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]


def _points_from(value: Any) -> list[tuple[float, float]]:
    """Extract finite (x, y) points from a list of 2-number sequences."""
    points: list[tuple[float, float]] = []
    if not isinstance(value, (list, tuple)):
        return points
    for raw in value:
        if not isinstance(raw, (list, tuple)) or len(raw) < 2:
            return []
        x, y = _finite_float(raw[0]), _finite_float(raw[1])
        if x is None or y is None:
            return []
        points.append((x, y))
    return points


def bbox_from_geometry(geometry: Any) -> list[float] | None:
    """Derive a physical PDF-point bbox [x1, y1, x2, y2] from stored geometry.

    Handles every geometry shape the store persists:
      - ``{"type": "point", "coordinates": [x, y]}`` -> point +/- padding
      - ``{"coordinates": [x1, y1, x2, y2]}`` / ``{"bbox": [...]}`` -> verbatim
      - ``{"type": "polyline", "points": [[x, y], ...]}`` -> envelope
      - a bare list of points -> envelope

    Returns None for missing, malformed, or non-finite geometry so the
    caller abstains from citing rather than inventing a location.
    """
    if isinstance(geometry, dict):
        for key in ("bbox", "bounding_box"):
            bbox = _coerce_bbox4(geometry.get(key))
            if bbox is not None:
                return bbox
        coords = geometry.get("coordinates")
        bbox = _coerce_bbox4(coords)
        if bbox is not None:
            return bbox
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            x, y = _finite_float(coords[0]), _finite_float(coords[1])
            if x is not None and y is not None:
                return [
                    x - _POINT_HALF_EXTENT_PT,
                    y - _POINT_HALF_EXTENT_PT,
                    x + _POINT_HALF_EXTENT_PT,
                    y + _POINT_HALF_EXTENT_PT,
                ]
        ring = _points_from(coords)
        if ring:
            return _envelope(ring)
        points = _points_from(geometry.get("points"))
        if points:
            return _envelope(points)
        return None
    if isinstance(geometry, list):
        points = _points_from(geometry)
        if points:
            return _envelope(points)
    return None


def _envelope(points: list[tuple[float, float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def _clamp_to_sheet(bbox: list[float], sheet_meta: dict[str, Any] | None) -> list[float] | None:
    """Range-check a citation against sheet bounds (PDF points).

    Partially off-sheet boxes are clamped to the sheet edge; a box lying
    entirely outside the sheet cannot be evidence on it and is dropped.
    """
    if not sheet_meta:
        return bbox
    width = _finite_float(sheet_meta.get("width_pt"))
    height = _finite_float(sheet_meta.get("height_pt"))
    if width is None or height is None or width <= 0 or height <= 0:
        return bbox
    x1 = max(0.0, bbox[0])
    y1 = max(0.0, bbox[1])
    x2 = min(width, bbox[2])
    y2 = min(height, bbox[3])
    if x2 <= x1 or y2 <= y1:
        return None
    return [x1, y1, x2, y2]


def _scale_state(sheet_meta: dict[str, Any] | None) -> tuple[bool, str, float | None]:
    """Fail-closed scale state: verified needs status AND a usable ratio."""
    if not sheet_meta:
        return False, "UNVERIFIED", None
    scale_raw = str(sheet_meta.get("scale_raw") or "UNVERIFIED")
    ratio = _finite_float(sheet_meta.get("scale_ratio"))
    status = str(sheet_meta.get("scale_status") or "UNVERIFIED").strip().upper()
    verified = status in ("VERIFIED", "CALIBRATED") and ratio is not None and ratio > 0
    return verified, scale_raw, ratio


def _bbox_intersects(a: list[float], b: list[float]) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


class TakeoffCopilot:
    def __init__(self, client: MetaModelClient | None = None, store: TakeoffStore | None = None):
        self.client = client or MetaModelClient()
        self.store = store or TakeoffStore()

    # -- deterministic store "tools" (product agent 06) --------------------

    def _citations(
        self, items: list[TakeoffRecord], sheet_meta: dict[str, Any] | None
    ) -> tuple[list[list[float]], list[str]]:
        """Pair each referenced item ID with its real stored PDF bbox."""
        coords: list[list[float]] = []
        item_ids: list[str] = []
        for item in items:
            if len(coords) >= _MAX_CITATIONS:
                break
            bbox = bbox_from_geometry(item.geometry)
            if bbox is None:
                continue
            bbox = _clamp_to_sheet(bbox, sheet_meta)
            if bbox is None:
                continue
            coords.append(bbox)
            item_ids.append(item.item_id)
        return coords, item_ids

    def _select_items(
        self,
        query_lower: str,
        items: list[TakeoffRecord],
        selection_bbox: list[float] | None,
    ) -> list[TakeoffRecord]:
        """Deterministically choose the ledger records a query is about."""
        selected = items
        if selection_bbox is not None:
            selected = [
                it
                for it in selected
                if (b := bbox_from_geometry(it.geometry)) is not None
                and _bbox_intersects(b, selection_bbox)
            ]
        if any(w in query_lower for w in _EQUIPMENT_WORDS):
            return [
                it
                for it in selected
                if it.category in ("EQUIPMENT", "FIXTURE")
                or any(k in (it.dimension_label or "").lower() for k in _EQUIPMENT_LABEL_WORDS)
            ]
        if any(w in query_lower for w in _DUCT_WORDS):
            return [it for it in selected if it.category in ("DUCTWORK", "PIPING")]
        return selected

    # -- answer construction ------------------------------------------------

    @staticmethod
    def _scale_warning(sheet_id: str) -> str:
        return (
            f"scale_status: UNVERIFIED -- sheet '{sheet_id}' has no verified scale "
            "calibration in the takeoff store (Fail-Closed Rule). Counts below are "
            "ledger record counts only; no length or dimension is verified until "
            "the sheet scale is calibrated and verified."
        )

    def _offline_answer(
        self,
        *,
        query_lower: str,
        sheet_id: str,
        sheet_meta: dict[str, Any] | None,
        items: list[TakeoffRecord],
        selected: list[TakeoffRecord],
        total_ft: float,
    ) -> CopilotQueryResponse:
        """Deterministic ledger template. Every number comes from the store."""
        scale_verified, scale_raw, scale_ratio = _scale_state(sheet_meta)
        coords, item_ids = self._citations(selected, sheet_meta)
        prefix = "[OFFLINE_TEMPLATE] "

        if any(w in query_lower for w in _SCALE_WORDS):
            if scale_verified:
                answer = (
                    f"{prefix}Sheet '{sheet_id}' scale_status: VERIFIED -- calibrated "
                    f"at {scale_raw} (scale factor {scale_ratio}). Linear duct footages "
                    "and equipment dimensions are validated against physical vector "
                    "linework at this ratio."
                )
            elif sheet_meta is None:
                answer = (
                    f"{prefix}No sheet record for '{sheet_id}' exists in the takeoff "
                    f"store. {self._scale_warning(sheet_id)}"
                )
            else:
                answer = (
                    f"{prefix}Sheet '{sheet_id}' {self._scale_warning(sheet_id)} "
                    f"Stored scale text: {scale_raw}."
                )
            return CopilotQueryResponse(
                answer=answer,
                cited_coordinates=[],
                referenced_item_ids=[],
                scale_verified=scale_verified,
                model_used=False,
            )

        if any(w in query_lower for w in _EQUIPMENT_WORDS):
            count = len(selected)
            if count == 0:
                answer = (
                    f"{prefix}Found 0 scheduled equipment instances on sheet "
                    f"'{sheet_id}'. No matching items in the active takeoff ledger."
                )
            else:
                labels = ", ".join(it.dimension_label for it in selected[:5])
                answer = (
                    f"{prefix}Found {count} scheduled equipment instance(s) on sheet "
                    f"'{sheet_id}' in the takeoff ledger: {labels}. "
                    "Cited coordinates are the stored physical drawing locations."
                )
            if not scale_verified:
                answer += f" {self._scale_warning(sheet_id)}"
            return CopilotQueryResponse(
                answer=answer,
                cited_coordinates=coords,
                referenced_item_ids=item_ids,
                scale_verified=scale_verified,
                model_used=False,
            )

        accepted = sum(1 for it in items if it.status == "ACCEPTED")
        suggested = sum(1 for it in items if it.status == "SUGGESTED")
        rejected = sum(1 for it in items if it.status == "REJECTED")
        answer = (
            f"{prefix}Drawing analysis for sheet '{sheet_id}': ledger currently "
            f"records {total_ft:.1f} accepted linear feet across {len(items)} "
            f"item(s) ({accepted} accepted, {suggested} suggested, "
            f"{rejected} rejected). Select any duct run or hover with QuickDraw "
            "(press 'Q') to inspect individual dimensions."
        )
        if not scale_verified:
            answer += f" {self._scale_warning(sheet_id)}"
        return CopilotQueryResponse(
            answer=answer,
            cited_coordinates=coords,
            referenced_item_ids=item_ids,
            scale_verified=scale_verified,
            model_used=False,
        )

    async def answer_query(self, request: CopilotQueryRequest) -> CopilotQueryResponse:
        """Answers an engineering query using drawing context and ledger database."""
        query_lower = request.query.lower()
        sheet_id = request.sheet_id or "active"
        try:
            return await self._answer_query_grounded(request, query_lower, sheet_id)
        except Exception:  # noqa: BLE001 -- copilot must never raise to the API layer
            return CopilotQueryResponse(
                answer=(
                    "[OFFLINE_TEMPLATE] The takeoff ledger could not be read, so no "
                    f"grounded answer is available for sheet '{sheet_id}'. "
                    f"{self._scale_warning(sheet_id)}"
                ),
                cited_coordinates=[],
                referenced_item_ids=[],
                scale_verified=False,
                model_used=False,
            )

    async def _answer_query_grounded(
        self, request: CopilotQueryRequest, query_lower: str, sheet_id: str
    ) -> CopilotQueryResponse:
        # Deterministic store queries: sheet scale, line items, ledger rollup.
        sheet_meta = await self.store.get_sheet(sheet_id)
        all_items = await self.store.list_items(sheet_id=sheet_id)
        summary = await self.store.get_ledger_summary(sheet_id=sheet_id)
        total_ft = sum(s.total_length_ft for s in summary)
        scale_verified, scale_raw, scale_ratio = _scale_state(sheet_meta)

        selection_bbox = _coerce_bbox4(request.selection_bbox)
        selected = self._select_items(query_lower, all_items, selection_bbox)

        # If live Meta Model API is configured, use muse-wonder-1.0 reasoning
        # over the grounded store context. Citations never come from model
        # prose; they are resolved deterministically from the same records.
        if self.client.is_configured():
            coords, item_ids = self._citations(selected, sheet_meta)
            context_data: dict[str, Any] = {
                "sheet_id": sheet_id,
                "scale_status": "VERIFIED" if scale_verified else "UNVERIFIED",
                "scale_raw": scale_raw,
                "scale_ratio": scale_ratio,
                "total_items_in_ledger": len(all_items),
                "total_linear_feet_accepted": round(total_ft, 2),
                "items": [
                    {
                        "item_id": it.item_id,
                        "category": it.category,
                        "system": it.system,
                        "dimension_label": it.dimension_label,
                        "status": it.status,
                        "length_ft": it.total_length_ft,
                        "bbox_pdf_pt": bbox_from_geometry(it.geometry),
                    }
                    for it in selected[:_MAX_CONTEXT_ITEMS]
                ],
            }
            try:
                reasoning_res = self.client.query_reasoning(
                    prompt=(
                        f"{request.query}\n\nAnswer using ONLY the context records. "
                        "Reference items by item_id. Never invent coordinates, "
                        "counts, lengths, or scale ratios."
                    ),
                    context=context_data,
                )
            except Exception:  # noqa: BLE001 -- fall through to offline template
                reasoning_res = {"content": "", "mock": True}
            ans_text = str(reasoning_res.get("content") or "").strip()
            if ans_text and not reasoning_res.get("mock"):
                if not scale_verified:
                    ans_text += f"\n\n{self._scale_warning(sheet_id)}"
                return CopilotQueryResponse(
                    answer=ans_text,
                    cited_coordinates=coords,
                    referenced_item_ids=item_ids,
                    scale_verified=scale_verified,
                    model_used=True,
                )
            # Unconfigured-at-runtime, mocked, or empty model output: abstain
            # to the deterministic template instead of presenting model text.

        return self._offline_answer(
            query_lower=query_lower,
            sheet_id=sheet_id,
            sheet_meta=sheet_meta,
            items=all_items,
            selected=selected,
            total_ft=total_ft,
        )
