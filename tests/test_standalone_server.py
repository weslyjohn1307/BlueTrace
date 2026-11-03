"""Tests for BlueTraceAI single-port standalone server.

Verifies:
- Root path GET / serves frontend HTML SPA.
- Swagger docs GET /docs serves API documentation.
- REST API GET /api/health returns JSON health payload.
- API 404 isolation: GET /api/nonexistent returns JSON 404 (not HTML SPA fallback).
- SPA fallback: Client-side workspace routes GET /workspace/sheet-1 return HTML index.
- Static asset serving: Files under /assets/* return correct static files.
"""

import pytest
from fastapi.testclient import TestClient

from src.api.main import FRONTEND_DIST, app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_standalone_root_serves_html(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "").lower()
    assert "<!doctype html>" in response.text.lower() or "<html" in response.text.lower()


def test_standalone_docs_serves_swagger(client: TestClient) -> None:
    response = client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "").lower()
    assert "swagger" in response.text.lower()


def test_standalone_api_health_returns_json(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "application/json" in response.headers.get("content-type", "").lower()
    data = response.json()
    assert data.get("status") == "online"
    assert "service" in data


def test_standalone_api_nonexistent_returns_404_json(client: TestClient) -> None:
    response = client.get("/api/nonexistent")
    assert response.status_code == 404
    assert "application/json" in response.headers.get("content-type", "").lower()
    data = response.json()
    assert data.get("detail") == "Not Found"
    assert "<!doctype html>" not in response.text.lower()


def test_standalone_nested_api_nonexistent_returns_404_json(client: TestClient) -> None:
    response = client.get("/api/v1/unknown/nested/endpoint")
    assert response.status_code == 404
    assert "application/json" in response.headers.get("content-type", "").lower()
    data = response.json()
    assert data.get("detail") == "Not Found"


def test_standalone_workspace_spa_fallback(client: TestClient) -> None:
    response = client.get("/workspace/sheet-1")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "").lower()
    assert "<!doctype html>" in response.text.lower() or "<html" in response.text.lower()


def test_standalone_static_asset_serving(client: TestClient) -> None:
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        files = list(assets_dir.glob("*.js"))
        if files:
            sample_asset = files[0].name
            response = client.get(f"/assets/{sample_asset}")
            assert response.status_code == 200
            assert len(response.content) > 0


def test_crop_ocr_endpoint_caching_and_sub_10ms_repeat(client: TestClient) -> None:
    """Repeated crop-ocr queries hit the SHA-256 LRU cache and return in <10ms."""
    import base64
    import time

    from src.api.routes import clear_crop_ocr_cache

    clear_crop_ocr_cache()
    # Minimal PNG image encoded as base64
    dummy_b64 = base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    ).decode("ascii")
    payload = {
        "image_base64": dummy_b64,
        "sheet_id": "test_sheet",
        "cursor_pt": [100.0, 200.0],
    }

    # Warm up client transport
    client.post("/api/crop-ocr", json=payload)
    clear_crop_ocr_cache()

    # First call (cold)
    resp1 = client.post("/api/crop-ocr", json=payload)
    assert resp1.status_code == 200
    data1 = resp1.json()

    # Second call (warm cache hit)
    t0 = time.perf_counter()
    resp2 = client.post("/api/crop-ocr", json=payload)
    t1 = time.perf_counter()

    roundtrip_ms = (t1 - t0) * 1000.0
    assert resp2.status_code == 200
    data2 = resp2.json()

    assert data1["detected_text"] == data2["detected_text"]
    assert data1["badge_text"] == data2["badge_text"]
    assert data2["latency_ms"] < 10, f"Expected internal cache latency <10ms, got {data2['latency_ms']}ms"
    assert roundtrip_ms < 100.0, f"Expected testclient roundtrip <100ms, got {roundtrip_ms}ms"

