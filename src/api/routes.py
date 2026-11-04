from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import replace
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

from src.agents import (
    AgentContext,
    AgentEventType,
    AgentRegistry,
    FinderL1Agent,
    OrchestratorAgent,
    ReconAgent,
    ScheduleReconcilerAgent,
    TracerL2Agent,
    WatchdogQAAgent,
)
from src.core_vector.pipeline import run_l2_pipeline
from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import MetaModelClient
from src.meta_services.copilot import TakeoffCopilot
from src.meta_services.legend_scanner import LegendScanner, LegendScanResult
from src.meta_services.schedule_parser import ScheduleParser
from src.meta_services.sheet_scanner import SheetScanner
from src.meta_services.thumbnail_generator import generate_sheet_thumbnails_async
from src.models.schemas import (
    CopilotQueryRequest,
    CopilotQueryResponse,
    CursorCropRequest,
    CursorCropResponse,
    DimensionExtraction,
    FeedbackEventRequest,
    FeedbackEventResponse,
    IntakeJobEvent,
    IntakeJobStatus,
    MetaFileUploadRequest,
    MetaFileUploadResponse,
    ProjectSummaryResponse,
    SessionStatePayload,
    SheetCalibrationRequest,
    SheetCalibrationResponse,
    SheetMetadata,
    UploadResponse,
)
from src.models.validation import validate_project_id
from src.store.reconciler import (
    PlanSymbolInstance,
    ReconciliationReport,
    ScheduledEquipmentItem,
    reconcile_takeoff,
)
from src.store.takeoff_store import (
    LedgerSummaryRow,
    TakeoffRecord,
    TakeoffStore,
    pipeline_results_to_records,
)

router = APIRouter(prefix="/api")

_store_instance: TakeoffStore | None = None
_session_keys: dict[str, dict[str, Any]] = {}
_disabled_sessions: set[str] = set()


def set_takeoff_store(store: TakeoffStore | None) -> None:
    """Sets or resets the active TakeoffStore instance (useful for test isolation)."""
    global _store_instance
    _store_instance = store


def reset_byok_state() -> None:
    """Clears in-memory BYOK keys and opt-outs (used by test isolation)."""
    _session_keys.clear()
    _disabled_sessions.clear()


def get_meta_client(x_session_id: str | None = Header(default=None, alias="X-Session-ID")) -> MetaModelClient:
    """Session-scoped MetaModelClient resolution.

    A session that has explicitly cleared its key must never fall back to the
    ambient environment key or to the shared default key, so the opt-out check
    runs before any key lookup.
    """
    sid = x_session_id or "default"

    if sid in _disabled_sessions:
        return MetaModelClient(api_key="mock_key_unconfigured")

    now = time.time()
    # Lazy eviction sweep so expired keys never linger for unvisited sessions.
    for stale in [k for k, v in _session_keys.items() if now >= v["expires_at"]]:
        _session_keys.pop(stale, None)
    for candidate in (sid, "default"):
        session_info = _session_keys.get(candidate)
        if session_info is None:
            continue
        return MetaModelClient(api_key=session_info["key"])

    return MetaModelClient()


def resolve_contained_pdf(pdf_path: str) -> Path:
    """Resolves a PDF inside the workspace drawing roots or raises 403/404.

    Single containment gate for every endpoint that reads a drawing file:
    fixtures/ and data/ only, .pdf suffix only, must exist. Absolute paths are
    accepted only when their resolved target remains inside one of those roots;
    this keeps legacy Windows sessions working without widening file access.
    """
    workspace_root = Path.cwd().resolve()
    clean_path = Path(pdf_path)
    resolved = (clean_path if clean_path.is_absolute() else workspace_root / clean_path).resolve()
    allowed_roots = [
        (workspace_root / "fixtures").resolve(),
        (workspace_root / "data").resolve(),
    ]
    is_allowed = any(resolved == r or r in resolved.parents for r in allowed_roots)
    if not is_allowed or resolved.suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=403,
            detail="Access denied: pdf_path must be a .pdf inside fixtures/ or data/.",
        )
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail=f"PDF drawing not found: {pdf_path}")
    return resolved


async def get_takeoff_store() -> TakeoffStore:
    global _store_instance
    if _store_instance is None:
        db_path = os.environ.get("BLUETRACE_DB_PATH", "data/takeoff.sqlite3")
        _store_instance = TakeoffStore(db_path=db_path)
        await _store_instance.initialize()
    return _store_instance


MetaClientDep = Annotated[MetaModelClient, Depends(get_meta_client)]
TakeoffStoreDep = Annotated[TakeoffStore, Depends(get_takeoff_store)]


def _default_project_id(pdf_path: str) -> str:
    """Derive a stable project id from a drawing filename (mirrors the client)."""
    stem = Path(pdf_path).stem
    cleaned = re.sub(r"[^\w\- ]+", "", stem).strip()[:80]
    return cleaned or "default_project"


async def _persist_sheet(
    store: TakeoffStore,
    meta: SheetMetadata,
    project_id: str,
    pdf_path: str | None = None,
) -> None:
    stored_pdf_path = pdf_path
    if pdf_path:
        resolved_pdf = resolve_contained_pdf(pdf_path)
        stored_pdf_path = resolved_pdf.relative_to(Path.cwd().resolve()).as_posix()
    await store.insert_project(project_id, project_id)
    await store.insert_sheet(
        sheet_id=meta.sheet_id,
        project_id=project_id,
        page_index=meta.page_index,
        sheet_number=meta.sheet_number,
        sheet_title=meta.sheet_title,
        discipline=meta.discipline,
        scale_raw=meta.scale_raw,
        scale_ratio=meta.scale_ratio,
        scale_status=meta.scale_status,
        width_pt=meta.width_pt,
        height_pt=meta.height_pt,
        pdf_path=stored_pdf_path,
    )


async def _auto_populate_takeoff(
    store: TakeoffStore,
    resolved_pdf: Path,
    meta: SheetMetadata,
    project_id: str,
) -> tuple[SheetTakeoffOutcome, str | None]:
    """Run vector extraction for one scanned sheet into the takeoff ledger.

    Fail-closed: any pipeline failure yields zero items plus an error string
    for the caller to surface; it never fabricates a measurement.
    """
    empty = SheetTakeoffOutcome(
        sheet_id=meta.sheet_id, run_count=0, items_created=0, accepted_count=0, suggested_count=0
    )
    discipline = meta.discipline.lower()
    if discipline not in {"mechanical", "plumbing"}:
        # The vector engine only measures MEP linework; never relabel other
        # disciplines as ductwork.
        return empty, None
    try:
        pipeline_result = await run_in_threadpool(
            run_l2_pipeline,
            str(resolved_pdf),
            meta.page_index,
            discipline,
            # Lengths come from centerline corridors, not boundary perimeters.
            use_centerline=True,
        )
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as exc:
        # Fail closed: clear stale vector rows so a failed re-scan can never
        # leave yesterday's measurements standing in for today's sheet.
        await store.delete_vector_items_for_sheet(project_id, meta.sheet_id)
        return empty, f"Vector extraction failed for {meta.sheet_id}: {exc}"
    records = pipeline_results_to_records(
        pipeline_result,
        project_id=project_id,
        sheet_id=meta.sheet_id,
        sheet_scale_status=meta.scale_status,
    )
    raw_run_count = pipeline_result.get("run_count") or pipeline_result.get("result_count") or 0
    run_count = int(raw_run_count) if isinstance(raw_run_count, (int, float)) else 0
    created = await store.replace_vector_items_for_sheet(project_id, meta.sheet_id, records)
    return (
        SheetTakeoffOutcome(
            sheet_id=meta.sheet_id,
            run_count=run_count,
            items_created=created,
            accepted_count=sum(1 for r in records if r.status == "ACCEPTED"),
            suggested_count=sum(1 for r in records if r.status == "SUGGESTED"),
        ),
        None,
    )


