"""End-to-end ingestion test: upload -> scan-all -> ledger -> summary -> export.

Proves the full pipeline on the Avexis mechanical fixture:
  PDF upload, multi-sheet reconnaissance, automated vector extraction,
  fail-closed scale gating, ledger population, and CSV/JSON export.
A synthetic scaled sheet covers the VERIFIED branch (ACCEPTED footage),
and a generated 3-page set covers multi-sheet scanning.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest
from starlette.testclient import TestClient

from src.api.main import app
from src.store.takeoff_store import pipeline_results_to_records

AVEXIS = Path("fixtures/mechanical/avexis_page_22.pdf")


@pytest.fixture()
def client(isolated_takeoff_store) -> TestClient:
    _ = isolated_takeoff_store
    return TestClient(app)


def _upload(client: TestClient, filename: str, content: bytes) -> dict:
    res = client.post(
        f"/api/upload?filename={filename}",
        content=content,
        headers={"Content-Type": "application/pdf"},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _make_pdf_bytes(pages: list[tuple[str, list[tuple[tuple[float, float], tuple[float, float]]]]]) -> bytes:
    doc = pymupdf.open()
    for text, lines in pages:
        page = doc.new_page(width=612, height=792)
        if text:
            page.insert_text((50, 50), text, fontsize=10)
        for (x0, y0), (x1, y1) in lines:
            shape = page.new_shape()
            shape.draw_line((x0, y0), (x1, y1))
            shape.finish(color=(0, 0, 0), width=1.5)
            shape.commit()
    payload = doc.tobytes()
    doc.close()
    return payload


def test_upload_scan_all_populates_ledger_fail_closed(client: TestClient):
    uploaded = _upload(client, "avexis_page_22.pdf", AVEXIS.read_bytes())
    assert uploaded["file_path"].startswith("data/uploads/")

    scan = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": uploaded["file_path"], "project_id": "e2e_project"},
    )
    assert scan.status_code == 200, scan.text
    body = scan.json()
    assert body["total_pages"] == 1
    assert len(body["sheets"]) == 1
    sheet = body["sheets"][0]
    assert sheet["discipline"] == "MECHANICAL"
    # Avexis carries no readable scale: the sheet must fail closed.
    assert sheet["scale_status"] == "UNVERIFIED"
    assert body["takeoff"][0]["run_count"] > 300
    assert body["takeoff"][0]["items_created"] > 300

    items_res = client.get(
        "/api/takeoff/items",
        params={"project_id": "e2e_project", "sheet_id": sheet["sheet_id"]},
    )
    assert items_res.status_code == 200
    items = items_res.json()
    assert len(items) > 300
    for item in items:
        assert item["category"] == "DUCTWORK"
        # Linework alone cannot prove supply/return/exhaust or size: unclassified.
        assert item["system"] == "General"
        assert item["dimension_label"] == "Unknown - size TBD"
        assert item["status"] == "SUGGESTED"
        assert item["total_length_ft"] == 0.0
        assert item["review_required"] is True
        geometry = item["geometry"]
        assert geometry["type"] == "polyline"
        assert len(geometry["points"]) >= 2

    summary_res = client.get(
        "/api/takeoff/summary",
        params={"project_id": "e2e_project", "sheet_id": sheet["sheet_id"]},
    )
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert sum(row["total_count"] for row in summary) > 300
    assert sum(row["suggested_count"] for row in summary) > 300
    assert sum(row["total_length_ft"] for row in summary) == 0.0

    csv_res = client.get(
        "/api/takeoff/export/csv",
        params={"project_id": "e2e_project", "sheet_id": sheet["sheet_id"]},
    )
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "General" in csv_res.text
    assert "Unknown - size TBD" in csv_res.text
    assert "polyline" in csv_res.text  # physical coordinates ride in geometry
    assert "Linear Length (ft)" in csv_res.text
    assert "Review Required" in csv_res.text

    json_res = client.get(
        "/api/takeoff/export/json",
        params={"project_id": "e2e_project", "sheet_id": sheet["sheet_id"]},
    )
    assert json_res.status_code == 200
    assert len(json_res.json()["line_items"]) > 300


def test_single_sheet_scan_auto_populates_ledger(client: TestClient):
    scan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "single_scan_project",
        },
    )
    assert scan.status_code == 200, scan.text
    sheet_id = scan.json()["sheet_id"]

    items = client.get(
        "/api/takeoff/items",
        params={"project_id": "single_scan_project", "sheet_id": sheet_id},
    ).json()
    assert len(items) > 300

    # Re-scanning must replace vector rows, never duplicate them.
    again = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "single_scan_project",
        },
    )
    assert again.status_code == 200
    items_after = client.get(
        "/api/takeoff/items",
        params={"project_id": "single_scan_project", "sheet_id": sheet_id},
    ).json()
    assert len(items_after) == len(items)


def test_verified_scale_sheet_accepts_measured_footage(client: TestClient):
    payload = _make_pdf_bytes(
        [
            (
                'M-101 MECHANICAL FLOOR PLAN\nSCALE: 1/8" = 1\'-0"',
                [
                    ((100.0, 100.0), (150.0, 100.0)),
                    ((150.0, 100.0), (200.0, 100.0)),
                    ((200.0, 100.0), (250.0, 100.0)),
                ],
            )
        ]
    )
    uploaded = _upload(client, "scaled_plan.pdf", payload)
    scan = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": uploaded["file_path"], "project_id": "verified_project"},
    )
    assert scan.status_code == 200, scan.text
    sheet = scan.json()["sheets"][0]
    assert sheet["scale_status"] == "VERIFIED"

    items = client.get(
        "/api/takeoff/items",
        params={"project_id": "verified_project", "sheet_id": sheet["sheet_id"]},
    ).json()
    assert len(items) >= 1
    for item in items:
        assert item["status"] == "ACCEPTED"
        assert item["total_length_ft"] > 0
        assert item["confidence"] == 1.0
        assert item["review_required"] is False


def test_scan_all_discovers_every_page(client: TestClient):
    payload = _make_pdf_bytes([("SHEET A", []), ("SHEET B", []), ("SHEET C", [])])
    uploaded = _upload(client, "multi_sheet.pdf", payload)
    scan = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": uploaded["file_path"], "project_id": "multi_project"},
    )
    assert scan.status_code == 200, scan.text
    body = scan.json()
    assert body["total_pages"] == 3
    assert len(body["sheets"]) == 3
    assert [s["page_index"] for s in body["sheets"]] == [0, 1, 2]
    assert all(s["width_pt"] > 0 and s["height_pt"] > 0 for s in body["sheets"])


def test_scan_all_enforces_path_safety(client: TestClient):
    traversal = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": "../../Windows/System32/calc.pdf", "project_id": "x"},
    )
    assert traversal.status_code == 403

    absolute = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": "C:/Windows/System32/calc.pdf", "project_id": "x"},
    )
    assert absolute.status_code == 403

    missing = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": "fixtures/mechanical/does_not_exist.pdf", "project_id": "x"},
    )
    assert missing.status_code == 404


def test_pipeline_mapping_fail_closed_branches():
    result = {
        "scale_status": "VALID",
        "results": [
            {
                "object_type": "duct",
                "location_or_path": {"type": "polyline", "points": [[0.0, 0.0], [72.0, 0.0]]},
                "confidence": 0.9,
                "length": 3.048,  # 10 ft
                "sheet_id": "ignored",
            },
            {
                "object_type": "pipe",
                "location_or_path": {"type": "polyline", "points": [[0.0, 0.0], [0.0, 36.0]]},
                "confidence": 0.9,
                "length": None,
                "sheet_id": "ignored",
            },
            {
                "object_type": "duct",
                "location_or_path": {"type": "polyline", "points": [[5.0, 5.0]]},
                "confidence": 0.9,
                "length": 1.0,
                "sheet_id": "ignored",
            },
        ],
    }

    verified = pipeline_results_to_records(
        result, project_id="p", sheet_id="s1", sheet_scale_status="VERIFIED"
    )
    assert len(verified) == 2  # degenerate single-point run is dropped
    assert verified[0].status == "ACCEPTED"
    assert verified[0].total_length_ft == pytest.approx(10.0)
    assert verified[0].confidence == 1.0
    assert verified[0].review_required is False
    assert verified[1].category == "PIPING"
    assert verified[1].status == "SUGGESTED"  # no measured length: fail closed
    assert verified[1].total_length_ft == 0.0
    assert verified[1].review_required is True

    unverified = pipeline_results_to_records(
        result, project_id="p", sheet_id="s1", sheet_scale_status="UNVERIFIED"
    )
    assert all(r.status == "SUGGESTED" for r in unverified)
    assert all(r.total_length_ft == 0.0 for r in unverified)
    assert all(r.review_required is True for r in unverified)


def test_pipeline_mapping_rejects_malformed_measurements():
    base = {"scale_status": "VALID", "results": []}

    def one(**overrides: object) -> dict:
        run = {
            "object_type": "duct",
            "location_or_path": {"type": "polyline", "points": [[0.0, 0.0], [72.0, 0.0]]},
            "confidence": 0.9,
            "length": 3.048,
            "sheet_id": "ignored",
        }
        run.update(overrides)
        return {**base, "results": [run]}

    # Non-finite, boolean, gapped, and zero-geometry lengths all fail closed.
    for payload in (
        one(length=float("inf")),
        one(length=True),
        one(length=3.048, has_unclosed_gaps=True),
        one(length=3.048, uncertainty_codes=["INFERRED_GEOMETRIC_CONNECTION"]),
    ):
        records = pipeline_results_to_records(
            payload, project_id="p", sheet_id="s1", sheet_scale_status="VERIFIED"
        )
        assert records[0].status == "SUGGESTED"
        assert records[0].total_length_ft == 0.0
        assert records[0].review_required is True

    # Non-finite or malformed coordinates drop the run instead of raising.
    for bad_points in ([[0.0, 0.0], [float("nan"), 1.0]], [[0.0, 0.0], ["x", 1.0]]):
        records = pipeline_results_to_records(
            one(location_or_path={"type": "polyline", "points": bad_points}),
            project_id="p",
            sheet_id="s1",
            sheet_scale_status="VERIFIED",
        )
        assert records == []


def test_unverified_acceptance_is_blocked_and_rescan_replaces_rows(client: TestClient):
    scan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "review_project",
        },
    )
    assert scan.status_code == 200, scan.text
    sheet_id = scan.json()["sheet_id"]
    items = client.get(
        "/api/takeoff/items", params={"project_id": "review_project", "sheet_id": sheet_id}
    ).json()
    assert items

    accepted = client.patch(
        f"/api/takeoff/items/{items[0]['item_id']}/status",
        json={"status": "ACCEPTED", "action": "USER_REVIEW"},
    )
    assert accepted.status_code == 409
    assert "UNVERIFIED" in accepted.json()["detail"]
    unchanged = client.get(
        "/api/takeoff/items", params={"project_id": "review_project", "sheet_id": sheet_id}
    ).json()
    reviewed_item = next(item for item in unchanged if item["item_id"] == items[0]["item_id"])
    assert reviewed_item["status"] == "SUGGESTED"

    rescan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "review_project",
        },
    )
    assert rescan.status_code == 200, rescan.text
    after = client.get(
        "/api/takeoff/items", params={"project_id": "review_project", "sheet_id": sheet_id}
    ).json()
    assert len(after) == len(items)


def test_corrupt_pdf_scan_fails_with_400(client: TestClient):
    uploaded = _upload(client, "corrupt.pdf", b"%PDF-1.4 truncated junk without objects")
    res = client.post(
        "/api/sheets/scan-all",
        json={"pdf_path": uploaded["file_path"], "project_id": "corrupt_project"},
    )
    assert res.status_code in (400, 502)
    assert res.status_code != 500
