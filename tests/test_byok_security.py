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


def test_byok_opt_out_is_session_scoped():
    """One session clearing its key must not disable the server for everyone."""
    client = TestClient(app)
    client.post("/api/auth/byok", json={"api_key": "mk-operator-key-1111"})

    assert client.get("/api/health").json()["meta_model_api_configured"] is True

    client.delete("/api/auth/byok", headers={"X-Session-ID": "sess-a"})

    # The caller that opted out is unconfigured...
    session_a = client.get("/api/health", headers={"X-Session-ID": "sess-a"})
    assert session_a.json()["meta_model_api_configured"] is False

    # ...but every other session keeps working.
    assert client.get("/api/health").json()["meta_model_api_configured"] is True
    other = client.get("/api/health", headers={"X-Session-ID": "sess-b"})
    assert other.json()["meta_model_api_configured"] is True


def test_byok_key_is_never_echoed():
    client = TestClient(app)
    secret = "mk-never-echo-this-4321"
    body = client.post("/api/auth/byok", json={"api_key": secret}).text
    assert secret not in body

