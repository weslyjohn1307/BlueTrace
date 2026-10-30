"""Contract integration tests asserting that all frontend API client endpoints

connect cleanly to the FastAPI backend with validated schemas and HTTP 200/OK.
"""

from __future__ import annotations

import base64

from starlette.testclient import TestClient

from src.api.main import app


def test_frontend_backend_api_contracts():
    client = TestClient(app)

    # 1. /api/health
    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    health = health_res.json()
    assert health["status"] == "online"
    assert "models" in health

    # 2. /api/sheet-scan (path-traversal protected)
    scan_res = client.post(
        "/api/sheet-scan",
        json={"pdf_path": "fixtures/mechanical/avexis_page_22.pdf", "page_index": 0},
    )
    assert scan_res.status_code == 200
    scan_data = scan_res.json()
    assert scan_data["discipline"] == "MECHANICAL"
    assert scan_data["scale_status"] in ("VERIFIED", "UNVERIFIED", "CALIBRATED")

    # 2b. /api/sheet-scan path traversal rejection
    bad_scan = client.post(
        "/api/sheet-scan",
        json={"pdf_path": "../../Windows/System32/calc.exe", "page_index": 0},
    )
    assert bad_scan.status_code == 403

    # 3. /api/crop-ocr
    crop_res = client.post(
        "/api/crop-ocr",
        json={
            "sheet_id": "contract_sheet",
            "cursor_pt": [100.0, 100.0],
            "crop_size_pt": 150.0,
            "image_base64": base64.b64encode(b"dummy_crop").decode("ascii"),
        },
    )
    assert crop_res.status_code == 200
    crop_data = crop_res.json()
    assert "latency_ms" in crop_data
    assert "badge_text" in crop_data

    # 4. /api/schedule/parse
    sched_res = client.post(
        "/api/schedule/parse",
        json={
            "image_base64": base64.b64encode(b"sched_image").decode("ascii"),
            "schedule_title": "Air Terminal Schedule",
            "project_id": "contract_proj",
            "sheet_id": "contract_sheet",
            "page_text_blocks": [["VAV-01 450 CFM", [120.0, 120.0, 220.0, 160.0]]],
        },
    )
    assert sched_res.status_code == 200
    sched_data = sched_res.json()
    assert "scheduled_items_total" in sched_data
    assert "linked_takeoff_records" in sched_data

    # 5. /api/segment
    seg_res = client.post(
        "/api/segment",
        json={
            "image_base64": base64.b64encode(b"segment_crop").decode("ascii"),
            "concept_prompt": "mechanical duct line",
        },
    )
    assert seg_res.status_code == 200
    assert "polygons" in seg_res.json()

    # 6. /api/copilot
    copilot_res = client.post(
        "/api/copilot",
        json={"sheet_id": "contract_sheet", "query": "What items are on this sheet?"},
    )
    assert copilot_res.status_code == 200
    copilot_data = copilot_res.json()
    assert "answer" in copilot_data
    assert "scale_verified" in copilot_data

    # 7. /api/takeoff/items (Create & List)
    item_res = client.post(
        "/api/takeoff/items",
        json={
            "project_id": "contract_proj",
            "sheet_id": "contract_sheet",
            "category": "DUCTWORK",
            "system": "Supply Air",
            "dimension_label": '24"x12"',
            "status": "SUGGESTED",
            "total_length_ft": 32.5,
            "count": 1,
        },
    )
    assert item_res.status_code == 200
    created_item = item_res.json()
    item_id = created_item["item_id"]

    list_res = client.get("/api/takeoff/items?sheet_id=contract_sheet")
    assert list_res.status_code == 200
    assert any(i["item_id"] == item_id for i in list_res.json())

    # 8. /api/takeoff/items/{item_id}/status (One-click decision)
    patch_res = client.patch(
        f"/api/takeoff/items/{item_id}/status",
        json={"status": "ACCEPTED", "action": "ONE_CLICK_ACCEPT"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "ACCEPTED"

    # 9. /api/takeoff/summary
    sum_res = client.get("/api/takeoff/summary?sheet_id=contract_sheet")
    assert sum_res.status_code == 200
    assert len(sum_res.json()) >= 1

    # 10. /api/takeoff/export/csv and /json
    csv_res = client.get("/api/takeoff/export/csv?sheet_id=contract_sheet")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]

    json_res = client.get("/api/takeoff/export/json?sheet_id=contract_sheet")
    assert json_res.status_code == 200
    assert "line_items" in json_res.json()

    # 11. /api/auth/byok (Configure & Clear Session)
    byok_res = client.post("/api/auth/byok", json={"api_key": "mk-session-demo-1234"})
    assert byok_res.status_code == 200
    assert byok_res.json()["configured"] is True
    assert byok_res.json()["masked_key"] == "••••1234"

    del_byok = client.delete("/api/auth/byok")
    assert del_byok.status_code == 200
    assert del_byok.json()["cleared"] is True
