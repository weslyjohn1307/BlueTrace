"""Product Agent 04: Schedule Reconciler (Spark 1.3 extraction + deterministic linking).

Reads equipment schedule sheets, links schedule tags to plan evidence
(TakeoffRecords from Agents 02/03 plus native plan text), and surfaces —
never hides — every schedule-vs-plan disagreement.

Design notes:
- Extraction reuses ``ScheduleParser``; the offline 4-row mock is labelled
  (``ScheduleRow.mock=True``) and flagged, never presented as data.
- Tag matching is 3-tier (exact → normalized → fuzzy), each link labelled.
  Fuzzy links require same family + same first number so distinct units
  (VAV-1 vs VAV-11) can never conflate.
- Count math reuses the canonical store engine (``reconcile_takeoff``);
  the agent adds acceptance-aware family counts (ACCEPTED vs pending) and
  per-tag evidence links. The agent emits NO ledger items (links reference
  existing evidence; ghosts live in the report) so counts can never double.
"""

from __future__ import annotations

import base64
import difflib
import logging
import re
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
    SheetType,
)
from src.meta_services.client import MetaModelClient
from src.meta_services.schedule_parser import ScheduleParser
from src.models.schemas import SheetMetadata
from src.store.reconciler import (
    PlanSymbolInstance,
    ScheduledEquipmentItem,
    normalize_tag,
    reconcile_takeoff,
)
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)

MatchTier = Literal["exact", "normalized", "fuzzy", "none"]

FUZZY_CUTOFF = 0.8
EXCLUDED_PLAN_STATUSES = frozenset({"REJECTED", "CANNOT_DETERMINE"})
EVIDENCE_STATUSES = frozenset({"SUGGESTED", "ACCEPTED", "CORRECTED"})

_TAG_FAMILY_RE = re.compile(r"^([A-Z]+)")
_TAG_FIRST_NUMBER_RE = re.compile(r"^[A-Z]+[^\d]*(\d+)")
_TAG_TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*")


class ScheduleRow(BaseModel):
    """One extracted schedule row with cell-level evidence."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tag: str
    row_index: int = 0
    type: str = "EQUIPMENT"
    params: dict[str, Any] = Field(default_factory=dict)
    source_bbox: list[float] | None = None  # [x0, y0, x1, y1] pt on schedule sheet
    evidence_id: str = ""
    mock: bool = False
    review_required: bool = True


class ScheduleLink(BaseModel):
    """Deterministic link from a schedule tag to plan evidence (or GHOST)."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    tag: str
    normalized_tag: str = ""
    tier: MatchTier = "none"
    fuzzy_ratio: float | None = None
    matched_text: str | None = None
    plan_evidence_id: str | None = None  # TakeoffRecord.item_id when record-linked
    plan_sheet_id: str | None = None
    plan_coords_pt: list[float] | None = None  # [x, y] pt
    plan_label: str | None = None
    ghost: bool = True
    review_required: bool = True


class FamilyCount(BaseModel):
    """Schedule-vs-plan count comparison for one tag family."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    family: str
    scheduled_qty: int = 0
    plan_accepted: int = 0
    plan_pending: int = 0  # SUGGESTED/CORRECTED: human-reviewable evidence
    plan_total: int = 0
    variance: int = 0  # plan_total - scheduled_qty
    status: Literal["MATCHED", "UNDERCOUNT", "OVERCOUNT"] = "MATCHED"


class ScheduleReconcilerResult(AgentResult):
    """Structured output returned by ScheduleReconcilerAgent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    rows: list[ScheduleRow] = Field(default_factory=list)
    links: list[ScheduleLink] = Field(default_factory=list)
    family_counts: list[FamilyCount] = Field(default_factory=list)
    report: dict[str, Any] | None = None  # ReconciliationReport.model_dump()
    schedule_sheet_id: str | None = None
    mock_rows: bool = False


ScheduleReconcilerResult.model_rebuild()


