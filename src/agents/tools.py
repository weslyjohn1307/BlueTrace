"""Tool Calling Registry and Database Query Engine for Product Agent 06 (Copilot-Judge).

Provides parameterized SQL aggregations, takeoff store queries, and proposal writes
governed by BlueTrace-AI fail-closed invariants (TASK-COP-001).
"""

from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import uuid
from collections.abc import Callable, Coroutine
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.store.reconciler import TakeoffReconciler
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)

# Constants for geometry highlight padding and limits
_POINT_HALF_EXTENT_PT = 20.0

# Forbidden SQL keywords for read-only aggregation safety
_FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|TRUNCATE|EXEC|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


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


def _envelope(points: list[tuple[float, float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def bbox_from_geometry(geometry: Any) -> list[float] | None:
    """Derive a physical PDF-point bbox [x1, y1, x2, y2] from stored geometry."""
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


def _clamp_to_sheet(bbox: list[float], sheet_meta: dict[str, Any] | None) -> list[float] | None:
    """Range-check a citation against sheet bounds (PDF points)."""
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
    if x2 < x1 or y2 < y1:
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


class ToolDefinition(BaseModel):
    """OpenAI / Meta Model API compatible tool specification."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    description: str
    parameters: dict[str, Any]

    def to_meta_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class TakeoffSummary(BaseModel):
    """Grounded aggregation result from database query."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    project_id: str
    system: str | None = None
    category: str | None = None
    total_count: int = 0
    accepted_count: int = 0
    suggested_count: int = 0
    rejected_count: int = 0
    total_linear_feet: float = 0.0
    accepted_linear_feet: float = 0.0
    breakdown: list[dict[str, Any]] = Field(default_factory=list)


class ToolRegistry:
    """Registry managing tool definitions, execution dispatch, and safety guards."""

    def __init__(self, store: TakeoffStore, db_path: str = "data/takeoff.sqlite3") -> None:
        self.store = store
        self.db_path = db_path
        self._tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, Callable[..., Coroutine[Any, Any, dict[str, Any]]]] = {}
        self._register_default_tools()

    def register_tool(
        self,
        definition: ToolDefinition,
        handler: Callable[..., Coroutine[Any, Any, dict[str, Any]]],
    ) -> None:
        self._tools[definition.name] = definition
        self._handlers[definition.name] = handler

    def get_meta_tools(self) -> list[dict[str, Any]]:
        return [tool.to_meta_schema() for tool in self._tools.values()]

    def is_safe_read_query(self, query: str) -> bool:
        """Verify query is strictly a single SELECT statement with no mutations."""
        stripped = query.strip()
        if not stripped.upper().startswith("SELECT"):
            return False
        if ";" in stripped.rstrip(";"):
            return False
        return not bool(_FORBIDDEN_SQL_PATTERN.search(stripped))

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Executes a registered tool with fail-closed safety."""
        if tool_name not in self._handlers:
            return {"error": f"Tool '{tool_name}' is not registered.", "success": False}
        handler = self._handlers[tool_name]
        try:
            return await handler(**arguments)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Tool %s execution failed: %s", tool_name, exc)
            return {"error": f"Tool execution error: {exc}", "success": False}

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Executes a registered tool by name. Alias for execute() adhering to agent dispatch protocols."""
        return await self.execute(tool_name, arguments)

    def _register_default_tools(self) -> None:
        # Tool 1: execute_takeoff_query (TASK-COP-001)
        self.register_tool(
            ToolDefinition(
                name="execute_takeoff_query",
                description=(
                    "Executes parameterized SQL aggregation over takeoff items for a project. "
                    "Returns exact integer counts, accepted/suggested counts, and linear footages."
                ),
                parameters={
                    "type": "object",
                    "properties": {
                        "project_id": {"type": "string", "description": "Target project ID"},
                        "system": {"type": "string", "description": "Optional MEP system filter (e.g. Supply, Return)"},
                        "category": {
                            "type": "string",
                            "description": "Optional category filter (DUCTWORK, PIPING, EQUIPMENT, FIXTURE)",
                        },
                        "raw_sql": {
                            "type": "string",
                            "description": "Optional custom read-only SELECT query for advanced aggregation",
                        },
                    },
                    "required": ["project_id"],
                },
            ),
            self.execute_takeoff_query,
        )

        # Tool 2: get_sheet
        self.register_tool(
            ToolDefinition(
                name="get_sheet",
                description="Retrieves metadata for a sheet including dimensions, title, discipline, and scale calibration status.",
                parameters={
                    "type": "object",
                    "properties": {
                        "sheet_id": {"type": "string", "description": "Sheet identifier"},
                    },
                    "required": ["sheet_id"],
                },
            ),
            self.get_sheet,
        )

        # Tool 3: list_items
        self.register_tool(
            ToolDefinition(
                name="list_items",
                description="Lists individual takeoff items on a sheet with optional filtering by system, category, or status.",
                parameters={
                    "type": "object",
                    "properties": {
                        "sheet_id": {"type": "string", "description": "Sheet identifier"},
                        "system": {"type": "string", "description": "Optional system filter"},
                        "category": {"type": "string", "description": "Optional category filter"},
                        "status": {"type": "string", "description": "Optional status filter (ACCEPTED, SUGGESTED, REJECTED)"},
                        "limit": {"type": "integer", "description": "Maximum items to return (default 50)"},
                    },
                    "required": ["sheet_id"],
                },
            ),
            self.list_items,
        )

        # Tool 4: get_annotation
        self.register_tool(
            ToolDefinition(
                name="get_annotation",
                description="Retrieves detailed annotation data for a specific item ID, including physical geometry and review history.",
                parameters={
                    "type": "object",
                    "properties": {
                        "item_id": {"type": "string", "description": "Unique item ID or evidence ID"},
                    },
                    "required": ["item_id"],
                },
            ),
            self.get_annotation,
        )

        # Tool 5: create_flag (HITL Invariant: SUGGESTED only)
        self.register_tool(
            ToolDefinition(
                name="create_flag",
                description="Creates a SUGGESTED review flag at a physical drawing location. Requires human estimator review.",
                parameters={
                    "type": "object",
                    "properties": {
                        "sheet_id": {"type": "string", "description": "Sheet ID where flag should be placed"},
                        "geometry": {"type": "object", "description": "Spatial geometry (point or bbox) in PDF points"},
                        "reason": {"type": "string", "description": "Clear engineering reason for the flag"},
                        "severity": {"type": "string", "enum": ["INFO", "WARNING", "CRITICAL"], "default": "WARNING"},
                    },
                    "required": ["sheet_id", "geometry", "reason"],
                },
            ),
            self.create_flag,
        )

        # Tool 6: propose_note (HITL Invariant: SUGGESTED only)
        self.register_tool(
            ToolDefinition(
                name="propose_note",
                description="Proposes an engineering note attached to an item or coordinate. Proposes as SUGGESTED only.",
                parameters={
                    "type": "object",
                    "properties": {
                        "sheet_id": {"type": "string", "description": "Sheet ID"},
                        "text": {"type": "string", "description": "Engineering note text"},
                        "annotation_id": {"type": "string", "description": "Optional target annotation/item ID to attach note to"},
                    },
                    "required": ["sheet_id", "text"],
                },
            ),
            self.propose_note,
        )

        # Tool 7: get_reconciliation
        self.register_tool(
            ToolDefinition(
                name="get_reconciliation",
                description="Retrieves schedule vs plan reconciliation report for a sheet, showing matched tags, undercounts, overcounts, and ghost pins.",
                parameters={
                    "type": "object",
                    "properties": {
                        "sheet_id": {"type": "string", "description": "Sheet ID to evaluate"},
                        "project_id": {"type": "string", "description": "Optional project ID"},
                    },
                    "required": ["sheet_id"],
                },
            ),
            self.get_reconciliation,
        )

    # Handlers
    async def execute_takeoff_query(
        self,
        project_id: str,
        system: str | None = None,
        category: str | None = None,
        raw_sql: str | None = None,
    ) -> dict[str, Any]:
        """Parameterized read-only SQL aggregation on takeoff_items."""
        if raw_sql:
            if not self.is_safe_read_query(raw_sql):
                return {
                    "success": False,
                    "error": "Query rejected by security governance: non-SELECT statement or mutation detected.",
                }
            query = raw_sql
            params: list[Any] = []
        else:
            query = """
                SELECT
                    category,
                    system,
                    dimension_label,
                    COUNT(*) as count,
                    SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END) as accepted_count,
                    SUM(CASE WHEN status = 'SUGGESTED' THEN 1 ELSE 0 END) as suggested_count,
                    SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count,
                    ROUND(SUM(total_length_ft), 2) as total_length_ft,
                    ROUND(SUM(CASE WHEN status = 'ACCEPTED' THEN total_length_ft ELSE 0.0 END), 2) as accepted_length_ft
                FROM takeoff_items
                WHERE project_id = ?
            """
            params = [project_id]
            if system:
                query += " AND system = ?"
                params.append(system)
            if category:
                query += " AND category = ?"
                params.append(category)
            query += " GROUP BY category, system, dimension_label"

        rows: list[dict[str, Any]] = []
        tot_count = 0
        acc_count = 0
        sug_count = 0
        rej_count = 0
        tot_ft = 0.0
        acc_ft = 0.0

        async with self.store._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(query, params) as cur:
                async for row in cur:
                    d = dict(row)
                    rows.append(d)
                    tot_count += d.get("count", 0) or 0
                    acc_count += d.get("accepted_count", 0) or 0
                    sug_count += d.get("suggested_count", 0) or 0
                    rej_count += d.get("rejected_count", 0) or 0
                    tot_ft += float(d.get("total_length_ft") or 0.0)
                    acc_ft += float(d.get("accepted_length_ft") or 0.0)

        summary = TakeoffSummary(
            project_id=project_id,
            system=system,
            category=category,
            total_count=tot_count,
            accepted_count=acc_count,
            suggested_count=sug_count,
            rejected_count=rej_count,
            total_linear_feet=round(tot_ft, 2),
            accepted_linear_feet=round(acc_ft, 2),
            breakdown=rows,
        )
        return {"success": True, "summary": summary.model_dump()}

    async def get_sheet(self, sheet_id: str) -> dict[str, Any]:
        meta = await self.store.get_sheet(sheet_id)
        if not meta:
            return {"sheet_id": sheet_id, "exists": False, "scale_status": "UNVERIFIED"}
        verified, scale_raw, ratio = _scale_state(meta)
        return {
            "sheet_id": sheet_id,
            "exists": True,
            "sheet_number": meta.get("sheet_number"),
            "sheet_title": meta.get("sheet_title"),
            "discipline": meta.get("discipline"),
            "scale_status": meta.get("scale_status"),
            "scale_raw": scale_raw,
            "scale_ratio": ratio,
            "scale_verified": verified,
            "width_pt": meta.get("width_pt"),
            "height_pt": meta.get("height_pt"),
        }

    async def list_items(
        self,
        sheet_id: str,
        system: str | None = None,
        category: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        items = await self.store.list_items(sheet_id=sheet_id, category=category, status=status)
        if system:
            target_sys = system.strip().lower()
            items = [it for it in items if it.system and (it.system == system or it.system.strip().lower() == target_sys)]
        sheet_meta = await self.store.get_sheet(sheet_id)
        results: list[dict[str, Any]] = []
        max_limit = limit if (isinstance(limit, int) and limit > 0) else 50
        for it in items[:max_limit]:
            bbox = bbox_from_geometry(it.geometry)
            clamped = _clamp_to_sheet(bbox, sheet_meta) if bbox else None
            results.append({
                "item_id": it.item_id,
                "category": it.category,
                "system": it.system,
                "dimension_label": it.dimension_label,
                "status": it.status,
                "total_length_ft": it.total_length_ft,
                "count": it.count,
                "bbox_pdf_pt": clamped,
                "review_required": it.review_required,
            })
        return {
            "sheet_id": sheet_id,
            "count": len(results),
            "total_matched": len(items),
            "items": results,
        }

    async def get_annotation(self, item_id: str) -> dict[str, Any]:
        async with self.store._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute("SELECT * FROM takeoff_items WHERE item_id = ?", (item_id,)) as cur:
                row = await cur.fetchone()
                if not row:
                    return {"item_id": item_id, "found": False}
                data = dict(row)
                data["found"] = True
                data["geometry"] = json.loads(data.get("geometry_json") or "{}")
                history = await self.store.get_item_history(item_id)
                data["history"] = history
                return data

    async def create_flag(
        self,
        sheet_id: str,
        geometry: dict[str, Any] | list[float],
        reason: str,
        severity: str = "WARNING",
    ) -> dict[str, Any]:
        """Creates a review flag. Always strictly SUGGESTED."""
        sheet_meta = await self.store.get_sheet(sheet_id)
        project_id = sheet_meta.get("project_id", "default_project") if sheet_meta else "default_project"
        flag_id = f"ev_flag_{sheet_id[:8]}_{uuid.uuid4().hex[:8]}"

        geom_dict = geometry if isinstance(geometry, dict) else {"type": "bbox", "coordinates": geometry}
        flag_record = TakeoffRecord(
            item_id=flag_id,
            project_id=project_id,
            sheet_id=sheet_id,
            category="EQUIPMENT",
            system=f"Flag-{severity}",
            dimension_label=f"Review Flag: {reason}",
            status="SUGGESTED",  # Strictly SUGGESTED per HITL rule
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry=geom_dict,
            confidence=0.5,
            review_required=True,
        )
        await self.store.add_takeoff_item(flag_record)
        return {
            "flag_id": flag_id,
            "sheet_id": sheet_id,
            "status": "SUGGESTED",
            "reason": reason,
            "severity": severity,
            "success": True,
        }

    async def propose_note(
        self,
        sheet_id: str,
        text: str,
        annotation_id: str | None = None,
    ) -> dict[str, Any]:
        """Proposes an engineering note. Always strictly SUGGESTED."""
        sheet_meta = await self.store.get_sheet(sheet_id)
        project_id = sheet_meta.get("project_id", "default_project") if sheet_meta else "default_project"
        note_id = f"ev_note_{sheet_id[:8]}_{uuid.uuid4().hex[:8]}"
        note_record = TakeoffRecord(
            item_id=note_id,
            project_id=project_id,
            sheet_id=sheet_id,
            category="FIXTURE",
            system="EngineeringNote",
            dimension_label=f"Note: {text}"[:100],
            status="SUGGESTED",  # Strictly SUGGESTED per HITL rule
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "note", "target_item": annotation_id},
            confidence=1.0,
            review_required=True,
        )
        await self.store.add_takeoff_item(note_record)
        return {
            "note_id": note_id,
            "annotation_id": annotation_id,
            "status": "SUGGESTED",
            "text": text,
            "success": True,
        }

    async def get_reconciliation(
        self,
        sheet_id: str,
        project_id: str | None = None,
        scheduled_items: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        reconciler = TakeoffReconciler(store=self.store)
        sheet_meta = await self.store.get_sheet(sheet_id)
        meta_pid = sheet_meta.get("project_id") if sheet_meta else None
        proj_id: str = project_id or (str(meta_pid) if meta_pid else "default_project")
        try:
            report = await reconciler.reconcile_from_store(
                project_id=proj_id,
                scheduled_items=scheduled_items or [],
                sheet_id=sheet_id,
            )
            return {"success": True, "report": report.to_dict()}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc), "match_rate": 0.0}
