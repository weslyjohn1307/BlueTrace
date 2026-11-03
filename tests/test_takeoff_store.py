from __future__ import annotations

import csv
import io
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.api.main import app
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


@pytest.mark.asyncio
async def test_takeoff_store_crud(tmp_path: Path):
    db_file = tmp_path / "test_takeoff.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    await store.insert_project("proj_01", "North Wing Mechanical")
    await store.insert_sheet(
        sheet_id="sheet_m22",
        project_id="proj_01",
        page_index=0,
        sheet_number="M-2.2",
        sheet_title="HVAC Duct Plan",
        discipline="MECHANICAL",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=3024.0,
        height_pt=2160.0,
    )

    # Add items
    item1 = TakeoffRecord(
        item_id="item_01",
        project_id="proj_01",
        sheet_id="sheet_m22",
        category="DUCTWORK",
        system="Supply Air",
        dimension_label='24"x12"',
        status="SUGGESTED",
        source="QUICKDRAW_HOVER",
        total_length_ft=45.5,
        count=1,
    )
    item2 = TakeoffRecord(
        item_id="item_02",
        project_id="proj_01",
        sheet_id="sheet_m22",
        category="DUCTWORK",
        system="Supply Air",
        dimension_label='24"x12"',
        status="ACCEPTED",
        source="VECTOR_ENGINE",
        total_length_ft=82.0,
        count=1,
    )
    item3 = TakeoffRecord(
        item_id="item_03",
        project_id="proj_01",
        sheet_id="sheet_m22",
        category="EQUIPMENT",
        system="Supply Air",
        dimension_label="VAV Box 200 CFM",
        status="ACCEPTED",
        source="VLM_DETECTION",
        total_length_ft=0.0,
        count=1,
    )

    await store.add_takeoff_item(item1)
    await store.bulk_add_takeoff_items([item2, item3])

    # List items
    all_items = await store.list_items(project_id="proj_01")
    assert len(all_items) == 3

    suggested = await store.list_items(project_id="proj_01", status="SUGGESTED")
    assert len(suggested) == 1
    assert suggested[0].item_id == "item_01"


@pytest.mark.asyncio
async def test_review_status_transition(tmp_path: Path):
    db_file = tmp_path / "test_review.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    # Fail-closed ACCEPT gate needs a VERIFIED parent sheet row.
    await store.insert_project("p1", "Review Facility")
    await store.insert_sheet(
        sheet_id="s1",
        project_id="p1",
        page_index=0,
        sheet_number="M-1.0",
        sheet_title="Review Plan",
        discipline="MECHANICAL",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=1224.0,
        height_pt=792.0,
    )

    item = TakeoffRecord(
        item_id="item_rev_01",
        project_id="p1",
        sheet_id="s1",
        category="DUCTWORK",
        system="Exhaust",
        dimension_label='12" Round',
        status="SUGGESTED",
        total_length_ft=15.0,
    )
    await store.add_takeoff_item(item)

    # 1-click accept
    updated = await store.update_item_status("item_rev_01", "ACCEPTED", action="ACCEPT_BADGE")
    assert updated is True

    items = await store.list_items(sheet_id="s1")
    assert items[0].status == "ACCEPTED"

    # Reject (TASK-REV-003: REJECTED requires a structured reason code).
    updated2 = await store.update_item_status(
        "item_rev_01", "REJECTED", action="DISMISS_BADGE", reason="DUPLICATE_ITEM"
    )
    assert updated2 is True

    items2 = await store.list_items(sheet_id="s1")
    assert items2[0].status == "REJECTED"


@pytest.mark.asyncio
async def test_ledger_rollup_and_exports(tmp_path: Path):
    db_file = tmp_path / "test_exports.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    records = [
        TakeoffRecord(
            project_id="proj_test",
            sheet_id="sheet_01",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='16"x10"',
            status="ACCEPTED",
            total_length_ft=50.0,
            count=1,
        ),
        TakeoffRecord(
            project_id="proj_test",
            sheet_id="sheet_01",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='16"x10"',
            status="ACCEPTED",
            total_length_ft=30.0,
            count=1,
        ),
        TakeoffRecord(
            project_id="proj_test",
            sheet_id="sheet_01",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='16"x10"',
            status="SUGGESTED",
            total_length_ft=20.0,
            count=1,
        ),
        TakeoffRecord(
            project_id="proj_test",
            sheet_id="sheet_01",
            category="EQUIPMENT",
            system="Fire Protection",
            dimension_label="Fire Damper 16x10",
            status="ACCEPTED",
            total_length_ft=0.0,
            count=4,
        ),
    ]
    await store.bulk_add_takeoff_items(records)

    # Ledger Summary
    summary = await store.get_ledger_summary(project_id="proj_test")
    assert len(summary) == 2

    duct_row = next(r for r in summary if r.category == "DUCTWORK")
    assert duct_row.total_length_ft == 80.0  # 50 + 30 accepted, suggested 20 excluded from footage
    assert duct_row.accepted_count == 2
    assert duct_row.suggested_count == 1
    assert duct_row.total_count == 3

    equip_row = next(r for r in summary if r.category == "EQUIPMENT")
    assert equip_row.accepted_count == 4
    assert equip_row.total_length_ft == 0.0

    # CSV Export Round-trip
    csv_text = await store.export_csv(project_id="proj_test")
    reader = list(csv.reader(io.StringIO(csv_text)))
    assert reader[0] == [
        "Category",
        "System",
        "Dimension/Size",
        "Linear Length (ft)",
        "Accepted Count",
        "Suggested Count",
        "Rejected Count",
        "Total Count",
    ]
    assert len(reader) == 3  # Header + 2 rows

    # JSON Export Round-trip
    json_data = await store.export_json(project_id="proj_test")
    assert json_data["total_accepted_footage_ft"] == 80.0
    assert len(json_data["summary"]) == 2
    assert len(json_data["line_items"]) == 4


