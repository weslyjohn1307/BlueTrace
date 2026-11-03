"""Product Agent 00: Orchestrator (Deterministic Code, No LLM).

Owns job sequencing, sheet enumeration, evidence identity minting,
fail-closed policy gate enforcement, and event stream broadcasting.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import pymupdf
from pydantic import BaseModel, ConfigDict, Field

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentRegistry,
    AgentResult,
    BaseAgent,
    ScaleStatus,
    SheetType,
)
from src.meta_services.sheet_scanner import SheetScanner
from src.meta_services.tiling import SheetTilingEngine as SheetTiler
from src.meta_services.tiling import Tile
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)


class SheetRoute(BaseModel):
    """Routing instructions for a single drawing sheet."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sheet_id: str
    page_index: int
    sheet_type: SheetType
    scale_status: ScaleStatus
    target_agents: list[str]
    status: Literal["routed", "skipped", "unreadable"]
    evidence_ids: list[str] = Field(default_factory=list)


class DocumentMap(BaseModel):
    """Complete manifest of indexed and routed sheets for a drawing package."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    project_id: str
    job_id: str
    pdf_path: str
    total_pages: int
    sheets: list[SheetMetadata]
    routes: list[SheetRoute]
    evidence_inventory: list[str]
    unreadable_pages: list[int] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OrchestratorResult(AgentResult):
    """Output payload of the Orchestrator agent."""

    document_map: DocumentMap | None = None
    sheets_processed: int = 0
    sheets_routed: int = 0
    flags_count: int = 0
    total_items_persisted: int = 0


class OrchestratorAgent(BaseAgent):
    """Product Agent 00: Deterministic router and fail-closed gate supervisor."""

    agent_id: str = AgentID.AGENT_00_ORCHESTRATOR.value
    agent_name: str = "Product Agent 00 (Orchestrator)"
    is_llm_agent: bool = False

    def __init__(
        self,
        registry: AgentRegistry | None = None,
        store: TakeoffStore | None = None,
        tiler: SheetTiler | None = None,
    ) -> None:
        self.registry = registry or AgentRegistry()
        self.store = store
        self.tiler = tiler or SheetTiler()

    @staticmethod
    def _open_pdf(pdf_path: Path | str) -> pymupdf.Document:
        try:
            return pymupdf.open(str(pdf_path))
        except Exception as exc:
            raise ValueError(f"Could not open PDF file {pdf_path}: {exc}") from exc

    def route_sheet_type(self, sheet_type: SheetType) -> list[str]:
        """Apply deterministic routing table from 00-orchestrator.md."""
        if sheet_type == SheetType.PLAN:
            return [AgentID.AGENT_02_FINDER.value, AgentID.AGENT_03_TRACER.value]
        if sheet_type == SheetType.SCHEDULE:
            return [AgentID.AGENT_04_RECONCILER.value]
        if sheet_type == SheetType.LEGEND:
            return [AgentID.AGENT_02_FINDER.value]
        return []

    def tile_sheet_for_vlm(self, pdf_path: Path | str, page_index: int, sheet_id: str) -> list[Tile]:
        """Tile a single sheet with 20% overlap, minting evidence IDs per tile."""
        doc = self._open_pdf(pdf_path)
        try:
            page = doc[page_index]
            return self.tiler.tile_sheet(page)
        finally:
            doc.close()

    def enforce_fail_closed_gates(
        self,
        sheet: SheetMetadata,
        items: list[TakeoffRecord],
    ) -> tuple[list[TakeoffRecord], list[dict[str, Any]]]:
        """Enforce FAIL_CLOSED.md gates before writing takeoff items to database."""
        sanitized_items: list[TakeoffRecord] = []
        flags: list[dict[str, Any]] = []

        is_scale_valid = sheet.scale_status in (ScaleStatus.VERIFIED.value, ScaleStatus.CALIBRATED.value)

        for item in items:
            # Gate 1: Scale Gate (Fail-Closed Scale Rule)
            if not is_scale_valid and item.category in ("DUCTWORK", "PIPING"):
                item.total_length_ft = 0.0
                item.review_required = True
                flags.append({
                    "flag_id": uuid.uuid4().hex[:12],
                    "sheet_id": sheet.sheet_id,
                    "item_id": item.item_id,
                    "type": "SCALE_UNVERIFIED_LINEAR_LOCKED",
                    "severity": "HIGH",
                    "message": f"Linear item {item.item_id} footage locked to 0.0 because scale is {sheet.scale_status}",
                })

            # Gate 2: Evidence Gate
            has_geometry = bool(item.geometry) and (
                isinstance(item.geometry, (dict, list)) and len(item.geometry) > 0
            )
            if not has_geometry:
                flags.append({
                    "flag_id": uuid.uuid4().hex[:12],
                    "sheet_id": sheet.sheet_id,
                    "item_id": item.item_id,
                    "type": "MISSING_EVIDENCE_GEOMETRY",
                    "severity": "CRITICAL",
                    "message": f"Item {item.item_id} rejected: missing physical geometry coordinates",
                })
                continue

            # Gate 3: Human-in-the-Loop Status Gate
            # Automated models propose (SUGGESTED); humans approve (ACCEPTED)
            if item.status == "ACCEPTED":
                item.status = "SUGGESTED"

            sanitized_items.append(item)

        return sanitized_items, flags

    async def run(self, context: AgentContext, **kwargs: Any) -> OrchestratorResult:
        """Run full orchestration batch synchronously."""
        events: list[AgentEvent] = []
        async for ev in self.orchestrate_stream(context):
            events.append(ev)

        last_event = events[-1] if events else None
        doc_map_raw = last_event.payload.get("document_map") if last_event else None
        doc_map = DocumentMap(**doc_map_raw) if isinstance(doc_map_raw, dict) else None

        return OrchestratorResult(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=not any(e.event_type == AgentEventType.FAILED for e in events),
            document_map=doc_map,
            sheets_processed=len(doc_map.sheets) if doc_map else 0,
            sheets_routed=len(doc_map.routes) if doc_map else 0,
            events=events,
        )

    async def orchestrate_stream(self, context: AgentContext) -> AsyncGenerator[AgentEvent, None]:
        """Stream orchestration progress events over SSE."""
        start_time = time.monotonic()
        job_id = context.job_id
        pdf_path = context.pdf_path
        ev_gen = context.evidence_generator

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.STARTED,
            progress=0.0,
            message=f"Orchestrator started for package: {pdf_path.name}",
        )

        # 1. Enumerate Pages
        try:
            doc = self._open_pdf(pdf_path)
            total_pages = len(doc)
            doc.close()
        except Exception as exc:  # noqa: BLE001
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FAILED,
                progress=1.0,
                message=f"Failed to open package: {exc}",
                payload={"error": str(exc)},
            )
            return

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.SHEET_DISCOVERED,
            progress=0.05,
            message=f"Discovered {total_pages} sheets in package",
            payload={"total_pages": total_pages},
        )

        sheets: list[SheetMetadata] = []
        routes: list[SheetRoute] = []
        unreadable_pages: list[int] = []

        # 2. Process Recon per sheet
        # Use Agent 01 if registered; fallback to native SheetScanner
        recon_agent = self.registry.get(AgentID.AGENT_01_RECON.value)
        scanner = SheetScanner()

        for page_idx in range(total_pages):
            page_ev_id = ev_gen.mint("page", suffix=f"p{page_idx}")
            try:
                sheet_meta: SheetMetadata
                sheet_type: SheetType

                if recon_agent and hasattr(recon_agent, "recon_sheet"):
                    recon_res = await recon_agent.recon_sheet(
                        pdf_path,
                        page_index=page_idx,
                        project_id=context.project_id,
                        job_id=job_id,
                        evidence_generator=ev_gen,
                    )
                    sheet_meta = recon_res.to_metadata()
                    sheet_type = recon_res.sheet_type
                elif recon_agent:
                    recon_out = await recon_agent.run(context, page_index=page_idx)
                    sheet_type = recon_out.sheet_type or SheetType.OTHER
                    sheet_meta = scanner.scan_page(pdf_path, page_index=page_idx)
                else:
                    sheet_meta = scanner.scan_page(pdf_path, page_index=page_idx)
                    # Heuristic classification for M1 standalone fallback
                    title_upper = sheet_meta.sheet_title.upper()
                    num_upper = sheet_meta.sheet_number.upper()
                    if "SCHEDULE" in title_upper or "SCHEDULE" in num_upper:
                        sheet_type = SheetType.SCHEDULE
                    elif "LEGEND" in title_upper or "LEGEND" in num_upper:
                        sheet_type = SheetType.LEGEND
                    elif "DETAIL" in title_upper:
                        sheet_type = SheetType.DETAIL
                    elif "RISER" in title_upper or "DIAGRAM" in title_upper:
                        sheet_type = SheetType.RISER
                    elif any(k in title_upper for k in ["PLAN", "FLOOR", "LEVEL"]):
                        sheet_type = SheetType.PLAN
                    else:
                        sheet_type = SheetType.PLAN

                sheet_ev_id = ev_gen.mint_sheet_evidence(sheet_meta.sheet_id)
                tb_ev_id = ev_gen.mint_title_block_evidence(sheet_meta.sheet_id)

                # Persist to store if available
                if self.store:
                    await self.store.insert_sheet(
                        sheet_id=sheet_meta.sheet_id,
                        project_id=context.project_id,
                        page_index=page_idx,
                        sheet_number=sheet_meta.sheet_number,
                        sheet_title=sheet_meta.sheet_title,
                        discipline=sheet_meta.discipline,
                        scale_raw=sheet_meta.scale_raw,
                        scale_ratio=sheet_meta.scale_ratio,
                        scale_status=sheet_meta.scale_status,
                        width_pt=sheet_meta.width_pt,
                        height_pt=sheet_meta.height_pt,
                        pdf_path=str(pdf_path),
                    )

                sheets.append(sheet_meta)

                # 3. Apply Routing
                target_agents = self.route_sheet_type(sheet_type)
                status_val: Literal["routed", "skipped", "unreadable"] = "routed" if target_agents else "skipped"
                scale_stat = (
                    ScaleStatus(sheet_meta.scale_status)
                    if sheet_meta.scale_status in ScaleStatus._value2member_map_
                    else ScaleStatus.UNVERIFIED
                )

                route = SheetRoute(
                    sheet_id=sheet_meta.sheet_id,
                    page_index=page_idx,
                    sheet_type=sheet_type,
                    scale_status=scale_stat,
                    target_agents=target_agents,
                    status=status_val,
                    evidence_ids=[page_ev_id, sheet_ev_id, tb_ev_id],
                )
                routes.append(route)

                progress_val = 0.05 + 0.85 * ((page_idx + 1) / total_pages)
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.SHEET_CLASSIFIED,
                    sheet_id=sheet_meta.sheet_id,
                    page_index=page_idx,
                    progress=round(progress_val, 3),
                    message=f"Sheet {sheet_meta.sheet_number} ({sheet_meta.sheet_title}) classified as {sheet_type.value}",
                    payload={
                        "sheet_id": sheet_meta.sheet_id,
                        "sheet_type": sheet_type.value,
                        "scale_status": sheet_meta.scale_status,
                        "target_agents": target_agents,
                    },
                )

                # 4. Dispatch Downstream Product Agents for Routed Sheets
                if status_val == "routed":
                    for target_agent_id in target_agents:
                        agent = self.registry.get(target_agent_id)
                        if agent is None:
                            logger.warning(
                                "Target agent %s not registered in AgentRegistry; skipping",
                                target_agent_id,
                            )
                            yield AgentEvent(
                                job_id=job_id,
                                agent_id=self.agent_id,
                                event_type=AgentEventType.WARNING,
                                sheet_id=sheet_meta.sheet_id,
                                page_index=page_idx,
                                progress=round(progress_val, 3),
                                message=f"Target agent {target_agent_id} not registered; skipping",
                                payload={"target_agent": target_agent_id, "sheet_id": sheet_meta.sheet_id},
                            )
                            continue

                        yield AgentEvent(
                            job_id=job_id,
                            agent_id=self.agent_id,
                            event_type=AgentEventType.AGENT_DISPATCHED,
                            sheet_id=sheet_meta.sheet_id,
                            page_index=page_idx,
                            progress=round(progress_val, 3),
                            message=f"Dispatching {agent.agent_name} for sheet {sheet_meta.sheet_number}",
                            payload={"target_agent": agent.agent_id, "sheet_id": sheet_meta.sheet_id},
                        )

                        # Execute agent and stream events
                        items_collected: list[TakeoffRecord] = []
                        if hasattr(agent, "run_stream"):
                            async for sub_ev in agent.run_stream(
                                context,
                                sheet_metadata=sheet_meta,
                                page_index=page_idx,
                            ):
                                yield sub_ev
                                if sub_ev.event_type == AgentEventType.ITEMS_EMITTED:
                                    raw_items = sub_ev.payload.get("items", [])
                                    if raw_items:
                                        items_collected.extend(
                                            [it if isinstance(it, TakeoffRecord) else TakeoffRecord(**it) for it in raw_items]
                                        )

                        else:
                            agent_result = await agent.run(context, sheet_metadata=sheet_meta, page_index=page_idx)
                            items_collected = agent_result.items
                            for sub_ev in agent_result.events:
                                yield sub_ev

                        # Enforce fail-closed gates before persistence
                        sanitized_items, gate_flags = self.enforce_fail_closed_gates(sheet_meta, items_collected)

                        # Ensure consistent project_id across all persisted items
                        for item in sanitized_items:
                            item.project_id = context.project_id

                        if gate_flags:
                            for flag in gate_flags:
                                yield AgentEvent(
                                    job_id=job_id,
                                    agent_id=self.agent_id,
                                    event_type=AgentEventType.FLAG_RAISED,
                                    sheet_id=sheet_meta.sheet_id,
                                    page_index=page_idx,
                                    progress=round(progress_val, 3),
                                    message=flag["message"],
                                    payload=flag,
                                )

                        # Persist to database store
                        if self.store and sanitized_items:
                            await self.store.bulk_add_takeoff_items(sanitized_items)

                        yield AgentEvent(
                            job_id=job_id,
                            agent_id=agent.agent_id,
                            event_type=AgentEventType.ITEMS_EMITTED,
                            sheet_id=sheet_meta.sheet_id,
                            page_index=page_idx,
                            progress=round(progress_val, 3),
                            message=f"Persisted {len(sanitized_items)} items from {agent.agent_id} for sheet {sheet_meta.sheet_number}",
                            payload={
                                "sheet_id": sheet_meta.sheet_id,
                                "agent_id": agent.agent_id,
                                "item_count": len(sanitized_items),
                                "flags_count": len(gate_flags),
                            },
                        )

                        yield AgentEvent(
                            job_id=job_id,
                            agent_id=self.agent_id,
                            event_type=AgentEventType.AGENT_COMPLETED,
                            sheet_id=sheet_meta.sheet_id,
                            page_index=page_idx,
                            progress=round(progress_val, 3),
                            message=f"Agent {agent.agent_id} finished execution for sheet {sheet_meta.sheet_number}",
                            payload={
                                "agent_id": agent.agent_id,
                                "items_count": len(sanitized_items),
                            },
                        )

            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to process sheet on page %s: %s", page_idx, exc)
                unreadable_pages.append(page_idx)
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.WARNING,
                    page_index=page_idx,
                    progress=0.05 + 0.85 * ((page_idx + 1) / total_pages),
                    message=f"Page {page_idx} unreadable: {exc}",
                    payload={"page_index": page_idx, "error": str(exc)},
                )

        # 4. Final Manifest & Completion Event
        doc_map = DocumentMap(
            project_id=context.project_id,
            job_id=job_id,
            pdf_path=str(pdf_path),
            total_pages=total_pages,
            sheets=sheets,
            routes=routes,
            evidence_inventory=ev_gen.list_evidence_ids(),
            unreadable_pages=unreadable_pages,
        )

        elapsed = round(time.monotonic() - start_time, 2)
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.COMPLETED,
            progress=1.0,
            message=f"Orchestration complete: {len(sheets)} sheets indexed, {len(routes)} routed in {elapsed}s",
            payload={
                "document_map": doc_map.model_dump(),
                "sheets_indexed": len(sheets),
                "unreadable_count": len(unreadable_pages),
                "elapsed_seconds": elapsed,
            },
        )
