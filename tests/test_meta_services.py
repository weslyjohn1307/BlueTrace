from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.api.main import app
from src.meta_services.client import MetaModelClient
from src.meta_services.copilot import TakeoffCopilot
from src.meta_services.schedule_parser import ScheduleParser
from src.meta_services.sheet_scanner import SheetScanner
from src.models.schemas import CopilotQueryRequest
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


def test_sheet_scanner_hvac_fixture():
    scanner = SheetScanner()
    meta = scanner.scan_page("fixtures/mechanical/hvac_plan_level2.pdf", page_index=0)

    assert meta.discipline == "MECHANICAL"
    assert meta.width_pt == 3024.0
    assert meta.height_pt == 2160.0
    assert meta.dpi == 150
    assert meta.sheet_title != ""


def test_sheet_scanner_plumbing_fixture():
    scanner = SheetScanner()
    meta = scanner.scan_page("fixtures/plumbing/plumbing_plan_level4.pdf", page_index=0)

    assert meta.discipline == "PLUMBING"
    assert meta.sheet_number.upper().startswith("P")
    assert meta.width_pt == 3024.0
    assert meta.height_pt == 2160.0


def test_schedule_parser_and_ghost_pin_linking():
    parser = ScheduleParser()

    # Synthetic text blocks on the plan
    page_blocks = [
        ("VAV-01 TERMINAL UNIT 450 CFM", [500.0, 400.0, 620.0, 420.0]),
        ("EF-1 ROOF EXHAUST", [1800.0, 1200.0, 1950.0, 1230.0]),
        ("SUPPLY DUCT 24x12", [800.0, 600.0, 950.0, 620.0]),
    ]

    dummy_b64 = base64.b64encode(b"dummy_crop_image").decode("ascii")
    scheduled_items = parser.parse_schedule_crop(dummy_b64, schedule_title="HVAC Air Terminal Schedule")

    assert len(scheduled_items) == 4

    # Link schedule against plan text blocks
    takeoff_records, unplaced = parser.link_schedule_to_plan(
        scheduled_items,
        page_blocks,
        project_id="proj_sched",
        sheet_id="sheet_m22",
    )

    # VAV-01 and EF-1 were found on the plan
    assert len(takeoff_records) == 2
    assert any(r.dimension_label.startswith("VAV-01") for r in takeoff_records)
    assert any(r.dimension_label.startswith("EF-1") for r in takeoff_records)
    # HITL Rule: All machine-extracted schedule suggestions default to SUGGESTED
    assert all(r.status == "SUGGESTED" for r in takeoff_records)

    # VAV-02 and S1 were scheduled in the table but absent from the floor plan (Ghost Pins!)
    assert len(unplaced) == 2
    assert any(u.tag == "VAV-02" for u in unplaced)
    assert any(u.tag == "S1" for u in unplaced)


@pytest.mark.asyncio
async def test_copilot_coordinate_grounding(tmp_path: Path):
    db_file = tmp_path / "copilot_test.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    await store.add_takeoff_item(
        TakeoffRecord(
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="Supply Air",
            dimension_label="VAV-01 (Terminal Box)",
            status="ACCEPTED",
            geometry={"type": "point", "coordinates": [480.0, 350.0]},
            total_length_ft=0.0,
            count=1,
        )
    )

    copilot = TakeoffCopilot(store=store)

    # Query equipment on uncalibrated sheet
    res_eq = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))
    assert "Found 1" in res_eq.answer
    assert len(res_eq.cited_coordinates) > 0
    # Fail-closed invariant: scale is uncalibrated on s1, so scale_verified must be False
    assert res_eq.scale_verified is False

    # Query scale on uncalibrated sheet -> Fail-closed UNVERIFIED
    res_sc_uncal = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="What is the sheet scale?"))
    assert "UNVERIFIED" in res_sc_uncal.answer
    assert res_sc_uncal.scale_verified is False

    # Now calibrate / register sheet s1 in store
    await store.insert_sheet(
        sheet_id="s1",
        project_id="p1",
        page_index=0,
        sheet_number="M-201",
        sheet_title="HVAC Floor Plan",
        discipline="MECHANICAL",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=3024.0,
        height_pt=2160.0,
    )

    # Query scale on calibrated sheet -> Truthfully reports calibrated scale
    res_sc_cal = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="What is the sheet scale?"))
    assert '1/4" = 1\'-0"' in res_sc_cal.answer
    assert res_sc_cal.scale_verified is True


