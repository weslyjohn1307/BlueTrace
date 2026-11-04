"""Product Agent 02: Finder L1 Symbols (Spark 1.3 + SAM 3.1).

Discovers, locates, segments, and counts discrete MEP symbols across drawing
plan sheets adhering to the Legend-First invariant and fail-closed scale rules.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any, Literal

import pymupdf
from pydantic import BaseModel, ConfigDict, Field

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentResult,
    BaseAgent,
    EvidenceIDGenerator,
    ScaleStatus,
)
from src.meta_services.client import (
    PROFILE_HOVER_OCR,
    MetaModelClient,
)
from src.meta_services.legend_scanner import (
    LegendScanner,
    LegendScanResult,
    LegendSymbolEntry,
)
from src.meta_services.symbol_swarm import (
    _parse_verdict,
    build_verifier_prompt,
    run_swarm,
    swarm_outcomes_to_detections,
)
from src.meta_services.tiling import (
    PT_PER_PX_AT_150_DPI,
    TILE_PX_PER_NORM_UNIT,
    SheetTilingEngine,
    SymbolCandidate,
    Tile,
    apply_box_iou_nms,
    box_iou,
    tiles_to_swarm_input,
    untile_candidate,
)
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)


class SymbolDetectionCandidate(BaseModel):
    """Enriched candidate record following NMS, SAM refinement, and verification."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    candidate_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol_label: str
    description: str = ""
    system: str = "General"
    category: str = "EQUIPMENT"
    tile_col: int = 0
    tile_row: int = 0
    x_offset_px: int = 0
    y_offset_px: int = 0
    tile_bbox: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    bbox_pt: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    confidence: float = 0.80
    review_required: bool = True
    evidence_id: str = ""
    evidence_crop_id: str = ""
    source_tile: str = ""
    polygon: list[list[float]] = Field(default_factory=list)
    sam_refined: bool = False
    verifier_verdict: bool | None = None
    verifier_confidence: float | None = None
    verifier_disagreed: bool = False
    crop_base64: str = ""


class FinderL1Metrics(BaseModel):
    """Telemetry and execution accounting for Agent 02."""

    tiles_total: int = 0
    tiles_content: int = 0
    tiles_empty: int = 0
    exemplars_count: int = 0
    candidates_raw: int = 0
    candidates_post_nms: int = 0
    candidates_verified: int = 0
    candidates_demoted: int = 0
    sam_refined_count: int = 0
    offline_mode: bool = False
    duration_ms: int = 0