def test_api_takeoff_routes(isolated_takeoff_store):
    import asyncio as _asyncio

    client = TestClient(app)

    # Fail-closed ACCEPT gate needs a VERIFIED parent sheet row.
    async def _seed_sheet() -> None:
        await isolated_takeoff_store.insert_project("api_proj", "API Project")
        await isolated_takeoff_store.insert_sheet(
            sheet_id="api_sheet",
            project_id="api_proj",
            page_index=0,
            sheet_number="M-1",
            sheet_title="API Plan",
            discipline="MECHANICAL",
            scale_raw='1/4" = 1\'-0"',
            scale_ratio=48.0,
            scale_status="VERIFIED",
            width_pt=1224.0,
            height_pt=792.0,
        )

    _asyncio.run(_seed_sheet())

    # Create item via API
    res = client.post(
        "/api/takeoff/items",
        json={
            "project_id": "api_proj",
            "sheet_id": "api_sheet",
            "category": "PIPING",
            "system": "Domestic Cold Water",
            "dimension_label": '2" Copper',
            "status": "SUGGESTED",
            "total_length_ft": 25.5,
            "count": 1,
        },
    )
    assert res.status_code == 200
    created = res.json()
    item_id = created["item_id"]
    assert created["dimension_label"] == '2" Copper'

    # Status update (1-click accept)
    patch_res = client.patch(
        f"/api/takeoff/items/{item_id}/status",
        json={"status": "ACCEPTED", "action": "ONE_CLICK_ACCEPT"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "ACCEPTED"

    # Ledger summary
    sum_res = client.get("/api/takeoff/summary?project_id=api_proj")
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert len(sum_data) >= 1

    # CSV export
    csv_res = client.get("/api/takeoff/export/csv?project_id=api_proj")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "Domestic Cold Water" in csv_res.text

    # JSON export
    json_res = client.get("/api/takeoff/export/json?project_id=api_proj")
    assert json_res.status_code == 200
    assert json_res.json()["total_accepted_footage_ft"] >= 25.5


@pytest.mark.asyncio
async def test_project_package_hash(tmp_path: Path):
    import hashlib

    from src.store.takeoff_store import compute_file_sha256

    payload = tmp_path / "package.pdf"
    payload.write_bytes(b"%PDF-1.4 fake package bytes")
    expected = hashlib.sha256(b"%PDF-1.4 fake package bytes").hexdigest()
    assert compute_file_sha256(payload) == expected
    assert len(expected) == 64

    db_file = tmp_path / "test_pkg_hash.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()
    await store.insert_project(
        "proj_hash_01",
        "Hash Facility",
        package_hash_sha256=expected,
        file_size_bytes=payload.stat().st_size,
    )
    project = await store.get_project("proj_hash_01")
    assert project is not None
    assert project["package_hash_sha256"] == expected
    assert len(project["package_hash_sha256"]) == 64
    assert project["file_size_bytes"] == payload.stat().st_size

    # Backward-compatible 2-arg call (routes.py) must not wipe stored hash.
    await store.insert_project("proj_hash_01", "Hash Facility")
    preserved = await store.get_project("proj_hash_01")
    assert preserved is not None
    assert preserved["package_hash_sha256"] == expected


@pytest.mark.asyncio
async def test_equipment_attributes(tmp_path: Path):
    db_file = tmp_path / "test_equipment.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    record = TakeoffRecord(
        item_id="equip_01",
        project_id="proj_eq",
        sheet_id="sheet_eq",
        category="EQUIPMENT",
        system="Supply Air",
        dimension_label="VAV Box",
        airflow_cfm=1200.0,
        electrical_kw=2.5,
        inlet_dimension_inches="12x8",
        equipment_tag="VAV-1-01",
    )
    await store.add_takeoff_item(record)
    items = await store.list_items(project_id="proj_eq")
    assert len(items) == 1
    assert items[0].airflow_cfm == 1200.0
    assert items[0].electrical_kw == 2.5
    assert items[0].inlet_dimension_inches == "12x8"
    assert items[0].equipment_tag == "VAV-1-01"

    bulk = TakeoffRecord(
        item_id="equip_02",
        project_id="proj_eq",
        sheet_id="sheet_eq",
        category="EQUIPMENT",
        system="Supply Air",
        dimension_label="Fan Coil",
        airflow_cfm=800.0,
        electrical_kw=1.2,
        inlet_dimension_inches='10" dia',
        equipment_tag="FCU-2-03",
    )
    await store.bulk_add_takeoff_items([bulk])

    vec = TakeoffRecord(
        item_id="equip_03",
        project_id="proj_eq",
        sheet_id="sheet_eq",
        category="EQUIPMENT",
        system="Exhaust",
        dimension_label="Exhaust Fan",
        source="VECTOR_ENGINE",
        airflow_cfm=450.0,
        electrical_kw=0.75,
        inlet_dimension_inches="14x14",
        equipment_tag="EF-3-01",
    )
    await store.replace_vector_items_for_sheet("proj_eq", "sheet_eq", [vec])
    after = await store.list_items(project_id="proj_eq")
    by_id = {item.item_id: item for item in after}
    assert by_id["equip_03"].airflow_cfm == 450.0
    assert by_id["equip_03"].equipment_tag == "EF-3-01"


@pytest.mark.asyncio
async def test_provenance_metadata(tmp_path: Path):
    import json

    db_file = tmp_path / "test_provenance.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    record = TakeoffRecord(
        item_id="prov_01",
        project_id="proj_prov",
        sheet_id="sheet_prov",
        category="DUCTWORK",
        system="Supply Air",
        dimension_label='16"x10"',
    )
    await store.add_takeoff_item(record)
    items = await store.list_items(project_id="proj_prov")
    assert len(items) == 1

    config_path = Path("configs/pipeline_version.json")
    expected = "1.0.0"
    if config_path.exists():
        try:
            expected = str(json.loads(config_path.read_text(encoding="utf-8")).get("version"))
        except (OSError, ValueError, AttributeError):
            pass
    assert items[0].pipeline_version == expected
    assert items[0].model_version is not None
    assert items[0].prompt_version is not None


