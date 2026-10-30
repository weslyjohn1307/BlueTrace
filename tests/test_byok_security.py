from __future__ import annotations

from starlette.testclient import TestClient

from src.api.main import app


def test_byok_runtime_session():
    client = TestClient(app)

    # 1. Clear any preexisting key
    client.delete("/api/auth/byok")
    health_before = client.get("/api/health").json()
    assert health_before["meta_model_api_configured"] is False

    # 2. Configure real-style test key via POST body (never query params)
    secret_key = "mk-prod-test-meta-supersecret-9876"
    res = client.post("/api/auth/byok", json={"api_key": secret_key})
    assert res.status_code == 200
    data = res.json()
    assert data["configured"] is True
    # Masked verification: must show only last 4 digits
    assert data["masked_key"] == "••••9876"
    assert secret_key not in data["masked_key"]

    # 3. Health check now reports configured
    health_after = client.get("/api/health").json()
    assert health_after["meta_model_api_configured"] is True

    # 4. Clear key on session reset
    del_res = client.delete("/api/auth/byok")
    assert del_res.status_code == 200
    assert del_res.json()["cleared"] is True

    health_reset = client.get("/api/health").json()
    assert health_reset["meta_model_api_configured"] is False


def test_byok_empty_rejected():
    client = TestClient(app)
    res = client.post("/api/auth/byok", json={"api_key": "   "})
    assert res.status_code == 400
