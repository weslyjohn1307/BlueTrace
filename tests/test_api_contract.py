"""API contract tests.

Two layers:

1. ``test_every_client_endpoint_exists`` — parses the **frontend** API client and
   asserts every endpoint it can call exists on the FastAPI app. Strict: any
   client path without a backend counterpart fails (this is the test that would
   have caught the ``/api/v1`` vs ``/api`` split).
2. ``test_backend_endpoints_respond`` — integration smoke test over the live
   endpoints, using an isolated database.
"""

from __future__ import annotations

import base64
import json
import re
import shutil
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.api.main import app

CLIENT_TS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "api" / "client.ts"

BASE_URL_DEFAULT = "/api"
# Quoted strings that look like paths but are not endpoints.
NON_ENDPOINTS = {BASE_URL_DEFAULT}


def _normalise_client_path(raw: str) -> str:
    """Mirror ``request()`` in client.ts: absolute paths pass through untouched."""
    path = raw.split("?")[0]
    path = re.split(r"\$\{qs", path)[0]
    path = re.sub(r"\$\{[^}]*\}", "{param}", path).rstrip("/")
    return path or "/"


def _normalise_backend_path(path: str) -> str:
    path = re.sub(r"\{[^}]+\}", "{param}", path).rstrip("/")
    return path or "/"


def client_endpoints() -> set[str]:
    source = CLIENT_TS.read_text(encoding="utf-8")
    # Drop line comments so doc examples like `/api/...` are not parsed as calls.
    source = re.sub(r"^\s*//.*$", "", source, flags=re.MULTILINE)
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
    assert not missing, (
        "Frontend calls endpoints the backend does not expose:\n  "
        + "\n  ".join(sorted(missing))
    )


def test_no_dead_namespace_in_client():
    """The retired /api/v1 project/run/job surface must never come back."""
    source = CLIENT_TS.read_text(encoding="utf-8")
    assert "/api/v1" not in source


def test_client_base_url_matches_backend_prefix():
    source = CLIENT_TS.read_text(encoding="utf-8")
    assert 'router = APIRouter(prefix="/api")' in (
        Path(__file__).resolve().parents[1] / "src" / "api" / "routes.py"
    ).read_text(encoding="utf-8")
    assert 'VITE_API_BASE_URL || "/api"' in source.replace("'", '"') or '"/api"' in source


@pytest.fixture()
def client(isolated_takeoff_store) -> TestClient:
    _ = isolated_takeoff_store
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


_MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF"


def test_upload_accepts_raw_pdf_bytes(client: TestClient):
    """Frontend contract: raw file body + ?filename= (multipart is rejected by design)."""
    res = client.post(
        "/api/upload?filename=plan.pdf",
        content=_MINIMAL_PDF,
        headers={"Content-Type": "application/pdf"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == "plan.pdf"
    assert body["byte_size"] == len(_MINIMAL_PDF)
    assert body["file_path"].startswith("data/uploads/")


def test_upload_accepts_json_base64(client: TestClient):
    res = client.post(
        "/api/upload",
        json={"filename": "plan.pdf", "file_base64": base64.b64encode(_MINIMAL_PDF).decode()},
    )
    assert res.status_code == 200
    assert res.json()["filename"] == "plan.pdf"


def test_upload_rejects_non_pdf(client: TestClient):
    res = client.post(
        "/api/upload?filename=notes.txt",
        content=b"not a pdf",
        headers={"Content-Type": "text/plain"},
    )
    assert res.status_code == 400


def test_upload_rejects_fake_pdf(client: TestClient):
    res = client.post(
        "/api/upload?filename=fake.pdf",
        content=b"PK\x03\x04 zip disguised as pdf",
        headers={"Content-Type": "application/pdf"},
    )
    assert res.status_code == 400


def test_project_session_endpoints(client: TestClient):
    # Unknown project fails closed with 404 on both read and write paths.
    missing = client.get("/api/projects/missing_proj/session")
    assert missing.status_code == 404
    missing_put = client.put(
        "/api/projects/missing_proj/session",
        json={
            "project_id": "missing_proj",
            "viewport_scale": 1.0,
            "viewport_tx": 0.0,
            "viewport_ty": 0.0,
            "active_tool_mode": "select",
        },
    )
    assert missing_put.status_code == 404

    # Seed a project with one sheet through the store-backed scan path.
    scan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "sess_proj",
        },
    )
    assert scan.status_code == 200
    sheet_id = scan.json()["sheet_id"]

    projects = client.get("/api/projects")
    assert projects.status_code == 200
    entry = next(p for p in projects.json() if p["project_id"] == "sess_proj")
    assert entry["sheet_count"] >= 1

    # Defaults on first read.
    first = client.get("/api/projects/sess_proj/session")
    assert first.status_code == 200
    body = first.json()
    assert body["session"]["viewport_scale"] == 1.0
    assert body["session"]["project_id"] == "sess_proj"
    assert any(s["sheet_id"] == sheet_id for s in body["sheets"])
    assert "summary" in body

    # Save viewport coordinates and tool mode.
    saved = client.put(
        "/api/projects/sess_proj/session",
        json={
            "project_id": "sess_proj",
            "active_sheet_id": sheet_id,
            "viewport_scale": 1.45,
            "viewport_tx": 240.0,
            "viewport_ty": -120.0,
            "active_tool_mode": "pan",
        },
    )
    assert saved.status_code == 200
    assert saved.json()["session"]["viewport_scale"] == 1.45

    # Re-read returns the persisted viewport and active sheet.
    reread = client.get("/api/projects/sess_proj/session")
    assert reread.status_code == 200
    session = reread.json()["session"]
    assert session["viewport_scale"] == 1.45
    assert session["viewport_tx"] == 240.0
    assert session["viewport_ty"] == -120.0
    assert session["active_sheet_id"] == sheet_id


