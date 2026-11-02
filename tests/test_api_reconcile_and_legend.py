"""Integration tests for POST /api/takeoff/reconcile and
POST /api/sheets/{sheet_id}/legend (TASK-006).

Follows the existing FastAPI TestClient + isolated store pattern in
tests/test_api_contract.py:84-87 (fixture ``client(isolated_takeoff_store)``
returning ``TestClient(app)``), backed by the throwaway SQLite store in
tests/conftest.py:36-45. No live Meta API calls are made: the configured
legend path stubs the client/scanner, and the fail-closed path proves the
scanner's mock fallback is never reached.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import ClassVar

import pytest
from starlette.testclient import TestClient

from src.api import routes
from src.api.main import app
from src.api.routes import get_meta_client
from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import LegendScanResult, LegendSymbolEntry

FIXTURE_PDF = "fixtures/mechanical/avexis_page_22.pdf"
SHEET_ID = "M-101"


@pytest.fixture()
def client(isolated_takeoff_store) -> TestClient:
    _ = isolated_takeoff_store
    return TestClient(app)


@pytest.fixture()
def seeded_client(client: TestClient, isolated_takeoff_store) -> TestClient:
    """Client whose store holds one known sheet at stored page_index 0."""

    async def _seed() -> None:
        await isolated_takeoff_store.insert_project("proj-1", "proj-1")
        await isolated_takeoff_store.insert_sheet(
            sheet_id=SHEET_ID,
            project_id="proj-1",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Floor Plan",
            discipline="MECHANICAL",
            scale_raw=None,
            scale_ratio=None,
            scale_status="UNVERIFIED",
            width_pt=612.0,
            height_pt=792.0,
        )

    asyncio.run(_seed())
    return client


@pytest.fixture()
def unconfigured_client(seeded_client: TestClient) -> Iterator[TestClient]:
    app.dependency_overrides[get_meta_client] = lambda: MetaModelClient(
        api_key="mock_key_unconfigured"
    )
    try:
        yield seeded_client
    finally:
        app.dependency_overrides.pop(get_meta_client, None)


@pytest.fixture()
def configured_client(seeded_client: TestClient) -> Iterator[TestClient]:
    app.dependency_overrides[get_meta_client] = lambda: MetaModelClient(
        api_key="test-configured-key"
    )
    try:
        yield seeded_client
    finally:
        app.dependency_overrides.pop(get_meta_client, None)


class _FakeLegendScanner:
    """Stub scanner: records the call and returns a result whose sheet_id
    deliberately differs from the requested id (scanner derives its own)."""

    calls: ClassVar[list[tuple[str, int]]] = []

    def __init__(self, client=None) -> None:
        self.client = client

    def scan_sheet(self, pdf_path: str, page_index: int = 0) -> LegendScanResult:
        type(self).calls.append((str(pdf_path), page_index))
        return LegendScanResult(
            sheet_id="avexis_page_22_p0",
            legend_detected=True,
            legend_bbox_pt=(400.0, 100.0, 600.0, 700.0),
            symbols=[
                LegendSymbolEntry(
                    symbol_id="sym-ahu",
                    label="AHU",
                    description="Air handling unit",
                    system="HVAC",
                    bounding_box_pt=(410.0, 110.0, 450.0, 150.0),
                    confidence=0.9,
                )
            ],
            abbreviations={"AHU": "Air Handling Unit"},
            confidence=0.9,
            mock=False,
            review_required=False,
        )


# ---------------------------------------------------------------------------
# POST /api/takeoff/reconcile
# ---------------------------------------------------------------------------


def _scheduled(tag: str, quantity: int = 1) -> dict:
    return {"tag": tag, "schedule_sheet": "M-601", "quantity": quantity}


def _plan(label: str, location: list[float] | None = None) -> dict:
    return {
        "label": label,
        "sheet_id": SHEET_ID,
        "location_pt": [200.0, 200.0] if location is None else location,
    }


def test_reconcile_matched_and_unplaced_ghost(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={
            "project_id": "proj-1",
            "sheet_id": SHEET_ID,
            "scheduled_items": [_scheduled("AHU-1"), _scheduled("VAV-1")],
            "plan_symbols": [_plan("AHU-1")],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_scheduled"] == 2
    assert body["total_counted"] == 1
    for discrepancy in body["discrepancies"]:
        assert discrepancy["variance"] == discrepancy["plan_qty"] - discrepancy["schedule_qty"]
    by_tag = {d["tag"]: d for d in body["discrepancies"]}
    assert by_tag["AHU-1"]["variance"] == 0
    assert by_tag["VAV-1"]["variance"] == -1
    assert len(body["ghost_pins"]) == 1
    ghost = body["ghost_pins"][0]
    assert ghost["tag"] == "VAV-1"
    assert ghost["status"] == "UNPLACED"
    # Ghost pins sit at the staging dock, never at a fabricated measured point.
    assert ghost["location_pt"] != [100.0, 100.0]


def test_reconcile_symbol_counts_interface(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={
            "scheduled_items": [_scheduled("AHU-1")],
            "symbol_counts": {"AHU-1": 1},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_scheduled"] == 1
    assert body["total_counted"] == 1
    assert body["ghost_pins"] == []


def test_reconcile_missing_location_pt_is_422_never_defaulted(client: TestClient):
    symbol = _plan("AHU-1")
    del symbol["location_pt"]
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("AHU-1")], "plan_symbols": [symbol]},
    )
    assert res.status_code == 422, res.text
    assert "[100.0, 100.0]" not in res.text


def test_reconcile_invalid_location_pt_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={
            "scheduled_items": [_scheduled("AHU-1")],
            "plan_symbols": [_plan("AHU-1", location=[100.0])],
        },
    )
    assert res.status_code == 422, res.text


def test_reconcile_empty_tag_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("  ")], "plan_symbols": []},
    )
    assert res.status_code == 422, res.text


def test_reconcile_empty_label_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("AHU-1")], "plan_symbols": [_plan("")]},
    )
    assert res.status_code == 422, res.text


def test_reconcile_missing_schedule_sheet_is_422(client: TestClient):
    item = _scheduled("AHU-1")
    del item["schedule_sheet"]
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [item], "plan_symbols": []},
    )
    assert res.status_code == 422, res.text


def test_reconcile_empty_scheduled_items_is_422(client: TestClient):
    res = client.post("/api/takeoff/reconcile", json={"scheduled_items": []})
    assert res.status_code == 422, res.text


def test_reconcile_symbol_counts_empty_tag_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("AHU-1")], "symbol_counts": {"": 1}},
    )
    assert res.status_code == 422, res.text


def test_reconcile_symbol_counts_blank_tag_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("AHU-1")], "symbol_counts": {"  ": 1}},
    )
    assert res.status_code == 422, res.text


def test_reconcile_symbol_counts_negative_count_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={"scheduled_items": [_scheduled("AHU-1")], "symbol_counts": {"AHU-1": -1}},
    )
    assert res.status_code == 422, res.text


def test_reconcile_plan_symbols_and_symbol_counts_together_is_422(client: TestClient):
    res = client.post(
        "/api/takeoff/reconcile",
        json={
            "scheduled_items": [_scheduled("AHU-1")],
            "plan_symbols": [_plan("AHU-1")],
            "symbol_counts": {"AHU-1": 1},
        },
    )
    assert res.status_code == 422, res.text


# ---------------------------------------------------------------------------
# POST /api/sheets/{sheet_id}/legend
# ---------------------------------------------------------------------------


def test_legend_unknown_sheet_is_404(unconfigured_client: TestClient):
    res = unconfigured_client.post(
        "/api/sheets/NOPE-999/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 404, res.text


def test_legend_unconfigured_meta_fails_closed(unconfigured_client: TestClient):
    res = unconfigured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sheet_id"] == SHEET_ID
    assert body["legend_detected"] is False
    assert body["legend_bbox_pt"] is None
    assert body["symbols"] == []
    assert body["abbreviations"] == {}
    assert body["confidence"] == 0.0
    assert body["mock"] is False
    assert body["review_required"] is True


def test_legend_configured_returns_symbols_with_requested_sheet_id(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    _FakeLegendScanner.calls = []
    monkeypatch.setattr(routes, "LegendScanner", _FakeLegendScanner)
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF, "page_index": 2}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Scanner-derived id must not leak; the requested sheet id is the contract.
    assert body["sheet_id"] == SHEET_ID
    assert body["legend_detected"] is True
    assert len(body["symbols"]) == 1
    assert body["symbols"][0]["bounding_box_pt"] == [410.0, 110.0, 450.0, 150.0]
    assert body["abbreviations"] == {"AHU": "Air Handling Unit"}
    # Provided page_index is used as-is.
    assert _FakeLegendScanner.calls[0][1] == 2


def test_legend_page_index_defaults_to_stored_sheet_page(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    _FakeLegendScanner.calls = []
    monkeypatch.setattr(routes, "LegendScanner", _FakeLegendScanner)
    res = configured_client.post(f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF})
    assert res.status_code == 200, res.text
    # Seeded sheet stores page_index 0.
    assert _FakeLegendScanner.calls[0][1] == 0


def test_legend_out_of_range_page_index_is_400(configured_client: TestClient):
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend",
        json={"pdf_path": FIXTURE_PDF, "page_index": 999},
    )
    assert res.status_code == 400, res.text


def test_legend_scanner_runtime_error_is_502(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    class _BoomScanner:
        def __init__(self, client=None) -> None:
            self.client = client

        def scan_sheet(self, pdf_path: str, page_index: int = 0) -> LegendScanResult:
            raise RuntimeError("scanner exploded")

    monkeypatch.setattr(routes, "LegendScanner", _BoomScanner)
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 502, res.text
    # Fail-closed: an error never becomes a fabricated legend.
    assert "symbols" not in res.json()


def test_legend_scanner_construction_unexpected_error_is_502(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    class _CtorBoomScanner:
        def __init__(self, client=None) -> None:
            raise TypeError("scanner ctor exploded")

    monkeypatch.setattr(routes, "LegendScanner", _CtorBoomScanner)
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 502, res.text
    assert "symbols" not in res.json()


def test_legend_scanner_unexpected_error_is_502(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    class _TypeBoomScanner:
        def __init__(self, client=None) -> None:
            self.client = client

        def scan_sheet(self, pdf_path: str, page_index: int = 0) -> LegendScanResult:
            raise TypeError("scanner scan exploded")

    monkeypatch.setattr(routes, "LegendScanner", _TypeBoomScanner)
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 502, res.text
    assert "symbols" not in res.json()


def test_legend_scanner_value_error_still_is_400(
    configured_client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    class _ValueBoomScanner:
        def __init__(self, client=None) -> None:
            self.client = client

        def scan_sheet(self, pdf_path: str, page_index: int = 0) -> LegendScanResult:
            raise ValueError("page index out of range")

    monkeypatch.setattr(routes, "LegendScanner", _ValueBoomScanner)
    res = configured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 400, res.text


def test_legend_store_get_sheet_error_is_502(
    unconfigured_client: TestClient,
    isolated_takeoff_store,
    monkeypatch: pytest.MonkeyPatch,
):
    async def _boom_get_sheet(sheet_id: str):
        raise RuntimeError("sheet store exploded")

    monkeypatch.setattr(isolated_takeoff_store, "get_sheet", _boom_get_sheet)
    res = unconfigured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 502, res.text
    assert "symbols" not in res.json()


def test_legend_corrupt_stored_page_index_is_400(
    unconfigured_client: TestClient,
    isolated_takeoff_store,
    monkeypatch: pytest.MonkeyPatch,
):
    async def _corrupt_get_sheet(sheet_id: str):
        return {"sheet_id": sheet_id, "page_index": "not-a-number"}

    monkeypatch.setattr(isolated_takeoff_store, "get_sheet", _corrupt_get_sheet)
    res = unconfigured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 400, res.text


def test_legend_none_stored_page_index_is_400(
    unconfigured_client: TestClient,
    isolated_takeoff_store,
    monkeypatch: pytest.MonkeyPatch,
):
    async def _none_get_sheet(sheet_id: str):
        return {"sheet_id": sheet_id, "page_index": None}

    monkeypatch.setattr(isolated_takeoff_store, "get_sheet", _none_get_sheet)
    res = unconfigured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": FIXTURE_PDF}
    )
    assert res.status_code == 400, res.text


def test_legend_negative_page_index_is_422(seeded_client: TestClient):
    res = seeded_client.post(
        f"/api/sheets/{SHEET_ID}/legend",
        json={"pdf_path": FIXTURE_PDF, "page_index": -1},
    )
    assert res.status_code == 422, res.text


def test_legend_rejects_pdf_outside_containment(unconfigured_client: TestClient):
    res = unconfigured_client.post(
        f"/api/sheets/{SHEET_ID}/legend", json={"pdf_path": "../outside.pdf"}
    )
    assert res.status_code == 403, res.text
