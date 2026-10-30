from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response
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
    SheetMetadata,
)
from src.store.takeoff_store import LedgerSummaryRow, TakeoffRecord, TakeoffStore

router = APIRouter(prefix="/api")

_store_instance: TakeoffStore | None = None
_session_keys: dict[str, dict[str, Any]] = {}
_byok_disabled_for_session: bool = False


def set_takeoff_store(store: TakeoffStore | None) -> None:
    """Sets or resets the active TakeoffStore instance (useful for test isolation)."""
    global _store_instance
    _store_instance = store


def get_meta_client(x_session_id: str | None = Header(default=None, alias="X-Session-ID")) -> MetaModelClient:
    """Session-scoped MetaModelClient resolution."""
    # 1. Session-scoped BYOK key
    if x_session_id and x_session_id in _session_keys:
        session_info = _session_keys[x_session_id]
        if time.time() < session_info["expires_at"]:
            return MetaModelClient(api_key=session_info["key"])
        del _session_keys[x_session_id]

    # 2. Default in-memory session key
    if "default" in _session_keys:
        session_info = _session_keys["default"]
        if time.time() < session_info["expires_at"]:
            return MetaModelClient(api_key=session_info["key"])
        del _session_keys["default"]

    # 3. Explicitly cleared / logged-out session
    if _byok_disabled_for_session:
        return MetaModelClient(api_key="mock_key_unconfigured")

    # 4. Ambient environment key
    return MetaModelClient()


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
    clean_path = Path(request.pdf_path).resolve()
    workspace_root = Path.cwd().resolve()
    allowed_roots = [
        (workspace_root / "fixtures").resolve(),
        (workspace_root / "data").resolve(),
        workspace_root,
    ]
    is_allowed = any(clean_path == r or r in clean_path.parents for r in allowed_roots)
    if not is_allowed or clean_path.suffix.lower() != ".pdf":
        raise HTTPException(
            status_code=403,
            detail="Access denied: pdf_path must reside within workspace/fixtures and have .pdf extension.",
        )
    if not clean_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF drawing not found: {request.pdf_path}")

    scanner = SheetScanner(client=client)
    try:
        return await run_in_threadpool(scanner.scan_page, str(clean_path), page_index=request.page_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    if result.get("review_required") or result.get("width") is None:
        return CursorCropResponse(
            latency_ms=elapsed_ms,
            detected_text=result.get("detected_text", ""),
            parsed_dimension=None,
            confidence=0.0,
            badge_text=result.get("badge_text", "Review Required (Unparsed Dimension)"),
            review_required=True,
        )

    width = float(result.get("width", 0.0))
    height = float(result["height"]) if result.get("height") is not None else None
    shape = result.get("shape", "RECTANGULAR")
    confidence = float(result.get("confidence", 0.95))
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
        review_required=False,
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


@router.post("/copilot", response_model=CopilotQueryResponse)
async def query_copilot(
    request: CopilotQueryRequest,
    client: MetaClientDep,
    store: TakeoffStoreDep,
):
    """Natural language drawing query grounded in project database and active sheet."""
    copilot = TakeoffCopilot(client=client, store=store)
    return await copilot.answer_query(request)


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
):
    """Export standard Estimating / DesktopT compatible CSV takeoff file."""
    csv_content = await store.export_csv(project_id=project_id, sheet_id=sheet_id)
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
    global _byok_disabled_for_session
    key = body.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    session_id = x_session_id or "default"
    _session_keys[session_id] = {
        "key": key,
        "expires_at": time.time() + 4 * 3600,
    }
    _byok_disabled_for_session = False
    masked = f"••••{key[-4:]}" if len(key) >= 4 else "••••"
    return ByokResponse(configured=True, masked_key=masked, session_id=session_id)


@router.delete("/auth/byok")
async def clear_byok(
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
):
    """Clears runtime API key from server memory upon session reset or logout."""
    global _byok_disabled_for_session
    if x_session_id:
        _session_keys.pop(x_session_id, None)
    _session_keys.pop("default", None)
    _byok_disabled_for_session = True
    return {"configured": False, "cleared": True}

