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
import io
import json
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
                    created_at TEXT NOT NULL
                );
            """)
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
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
            """)
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
            await db.execute("CREATE INDEX IF NOT EXISTS idx_takeoff_status ON takeoff_items(status);")
            await db.commit()

    async def insert_project(self, project_id: str, name: str) -> None:
        async with self._session() as db:
            await db.execute(
                """INSERT INTO projects (project_id, name, created_at) VALUES (?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET name = excluded.name""",
                (project_id, name, _utc_now_iso()),
            )
            await db.commit()

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

    async def add_takeoff_item(self, record: TakeoffRecord) -> str:
        """Insert a single takeoff record."""
        async with self._session() as db:
            await db.execute(
                """
                INSERT INTO takeoff_items (
                    item_id, project_id, sheet_id, category, system, dimension_label,
                    status, source, total_length_ft, count, geometry_json, confidence,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id) DO UPDATE SET
                    project_id = excluded.project_id, sheet_id = excluded.sheet_id,
                    category = excluded.category, system = excluded.system,
                    dimension_label = excluded.dimension_label, status = excluded.status,
                    source = excluded.source, total_length_ft = excluded.total_length_ft,
                    count = excluded.count, geometry_json = excluded.geometry_json,
                    confidence = excluded.confidence, updated_at = excluded.updated_at
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
        async with self._session() as db:
            await db.executemany(
                """
                INSERT INTO takeoff_items (
                    item_id, project_id, sheet_id, category, system, dimension_label,
                    status, source, total_length_ft, count, geometry_json, confidence,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_id) DO UPDATE SET
                    project_id = excluded.project_id, sheet_id = excluded.sheet_id,
                    category = excluded.category, system = excluded.system,
                    dimension_label = excluded.dimension_label, status = excluded.status,
                    source = excluded.source, total_length_ft = excluded.total_length_ft,
                    count = excluded.count, geometry_json = excluded.geometry_json,
                    confidence = excluded.confidence, updated_at = excluded.updated_at
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
        query = "SELECT item_id, project_id, sheet_id, category, system, dimension_label, status, source, total_length_ft, count, geometry_json, confidence, created_at, updated_at FROM takeoff_items WHERE 1=1"
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
