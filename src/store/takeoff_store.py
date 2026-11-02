"""BlueTraceAI Takeoff Store & Ledger Rollup (SQLite / aiosqlite).

Provides durable, transactional storage for:
  - Sheets and project metadata
  - Takeoff line items (linework runs, equipment symbols, fittings)
  - SUGGESTED / ACCEPTED / REJECTED human-in-the-loop review workflow
  - Multi-discipline ledger aggregation and rollup
  - Standard Estimating CSV and JSON export
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import sqlite3
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import aiosqlite
from pydantic import BaseModel, Field


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def compute_file_sha256(path: str | Path) -> str:
    """Return the hex SHA-256 digest of a file's bytes (chunked, no full load)."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_provenance_defaults() -> dict[str, str]:
    """Read pipeline/model/prompt versions with an honest fallback.

    Returns ``{"pipeline_version": ..., "model_version": ..., "prompt_version": ...}``.
    Missing or unreadable config is never fabricated: values fall back to
    ``"unknown"`` so downstream consumers can surface ``review_required``.
    """
    fallback = {
        "pipeline_version": "unknown",
        "model_version": "unknown",
        "prompt_version": "unknown",
    }
    try:
        config_path = Path(__file__).resolve().parents[2] / "configs" / "pipeline_version.json"
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        version = str(raw.get("version", "")).strip()
        if version:
            fallback["pipeline_version"] = version
        for key in ("model_version", "prompt_version"):
            value = str(raw.get(key, "")).strip()
            if value:
                fallback[key] = value
    except (OSError, ValueError, AttributeError):
        pass
    return fallback


def _provenance_values(record: TakeoffRecord, defaults: dict[str, str]) -> tuple[str, str, str]:
    """Resolve provenance triplet, auto-filling honest defaults for missing values."""
    return (
        record.pipeline_version or defaults["pipeline_version"],
        record.model_version or defaults["model_version"],
        record.prompt_version or defaults["prompt_version"],
    )


class TakeoffRecord(BaseModel):
    item_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    sheet_id: str
    category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"]
    system: str = "General"
    dimension_label: str = "Unknown"
    status: Literal["SUGGESTED", "ACCEPTED", "REJECTED"] = "SUGGESTED"
    source: Literal["QUICKDRAW_HOVER", "VECTOR_ENGINE", "VLM_DETECTION", "MANUAL"] = "VECTOR_ENGINE"
    total_length_ft: float = 0.0
    count: int = 1
    geometry: dict[str, Any] | list[Any] = Field(default_factory=dict)
    confidence: float | None = None
    review_required: bool = False
    airflow_cfm: float | None = None
    electrical_kw: float | None = None
    inlet_dimension_inches: str | None = None
    equipment_tag: str | None = None
    pipeline_version: str | None = None
    model_version: str | None = None
    prompt_version: str | None = None
    created_at: str = Field(default_factory=_utc_now_iso)
    updated_at: str = Field(default_factory=_utc_now_iso)


class LedgerSummaryRow(BaseModel):
    category: str
    system: str
    dimension_label: str
    total_length_ft: float
    total_count: int
    accepted_count: int
    suggested_count: int
    rejected_count: int


_METERS_PER_FOOT = 0.3048

_SESSION_DEFAULTS: dict[str, Any] = {
    "active_sheet_id": None,
    "viewport_scale": 1.0,
    "viewport_tx": 0.0,
    "viewport_ty": 0.0,
    "selected_pin_id": None,
    "active_tool_mode": "select",
    "discipline_filter": "ALL",
    "search_query": "",
}

_SESSION_TOOL_MODES = frozenset({"select", "pan", "quickdraw", "segment", "calibrate"})


def _polyline_points(result: dict[str, Any]) -> list[list[float]]:
    """Extract finite polyline vertices from either pipeline result shape.

    Malformed or non-finite vertices invalidate the whole run (fail closed);
    they never raise and never reach the ledger.
    """
    for key in ("location_or_path", "polyline_pdf_pt"):
        container = result.get(key)
        if isinstance(container, dict):
            raw_points = container.get("points")
            if isinstance(raw_points, list) and len(raw_points) >= 2:
                points: list[list[float]] = []
                for raw in raw_points:
                    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
                        return []
                    try:
                        x, y = float(raw[0]), float(raw[1])
                    except (TypeError, ValueError, OverflowError):
                        return []
                    if not (math.isfinite(x) and math.isfinite(y)):
                        return []
                    points.append([x, y])
                if len(points) >= 2:
                    return points
    return []


