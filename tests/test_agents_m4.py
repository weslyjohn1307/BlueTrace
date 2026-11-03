"""Milestone 4: agent API wiring + full-loop system verification.

Covers the M4 HTTP surface (orchestrate / reconcile / watchdog / QA feed)
and the end-to-end loop: orchestrate a real plan fixture, orchestrate a
synthetic schedule sheet, reconcile schedule-vs-plan, run watchdog QA over
the ledger, and dispose every annotation through the human gate.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from src.api.main import app

HVAC_PDF = "fixtures/mechanical/hvac_plan_level2.pdf"


def _schedule_pdf(path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=1000, height=800)
    page.insert_text((100, 100), "EQUIPMENT SCHEDULE M-601")
    for i, line in enumerate(["VAV-01 450 CFM", "VAV-02 650 CFM", "EF-1 1200 CFM"]):
        page.insert_text((100, 150 + i * 30), line)
    doc.save(str(path))
    doc.close()


@pytest.fixture()
def api_client(isolated_takeoff_store):
    _ = isolated_takeoff_store  # throwaway DB injected via set_takeoff_store
    return TestClient(app)


@pytest.fixture()
def schedule_pdf_path():
    target = Path("data/uploads") / f"test_m4_sched_{uuid.uuid4().hex[:8]}.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    _schedule_pdf(target)
    yield f"data/uploads/{target.name}"
    target.unlink(missing_ok=True)


class TestAgentEndpointContracts:
    def test_orchestrate_rejects_bad_paths(self, api_client: TestClient) -> None:
        r = api_client.post(
            "/api/agents/orchestrate", json={"file_path": "D:/x.pdf", "project_id": "p1"}
        )
        assert r.status_code == 403
        r = api_client.post(
            "/api/agents/orchestrate",
            json={"file_path": "data/uploads/does_not_exist.pdf", "project_id": "p1"},
        )
        assert r.status_code == 404
        r = api_client.post(
            "/api/agents/orchestrate", json={"file_path": HVAC_PDF, "project_id": "../x"}
        )
        assert r.status_code == 400
        r = api_client.post(
            "/api/agents/orchestrate", json={"file_path": "pyproject.toml", "project_id": "p1"}
        )
        assert r.status_code == 403

    def test_reconcile_unknown_plan_sheets(self, api_client: TestClient) -> None:
        r = api_client.post(
            "/api/agents/reconcile",
            json={"project_id": "p1", "file_path": HVAC_PDF, "plan_sheet_ids": ["nope"]},
        )
        assert r.status_code == 400

    def test_watchdog_bad_project(self, api_client: TestClient) -> None:
        r = api_client.post("/api/agents/watchdog", json={"project_id": "../x"})
        assert r.status_code == 400

    def test_qa_patch_missing(self, api_client: TestClient) -> None:
        r = api_client.patch("/api/qa/annotations/does-not-exist", json={"status": "CONFIRMED"})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_qa_dismiss_requires_reason(
        self, api_client: TestClient, isolated_takeoff_store
    ) -> None:
        ann_id = await isolated_takeoff_store.record_qa_annotation(
            project_id="p1",
            annotation_type="FLAG",
            reason_code="ORPHAN_RUN",
            severity="WARNING",
        )
        r = api_client.patch(f"/api/qa/annotations/{ann_id}", json={"status": "DISMISSED"})
        assert r.status_code == 400


class TestFullLoop:
    def test_orchestrate_reconcile_watchdog_resolve(
        self, api_client: TestClient, schedule_pdf_path: str
    ) -> None:
        project = "m4_full"
        # 1. Orchestrate the real plan fixture (offline client in tests).
        r = api_client.post(
            "/api/agents/orchestrate", json={"file_path": HVAC_PDF, "project_id": project}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["sheets_processed"] == 1
        assert body["routes"][0]["sheet_type"] == "plan"
        # Pinned M1 contract: the routing table records v1 alias IDs (registry resolves them).
        assert body["routes"][0]["target_agents"] == ["agent_02_finder", "agent_03_tracer"]
        # Behavioral proof both agents ran: tracer persisted runs, finder reached
        # legend parsing and raised NO_LEGEND_FOUND on the legendless fixture.
        assert any("NO_LEGEND" in str(f.get("type", "")) for f in body["flags"])
        items = api_client.get("/api/takeoff/items", params={"project_id": project}).json()
        assert len(items) >= 300

        # 2. Orchestrate the schedule sheet (04 runs inline; emits no ledger items).
        r = api_client.post(
            "/api/agents/orchestrate", json={"file_path": schedule_pdf_path, "project_id": project}
        )
        assert r.status_code == 200
        assert r.json()["sheets_processed"] == 1
        assert r.json()["routes"][0]["sheet_type"] == "schedule"
        assert r.json()["routes"][0]["target_agents"] == ["agent_04_reconciler"]
        items2 = api_client.get("/api/takeoff/items", params={"project_id": project}).json()
        assert len(items2) == len(items)

        # 3. Reconcile on demand (indexed mode: schedule sheet found in store).
        r = api_client.post(
            "/api/agents/reconcile",
            json={"project_id": project, "file_path": schedule_pdf_path, "page_index": 0},
        )
        assert r.status_code == 200
        rec = r.json()
        assert rec["indexed"] is True
        assert rec["mock_rows"] is True
        assert len(rec["rows"]) == 4
        assert rec["report"] is not None
        assert len(rec["report"]["ghost_pins"]) >= 1
        assert any(f["type"] == "COUNT_MISMATCH" for f in rec["flags"])

        # 4. Watchdog over the ledger with 04's flags.
        r = api_client.post(
            "/api/agents/watchdog",
            json={"project_id": project, "reconcile_flags": rec["flags"]},
        )
        assert r.status_code == 200
        watch = r.json()
        assert watch["persisted"] is True
        assert watch["rules_only"] is True
        assert any(
            a["reason_code"] == "COUNT_MISMATCH" and a["annotation_type"] == "CONFLICT"
            for a in watch["annotations"]
        )
        assert len(watch["checklist"]) == 2
        items3 = api_client.get("/api/takeoff/items", params={"project_id": project}).json()
        assert len(items3) == len(items)  # watchdog never writes the ledger

        # 5. QA feed + human gate.
        feed = api_client.get("/api/qa/annotations", params={"project_id": project}).json()
        assert len(feed) == len(watch["annotations"])
        assert len(feed) >= 2
        first, second = feed[0]["annotation_id"], feed[1]["annotation_id"]
        r = api_client.patch(f"/api/qa/annotations/{first}", json={"status": "CONFIRMED"})
        assert r.status_code == 200
        assert r.json()["status"] == "CONFIRMED"
        r = api_client.patch(
            f"/api/qa/annotations/{second}",
            json={"status": "DISMISSED", "resolution_reason": "test duplicate"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "DISMISSED"

        # 6. Re-run: nothing new (durable dispositions suppress re-raise).
        r = api_client.post(
            "/api/agents/watchdog",
            json={"project_id": project, "reconcile_flags": rec["flags"]},
        )
        assert r.status_code == 200
        assert r.json()["annotations"] == []

    def test_reconcile_standalone_unindexed(
        self, api_client: TestClient, schedule_pdf_path: str
    ) -> None:
        r = api_client.post(
            "/api/agents/reconcile",
            json={"project_id": "m4_standalone", "file_path": schedule_pdf_path},
        )
        assert r.status_code == 200
        rec = r.json()
        assert rec["indexed"] is False
        assert len(rec["rows"]) == 4
        assert rec["mock_rows"] is True
        assert all(link["ghost"] for link in rec["links"])
        assert all(c["status"] == "UNDERCOUNT" for c in rec["family_counts"])