async def test_project_session_persistence(tmp_path: Path):
    db_file = tmp_path / "test_session.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    await store.insert_project("proj_sess_01", "Session Facility")

    # Defaults on first create.
    session = await store.get_or_create_session("proj_sess_01")
    assert session["project_id"] == "proj_sess_01"
    assert session["active_sheet_id"] is None
    assert session["viewport_scale"] == 1.0
    assert session["viewport_tx"] == 0.0
    assert session["viewport_ty"] == 0.0
    assert session["active_tool_mode"] == "select"

    # Save viewport coordinates.
    await store.save_session_state(
        "proj_sess_01",
        {
            "active_sheet_id": "sheet_m102",
            "viewport_scale": 1.45,
            "viewport_tx": 240.0,
            "viewport_ty": -120.0,
            "active_tool_mode": "pan",
        },
    )
    reloaded = await store.get_or_create_session("proj_sess_01")
    assert reloaded["active_sheet_id"] == "sheet_m102"
    assert reloaded["viewport_scale"] == 1.45
    assert reloaded["viewport_tx"] == 240.0
    assert reloaded["viewport_ty"] == -120.0
    assert reloaded["active_tool_mode"] == "pan"

    # Fail-closed: unknown project never auto-creates.
    with pytest.raises(ValueError):
        await store.get_or_create_session("missing_proj")
    with pytest.raises(ValueError):
        await store.save_session_state("missing_proj", {"viewport_scale": 2.0})

    # Fail-closed: non-finite viewport floats and unknown tool modes rejected.
    with pytest.raises(ValueError):
        await store.save_session_state("proj_sess_01", {"viewport_scale": float("inf")})
    with pytest.raises(ValueError):
        await store.save_session_state("proj_sess_01", {"active_tool_mode": "laser"})

    # Cascade delete removes the session row with its project.
    import aiosqlite

    async with aiosqlite.connect(db_file) as db:
        await db.execute("PRAGMA foreign_keys=ON;")
        await db.execute("DELETE FROM projects WHERE project_id = ?", ("proj_sess_01",))
        await db.commit()
        async with db.execute(
            "SELECT COUNT(*) FROM project_sessions WHERE project_id = ?", ("proj_sess_01",)
        ) as cur:
            row = await cur.fetchone()
            assert row is not None and row[0] == 0


async def test_project_session_viewport_scale_must_be_positive(tmp_path: Path):
    """Fail-closed: non-positive viewport_scale never persists (WS4 MEDIUM1)."""
    db_file = tmp_path / "test_session_scale.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    await store.insert_project("proj_sess_scale", "Scale Facility")

    for bad_scale in (0.0, -1.45, float("-inf")):
        with pytest.raises(ValueError):
            await store.save_session_state(
                "proj_sess_scale", {"viewport_scale": bad_scale}
            )

    # NaN is rejected by the finite-number gate.
    with pytest.raises(ValueError):
        await store.save_session_state(
            "proj_sess_scale", {"viewport_scale": float("nan")}
        )

    # The failed writes persisted nothing: defaults are untouched.
    session = await store.get_or_create_session("proj_sess_scale")
    assert session["viewport_scale"] == 1.0


@pytest.mark.asyncio
async def test_feedback_null_original_project_guard_and_pdf_path(tmp_path: Path):
    """MED#7/HIGH#3: None original stays NULL; project_exists; pdf_path round-trips."""
    store = TakeoffStore(db_path=tmp_path / "test_feedback_nulls.sqlite3")
    await store.initialize()

    assert await store.project_exists("ghost_proj") is False
    await store.insert_project("p_null", "Null Project")
    assert await store.project_exists("p_null") is True

    await store.insert_sheet(
        sheet_id="sheet_null",
        project_id="p_null",
        page_index=3,
        sheet_number="M-1",
        sheet_title="Plan",
        discipline="MECHANICAL",
        scale_raw=None,
        scale_ratio=None,
        scale_status="UNVERIFIED",
        width_pt=612.0,
        height_pt=792.0,
        pdf_path="fixtures/mechanical/hvac_plan_level2.pdf",
    )
    sheet = await store.get_sheet("sheet_null")
    assert sheet is not None
    assert sheet["pdf_path"] == "fixtures/mechanical/hvac_plan_level2.pdf"

    feedback_id = await store.record_feedback_event(
        project_id="p_null",
        sheet_id="sheet_null",
        task_type="SYMBOL_DETECTION",
        action="ACCEPT",
        previous_status="SUGGESTED",
        new_status="ACCEPTED",
    )
    fetched = await store.get_feedback_event(feedback_id)
    assert fetched is not None
    assert fetched["original_output_json"] is None
    assert fetched["crop_storage_relpath"] is None


