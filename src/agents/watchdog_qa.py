"""Product Agent 05: Watchdog QA (independent deterministic pass).

Watches the live session and turns doubt into human work: flags, notes,
and annotation tasks persisted via src/store (qa_annotations). This slice
is RULES_ONLY (deterministic scale/count/topology/confidence checks);
VLM-assisted checks are future work.

Principles:
- Never edits the ledger, accepts/rejects, or deletes another agent's
  output. Annotations are tasks; the human is the gate.
- Watches UNRESOLVED work only: pending (SUGGESTED/CORRECTED) items.
  Human-disposed items (ACCEPTED/REJECTED/CANNOT_DETERMINE) are skipped.
- Never raises the same flag twice: deduped by reason + sheet + geometry,
  within a run and against stored OPEN annotations.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentResult,
    BaseAgent,
)
from src.meta_services.client import MetaModelClient
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

logger = logging.getLogger(__name__)

AnnotationType = Literal["FLAG", "NOTE", "CONFLICT"]
AnnotationSeverity = Literal["CRITICAL", "HIGH", "WARNING", "INFO"]

LOW_CONFIDENCE_THRESHOLD = 0.5
DEMOTED_CONFIDENCE_CEILING = 0.25  # finder demotes verifier disagreements to 0.20
CLUSTER_MIN_SIZE = 3
REJECTION_PATTERN_MIN = 3
ORPHAN_SYSTEMS = frozenset({"", "General", "Unknown"})
PENDING_STATUSES = frozenset({"SUGGESTED", "CORRECTED"})
VALID_SCALES = frozenset({"VERIFIED", "CALIBRATED"})


class QAAnnotation(BaseModel):
    """One watchdog output: a task for human disposition."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    annotation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    annotation_type: AnnotationType = "FLAG"
    reason_code: str
    severity: AnnotationSeverity = "WARNING"
    message: str = ""
    sheet_id: str | None = None
    geometry: dict[str, Any] | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    source_agent: str = AgentID.AGENT_05_WATCHDOG.value
    status: str = "OPEN"


class QAChecklist(BaseModel):
    """Per-sheet QA summary (verdict from combined new + stored-open annotations)."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sheet_id: str
    scale_status: str = "UNVERIFIED"
    items_total: int = 0
    measured_count: int = 0
    open_flags: int = 0
    open_conflicts: int = 0
    notes: int = 0
    verdict: Literal["CLEAN", "NEEDS_REVIEW"] = "CLEAN"


class WatchdogQAResult(AgentResult):
    """Structured output returned by WatchdogQAAgent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    annotations: list[QAAnnotation] = Field(default_factory=list)
    checklist: list[QAChecklist] = Field(default_factory=list)
    checks_run: list[str] = Field(default_factory=list)
    rules_only: bool = True
    persisted: bool = False


WatchdogQAResult.model_rebuild()


# ---------------------------------------------------------------------------
# Pure checks (deterministic; RULES_ONLY)
# ---------------------------------------------------------------------------

def _geometry_key(geometry: dict[str, Any] | None) -> str:
    return json.dumps(geometry, sort_keys=True) if geometry else "null"


def dedupe_key(reason_code: str, sheet_id: str | None, geometry: dict[str, Any] | None) -> str:
    """Stable identity for 'same flag twice' suppression."""
    return f"{reason_code}|{sheet_id or ''}|{_geometry_key(geometry)}"


def dedupe_annotations(
    fresh: list[QAAnnotation],
    existing_open_keys: set[str] | None = None,
) -> list[QAAnnotation]:
    """Drop repeats within ``fresh`` and against stored OPEN annotation keys."""
    seen: set[str] = set(existing_open_keys or set())
    kept: list[QAAnnotation] = []
    for ann in fresh:
        key = dedupe_key(ann.reason_code, ann.sheet_id, ann.geometry)
        if key in seen:
            continue
        seen.add(key)
        kept.append(ann)
    return kept


