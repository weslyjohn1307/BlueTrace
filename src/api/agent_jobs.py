"""Background multi-page agent orchestration with live SSE progress."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.agents import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentRegistry,
    FinderL1Agent,
    OrchestratorAgent,
    ReconAgent,
    ScheduleReconcilerAgent,
    TracerL2Agent,
)
from src.api.routes import get_meta_client, get_takeoff_store, resolve_contained_pdf
from src.meta_services.client import MetaModelClient
from src.models.validation import validate_project_id
from src.store.takeoff_store import TakeoffStore

router = APIRouter(prefix="/api/agent-jobs", tags=["agent-jobs"])


class StartAgentJobRequest(BaseModel):
    file_path: str
    project_id: str | None = None
    job_id: str | None = None


@dataclass
class AgentJob:
    job_id: str
    project_id: str
    file_path: str
    events: list[dict[str, Any]] = field(default_factory=list)
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    terminal: bool = False
    created_at: float = field(default_factory=time.time)


_jobs: dict[str, AgentJob] = {}
_jobs_lock = asyncio.Lock()


class _ObservedMetaClient:
    """Proxy Meta calls and expose safe model/latency/token telemetry to the job stream."""

    def __init__(self, client: MetaModelClient, on_call: Any) -> None:
        self._client = client
        self._on_call = on_call

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)

    def _execute_governed_completion(
        self,
        model: str,
        messages: list[dict[str, Any]],
        profile: Any,
        temperature: float = 0.1,
    ) -> tuple[str, dict[str, Any]]:
        started = time.monotonic()
        try:
            result = self._client._execute_governed_completion(
                model=model,
                messages=messages,
                profile=profile,
                temperature=temperature,
            )
        except Exception as exc:
            self._on_call({
                "model": model,
                "profile": getattr(profile, "name", "unknown"),
                "mode": "live_api_error",
                "latency_ms": round((time.monotonic() - started) * 1000),
                "error_type": type(exc).__name__,
            })
            raise

        content, telemetry = result
        self._on_call({
            "model": model,
            "profile": getattr(profile, "name", telemetry.get("profile", "unknown")),
            "mode": "live_api",
            "mock": False,
            "latency_ms": round((time.monotonic() - started) * 1000),
            "prompt_tokens": telemetry.get("prompt_tokens", 0),
            "completion_tokens": telemetry.get("completion_tokens", 0),
            "total_tokens": telemetry.get("total_tokens", 0),
            "retries": telemetry.get("retries", 0),
            "truncated": telemetry.get("truncated", False),
        })
        return content, telemetry


def reset_agent_jobs() -> None:
    """Clear in-memory state for isolated tests."""
    _jobs.clear()


async def _append(job: AgentJob, event: AgentEvent) -> None:
    job_terminal = event.agent_id == AgentID.AGENT_00_ORCHESTRATOR.value and (
        (event.event_type == AgentEventType.COMPLETED and "document_map" in event.payload)
        or event.event_type == AgentEventType.FAILED
    )
    serialized = event.model_dump(mode="json")
    serialized["job_terminal"] = job_terminal
    job.events.append(serialized)
    if job_terminal:
        job.terminal = True
    job.changed.set()


@router.post("")
async def start_agent_job(
    body: StartAgentJobRequest,
    client: Annotated[MetaModelClient, Depends(get_meta_client)],
    store: Annotated[TakeoffStore, Depends(get_takeoff_store)],
):
    """Start package processing and return its job ID without awaiting pages."""
    clean_path = resolve_contained_pdf(body.file_path)
    candidate = body.project_id or Path(body.file_path).stem
    try:
        project_id = validate_project_id(candidate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {exc}") from exc
    job_id = body.job_id or uuid.uuid4().hex[:12]
    async with _jobs_lock:
        if job_id in _jobs:
            raise HTTPException(status_code=409, detail="Job ID is already active")
        job = AgentJob(job_id=job_id, project_id=project_id, file_path=str(clean_path))
        _jobs[job_id] = job

    loop = asyncio.get_running_loop()

    def record_model_call(call: dict[str, Any]) -> None:
        def append_event() -> None:
            model = str(call.get("model", "Meta model"))
            mode = str(call.get("mode", "unknown"))
            latency_ms = call.get("latency_ms", 0)
            message = f"{model} {mode.replace('_', ' ')} · {latency_ms} ms"
            event = AgentEvent(
                job_id=job_id,
                agent_id=AgentID.AGENT_02_FINDER_L1.value,
                event_type=AgentEventType.PROGRESS,
                progress=0.2,
                message=message,
                payload={"phase": "meta_model_call", **call},
            )
            serialized = event.model_dump(mode="json")
            serialized["job_terminal"] = False
            job.events.append(serialized)
            job.changed.set()

        loop.call_soon_threadsafe(append_event)

    observed_client = cast(MetaModelClient, _ObservedMetaClient(client, record_model_call))

    registry = AgentRegistry()
    registry.register(ReconAgent(client=observed_client))
    registry.register(FinderL1Agent(client=observed_client))
    registry.register(TracerL2Agent())
    registry.register(ScheduleReconcilerAgent(client=observed_client, store=store))
    orchestrator = OrchestratorAgent(registry=registry, store=store)
    context = AgentContext(project_id=project_id, job_id=job_id, pdf_path=clean_path)

    async def process() -> None:
        try:
            async for event in orchestrator.orchestrate_stream(context):
                await _append(job, event)
        except Exception as exc:  # noqa: BLE001 - stream a visible terminal failure
            await _append(
                job,
                AgentEvent(
                    job_id=job_id,
                    agent_id=AgentID.AGENT_00_ORCHESTRATOR.value,
                    event_type=AgentEventType.FAILED,
                    progress=1,
                    message=f"Agent job failed: {exc}",
                    payload={"error": str(exc)},
                ),
            )
        finally:
            job.terminal = True
            job.changed.set()

    asyncio.create_task(process(), name=f"agent-job-{job_id}")
    return {"job_id": job_id, "project_id": project_id, "status": "running"}


@router.get("/{job_id}")
async def get_agent_job(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")
    return {
        "job_id": job.job_id,
        "project_id": job.project_id,
        "status": "complete" if job.terminal else "running",
        "event_count": len(job.events),
        "events": job.events,
    }


@router.get("/{job_id}/events")
async def stream_agent_job_events(
    job_id: str,
    last_event_id: int = 0,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
):
    del x_session_id  # Session is retained for client auth consistency; job owns its client.
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")

    async def frames():
        cursor = max(last_event_id, 0)
        while True:
            while cursor < len(job.events):
                payload = json.dumps(job.events[cursor], separators=(",", ":"))
                yield f"id: {cursor + 1}\ndata: {payload}\n\n"
                cursor += 1
            if job.terminal:
                break
            job.changed.clear()
            if cursor < len(job.events):
                continue
            try:
                await asyncio.wait_for(job.changed.wait(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