class StatusUpdateRequest(BaseModel):
    status: Literal["SUGGESTED", "ACCEPTED", "CORRECTED", "REJECTED", "CANNOT_DETERMINE"]
    action: str = "USER_REVIEW"
    #mandatory structured override reason for CORRECT/REJECT.
    reason: str | None = None

    @model_validator(mode="after")
    def require_reason_for_overrides(self):
        from src.store.takeoff_store import CORRECTION_REASONS

        target = str(self.status).strip().upper()
        action_name = str(self.action or "USER_REVIEW").strip().upper()
        code = str(self.reason).strip().upper() if self.reason and str(self.reason).strip() else None
        if code is not None and code not in CORRECTION_REASONS:
            raise ValueError(
                f"Unknown correction reason '{self.reason}'. Expected one of: "
                f"{', '.join(sorted(CORRECTION_REASONS))}."
            )
        if (target in ("CORRECTED", "REJECTED") or action_name in ("CORRECT", "REJECT")) and code is None:
            raise ValueError(
                f"A correction reason is required for status '{target}' "
                f"(action '{action_name}')."
            )
        return self


class ReviewEventResponse(BaseModel):
    event_id: str
    item_id: str
    action: str
    previous_status: str
    new_status: str
    reason: str | None = None
    timestamp: str


class SheetScanRequest(BaseModel):
    pdf_path: str
    page_index: int = 0
    project_id: str | None = None
    auto_takeoff: bool = True


class SheetScanAllRequest(BaseModel):
    pdf_path: str
    project_id: str | None = None
    auto_takeoff: bool = True


class SheetTakeoffOutcome(BaseModel):
    sheet_id: str
    run_count: int
    items_created: int
    accepted_count: int
    suggested_count: int


class SheetScanAllResponse(BaseModel):
    pdf_path: str
    project_id: str
    total_pages: int
    sheets: list[SheetMetadata]
    takeoff: list[SheetTakeoffOutcome]
    errors: list[str] = Field(default_factory=list)


class ScheduleParseRequest(BaseModel):
    image_base64: str
    schedule_title: str = "MEP Equipment Schedule"
    project_id: str = "default_project"
    sheet_id: str = "default_sheet"
    page_text_blocks: list[tuple[str, list[float]]] = Field(default_factory=list)


class SegmentConceptRequest(BaseModel):
    image_base64: str
    concept_prompt: str = "mechanical equipment boundary"


class TakeoffReconcileRequest(BaseModel):
    project_id: str | None = None
    sheet_id: str | None = None
    # Validated by the engine's own models: a missing/invalid location_pt,
    # empty tag/label, or missing schedule_sheet is a 422, never defaulted.
    scheduled_items: list[ScheduledEquipmentItem] = Field(..., min_length=1)
    plan_symbols: list[PlanSymbolInstance] | None = None
    symbol_counts: dict[str, int] | None = None

    @field_validator("symbol_counts")
    @classmethod
    def validate_symbol_counts(cls, v: dict[str, int] | None) -> dict[str, int] | None:
        if v is None:
            return v
        for tag, count in v.items():
            if not tag.strip():
                raise ValueError("symbol_counts tags cannot be empty.")
            if count < 0:
                raise ValueError("symbol_counts counts cannot be negative.")
        return v

    @model_validator(mode="after")
    def reject_plan_symbols_and_symbol_counts(self):
        if self.plan_symbols is not None and self.symbol_counts is not None:
            raise ValueError(
                "plan_symbols and symbol_counts are mutually exclusive; provide only one."
            )
        return self


class LegendScanRequest(BaseModel):
    pdf_path: str
    page_index: int | None = Field(default=None, ge=0)


class IntakeBatchRequest(BaseModel):
    pdf_path: str
    project_id: str | None = None


# In-memory intake job registry: job_id -> {"status": IntakeJobStatus, "events": [dict]}.
# Jobs are short-lived batch records for SSE progress replay, not ledger data.
# Bounded so a long-running session cannot grow memory without limit: the most
# recent _MAX_INTAKE_JOBS are retained and the oldest entries are evicted.
_MAX_INTAKE_JOBS = 25
_intake_jobs: dict[str, dict[str, Any]] = {}


def _register_intake_job(job_id: str, job: dict[str, Any]) -> None:
    """Register a job, evicting the oldest entries beyond ``_MAX_INTAKE_JOBS``."""
    _intake_jobs[job_id] = job
    while len(_intake_jobs) > _MAX_INTAKE_JOBS:
        oldest_job_id = next(iter(_intake_jobs))
        if oldest_job_id == job_id:  # defensive: never evict the job just added
            break
        _intake_jobs.pop(oldest_job_id, None)


def _reset_intake_jobs() -> None:
    """Clear the job registry (used by test isolation)."""
    _intake_jobs.clear()


class LineworkResponse(BaseModel):
    sheet_id: str
    cached: bool
    run_count: int
    items_created: int
    items: list[TakeoffRecord]


# 150 DPI pixmap cache for the lazy linework viewer path: 4 slots, LRU.
# Bounds raster memory for multi-sheet navigation (one entry per sheet view).
_LINEWORK_PIXMAP_SLOTS = 4
_linework_pixmap_cache: OrderedDict[tuple[str, int], bytes] = OrderedDict()


def _warm_linework_pixmap(pdf_path: str, page_index: int, dpi: int = 150) -> bytes:
    """Render (or reuse) the 150 DPI pixmap for a sheet under a 4-slot LRU."""
    key = (pdf_path, page_index)
    hit = _linework_pixmap_cache.get(key)
    if hit is not None:
        _linework_pixmap_cache.move_to_end(key)
        return hit
    import pymupdf

    doc = pymupdf.open(pdf_path)
    try:
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
        png_bytes = doc[page_index].get_pixmap(dpi=dpi).tobytes("png")
    finally:
        doc.close()
    _linework_pixmap_cache[key] = png_bytes
    while len(_linework_pixmap_cache) > _LINEWORK_PIXMAP_SLOTS:
        _linework_pixmap_cache.popitem(last=False)
    return png_bytes


@router.get("/health")
async def health_check(client: MetaClientDep):
    return {
        "status": "online",
        "service": "BlueTraceAI Takeoff API",
        "version": "1.0.0",
        "meta_model_api_configured": client.is_configured(),
        "models": {
            "vision_ocr": "muse-spark-1.3",
            "segmentation": "sam-3.1",
            "reasoning": "muse-wonder-1.0",
        },
    }