# ---------------------------------------------------------------------------
# Pure helpers: tag families, fuzzy guard, tier matching, family counts
# ---------------------------------------------------------------------------

def family_of_tag(normalized_tag: str) -> str:
    """Return the tag family (leading letters: 'VAV-1' -> 'VAV')."""
    match = _TAG_FAMILY_RE.match(normalized_tag or "")
    return match.group(1) if match else ""


def first_number_of_tag(normalized_tag: str) -> str | None:
    """Return the first numeric component ('VAV-11' -> '11', 'FD' -> None)."""
    match = _TAG_FIRST_NUMBER_RE.match(normalized_tag or "")
    return match.group(1) if match else None


def fuzzy_linkable(row_norm: str, cand_norm: str, cutoff: float = FUZZY_CUTOFF) -> tuple[bool, float]:
    """Conservative fuzzy gate: ratio >= cutoff AND same family AND same number.

    The family+number guards make unit conflation impossible: 'VAV-11'
    can never fuzzy-link to 'VAV-1' (numbers differ) nor to 'EF-1'
    (families differ). Only delimiter/typo variants of the SAME unit pass.
    """
    if not row_norm or not cand_norm:
        return False, 0.0
    ratio = difflib.SequenceMatcher(None, row_norm, cand_norm).ratio()
    if ratio < cutoff:
        return False, ratio
    if family_of_tag(row_norm) != family_of_tag(cand_norm):
        return False, ratio
    row_num = first_number_of_tag(row_norm)
    cand_num = first_number_of_tag(cand_norm)
    if (row_num is not None or cand_num is not None) and row_num != cand_num:
        return False, ratio
    return True, ratio


def tag_tokens(text: str) -> list[str]:
    """Split label/text into tag-like tokens for matching."""
    return _TAG_TOKEN_RE.findall(text or "")


def geometry_center(geometry: dict[str, Any] | list[Any] | None) -> list[float] | None:
    """Best-effort center point of a TakeoffRecord geometry (None if empty)."""
    if not isinstance(geometry, dict) or not geometry:
        return None
    gtype = geometry.get("type")
    if gtype == "point":
        coords = geometry.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            return [round(float(coords[0]), 2), round(float(coords[1]), 2)]
        return None
    if gtype == "bbox":
        bbox = geometry.get("bbox")
        if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
            return [
                round((float(bbox[0]) + float(bbox[2])) / 2.0, 2),
                round((float(bbox[1]) + float(bbox[3])) / 2.0, 2),
            ]
        return None
    pts = geometry.get("points")
    if isinstance(pts, list) and pts:
        xs = [float(p[0]) for p in pts if isinstance(p, (list, tuple)) and len(p) >= 2]
        ys = [float(p[1]) for p in pts if isinstance(p, (list, tuple)) and len(p) >= 2]
        if xs and ys:
            return [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)]
    return None


def record_tag_texts(record: TakeoffRecord) -> list[str]:
    """Candidate tag texts carried by a plan record.

    Full equipment_tag, full dimension_label (catches split spellings like
    "vav 1" at the normalized tier), then label tokens (catch verbatim tags
    embedded in longer labels like "VAV-01 (12in)").
    """
    texts: list[str] = []
    if record.equipment_tag:
        texts.append(record.equipment_tag)
    if record.dimension_label:
        texts.append(record.dimension_label)
    texts.extend(tag_tokens(record.dimension_label or ""))
    seen: set[str] = set()
    ordered: list[str] = []
    for text in texts:
        if text and text not in seen:
            seen.add(text)
            ordered.append(text)
    return ordered


def record_family(record: TakeoffRecord) -> str:
    """Family of a plan record (equipment_tag preferred, else first label token)."""
    if record.equipment_tag:
        return family_of_tag(normalize_tag(record.equipment_tag))
    tokens = tag_tokens(record.dimension_label or "")
    if tokens:
        return family_of_tag(normalize_tag(tokens[0]))
    return ""