def check_scale_measured(
    sheets: list[dict[str, Any]],
    items: list[TakeoffRecord],
) -> list[QAAnnotation]:
    """Flag sheets whose scale is unverified yet carry measured footage."""
    by_sheet: dict[str, list[TakeoffRecord]] = {}
    for item in items:
        if item.status not in PENDING_STATUSES:
            continue
        by_sheet.setdefault(item.sheet_id, []).append(item)
    findings: list[QAAnnotation] = []
    for sheet in sheets:
        sheet_id = str(sheet.get("sheet_id") or "")
        if not sheet_id:
            continue
        if str(sheet.get("scale_status") or "") in VALID_SCALES:
            continue
        measured = [it for it in by_sheet.get(sheet_id, []) if (it.total_length_ft or 0.0) > 0.0]
        if not measured:
            continue
        findings.append(
            QAAnnotation(
                annotation_type="FLAG",
                reason_code="SCALE_UNVERIFIED_MEASURED",
                severity="HIGH",
                message=(
                    f"Sheet {sheet_id}: scale is {sheet.get('scale_status') or 'unknown'} "
                    f"but {len(measured)} item(s) carry measured footage."
                ),
                sheet_id=sheet_id,
                evidence_ids=[it.item_id for it in measured],
            )
        )
    return findings


def check_reconcile_flags(reconcile_flags: list[dict[str, Any]] | None) -> list[QAAnnotation]:
    """Convert Agent-04 mismatch flags into annotation tasks.

    COUNT_MISMATCH -> CONFLICT, COUNT_MISMATCH_PENDING -> NOTE,
    UNPLACED_TAG -> FLAG. Operational flags (mock/unparseable/engine) are
    already stream-visible and out of the watch list.
    """
    findings: list[QAAnnotation] = []
    for flag in reconcile_flags or []:
        flag_type = str(flag.get("type") or "")
        if flag_type == "COUNT_MISMATCH":
            findings.append(
                QAAnnotation(
                    annotation_type="CONFLICT",
                    reason_code="COUNT_MISMATCH",
                    severity=str(flag.get("severity") or "WARNING"),  # type: ignore[arg-type]
                    message=str(flag.get("message") or f"Count mismatch: {flag.get('family')}"),
                    sheet_id=flag.get("sheet_id") or flag.get("schedule_sheet_id"),
                )
            )
        elif flag_type == "COUNT_MISMATCH_PENDING":
            findings.append(
                QAAnnotation(
                    annotation_type="NOTE",
                    reason_code="COUNT_MISMATCH_PENDING",
                    severity="INFO",
                    message=str(flag.get("message") or f"Counts pending review: {flag.get('family')}"),
                    sheet_id=flag.get("sheet_id") or flag.get("schedule_sheet_id"),
                )
            )
        elif flag_type == "UNPLACED_TAG":
            findings.append(
                QAAnnotation(
                    annotation_type="FLAG",
                    reason_code="UNPLACED_TAG",
                    severity="WARNING",
                    message=str(
                        flag.get("message") or f"Scheduled tag {flag.get('tag')} has no plan evidence."
                    ),
                    sheet_id=flag.get("schedule_sheet_id") or flag.get("sheet_id"),
                )
            )
    return findings


def check_orphan_runs(items: list[TakeoffRecord]) -> list[QAAnnotation]:
    """Flag linear runs with no system label (pending items only)."""
    findings: list[QAAnnotation] = []
    for item in items:
        if item.status not in PENDING_STATUSES:
            continue
        if item.category not in ("DUCTWORK", "PIPING"):
            continue
        if (item.system or "") not in ORPHAN_SYSTEMS:
            continue
        geometry = item.geometry if isinstance(item.geometry, dict) else None
        findings.append(
            QAAnnotation(
                annotation_type="FLAG",
                reason_code="ORPHAN_RUN",
                severity="WARNING",
                message=f"Run {item.item_id} ({item.category}) has no system label.",
                sheet_id=item.sheet_id,
                geometry=geometry,
                evidence_ids=[item.item_id],
            )
        )
    return findings


def check_ambiguous_junctions(items: list[TakeoffRecord]) -> list[QAAnnotation]:
    """Re-surface Agent-03 ambiguous-junction splits as annotation tasks."""
    findings: list[QAAnnotation] = []
    for item in items:
        if item.status not in PENDING_STATUSES:
            continue
        geometry = item.geometry if isinstance(item.geometry, dict) else None
        codes = (geometry or {}).get("uncertainty_codes") or []
        if "AMBIGUOUS_JUNCTION" not in codes:
            continue
        findings.append(
            QAAnnotation(
                annotation_type="FLAG",
                reason_code="AMBIGUOUS_JUNCTION",
                severity="WARNING",
                message=f"Item {item.item_id} spans an ambiguous junction split; verify continuity.",
                sheet_id=item.sheet_id,
                geometry=geometry,
                evidence_ids=[item.item_id],
            )
        )
    return findings