@pytest.mark.asyncio
async def test_segment_concept_unconfigured_abstains_no_fabricated_polygon():
    """Regression (FAIL_CLOSED.md): unconfigured SAM must abstain, not
    return a fixed polygon with invented confidence."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    assert client.is_configured() is False

    result = await client.segment_concept_async(
        base64.b64encode(b"crop_bytes").decode("ascii"),
        concept_prompt="air handling unit boundary",
    )

    assert result["concept"] == "air handling unit boundary"
    assert result["polygons"] == []
    assert result["masks"] == []
    assert result["confidence"] == 0.0
    assert result["mock"] is True
    assert result["review_required"] is True


def test_crop_confidence_fails_closed_when_uncalibrated():
    """TASK-STAB-002: Assert uncalibrated crop OCR yields confidence 0.0 and review_required True."""
    # 1. Direct JSON extraction with missing confidence
    payload_without_conf = json.dumps({"width": 24, "height": 12, "shape": "RECTANGULAR"})
    res = MetaModelClient._extract_crop_json(payload_without_conf)
    assert res["width"] == 24.0
    assert res["height"] == 12.0
    assert res["confidence"] == 0.0
    assert res["review_required"] is True

    # 2. Direct JSON extraction with low confidence (< 0.85)
    payload_low_conf = json.dumps({"width": 24, "height": 12, "confidence": 0.65})
    res_low = MetaModelClient._extract_crop_json(payload_low_conf)
    assert res_low["confidence"] == 0.65
    assert res_low["review_required"] is True

    # 3. Direct JSON extraction with calibrated high confidence (>= 0.85)
    payload_high_conf = json.dumps({"width": 24, "height": 12, "confidence": 0.94})
    res_high = MetaModelClient._extract_crop_json(payload_high_conf)
    assert res_high["confidence"] == 0.94
    assert res_high["review_required"] is False

    # 4. Offline client parse_crop_ocr must have confidence == 0.0 and review_required is True
    client = MetaModelClient(api_key="mock_key_unconfigured")
    crop_res = client.parse_crop_ocr("dummy_b64")
    assert crop_res["confidence"] == 0.0
    assert crop_res["review_required"] is True
    assert crop_res["mock"] is True


def test_api_meta_services_endpoints(isolated_takeoff_store):
    client = TestClient(app)

    # 1. SheetScan endpoint on real fixture
    scan_res = client.post(
        "/api/sheet-scan",
        json={"pdf_path": "fixtures/mechanical/hvac_plan_level2.pdf", "page_index": 0},
    )
    assert scan_res.status_code == 200
    scan_data = scan_res.json()
    assert scan_data["discipline"] == "MECHANICAL"
    assert scan_data["width_pt"] == 3024.0

    # 2. Point-of-need QuickDraw crop-OCR endpoint
    crop_res = client.post(
        "/api/crop-ocr",
        json={
            "sheet_id": "s1",
            "cursor_pt": [150.0, 150.0],
            "crop_size_pt": 150.0,
            "image_base64": base64.b64encode(b"pixel_crop").decode("ascii"),
        },
    )
    assert crop_res.status_code == 200
    crop_data = crop_res.json()
    assert "Rectangular Duct" in crop_data["badge_text"] or "Round Duct" in crop_data["badge_text"]
    assert crop_data["latency_ms"] >= 0

    # 3. Schedule parsing endpoint
    sched_res = client.post(
        "/api/schedule/parse",
        json={
            "image_base64": base64.b64encode(b"schedule_crop").decode("ascii"),
            "schedule_title": "Air Terminal Schedule",
            "project_id": "api_proj",
            "sheet_id": "api_sheet",
            "page_text_blocks": [["VAV-01 450 CFM", [100.0, 100.0, 200.0, 150.0]]],
        },
    )
    assert sched_res.status_code == 200
    sched_data = sched_res.json()
    assert sched_data["scheduled_items_total"] == 4
    assert sched_data["linked_takeoff_records"] == 1
    assert len(sched_data["unplaced_ghost_pins"]) == 3

    # 4. SAM 3.1 segmentation endpoint
    seg_res = client.post(
        "/api/segment",
        json={
            "image_base64": base64.b64encode(b"crop_bytes").decode("ascii"),
            "concept_prompt": "air handling unit boundary",
        },
    )
    assert seg_res.status_code == 200
    seg_data = seg_res.json()
    # Fail-closed offline abstention: no fabricated polygon, confidence 0.
    assert seg_data["polygons"] == []
    assert seg_data["masks"] == []
    assert seg_data["confidence"] == 0.0
    assert seg_data["mock"] is True
    assert seg_data["review_required"] is True

    # 5. Copilot endpoint (fail-closed for uncalibrated sheet)
    copilot_res = client.post(
        "/api/copilot",
        json={"sheet_id": "api_sheet", "query": "What is the calibrated scale of this drawing?"},
    )
    assert copilot_res.status_code == 200
    assert copilot_res.json()["scale_verified"] is False
    assert "UNVERIFIED" in copilot_res.json()["answer"]