def link_schedule_rows(
    rows: list[ScheduleRow],
    plan_records: list[TakeoffRecord],
    plan_text_blocks: list[tuple[str, list[float]]] | None = None,
    plan_sheet_id: str | None = None,
) -> list[ScheduleLink]:
    """Link each schedule row to plan evidence, tier by tier.

    Tier order per row: exact → normalized → fuzzy; within a tier,
    ledger records win over raw text (they carry evidence IDs). Each
    record/text token is consumed once, so duplicate schedule rows
    cannot double-link the same evidence. Unmatched rows link to GHOST.

    Args:
        rows: Extracted schedule rows.
        plan_records: TakeoffRecords from Agents 02/03 (REJECTED and
            CANNOT_DETERMINE are excluded — rejected items are not evidence).
        plan_text_blocks: Optional ``(text, bbox_pt)`` native plan text;
            matched blocks ground the link spatially (bbox center).
        plan_sheet_id: Sheet context attributed to text-block links.
    """
    records = [r for r in plan_records if r.status not in EXCLUDED_PLAN_STATUSES]
    texts = list(plan_text_blocks or [])
    used_records: set[str] = set()
    used_texts: set[int] = set()
    links: list[ScheduleLink] = []

    for row in rows:
        row_norm = normalize_tag(row.tag)
        link = ScheduleLink(tag=row.tag, normalized_tag=row_norm)
        matched = False

        for tier in ("exact", "normalized", "fuzzy"):
            if matched:
                break
            # Ledger records first (they carry evidence IDs).
            best_fuzzy: tuple[float, TakeoffRecord, str] | None = None
            for rec in records:
                if rec.item_id in used_records:
                    continue
                for text in record_tag_texts(rec):
                    if tier == "exact" and text == row.tag:
                        link.tier = "exact"
                        link.matched_text = text
                        link.plan_evidence_id = rec.item_id
                        link.plan_sheet_id = rec.sheet_id
                        link.plan_coords_pt = geometry_center(rec.geometry)
                        link.plan_label = rec.dimension_label
                        used_records.add(rec.item_id)
                        matched = True
                        break
                    if tier == "normalized" and normalize_tag(text) == row_norm and row_norm:
                        link.tier = "normalized"
                        link.matched_text = text
                        link.plan_evidence_id = rec.item_id
                        link.plan_sheet_id = rec.sheet_id
                        link.plan_coords_pt = geometry_center(rec.geometry)
                        link.plan_label = rec.dimension_label
                        used_records.add(rec.item_id)
                        matched = True
                        break
                    if tier == "fuzzy":
                        ok, ratio = fuzzy_linkable(row_norm, normalize_tag(text))
                        if ok and (best_fuzzy is None or ratio > best_fuzzy[0]):
                            best_fuzzy = (ratio, rec, text)
                if matched:
                    break
            if tier == "fuzzy" and best_fuzzy is not None:
                ratio, rec, text = best_fuzzy
                link.tier = "fuzzy"
                link.fuzzy_ratio = round(ratio, 4)
                link.matched_text = text
                link.plan_evidence_id = rec.item_id
                link.plan_sheet_id = rec.sheet_id
                link.plan_coords_pt = geometry_center(rec.geometry)
                link.plan_label = rec.dimension_label
                used_records.add(rec.item_id)
                matched = True
            if matched:
                break
            # Native plan text (spatial grounding, no ledger evidence ID).
            best_text_fuzzy: tuple[float, int, str, list[float]] | None = None
            for idx, (text, bbox) in enumerate(texts):
                if idx in used_texts:
                    continue
                stripped = (text or "").strip()
                candidates = ([stripped] if stripped else []) + tag_tokens(text)
                cx = round((float(bbox[0]) + float(bbox[2])) / 2.0, 2)
                cy = round((float(bbox[1]) + float(bbox[3])) / 2.0, 2)
                for token in candidates:
                    if tier == "exact" and token == row.tag:
                        link.tier = "exact"
                        link.matched_text = token
                        link.plan_sheet_id = plan_sheet_id
                        link.plan_coords_pt = [cx, cy]
                        link.plan_label = text.strip()[:80]
                        used_texts.add(idx)
                        matched = True
                        break
                    if tier == "normalized" and normalize_tag(token) == row_norm and row_norm:
                        link.tier = "normalized"
                        link.matched_text = token
                        link.plan_sheet_id = plan_sheet_id
                        link.plan_coords_pt = [cx, cy]
                        link.plan_label = text.strip()[:80]
                        used_texts.add(idx)
                        matched = True
                        break
                    if tier == "fuzzy":
                        ok, ratio = fuzzy_linkable(row_norm, normalize_tag(token))
                        if ok and (best_text_fuzzy is None or ratio > best_text_fuzzy[0]):
                            best_text_fuzzy = (ratio, idx, token, [cx, cy])
                if matched:
                    break
            if tier == "fuzzy" and best_text_fuzzy is not None:
                ratio, idx, token, coords = best_text_fuzzy
                link.tier = "fuzzy"
                link.fuzzy_ratio = round(ratio, 4)
                link.matched_text = token
                link.plan_sheet_id = plan_sheet_id
                link.plan_coords_pt = coords
                used_texts.add(idx)
                matched = True

        link.ghost = not matched
        links.append(link)
    return links


