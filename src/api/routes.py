from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.meta_services.client import MetaModelClient
from src.meta_services.copilot import TakeoffCopilot
from src.meta_services.schedule_parser import ScheduleParser
from src.meta_services.sheet_scanner import SheetScanner
from src.models.schemas import (
    CopilotQueryRequest,
    CopilotQueryResponse,
    CursorCropRequest,
    CursorCropResponse,
    DimensionExtraction,
    MetaFileUploadRequest,
    MetaFileUploadResponse,
    SheetMetadata,
    UploadResponse,
)
from src.store.takeoff_store import LedgerSummaryRow, TakeoffRecord, TakeoffStore

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
    """Resolves a workspace-relative PDF path or raises 403/404.

    Single containment gate for every endpoint that reads a drawing file:
    fixtures/ and data/ only, .pdf suffix only, must exist.
    """
    clean_path = Path(pdf_path)
    if clean_path.is_absolute():
        raise HTTPException(status_code=403, detail="Access denied: absolute paths are not accepted.")
    workspace_root = Path.cwd().resolve()
    resolved = (workspace_root / clean_path).resolve()
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
    if not resolved.exists():
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


class StatusUpdateRequest(BaseModel):
    status: Literal["SUGGESTED", "ACCEPTED", "REJECTED"]
    action: str = "USER_REVIEW"


class SheetScanRequest(BaseModel):
    pdf_path: str
    page_index: int = 0


class ScheduleParseRequest(BaseModel):
    image_base64: str
    schedule_title: str = "MEP Equipment Schedule"
    project_id: str = "default_project"
    sheet_id: str = "default_sheet"
    page_text_blocks: list[tuple[str, list[float]]] = Field(default_factory=list)


class SegmentConceptRequest(BaseModel):
    image_base64: str
    concept_prompt: str = "mechanical equipment boundary"


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
):
    """Automated SheetScan title block reconnaissance via muse-spark-1.3."""
    clean_path = resolve_contained_pdf(request.pdf_path)

    scanner = SheetScanner(client=client)
    try:
        return await run_in_threadpool(scanner.scan_page, str(clean_path), page_index=request.page_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


@router.post("/crop-ocr", response_model=CursorCropResponse)
async def extract_cursor_crop(
    request: CursorCropRequest,
    client: MetaClientDep,
):
    """Sub-second point-of-need hover dimension extraction from a 300x300 px crop."""
    start_time = time.time()

    # Process crop with muse-spark-1.3
    result = client.parse_crop_ocr(request.image_base64)
    elapsed_ms = int((time.time() - start_time) * 1000)

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
# Takeoff Ledger & Store Endpoints
# ---------------------------------------------------------


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
    """One-click Accept, Reject, or Re-suggest human-in-the-loop decision."""
    success = await store.update_item_status(item_id, body.status, action=body.action)
    if not success:
        raise HTTPException(status_code=404, detail=f"Takeoff item '{item_id}' not found")
    return {"item_id": item_id, "status": body.status, "updated": True}


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
    include_items: bool = False,
):
    """Export standard Estimating compatible CSV takeoff file."""
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

