from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Any

from fastapi.testclient import TestClient

from src.agents import AgentEvent, AgentEventType
from src.agents.orchestrator import OrchestratorAgent
from src.api.agent_jobs import _ObservedMetaClient, reset_agent_jobs
from src.api.main import app


def test_observed_meta_client_reports_live_model_usage_without_prompt_content() -> None:
    class FakeClient:
        def _execute_governed_completion(self, **_kwargs: Any) -> tuple[str, dict[str, Any]]:
            return "private model output", {
                "profile": "schedule_extraction",
                "prompt_tokens": 120,
                "completion_tokens": 20,
                "total_tokens": 140,
                "retries": 0,
                "truncated": False,
            }

    calls: list[dict[str, Any]] = []
    proxy = _ObservedMetaClient(FakeClient(), calls.append)  # type: ignore[arg-type]
    content, telemetry = proxy._execute_governed_completion(
        model="muse-spark-1.3",
        messages=[{"role": "user", "content": "private prompt"}],
        profile=type("Profile", (), {"name": "schedule_extraction"})(),
    )

    assert content == "private model output"
    assert telemetry["total_tokens"] == 140
    assert calls[0]["model"] == "muse-spark-1.3"
    assert calls[0]["mode"] == "live_api"
    assert calls[0]["mock"] is False
    assert calls[0]["total_tokens"] == 140
    assert "content" not in calls[0]


def test_agent_job_returns_before_work_finishes_and_replays_live_events(
    isolated_takeoff_store, monkeypatch
) -> None:
    _ = isolated_takeoff_store
    reset_agent_jobs()
    async def fake_stream(self, context) -> AsyncGenerator[AgentEvent, None]:
        _ = self
        yield AgentEvent(
            job_id=context.job_id,
            agent_id="00-orchestrator",
            event_type=AgentEventType.SHEET_DISCOVERED,
            payload={"total_pages": 2},
            message="Discovered pages",
        )
        await asyncio.sleep(0.05)
        yield AgentEvent(
            job_id=context.job_id,
            agent_id="agent_03_tracer_l2",
            event_type=AgentEventType.COMPLETED,
            progress=0.5,
            message="Page agent finished",
        )
        await asyncio.sleep(0.1)
        yield AgentEvent(
            job_id=context.job_id,
            agent_id="agent_00_orchestrator",
            event_type=AgentEventType.COMPLETED,
            progress=1,
            message="Finished",
            payload={"document_map": {"total_pages": 2}},
        )

    monkeypatch.setattr(OrchestratorAgent, "orchestrate_stream", fake_stream)
    with TestClient(app) as client:
        response = client.post(
            "/api/agent-jobs",
            json={"file_path": "fixtures/mechanical/hvac_plan_level2.pdf", "project_id": "job-test"},
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]
        assert response.json()["status"] == "running"
        time.sleep(0.075)
        snapshot = client.get(f"/api/agent-jobs/{job_id}")
        assert snapshot.status_code == 200
        assert snapshot.json()["events"][0]["payload"]["total_pages"] == 2
        page_complete = next(event for event in snapshot.json()["events"] if event["message"] == "Page agent finished")
        assert page_complete["job_terminal"] is False
        assert snapshot.json()["status"] == "running"
        with client.stream("GET", f"/api/agent-jobs/{job_id}/events") as stream:
            body = "".join(stream.iter_text())
        assert '"event_type":"sheet_discovered"' in body
        assert '"event_type":"complete"' in body
        assert '"job_terminal":true' in body
        assert client.get(f"/api/agent-jobs/{job_id}").json()["status"] == "complete"


def test_agent_job_rejects_paths_outside_workspace(isolated_takeoff_store) -> None:
    _ = isolated_takeoff_store
    with TestClient(app) as client:
        response = client.post(
            "/api/agent-jobs",
            json={"file_path": "../../private.pdf", "project_id": "job-test"},
        )
    assert response.status_code == 403