def count_families(
    rows: list[ScheduleRow],
    plan_records: list[TakeoffRecord],
) -> list[FamilyCount]:
    """Compare scheduled vs plan counts per tag family (acceptance-aware).

    Scheduled qty = schedule rows in the family. Plan evidence excludes
    REJECTED/CANNOT_DETERMINE records; ACCEPTED counts separately from
    pending (SUGGESTED/CORRECTED) so flags can distinguish "missing" from
    "awaiting human review". Records with no tag family (dimensioned runs)
    are out of scope for schedule comparison.
    """
    scheduled: dict[str, int] = {}
    for row in rows:
        family = family_of_tag(normalize_tag(row.tag)) or "UNGROUPED"
        scheduled[family] = scheduled.get(family, 0) + 1

    accepted: dict[str, int] = {}
    pending: dict[str, int] = {}
    for rec in plan_records:
        if rec.status not in EVIDENCE_STATUSES:
            continue
        family = record_family(rec)
        if not family:
            continue
        if rec.status == "ACCEPTED":
            accepted[family] = accepted.get(family, 0) + 1
        else:
            pending[family] = pending.get(family, 0) + 1

    families: list[FamilyCount] = []
    for family in sorted(set(scheduled) | set(accepted) | set(pending)):
        sched_qty = scheduled.get(family, 0)
        acc = accepted.get(family, 0)
        pend = pending.get(family, 0)
        total = acc + pend
        variance = total - sched_qty
        status: Literal["MATCHED", "UNDERCOUNT", "OVERCOUNT"] = (
            "MATCHED" if variance == 0 else ("UNDERCOUNT" if variance < 0 else "OVERCOUNT")
        )
        families.append(
            FamilyCount(
                family=family,
                scheduled_qty=sched_qty,
                plan_accepted=acc,
                plan_pending=pend,
                plan_total=total,
                variance=variance,
                status=status,
            )
        )
    return families


