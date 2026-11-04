"""Background multi-page agent orchestration with live SSE progress."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

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
from src.meta_services.sheet_scanner import SheetScanner
from src.models.validation import validate_project_id
from src.store.takeoff_store import TakeoffStore

router = APIRouter(prefix="/api/agent-jobs", tags=["agent-jobs"])


class StartAgentJobRequest(BaseModel):
    file_path: str
    project_id: str | None = None
    job_id: str | None = None
    meta_consent: bool = False
    analysis_scope: Literal["all", "vision"] = "all"


class PreviewPageRequest(BaseModel):
    file_path: str
    project_id: str | None = None
    page_index: int = 0


@dataclass
class AgentJob:
    job_id: str
    project_id: str
    file_path: str
    events: list[dict[str, Any]] = field(default_factory=list)
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    terminal: bool = False
    created_at: float = field(default_factory=time.time)
    meta_consent: bool = False
    analysis_scope: str = "all"
    status: str = "running"
    task: asyncio.Task[None] | None = None
    checkpoint_page: int = -1
    sheet_events: dict[int, dict[str, Any]] = field(default_factory=dict)
    completed_agents: dict[int, set[str]] = field(default_factory=dict)


_jobs: dict[str, AgentJob] = {}
_jobs_lock = asyncio.Lock()
_JOB_DIR = Path("data/agent_jobs")


class _LocalOnlyMetaClient:
    """Make opt-out explicit to agents that otherwise choose VLM paths by configuration."""

    @staticmethod
    def is_configured() -> bool:
        return False


def _job_path(job_id: str) -> Path:
    key = hashlib.sha256(job_id.encode("utf-8")).hexdigest()[:32]
    return _JOB_DIR / f"{key}.json"


def _append_persisted_event(job: AgentJob, event: dict[str, Any]) -> None:
    event_path = _job_path(job.job_id).with_suffix(".events.jsonl")
    with event_path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, separators=(",", ":")) + "\n")
    job.events.append(event)


def _persist_job(job: AgentJob) -> None:
    _JOB_DIR.mkdir(parents=True, exist_ok=True)
    path = _job_path(job.job_id)
    temp_path = path.with_suffix(".json.tmp")
    payload = {
        "job_id": job.job_id,
        "project_id": job.project_id,
        "file_path": job.file_path,
        "terminal": job.terminal,
        "created_at": job.created_at,
        "meta_consent": job.meta_consent,
        "analysis_scope": job.analysis_scope,
        "status": job.status,
        "checkpoint_page": job.checkpoint_page,
        "sheet_events": job.sheet_events,
        "completed_agents": {str(page): sorted(agents) for page, agents in job.completed_agents.items()},
    }
    temp_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    os.replace(temp_path, path)


def _load_job(job_id: str) -> AgentJob | None:
    path = _job_path(job_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        status = str(payload.get("status", "interrupted"))
        if status == "running":
            status = "interrupted"
        event_path = path.with_suffix(".events.jsonl")
        if event_path.is_file():
            events = [
                json.loads(line)
                for line in event_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
        else:
            events = list(payload.get("events", []))
        return AgentJob(
            job_id=str(payload["job_id"]),
            project_id=str(payload["project_id"]),
            file_path=str(payload["file_path"]),
            events=events,
            terminal=bool(payload.get("terminal", False)) or status == "interrupted",
            created_at=float(payload.get("created_at", time.time())),
            meta_consent=bool(payload.get("meta_consent", False)),
            analysis_scope=str(payload.get("analysis_scope", "all")),
            status=status,
            checkpoint_page=int(payload.get("checkpoint_page", -1)),
            sheet_events={int(page): event for page, event in payload.get("sheet_events", {}).items()},
            completed_agents={
                int(page): set(agents)
                for page, agents in payload.get("completed_agents", {}).items()
            },
        )
    except (OSError, ValueError, KeyError, TypeError):
        return None


class _ObservedMetaClient:
    """Proxy Meta calls and expose safe model/latency/token telemetry to the job stream."""

    def __init__(self, client: Any, on_call: Any) -> None:
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
    _append_persisted_event(job, serialized)
    if event.event_type == AgentEventType.SHEET_CLASSIFIED and event.page_index is not None:
        job.sheet_events[event.page_index] = serialized
        if not event.payload.get("target_agents"):
            job.checkpoint_page = max(job.checkpoint_page, event.page_index)
    if (
        event.event_type == AgentEventType.AGENT_COMPLETED
        and event.agent_id == AgentID.AGENT_00_ORCHESTRATOR.value
        and event.page_index is not None
    ):
        completed = job.completed_agents.setdefault(event.page_index, set())
        completed.add(str(event.payload.get("agent_id", "")))
        targets = job.sheet_events.get(event.page_index, {}).get("payload", {}).get("target_agents", [])
        if targets and set(targets).issubset(completed):
            job.checkpoint_page = max(job.checkpoint_page, event.page_index)
    if job_terminal:
        job.terminal = True
        job.status = "complete" if event.event_type == AgentEventType.COMPLETED else "failed"
    job.changed.set()
    _persist_job(job)


@router.post("/preview")
async def preview_package_page(
    body: PreviewPageRequest,
    store: Annotated[TakeoffStore, Depends(get_takeoff_store)],
):
    """Read one page locally so the PDF workspace can open before AI analysis."""
    if body.page_index < 0:
        raise HTTPException(status_code=400, detail="page_index cannot be negative")
    clean_path = resolve_contained_pdf(body.file_path)
    scanner = SheetScanner(client=_LocalOnlyMetaClient())  # type: ignore[arg-type]
    try:
        total_pages = await run_in_threadpool(scanner.get_page_count, clean_path)
        if body.page_index >= total_pages:
            raise HTTPException(status_code=404, detail="Page is outside this PDF")
        sheet = await run_in_threadpool(scanner.scan_page, clean_path, body.page_index)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    project_id = body.project_id or Path(body.file_path).stem
    try:
        project_id = validate_project_id(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {exc}") from exc
    await store.insert_project(project_id, project_id)
    await store.insert_sheet(
        sheet_id=sheet.sheet_id,
        project_id=project_id,
        page_index=sheet.page_index,
        sheet_number=sheet.sheet_number,
        sheet_title=sheet.sheet_title,
        discipline=sheet.discipline,
        scale_raw=sheet.scale_raw,
        scale_ratio=sheet.scale_ratio,
        scale_status=sheet.scale_status,
        width_pt=sheet.width_pt,
        height_pt=sheet.height_pt,
        pdf_path=str(clean_path),
    )
    return {"sheet": sheet.model_dump(mode="json"), "total_pages": total_pages}


async def _run_job(
    job: AgentJob,
    client: MetaModelClient,
    store: TakeoffStore,
) -> None:
    loop = asyncio.get_running_loop()

    def record_model_call(call: dict[str, Any]) -> None:
        def append_event() -> None:
            model = str(call.get("model", "Meta model"))
            mode = str(call.get("mode", "unknown"))
            latency_ms = call.get("latency_ms", 0)
            event = AgentEvent(
                job_id=job.job_id,
                agent_id=AgentID.AGENT_02_FINDER_L1.value,
                event_type=AgentEventType.PROGRESS,
                progress=0.2,
                message=f"{model} {mode.replace('_', ' ')} · {latency_ms} ms",
                payload={"phase": "meta_model_call", **call},
            )
            serialized = event.model_dump(mode="json")
            serialized["job_terminal"] = False
            _append_persisted_event(job, serialized)
            job.changed.set()
            _persist_job(job)

        loop.call_soon_threadsafe(append_event)

    effective_client = client if job.meta_consent else _LocalOnlyMetaClient()
    observed_client = cast(MetaModelClient, _ObservedMetaClient(effective_client, record_model_call))
    registry = AgentRegistry()
    registry.register(ReconAgent(client=observed_client))
    registry.register(FinderL1Agent(client=observed_client))
    registry.register(TracerL2Agent())
    registry.register(ScheduleReconcilerAgent(client=observed_client, store=store))
    orchestrator = OrchestratorAgent(registry=registry, store=store)
    prior_sheet_events = [
        job.sheet_events[page]
        for page in sorted(job.sheet_events)
        if page <= job.checkpoint_page
    ]
    prior_sheets = [
        event.get("payload", {}).get("sheet_metadata")
        for event in prior_sheet_events
        if isinstance(event.get("payload", {}).get("sheet_metadata"), dict)
    ]
    prior_routes = [
        {
            "sheet_id": event.get("payload", {}).get("sheet_id"),
            "page_index": event.get("page_index"),
            "sheet_type": event.get("payload", {}).get("sheet_type", "other"),
            "scale_status": event.get("payload", {}).get("scale_status", "UNVERIFIED"),
            "target_agents": event.get("payload", {}).get("target_agents", []),
            "status": "routed" if event.get("payload", {}).get("target_agents") else "skipped",
            "evidence_ids": [],
        }
        for event in prior_sheet_events
    ]
    context = AgentContext(
        project_id=job.project_id,
        job_id=job.job_id,
        pdf_path=Path(job.file_path),
        metadata={
            "start_page_index": job.checkpoint_page + 1,
            "prior_sheets": prior_sheets,
            "prior_routes": prior_routes,
            "analysis_scope": job.analysis_scope,
        },
    )
    try:
        async for event in orchestrator.orchestrate_stream(context):
            await _append(job, event)
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.terminal = True
        cancelled = AgentEvent(
            job_id=job.job_id,
            agent_id=AgentID.AGENT_00_ORCHESTRATOR.value,
            event_type=AgentEventType.FAILED,
            progress=0,
            message=f"Analysis paused after page {job.checkpoint_page + 1}. Resume to continue.",
            payload={"status": "cancelled", "checkpoint_page": job.checkpoint_page},
        ).model_dump(mode="json")
        cancelled["job_terminal"] = True
        _append_persisted_event(job, cancelled)
        job.changed.set()
        _persist_job(job)
        raise
    except Exception as exc:  # noqa: BLE001 - stream a visible terminal failure
        await _append(
            job,
            AgentEvent(
                job_id=job.job_id,
                agent_id=AgentID.AGENT_00_ORCHESTRATOR.value,
                event_type=AgentEventType.FAILED,
                progress=1,
                message=f"Agent job failed: {exc}",
                payload={"error": str(exc)},
            ),
        )
    finally:
        if job.status == "running":
            job.terminal = True
            job.status = "complete"
        job.changed.set()
        _persist_job(job)


@router.post("")
async def start_agent_job(
    body: StartAgentJobRequest,
    client: Annotated[MetaModelClient, Depends(get_meta_client)],
    store: Annotated[TakeoffStore, Depends(get_takeoff_store)],
):
    """Start package processing and return its job ID without awaiting pages."""
    if body.analysis_scope == "vision" and not body.meta_consent:
        raise HTTPException(status_code=403, detail="Meta consent is required for a vision pass")
    clean_path = resolve_contained_pdf(body.file_path)
    candidate = body.project_id or Path(body.file_path).stem
    try:
        project_id = validate_project_id(candidate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {exc}") from exc
    job_id = body.job_id or uuid.uuid4().hex[:12]
    async with _jobs_lock:
        if job_id in _jobs or _job_path(job_id).exists():
            raise HTTPException(status_code=409, detail="Job ID is already active")
        job = AgentJob(
            job_id=job_id,
            project_id=project_id,
            file_path=str(clean_path),
            meta_consent=body.meta_consent,
            analysis_scope=body.analysis_scope,
        )
        _jobs[job_id] = job
    _persist_job(job)
    job.task = asyncio.create_task(_run_job(job, client, store), name=f"agent-job-{job_id}")
    return {"job_id": job_id, "project_id": project_id, "status": "running"}


@router.get("/{job_id}")
async def get_agent_job(job_id: str):
    job = _jobs.get(job_id) or _load_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")
    _jobs[job_id] = job
    return {
        "job_id": job.job_id,
        "project_id": job.project_id,
        "status": job.status,
        "meta_consent": job.meta_consent,
        "analysis_scope": job.analysis_scope,
        "event_count": len(job.events),
        "events": job.events,
    }


@router.post("/{job_id}/cancel")
async def cancel_agent_job(job_id: str):
    job = _jobs.get(job_id) or _load_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")
    if job.terminal:
        return {"job_id": job_id, "status": job.status, "checkpoint_page": job.checkpoint_page}
    if job.task and not job.task.done():
        job.task.cancel()
        try:
            await job.task
        except asyncio.CancelledError:
            pass
    else:
        job.status = "cancelled"
        job.terminal = True
        _persist_job(job)
    _jobs[job_id] = job
    return {"job_id": job_id, "status": job.status, "checkpoint_page": job.checkpoint_page}


@router.post("/{job_id}/resume")
async def resume_agent_job(
    job_id: str,
    client: Annotated[MetaModelClient, Depends(get_meta_client)],
    store: Annotated[TakeoffStore, Depends(get_takeoff_store)],
):
    job = _jobs.get(job_id) or _load_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")
    if job.status not in {"cancelled", "interrupted", "failed"}:
        raise HTTPException(status_code=409, detail=f"Job cannot resume from status '{job.status}'")
    if not Path(job.file_path).is_file():
        raise HTTPException(status_code=410, detail="Source PDF is no longer available")
    job.terminal = False
    job.status = "running"
    job.changed = asyncio.Event()
    _jobs[job_id] = job
    _persist_job(job)
    job.task = asyncio.create_task(_run_job(job, client, store), name=f"agent-job-{job_id}-resume")
    return {"job_id": job.job_id, "project_id": job.project_id, "status": job.status}


@router.get("/{job_id}/events")
async def stream_agent_job_events(
    job_id: str,
    last_event_id: int = 0,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
):
    del x_session_id  # Session is retained for client auth consistency; job owns its client.
    job = _jobs.get(job_id) or _load_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Agent job not found")
    _jobs[job_id] = job

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