def check_low_confidence(items: list[TakeoffRecord]) -> list[QAAnnotation]:
    """Flag demoted items (<=0.25, the verifier-disagreement value) and clusters."""
    findings: list[QAAnnotation] = []
    low: list[TakeoffRecord] = []
    for item in items:
        if item.status not in PENDING_STATUSES:
            continue
        conf = item.confidence
        if conf is None:
            continue
        if conf <= DEMOTED_CONFIDENCE_CEILING:
            geometry = item.geometry if isinstance(item.geometry, dict) else None
            findings.append(
                QAAnnotation(
                    annotation_type="FLAG",
                    reason_code="VERIFIER_DEMOTED_SUSPECT",
                    severity="WARNING",
                    message=(
                        f"Item {item.item_id} confidence {conf:.2f} is at/below the "
                        "verifier-demotion value; likely verifier disagreement."
                    ),
                    sheet_id=item.sheet_id,
                    geometry=geometry,
                    evidence_ids=[item.item_id],
                )
            )
        if conf < LOW_CONFIDENCE_THRESHOLD:
            low.append(item)
    groups: dict[tuple[str, str], list[TakeoffRecord]] = {}
    for item in low:
        groups.setdefault((item.sheet_id, item.category), []).append(item)
    for (sheet_id, category), members in sorted(groups.items()):
        if len(members) < CLUSTER_MIN_SIZE:
            continue
        findings.append(
            QAAnnotation(
                annotation_type="NOTE",
                reason_code="LOW_CONFIDENCE_CLUSTER",
                severity="INFO",
                message=(
                    f"{len(members)} low-confidence {category} items on sheet {sheet_id}; "
                    "review as a batch."
                ),
                sheet_id=sheet_id,
                evidence_ids=[it.item_id for it in members],
            )
        )
    return findings


def check_rejection_pattern(
    feedback_events: list[dict[str, Any]],
    items_by_id: dict[str, TakeoffRecord],
) -> list[QAAnnotation]:
    """Flag classes the human rejected 3+ times on one sheet (legend mismatch?)."""
    groups: dict[tuple[str, str], int] = {}
    for event in feedback_events or []:
        if event.get("previous_status") != "SUGGESTED" or event.get("new_status") != "REJECTED":
            continue
        item = items_by_id.get(str(event.get("item_id") or ""))
        if item is None:
            continue
        key = (str(event.get("sheet_id") or item.sheet_id), item.category)
        groups[key] = groups.get(key, 0) + 1
    findings: list[QAAnnotation] = []
    for (sheet_id, category), count in sorted(groups.items()):
        if count < REJECTION_PATTERN_MIN:
            continue
        findings.append(
            QAAnnotation(
                annotation_type="FLAG",
                reason_code="REJECTION_PATTERN",
                severity="WARNING",
                message=(
                    f"Human rejected {count} {category} candidate(s) on sheet {sheet_id}; "
                    "likely legend mismatch — consider re-running Agent 02 with a corrected exemplar."
                ),
                sheet_id=sheet_id,
            )
        )
    return findings