class ScheduleReconcilerAgent(BaseAgent):
    """Product Agent 04: Schedule Reconciler (Spark extraction + deterministic linking)."""

    agent_id: str = AgentID.AGENT_04_RECONCILER.value
    agent_name: str = "Product Agent 04 (Schedule Reconciler)"
    agent_version: str = "1.0.0"
    is_llm_agent: bool = True

    def __init__(
        self,
        client: MetaModelClient | None = None,
        parser: ScheduleParser | None = None,
        store: TakeoffStore | None = None,
    ) -> None:
        self.client = client or MetaModelClient()
        self.parser = parser or ScheduleParser(client=self.client)
        self.store = store

    def extract_rows(
        self,
        pdf_path: str | Path,
        page_index: int,
        schedule_title: str,
        sheet_id: str,
        ev_gen: EvidenceIDGenerator,
    ) -> tuple[list[ScheduleRow], bool]:
        """Extract schedule rows; returns ``(rows, mock)``.

        Offline (client unconfigured) the parser returns its deterministic
        4-row mock — rows are labelled ``mock=True`` so they can never be
        mistaken for extracted data. Live extraction failures (unparseable
        JSON) yield ``[]`` so the caller can raise HUMAN_ENTRY_REQUIRED.
        """
        if not self.client.is_configured():
            items = self.parser.parse_schedule_crop("", schedule_title=schedule_title)
            mock = True
        else:
            crop_b64 = self._render_schedule_crop(pdf_path, page_index)
            items = self.parser.parse_schedule_crop(crop_b64, schedule_title=schedule_title)
            mock = False
        rows = [
            ScheduleRow(
                tag=item.tag,
                row_index=idx,
                type=item.category or "EQUIPMENT",
                params={
                    "description": item.description,
                    "system": item.system,
                    "cfm": item.cfm,
                    "dimension": item.dimension,
                },
                evidence_id=ev_gen.mint(
                    "schedrow", sheet_id, suffix=f"{normalize_tag(item.tag) or 'row'}_{idx}"
                ),
                mock=mock,
                review_required=True,
            )
            for idx, item in enumerate(items)
        ]
        return rows, mock

    def _render_schedule_crop(self, pdf_path: str | Path, page_index: int) -> str:
        """Render a schedule page at 150 DPI as base64 PNG for VLM extraction."""
        doc = pymupdf.open(str(pdf_path))
        try:
            page = doc[page_index]
            pix = page.get_pixmap(dpi=150)
            try:
                return base64.b64encode(pix.tobytes("png")).decode("ascii")
            finally:
                del pix
        finally:
            doc.close()

    def ground_rows(
        self,
        rows: list[ScheduleRow],
        pdf_path: str | Path,
        page_index: int,
    ) -> list[ScheduleRow]:
        """Attach native-text source bboxes to rows (cell-level evidence).

        Each row tag is searched in the schedule sheet's native text layer
        (verbatim, then normalized). Rows with no native match keep
        ``source_bbox=None`` — absence of evidence is reported, never filled.
        """
        doc = pymupdf.open(str(pdf_path))
        try:
            page = doc[page_index]
            words = page.get_text("words") or []
        finally:
            doc.close()
        for row in rows:
            row_norm = normalize_tag(row.tag)
            for word_entry in words:
                x0, y0, x1, y1, word = word_entry[:5]
                if word == row.tag or (row_norm and normalize_tag(str(word)) == row_norm):
                    row.source_bbox = [
                        round(float(x0), 2),
                        round(float(y0), 2),
                        round(float(x1), 2),
                        round(float(y1), 2),
                    ]
                    break
        return rows

    def _plan_status_to_symbol_status(self, status: str) -> str:
        """Map ledger status onto the engine's symbol status vocabulary."""
        if status == "ACCEPTED":
            return "ACCEPTED"
        if status == "CORRECTED":
            return "VERIFIED"
        return "SUGGESTED"

    def build_engine_inputs(
        self,
        rows: list[ScheduleRow],
        links: list[ScheduleLink],
        plan_records: list[TakeoffRecord],
        schedule_sheet_id: str,
    ) -> tuple[list[ScheduledEquipmentItem], list[PlanSymbolInstance]]:
        """Translate agent links into canonical store-engine inputs.

        Linked rows become scheduled items; each LINKED row contributes one
        plan symbol labelled with the schedule tag (matching intelligence
        stays in the labelled tiers; the engine counts). Records carrying
        explicit tags absent from every row surface as UNSCHEDULED symbols.
        Links without coordinates are excluded from engine symbols (their
        location is unknown — never invented) but kept in ``links``.
        """
        scheduled = [
            ScheduledEquipmentItem(
                tag=row.tag,
                description=str(row.params.get("description") or ""),
                schedule_sheet=schedule_sheet_id,
                row_data={
                    **row.params,
                    "mock": row.mock,
                    "evidence_id": row.evidence_id,
                    "source_bbox": row.source_bbox,
                },
                quantity=1,
                system=str(row.params.get("system") or "General"),
                cfm=row.params.get("cfm"),
                dimension=row.params.get("dimension"),
            )
            for row in rows
        ]

        row_norms = {normalize_tag(row.tag) for row in rows}
        symbols: list[PlanSymbolInstance] = []
        for link in links:
            if link.ghost or not link.plan_coords_pt:
                continue
            rec_status = "SUGGESTED"
            for rec in plan_records:
                if rec.item_id == link.plan_evidence_id:
                    rec_status = self._plan_status_to_symbol_status(rec.status)
                    break
            else:
                rec_status = "DETECTED" if link.plan_evidence_id is None else rec_status
            symbols.append(
                PlanSymbolInstance(
                    symbol_id=link.plan_evidence_id or f"text-{link.normalized_tag}",
                    label=link.tag,
                    sheet_id=link.plan_sheet_id or schedule_sheet_id,
                    location_pt=[float(link.plan_coords_pt[0]), float(link.plan_coords_pt[1])],
                    status=rec_status,  # type: ignore[arg-type]
                )
            )

        for rec in plan_records:
            if rec.status not in EVIDENCE_STATUSES or not rec.equipment_tag:
                continue
            if normalize_tag(rec.equipment_tag) in row_norms:
                continue
            coords = geometry_center(rec.geometry)
            if coords is None:
                continue
            symbols.append(
                PlanSymbolInstance(
                    symbol_id=rec.item_id,
                    label=rec.equipment_tag,
                    sheet_id=rec.sheet_id,
                    location_pt=[float(coords[0]), float(coords[1])],
                    status=self._plan_status_to_symbol_status(rec.status),  # type: ignore[arg-type]
                )
            )
        return scheduled, symbols

    async def run(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        plan_items: list[TakeoffRecord] | None = None,
        plan_text_blocks: list[tuple[str, list[float]]] | None = None,
        plan_sheet_id: str | None = None,
        schedule_title: str | None = None,
        **kwargs: Any,
    ) -> ScheduleReconcilerResult:
        """Run full schedule reconciliation synchronously."""
        events: list[AgentEvent] = []
        flags: list[dict[str, Any]] = []
        rows: list[dict[str, Any]] = []
        links: list[dict[str, Any]] = []
        families: list[dict[str, Any]] = []
        report: dict[str, Any] | None = None
        mock_rows = False
        schedule_sheet_id = (
            sheet_metadata.sheet_id if sheet_metadata else f"{context.pdf_path.stem}_p{page_index}"
        )

        async for ev in self.run_stream(
            context,
            page_index=page_index,
            sheet_metadata=sheet_metadata,
            plan_items=plan_items,
            plan_text_blocks=plan_text_blocks,
            plan_sheet_id=plan_sheet_id,
            schedule_title=schedule_title,
            **kwargs,
        ):
            events.append(ev)
            if ev.event_type == AgentEventType.ITEMS_EMITTED:
                payload = ev.payload
                rows = payload.get("rows", rows)
                links = payload.get("links", links)
                families = payload.get("family_counts", families)
                report = payload.get("report", report)
                mock_rows = bool(payload.get("mock_rows", mock_rows))
            elif ev.event_type == AgentEventType.FLAG_RAISED:
                flags.append(ev.payload)

        return ScheduleReconcilerResult(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=True,
            sheet_id=schedule_sheet_id,
            sheet_type=SheetType.SCHEDULE,
            review_required=True,  # links are SUGGESTED until a human accepts them
            items=[],
            flags=flags,
            events=events,
            rows=[ScheduleRow(**r) for r in rows],
            links=[ScheduleLink(**l) for l in links],
            family_counts=[FamilyCount(**f) for f in families],
            report=report,
            schedule_sheet_id=schedule_sheet_id,
            mock_rows=mock_rows,
        )

    async def run_stream(
        self,
        context: AgentContext,
        page_index: int = 0,
        sheet_metadata: SheetMetadata | None = None,
        plan_items: list[TakeoffRecord] | None = None,
        plan_text_blocks: list[tuple[str, list[float]]] | None = None,
        plan_sheet_id: str | None = None,
        schedule_title: str | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream reconciliation execution events."""
        job_id = context.job_id
        pdf_path = context.pdf_path
        ev_gen = context.evidence_generator
        sched_sheet_id = (
            sheet_metadata.sheet_id if sheet_metadata else f"{pdf_path.stem}_p{page_index}"
        )
        title = schedule_title or (sheet_metadata.sheet_title if sheet_metadata else None)
        title = title or "Equipment Schedule"

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.STARTED,
            sheet_id=sched_sheet_id,
            page_index=page_index,
            progress=0.0,
            message=f"Starting schedule reconciliation on {sched_sheet_id}",
            payload={"schedule_sheet_id": sched_sheet_id, "title": title},
        )

        # 1. Extract schedule rows (Spark table extraction, mock-labelled).
        rows, mock = self.extract_rows(pdf_path, page_index, title, sched_sheet_id, ev_gen)
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=sched_sheet_id,
            page_index=page_index,
            progress=0.25,
            message=f"Extracted {len(rows)} schedule rows (mock={mock})",
            payload={"rows_count": len(rows), "mock": mock},
        )

        if mock:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.30,
                message="Schedule rows are offline mock data (client unconfigured); labelled mock, not evidence.",
                payload={
                    "type": "OFFLINE_SCHEDULE_MOCK",
                    "severity": "WARNING",
                    "sheet_id": sched_sheet_id,
                    "rows_count": len(rows),
                    "review_required": True,
                },
            )

        if not rows:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.40,
                message="Schedule table unparseable; rows must be entered by a human in the schedule panel.",
                payload={
                    "type": "SCHEDULE_UNPARSEABLE",
                    "severity": "HIGH",
                    "fallback": "HUMAN_ENTRY_REQUIRED",
                    "sheet_id": sched_sheet_id,
                    "review_required": True,
                },
            )
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.ITEMS_EMITTED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.90,
                message="Schedule unparseable; 0 rows reconciled",
                payload={
                    "items": [],
                    "rows": [],
                    "links": [],
                    "family_counts": [],
                    "report": None,
                    "mock_rows": mock,
                },
            )
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.COMPLETED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=1.0,
                message="Schedule reconciliation completed: unparseable table (human entry required)",
                payload={"items_count": 0, "rows_count": 0, "review_required": True},
            )
            return

        # 2. Ground rows to native schedule text (cell-level evidence).
        rows = self.ground_rows(rows, pdf_path, page_index)

        # 3. Gather plan evidence (explicit items, else the takeoff store).
        evidence: list[TakeoffRecord] = []
        if plan_items is not None:
            evidence = list(plan_items)
        elif self.store is not None:
            evidence = await self.store.list_items(project_id=context.project_id)
        else:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.45,
                message="No plan evidence available (no store, no plan items); all tags link to GHOST.",
                payload={
                    "type": "PLAN_EVIDENCE_UNAVAILABLE",
                    "severity": "WARNING",
                    "sheet_id": sched_sheet_id,
                    "review_required": True,
                },
            )
        evidence = [r for r in evidence if r.status in EVIDENCE_STATUSES]

        # 4. Link tags (exact -> normalized -> fuzzy) + family counts.
        links = link_schedule_rows(rows, evidence, plan_text_blocks, plan_sheet_id)
        families = count_families(rows, evidence)
        ghost_count = sum(1 for link in links if link.ghost)
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=sched_sheet_id,
            page_index=page_index,
            progress=0.65,
            message=f"Linked {len(links) - ghost_count}/{len(links)} tags; {ghost_count} ghost",
            payload={
                "links_count": len(links),
                "ghost_count": ghost_count,
                "families_count": len(families),
            },
        )

        # 5. Canonical count report via the store engine.
        report_dict: dict[str, Any] | None = None
        try:
            scheduled, symbols = self.build_engine_inputs(rows, links, evidence, sched_sheet_id)
            engine_report = reconcile_takeoff(
                scheduled_items=scheduled,
                plan_symbols=symbols,
                project_id=context.project_id,
            )
            report_dict = engine_report.model_dump()
        except Exception as exc:  # noqa: BLE001 - fail closed, never crash the stream
            logger.warning("Reconciliation engine failed (failing closed): %s", exc)
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.75,
                message=f"Reconciliation count engine failed: {exc}. Links above still stand.",
                payload={
                    "type": "RECONCILE_ENGINE_FAILED",
                    "severity": "HIGH",
                    "sheet_id": sched_sheet_id,
                    "error": str(exc),
                    "review_required": True,
                },
            )

        # 6. Emit mismatch flags (each becomes an Agent-05 annotation task).
        for family in families:
            if family.status == "MATCHED":
                if family.plan_pending == 0 or family.plan_accepted >= family.scheduled_qty:
                    continue
                flag_type = "COUNT_MISMATCH_PENDING"
                severity = "INFO"
                message = (
                    f"Family {family.family}: counts match ({family.scheduled_qty}) but "
                    f"{family.plan_pending} plan item(s) still await human review."
                )
            elif family.status == "UNDERCOUNT":
                # plan_total < scheduled: missing even if all pending accepted.
                flag_type = "COUNT_MISMATCH"
                severity = "HIGH"
                message = (
                    f"Family {family.family}: {family.scheduled_qty} scheduled vs "
                    f"{family.plan_total} on plan (variance {family.variance:+d})."
                )
            else:  # OVERCOUNT: plan exceeds schedule (duplicates/outdated schedule).
                flag_type = "COUNT_MISMATCH"
                severity = "WARNING"
                message = (
                    f"Family {family.family}: {family.scheduled_qty} scheduled vs "
                    f"{family.plan_total} on plan (variance {family.variance:+d})."
                )
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.80,
                message=message,
                payload={
                    "type": flag_type,
                    "severity": severity,
                    "family": family.family,
                    "scheduled_qty": family.scheduled_qty,
                    "plan_accepted": family.plan_accepted,
                    "plan_pending": family.plan_pending,
                    "variance": family.variance,
                    "agent05_task": True,
                    "review_required": True,
                },
            )

        for link in links:
            if not link.ghost:
                continue
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=sched_sheet_id,
                page_index=page_index,
                progress=0.85,
                message=f"Scheduled tag {link.tag} has no plan evidence; ghost pin emitted.",
                payload={
                    "type": "UNPLACED_TAG",
                    "severity": "WARNING",
                    "tag": link.tag,
                    "normalized_tag": link.normalized_tag,
                    "schedule_sheet_id": sched_sheet_id,
                    "agent05_task": True,
                    "review_required": True,
                },
            )

        # 7. Emit (no ledger items: links reference existing evidence).
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.ITEMS_EMITTED,
            sheet_id=sched_sheet_id,
            page_index=page_index,
            progress=0.90,
            message=f"Reconciled {len(rows)} rows: {len(links) - ghost_count} linked, {ghost_count} ghost",
            payload={
                "items": [],
                "item_count": 0,
                "rows": [r.model_dump() for r in rows],
                "links": [link.model_dump() for link in links],
                "family_counts": [f.model_dump() for f in families],
                "report": report_dict,
                "mock_rows": mock,
            },
        )
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.COMPLETED,
            sheet_id=sched_sheet_id,
            page_index=page_index,
            progress=1.0,
            message=f"Schedule reconciliation completed: {len(rows)} rows, {ghost_count} ghosts",
            payload={
                "items_count": 0,
                "rows_count": len(rows),
                "ghost_count": ghost_count,
                "review_required": True,
            },
        )