@router.post("/sheet-scan", response_model=SheetMetadata)
async def scan_drawing_sheet(
    request: SheetScanRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Automated SheetScan title block reconnaissance via muse-spark-1.3.

    Scanning persists the sheet and, unless disabled, automatically runs
    vector extraction into the takeoff ledger for that sheet.
    """
    clean_path = resolve_contained_pdf(request.pdf_path)

    scanner = SheetScanner(client=client)
    try:
        meta = await run_in_threadpool(
            scanner.scan_page, str(clean_path), page_index=request.page_index
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=502, detail=f"Sheet scan failed: {e}") from e
    project_id = request.project_id or _default_project_id(request.pdf_path)
    await _persist_sheet(store, meta, project_id, pdf_path=request.pdf_path)
    if request.auto_takeoff:
        # Takeoff failure never fabricates data (stale vector rows are cleared
        # inside); scan-all is the surface that reports per-sheet errors.
        await _auto_populate_takeoff(store, clean_path, meta, project_id)
    return meta


@router.post("/sheets/{sheet_id}/legend")
async def scan_sheet_legend(
    sheet_id: str,
    request: LegendScanRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Extract a sheet's legend symbol dictionary via muse-spark-1.3.

    Fail-closed: an unconfigured Meta client must not reach the scanner's
    mock path (which fabricates symbols), so the route returns an explicit
    review-required result with no symbols instead.
    """
    clean_path = resolve_contained_pdf(request.pdf_path)
    try:
        sheet = await store.get_sheet(sheet_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sheet lookup failed: {e}") from e
    if sheet is None:
        raise HTTPException(status_code=404, detail=f"Sheet '{sheet_id}' not found")
    if request.page_index is not None:
        page_index = request.page_index
    else:
        try:
            page_index = int(sheet["page_index"])
        except (TypeError, ValueError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Stored page_index for sheet '{sheet_id}' is invalid: {sheet['page_index']!r}",
            ) from e

    if not client.is_configured():
        return LegendScanResult(
            sheet_id=sheet_id,
            legend_detected=False,
            legend_bbox_pt=None,
            symbols=[],
            abbreviations={},
            confidence=0.0,
            mock=False,
            review_required=True,
        ).to_dict()

    try:
        scanner = LegendScanner(client=client)
        result = await run_in_threadpool(scanner.scan_sheet, str(clean_path), page_index=page_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Legend scan failed: {e}") from e
    if result.sheet_id != sheet_id:
        # The scanner derives its own id from the PDF stem; the requested
        # sheet id is the contract and must not leak a silent mismatch.
        result = replace(result, sheet_id=sheet_id)
    return result.to_dict()


@router.get("/sheets/{sheet_id}/linework", response_model=LineworkResponse)
async def get_sheet_linework(
    sheet_id: str,
    store: TakeoffStoreDep,
    pdf_path: str,
    page_index: int | None = None,
    discipline: str | None = None,
):
    """Lazy vector extraction for one sheet, cached in the takeoff ledger.

    Warms the 150 DPI pixmap LRU, then returns existing ``VECTOR_ENGINE``
    rows when the sheet was already measured. Only when no vector rows
    exist does it run ``run_l2_pipeline`` in a worker thread and persist
    the records — repeat views never re-run the engine. Non-MEP
    disciplines return an empty result (the engine only measures MEP
    linework; never relabel other disciplines as ductwork).
    """
    clean_path = resolve_contained_pdf(pdf_path)
    try:
        stored = await store.get_sheet(sheet_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sheet lookup failed: {e}") from e
    if page_index is None:
        if stored is not None:
            try:
                page_index = int(stored["page_index"])
            except (TypeError, ValueError) as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Stored page_index for sheet '{sheet_id}' is invalid: {stored['page_index']!r}",
                ) from e
        else:
            page_index = 0
    if page_index < 0:
        raise HTTPException(status_code=400, detail="page_index cannot be negative.")

    await run_in_threadpool(_warm_linework_pixmap, str(clean_path), page_index)

    existing = [i for i in await store.list_items(sheet_id=sheet_id) if i.source == "VECTOR_ENGINE"]
    if existing:
        return LineworkResponse(
            sheet_id=sheet_id,
            cached=True,
            run_count=len(existing),
            items_created=len(existing),
            items=existing,
        )

    disc = (discipline or (stored or {}).get("discipline") or "mechanical").lower()
    if disc not in {"mechanical", "plumbing"}:
        return LineworkResponse(
            sheet_id=sheet_id, cached=False, run_count=0, items_created=0, items=[]
        )
    stored_project_id = stored.get("project_id") if stored else None
    project_id = (
        stored_project_id
        if isinstance(stored_project_id, str) and stored_project_id
        else _default_project_id(pdf_path)
    )
    sheet_scale_status = stored.get("scale_status", "UNVERIFIED") if stored else "UNVERIFIED"
    try:
        pipeline_result = await run_in_threadpool(
            run_l2_pipeline,
            str(clean_path),
            page_index,
            disc,
            use_centerline=True,
        )
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=502, detail=f"Vector extraction failed: {e}") from e
    records = pipeline_results_to_records(
        pipeline_result,
        project_id=project_id,
        sheet_id=sheet_id,
        sheet_scale_status=sheet_scale_status,
    )
    raw_run_count = pipeline_result.get("run_count") or pipeline_result.get("result_count") or 0
    run_count = int(raw_run_count) if isinstance(raw_run_count, (int, float)) else 0
    created = await store.replace_vector_items_for_sheet(project_id, sheet_id, records)
    return LineworkResponse(
        sheet_id=sheet_id,
        cached=False,
        run_count=run_count,
        items_created=created,
        items=records,
    )


@router.post("/sheets/scan-all", response_model=SheetScanAllResponse)
async def scan_all_sheets(
    request: SheetScanAllRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Scan every page of a drawing set and auto-populate the takeoff ledger.

    Total pages come from the PDF itself; each page yields sheet metadata
    with cached dimensions, and each sheet's vector runs land in the ledger
    under the fail-closed scale rule.
    """
    clean_path = resolve_contained_pdf(request.pdf_path)
    scanner = SheetScanner(client=client)
    try:
        sheets = await run_in_threadpool(scanner.scan_all_pages, str(clean_path))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=502, detail=f"Sheet scan failed: {e}") from e
    if not sheets:
        raise HTTPException(status_code=400, detail="PDF drawing contains no pages to scan.")

    project_id = request.project_id or _default_project_id(request.pdf_path)
    outcomes: list[SheetTakeoffOutcome] = []
    errors: list[str] = []
    for meta in sheets:
        try:
            await _persist_sheet(store, meta, project_id, pdf_path=request.pdf_path)
            if request.auto_takeoff and (len(sheets) <= 3 or meta.page_index == 0):
                outcome, error = await _auto_populate_takeoff(store, clean_path, meta, project_id)
                outcomes.append(outcome)
                if error:
                    errors.append(error)
            elif request.auto_takeoff:
                outcomes.append(SheetTakeoffOutcome(sheet_id=meta.sheet_id, run_count=0, items_created=0, accepted_count=0, suggested_count=0))
        except (OSError, RuntimeError, ValueError) as exc:
            # One bad sheet must not abort ingestion of the remaining set.
            errors.append(f"Ingestion failed for {meta.sheet_id}: {exc}")
    return SheetScanAllResponse(
        pdf_path=request.pdf_path,
        project_id=project_id,
        total_pages=len(sheets),
        sheets=sheets,
        takeoff=outcomes,
        errors=errors,
    )


@router.patch("/sheets/{sheet_id}/calibration", response_model=SheetCalibrationResponse)
async def calibrate_sheet_scale(
    sheet_id: str,
    body: SheetCalibrationRequest,
    store: TakeoffStoreDep,
):
    """Two-point manual scale calibration for a sheet.

    Derives the denominator ratio from the paper distance between p1/p2 and
    the stated real-world feet/inches, snaps a canonical scale string, marks
    the sheet CALIBRATED, and recomputes VECTOR_ENGINE footage atomically.
    A paper line shorter than 5 pt is a 400 (never a silent scale).
    """
    import math as _math

    try:
        p1x, p1y = float(body.p1[0]), float(body.p1[1])
        p2x, p2y = float(body.p2[0]), float(body.p2[1])
    except (TypeError, ValueError, IndexError) as e:
        raise HTTPException(status_code=422, detail=f"Calibration points must be [x, y] pairs: {e}") from e
    length_pt = _math.hypot(p2x - p1x, p2y - p1y)
    if length_pt < 5:
        raise HTTPException(
            status_code=400,
            detail=f"Calibration line too short: L_pt={length_pt:.2f} < 5 pt.",
        )
    try:
        ratio = ScaleValidator.calculate_scale_ratio(body.p1, body.p2, body.real_ft, body.real_in)
        scale_raw = ScaleValidator.derive_architectural_scale_string(ratio)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        calibrated = await store.apply_sheet_calibration(sheet_id, ratio, scale_raw)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if isinstance(calibrated, (tuple, list)):
        updated, skipped = int(calibrated[0]), int(calibrated[1])
    else:
        updated, skipped = int(calibrated), 0
    return SheetCalibrationResponse(
        sheet_id=sheet_id,
        scale_ratio=ratio,
        scale_raw=scale_raw,
        scale_status="CALIBRATED",
        updated_items=updated,
        skipped_items=skipped,
    )
@router.post("/intake/batch", response_model=IntakeJobStatus)
async def start_intake_batch(
    request: IntakeBatchRequest,
    store: TakeoffStoreDep,
):
    """Fast batch intake: reconnaissance index + thumbnails, replayed over SSE.

    Runs the native-text reconnaissance scan (no VLM, no raster beyond
    low-DPI thumbnails), persists every sheet, renders thumbnails, and
    records a per-page event log (``progress`` / ``sheet_indexed`` /
    ``thumbnail_ready`` / ``complete`` / ``error``) under a job id that
    ``GET /api/intake/jobs/{job_id}/events`` replays as SSE.

    ``project_id`` is user input that becomes a cache directory name, so it is
    validated before any filesystem work (400, never a traversal).
    """
    clean_path = resolve_contained_pdf(request.pdf_path)
    # None means "derive from the filename"; an explicitly supplied id is
    # validated verbatim, so "" / "../x" is a 400 instead of a silent default.
    candidate_project_id = (
        _default_project_id(request.pdf_path) if request.project_id is None else request.project_id
    )
    try:
        project_id = validate_project_id(candidate_project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {e}") from e
    job_id = uuid.uuid4().hex[:12]
    job: dict[str, Any] = {
        "status": IntakeJobStatus(
            job_id=job_id,
            status="running",
            project_id=project_id,
            pdf_path=request.pdf_path,
        ),
        "events": [],
    }
    _register_intake_job(job_id, job)

    def _emit(
        event: Literal["progress", "sheet_indexed", "thumbnail_ready", "complete", "error"],
        progress: float,
        page_index: int | None = None,
        sheet_id: str | None = None,
        message: str | None = None,
    ) -> None:
        job["events"].append(
            IntakeJobEvent(
                job_id=job_id,
                event=event,
                page_index=page_index,
                sheet_id=sheet_id,
                progress=progress,
                message=message,
            ).model_dump()
        )

    try:
        scanner = SheetScanner()
        sheets = await run_in_threadpool(
            scanner.scan_package_reconnaissance, str(clean_path), project_id
        )
        job["status"].total_pages = len(sheets)
        if not sheets:
            raise ValueError("PDF drawing contains no pages to index.")
        _emit("progress", 0.0, message=f"Indexed {len(sheets)} sheets")
        for meta in sheets:
            try:
                await _persist_sheet(store, meta, project_id, pdf_path=request.pdf_path)
            except (OSError, RuntimeError, ValueError) as exc:
                _emit(
                    "progress",
                    meta.page_index / max(1, len(sheets)),
                    page_index=meta.page_index,
                    sheet_id=meta.sheet_id,
                    message=f"Sheet persist failed for {meta.sheet_id}: {exc}",
                )
                continue
            job["status"].sheets_indexed += 1
            _emit(
                "sheet_indexed",
                (meta.page_index + 1) / (2 * len(sheets)),
                page_index=meta.page_index,
                sheet_id=meta.sheet_id,
            )
        thumbnails = await generate_sheet_thumbnails_async(
            str(clean_path), project_id, dpi=24, max_workers=2
        )
        for i, thumb_path in enumerate(thumbnails):
            job["status"].thumbnails_ready += 1
            _emit(
                "thumbnail_ready",
                0.5 + (i + 1) / (2 * max(1, len(thumbnails))),
                page_index=i,
                message=thumb_path,
            )
        job["status"].status = "complete"
        _emit("complete", 1.0, message=f"Intake complete: {len(sheets)} sheets")
    except Exception as e:
        # Broadened from (ValueError, RuntimeError, OSError): a job that dies
        # on an unexpected exception must still flip to failed and emit a
        # terminal frame, otherwise SSE replay ends without a terminal event
        # and the UI spins forever.
        message = str(e) or e.__class__.__name__
        job["status"].status = "failed"
        job["status"].error = message
        _emit("error", 1.0, message=message)
        if isinstance(e, ValueError):
            raise HTTPException(status_code=400, detail=message) from e
        raise HTTPException(status_code=502, detail=f"Intake batch failed: {message}") from e
    return job["status"]


@router.get("/intake/jobs/{job_id}/events")
async def stream_intake_events(job_id: str):
    """Replay a batch intake job's event log as Server-Sent Events.

    The replayed stream always ends with a terminal ``complete`` or ``error``
    frame: when the stored log has no terminal event yet (e.g. the job is
    still running), a closing frame is synthesised so clients never wait on a
    stream that will never finish.
    """
    job = _intake_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Intake job '{job_id}' not found")

    async def sse_event_generator():
        for raw in job["events"]:
            yield f"data: {json.dumps(raw)}\n\n"
        if not any(e["event"] in ("complete", "error") for e in job["events"]):
            status = job["status"].status
            if status == "complete":
                terminal = IntakeJobEvent(job_id=job_id, event="complete", progress=1.0)
            else:
                terminal = IntakeJobEvent(
                    job_id=job_id,
                    event="error",
                    progress=1.0,
                    message=job["status"].error
                    or f"Intake job is '{status}' and has no terminal event; stream closed.",
                )
            yield f"data: {json.dumps(terminal.model_dump())}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


@router.get("/thumbnails/{project_id}/p{page_index}.webp")
async def get_sheet_thumbnail(project_id: str, page_index: int):
    """Serve one cached sheet thumbnail rendered by the intake pipeline.

    ``project_id`` carries the same validator as the thumbnail writer
    (400 on traversal/separators, never a write or read outside the cache
    root); unknown pages are 404. When this build wrote a PNG fallback
    instead of WebP, the ``.webp`` URL still resolves to the ``.png`` file.
    """
    try:
        safe_project_id = validate_project_id(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {e}") from e
    if page_index < 0:
        raise HTTPException(status_code=400, detail="page_index cannot be negative.")
    from src.meta_services.thumbnail_generator import THUMBNAIL_CACHE_ROOT

    cache_root = THUMBNAIL_CACHE_ROOT.resolve()
    out_dir = (THUMBNAIL_CACHE_ROOT / safe_project_id).resolve()
    if out_dir == cache_root or cache_root not in out_dir.parents:
        raise HTTPException(
            status_code=403,
            detail="Access denied: thumbnail directory is outside the cache.",
        )
    for suffix, media_type in ((".webp", "image/webp"), (".png", "image/png")):
        candidate = out_dir / f"p{page_index}{suffix}"
        resolved = candidate.resolve()
        if resolved.parent != out_dir:
            raise HTTPException(status_code=403, detail="Access denied: invalid thumbnail path.")
        if resolved.is_file():
            data = await run_in_threadpool(resolved.read_bytes)
            return Response(content=data, media_type=media_type)
    raise HTTPException(
        status_code=404,
        detail=f"Thumbnail not found for project '{safe_project_id}' page {page_index}",
    )


@router.get("/page-image")
async def render_page_image(pdf_path: str, page_index: int = 0, dpi: int = 150):
    """Renders one drawing sheet page to PNG for the canvas viewer."""
    clean_path = resolve_contained_pdf(pdf_path)
    if page_index < 0 or dpi not in (72, 96, 150, 200, 300):
        raise HTTPException(status_code=400, detail="Invalid page_index or dpi (72/96/150/200/300).")

    def _render() -> bytes:
        import pymupdf

        doc = pymupdf.open(str(clean_path))
        try:
            if page_index >= len(doc):
                raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
            return doc[page_index].get_pixmap(dpi=dpi).tobytes("png")
        finally:
            doc.close()

    try:
        png_bytes = await run_in_threadpool(_render)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(content=png_bytes, media_type="image/png")


@router.get("/page-text")
async def extract_page_text(pdf_path: str, page_index: int = 0):
    """Extracts native text blocks with bounding boxes for schedule-to-plan linking."""
    clean_path = resolve_contained_pdf(pdf_path)

    def _extract() -> list[dict[str, Any]]:
        import pymupdf

        doc = pymupdf.open(str(clean_path))
        try:
            if page_index < 0 or page_index >= len(doc):
                raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
            page = doc[page_index]
            blocks: list[dict[str, Any]] = []
            for x0, y0, x1, y1, text, *_ in page.get_text("blocks"):
                cleaned = (text or "").strip()
                if cleaned:
                    blocks.append({"text": cleaned, "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)]})
            return blocks
        finally:
            doc.close()

    try:
        blocks = await run_in_threadpool(_extract)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"pdf_path": pdf_path, "page_index": page_index, "blocks": blocks}


# LRU cache for hover crop OCR
_CROP_OCR_CACHE_MAXSIZE = 256
_crop_ocr_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
_crop_ocr_lock = threading.Lock()


def clear_crop_ocr_cache() -> None:
    """Clear hover crop OCR LRU cache."""
    with _crop_ocr_lock:
        _crop_ocr_cache.clear()


@router.post("/crop-ocr", response_model=CursorCropResponse)
async def extract_cursor_crop(
    request: CursorCropRequest,
    client: MetaClientDep,
):
    """Sub-second point-of-need hover dimension extraction from a 300x300 px crop."""
    start_time = time.perf_counter()

    crop_hash = hashlib.sha256(request.image_base64.encode("utf-8")).hexdigest()
    cached_result: dict[str, Any] | None = None
    with _crop_ocr_lock:
        if crop_hash in _crop_ocr_cache:
            _crop_ocr_cache.move_to_end(crop_hash)
            cached_result = _crop_ocr_cache[crop_hash]

    if cached_result is not None:
        result = cached_result
    else:
        # Process crop with muse-spark-1.3 via worker threadpool to avoid event loop blocking
        result = await run_in_threadpool(client.parse_crop_ocr, request.image_base64)
        with _crop_ocr_lock:
            _crop_ocr_cache[crop_hash] = result
            if len(_crop_ocr_cache) > _CROP_OCR_CACHE_MAXSIZE:
                _crop_ocr_cache.popitem(last=False)

    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    # Fail closed if unparsed or review required
    raw_width = result.get("width")
    if result.get("review_required") or raw_width is None:
        return CursorCropResponse(
            latency_ms=elapsed_ms,
            detected_text=result.get("detected_text", ""),
            parsed_dimension=None,
            confidence=0.0,
            badge_text=result.get("badge_text", "Review Required (Unparsed Dimension)"),
            review_required=True,
        )

    try:
        width = float(raw_width)
    except (TypeError, ValueError):
        width = 0.0

    if width <= 0:
        return CursorCropResponse(
            latency_ms=elapsed_ms,
            detected_text=result.get("detected_text", ""),
            parsed_dimension=None,
            confidence=0.0,
            badge_text="Review Required (Non-Positive Dimension)",
            review_required=True,
        )

    height = float(result["height"]) if result.get("height") is not None else None
    shape = result.get("shape", "RECTANGULAR")
    # Never invent confidence: an absent score means the dimension is unverified.
    confidence = float(result.get("confidence") or 0.0)
    badge_text = result.get("badge_text") or (
        f"{int(width)}x{int(height)} Rectangular Duct" if height else f'{int(width)}" Round Duct'
    )

    return CursorCropResponse(
        latency_ms=elapsed_ms,
        detected_text=result.get("detected_text", ""),
        parsed_dimension=DimensionExtraction(
            width_in=width,
            height_in=height,
            shape=shape,
        ),
        confidence=confidence,
        badge_text=badge_text,
        review_required=confidence <= 0.0,
    )


@router.post("/schedule/parse")
async def parse_schedule(
    request: ScheduleParseRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Extracts schedule table rows via muse-spark-1.3 and links to floor plan."""
    parser = ScheduleParser(client=client)
    scheduled_items = parser.parse_schedule_crop(
        request.image_base64,
        schedule_title=request.schedule_title,
    )
    records, unplaced = parser.link_schedule_to_plan(
        scheduled_items,
        request.page_text_blocks,
        project_id=request.project_id,
        sheet_id=request.sheet_id,
    )
    if records:
        await store.bulk_add_takeoff_items(records)

    return {
        "scheduled_items_total": len(scheduled_items),
        "linked_takeoff_records": len(records),
        "unplaced_ghost_pins": [u.model_dump() for u in unplaced],
    }


@router.post("/segment")
async def segment_concept(
    request: SegmentConceptRequest,
    client: MetaClientDep,
):
    """Invokes SAM 3.1 (/v1/responses) to segment visual concepts."""
    return await client.segment_concept_async(
        base64_image=request.image_base64,
        concept_prompt=request.concept_prompt,
    )


@router.post("/upload", response_model=UploadResponse)
async def upload_drawing(
    request: Request,
    filename: str | None = None,
):
    """Accepts blueprint drawing PDF via raw binary stream or JSON base64."""
    content_type = request.headers.get("content-type", "")
    content: bytes
    resolved_filename: str

    if "application/json" in content_type:
        try:
            body = await request.json()
            resolved_filename = str(body.get("filename") or "drawing.pdf")
            b64_data = str(body.get("file_base64") or "")
            content = base64.b64decode(b64_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON upload payload: {e}") from e
    else:
        resolved_filename = (
            filename
            or request.headers.get("X-Filename")
            or "drawing.pdf"
        )
        content = await request.body()

    if not resolved_filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF blueprint drawings are accepted.")

    if len(content) > 150 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds maximum limit of 150MB.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF file: missing %PDF- header.")

    uploads_dir = Path("data/uploads").resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)

    clean_name = re.sub(r"[^\w\-.]", "_", resolved_filename)
    unique_name = f"{uuid.uuid4().hex[:12]}_{clean_name}"
    target_path = uploads_dir / unique_name

    await run_in_threadpool(target_path.write_bytes, content)
    hasher = hashlib.sha256(content)

    rel_path = f"data/uploads/{unique_name}"
    return UploadResponse(
        filename=resolved_filename,
        file_path=rel_path,
        byte_size=len(content),
        sha256=hasher.hexdigest(),
    )


@router.post("/files/upload", response_model=MetaFileUploadResponse)
async def upload_to_meta_files(
    body: MetaFileUploadRequest,
    client: MetaClientDep,
):
    """Uploads local blueprint PDF to Meta Files API cache."""
    clean_path = resolve_contained_pdf(body.file_path)

    file_id = await run_in_threadpool(client.upload_blueprint_file, str(clean_path))
    return MetaFileUploadResponse(
        file_id=file_id,
        filename=clean_path.name,
        status="uploaded",
    )


@router.post("/copilot", response_model=CopilotQueryResponse)
async def query_copilot(
    request: CopilotQueryRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Natural language drawing query grounded in project database and active sheet."""
    copilot = TakeoffCopilot(client=client, store=store)
    return await copilot.answer_query(request)


@router.post("/copilot/stream")
async def stream_copilot(
    request: CopilotQueryRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Streams natural language drawing copilot responses using Server-Sent Events (SSE)."""
    copilot = TakeoffCopilot(client=client, store=store)
    full_response = await copilot.answer_query(request)

    async def sse_event_generator():
        # Stream response words/tokens with event-stream framing
        words = full_response.answer.split(" ")
        for i, word in enumerate(words):
            chunk = word if i == 0 else " " + word
            payload = {
                "chunk": chunk,
                "done": False,
            }
            yield f"data: {json.dumps(payload)}\n\n"
        # Final event with provenance and cited coordinates
        terminal_payload = {
            "chunk": "",
            "done": True,
            "answer": full_response.answer,
            "cited_coordinates": full_response.cited_coordinates,
            "referenced_item_ids": full_response.referenced_item_ids,
            "scale_verified": full_response.scale_verified,
            "model_used": full_response.model_used,
        }
        yield f"data: {json.dumps(terminal_payload)}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------
# Project Sessions & Rehydration Endpoints (Gap 4)
# ---------------------------------------------------------


@router.get("/projects", response_model=list[ProjectSummaryResponse])
async def list_projects(store: TakeoffStoreDep):
    """List all projects with sheet/item counts and last session timestamp."""
    projects = await store.list_projects()
    return [ProjectSummaryResponse(**entry) for entry in projects]


@router.get("/projects/{project_id}/session")
async def get_project_session(project_id: str, store: TakeoffStoreDep):
    """Return consolidated rehydration payload (session, sheets, summary).

    Fail-closed: unknown projects yield HTTP 404 and never auto-create rows
    through this read path beyond the session default row for known projects.
    """
    try:
        session = await store.get_or_create_session(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    sheets = await store.list_sheets(project_id)
    summary = await store.get_ledger_summary(project_id=project_id)
    return {
        "session": session,
        "sheets": sheets,
        "summary": [row.model_dump() for row in summary],
    }


@router.put("/projects/{project_id}/session")
async def save_project_session(
    project_id: str, body: SessionStatePayload, store: TakeoffStoreDep
):
    """Persist viewport coordinates and tool state for a project session.

    Fail-closed: unknown projects yield HTTP 404; invalid payloads are
    rejected by schema validation (422) before anything is persisted.
    """
    if body.project_id and body.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail=f"Path project_id '{project_id}' does not match body '{body.project_id}'.",
        )
    state = body.model_dump()
    state["project_id"] = project_id
    try:
        await store.save_session_state(project_id, state)
    except ValueError as e:
        message = str(e)
        if message.startswith("Unknown project_id"):
            raise HTTPException(status_code=404, detail=message) from e
        raise HTTPException(status_code=400, detail=message) from e
    session = await store.get_or_create_session(project_id)
    return {"session": session}


# ---------------------------------------------------------
# Engineer Feedback Events (Gap 5 Telemetry Slice)
# ---------------------------------------------------------


@router.post("/feedback/events", response_model=FeedbackEventResponse)
async def record_feedback_event_route(
    body: FeedbackEventRequest,
    store: TakeoffStoreDep,
):
    """Persist one engineer review interaction for the learning backlog.

    Fail-closed training gate: the store always writes
    ``training_eligible = 0``; this endpoint never accepts an eligibility
    flag, so no client can self-certify a record as training data. Unknown
    projects yield HTTP 404 and persist nothing; the context crop is
    best-effort and never fails the event (unknown sheet, unresolvable PDF,
    or crop error all persist the event with a NULL relpath).
    """
    if not await store.project_exists(body.project_id):
        raise HTTPException(
            status_code=404, detail=f"Unknown project_id '{body.project_id}'."
        )
    feedback_id = str(uuid.uuid4())
    crop_relpath: str | None = None
    if body.bounding_box_pt is not None:
        try:
            sheet = await store.get_sheet(body.sheet_id)
            if sheet is not None and sheet.get("pdf_path"):
                if body.page_index is not None:
                    page_index = body.page_index
                else:
                    try:
                        page_index = int(sheet.get("page_index", 0))
                    except (TypeError, ValueError):
                        page_index = 0
                if page_index >= 0:
                    from src.meta_services.feedback_service import capture_feedback_crop

                    resolved_pdf = resolve_contained_pdf(str(sheet["pdf_path"]))
                    x0, y0, x1, y1 = (float(c) for c in body.bounding_box_pt)
                    crop_relpath = await run_in_threadpool(
                        capture_feedback_crop,
                        str(resolved_pdf),
                        page_index,
                        (x0, y0, x1, y1),
                        feedback_id,
                        body.project_id,
                    )
        except Exception:  # noqa: BLE001 - best-effort crop must never fail the event
            # Best-effort context only: a crop failure must never fail the event.
            crop_relpath = None
    feedback_id = await store.record_feedback_event(
        feedback_id=feedback_id,
        project_id=body.project_id,
        sheet_id=body.sheet_id,
        item_id=body.item_id,
        task_type=body.task_type,
        action=body.action,
        previous_status=body.previous_status,
        new_status=body.new_status,
        original_output_json=(
            json.dumps(body.original_output) if body.original_output is not None else None
        ),
        corrected_output_json=(
            json.dumps(body.corrected_output) if body.corrected_output is not None else None
        ),
        correction_reason=body.correction_reason,
        bounding_box_pt_json=(
            json.dumps(body.bounding_box_pt) if body.bounding_box_pt is not None else None
        ),
        crop_storage_relpath=crop_relpath,
        model_version=body.model_version,
        prompt_version=body.prompt_version,
        reviewer_session_id=body.reviewer_session_id,
    )
    return FeedbackEventResponse(feedback_id=feedback_id, training_eligible=False)


# ---------------------------------------------------------
# Takeoff Ledger & Store Endpoints
# ---------------------------------------------------------


@router.post("/takeoff/reconcile", response_model=ReconciliationReport)
async def reconcile_takeoff_route(request: TakeoffReconcileRequest):
    """Reconcile scheduled equipment against plan symbols (deterministic, offline).

    Only ``reconcile_takeoff`` is called: the dict/store convenience wrappers
    fabricate confidence/coordinate defaults and are forbidden here.
    Ghost-pin ``location_pt`` values in the report are dock/suggested
    placement coordinates, never measured equipment locations.
    """
    try:
        if request.plan_symbols is not None:
            return reconcile_takeoff(
                scheduled_items=request.scheduled_items,
                plan_symbols=request.plan_symbols,
                project_id=request.project_id or "",
                sheet_id=request.sheet_id,
            )
        if request.symbol_counts is not None:
            return reconcile_takeoff(
                scheduled_items=request.scheduled_items,
                symbol_counts=request.symbol_counts,
                project_id=request.project_id or "",
                sheet_id=request.sheet_id,
            )
        return reconcile_takeoff(
            scheduled_items=request.scheduled_items,
            plan_symbols=[],
            project_id=request.project_id or "",
            sheet_id=request.sheet_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (RuntimeError, OSError) as e:
        raise HTTPException(status_code=502, detail=f"Reconciliation failed: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Reconciliation failed: {e}") from e


@router.get("/takeoff/items", response_model=list[TakeoffRecord])
async def list_takeoff_items(
    store: TakeoffStoreDep,
    project_id: str | None = None,
    sheet_id: str | None = None,
    status: str | None = None,
):
    """Retrieve takeoff line items with optional project, sheet, or status filters."""
    return await store.list_items(project_id=project_id, sheet_id=sheet_id, status=status)


@router.post("/takeoff/items", response_model=TakeoffRecord)
async def create_takeoff_item(
    item: TakeoffRecord,
    store: TakeoffStoreDep,
):
    """Add a new takeoff item to the ledger."""
    await store.add_takeoff_item(item)
    return item


@router.patch("/takeoff/items/{item_id}/status")
async def update_takeoff_status(
    item_id: str,
    body: StatusUpdateRequest,
    store: TakeoffStoreDep,
):
    """One-click Accept, Correct, Reject, or Cannot-Determine human decision.

    Fail-closed: unknown items are 404, illegal transitions are 400,
    acceptance on an UNVERIFIED-scale sheet is 409, and missing/invalid
    override reasons are 422 (enforced by schema validation above and by
    the store as defense in depth).
    """
    try:
        success = await store.update_item_status(
            item_id, body.status, action=body.action, reason=body.reason
        )
    except ValueError as e:
        message = str(e)
        lowered = message.lower()
        if "reason" in lowered:
            raise HTTPException(status_code=422, detail=message) from e
        if "unverified" in lowered:
            raise HTTPException(status_code=409, detail=message) from e
        raise HTTPException(status_code=400, detail=message) from e
    if not success:
        raise HTTPException(status_code=404, detail=f"Takeoff item '{item_id}' not found")
    return {"item_id": item_id, "status": body.status, "updated": True}


@router.get("/takeoff/items/{item_id}/history", response_model=list[ReviewEventResponse])
async def get_takeoff_item_history(
    item_id: str,
    store: TakeoffStoreDep,
):
    """Chronological append-only audit trail for one takeoff item."""
    history = await store.get_item_history(item_id)
    if not history:
        items = await store.list_items()
        if not any(i.item_id == item_id for i in items):
            raise HTTPException(status_code=404, detail=f"Takeoff item '{item_id}' not found")
    return history


@router.get("/takeoff/summary", response_model=list[LedgerSummaryRow])
async def get_takeoff_summary(
    store: TakeoffStoreDep,
    project_id: str | None = None,
    sheet_id: str | None = None,
):
    """Aggregated ledger summary grouped by category, system, and dimension label."""
    return await store.get_ledger_summary(project_id=project_id, sheet_id=sheet_id)


@router.get("/takeoff/export/csv")
async def export_takeoff_csv(
    store: TakeoffStoreDep,
    project_id: str | None = None,
    sheet_id: str | None = None,
    include_items: bool = True,
):
    """Export standard Estimating compatible CSV takeoff file.

    Item rows (with physical coordinates and footage) are included by
    default so an export always carries auditable geometry.
    """
    csv_content = await store.export_csv(project_id=project_id, sheet_id=sheet_id, include_items=include_items)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bluetrace_takeoff.csv"},
    )


@router.get("/takeoff/export/json")
async def export_takeoff_json(
    store: TakeoffStoreDep,
    project_id: str | None = None,
    sheet_id: str | None = None,
):
    """Export complete structured takeoff dataset with summary and line items."""
    return await store.export_json(project_id=project_id, sheet_id=sheet_id)


# ---------------------------------------------------------
# BYOK Runtime Security Endpoints
# ---------------------------------------------------------


class ByokRequest(BaseModel):
    api_key: str


class ByokResponse(BaseModel):
    configured: bool
    masked_key: str | None = None
    session_id: str | None = None


@router.post("/auth/byok", response_model=ByokResponse)
async def configure_byok(
    body: ByokRequest,
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
):
    """Configures evaluation API key in server memory only (never written to disk or logs)."""
    key = body.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    session_id = x_session_id or "default"
    _session_keys[session_id] = {
        "key": key,
        "expires_at": time.time() + 4 * 3600,
    }
    # Setting a key is an explicit opt-in: clear any prior opt-out for this session.
    _disabled_sessions.discard(session_id)
    masked = f"••••{key[-4:]}" if len(key) >= 4 else "••••"
    return ByokResponse(configured=True, masked_key=masked, session_id=session_id)


@router.delete("/auth/byok")
async def clear_byok(
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
):
    """Clears runtime API key for this session only.

    The opt-out is scoped to the calling session: other sessions keep their
    keys, and a session that never opted out still resolves normally.
    """
    session_id = x_session_id or "default"
    _session_keys.pop(session_id, None)
    _disabled_sessions.add(session_id)
    return {"configured": False, "cleared": True}


# ---------------------------------------------------------------------------
# M4: Product-agent endpoints (orchestrate / reconcile / watchdog / QA feed)
# ---------------------------------------------------------------------------


class OrchestrateRequest(BaseModel):
    file_path: str
    project_id: str | None = None
    job_id: str | None = None


class OrchestrateResponse(BaseModel):
    job_id: str
    project_id: str
    document_map: dict[str, Any]
    routes: list[dict[str, Any]]
    flags: list[dict[str, Any]]
    sheets_processed: int


@router.post("/agents/orchestrate", response_model=OrchestrateResponse)
async def run_agent_orchestration(
    body: OrchestrateRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Runs the full agent pipeline (recon -> route -> perceive -> persist) on one PDF."""
    clean_path = resolve_contained_pdf(body.file_path)
    candidate = body.project_id if body.project_id is not None else _default_project_id(body.file_path)
    try:
        project_id = validate_project_id(candidate)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {e}") from e
    job_id = body.job_id or uuid.uuid4().hex[:12]

    registry = AgentRegistry()
    registry.register(ReconAgent(client=client))
    registry.register(FinderL1Agent(client=client))
    registry.register(TracerL2Agent())
    registry.register(ScheduleReconcilerAgent(client=client, store=store))
    orchestrator = OrchestratorAgent(registry=registry, store=store)
    context = AgentContext(project_id=project_id, job_id=job_id, pdf_path=clean_path)
    result = await orchestrator.run(context)
    doc_map: dict[str, Any] = result.document_map.model_dump() if result.document_map else {
        "job_id": job_id,
        "pdf_path": str(clean_path),
        "total_pages": 0,
        "sheets": [],
        "routes": [],
        "evidence_inventory": [],
    }
    flags = [
        e.payload for e in result.events if e.event_type == AgentEventType.FLAG_RAISED
    ]
    return OrchestrateResponse(
        job_id=job_id,
        project_id=project_id,
        document_map=doc_map,
        routes=list(doc_map.get("routes", [])),
        flags=flags,
        sheets_processed=result.sheets_processed,
    )


class ReconcileAgentRequest(BaseModel):
    project_id: str
    file_path: str
    page_index: int = 0
    schedule_title: str | None = None
    plan_sheet_ids: list[str] | None = None
    job_id: str | None = None


class ReconcileAgentResponse(BaseModel):
    job_id: str
    project_id: str
    schedule_sheet_id: str
    indexed: bool
    rows: list[dict[str, Any]]
    links: list[dict[str, Any]]
    family_counts: list[dict[str, Any]]
    report: dict[str, Any] | None
    flags: list[dict[str, Any]]
    mock_rows: bool
    review_required: bool


@router.post("/agents/reconcile", response_model=ReconcileAgentResponse)
async def run_schedule_reconciler(
    body: ReconcileAgentRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Runs Agent 04 schedule reconciliation on one indexed (or standalone) schedule sheet."""
    clean_path = resolve_contained_pdf(body.file_path)
    try:
        project_id = validate_project_id(body.project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {e}") from e
    job_id = body.job_id or uuid.uuid4().hex[:12]

    sheet_rows = await store.list_sheets(project_id)
    sheet_meta: SheetMetadata | None = None
    for row in sheet_rows:
        if row.get("page_index") != body.page_index:
            continue
        if str(row.get("pdf_path") or "") != str(clean_path):
            continue
        discipline = str(row.get("discipline") or "GENERAL")
        if discipline not in ("MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"):
            discipline = "GENERAL"
        scale_status = str(row.get("scale_status") or "UNVERIFIED")
        if scale_status not in ("VERIFIED", "UNVERIFIED", "CALIBRATED"):
            scale_status = "UNVERIFIED"
        sheet_meta = SheetMetadata(
            sheet_id=str(row["sheet_id"]),
            page_index=int(row["page_index"]),
            sheet_number=str(row.get("sheet_number") or ""),
            sheet_title=str(row.get("sheet_title") or "Equipment Schedule"),
            discipline=discipline,  # type: ignore[arg-type]
            scale_raw=row.get("scale_raw"),
            scale_ratio=row.get("scale_ratio"),
            scale_status=scale_status,  # type: ignore[arg-type]
            width_pt=float(row.get("width_pt") or 0.0),
            height_pt=float(row.get("height_pt") or 0.0),
        )
        break

    if body.plan_sheet_ids is None:
        plan_items = await store.list_items(project_id=project_id)
    else:
        known_ids = {str(r.get("sheet_id")) for r in sheet_rows}
        unknown = [sid for sid in body.plan_sheet_ids if sid not in known_ids]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown plan_sheet_ids: {unknown}")
        plan_items = []
        for sid in body.plan_sheet_ids:
            plan_items.extend(await store.list_items(project_id=project_id, sheet_id=sid))

    agent = ScheduleReconcilerAgent(client=client, store=store)
    context = AgentContext(project_id=project_id, job_id=job_id, pdf_path=clean_path)
    result = await agent.run(
        context,
        page_index=body.page_index,
        sheet_metadata=sheet_meta,
        schedule_title=body.schedule_title,
        plan_items=plan_items,
    )
    return ReconcileAgentResponse(
        job_id=job_id,
        project_id=project_id,
        schedule_sheet_id=result.schedule_sheet_id or "",
        indexed=sheet_meta is not None,
        rows=[r.model_dump() for r in result.rows],
        links=[link.model_dump() for link in result.links],
        family_counts=[f.model_dump() for f in result.family_counts],
        report=result.report,
        flags=result.flags,
        mock_rows=result.mock_rows,
        review_required=result.review_required,
    )


class WatchdogRequest(BaseModel):
    project_id: str
    job_id: str | None = None
    sheet_ids: list[str] | None = None
    reconcile_flags: list[dict[str, Any]] | None = None


class WatchdogResponse(BaseModel):
    job_id: str
    project_id: str
    annotations: list[dict[str, Any]]
    checklist: list[dict[str, Any]]
    checks_run: list[str]
    rules_only: bool
    persisted: bool
    review_required: bool


@router.post("/agents/watchdog", response_model=WatchdogResponse)
async def run_watchdog_qa(body: WatchdogRequest, store: TakeoffStoreDep):
    """Runs Agent 05 watchdog QA (RULES_ONLY) over a project's ledger."""
    try:
        project_id = validate_project_id(body.project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid project_id: {e}") from e
    job_id = body.job_id or uuid.uuid4().hex[:12]
    agent = WatchdogQAAgent(store=store)
    context = AgentContext(project_id=project_id, job_id=job_id)
    result = await agent.run(context, sheet_ids=body.sheet_ids, reconcile_flags=body.reconcile_flags)
    return WatchdogResponse(
        job_id=job_id,
        project_id=project_id,
        annotations=[a.model_dump() for a in result.annotations],
        checklist=[c.model_dump() for c in result.checklist],
        checks_run=result.checks_run,
        rules_only=result.rules_only,
        persisted=result.persisted,
        review_required=result.review_required,
    )


class QAAnnotationResponse(BaseModel):
    annotation_id: str
    project_id: str
    sheet_id: str | None = None
    annotation_type: str
    reason_code: str
    severity: str
    message: str = ""
    geometry: dict[str, Any] | None = None
    evidence_ids: list[str] = []
    source_agent: str = ""
    status: str
    resolution_reason: str | None = None
    created_at: str
    updated_at: str


@router.get("/qa/annotations", response_model=list[QAAnnotationResponse])
async def list_qa_annotations(
    store: TakeoffStoreDep,
    project_id: str,
    sheet_id: str | None = None,
    status: str | None = None,
):
    """Lists watchdog QA annotation tasks (the human review queue)."""
    return await store.list_qa_annotations(project_id, sheet_id=sheet_id, status=status)


class QAResolveRequest(BaseModel):
    status: Literal["CONFIRMED", "DISMISSED"]
    resolution_reason: str | None = None


@router.patch("/qa/annotations/{annotation_id}", response_model=QAAnnotationResponse)
async def resolve_qa_annotation(
    annotation_id: str,
    body: QAResolveRequest,
    store: TakeoffStoreDep,
):
    """Confirms or dismisses one QA annotation (the human gate)."""
    try:
        updated = await store.update_qa_annotation_status(
            annotation_id, body.status, body.resolution_reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not updated:
        raise HTTPException(status_code=404, detail="QA annotation not found.")
    result = await store.get_qa_annotation(annotation_id)
    assert result is not None
    return result