def test_project_session_viewport_scale_rejected(client: TestClient):
    """Fail-closed: viewport_scale <= 0 is a 422 and persists nothing (WS4 MEDIUM1)."""
    scan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "sess_scale_proj",
        },
    )
    assert scan.status_code == 200

    for bad_scale in (0.0, -1.45):
        rejected = client.put(
            "/api/projects/sess_scale_proj/session",
            json={
                "project_id": "sess_scale_proj",
                "viewport_scale": bad_scale,
                "viewport_tx": 240.0,
                "viewport_ty": -120.0,
                "active_tool_mode": "pan",
            },
        )
        assert rejected.status_code == 422

    # The rejected writes persisted nothing: defaults are untouched.
    reread = client.get("/api/projects/sess_scale_proj/session")
    assert reread.status_code == 200
    assert reread.json()["session"]["viewport_scale"] == 1.0
def test_intake_sse_stream(client: TestClient):
    """TASK-INTK-003: batch intake persists sheets and replays progress over SSE."""
    res = client.post(
        "/api/intake/batch",
        json={"pdf_path": "fixtures/mechanical/avexis_page_22.pdf"},
    )
    assert res.status_code == 200
    body = res.json()
    job_id = body["job_id"]
    assert body["status"] == "complete"
    assert body["sheets_indexed"] >= 1
    assert body["thumbnails_ready"] >= 1

    stream = client.get(f"/api/intake/jobs/{job_id}/events")
    assert stream.status_code == 200
    assert "text/event-stream" in stream.headers["content-type"]
    events = [
        json.loads(line[len("data:"):].strip())
        for line in stream.text.splitlines()
        if line.startswith("data:")
    ]
    assert events, "SSE stream must replay at least one event"
    kinds = [e["event"] for e in events]
    assert "progress" in kinds
    assert "sheet_indexed" in kinds
    assert "thumbnail_ready" in kinds
    assert kinds[-1] == "complete"
    assert all(e["job_id"] == job_id for e in events)
    assert all(e["event"] in ("progress", "sheet_indexed", "thumbnail_ready", "complete") for e in events)

    missing = client.get("/api/intake/jobs/does-not-exist/events")
    assert missing.status_code == 404