@pytest.mark.asyncio
async def test_legacy_feedback_db_migrates_to_nullable_original(tmp_path: Path):
    """MED#7 migration: pre-slice DBs (NOT NULL original, no pdf_path) upgrade."""
    import aiosqlite

    db_file = tmp_path / "legacy.sqlite3"
    async with aiosqlite.connect(db_file) as db:
        await db.execute(
            "CREATE TABLE projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, "
            "package_hash_sha256 TEXT NOT NULL DEFAULT '', file_size_bytes INTEGER, "
            "created_at TEXT NOT NULL)"
        )
        await db.execute(
            "CREATE TABLE sheets (sheet_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, "
            "page_index INTEGER NOT NULL, sheet_number TEXT NOT NULL, "
            "sheet_title TEXT NOT NULL, discipline TEXT NOT NULL, scale_raw TEXT, "
            "scale_ratio REAL, scale_status TEXT NOT NULL, width_pt REAL NOT NULL, "
            "height_pt REAL NOT NULL, created_at TEXT NOT NULL)"
        )
        await db.execute(
            "CREATE TABLE engineer_feedback_events (feedback_id TEXT PRIMARY KEY, "
            "project_id TEXT NOT NULL, sheet_id TEXT NOT NULL, item_id TEXT, "
            "task_type TEXT NOT NULL, action TEXT NOT NULL, previous_status TEXT NOT NULL, "
            "new_status TEXT NOT NULL, original_output_json TEXT NOT NULL, "
            "corrected_output_json TEXT, correction_reason TEXT, "
            "bounding_box_pt_json TEXT, crop_storage_relpath TEXT, model_version TEXT, "
            "prompt_version TEXT, reviewer_session_id TEXT, "
            "training_eligible INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"
        )
        await db.execute(
            "INSERT INTO engineer_feedback_events (feedback_id, project_id, sheet_id, "
            "task_type, action, previous_status, new_status, original_output_json, "
            "training_eligible, created_at) VALUES "
            "('fb-legacy', 'p', 's', 'SYMBOL_DETECTION', 'ACCEPT', 'SUGGESTED', "
            "'ACCEPTED', '{}', 0, '2026-01-01T00:00:00Z')"
        )
        await db.commit()

    store = TakeoffStore(db_path=db_file)
    await store.initialize()
    # Re-initialize is idempotent after migration.
    await store.initialize()

    row = await store.get_feedback_event("fb-legacy")
    assert row is not None
    assert row["original_output_json"] is None
    # New writes accept NULL originals on the migrated schema.
    fid = await store.record_feedback_event(
        project_id="p",
        sheet_id="s",
        task_type="SYMBOL_DETECTION",
        action="REJECT",
        previous_status="SUGGESTED",
        new_status="REJECTED",
    )
    assert (await store.get_feedback_event(fid))["original_output_json"] is None


@pytest.mark.asyncio
async def test_feedback_events_schema(tmp_path: Path):
    """FDBK-001: feedback tuples persist with training_eligible == 0."""
    import json

    db_file = tmp_path / "test_feedback.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()
    # Idempotent migration: re-initializing an existing database is a no-op.
    await store.initialize()

    feedback_id = await store.record_feedback_event(
        project_id="proj_fdbk",
        sheet_id="sheet_fdbk",
        item_id=None,
        task_type="SYMBOL_DETECTION",
        action="ACCEPT",
        previous_status="SUGGESTED",
        new_status="ACCEPTED",
        original_output_json=json.dumps({"symbol_label": "VAV-1-01", "confidence": 0.91}),
        corrected_output_json=None,
        correction_reason=None,
        bounding_box_pt_json=json.dumps([120.0, 240.0, 270.0, 390.0]),
        crop_storage_relpath="data/feedback/crops/proj_fdbk/fb-1.png",
        model_version="muse-spark-1.3",
        prompt_version="symbol-detect-v1",
        reviewer_session_id="sess-1",
    )
    assert feedback_id

    import aiosqlite

    async with aiosqlite.connect(db_file) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM engineer_feedback_events WHERE feedback_id = ?",
            (feedback_id,),
        ) as cur:
            row = await cur.fetchone()
    assert row is not None
    assert row["training_eligible"] == 0
    assert row["task_type"] == "SYMBOL_DETECTION"
    assert row["action"] == "ACCEPT"
    # Before/after JSON payloads parse cleanly.
    assert json.loads(row["original_output_json"]) == {
        "symbol_label": "VAV-1-01",
        "confidence": 0.91,
    }
    assert json.loads(row["bounding_box_pt_json"]) == [120.0, 240.0, 270.0, 390.0]

    # Getter round-trip agrees with the raw row.
    fetched = await store.get_feedback_event(feedback_id)
    assert fetched is not None
    assert fetched["training_eligible"] == 0
    assert fetched["feedback_id"] == feedback_id


