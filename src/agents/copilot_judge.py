"""Product Agent 06 — Copilot-Judge (Wonder 1.0, On Demand Only).

Answers natural language questions and adjudicates agent conflicts with evidence citations.
Adheres strictly to the fail-closed scale invariant and zero-hallucinated-dimensions rule.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from enum import Enum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, Field

from src.agents.base import AgentContext, AgentID, AgentResult, BaseAgent
from src.agents.tools import (
    _POINT_HALF_EXTENT_PT,
    ToolRegistry,
    _clamp_to_sheet,
    _coerce_bbox4,
    _envelope,
    _finite_float,
    _points_from,
    _scale_state,
    bbox_from_geometry,
)
from src.models.schemas import CopilotQueryRequest, CopilotQueryResponse
from src.store.takeoff_store import TakeoffRecord, TakeoffStore

if TYPE_CHECKING:
    from src.meta_services.client import MetaModelClient

logger = logging.getLogger(__name__)

# Constants for geometry highlight padding and limits
_MAX_CITATIONS = 10
_MAX_CONTEXT_ITEMS = 20

_SCALE_WORDS = ("scale", "calibrat", "ratio", "dimension")
_EQUIPMENT_WORDS = ("diffuser", "vav", "equipment", "damper", "fan", "fixture", "terminal")
_EQUIPMENT_LABEL_WORDS = ("diffuser", "vav", "damper", "fan", "terminal", "grille", "register")
_DUCT_WORDS = ("duct", "pipe", "piping", "linework", "length", "footage", "linear", "run")

# Pattern for explicit Evidence / Item tokens
CITATION_TOKEN_RE = re.compile(r"\[(item|evidence|tag):([a-zA-Z0-9_\-.:]+)\]")

__all__ = [
    "CITATION_TOKEN_RE",
    "_DUCT_WORDS",
    "_EQUIPMENT_LABEL_WORDS",
    "_EQUIPMENT_WORDS",
    "_MAX_CITATIONS",
    "_MAX_CONTEXT_ITEMS",
    "_POINT_HALF_EXTENT_PT",
    "_SCALE_WORDS",
    "ConflictRecord",
    "ConflictRuling",
    "ConflictRulingType",
    "CopilotJudgeAgent",
    "ToolRegistry",
    "_bbox_intersects",
    "_clamp_to_sheet",
    "_coerce_bbox4",
    "_envelope",
    "_finite_float",
    "_points_from",
    "_scale_state",
    "bbox_from_geometry",
]


def _bbox_intersects(a: list[float], b: list[float]) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


class ConflictRulingType(str, Enum):
    FLAG_BOTH = "FLAG_BOTH"
    PREFER_NATIVE = "PREFER_NATIVE"
    PREFER_HUMAN = "PREFER_HUMAN"
    NEEDS_HUMAN = "NEEDS_HUMAN"


class ConflictRecord(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    conflict_id: str
    sheet_id: str
    conflict_type: str  # HUMAN_OVERRIDE, NATIVE_VS_VLM, SCALE_CONFLICT, SCHEDULE_MISMATCH
    source_a: dict[str, Any]
    source_b: dict[str, Any]
    description: str = ""


class ConflictRuling(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    conflict_id: str
    ruling: ConflictRulingType
    rationale: str
    cited_evidence_ids: list[str] = Field(default_factory=list)
    action_required: str | None = None
    model_used: bool = False


class CopilotJudgeAgent(BaseAgent):
    """Product Agent 06: Grounded conversational assistant and conflict judge."""

    agent_id: str = AgentID.AGENT_06_COPILOT_JUDGE.value
    agent_name: str = "Product Agent 06 (Copilot-Judge)"
    agent_version: str = "1.0.0"
    is_llm_agent: bool = True

    def __init__(
        self,
        client: MetaModelClient | None = None,
        store: TakeoffStore | None = None,
        tool_registry: ToolRegistry | None = None,
    ) -> None:
        if client is None:
            from src.meta_services.client import MetaModelClient

            self.client = MetaModelClient()
        else:
            self.client = client
        self.store = store or TakeoffStore()
        self.tools = tool_registry or ToolRegistry(self.store)

    # -----------------------------------------------------------------------
    # BaseAgent Contract Implementation
    # -----------------------------------------------------------------------
    async def run(self, context: AgentContext, **kwargs: Any) -> AgentResult:
        query = kwargs.get("query", "")
        sheet_id = kwargs.get("sheet_id", context.metadata.get("active_sheet_id", "active"))
        request = CopilotQueryRequest(
            sheet_id=sheet_id,
            query=query,
            selection_bbox=kwargs.get("selection_bbox"),
        )
        response = await self.answer_query(request, use_tools=kwargs.get("use_tools", True))
        return AgentResult(
            agent_id=self.agent_id,
            job_id=context.job_id,
            success=True,
            sheet_id=sheet_id,
            scale_status=None,
            review_required=not response.scale_verified,
            evidence_ids=response.referenced_item_ids,
            metrics={"model_used": response.model_used, "citations_count": len(response.cited_coordinates)},
            payload=response.model_dump(),
        )

    # -----------------------------------------------------------------------
    # Conversational Takeoff Query Workflow
    # -----------------------------------------------------------------------
    async def answer_query(
        self,
        request: CopilotQueryRequest,
        *,
        use_tools: bool | None = None,
    ) -> CopilotQueryResponse:
        """Answers an engineering query using drawing context and ledger database."""
        query_lower = request.query.lower()
        sheet_id = request.sheet_id or "active"

        sheet_meta = await self.store.get_sheet(sheet_id)
        all_items = await self.store.list_items(sheet_id=sheet_id)
        scale_verified, scale_raw, scale_ratio = _scale_state(sheet_meta)

        selection_bbox = _coerce_bbox4(request.selection_bbox)
        selected = self._select_items(query_lower, all_items, selection_bbox)
        total_ft = sum(it.total_length_ft for it in all_items)

        # Fail-closed offline fallback if client is unconfigured
        if not self.client.is_configured():
            return self._offline_answer(
                query_lower=query_lower,
                sheet_id=sheet_id,
                sheet_meta=sheet_meta,
                items=all_items,
                selected=selected,
                total_ft=total_ft,
            )

        # Decide whether to invoke multi-turn tool calling vs query_reasoning prompt-grounding
        if use_tools:
            try:
                return await self._execute_wonder_tool_loop(
                    request=request,
                    sheet_id=sheet_id,
                    sheet_meta=sheet_meta,
                    all_items=all_items,
                    selected=selected,
                    scale_verified=scale_verified,
                    scale_raw=scale_raw,
                    scale_ratio=scale_ratio,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Wonder tool loop failed, falling back to OFFLINE_TEMPLATE: %s", exc)
                return self._offline_answer(
                    query_lower=query_lower,
                    sheet_id=sheet_id,
                    sheet_meta=sheet_meta,
                    items=all_items,
                    selected=selected,
                    total_ft=total_ft,
                )

        # Grounded reasoning path (preserves exact backward compatibility with TakeoffCopilot)
        return await self._answer_query_grounded(
            request=request,
            query_lower=query_lower,
            sheet_id=sheet_id,
            sheet_meta=sheet_meta,
            all_items=all_items,
            selected=selected,
            total_ft=total_ft,
            scale_verified=scale_verified,
            scale_raw=scale_raw,
            scale_ratio=scale_ratio,
        )

    async def answer_query_with_tools(self, request: CopilotQueryRequest) -> CopilotQueryResponse:
        """Explicit entry point to invoke Wonder 1.0 with structured tool calling."""
        return await self.answer_query(request, use_tools=True)

    async def _execute_wonder_tool_loop(
        self,
        request: CopilotQueryRequest,
        sheet_id: str,
        sheet_meta: dict[str, Any] | None,
        all_items: list[TakeoffRecord],
        selected: list[TakeoffRecord],
        scale_verified: bool,
        scale_raw: str,
        scale_ratio: float | None,
    ) -> CopilotQueryResponse:
        """Executes multi-turn tool calling with muse-wonder-1.0."""
        scale_status_str = "VERIFIED" if scale_verified else "UNVERIFIED"
        sys_msg = (
            "You are BlueTraceAI Copilot-Judge (Product Agent 06). "
            "INVARIANTS:\n"
            "1. NEVER hallucinate dimensions, counts, or scale ratios.\n"
            "2. If scale is UNVERIFIED (scale_ratio is 0.0 or uncalibrated), you MUST explicitly state that linear footage cannot be calculated (review required).\n"
            "3. Use available tools (get_sheet, list_items, execute_takeoff_query, get_reconciliation) to fetch ground-truth database records before answering.\n"
            "4. Cite supporting items using exact syntax: [item:item_id] or [evidence:evidence_id].\n"
            "5. If a requested item does not exist, disclose it honestly."
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": sys_msg},
            {
                "role": "user",
                "content": (
                    f"Sheet Context: sheet_id='{sheet_id}', scale_status='{scale_status_str}', "
                    f"scale_raw='{scale_raw}'.\n"
                    f"Question: {request.query}"
                ),
            },
        ]

        meta_tools = self.tools.get_meta_tools()
        max_turns = 3
        turn = 0
        final_text = ""

        while turn < max_turns:
            turn += 1
            completion = self.client.chat_completion_with_tools(
                model="muse-wonder-1.0",
                messages=messages,
                tools=meta_tools,
                temperature=0.1,
            )
            content = completion.get("content") or ""
            tool_calls = completion.get("tool_calls") or []

            if not tool_calls:
                final_text = content
                break

            messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                raw_args = tc["function"].get("arguments", "{}")
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                result = await self.tools.execute(fn_name, args)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id", f"call_{uuid.uuid4().hex[:6]}"),
                    "name": fn_name,
                    "content": json.dumps(result),
                })

        if not final_text and messages:
            final_text = messages[-1].get("content") or ""

        # Apply Citation Validator
        sanitized_text, coords, item_ids, _ = self.validate_citations(
            text=final_text,
            items=all_items,
            sheet_meta=sheet_meta,
        )
        if not coords and not item_ids:
            coords, item_ids = self._citations(selected, sheet_meta)

        # Apply Missing Data Disclosure
        disclosed_text = self.apply_missing_data_disclosure(
            text=sanitized_text,
            sheet_id=sheet_id,
            sheet_meta=sheet_meta,
            scale_verified=scale_verified,
        )

        return CopilotQueryResponse(
            answer=disclosed_text,
            cited_coordinates=coords,
            referenced_item_ids=item_ids,
            scale_verified=scale_verified,
            model_used=True,
        )

    async def _answer_query_grounded(
        self,
        request: CopilotQueryRequest,
        query_lower: str,
        sheet_id: str,
        sheet_meta: dict[str, Any] | None,
        all_items: list[TakeoffRecord],
        selected: list[TakeoffRecord],
        total_ft: float,
        scale_verified: bool,
        scale_raw: str,
        scale_ratio: float | None,
    ) -> CopilotQueryResponse:
        coords, item_ids = self._citations(selected, sheet_meta)
        context_data: dict[str, Any] = {
            "sheet_id": sheet_id,
            "scale_status": "VERIFIED" if scale_verified else "UNVERIFIED",
            "scale_raw": scale_raw,
            "scale_ratio": scale_ratio,
            "total_items_in_ledger": len(all_items),
            "total_linear_feet_accepted": round(total_ft, 2),
            "items": [
                {
                    "item_id": it.item_id,
                    "category": it.category,
                    "system": it.system,
                    "dimension_label": it.dimension_label,
                    "status": it.status,
                    "length_ft": it.total_length_ft,
                    "bbox_pdf_pt": bbox_from_geometry(it.geometry),
                }
                for it in selected[:_MAX_CONTEXT_ITEMS]
            ],
        }
        try:
            reasoning_res = self.client.query_reasoning(
                prompt=(
                    f"{request.query}\n\nAnswer using ONLY the context records. "
                    "Reference items by item_id. Never invent coordinates, "
                    "counts, lengths, or scale ratios."
                ),
                context=context_data,
            )
        except Exception:  # noqa: BLE001
            reasoning_res = {"content": "", "mock": True}

        ans_text = str(reasoning_res.get("content") or "").strip()
        if ans_text and not reasoning_res.get("mock"):
            if not scale_verified:
                ans_text += f"\n\n{self._scale_warning(sheet_id)}"
            return CopilotQueryResponse(
                answer=ans_text,
                cited_coordinates=coords,
                referenced_item_ids=item_ids,
                scale_verified=scale_verified,
                model_used=True,
            )

        return self._offline_answer(
            query_lower=query_lower,
            sheet_id=sheet_id,
            sheet_meta=sheet_meta,
            items=all_items,
            selected=selected,
            total_ft=total_ft,
        )

    # -----------------------------------------------------------------------
    # Citation Validation Engine
    # -----------------------------------------------------------------------
    def validate_citations(
        self,
        text: str,
        items: list[TakeoffRecord],
        sheet_meta: dict[str, Any] | None,
    ) -> tuple[str, list[list[float]], list[str], list[str]]:
        """Parses citation tokens, strips fabricated IDs, and resolves valid coordinates."""
        items_by_id = {it.item_id: it for it in items}
        cited_coords: list[list[float]] = []
        referenced_ids: list[str] = []
        warnings: list[str] = []

        def _replace_token(match: re.Match[str]) -> str:
            token_type = match.group(1)
            token_val = match.group(2)
            if token_val in items_by_id:
                item = items_by_id[token_val]
                bbox = bbox_from_geometry(item.geometry)
                clamped = _clamp_to_sheet(bbox, sheet_meta) if bbox else None
                if clamped:
                    if clamped not in cited_coords:
                        cited_coords.append(clamped)
                    if token_val not in referenced_ids:
                        referenced_ids.append(token_val)
                return match.group(0)
            else:
                warnings.append(
                    f"Stripped ungrounded citation token '[{token_type}:{token_val}]': item not found in takeoff store."
                )
                return f"[unverified:{token_val}]"

        sanitized_text = CITATION_TOKEN_RE.sub(_replace_token, text)
        return sanitized_text, cited_coords, referenced_ids, warnings

    # -----------------------------------------------------------------------
    # Missing-Data Disclosure Engine
    # -----------------------------------------------------------------------
    def apply_missing_data_disclosure(
        self,
        text: str,
        sheet_id: str,
        sheet_meta: dict[str, Any] | None,
        scale_verified: bool,
    ) -> str:
        """Enforces epistemic honesty: states unverified scale and forbids generative estimation."""
        if not scale_verified:
            scale_raw = sheet_meta.get("scale_raw") if sheet_meta else "UNVERIFIED"
            disclosure = (
                f"\n\nscale_status: UNVERIFIED -- Linear footage for Sheet '{sheet_id}' cannot be calculated "
                f"because the scale is unverified (review required). Stored scale text: '{scale_raw}'."
            )
            if "scale is unverified" not in text.lower() and "unverified" not in text.upper():
                return text.strip() + disclosure
        return text

    # -----------------------------------------------------------------------
    # Conflict Adjudication Logic (Agent 06 Judge Mode)
    # -----------------------------------------------------------------------
    async def adjudicate_conflict(self, conflict: ConflictRecord) -> ConflictRuling:
        """Adjudicates conflicts between agents, tools, and human overrides."""
        ctype = conflict.conflict_type.upper()

        # Rule 1: Human override is sacred
        if "HUMAN" in ctype or conflict.source_a.get("is_human") or conflict.source_b.get("is_human"):
            return ConflictRuling(
                conflict_id=conflict.conflict_id,
                ruling=ConflictRulingType.PREFER_HUMAN,
                rationale="Human estimator edits take absolute precedence over model/algorithm proposals.",
                cited_evidence_ids=[],
                model_used=False,
            )

        # Rule 2: Native vector vs VLM perception
        if ctype == "NATIVE_VS_VLM":
            native_valid = bool(conflict.source_a.get("native_confidence", 1.0) > 0.8)
            if native_valid:
                return ConflictRuling(
                    conflict_id=conflict.conflict_id,
                    ruling=ConflictRulingType.PREFER_NATIVE,
                    rationale="Deterministic CAD vector linework takes precedence over probabilistic VLM perception.",
                    cited_evidence_ids=conflict.source_a.get("evidence_ids", []),
                    model_used=False,
                )
            return ConflictRuling(
                conflict_id=conflict.conflict_id,
                ruling=ConflictRulingType.FLAG_BOTH,
                rationale="Native vector geometry is ambiguous; both native and VLM candidates preserved for review.",
                action_required="ESTIMATOR_REVIEW",
                model_used=False,
            )

        # Rule 3: Conflicting scales or count mismatches
        if ctype in ("SCALE_CONFLICT", "SCHEDULE_MISMATCH"):
            return ConflictRuling(
                conflict_id=conflict.conflict_id,
                ruling=ConflictRulingType.NEEDS_HUMAN,
                rationale="Conflicting drawing scales or schedule count discrepancies require manual calibration/adjudication.",
                action_required="MANUAL_CALIBRATION",
                model_used=False,
            )

        # Fallback to FLAG_BOTH
        return ConflictRuling(
            conflict_id=conflict.conflict_id,
            ruling=ConflictRulingType.FLAG_BOTH,
            rationale=f"Unresolved conflict '{conflict.conflict_type}'. Retaining both hypotheses as review_required.",
            model_used=False,
        )

    # -----------------------------------------------------------------------
    # Helper & Deterministic Fallback Methods
    # -----------------------------------------------------------------------
    def _citations(
        self, items: list[TakeoffRecord], sheet_meta: dict[str, Any] | None
    ) -> tuple[list[list[float]], list[str]]:
        """Pair each referenced item ID with its real stored PDF bbox."""
        coords: list[list[float]] = []
        item_ids: list[str] = []
        for item in items:
            if len(coords) >= _MAX_CITATIONS:
                break
            bbox = bbox_from_geometry(item.geometry)
            if bbox is None:
                continue
            bbox = _clamp_to_sheet(bbox, sheet_meta)
            if bbox is None:
                continue
            coords.append(bbox)
            item_ids.append(item.item_id)
        return coords, item_ids

    def _select_items(
        self,
        query_lower: str,
        items: list[TakeoffRecord],
        selection_bbox: list[float] | None,
    ) -> list[TakeoffRecord]:
        """Deterministically choose the ledger records a query is about."""
        selected = items
        if selection_bbox is not None:
            selected = [
                it
                for it in selected
                if (b := bbox_from_geometry(it.geometry)) is not None
                and _bbox_intersects(b, selection_bbox)
            ]
        if any(w in query_lower for w in _EQUIPMENT_WORDS):
            return [
                it
                for it in selected
                if it.category in ("EQUIPMENT", "FIXTURE")
                or any(k in (it.dimension_label or "").lower() for k in _EQUIPMENT_LABEL_WORDS)
            ]
        if any(w in query_lower for w in _DUCT_WORDS):
            return [it for it in selected if it.category in ("DUCTWORK", "PIPING")]
        return selected

    @staticmethod
    def _scale_warning(sheet_id: str) -> str:
        return (
            f"scale_status: UNVERIFIED -- sheet '{sheet_id}' has no verified scale "
            "calibration in the takeoff store (Fail-Closed Rule). Counts below are "
            "ledger record counts only; no length or dimension is verified until "
            "the sheet scale is calibrated and verified."
        )

    def _offline_answer(
        self,
        *,
        query_lower: str,
        sheet_id: str,
        sheet_meta: dict[str, Any] | None,
        items: list[TakeoffRecord],
        selected: list[TakeoffRecord],
        total_ft: float,
    ) -> CopilotQueryResponse:
        """Deterministic ledger template. Every number comes from the store."""
        scale_verified, scale_raw, scale_ratio = _scale_state(sheet_meta)
        coords, item_ids = self._citations(selected, sheet_meta)
        prefix = "[OFFLINE_TEMPLATE] "

        if any(w in query_lower for w in _SCALE_WORDS):
            if scale_verified:
                answer = (
                    f"{prefix}Sheet '{sheet_id}' scale_status: VERIFIED -- calibrated "
                    f"at {scale_raw} (scale factor {scale_ratio}). Linear duct footages "
                    "and equipment dimensions are validated against physical vector "
                    "linework at this ratio."
                )
            elif sheet_meta is None:
                answer = (
                    f"{prefix}No sheet record for '{sheet_id}' exists in the takeoff "
                    f"store. {self._scale_warning(sheet_id)}"
                )
            else:
                answer = (
                    f"{prefix}Sheet '{sheet_id}' {self._scale_warning(sheet_id)} "
                    f"Stored scale text: {scale_raw}."
                )
            return CopilotQueryResponse(
                answer=answer,
                cited_coordinates=[],
                referenced_item_ids=[],
                scale_verified=scale_verified,
                model_used=False,
            )

        if any(w in query_lower for w in _EQUIPMENT_WORDS):
            count = len(selected)
            if count == 0:
                answer = (
                    f"{prefix}Found 0 scheduled equipment instances on sheet "
                    f"'{sheet_id}'. No matching items in the active takeoff ledger."
                )
            else:
                labels = ", ".join(it.dimension_label for it in selected[:5])
                answer = (
                    f"{prefix}Found {count} scheduled equipment instance(s) on sheet "
                    f"'{sheet_id}' in the takeoff ledger: {labels}. "
                    "Cited coordinates are the stored physical drawing locations."
                )
            if not scale_verified:
                answer += f" {self._scale_warning(sheet_id)}"
            return CopilotQueryResponse(
                answer=answer,
                cited_coordinates=coords,
                referenced_item_ids=item_ids,
                scale_verified=scale_verified,
                model_used=False,
            )

        accepted = sum(1 for it in items if it.status == "ACCEPTED")
        suggested = sum(1 for it in items if it.status == "SUGGESTED")
        rejected = sum(1 for it in items if it.status == "REJECTED")
        answer = (
            f"{prefix}Drawing analysis for sheet '{sheet_id}': ledger currently "
            f"records {total_ft:.1f} accepted linear feet across {len(items)} "
            f"item(s) ({accepted} accepted, {suggested} suggested, "
            f"{rejected} rejected). Select any duct run or hover with QuickDraw "
            "(press 'Q') to inspect individual dimensions."
        )
        if not scale_verified:
            answer += f" {self._scale_warning(sheet_id)}"
        return CopilotQueryResponse(
            answer=answer,
            cited_coordinates=coords,
            referenced_item_ids=item_ids,
            scale_verified=scale_verified,
            model_used=False,
        )