def test_intake_batch_rejects_unsafe_project_id(client: TestClient):
    """project_id becomes a cache directory name: traversal must be a 400."""
    for unsafe in ("../../evil", "..\\..\\evil", "a/b", "a\\b", "..", "", "C:\\abs"):
        res = client.post(
            "/api/intake/batch",
            json={
                "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
                "project_id": unsafe,
            },
        )
        assert res.status_code == 400, f"{unsafe!r} was accepted"
        assert "project_id" in res.json()["detail"].lower()
    # Nothing escaped the cache root and no job was registered for the rejects.
    assert not (Path.cwd().parent / "evil").exists()

    # A normal id still runs and writes thumbnails under its own directory.
    thumb_dir = Path("data/cache/thumbnails/safe_project-1")
    try:
        ok = client.post(
            "/api/intake/batch",
            json={
                "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
                "project_id": "safe_project-1",
            },
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body["status"] == "complete"
        assert body["project_id"] == "safe_project-1"
        assert body["thumbnails_ready"] >= 1
        assert thumb_dir.is_dir()
    finally:
        shutil.rmtree(thumb_dir, ignore_errors=True)


def test_intake_job_registry_is_bounded():
    """The in-memory registry keeps only the most recent 25 jobs."""
    from src.api.routes import (
        _MAX_INTAKE_JOBS,
        _intake_jobs,
        _register_intake_job,
        _reset_intake_jobs,
    )

    _reset_intake_jobs()
    try:
        for i in range(_MAX_INTAKE_JOBS + 10):
            _register_intake_job(f"job_{i:03d}", {"status": None, "events": []})
        assert len(_intake_jobs) == _MAX_INTAKE_JOBS
        assert "job_000" not in _intake_jobs
        assert f"job_{_MAX_INTAKE_JOBS + 9:03d}" in _intake_jobs
        # Most recent survive; insertion order evicts from the front.
        assert list(_intake_jobs)[-1] == f"job_{_MAX_INTAKE_JOBS + 9:03d}"
    finally:
        _reset_intake_jobs()


def test_intake_failing_job_emits_error_terminal(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    """An unexpected job-runner exception fails the job and ends SSE with ``error``."""
    from src.api import routes
    from src.meta_services.sheet_scanner import SheetScanner

    def _boom(self, *args, **kwargs):
        raise RuntimeError("reconnaissance exploded")

    monkeypatch.setattr(SheetScanner, "scan_package_reconnaissance", _boom, raising=True)
    res = client.post(
        "/api/intake/batch",
        json={"pdf_path": "fixtures/mechanical/avexis_page_22.pdf", "project_id": "boom_proj"},
    )
    assert res.status_code == 502
    assert "reconnaissance exploded" in res.json()["detail"]

    # The failed job is still addressable and replays a terminal error frame.
    failing = [
        job_id
        for job_id, job in routes._intake_jobs.items()
        if job["status"].project_id == "boom_proj"
    ]
    assert len(failing) == 1
    job = routes._intake_jobs[failing[0]]
    assert job["status"].status == "failed"
    assert job["status"].error == "reconnaissance exploded"

    stream = client.get(f"/api/intake/jobs/{failing[0]}/events")
    assert stream.status_code == 200
    events = [
        json.loads(line[len("data:"):].strip())
        for line in stream.text.splitlines()
        if line.startswith("data:")
    ]
    assert events, "a failed job must still replay a terminal frame"
    assert events[-1]["event"] == "error"
    assert "reconnaissance exploded" in (events[-1]["message"] or "")


def test_intake_sse_always_terminates(client: TestClient):
    """A job with no terminal event yet still closes its stream with ``error``."""
    from src.api import routes
    from src.models.schemas import IntakeJobStatus

    _register = routes._register_intake_job
    job_id = "stuckjob0001"
    _register(
        job_id,
        {
            "status": IntakeJobStatus(
                job_id=job_id,
                status="running",
                project_id="stuck_proj",
                pdf_path="fixtures/mechanical/avexis_page_22.pdf",
            ),
            "events": [],
        },
    )
    try:
        stream = client.get(f"/api/intake/jobs/{job_id}/events")
        assert stream.status_code == 200
        events = [
            json.loads(line[len("data:"):].strip())
            for line in stream.text.splitlines()
            if line.startswith("data:")
        ]
        assert len(events) == 1
        assert events[-1]["event"] == "error"
    finally:
        routes._intake_jobs.pop(job_id, None)


def test_thumbnail_endpoint_serves_cached_webp(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """GET /api/thumbnails/{project_id}/p{page}.webp serves the intake cache.

    Same project_id validator as the writer (400, never a traversal read),
    404 for unknown pages, PNG fallback when the build wrote ``.png``.
    """
    import asyncio as _asyncio

    import pymupdf as _pymupdf

    from src.meta_services.thumbnail_generator import generate_sheet_thumbnails_async

    pdf_path = tmp_path / "thumb_serve.pdf"
    doc = _pymupdf.open()
    try:
        doc.new_page(width=612, height=792)
        doc.save(str(pdf_path))
    finally:
        doc.close()
    # The cache root is relative ("data/cache/thumbnails"), so generate under
    # an isolated cwd and serve from the same cwd.
    monkeypatch.chdir(tmp_path)
    _asyncio.run(generate_sheet_thumbnails_async(str(pdf_path), "thumb_serve", dpi=24, max_workers=1))

    hit = client.get("/api/thumbnails/thumb_serve/p0.webp")
    assert hit.status_code == 200
    assert hit.headers["content-type"] == "image/webp"
    assert len(hit.content) > 0

    assert client.get("/api/thumbnails/thumb_serve/p9.webp").status_code == 404
    assert client.get("/api/thumbnails/..evil/p0.webp").status_code == 400
    assert client.get("/api/thumbnails/no_such_proj/p0.webp").status_code == 404


def test_feedback_events_crop_project_guard_and_nulls(
    client: TestClient,
    isolated_takeoff_store,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    """POST /api/feedback/events: crop wiring, orphan guards, NULL semantics.

    HIGH#2: bbox + known sheet captures a 150 DPI crop (non-null relpath,
    file on disk); unknown sheet skips the crop but still persists (200).
    HIGH#3: unknown project is a 404 and persists nothing.
    MED#7: omitted original_output stays NULL; degenerate bbox is a 422.
    """
    import asyncio as _asyncio

    import src.meta_services.feedback_service as _feedback_service

    scan = client.post(
        "/api/sheet-scan",
        json={
            "pdf_path": "fixtures/mechanical/avexis_page_22.pdf",
            "page_index": 0,
            "project_id": "fdbk_route_proj",
        },
    )
    assert scan.status_code == 200
    sheet_id = scan.json()["sheet_id"]

    # Keep the 150 DPI crop out of the repo checkout.
    monkeypatch.setattr(
        _feedback_service, "FEEDBACK_CROP_ROOT", tmp_path / "crops"
    )

    def _post(payload: dict) -> object:
        return client.post("/api/feedback/events", json=payload)

    def _stored(feedback_id: str) -> dict:
        row = _asyncio.run(isolated_takeoff_store.get_feedback_event(feedback_id))
        assert row is not None
        return row

    base = {
        "project_id": "fdbk_route_proj",
        "sheet_id": sheet_id,
        "task_type": "SYMBOL_DETECTION",
        "previous_status": "SUGGESTED",
        "new_status": "ACCEPTED",
    }

    # bbox + known sheet -> crop captured, relpath persisted, file on disk.
    ok = _post(
        {
            **base,
            "action": "ACCEPT",
            "bounding_box_pt": [10.0, 10.0, 200.0, 200.0],
            "page_index": 0,
            "original_output": {"symbol_label": "VAV-1"},
        }
    )
    assert ok.status_code == 200
    stored = _stored(ok.json()["feedback_id"])
    assert stored["training_eligible"] == 0
    assert stored["crop_storage_relpath"] is not None
    assert (tmp_path / stored["crop_storage_relpath"]).is_file()
    assert stored["original_output_json"] is not None

    # Omitted original_output stays NULL (never the fabricated "{}").
    minimal = _post({**base, "action": "ACCEPT"})
    assert minimal.status_code == 200
    assert _stored(minimal.json()["feedback_id"])["original_output_json"] is None

    # Unknown sheet on a known project: event persists, crop skipped (NULL).
    ghost = _post({**base, "sheet_id": "no_such_sheet", "action": "REJECT"})
    assert ghost.status_code == 200
    assert _stored(ghost.json()["feedback_id"])["crop_storage_relpath"] is None

    # Unknown project: 404, nothing persisted.
    orphan = _post({**base, "project_id": "no_such_proj", "action": "ACCEPT"})
    assert orphan.status_code == 404

    # Degenerate bbox (zero area) is a 422 and persists nothing.
    bad = _post({**base, "action": "ACCEPT", "bounding_box_pt": [10.0, 10.0, 10.0, 200.0]})
    assert bad.status_code == 422

    # Negative page_index is a 422.
    bad_page = _post(
        {
            **base,
            "action": "ACCEPT",
            "bounding_box_pt": [10.0, 10.0, 200.0, 200.0],
            "page_index": -1,
        }
    )
    assert bad_page.status_code == 422