class WatchdogQAAgent(BaseAgent):
    """Product Agent 05: Watchdog QA (independent deterministic pass)."""

    agent_id: str = AgentID.AGENT_05_WATCHDOG.value
    agent_name: str = "Product Agent 05 (Watchdog QA)"
    agent_version: str = "1.0.0"
    # Deterministic RULES_ONLY in M3 (no VLM calls yet); VLM-assisted
    # checks are future work and will flip this flag with their tests.
    is_llm_agent: bool = False

    def __init__(
        self,
        client: MetaModelClient | None = None,
        store: TakeoffStore | None = None,
    ) -> None:
        self.client = client or MetaModelClient()
        self.store = store

    async def run(
        self,
        context: AgentContext,
        sheet_ids: list[str] | None = None,
        reconcile_flags: list[dict[str, Any]] | None = None,
        items: list[TakeoffRecord] | None = None,
        sheets: list[dict[str, Any]] | None = None,
        feedback_events: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> WatchdogQAResult:
        """Run the full watchdog pass synchronously."""
        events: list[AgentEvent] = []
        flags: list[dict[str, Any]] = []
        annotations: list[dict[str, Any]] = []
        checklist: list[dict[str, Any]] = []
        checks_run: list[str] = []
        persisted = False

        async for ev in self.run_stream(
            context,
            sheet_ids=sheet_ids,
            reconcile_flags=reconcile_flags,
            items=items,
            sheets=sheets,
            feedback_events=feedback_events,
            **kwargs,
        ):
            events.append(ev)
            if ev.event_type == AgentEventType.ITEMS_EMITTED:
                payload = ev.payload
                annotations = payload.get("annotations", annotations)
                checklist = payload.get("checklist", checklist)
                checks_run = payload.get("checks_run", checks_run)
                persisted = bool(payload.get("persisted", persisted))
            elif ev.event_type == AgentEventType.FLAG_RAISED:
                flags.append(ev.payload)

        parsed = [QAAnnotation(**a) for a in annotations]
        return WatchdogQAResult(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=True,
            sheet_id=None,
            review_required=len(parsed) > 0,  # clean bill needs no gate
            items=[],  # watchdog never writes ledger items
            flags=flags,
            events=events,
            annotations=parsed,
            checklist=[QAChecklist(**c) for c in checklist],
            checks_run=checks_run,
            rules_only=True,
            persisted=persisted,
        )

    async def run_stream(
        self,
        context: AgentContext,
        sheet_ids: list[str] | None = None,
        reconcile_flags: list[dict[str, Any]] | None = None,
        items: list[TakeoffRecord] | None = None,
        sheets: list[dict[str, Any]] | None = None,
        feedback_events: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Stream the watchdog pass (session-scoped, not sheet-scoped)."""
        job_id = context.job_id
        project_id = context.project_id

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.STARTED,
            sheet_id=None,
            page_index=None,
            progress=0.0,
            message="Starting watchdog QA pass (RULES_ONLY)",
            payload={"rules_only": True},
        )

        # 1. Gather evidence: explicit overrides, else the takeoff store.
        evidence_items: list[TakeoffRecord] = list(items) if items is not None else []
        evidence_sheets: list[dict[str, Any]] = list(sheets) if sheets is not None else []
        evidence_feedback: list[dict[str, Any]] = (
            list(feedback_events) if feedback_events is not None else []
        )
        if self.store is not None:
            if items is None:
                evidence_items = await self.store.list_items(project_id=project_id)
            if sheets is None:
                evidence_sheets = await self.store.list_sheets(project_id=project_id)
            if feedback_events is None:
                all_feedback = await self.store.list_feedback_events()
                evidence_feedback = [f for f in all_feedback if f.get("project_id") == project_id]
        if sheet_ids is not None:
            wanted = set(sheet_ids)
            evidence_sheets = [s for s in evidence_sheets if str(s.get("sheet_id")) in wanted]
            evidence_items = [it for it in evidence_items if it.sheet_id in wanted]
        items_by_id = {it.item_id: it for it in evidence_items}

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=None,
            page_index=None,
            progress=0.30,
            message=(
                f"Gathered {len(evidence_items)} items, {len(evidence_sheets)} sheets, "
                f"{len(evidence_feedback)} feedback events"
            ),
            payload={
                "items_count": len(evidence_items),
                "sheets_count": len(evidence_sheets),
                "feedback_count": len(evidence_feedback),
            },
        )

        # 2. Run deterministic checks.
        checks_run: list[str] = []
        fresh: list[QAAnnotation] = []
        fresh.extend(check_scale_measured(evidence_sheets, evidence_items))
        checks_run.append("scale_measured")
        if reconcile_flags:
            fresh.extend(check_reconcile_flags(reconcile_flags))
            checks_run.append("reconcile_flags")
        fresh.extend(check_orphan_runs(evidence_items))
        checks_run.append("orphan_runs")
        fresh.extend(check_ambiguous_junctions(evidence_items))
        checks_run.append("ambiguous_junctions")
        fresh.extend(check_low_confidence(evidence_items))
        checks_run.append("low_confidence")
        fresh.extend(check_rejection_pattern(evidence_feedback, items_by_id))
        checks_run.append("rejection_pattern")

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.PROGRESS,
            sheet_id=None,
            page_index=None,
            progress=0.60,
            message=f"Checks complete: {len(fresh)} candidate annotation(s)",
            payload={"candidates": len(fresh), "checks_run": checks_run},
        )

        # 3. Dedupe against every stored annotation (any status: OPEN,
        # CONFIRMED, DISMISSED are all durable dispositions — the same flag
        # is never raised twice), then persist the genuinely new ones.
        stored_all: list[dict[str, Any]] = []
        if self.store is not None:
            stored_all = await self.store.list_qa_annotations(project_id)
        seen_keys = {
            dedupe_key(str(a.get("reason_code") or ""), a.get("sheet_id"), a.get("geometry"))
            for a in stored_all
        }
        annotations = dedupe_annotations(fresh, seen_keys)
        persisted = False
        if annotations and self.store is not None:
            for ann in annotations:
                await self.store.record_qa_annotation(
                    project_id=project_id,
                    sheet_id=ann.sheet_id,
                    annotation_type=ann.annotation_type,
                    reason_code=ann.reason_code,
                    severity=ann.severity,
                    message=ann.message,
                    geometry=ann.geometry,
                    evidence_ids=ann.evidence_ids,
                    source_agent=ann.source_agent,
                    annotation_id=ann.annotation_id,
                )
            persisted = True
        if annotations and self.store is None:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=None,
                page_index=None,
                progress=0.75,
                message="Watchdog has no store; annotations returned but not persisted.",
                payload={
                    "type": "WATCHDOG_STORAGE_UNAVAILABLE",
                    "severity": "WARNING",
                    "review_required": True,
                },
            )

        # 4. Emit one event per annotation (uniform consumption downstream).
        for ann in annotations:
            yield AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FLAG_RAISED,
                sheet_id=ann.sheet_id,
                page_index=None,
                progress=0.80,
                message=f"[{ann.annotation_type}] {ann.reason_code}: {ann.message}",
                payload={
                    **ann.model_dump(),
                    "type": ann.reason_code,
                    "annotation_kind": ann.annotation_type,
                },
            )

        # 5. Checklist per sheet (new + pre-existing OPEN combined).
        combined: dict[str, dict[str, int]] = {}
        for entry in stored_all:
            if entry.get("status") != "OPEN":
                continue
            slot = combined.setdefault(str(entry.get("sheet_id") or ""), {"F": 0, "C": 0, "N": 0})
            atype = str(entry.get("annotation_type") or "")
            if atype == "FLAG":
                slot["F"] += 1
            elif atype == "CONFLICT":
                slot["C"] += 1
            else:
                slot["N"] += 1
        for ann in annotations:
            slot = combined.setdefault(ann.sheet_id or "", {"F": 0, "C": 0, "N": 0})
            if ann.annotation_type == "FLAG":
                slot["F"] += 1
            elif ann.annotation_type == "CONFLICT":
                slot["C"] += 1
            else:
                slot["N"] += 1
        measured_by_sheet: dict[str, int] = {}
        total_by_sheet: dict[str, int] = {}
        for item in evidence_items:
            total_by_sheet[item.sheet_id] = total_by_sheet.get(item.sheet_id, 0) + 1
            if (item.total_length_ft or 0.0) > 0.0:
                measured_by_sheet[item.sheet_id] = measured_by_sheet.get(item.sheet_id, 0) + 1
        checklist: list[QAChecklist] = []
        for sheet in evidence_sheets:
            sheet_id = str(sheet.get("sheet_id") or "")
            if not sheet_id:
                continue
            counts = combined.get(sheet_id, {"F": 0, "C": 0, "N": 0})
            checklist.append(
                QAChecklist(
                    sheet_id=sheet_id,
                    scale_status=str(sheet.get("scale_status") or "UNVERIFIED"),
                    items_total=total_by_sheet.get(sheet_id, 0),
                    measured_count=measured_by_sheet.get(sheet_id, 0),
                    open_flags=counts["F"],
                    open_conflicts=counts["C"],
                    notes=counts["N"],
                    verdict="NEEDS_REVIEW" if (counts["F"] + counts["C"]) > 0 else "CLEAN",
                )
            )

        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.ITEMS_EMITTED,
            sheet_id=None,
            page_index=None,
            progress=0.90,
            message=f"Watchdog emitted {len(annotations)} annotation(s) (ledger untouched)",
            payload={
                "items": [],
                "item_count": 0,
                "annotations": [a.model_dump() for a in annotations],
                "checklist": [c.model_dump() for c in checklist],
                "checks_run": checks_run,
                "rules_only": True,
                "persisted": persisted,
            },
        )
        yield AgentEvent(
            job_id=job_id,
            agent_id=self.agent_id,
            event_type=AgentEventType.COMPLETED,
            sheet_id=None,
            page_index=None,
            progress=1.0,
            message=f"Watchdog QA completed: {len(annotations)} annotation(s), persisted={persisted}",
            payload={
                "items_count": 0,
                "annotations_count": len(annotations),
                "persisted": persisted,
                "review_required": len(annotations) > 0,
            },
        )