@pytest.mark.asyncio
async def test_feedback_crop_extraction(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """FDBK-002: 150 DPI crop extraction with page-limit clamping."""
    import pymupdf
    from PIL import Image

    from src.meta_services.feedback_service import capture_feedback_crop

    # Synthetic single-page sheet (612 x 792 pt), isolated crop root.
    pdf_path = tmp_path / "sheet.pdf"
    doc = pymupdf.open()
    try:
        page = doc.new_page(width=612, height=792)
        page.draw_rect(pymupdf.Rect(100, 200, 300, 400), color=(0, 0, 0), width=2)
        doc.save(str(pdf_path))
    finally:
        doc.close()
    monkeypatch.chdir(tmp_path)

    # Interior bbox: padded rect stays fully on-page.
    relpath = capture_feedback_crop(
        str(pdf_path), 0, (100.0, 200.0, 300.0, 400.0), "fb-interior", "proj_crop"
    )
    assert relpath == "data/feedback/crops/proj_crop/fb-interior.png"
    crop_file = tmp_path / relpath
    assert crop_file.is_file()
    with Image.open(crop_file) as img:
        width_px, height_px = img.size
    # Padded rect is 236 x 236 pt at 150 DPI (150/72 = 2.0833 px/pt).
    assert width_px == pytest.approx((300.0 - 100.0 + 36.0) * 150.0 / 72.0, abs=2.0)
    assert height_px == pytest.approx((400.0 - 200.0 + 36.0) * 150.0 / 72.0, abs=2.0)

    # Edge bbox with large padding: rect clamps to the page, never beyond it.
    relpath_edge = capture_feedback_crop(
        str(pdf_path),
        0,
        (560.0, 740.0, 610.0, 790.0),
        "fb-edge",
        "proj_crop",
        padding_pt=100.0,
    )
    edge_file = tmp_path / relpath_edge
    assert edge_file.is_file()
    with Image.open(edge_file) as img:
        edge_w, edge_h = img.size
    # Clamped to page bounds: width <= 612 pt, height <= 792 pt at 150 DPI.
    assert edge_w <= 612.0 * 150.0 / 72.0 + 2.0
    assert edge_h <= 792.0 * 150.0 / 72.0 + 2.0
    assert edge_w > 0 and edge_h > 0

    # Fail-closed: traversal project_id writes nothing.
    with pytest.raises(ValueError):
        capture_feedback_crop(
            str(pdf_path), 0, (100.0, 200.0, 300.0, 400.0), "fb-evil", "../evil"
        )
async def test_review_events_audit_trail(tmp_path: Path):
    """TASK-REV-004: 3 modifications produce 3 immutable, chronological rows."""
    db_file = tmp_path / "test_audit_trail.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    await store.insert_project("proj_audit", "Audit Facility")
    await store.insert_sheet(
        sheet_id="sheet_audit",
        project_id="proj_audit",
        page_index=0,
        sheet_number="M-1.0",
        sheet_title="Audit Plan",
        discipline="MECHANICAL",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=1224.0,
        height_pt=792.0,
    )
    await store.add_takeoff_item(
        TakeoffRecord(
            item_id="item_audit_01",
            project_id="proj_audit",
            sheet_id="sheet_audit",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='24"x12"',
            status="SUGGESTED",
            total_length_ft=32.5,
        )
    )

    assert await store.update_item_status(
        "item_audit_01", "CANNOT_DETERMINE", action="CANNOT_DETERMINE"
    ) is True
    assert await store.update_item_status(
        "item_audit_01", "SUGGESTED", action="USER_REVIEW"
    ) is True
    assert await store.update_item_status(
        "item_audit_01",
        "REJECTED",
        action="REJECT",
        reason="DUPLICATE_ITEM",
    ) is True

    history = await store.get_item_history("item_audit_01")
    assert len(history) == 3
    assert [r["previous_status"] for r in history] == [
        "SUGGESTED",
        "CANNOT_DETERMINE",
        "SUGGESTED",
    ]
    assert [r["new_status"] for r in history] == [
        "CANNOT_DETERMINE",
        "SUGGESTED",
        "REJECTED",
    ]
    assert history[2]["reason"] == "DUPLICATE_ITEM"
    assert [r["timestamp"] for r in history] == sorted(r["timestamp"] for r in history)

    # Immutability: re-reading returns identical rows.
    assert await store.get_item_history("item_audit_01") == history

    # Append-only: sheet cleanup removes item rows but retains every audit row.
    await store.delete_vector_items_for_sheet("proj_audit", "sheet_audit")
    retained = await store.get_item_history("item_audit_01")
    assert len(retained) == 3
    assert retained == history


@pytest.mark.asyncio
async def test_review_accept_gate_missing_sheet_fail_closed(tmp_path: Path):
    """HIGH#1: ACCEPT with a bogus sheet_id fails closed (409-path ValueError)."""
    store = TakeoffStore(db_path=tmp_path / "test_review_nosheet.sqlite3")
    await store.initialize()

    await store.add_takeoff_item(
        TakeoffRecord(
            item_id="item_nosheet_01",
            project_id="p_nosheet",
            sheet_id="ghost_sheet",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='24"x12"',
            status="SUGGESTED",
            total_length_ft=10.0,
            review_required=True,
        )
    )

    with pytest.raises(ValueError, match="[Uu][Nn][Vv][Ee][Rr][Ii][Ff][Ii][Ee][Dd]"):
        await store.update_item_status("item_nosheet_01", "ACCEPTED", action="ACCEPT")

    items = await store.list_items(sheet_id="ghost_sheet")
    assert items[0].status == "SUGGESTED"
    assert items[0].review_required is True


@pytest.mark.asyncio
async def test_review_accept_scale_allowlist(tmp_path: Path):
    """HIGH#2: ACCEPT allowed only for VERIFIED/CALIBRATED sheet scale."""
    from src.store.takeoff_store import _accept_scale_allowed

    # Unit level: NULL/empty/conflict/garbage refused, allowlist passes.
    assert _accept_scale_allowed("VERIFIED") is True
    assert _accept_scale_allowed("CALIBRATED") is True
    assert _accept_scale_allowed("  calibrated  ") is True
    assert _accept_scale_allowed("UNVERIFIED") is False
    assert _accept_scale_allowed(None) is False
    assert _accept_scale_allowed("") is False
    assert _accept_scale_allowed("   ") is False
    assert _accept_scale_allowed("SCALE_CONFLICT") is False
    assert _accept_scale_allowed("VALID") is False
    assert _accept_scale_allowed("garbage") is False
    assert _accept_scale_allowed(48.0) is False

    # Integration level: UNVERIFIED/empty/garbage -> ValueError (HTTP 409
    # path), VERIFIED/CALIBRATED -> accepted.
    store = TakeoffStore(db_path=tmp_path / "test_review_allowlist.sqlite3")
    await store.initialize()
    await store.insert_project("p_allow", "Allowlist Facility")

    async def _sheet(sheet_id: str, status: str) -> None:
        await store.insert_sheet(
            sheet_id=sheet_id,
            project_id="p_allow",
            page_index=0,
            sheet_number="M-1.0",
            sheet_title="Allowlist Plan",
            discipline="MECHANICAL",
            scale_raw='1/4" = 1\'-0"',
            scale_ratio=48.0,
            scale_status=status,
            width_pt=1224.0,
            height_pt=792.0,
        )

    await _sheet("sheet_unverified", "UNVERIFIED")
    await _sheet("sheet_empty", "")
    await _sheet("sheet_garbage", "SCALE_CONFLICT")
    await _sheet("sheet_verified", "VERIFIED")
    await _sheet("sheet_calibrated", "CALIBRATED")

    async def _item(item_id: str, sheet_id: str) -> None:
        await store.add_takeoff_item(
            TakeoffRecord(
                item_id=item_id,
                project_id="p_allow",
                sheet_id=sheet_id,
                category="DUCTWORK",
                system="Supply Air",
                dimension_label='24"x12"',
                status="SUGGESTED",
                total_length_ft=10.0,
                review_required=True,
            )
        )

    for item_id, sheet_id in [
        ("item_unverified", "sheet_unverified"),
        ("item_empty", "sheet_empty"),
        ("item_garbage", "sheet_garbage"),
    ]:
        await _item(item_id, sheet_id)
        with pytest.raises(ValueError, match="[Uu][Nn][Vv][Ee][Rr][Ii][Ff][Ii][Ee][Dd]"):
            await store.update_item_status(item_id, "ACCEPTED", action="ACCEPT")

    for item_id, sheet_id in [
        ("item_verified", "sheet_verified"),
        ("item_calibrated", "sheet_calibrated"),
    ]:
        await _item(item_id, sheet_id)
        assert (
            await store.update_item_status(item_id, "ACCEPTED", action="ACCEPT")
            is True
        )

    items = {i.item_id: i for i in await store.list_items(project_id="p_allow")}
    assert items["item_unverified"].review_required is True
    assert items["item_empty"].review_required is True
    assert items["item_garbage"].review_required is True
    assert items["item_verified"].status == "ACCEPTED"
    assert items["item_calibrated"].status == "ACCEPTED"


@pytest.mark.asyncio
async def test_recalibration_demotes_accepted_to_suggested(tmp_path: Path):
    """HIGH#3: recalibration demotes ACCEPTED rows to SUGGESTED + audit trail."""
    import aiosqlite

    store = TakeoffStore(db_path=tmp_path / "test_review_recal.sqlite3")
    await store.initialize()
    await store.insert_project("p_recal", "Recal Facility")
    await store.insert_sheet(
        sheet_id="sheet_recal",
        project_id="p_recal",
        page_index=0,
        sheet_number="M-1.0",
        sheet_title="Recal Plan",
        discipline="MECHANICAL",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=24.0,
        scale_status="VERIFIED",
        width_pt=1224.0,
        height_pt=792.0,
    )
    await store.add_takeoff_item(
        TakeoffRecord(
            item_id="item_recal_01",
            project_id="p_recal",
            sheet_id="sheet_recal",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='24"x12"',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=0.5,
            count=1,
            geometry={
                "type": "polyline",
                "points": [[0.0, 0.0], [18.0, 0.0]],
                "coordinate_space": "pdf_user_space_pt",
                "geometric_length_pt": 18.0,
            },
            confidence=None,
            review_required=False,
        )
    )

    updated, skipped = await store.apply_sheet_calibration(
        "sheet_recal", 48.0, '1/4" = 1\'-0"'
    )
    assert updated == 1
    assert skipped == 0

    items = await store.list_items(sheet_id="sheet_recal")
    assert items[0].status == "SUGGESTED"
    assert items[0].review_required is True
    # 18 pt * 48 / 864 = 1.0 ft recomputed footage.
    assert items[0].total_length_ft == pytest.approx(1.0)

    async with aiosqlite.connect(store.db_path) as db, db.execute(
        "SELECT previous_status, new_status, action FROM review_events "
        "WHERE item_id = 'item_recal_01' AND action = 'SHEET_CALIBRATION'"
    ) as cur:
        rows = await cur.fetchall()
    assert len(rows) == 1
    assert tuple(rows[0]) == ("ACCEPTED", "SUGGESTED", "SHEET_CALIBRATION")


async def _seed_project_sheet(store: TakeoffStore, project_id: str, sheet_id: str) -> None:
    await store.insert_project(project_id, f"Project {project_id}")
    await store.insert_sheet(
        sheet_id,
        project_id,
        page_index=0,
        sheet_number="M-101",
        sheet_title="Mechanical",
        discipline="HVAC",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=3024.0,
        height_pt=2160.0,
    )


def _swarm_ok_record(
    detections: list[dict],
    *,
    tile_index: int = 0,
    review_required: bool = False,
    status: str = "OK",
) -> dict:
    return {
        "tile_index": tile_index,
        "tile_col": 0,
        "tile_row": 0,
        "status": status,
        "detections": detections,
        "review_required": review_required,
        "x_offset_px": 0,
        "y_offset_px": 0,
    }


def _swarm_detection(
    label: str,
    tile_bbox: list[float],
    confidence: float | None = 0.95,
    *,
    review_required: bool = False,
) -> dict:
    return {
        "symbol_label": label,
        "tile_bbox": tile_bbox,
        "confidence": confidence,
        "tile_index": 0,
        "tile_col": 0,
        "tile_row": 0,
        "x_offset_px": 0,
        "y_offset_px": 0,
        "review_required": review_required,
    }


async def test_symbol_pin_persistence(tmp_path: Path):
    """SYM-005: swarm outcome records persist as SUGGESTED equipment pins."""
    from src.store.takeoff_store import symbol_label_to_system

    store = TakeoffStore(db_path=tmp_path / "test_symbol_pins.sqlite3")
    await store.initialize()
    await _seed_project_sheet(store, "proj_sym", "sheet_sym")

    assert symbol_label_to_system("SD") == "Supply"
    assert symbol_label_to_system("rg") == "Return"
    assert symbol_label_to_system("EF") == "Exhaust"
    assert symbol_label_to_system("fd") == "Fire"
    assert symbol_label_to_system("Mystery-9") == "General"

    records = [
        _swarm_ok_record(
            [
                _swarm_detection("SD", [100.0, 100.0, 200.0, 200.0], 0.95),
                _swarm_detection("RG", [300.0, 300.0, 400.0, 400.0], 0.20, review_required=True),
            ]
        ),
        _swarm_ok_record([], tile_index=1),
        {
            "tile_index": 2,
            "tile_col": 1,
            "tile_row": 0,
            "status": "PARSE_FAILED",
            "detections": [],
            "review_required": True,
            "error": "UNPARSEABLE_MODEL_JSON",
        },
    ]
    item_ids = await store.persist_verified_symbols(records, project_id="proj_sym", sheet_id="sheet_sym")
    assert len(item_ids) == 2

    items = await store.list_items(sheet_id="sheet_sym")
    assert len(items) == 2
    by_label = {item.dimension_label: item for item in items}
    sd, rg = by_label["SD"], by_label["RG"]
    for item in items:
        assert item.category == "EQUIPMENT"
        assert item.status == "SUGGESTED"
        assert item.source == "SYMBOL_SWARM"
        assert item.count == 1
    assert sd.system == "Supply"
    assert sd.review_required is False
    assert sd.confidence == pytest.approx(0.95)
    # Demoted borderline detection keeps its review flag on the ledger.
    assert rg.system == "Return"
    assert rg.review_required is True
    # Tile bbox [100..200] at offset 0 -> sheet px [102.4..204.8] -> pt x0.48.
    assert sd.geometry["bbox_pt"][0] == pytest.approx(102.4 * 0.48)
    assert sd.geometry["center_pt"][0] == pytest.approx(153.6 * 0.48)

    # Empty input mirrors run_swarm all-EMPTY: nothing to persist, no raise.
    assert await store.persist_verified_symbols([], project_id="proj_sym", sheet_id="sheet_sym") == []

    # Non-empty input with no usable labels fails closed, never silent.
    with pytest.raises(ValueError, match="NO_EXEMPLARS"):
        await store.persist_verified_symbols(
            [_swarm_ok_record([]), _swarm_ok_record([], tile_index=1)],
            project_id="proj_sym",
            sheet_id="sheet_sym",
        )
    with pytest.raises(ValueError, match="NO_EXEMPLARS"):
        await store.persist_verified_symbols(
            [_swarm_ok_record([], tile_index=7, review_required=True, status="PARSE_FAILED")],
            project_id="proj_sym",
            sheet_id="sheet_sym",
        )

    # Unmeasurable geometry is skipped; unmeasurable confidence escalates.
    ids = await store.persist_verified_symbols(
        [
            _swarm_ok_record(
                [
                    _swarm_detection("XX-BAD", [0.0, 0.0, 0.0, 50.0], 0.9),
                    _swarm_detection("SD", [10.0, 10.0, 60.0, 60.0], None),
                ]
            )
        ],
        project_id="proj_sym",
        sheet_id="sheet_sym",
    )
    assert len(ids) == 1
    items = await store.list_items(sheet_id="sheet_sym")
    nan_item = next(i for i in items if i.item_id == ids[0])
    assert nan_item.review_required is True
    assert nan_item.confidence is None


async def test_dataset_curation_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """FDBK-004: curated export holds only eligible rows, zero package bleed.

    Phase 2 always writes ``training_eligible == 0`` (no adjudication UI
    yet), so live exports are empty by design; eligible rows are seeded
    here with direct SQL to prove the curator gates.
    """
    import json as _json

    import aiosqlite as _aiosqlite

    from src.meta_services.dataset_curator import DatasetCurator

    store = TakeoffStore(db_path=tmp_path / "test_curation.sqlite3")
    await store.initialize()
    monkeypatch.chdir(tmp_path)
    await _seed_project_sheet(store, "proj_pkg_a", "sheet_a1")
    await _seed_project_sheet(store, "proj_pkg_b", "sheet_b1")
    await _seed_project_sheet(store, "demo Playground", "sheet_demo1")

    async def seed_feedback(
        feedback_id: str,
        project_id: str,
        sheet_id: str,
        *,
        action: str,
        eligible: int,
        task_type: str = "symbol_detection",
    ) -> None:
        async with _aiosqlite.connect(store.db_path) as db:
            await db.execute(
                """INSERT INTO engineer_feedback_events (
                    feedback_id, project_id, sheet_id, item_id, task_type,
                    action, previous_status, new_status, original_output_json,
                    corrected_output_json, correction_reason, bounding_box_pt_json,
                    crop_storage_relpath, model_version, prompt_version,
                    reviewer_session_id, training_eligible, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    feedback_id, project_id, sheet_id, None, task_type,
                    action, "SUGGESTED", "CORRECTED", '{"label": "SD"}',
                    '{"label": "RG"}', "WRONG_SYSTEM_CLASSIFICATION",
                    "[10.0, 10.0, 60.0, 60.0]",
                    f"data/feedback/crops/{project_id}/{feedback_id}.png",
                    "muse-spark-1.3", "sym-v1", "reviewer-1", eligible,
                    "2026-11-02T00:00:00+00:00",
                ),
            )
            await db.commit()

    await seed_feedback("fb-a1", "proj_pkg_a", "sheet_a1", action="CORRECT", eligible=1)
    await seed_feedback("fb-a2", "proj_pkg_a", "sheet_a1", action="REJECT", eligible=1)
    await seed_feedback("fb-a3", "proj_pkg_a", "sheet_a1", action="CORRECT", eligible=0)
    await seed_feedback("fb-b1", "proj_pkg_b", "sheet_b1", action="CORRECT", eligible=1)
    await seed_feedback("fb-und", "proj_pkg_b", "sheet_b1", action="CANNOT_DETERMINE", eligible=1)
    await seed_feedback("fb-demo", "demo Playground", "sheet_demo1", action="CORRECT", eligible=1)

    curator = DatasetCurator()
    summary = await curator.export_dataset(
        store, out_dir=tmp_path / "curated", eval_fraction=0.5, seed=7
    )
    assert summary["ineligible_excluded"] >= 1
    assert summary["undetermined_excluded"] == 1
    assert summary["demo_excluded"] == 1

    train_rows = [
        _json.loads(line)
        for line in (tmp_path / "curated" / "train.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    eval_rows = [
        _json.loads(line)
        for line in (tmp_path / "curated" / "eval.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    all_rows = train_rows + eval_rows
    assert len(all_rows) == 3
    assert {row["feedback_id"] for row in all_rows} == {"fb-a1", "fb-a2", "fb-b1"}
    for row in all_rows:
        assert row["training_eligible"] == 1
        assert row["action"] != "CANNOT_DETERMINE"
        assert "demo" not in str(row["project_id"]).lower()
        assert row["crop_relpath"].endswith(".png") and ".." not in row["crop_relpath"]
    # Drawing-package holdout: no package appears in both splits.
    train_pkgs = {row["project_id"] for row in train_rows}
    eval_pkgs = {row["project_id"] for row in eval_rows}
    assert train_pkgs and eval_pkgs
    assert not (train_pkgs & eval_pkgs)
    manifest = _json.loads((tmp_path / "curated" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["train_count"] == len(train_rows)
    assert manifest["eval_count"] == len(eval_rows)
@pytest.mark.asyncio
async def test_qa_annotation_roundtrip(tmp_path: Path):
    store = TakeoffStore(db_path=tmp_path / "qa.sqlite3")
    await store.initialize()
    ann_id = await store.record_qa_annotation(
        project_id="proj_qa",
        sheet_id="sheet_m22",
        annotation_type="FLAG",
        reason_code="SCALE_UNVERIFIED_MEASURED",
        severity="HIGH",
        message="Unverified scale with measured items.",
        geometry={"type": "point", "coordinates": [10.0, 20.0]},
        evidence_ids=["ev_item_1"],
        source_agent="agent_05_watchdog",
    )
    got = await store.get_qa_annotation(ann_id)
    assert got is not None
    assert got["status"] == "OPEN"
    assert got["annotation_type"] == "FLAG"
    assert got["geometry"] == {"type": "point", "coordinates": [10.0, 20.0]}
    assert got["evidence_ids"] == ["ev_item_1"]
    assert got["project_id"] == "proj_qa"


@pytest.mark.asyncio
async def test_qa_annotation_list_filters(tmp_path: Path):
    store = TakeoffStore(db_path=tmp_path / "qa_list.sqlite3")
    await store.initialize()
    await store.record_qa_annotation(
        project_id="p1", sheet_id="s1", annotation_type="FLAG",
        reason_code="R1", severity="HIGH",
    )
    await store.record_qa_annotation(
        project_id="p1", sheet_id="s2", annotation_type="NOTE",
        reason_code="R2", severity="INFO",
    )
    await store.record_qa_annotation(
        project_id="p2", sheet_id="s1", annotation_type="FLAG",
        reason_code="R3", severity="WARNING",
    )
    assert len(await store.list_qa_annotations("p1")) == 2
    assert len(await store.list_qa_annotations("p2")) == 1
    assert len(await store.list_qa_annotations("p1", sheet_id="s2")) == 1
    assert len(await store.list_qa_annotations("p1", status="OPEN")) == 2
    assert await store.list_qa_annotations("p1", status="DISMISSED") == []


@pytest.mark.asyncio
async def test_qa_annotation_status_transitions(tmp_path: Path):
    store = TakeoffStore(db_path=tmp_path / "qa_status.sqlite3")
    await store.initialize()
    ann_id = await store.record_qa_annotation(
        project_id="p1", annotation_type="CONFLICT",
        reason_code="COUNT_MISMATCH", severity="WARNING",
    )
    assert await store.update_qa_annotation_status(ann_id, "CONFIRMED") is True
    assert (await store.get_qa_annotation(ann_id))["status"] == "CONFIRMED"
    with pytest.raises(ValueError, match="resolution_reason"):
        await store.update_qa_annotation_status(ann_id, "DISMISSED")
    assert await store.update_qa_annotation_status(ann_id, "DISMISSED", "duplicate") is True
    got = await store.get_qa_annotation(ann_id)
    assert got["status"] == "DISMISSED"
    assert got["resolution_reason"] == "duplicate"
    assert await store.update_qa_annotation_status("nope", "CONFIRMED") is False


@pytest.mark.asyncio
async def test_qa_annotation_rejects_bad_vocab(tmp_path: Path):
    store = TakeoffStore(db_path=tmp_path / "qa_bad.sqlite3")
    await store.initialize()
    with pytest.raises(ValueError, match="annotation_type"):
        await store.record_qa_annotation(
            project_id="p1", annotation_type="BOGUS",
            reason_code="R", severity="HIGH",
        )
    with pytest.raises(ValueError, match="severity"):
        await store.record_qa_annotation(
            project_id="p1", annotation_type="FLAG",
            reason_code="R", severity="BOGUS",
        )
    with pytest.raises(ValueError, match="reason_code"):
        await store.record_qa_annotation(
            project_id="p1", annotation_type="FLAG",
            reason_code="  ", severity="HIGH",
        )