class FinderL1Result(AgentResult):
    """Structured output returned by FinderL1Agent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    symbol_counts: dict[str, int] = Field(default_factory=dict)
    candidates: list[SymbolDetectionCandidate] = Field(default_factory=list)
    exemplars: list[LegendSymbolEntry] = Field(default_factory=list)
    finder_metrics: FinderL1Metrics = Field(default_factory=FinderL1Metrics)


FinderL1Result.model_rebuild()


class FinderL1Agent(BaseAgent):
    """Product Agent 02: Finder L1 Symbols (Spark 1.3 + SAM 3.1).

    Discovers, locates, segments, and counts discrete MEP symbols across drawing
    plan sheets adhering to the Legend-First invariant and fail-closed scale rules.
    """

    agent_id: str = AgentID.AGENT_02_FINDER_L1.value
    agent_name: str = "Product Agent 02 (Finder L1 Symbols)"
    agent_version: str = "1.0.0"
    is_llm_agent: bool = True

    confidence_threshold: float = 0.70
    verifier_demote_factor: float = 0.20 / 0.70  # < 1.0 (demotes confidence to ~0.20)
    demoted_confidence: float = 0.20

    def __init__(
        self,
        client: MetaModelClient | None = None,
        legend_scanner: LegendScanner | None = None,
        tiler: SheetTilingEngine | None = None,
        store: TakeoffStore | None = None,
        max_concurrency: int = 4,
        confidence_threshold: float = 0.70,
        borderline_low: float = 0.70,
        borderline_high: float = 0.90,
        nms_iou_threshold: float = 0.45,
        sam_refine_threshold: float = 0.70,
    ) -> None:
        self.client = client or MetaModelClient()
        self.legend_scanner = legend_scanner or LegendScanner(client=self.client)
        self.tiler = tiler or SheetTilingEngine()
        self.store = store
        self.max_concurrency = max(1, int(max_concurrency))
        self.confidence_threshold = confidence_threshold
        self.borderline_low = borderline_low
        self.borderline_high = borderline_high
        self.nms_iou_threshold = nms_iou_threshold
        self.sam_refine_threshold = sam_refine_threshold

    # -----------------------------------------------------------------------
    # Phase 1: Legend Reconnaissance
    # -----------------------------------------------------------------------
    def parse_legend_exemplars(
        self,
        pdf_path: str | Path,
        page_index: int = 0,
        legend_crops: list[LegendSymbolEntry] | None = None,
        discipline: str = "mechanical",
    ) -> list[LegendSymbolEntry] | LegendScanResult:
        """Extract symbol vocabulary and 150 DPI exemplar glyph crops."""
        if legend_crops is not None:
            return legend_crops

        try:
            scan_res = self.legend_scanner.scan_sheet(
                pdf_path=pdf_path,
                page_index=page_index,
            )
            if scan_res.mock:
                # Offline fabrication: return the full result so callers see
                # mock=True and refuse it as evidence (legend-first invariant).
                return scan_res
            if scan_res.symbols:
                return scan_res.symbols
            return scan_res
        except Exception as exc:  # noqa: BLE001
            logger.warning("Legend scan failed (%s); falling back to mock exemplars", exc)
            return LegendScanResult(
                sheet_id=f"sheet_p{page_index}",
                legend_detected=False,
                symbols=[],
                confidence=0.0,
                mock=True,
                review_required=True,
            )

    # -----------------------------------------------------------------------
    # Phase 2: Sheet Tiling & Filtering
    # -----------------------------------------------------------------------
    def filter_tiles_for_inference(self, tiles: list[Tile]) -> list[Tile]:
        """Return only non-empty tiles containing measurable content."""
        return [t for t in tiles if t.status == "CONTENT"]

    def untile_bbox(
        self, candidate: SymbolCandidate | dict[str, Any]
    ) -> tuple[float, float, float, float]:
        """Convert normalized [u1, v1, u2, v2] in [0, 1000] to PDF points."""
        if isinstance(candidate, SymbolCandidate):
            return untile_candidate(candidate)

        tile_bbox = candidate.get("tile_bbox", (0.0, 0.0, 0.0, 0.0))
        x_offset = float(candidate.get("x_offset_px", 0))
        y_offset = float(candidate.get("y_offset_px", 0))
        u1, v1, u2, v2 = tile_bbox

        x1_px = x_offset + float(u1) * TILE_PX_PER_NORM_UNIT
        y1_px = y_offset + float(v1) * TILE_PX_PER_NORM_UNIT
        x2_px = x_offset + float(u2) * TILE_PX_PER_NORM_UNIT
        y2_px = y_offset + float(v2) * TILE_PX_PER_NORM_UNIT

        return (
            round(x1_px * PT_PER_PX_AT_150_DPI, 2),
            round(y1_px * PT_PER_PX_AT_150_DPI, 2),
            round(x2_px * PT_PER_PX_AT_150_DPI, 2),
            round(y2_px * PT_PER_PX_AT_150_DPI, 2),
        )

    # -----------------------------------------------------------------------
    # Phase 3: Candidate Discovery & Non-Maximum Suppression (NMS)
    # -----------------------------------------------------------------------
    def apply_nms(
        self,
        candidates: list[dict[str, Any]] | list[SymbolCandidate],
        iou_threshold: float = 0.45,
    ) -> list[dict[str, Any]] | list[SymbolCandidate]:
        """Deduplicate overlapping candidate bounding boxes using 2D Box IoU."""
        if not candidates:
            return []

        if isinstance(candidates[0], SymbolCandidate):
            sym_cands = [c for c in candidates if isinstance(c, SymbolCandidate)]
            return apply_box_iou_nms(sym_cands, iou_threshold=iou_threshold)

        # Dictionary-based candidate processing
        raw_list = [dict(c) for c in candidates if isinstance(c, dict)]
        for item in raw_list:
            if "bbox_pt" not in item and "tile_bbox" in item:
                item["bbox_pt"] = self.untile_bbox(item)

        raw_list.sort(key=lambda x: float(x.get("confidence", 0.0)), reverse=True)

        kept: list[dict[str, Any]] = []
        for cand in raw_list:
            bbox_a = cand.get("bbox_pt")
            if not bbox_a or len(bbox_a) != 4:
                continue
            drop = False
            for other in kept:
                bbox_b = other.get("bbox_pt")
                if not bbox_b or len(bbox_b) != 4:
                    continue
                iou = box_iou(bbox_a, bbox_b)
                if iou >= iou_threshold:
                    label_a = cand.get("label") or cand.get("symbol_label")
                    label_b = other.get("label") or other.get("symbol_label")
                    if label_a == label_b:
                        drop = True
                        break
                    cand["review_required"] = True
                    other["review_required"] = True
            if not drop:
                kept.append(cand)
        return kept

    # -----------------------------------------------------------------------
    # Phase 4: SAM 3.1 Mask & Bbox Refinement
    # -----------------------------------------------------------------------
    def refine_with_sam(
        self,
        raw_candidate: dict[str, Any] | SymbolCandidate,
        image_crop_b64: str | None = None,
    ) -> dict[str, Any]:
        """Refine candidate bounding box and polygon using SAM 3.1."""
        cand_dict = (
            raw_candidate
            if isinstance(raw_candidate, dict)
            else {
                "label": raw_candidate.symbol_label,
                "symbol_label": raw_candidate.symbol_label,
                "tile_col": raw_candidate.tile_col,
                "tile_row": raw_candidate.tile_row,
                "x_offset_px": raw_candidate.x_offset_px,
                "y_offset_px": raw_candidate.y_offset_px,
                "tile_bbox": raw_candidate.tile_bbox,
                "bbox_pt": raw_candidate.bbox_pt or untile_candidate(raw_candidate),
                "confidence": raw_candidate.confidence,
                "review_required": raw_candidate.review_required,
            }
        )
        res = dict(cand_dict)
        label = res.get("label") or res.get("symbol_label") or "symbol"

        if image_crop_b64 and self.client.is_configured():
            try:
                sam_func = getattr(self.client, "segment_concept", None)
                if sam_func is not None and not asyncio.iscoroutinefunction(sam_func):
                    sam_out = sam_func(
                        image_crop_b64,
                        concept_prompt=f"the {label} symbol glyph",
                    )
                    if asyncio.iscoroutine(sam_out):
                        sam_out.close()
                    elif sam_out and sam_out.get("polygons"):
                        res["polygon"] = sam_out["polygons"][0]
                        res["sam_refined"] = True
            except Exception as exc:  # noqa: BLE001
                logger.debug("SAM refinement call failed: %s", exc)

        if "geometry" not in res:
            bbox = res.get("bbox_pt", (0.0, 0.0, 0.0, 0.0))
            res["geometry"] = {"type": "bbox", "bbox": list(bbox)}

        return res

    async def refine_with_sam_async(
        self,
        raw_candidate: dict[str, Any] | SymbolCandidate,
        image_crop_b64: str | None = None,
    ) -> dict[str, Any]:
        """Async variant of SAM 3.1 refinement supporting segment_concept_async and segment_concept."""
        cand_dict = (
            raw_candidate
            if isinstance(raw_candidate, dict)
            else {
                "label": raw_candidate.symbol_label,
                "symbol_label": raw_candidate.symbol_label,
                "tile_col": raw_candidate.tile_col,
                "tile_row": raw_candidate.tile_row,
                "x_offset_px": raw_candidate.x_offset_px,
                "y_offset_px": raw_candidate.y_offset_px,
                "tile_bbox": raw_candidate.tile_bbox,
                "bbox_pt": raw_candidate.bbox_pt or untile_candidate(raw_candidate),
                "confidence": raw_candidate.confidence,
                "review_required": raw_candidate.review_required,
            }
        )
        res = dict(cand_dict)
        label = res.get("label") or res.get("symbol_label") or "symbol"

        if image_crop_b64 and self.client.is_configured():
            try:
                sam_async = getattr(self.client, "segment_concept_async", None)
                if sam_async is not None:
                    out = sam_async(
                        image_crop_b64,
                        concept_prompt=f"the {label} symbol glyph",
                    )
                    sam_out = await out if asyncio.iscoroutine(out) else out
                    if sam_out and sam_out.get("polygons"):
                        res["polygon"] = sam_out["polygons"][0]
                        res["sam_refined"] = True
                else:
                    sam_func = getattr(self.client, "segment_concept", None)
                    if sam_func is not None:
                        out = sam_func(
                            image_crop_b64,
                            concept_prompt=f"the {label} symbol glyph",
                        )
                        sam_out = await out if asyncio.iscoroutine(out) else out
                        if sam_out and sam_out.get("polygons"):
                            res["polygon"] = sam_out["polygons"][0]
                            res["sam_refined"] = True
            except Exception as exc:  # noqa: BLE001
                logger.debug("Async SAM refinement failed: %s", exc)

        if "geometry" not in res:
            bbox = res.get("bbox_pt", (0.0, 0.0, 0.0, 0.0))
            res["geometry"] = {"type": "bbox", "bbox": list(bbox)}

        return res

    def _extract_crop_b64(
        self,
        page: Any,
        bbox_pt: tuple[float, float, float, float],
        pad_pt: float = 14.4,
    ) -> str:
        """Extract a 150 DPI base64 PNG crop centered on candidate bbox."""
        if not hasattr(page, "get_pixmap"):
            return ""
        try:
            page_rect = page.rect
            target_size_pt = 144.0  # 300 px at 150 DPI (300 * 72 / 150 = 144 pt)
            cx = (bbox_pt[0] + bbox_pt[2]) / 2.0
            cy = (bbox_pt[1] + bbox_pt[3]) / 2.0
            bw = bbox_pt[2] - bbox_pt[0]
            bh = bbox_pt[3] - bbox_pt[1]

            half_w = max(target_size_pt / 2.0, (bw / 2.0) + pad_pt)
            half_h = max(target_size_pt / 2.0, (bh / 2.0) + pad_pt)

            clip = pymupdf.Rect(
                max(float(page_rect.x0), cx - half_w),
                max(float(page_rect.y0), cy - half_h),
                min(float(page_rect.x1), cx + half_w),
                min(float(page_rect.y1), cy + half_h),
            )
            if clip.is_empty or clip.width <= 0 or clip.height <= 0:
                return ""
            pix = page.get_pixmap(dpi=150, clip=clip)
            try:
                return base64.b64encode(pix.tobytes("png")).decode("ascii")
            finally:
                del pix
        except Exception as exc:  # noqa: BLE001
            logger.debug("Crop extraction failed for bbox %s: %s", bbox_pt, exc)
            return ""

    # -----------------------------------------------------------------------
    # Phase 5: Independent Verifier Pass
    # -----------------------------------------------------------------------
    def _verify_crop(self, crop_b64: str, label: str) -> dict[str, Any]:
        """Independent second Spark call verifying crop matches exemplar glyph."""
        if not self.client.is_configured():
            return {"verified": True, "confidence": 0.90}
        if not crop_b64:
            return {"verified": False, "confidence": self.demoted_confidence}
        prompt = build_verifier_prompt(label)
        try:
            content, _telemetry = self.client._execute_governed_completion(
                model="muse-spark-1.3",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{crop_b64}"},
                            },
                        ],
                    }
                ],
                profile=PROFILE_HOVER_OCR,
                temperature=0.0,
            )
            raw_str = content if isinstance(content, str) else ""
            match, conf = _parse_verdict(raw_str)
            if match is True:
                return {"verified": True, "confidence": conf if conf is not None else 0.90}
            if match is False:
                return {"verified": False, "confidence": self.demoted_confidence}
            # Fallback string matching if JSON structure was unstandardized
            clean_content = raw_str.lower()
            if '"match": true' in clean_content or '"match":true' in clean_content:
                return {"verified": True, "confidence": 0.90}
            return {"verified": False, "confidence": self.demoted_confidence}
        except Exception as exc:  # noqa: BLE001
            logger.debug("Crop verification call failed: %s", exc)
            return {"verified": False, "confidence": self.demoted_confidence}

    def run_verifier_pass(
        self, candidate: dict[str, Any] | SymbolDetectionCandidate
    ) -> dict[str, Any]:
        """Execute independent verifier check; disagreement demotes confidence to 0.20."""
        item = dict(candidate) if isinstance(candidate, dict) else candidate.model_dump()
        label = item.get("label") or item.get("symbol_label") or "symbol"
        crop_b64 = item.get("crop_b64") or item.get("crop_base64") or ""

        verdict = self._verify_crop(crop_b64, label)
        verified = verdict.get("verified", True)
        ver_conf = verdict.get("confidence", 0.90)

        item["verifier_verdict"] = verified
        item["verifier_confidence"] = ver_conf

        if not verified:
            # Demote confidence on verifier disagreement
            item["confidence"] = min(float(item.get("confidence", 0.88)), self.demoted_confidence)
            item["verifier_disagreed"] = True
            item["review_required"] = True
        else:
            item["verifier_disagreed"] = False
            item["review_required"] = True  # Always SUGGESTED for HITL gate

        return item

    # -----------------------------------------------------------------------
    # Phase 6: Takeoff Record Generation
    # -----------------------------------------------------------------------
    def to_takeoff_records(
        self,
        symbols: list[dict[str, Any]] | list[SymbolCandidate],
        sheet_meta: SheetMetadata,
        ev_gen: EvidenceIDGenerator,
        project_id: str | None = None,
    ) -> list[TakeoffRecord]:
        """Construct authoritative TakeoffRecord instances from detected symbols."""
        records: list[TakeoffRecord] = []
        width_pt = sheet_meta.width_pt or 1000.0
        height_pt = sheet_meta.height_pt or 800.0
        proj_id = project_id or getattr(ev_gen, "project_id", "default_project") or "default_project"

        for sym in symbols:
            if isinstance(sym, SymbolCandidate):
                label = sym.symbol_label
                bbox = sym.bbox_pt or untile_candidate(sym)
                conf = sym.confidence
                category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"] = "EQUIPMENT"
                system = "General"
                polygon: list[list[float]] = []
            else:
                label = sym.get("label") or sym.get("symbol_label") or "Symbol"
                raw_bbox = sym.get("bbox_pt") or sym.get("bbox") or (0.0, 0.0, 0.0, 0.0)
                bbox = tuple(raw_bbox)
                conf = float(sym.get("confidence", 0.85))
                category_val = sym.get("category", "EQUIPMENT").upper()
                if category_val in ("DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"):
                    category = category_val  # type: ignore[assignment]
                else:
                    category = "EQUIPMENT"
                system = sym.get("system", "General")
                polygon = sym.get("polygon", [])

            # Clamp bounding box coordinates strictly to sheet bounds
            x0 = max(0.0, min(width_pt, float(bbox[0])))
            y0 = max(0.0, min(height_pt, float(bbox[1])))
            x1 = max(0.0, min(width_pt, float(bbox[2])))
            y1 = max(0.0, min(height_pt, float(bbox[3])))
            if x0 > x1:
                x0, x1 = x1, x0
            if y0 > y1:
                y0, y1 = y1, y0
            clamped_bbox = [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)]

            item_uuid = uuid.uuid4().hex[:8]
            evidence_id = ev_gen.mint_item_evidence(sheet_meta.sheet_id, category, item_uuid)

            geom: dict[str, Any] = {
                "type": "bbox",
                "bbox": clamped_bbox,
                "evidence_id": evidence_id,
            }
            if polygon:
                geom["polygon"] = polygon

            rec = TakeoffRecord(
                item_id=evidence_id,
                project_id=proj_id,
                sheet_id=sheet_meta.sheet_id,
                category=category,
                system=system,
                dimension_label=label,
                status="SUGGESTED",
                source="SYMBOL_SWARM",
                total_length_ft=0.0,  # Discrete symbols have ZERO linear footage
                count=1,
                geometry=geom,
                confidence=round(conf, 2),
                review_required=True,
            )
            records.append(rec)
        return records

    # -----------------------------------------------------------------------
    # Main BaseAgent Execution Interfaces
    # -----------------------------------------------------------------------
    async def run(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        legend_crops: list[LegendSymbolEntry] | None = None,
        discipline: str | None = None,
        scale_status: ScaleStatus | str | None = None,
        **kwargs: Any,
    ) -> FinderL1Result:
        """Run full symbol detection synchronously on plan sheet."""
        events: list[AgentEvent] = []
        items: list[TakeoffRecord] = []
        flags: list[dict[str, Any]] = []

        async for ev in self.run_stream(
            context,
            page_index=page_index,
            sheet_metadata=sheet_metadata,
            legend_crops=legend_crops,
            discipline=discipline,
            scale_status=scale_status,
            **kwargs,
        ):
            events.append(ev)
            if ev.event_type == AgentEventType.ITEMS_EMITTED:
                raw_items = ev.payload.get("items", [])
                items = [it if isinstance(it, TakeoffRecord) else TakeoffRecord(**it) for it in raw_items]
            elif ev.event_type == AgentEventType.FLAG_RAISED:
                flags.append(ev.payload)

        pdf_stem = context.pdf_path.stem if context.pdf_path is not None else "sheet"
        sheet_id = sheet_metadata.sheet_id if sheet_metadata else f"{pdf_stem}_p{page_index}"
        counts: dict[str, int] = {}
        for it in items:
            counts[it.dimension_label] = counts.get(it.dimension_label, 0) + it.count

        return FinderL1Result(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=True,
            sheet_id=sheet_id,
            review_required=True,
            items=items,
            flags=flags,
            events=events,
            symbol_counts=counts,
        )

    def _tile_pdf_page(self, pdf_path: str | Path, page_index: int) -> tuple[list[Any], float, float]:
        """Open and tile a page off-loop; return only detached tile data."""
        doc = pymupdf.open(str(pdf_path))
        try:
            page = doc[page_index]
            return self.tiler.tile_sheet(page), float(page.rect.width), float(page.rect.height)
        finally:
            doc.close()

    async def run_stream(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        legend_crops: list[LegendSymbolEntry] | None = None,
        discipline: str | None = None,
        scale_status: ScaleStatus | str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream symbol detection execution events."""
        start_time = time.monotonic()
        job_id = context.job_id
        pdf_path = context.pdf_path
        if pdf_path is None:
            raise ValueError("AgentContext.pdf_path is required for FinderL1Agent")
        ev_gen = context.evidence_generator
        disc = discipline or (sheet_metadata.discipline if sheet_metadata else "mechanical")
        sheet_id = sheet_metadata.sheet_id if sheet_metadata else f"{pdf_path.stem}_p{page_index}"

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.STARTED,
            sheet_id=sheet_id,
            page_index=page_index,
            progress=0.0,
            message=f"Starting symbol detection on {sheet_id}",
            payload={"discipline": disc, "sheet_id": sheet_id},
        )

        # 1. Parse Legend Exemplars (Legend-First invariant)
        legend_res = self.parse_legend_exemplars(
            pdf_path=pdf_path,
            page_index=page_index,
            legend_crops=legend_crops,
            discipline=disc,
        )
        # Mock legend scans are not evidence: offline fabrication must never
        # seed the exemplar vocabulary (legend-first invariant). Treat mock
        # results as "no verified legend" so the NO_LEGEND_FOUND path fires.
        if isinstance(legend_res, list):
            exemplars: list[LegendSymbolEntry] = legend_res
        elif legend_res.mock:
            exemplars = []
        else:
            exemplars = legend_res.symbols

        # Handle 0 exemplars cleanly with FLAG_RAISED (Finding 03)
        if not exemplars:
            logger.info("Sheet %s has 0 legend exemplars; raising NO_LEGEND_FOUND flag", sheet_id)
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.25,
                message=(
                    f"No symbol legend found on sheet {sheet_id}. "
                    "Symbol perception abstained; manual count or estimator few-shot exemplar required."
                ),
                payload={
                    "type": "NO_LEGEND_FOUND",
                    "fallback": "MANUAL_COUNT_REQUIRED",
                    "sheet_id": sheet_id,
                    "page_index": page_index,
                    "action_required": "ESTIMATOR_BOX_EXEMPLAR_OR_MANUAL_COUNT",
                    "review_required": True,
                },
            )
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.ITEMS_EMITTED,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.90,
                message="No legend symbols found; 0 symbol takeoff records emitted",
                payload={"items": [], "item_count": 0},
            )
            elapsed = round(time.monotonic() - start_time, 2)
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.COMPLETED,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=1.0,
                message=f"Symbol finder completed in {elapsed}s: 0 symbols identified (manual count required)",
                payload={
                    "items_count": 0,
                    "elapsed_seconds": elapsed,
                    "review_required": True,
                    "flag": "NO_LEGEND_FOUND",
                },
            )
            return

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=sheet_id,
            page_index=page_index,
            progress=0.20,
            message=f"Parsed {len(exemplars)} symbol exemplars from legend",
            payload={"exemplars_count": len(exemplars)},
        )

        # 2. Tile on a worker thread so dense vector pages do not block live job events.
        tiles, page_width, page_height = await asyncio.to_thread(
            self._tile_pdf_page, pdf_path, page_index
        )
        doc = pymupdf.open(str(pdf_path))
        try:
            page = doc[page_index]
            content_tiles = self.filter_tiles_for_inference(tiles)

            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.PROGRESS,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.40,
                message=f"Tiled sheet into {len(tiles)} tiles ({len(content_tiles)} with vector content)",
                payload={"total_tiles": len(tiles), "content_tiles": len(content_tiles)},
            )

            # 3. Sheet metadata creation if absent
            disc_clean: Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"] = "MECHANICAL"
            disc_upper = disc.upper()
            if disc_upper in ("MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"):
                disc_clean = disc_upper  # type: ignore[assignment]

            scale_status_val: Literal["VERIFIED", "UNVERIFIED", "CALIBRATED"] = "UNVERIFIED"
            raw_scale = str(scale_status.value if isinstance(scale_status, ScaleStatus) else (scale_status or "UNVERIFIED")).upper()
            if raw_scale in ("VERIFIED", "UNVERIFIED", "CALIBRATED"):
                scale_status_val = raw_scale  # type: ignore[assignment]

            meta = sheet_metadata or SheetMetadata(
                sheet_id=sheet_id,
                page_index=page_index,
                sheet_number=f"P-{page_index + 1}",
                sheet_title="Plan View",
                discipline=disc_clean,
                scale_status=scale_status_val,
                width_pt=page_width,
                height_pt=page_height,
            )

            # 4. Candidate Discovery: Genuine VLM Perception Swarm (Finding 01)
            detected_candidates: list[SymbolCandidate] = []

            # Check if caller passed deterministic candidates (e.g. testing)
            if "candidates" in kwargs and kwargs["candidates"] is not None:
                raw_cands = kwargs["candidates"]
                for c in raw_cands:
                    if isinstance(c, SymbolCandidate):
                        detected_candidates.append(c)
                    elif isinstance(c, dict):
                        detected_candidates.append(
                            SymbolCandidate(
                                symbol_label=c.get("symbol_label") or c.get("label", "Symbol"),
                                tile_col=int(c.get("tile_col", 0)),
                                tile_row=int(c.get("tile_row", 0)),
                                x_offset_px=int(c.get("x_offset_px", 0)),
                                y_offset_px=int(c.get("y_offset_px", 0)),
                                tile_bbox=tuple(c.get("tile_bbox", (0.0, 0.0, 100.0, 100.0))),
                                confidence=float(c.get("confidence", 0.85)),
                                review_required=bool(c.get("review_required", True)),
                                bbox_pt=tuple(c["bbox_pt"]) if "bbox_pt" in c else None,
                            )
                        )
            elif self.client.is_configured() and content_tiles:
                # Render 1024x1024 px rasters at 150 DPI for active content tiles
                tile_rasters: dict[tuple[int, int], bytes | str] = {}
                for tile in content_tiles:
                    try:
                        clip_pt = self.tiler.tile_rect_to_points(tile)
                        pix = page.get_pixmap(dpi=150, clip=clip_pt)
                        tile_rasters[(tile.col, tile.row)] = pix.tobytes("png")
                        del pix
                    except Exception as exc:  # noqa: BLE001
                        logger.debug("Failed to rasterize tile (%d, %d): %s", tile.col, tile.row, exc)

                swarm_input = tiles_to_swarm_input(tiles, tile_rasters)
                outcomes: list[dict[str, Any]] = []
                try:
                    outcomes = await run_swarm(
                        tiles=swarm_input,
                        exemplars=exemplars,
                        client=self.client,
                        max_concurrency=self.max_concurrency,
                    )
                    raw_detections = swarm_outcomes_to_detections(outcomes)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Swarm symbol inference failed (failing closed): %s", exc)
                    raw_detections = []
                    yield AgentEvent(
                        job_id=job_id,
                        agent_id=self.agent_id,
                        event_type=AgentEventType.FLAG_RAISED,
                        sheet_id=sheet_id,
                        page_index=page_index,
                        progress=0.50,
                        message=f"Symbol swarm inference failed: {exc}. Manual count required.",
                        payload={
                            "type": "SWARM_INFERENCE_FAILED",
                            "fallback": "MANUAL_COUNT_REQUIRED",
                            "sheet_id": sheet_id,
                            "page_index": page_index,
                            "error": str(exc),
                            "review_required": True,
                        },
                    )
                else:
                    failed = [o for o in outcomes if o.get("status") not in ("OK", "EMPTY")]
                    if not raw_detections and failed:
                        # Total perception failure: every inferable tile
                        # failed (INFERENCE_FAILED/PARSE_FAILED). Surface a
                        # flag instead of silently completing with 0 items.
                        failed_statuses = sorted({str(o.get("status")) for o in failed})
                        yield AgentEvent(
                            job_id=job_id,
                            agent_id=self.agent_id,
                            event_type=AgentEventType.FLAG_RAISED,
                            sheet_id=sheet_id,
                            page_index=page_index,
                            progress=0.50,
                            message=(
                                f"Symbol perception failed on {len(failed)} tile(s) "
                                f"({', '.join(failed_statuses)}). Manual count required."
                            ),
                            payload={
                                "type": "SWARM_INFERENCE_FAILED",
                                "fallback": "MANUAL_COUNT_REQUIRED",
                                "sheet_id": sheet_id,
                                "page_index": page_index,
                                "failed_tiles": len(failed),
                                "statuses": failed_statuses,
                                "review_required": True,
                            },
                        )

                for det in raw_detections:
                    cand = SymbolCandidate(
                        symbol_label=det["symbol_label"],
                        tile_col=int(det.get("tile_col", 0)),
                        tile_row=int(det.get("tile_row", 0)),
                        x_offset_px=int(det.get("x_offset_px", 0)),
                        y_offset_px=int(det.get("y_offset_px", 0)),
                        tile_bbox=tuple(det["tile_bbox"]),
                        confidence=float(det["confidence"]),
                        review_required=bool(det.get("review_required", False)),
                    )
                    detected_candidates.append(cand)
            elif not self.client.is_configured():
                # Offline mode without configured client: Clean Abstention
                logger.info("FinderL1Agent offline mode (client unconfigured); cleanly abstaining")
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.FLAG_RAISED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=0.50,
                    message=(
                        "Meta Model API client is not configured (offline mode). "
                        "Symbol detection cleanly abstained; manual count required."
                    ),
                    payload={
                        "type": "MODEL_API_NOT_CONFIGURED",
                        "fallback": "MANUAL_COUNT_REQUIRED",
                        "sheet_id": sheet_id,
                        "page_index": page_index,
                        "review_required": True,
                    },
                )
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.ITEMS_EMITTED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=0.90,
                    message="Offline mode; 0 symbol takeoff records emitted",
                    payload={"items": [], "item_count": 0},
                )
                elapsed = round(time.monotonic() - start_time, 2)
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.COMPLETED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=1.0,
                    message=f"Symbol finder completed in {elapsed}s: 0 symbols identified (offline mode)",
                    payload={
                        "items_count": 0,
                        "elapsed_seconds": elapsed,
                        "review_required": True,
                        "flag": "MODEL_API_NOT_CONFIGURED",
                    },
                )
                return
            else:
                # Configured client but zero content tiles: genuine negative.
                # Nothing to perceive, so complete with 0 items. No offline
                # flag is raised — the client IS configured.
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.ITEMS_EMITTED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=0.90,
                    message="No content tiles on sheet; 0 symbol takeoff records emitted",
                    payload={"items": [], "item_count": 0},
                )
                elapsed = round(time.monotonic() - start_time, 2)
                yield AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.COMPLETED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=1.0,
                    message=f"Symbol finder completed in {elapsed}s: 0 symbols identified (no content tiles)",
                    payload={
                        "items_count": 0,
                        "elapsed_seconds": elapsed,
                        "review_required": True,
                    },
                )
                return

            # 5. Non-Maximum Suppression (2D Box IoU)
            nms_candidates = self.apply_nms(detected_candidates, iou_threshold=self.nms_iou_threshold)
            assert isinstance(nms_candidates, list)

            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.PROGRESS,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.60,
                message=f"Discovered {len(nms_candidates)} symbol candidates post-NMS",
                payload={"candidates_count": len(nms_candidates)},
            )

            # 6. SAM 3.1 Refinement & Second Spark Verifier Pass
            verified_candidates: list[dict[str, Any]] = []
            sam_refined_count = 0
            demoted_count = 0

            for c_item in nms_candidates:
                bbox_pt: tuple[float, float, float, float]
                cand_dict: dict[str, Any]
                if isinstance(c_item, SymbolCandidate):
                    bbox_pt = c_item.bbox_pt or untile_candidate(c_item)
                    cand_dict = {
                        "label": c_item.symbol_label,
                        "symbol_label": c_item.symbol_label,
                        "tile_col": c_item.tile_col,
                        "tile_row": c_item.tile_row,
                        "x_offset_px": c_item.x_offset_px,
                        "y_offset_px": c_item.y_offset_px,
                        "tile_bbox": c_item.tile_bbox,
                        "bbox_pt": bbox_pt,
                        "confidence": c_item.confidence,
                        "review_required": c_item.review_required,
                    }
                else:
                    raw_pt = c_item.get("bbox_pt") or self.untile_bbox(c_item)
                    bbox_pt = (float(raw_pt[0]), float(raw_pt[1]), float(raw_pt[2]), float(raw_pt[3]))
                    cand_dict = dict(c_item)
                    cand_dict["bbox_pt"] = bbox_pt

                # Extract 150 DPI candidate crop for SAM & verifier
                crop_b64 = self._extract_crop_b64(page, bbox_pt)
                cand_dict["crop_base64"] = crop_b64
                cand_dict["crop_b64"] = crop_b64

                # SAM 3.1 Refinement (for candidates exceeding sam_refine_threshold)
                cand_conf = cand_dict.get("confidence")
                current_conf = float(cand_conf) if isinstance(cand_conf, (int, float, str)) else 0.0
                if current_conf >= self.sam_refine_threshold:
                    cand_dict = await self.refine_with_sam_async(cand_dict, image_crop_b64=crop_b64)
                    if cand_dict.get("sam_refined"):
                        sam_refined_count += 1

                # Independent Verifier Pass (second Spark call)
                cand_dict = self.run_verifier_pass(cand_dict)
                if cand_dict.get("verifier_disagreed"):
                    demoted_count += 1

                verified_candidates.append(cand_dict)

            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.PROGRESS,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.80,
                message=(
                    f"Refined and verified {len(verified_candidates)} candidates "
                    f"({sam_refined_count} SAM refined, {demoted_count} demoted)"
                ),
                payload={
                    "verified_count": len(verified_candidates),
                    "sam_refined_count": sam_refined_count,
                    "demoted_count": demoted_count,
                },
            )

            # 7. Synthesize takeoff records
            records = self.to_takeoff_records(verified_candidates, meta, ev_gen, project_id=context.project_id)

            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.ITEMS_EMITTED,
                sheet_id=sheet_id,
                page_index=page_index,
                progress=0.90,
                message=f"Emitted {len(records)} symbol takeoff records (status=SUGGESTED)",
                payload={"items": [r.model_dump() for r in records], "item_count": len(records)},
            )

        finally:
            doc.close()

        elapsed = round(time.monotonic() - start_time, 2)
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.COMPLETED,
            sheet_id=sheet_id,
            page_index=page_index,
            progress=1.0,
            message=f"Symbol finder completed in {elapsed}s: {len(records)} symbols identified",
            payload={
                "items_count": len(records),
                "elapsed_seconds": elapsed,
                "sam_refined_count": sam_refined_count,
                "demoted_count": demoted_count,
            },
        )
