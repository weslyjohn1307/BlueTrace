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

    await store.insert_project("proj_01", "Avexis Facility")
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

    # Reject
    updated2 = await store.update_item_status("item_rev_01", "REJECTED", action="DISMISS_BADGE")
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
    client = TestClient(app)

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