def _geometric_length_pt(points: list[list[float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        total += math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
    return total


def pipeline_results_to_records(
    pipeline_result: dict[str, Any],
    *,
    project_id: str,
    sheet_id: str,
    sheet_scale_status: str,
) -> list[TakeoffRecord]:
    """Map vector pipeline output to ledger records under the fail-closed scale rule.

    A run is ACCEPTED with measured footage only when every gate holds: the
    sheet scale is VERIFIED/CALIBRATED, the pipeline scale gate is VALID at
    both document and run level, the physical length is finite and positive,
    the unit is metres, the geometry has positive length, and the run carries
    no unclosed-gap or uncertainty flags. Every other run stays SUGGESTED at
    0.0 ft with ``review_required=True``; geometry is always preserved.

    System and size are never invented from linework alone: vector runs are
    ``General`` / ``Unknown - size TBD`` until hover or schedule evidence
    classifies them.
    """
    sheet_verified = sheet_scale_status.strip().upper() in {"VERIFIED", "CALIBRATED"}
    top_scale_status = str(pipeline_result.get("scale_status") or "")
    raw_results = pipeline_result.get("results")
    if not isinstance(raw_results, list):
        return []

    records: list[TakeoffRecord] = []
    for index, raw in enumerate(raw_results):
        if not isinstance(raw, dict):
            continue
        points = _polyline_points(raw)
        if len(points) < 2:
            continue  # Degenerate geometry can never become a ledger line.
        geometric_length_pt = _geometric_length_pt(points)
        object_type = str(raw.get("object_type") or "duct").strip().lower()
        is_pipe = object_type == "pipe"
        category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"] = (
            "PIPING" if is_pipe else "DUCTWORK"
        )
        run_scale_status = str(raw.get("scale_status") or top_scale_status)
        length_m = raw.get("length")
        measured_length_m: float | None = None
        if (
            isinstance(length_m, (int, float))
            and not isinstance(length_m, bool)
            and math.isfinite(float(length_m))
            and float(length_m) > 0
        ):
            measured_length_m = float(length_m)
        length_unit = raw.get("length_unit")
        uncertainty_codes = raw.get("uncertainty_codes")
        has_uncertainty = (
            raw.get("has_unclosed_gaps") is True
            or (isinstance(uncertainty_codes, list) and len(uncertainty_codes) > 0)
            or (
                isinstance(raw.get("continuity_status"), str)
                and raw["continuity_status"] not in ("", "CONTINUOUS")
            )
        )
        measured = (
            sheet_verified
            and top_scale_status == "VALID"
            and run_scale_status == "VALID"
            and measured_length_m is not None
            and geometric_length_pt > 0
            and length_unit in (None, "m")
            and not has_uncertainty
        )
        if measured and measured_length_m is not None:
            status: Literal["SUGGESTED", "ACCEPTED", "REJECTED"] = "ACCEPTED"
            total_length_ft = round(measured_length_m / _METERS_PER_FOOT, 4)
            confidence: float | None = 1.0
            review_required = False
        else:
            status = "SUGGESTED"
            total_length_ft = 0.0
            raw_confidence = raw.get("confidence")
            confidence = (
                float(raw_confidence)
                if isinstance(raw_confidence, (int, float)) and not isinstance(raw_confidence, bool)
                else None
            )
            review_required = True

        source_id = raw.get("object_id") or raw.get("route_run_id")
        identity_seed = str(source_id) if source_id else f"run-{index}"
        digest = hashlib.sha256(
            f"{project_id}|{sheet_id}|{identity_seed}|{points}".encode()
        ).hexdigest()[:32]
        item_id = f"vec-{digest}"
        geometry: dict[str, Any] = {
            "type": "polyline",
            "points": points,
            "coordinate_space": "pdf_user_space_pt",
            "geometric_length_pt": round(geometric_length_pt, 4),
            "scale_status": run_scale_status,
            "sheet_scale_status": sheet_scale_status,
            "object_type": object_type,
            "run_index": index,
        }
        if source_id:
            geometry["source_object_id"] = str(source_id)
        if has_uncertainty:
            geometry["has_uncertainty"] = True

        records.append(
            TakeoffRecord(
                item_id=item_id,
                project_id=project_id,
                sheet_id=sheet_id,
                category=category,
                system="General",
                dimension_label="Unknown - size TBD",
                status=status,
                source="VECTOR_ENGINE",
                total_length_ft=total_length_ft,
                count=1,
                geometry=geometry,
                confidence=confidence,
                review_required=review_required,
            )
        )
    return records


class TakeoffStore:
    """Async SQLite takeoff store adhering to single-writer transactional consistency."""

    def __init__(self, db_path: str | Path = "data/takeoff.sqlite3"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def _session(self) -> AsyncIterator[Any]:
        """Yields a connection with durability pragmas applied."""
        db = await aiosqlite.connect(self.db_path, timeout=10.0)
        try:
            await db.execute("PRAGMA journal_mode=WAL;")
            await db.execute("PRAGMA busy_timeout=10000;")
            await db.execute("PRAGMA foreign_keys=ON;")
            yield db
        finally:
            await db.close()

    async def initialize(self) -> None:
        """Create database tables and indexes if they do not exist."""
        async with self._session() as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    project_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    package_hash_sha256 TEXT NOT NULL DEFAULT '',
                    file_size_bytes INTEGER,
                    created_at TEXT NOT NULL
                );
            """)
            async with db.execute("PRAGMA table_info(projects)") as cur:
                project_columns = [row[1] for row in await cur.fetchall()]
            if "package_hash_sha256" not in project_columns:
                await db.execute(
                    "ALTER TABLE projects ADD COLUMN package_hash_sha256 TEXT NOT NULL DEFAULT ''"
                )
            if "file_size_bytes" not in project_columns:
                await db.execute("ALTER TABLE projects ADD COLUMN file_size_bytes INTEGER")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sheets (
                    sheet_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    page_index INTEGER NOT NULL,
                    sheet_number TEXT NOT NULL,
                    sheet_title TEXT NOT NULL,
                    discipline TEXT NOT NULL,
                    scale_raw TEXT,
                    scale_ratio REAL,
                    scale_status TEXT NOT NULL,
                    width_pt REAL NOT NULL,
                    height_pt REAL NOT NULL,
                    created_at TEXT NOT NULL
                );
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS takeoff_items (
                    item_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    sheet_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    system TEXT NOT NULL,
                    dimension_label TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source TEXT NOT NULL,
                    total_length_ft REAL NOT NULL DEFAULT 0.0,
                    count INTEGER NOT NULL DEFAULT 1,
                    geometry_json TEXT NOT NULL DEFAULT '{}',
                    confidence REAL,
                    review_required INTEGER NOT NULL DEFAULT 0,
                    airflow_cfm REAL,
                    electrical_kw REAL,
                    inlet_dimension_inches TEXT,
                    equipment_tag TEXT,
                    pipeline_version TEXT,
                    model_version TEXT,
                    prompt_version TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
            # Migration for databases created before review_required existed.
            async with db.execute("PRAGMA table_info(takeoff_items)") as cur:
                columns = [row[1] for row in await cur.fetchall()]
            if "review_required" not in columns:
                await db.execute(
                    "ALTER TABLE takeoff_items ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0"
                )
            for _col, _ddl in (
                ("airflow_cfm", "ALTER TABLE takeoff_items ADD COLUMN airflow_cfm REAL"),
                ("electrical_kw", "ALTER TABLE takeoff_items ADD COLUMN electrical_kw REAL"),
                (
                    "inlet_dimension_inches",
                    "ALTER TABLE takeoff_items ADD COLUMN inlet_dimension_inches TEXT",
                ),
                ("equipment_tag", "ALTER TABLE takeoff_items ADD COLUMN equipment_tag TEXT"),
                (
                    "pipeline_version",
                    "ALTER TABLE takeoff_items ADD COLUMN pipeline_version TEXT",
                ),
                ("model_version", "ALTER TABLE takeoff_items ADD COLUMN model_version TEXT"),
                ("prompt_version", "ALTER TABLE takeoff_items ADD COLUMN prompt_version TEXT"),
            ):
                if _col not in columns:
                    await db.execute(_ddl)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS review_events (
                    event_id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    previous_status TEXT NOT NULL,
                    new_status TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES takeoff_items(item_id)
                );
            """)
            # Create indexes
            await db.execute("CREATE INDEX IF NOT EXISTS idx_takeoff_project ON takeoff_items(project_id);")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_takeoff_sheet ON takeoff_items(sheet_id);")
            await db.execute("""CREATE INDEX IF NOT EXISTS idx_takeoff_status ON takeoff_items(status);""")
            await db.execute("""
                CREATE TABLE IF NOT EXISTS project_sessions (
                    session_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    active_sheet_id TEXT,
                    viewport_scale REAL NOT NULL DEFAULT 1.0,
                    viewport_tx REAL NOT NULL DEFAULT 0.0,
                    viewport_ty REAL NOT NULL DEFAULT 0.0,
                    selected_pin_id TEXT,
                    active_tool_mode TEXT NOT NULL DEFAULT 'select',
                    discipline_filter TEXT NOT NULL DEFAULT 'ALL',
                    search_query TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
                );
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON project_sessions(project_id);"
            )
            await db.commit()

    async def insert_project(
        self,
        project_id: str,
        name: str,
        package_hash_sha256: str = "",
        file_size_bytes: int | None = None,
    ) -> None:
        async with self._session() as db:
            await db.execute(
                """INSERT INTO projects (project_id, name, package_hash_sha256, file_size_bytes, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    name = excluded.name,
                    package_hash_sha256 = CASE
                        WHEN excluded.package_hash_sha256 <> '' THEN excluded.package_hash_sha256
                        ELSE projects.package_hash_sha256
                    END,
                    file_size_bytes = COALESCE(excluded.file_size_bytes, projects.file_size_bytes)""",
                (project_id, name, package_hash_sha256, file_size_bytes, _utc_now_iso()),
            )
            await db.commit()

    async def get_project(self, project_id: str) -> dict[str, Any] | None:
        """Retrieve project metadata by project_id."""
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(
                "SELECT * FROM projects WHERE project_id = ?", (project_id,)
            ) as cur:
                row = await cur.fetchone()
                if row:
                    return dict(row)
        return None

    async def insert_sheet(
        self,
        sheet_id: str,
        project_id: str,
        page_index: int,
        sheet_number: str,
        sheet_title: str,
        discipline: str,
        scale_raw: str | None,
        scale_ratio: float | None,
        scale_status: str,
        width_pt: float,
        height_pt: float,
    ) -> None:
        async with self._session() as db:
            await db.execute(
                """
                INSERT INTO sheets (
                    sheet_id, project_id, page_index, sheet_number, sheet_title,
                    discipline, scale_raw, scale_ratio, scale_status, width_pt, height_pt, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(sheet_id) DO UPDATE SET
                    project_id = excluded.project_id, page_index = excluded.page_index,
                    sheet_number = excluded.sheet_number, sheet_title = excluded.sheet_title,
                    discipline = excluded.discipline, scale_raw = excluded.scale_raw,
                    scale_ratio = excluded.scale_ratio, scale_status = excluded.scale_status,
                    width_pt = excluded.width_pt, height_pt = excluded.height_pt
                """,
                (
                    sheet_id,
                    project_id,
                    page_index,
                    sheet_number,
                    sheet_title,
                    discipline,
                    scale_raw,
                    scale_ratio,
                    scale_status,
                    width_pt,
                    height_pt,
                    _utc_now_iso(),
                ),
            )
            await db.commit()

    async def get_sheet(self, sheet_id: str) -> dict[str, Any] | None:
        """Retrieve sheet metadata by sheet_id."""
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute("SELECT * FROM sheets WHERE sheet_id = ?", (sheet_id,)) as cur:
                row = await cur.fetchone()
                if row:
                    return dict(row)
        return None

    def _validate_session_state(self, state: dict[str, Any]) -> None:
        for key in ("viewport_scale", "viewport_tx", "viewport_ty"):
            if key in state and state[key] is not None:
                try:
                    value = float(state[key])
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"Session field '{key}' must be a finite number.") from exc
                if not math.isfinite(value):
                    raise ValueError(f"Session field '{key}' must be a finite number.")
        if "viewport_scale" in state and state["viewport_scale"] is not None:
            try:
                scale_value = float(state["viewport_scale"])
            except (TypeError, ValueError) as exc:
                raise ValueError("Session field 'viewport_scale' must be a finite number.") from exc
            if not math.isfinite(scale_value) or scale_value <= 0:
                raise ValueError("Session field 'viewport_scale' must be greater than 0.")
        tool_mode = state.get("active_tool_mode")
        if tool_mode is not None and tool_mode not in _SESSION_TOOL_MODES:
            raise ValueError(
                "active_tool_mode must be one of select/pan/quickdraw/segment/calibrate."
            )

    async def _require_project(self, db: Any, project_id: str) -> None:
        async with db.execute(
            "SELECT 1 FROM projects WHERE project_id = ?", (project_id,)
        ) as cur:
            if await cur.fetchone() is None:
                raise ValueError(f"Unknown project_id '{project_id}'.")

    async def get_or_create_session(self, project_id: str) -> dict[str, Any]:
        """Return the persistent session for a project, creating defaults first.

        Fail-closed: unknown projects raise ValueError and never auto-create.
        """
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            await self._require_project(db, project_id)
            async with db.execute(
                "SELECT * FROM project_sessions WHERE project_id = ?", (project_id,)
            ) as cur:
                row = await cur.fetchone()
                if row:
                    return dict(row)
            session_id = f"session-{project_id}"
            now = _utc_now_iso()
            await db.execute(
                """
                INSERT INTO project_sessions (
                    session_id, project_id, active_sheet_id, viewport_scale,
                    viewport_tx, viewport_ty, selected_pin_id, active_tool_mode,
                    discipline_filter, search_query, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO NOTHING
                """,
                (
                    session_id,
                    project_id,
                    _SESSION_DEFAULTS["active_sheet_id"],
                    _SESSION_DEFAULTS["viewport_scale"],
                    _SESSION_DEFAULTS["viewport_tx"],
                    _SESSION_DEFAULTS["viewport_ty"],
                    _SESSION_DEFAULTS["selected_pin_id"],
                    _SESSION_DEFAULTS["active_tool_mode"],
                    _SESSION_DEFAULTS["discipline_filter"],
                    _SESSION_DEFAULTS["search_query"],
                    now,
                ),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM project_sessions WHERE project_id = ?", (project_id,)
            ) as cur:
                row = await cur.fetchone()
                assert row is not None
                return dict(row)

    async def save_session_state(self, project_id: str, state: dict[str, Any]) -> None:
        """Persist viewport/tool/filter state for a project session.

        Fail-closed: unknown projects raise ValueError; non-finite viewport
        floats and unknown tool modes raise ValueError and persist nothing.
        """
        self._validate_session_state(state)
        allowed = (
            "active_sheet_id",
            "viewport_scale",
            "viewport_tx",
            "viewport_ty",
            "selected_pin_id",
            "active_tool_mode",
            "discipline_filter",
            "search_query",
        )
        updates: dict[str, Any] = {}
        for key in allowed:
            if key in state:
                value = state[key]
                if key in ("viewport_scale", "viewport_tx", "viewport_ty") and value is not None:
                    value = float(value)
                updates[key] = value
        async with self._session() as db:
            await self._require_project(db, project_id)
            # Ensure a row exists before updating.
            db.row_factory = sqlite3.Row
            async with db.execute(
                "SELECT session_id FROM project_sessions WHERE project_id = ?", (project_id,)
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                session_id = f"session-{project_id}"
                await db.execute(
                    """
                    INSERT INTO project_sessions (
                        session_id, project_id, active_sheet_id, viewport_scale,
                        viewport_tx, viewport_ty, selected_pin_id, active_tool_mode,
                        discipline_filter, search_query, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        project_id,
                        updates.get("active_sheet_id", _SESSION_DEFAULTS["active_sheet_id"]),
                        float(updates.get("viewport_scale", 1.0)),
                        float(updates.get("viewport_tx", 0.0)),
                        float(updates.get("viewport_ty", 0.0)),
                        updates.get("selected_pin_id", _SESSION_DEFAULTS["selected_pin_id"]),
                        updates.get(
                            "active_tool_mode", _SESSION_DEFAULTS["active_tool_mode"]
                        ),
                        updates.get(
                            "discipline_filter", _SESSION_DEFAULTS["discipline_filter"]
                        ),
                        updates.get("search_query", _SESSION_DEFAULTS["search_query"]),
                        _utc_now_iso(),
                    ),
                )
                await db.commit()
                return
            if updates:
                set_clause = ", ".join(f"{key} = ?" for key in updates) + ", updated_at = ?"
                params: list[Any] = [updates[key] for key in updates] + [_utc_now_iso(), project_id]
                await db.execute(
                    f"UPDATE project_sessions SET {set_clause} WHERE project_id = ?",
                    params,
                )
                await db.commit()

    async def list_projects(self) -> list[dict[str, Any]]:
        """List projects with sheet/item counts and last session timestamp."""
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(
                "SELECT project_id, name, created_at FROM projects ORDER BY created_at"
            ) as cur:
                projects = [dict(row) for row in await cur.fetchall()]
            result: list[dict[str, Any]] = []
            for project in projects:
                pid = project["project_id"]
                async with db.execute(
                    "SELECT COUNT(*) FROM sheets WHERE project_id = ?", (pid,)
                ) as cur:
                    sheet_count_row = await cur.fetchone()
                async with db.execute(
                    "SELECT COUNT(*) FROM takeoff_items WHERE project_id = ?", (pid,)
                ) as cur:
                    item_count_row = await cur.fetchone()
                async with db.execute(
                    "SELECT updated_at FROM project_sessions WHERE project_id = ?", (pid,)
                ) as cur:
                    session_row = await cur.fetchone()
                result.append(
                    {
                        "project_id": pid,
                        "name": project["name"],
                        "created_at": project["created_at"],
                        "sheet_count": int(sheet_count_row[0]) if sheet_count_row else 0,
                        "item_count": int(item_count_row[0]) if item_count_row else 0,
                        "updated_at": session_row["updated_at"] if session_row else None,
                    }
                )
            return result

    async def list_sheets(self, project_id: str) -> list[dict[str, Any]]:
        """List sheet rows for one project ordered by page index."""
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(
                "SELECT * FROM sheets WHERE project_id = ? ORDER BY page_index",
                (project_id,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]
    async def apply_sheet_calibration(
        self, sheet_id: str, scale_ratio: float, scale_raw: str
    ) -> tuple[int, int]:
        """Atomically mark a sheet CALIBRATED and recompute VECTOR_ENGINE footage.

        Fail-closed: recomputed rows stay ``SUGGESTED`` with
        ``review_required = 1`` — calibration makes footage PROVISIONAL only.
        Only an explicit human Accept via ``update_item_status`` may clear it.
        Every VECTOR_ENGINE row on the sheet gets
        ``total_length_ft = round(geom_pt * scale_ratio / 864, 2)`` (72 pt per
        paper inch, 12 inches per foot) with status untouched. Manual,
        hover, and VLM rows are untouched. Bad/missing geometry rows are
        skipped (counted, left with ``review_required = 1``). Each recomputed
        row gets a ``review_events`` audit row (action
        ``SHEET_CALIBRATION``). Returns ``(updated, skipped)``.
        """
        if not math.isfinite(scale_ratio) or scale_ratio <= 0:
            raise ValueError(f"scale_ratio must be positive, got {scale_ratio!r}.")
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute("SELECT sheet_id FROM sheets WHERE sheet_id = ?", (sheet_id,)) as cur:
                if await cur.fetchone() is None:
                    raise KeyError(f"Sheet '{sheet_id}' not found")
            await db.execute(
                "UPDATE sheets SET scale_ratio = ?, scale_raw = ?, scale_status = 'CALIBRATED' WHERE sheet_id = ?",
                (float(scale_ratio), scale_raw, sheet_id),
            )
            async with db.execute(
                "SELECT item_id, geometry_json, status FROM takeoff_items WHERE sheet_id = ? AND source = 'VECTOR_ENGINE'",
                (sheet_id,),
            ) as cur:
                rows = await cur.fetchall()
            updated = 0
            skipped = 0
            now = _utc_now_iso()
            for row in rows:
                try:
                    geometry = json.loads(row["geometry_json"]) if row["geometry_json"] else {}
                except (json.JSONDecodeError, TypeError):
                    continue
                geom_pt: float | None = None
                if isinstance(geometry, dict):
                    raw = geometry.get("geometric_length_pt")
                    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                        geom_pt = float(raw)
                    if geom_pt is None:
                        pts = geometry.get("points")
                        if isinstance(pts, list) and len(pts) >= 2:
                            try:
                                total = 0.0
                                for i in range(len(pts) - 1):
                                    total += math.hypot(
                                        float(pts[i + 1][0]) - float(pts[i][0]),
                                        float(pts[i + 1][1]) - float(pts[i][1]),
                                    )
                                if total > 0 and math.isfinite(total):
                                    geom_pt = total
                            except (TypeError, ValueError, IndexError, OverflowError):
                                geom_pt = None
                if geom_pt is None or not math.isfinite(geom_pt) or geom_pt <= 0:
                    skipped += 1
                    continue
                total_length_ft = round(geom_pt * float(scale_ratio) / 864.0, 2)
                await db.execute(
                    "UPDATE takeoff_items SET total_length_ft = ?, review_required = 1, updated_at = ? WHERE item_id = ?",
                    (total_length_ft, now, row["item_id"]),
                )
                prev_status = dict(row).get("status", "SUGGESTED")
                await db.execute(
                    """
                    INSERT INTO review_events (event_id, item_id, action, previous_status, new_status, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (str(uuid.uuid4()), row["item_id"], "SHEET_CALIBRATION", prev_status, prev_status, now),
                )
                updated += 1
            await db.commit()
            return updated, skipped
    async def add_takeoff_item(self, record: TakeoffRecord) -> str:
        """Insert a single takeoff record."""
        defaults = _load_provenance_defaults()
        pipeline_version, model_version, prompt_version = _provenance_values(record, defaults)
        async with self._session() as db:
            await db.execute(
                """
                INSERT INTO takeoff_items (
                    item_id, project_id, sheet_id, category, system, dimension_label,
                    status, source, total_length_ft, count, geometry_json, confidence,
                    review_required, airflow_cfm, electrical_kw, inlet_dimension_inches,
                    equipment_tag, pipeline_version, model_version, prompt_version,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id) DO UPDATE SET
                    project_id = excluded.project_id, sheet_id = excluded.sheet_id,
                    category = excluded.category, system = excluded.system,
                    dimension_label = excluded.dimension_label, status = excluded.status,
                    source = excluded.source, total_length_ft = excluded.total_length_ft,
                    count = excluded.count, geometry_json = excluded.geometry_json,
                    confidence = excluded.confidence,
                    review_required = excluded.review_required,
                    airflow_cfm = excluded.airflow_cfm,
                    electrical_kw = excluded.electrical_kw,
                    inlet_dimension_inches = excluded.inlet_dimension_inches,
                    equipment_tag = excluded.equipment_tag,
                    pipeline_version = excluded.pipeline_version,
                    model_version = excluded.model_version,
                    prompt_version = excluded.prompt_version,
                    updated_at = excluded.updated_at
                """,
                (
                    record.item_id,
                    record.project_id,
                    record.sheet_id,
                    record.category,
                    record.system,
                    record.dimension_label,
                    record.status,
                    record.source,
                    record.total_length_ft,
                    record.count,
                    json.dumps(record.geometry),
                    record.confidence,
                    1 if record.review_required else 0,
                    record.airflow_cfm,
                    record.electrical_kw,
                    record.inlet_dimension_inches,
                    record.equipment_tag,
                    pipeline_version,
                    model_version,
                    prompt_version,
                    record.created_at,
                    record.updated_at,
                ),
            )
            await db.commit()
        return record.item_id

    async def bulk_add_takeoff_items(self, records: list[TakeoffRecord]) -> int:
        """Insert multiple records in a single transactional batch."""
        if not records:
            return 0
        defaults = _load_provenance_defaults()
        async with self._session() as db:
            await db.executemany(
                """
                INSERT INTO takeoff_items (
                    item_id, project_id, sheet_id, category, system, dimension_label,
                    status, source, total_length_ft, count, geometry_json, confidence,
                    review_required, airflow_cfm, electrical_kw, inlet_dimension_inches,
                    equipment_tag, pipeline_version, model_version, prompt_version,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id) DO UPDATE SET
                    project_id = excluded.project_id, sheet_id = excluded.sheet_id,
                    category = excluded.category, system = excluded.system,
                    dimension_label = excluded.dimension_label, status = excluded.status,
                    source = excluded.source, total_length_ft = excluded.total_length_ft,
                    count = excluded.count, geometry_json = excluded.geometry_json,
                    confidence = excluded.confidence,
                    review_required = excluded.review_required,
                    airflow_cfm = excluded.airflow_cfm,
                    electrical_kw = excluded.electrical_kw,
                    inlet_dimension_inches = excluded.inlet_dimension_inches,
                    equipment_tag = excluded.equipment_tag,
                    pipeline_version = excluded.pipeline_version,
                    model_version = excluded.model_version,
                    prompt_version = excluded.prompt_version,
                    updated_at = excluded.updated_at
                """,
                [
                    (
                        r.item_id,
                        r.project_id,
                        r.sheet_id,
                        r.category,
                        r.system,
                        r.dimension_label,
                        r.status,
                        r.source,
                        r.total_length_ft,
                        r.count,
                        json.dumps(r.geometry),
                        r.confidence,
                        1 if r.review_required else 0,
                        r.airflow_cfm,
                        r.electrical_kw,
                        r.inlet_dimension_inches,
                        r.equipment_tag,
                        *_provenance_values(r, defaults),
                        r.created_at,
                        r.updated_at,
                    )
                    for r in records
                ],
            )
            await db.commit()
        return len(records)

    async def delete_vector_items_for_sheet(self, project_id: str, sheet_id: str) -> int:
        """Remove prior VECTOR_ENGINE rows for one sheet so re-scans stay idempotent.

        Review events referencing those rows are removed in the same
        transaction (foreign-key safe). Manual and hover-sourced rows on the
        same sheet are never touched.
        """
        async with self._session() as db:
            await db.execute(
                """
                DELETE FROM review_events WHERE item_id IN (
                    SELECT item_id FROM takeoff_items
                    WHERE project_id = ? AND sheet_id = ? AND source = 'VECTOR_ENGINE'
                )
                """,
                (project_id, sheet_id),
            )
            cursor = await db.execute(
                "DELETE FROM takeoff_items WHERE project_id = ? AND sheet_id = ? AND source = 'VECTOR_ENGINE'",
                (project_id, sheet_id),
            )
            await db.commit()
            return cursor.rowcount or 0

    async def replace_vector_items_for_sheet(
        self, project_id: str, sheet_id: str, records: list[TakeoffRecord]
    ) -> int:
        """Atomically replace one sheet's VECTOR_ENGINE rows in one transaction."""
        async with self._session() as db:
            await db.execute(
                """
                DELETE FROM review_events WHERE item_id IN (
                    SELECT item_id FROM takeoff_items
                    WHERE project_id = ? AND sheet_id = ? AND source = 'VECTOR_ENGINE'
                )
                """,
                (project_id, sheet_id),
            )
            await db.execute(
                "DELETE FROM takeoff_items WHERE project_id = ? AND sheet_id = ? AND source = 'VECTOR_ENGINE'",
                (project_id, sheet_id),
            )
            if records:
                defaults = _load_provenance_defaults()
                await db.executemany(
                    """
                    INSERT INTO takeoff_items (
                        item_id, project_id, sheet_id, category, system, dimension_label,
                        status, source, total_length_ft, count, geometry_json, confidence,
                        review_required, airflow_cfm, electrical_kw, inlet_dimension_inches,
                        equipment_tag, pipeline_version, model_version, prompt_version,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            r.item_id,
                            r.project_id,
                            r.sheet_id,
                            r.category,
                            r.system,
                            r.dimension_label,
                            r.status,
                            r.source,
                            r.total_length_ft,
                            r.count,
                            json.dumps(r.geometry),
                            r.confidence,
                            1 if r.review_required else 0,
                            r.airflow_cfm,
                            r.electrical_kw,
                            r.inlet_dimension_inches,
                            r.equipment_tag,
                            *_provenance_values(r, defaults),
                            r.created_at,
                            r.updated_at,
                        )
                        for r in records
                    ],
                )
            await db.commit()
        return len(records)

    async def update_item_status(
        self,
        item_id: str,
        new_status: Literal["SUGGESTED", "ACCEPTED", "REJECTED"],
        action: str = "USER_REVIEW",
    ) -> bool:
        """Update review status of an item and log the review audit event."""
        now = _utc_now_iso()
        async with self._session() as db:
            async with db.execute("SELECT status FROM takeoff_items WHERE item_id = ?", (item_id,)) as cur:
                row = await cur.fetchone()
                if not row:
                    return False
                prev_status = row[0]

            await db.execute(
                "UPDATE takeoff_items SET status = ?, updated_at = ? WHERE item_id = ?",
                (new_status, now, item_id),
            )
            event_id = str(uuid.uuid4())
            await db.execute(
                """
                INSERT INTO review_events (event_id, item_id, action, previous_status, new_status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (event_id, item_id, action, prev_status, new_status, now),
            )
            await db.commit()
            return True

    async def list_items(
        self,
        project_id: str | None = None,
        sheet_id: str | None = None,
        status: str | None = None,
        category: str | None = None,
    ) -> list[TakeoffRecord]:
        """Query items with optional filtering."""
        query = "SELECT item_id, project_id, sheet_id, category, system, dimension_label, status, source, total_length_ft, count, geometry_json, confidence, review_required, airflow_cfm, electrical_kw, inlet_dimension_inches, equipment_tag, pipeline_version, model_version, prompt_version, created_at, updated_at FROM takeoff_items WHERE 1=1"
        params: list[Any] = []
        if project_id:
            query += " AND project_id = ?"
            params.append(project_id)
        if sheet_id:
            query += " AND sheet_id = ?"
            params.append(sheet_id)
        if status:
            query += " AND status = ?"
            params.append(status)
        if category:
            query += " AND category = ?"
            params.append(category)

        query += " ORDER BY category, system, dimension_label"

        records: list[TakeoffRecord] = []
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(query, params) as cur:
                async for row in cur:
                    geom = json.loads(row["geometry_json"]) if row["geometry_json"] else {}
                    records.append(
                        TakeoffRecord(
                            item_id=row["item_id"],
                            project_id=row["project_id"],
                            sheet_id=row["sheet_id"],
                            category=row["category"],
                            system=row["system"],
                            dimension_label=row["dimension_label"],
                            status=row["status"],
                            source=row["source"],
                            total_length_ft=row["total_length_ft"],
                            count=row["count"],
                            geometry=geom,
                            confidence=row["confidence"],
                            review_required=bool(row["review_required"]),
                            airflow_cfm=row["airflow_cfm"],
                            electrical_kw=row["electrical_kw"],
                            inlet_dimension_inches=row["inlet_dimension_inches"],
                            equipment_tag=row["equipment_tag"],
                            pipeline_version=row["pipeline_version"],
                            model_version=row["model_version"],
                            prompt_version=row["prompt_version"],
                            created_at=row["created_at"],
                            updated_at=row["updated_at"],
                        )
                    )
        return records

    async def get_ledger_summary(
        self,
        project_id: str | None = None,
        sheet_id: str | None = None,
        status_filter: str | None = None,
    ) -> list[LedgerSummaryRow]:
        """Rollup items by category, system, and dimension label."""
        query = """
            SELECT
                category,
                system,
                dimension_label,
                ROUND(SUM(CASE WHEN status = 'ACCEPTED' THEN total_length_ft ELSE 0.0 END), 2) AS accepted_length_ft,
                SUM(CASE WHEN status = 'ACCEPTED' THEN count ELSE 0 END) AS accepted_count,
                SUM(CASE WHEN status = 'SUGGESTED' THEN count ELSE 0 END) AS suggested_count,
                SUM(CASE WHEN status = 'REJECTED' THEN count ELSE 0 END) AS rejected_count,
                SUM(count) AS total_count
            FROM takeoff_items
            WHERE 1=1
        """
        params: list[Any] = []
        if project_id:
            query += " AND project_id = ?"
            params.append(project_id)
        if sheet_id:
            query += " AND sheet_id = ?"
            params.append(sheet_id)
        if status_filter:
            query += " AND status = ?"
            params.append(status_filter)

        query += " GROUP BY category, system, dimension_label ORDER BY category, system, dimension_label"

        rows: list[LedgerSummaryRow] = []
        async with self._session() as db:
            db.row_factory = sqlite3.Row
            async with db.execute(query, params) as cur:
                async for row in cur:
                    rows.append(
                        LedgerSummaryRow(
                            category=row["category"],
                            system=row["system"],
                            dimension_label=row["dimension_label"],
                            total_length_ft=row["accepted_length_ft"] or 0.0,
                            total_count=row["total_count"] or 0,
                            accepted_count=row["accepted_count"] or 0,
                            suggested_count=row["suggested_count"] or 0,
                            rejected_count=row["rejected_count"] or 0,
                        )
                    )
        return rows

    async def export_csv(
        self,
        project_id: str | None = None,
        sheet_id: str | None = None,
        include_items: bool = False,
    ) -> str:
        """Export ledger takeoff summary in standard Estimating CSV format."""
        summary_rows = await self.get_ledger_summary(project_id=project_id, sheet_id=sheet_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Category",
            "System",
            "Dimension/Size",
            "Linear Length (ft)",
            "Accepted Count",
            "Suggested Count",
            "Rejected Count",
            "Total Count",
        ])
        for r in summary_rows:
            writer.writerow([
                r.category,
                r.system,
                r.dimension_label,
                f"{r.total_length_ft:.2f}",
                r.accepted_count,
                r.suggested_count,
                r.rejected_count,
                r.total_count,
            ])

        # Detailed item-level takeoff rows with spatial coordinates & source provenance when requested
        if include_items:
            items = await self.list_items(project_id=project_id, sheet_id=sheet_id)
            if items:
                writer.writerow([])
                writer.writerow([
                    "Item ID",
                    "Sheet ID",
                    "Category",
                    "System",
                    "Dimension/Size",
                    "Linear Length (ft)",
                    "Status",
                    "Review Required",
                    "Confidence",
                    "Geometry / Coordinates",
                    "Source",
                ])
                for it in items:
                    coords = json.dumps(it.geometry) if it.geometry else ""
                    writer.writerow([
                        it.item_id,
                        it.sheet_id,
                        it.category,
                        it.system,
                        it.dimension_label,
                        f"{it.total_length_ft:.2f}",
                        it.status,
                        str(it.review_required).lower(),
                        "" if it.confidence is None else f"{it.confidence:.2f}",
                        coords,
                        it.source,
                    ])
        return output.getvalue()

    async def export_json(self, project_id: str | None = None, sheet_id: str | None = None) -> dict[str, Any]:
        """Export comprehensive takeoff data structure with summary and line items."""
        summary = await self.get_ledger_summary(project_id=project_id, sheet_id=sheet_id)
        items = await self.list_items(project_id=project_id, sheet_id=sheet_id)
        return {
            "exported_at": _utc_now_iso(),
            "project_id": project_id,
            "sheet_id": sheet_id,
            "summary": [s.model_dump() for s in summary],
            "total_accepted_footage_ft": round(sum(s.total_length_ft for s in summary), 2),
            "line_items": [item.model_dump() for item in items],
        }
