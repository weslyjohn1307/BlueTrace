"""API contract tests.

Two layers:

1. ``test_every_client_endpoint_exists`` — parses the **frontend** API client and
   asserts every endpoint it can call exists on the FastAPI app. This is the test
   that would have caught the ``/api/v1`` vs ``/api`` split.
2. ``test_backend_endpoints_respond`` — integration smoke test over the live
   endpoints, using an isolated database.

The legacy project/run/job surface is real debt, not a mock: it is listed in
``LEGACY_DEAD`` and the test **ratchets** — the list may shrink, never grow.
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.api.main import app

CLIENT_TS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "api" / "client.ts"

# Client endpoints with no backend counterpart. All of them belong to the retired
# Imagineers project/run/job/exports API. Migrate or delete; do not add here.
LEGACY_DEAD: frozenset[str] = frozenset(
    {
        "/api/v1/health",
        "/api/v1/version",
        "/api/v1/projects",
        "/api/v1/projects/{param}",
        "/api/v1/projects/{param}/drawings",
        "/api/v1/projects/{param}/drawings/{param}",
        "/api/v1/projects/{param}/drawings/{param}/preflight",
        "/api/v1/projects/{param}/jobs",
        "/api/v1/projects/{param}/jobs/{param}",
        "/api/v1/projects/{param}/runs/{param}",
        "/api/v1/projects/{param}/runs/{param}/copilot/query",
        "/api/v1/projects/{param}/runs/{param}/exports",
        "/api/v1/projects/{param}/runs/{param}/objects",
        "/api/v1/projects/{param}/runs/{param}/pages/{param}/image",
        "/api/v1/projects/{param}/runs/{param}/pages/{param}/thumbnail",
        "/api/v1/projects/{param}/runs/{param}/review-events",
        "/api/v1/projects/{param}/runs/{param}/routes",
        "/api/v1/projects/{param}/runs/{param}/sheets",
        "/api/v1/projects/{param}/runs/{param}/summary",
        "/api/v1/projects/{param}/runs/{param}/views/{param}",
        "/api/v1/runs",
        "/api/v1/runs/{param}",
    }
)

BASE_URL_DEFAULT = "/api/v1"
NON_ENDPOINTS = {BASE_URL_DEFAULT, "/${cleanEndpoint}"}


def _normalise_client_path(raw: str) -> str:
    """Mirror ``request()`` in client.ts: absolute ``api/`` wins, else baseUrl."""
    path = raw.split("?")[0]
    path = re.split(r"\$\{qs", path)[0]
    path = re.sub(r"\$\{[^}]*\}", "{param}", path).rstrip("/")
    clean = path.lstrip("/")
    if clean.startswith("api/"):
        return "/" + clean
    return f"{BASE_URL_DEFAULT}/{clean}"


def _normalise_backend_path(path: str) -> str:
    path = re.sub(r"\{[^}]+\}", "{param}", path).rstrip("/")
    return path or "/"


def client_endpoints() -> set[str]:
    source = CLIENT_TS.read_text(encoding="utf-8")
    literals = re.findall(r"[`'\"]\s*(/[^`'\"]*?)\s*[`'\"]", source)
    return {
        _normalise_client_path(literal)
        for literal in literals
        if literal not in NON_ENDPOINTS
    }


def backend_endpoints() -> set[str]:
    return {_normalise_backend_path(p) for p in app.openapi()["paths"]}


def test_every_client_endpoint_exists():
    missing = client_endpoints() - backend_endpoints()

    assert client_endpoints(), "Failed to parse any endpoints from client.ts"
    unexpected = missing - LEGACY_DEAD
    assert not unexpected, (
        "Frontend calls endpoints the backend does not expose:\n  "
        + "\n  ".join(sorted(unexpected))
    )


def test_legacy_debt_only_shrinks():
    """Ratchet: migrating an endpoint must delete its line in LEGACY_DEAD."""
    missing = client_endpoints() - backend_endpoints()
    assert missing == LEGACY_DEAD, (
        f"Legacy endpoint list is stale. Still dead: {sorted(missing)}. "
        f"Declared: {sorted(LEGACY_DEAD)}"
    )


def test_client_base_url_matches_backend_prefix():
    source = CLIENT_TS.read_text(encoding="utf-8")
    assert "router = APIRouter(prefix=\"/api\")" in Path(
        __file__
    ).resolve().parents[1].joinpath("src/api/routes.py").read_text(encoding="utf-8")
    assert BASE_URL_DEFAULT in source


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def test_backend_endpoints_respond(client: TestClient):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "online"

    scan = client.post(
        "/api/sheet-scan",
        json={"pdf_path": "fixtures/mechanical/avexis_page_22.pdf", "page_index": 0},
    )
    assert scan.status_code == 200
    assert scan.json()["scale_status"] in ("VERIFIED", "UNVERIFIED", "CALIBRATED")


def test_sheet_scan_rejects_path_traversal(client: TestClient):
    bad = client.post(
        "/api/sheet-scan",
        json={"pdf_path": "../../Windows/System32/calc.exe", "page_index": 0},
    )
    assert bad.status_code == 403


def test_crop_ocr_fails_closed_without_a_key(client: TestClient):
    """Offline stub must never report a verified dimension."""
    res = client.post(
        "/api/crop-ocr",
        json={
            "sheet_id": "contract_sheet",
            "cursor_pt": [100.0, 100.0],
            "crop_size_pt": 150.0,
            "image_base64": base64.b64encode(b"dummy_crop").decode("ascii"),
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["review_required"] is True
    assert body["confidence"] == 0.0


def test_takeoff_ledger_roundtrip(client: TestClient):
    created = client.post(
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
    assert created.status_code == 200
    item_id = created.json()["item_id"]

    listed = client.get("/api/takeoff/items?sheet_id=contract_sheet")
    assert any(i["item_id"] == item_id for i in listed.json())

    accepted = client.patch(
        f"/api/takeoff/items/{item_id}/status",
        json={"status": "ACCEPTED", "action": "ONE_CLICK_ACCEPT"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACCEPTED"

    summary = client.get("/api/takeoff/summary?sheet_id=contract_sheet")
    assert summary.status_code == 200
    assert len(summary.json()) >= 1

    csv = client.get("/api/takeoff/export/csv?sheet_id=contract_sheet")
    assert csv.status_code == 200
    assert "text/csv" in csv.headers["content-type"]

    payload = client.get("/api/takeoff/export/json?sheet_id=contract_sheet")
    assert payload.status_code == 200
    assert "line_items" in payload.json()


def test_copilot_offline_fallback_is_labelled(client: TestClient):
    res = client.post(
        "/api/copilot",
        json={"sheet_id": "contract_sheet", "query": "What is the scale?"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["scale_verified"] is False
    assert body["model_used"] is False


def test_dimension_shape_coercion_fail_closed():
    from src.models.schemas import DimensionExtraction

    assert DimensionExtraction(width_in=10.0, shape="circular").shape == "ROUND"
    assert DimensionExtraction(width_in=10.0, shape="flat-oval").shape == "OVAL"
    assert DimensionExtraction(width_in=10.0, shape="square").shape == "RECTANGULAR"
    # Unanticipated VLM output safely defaults to RECTANGULAR without throwing validation error
    assert DimensionExtraction(width_in=10.0, shape="nonstandard_polygon_3d").shape == "RECTANGULAR"
