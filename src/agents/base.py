"""Base contracts, evidence identity generator, and event models for BlueTrace-AI product agents.

All 7 product-plane agents (00-06) inherit from BaseAgent and use AgentContext and AgentResult.
"""

from __future__ import annotations

import logging
import re
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.store.takeoff_store import TakeoffRecord

logger = logging.getLogger(__name__)


class AgentID(str, Enum):
    AGENT_00_ORCHESTRATOR = "agent_00_orchestrator"
    AGENT_01_RECON = "agent_01_recon"
    AGENT_02_FINDER = "agent_02_finder"
    AGENT_02_FINDER_L1 = "agent_02_finder_l1"
    AGENT_03_TRACER = "agent_03_tracer"
    AGENT_03_TRACER_L2 = "agent_03_tracer_l2"
    AGENT_04_RECONCILER = "agent_04_reconciler"
    AGENT_05_WATCHDOG = "agent_05_watchdog"
    AGENT_06_COPILOT_JUDGE = "agent_06_copilot_judge"


class SheetType(str, Enum):
    PLAN = "plan"
    SCHEDULE = "schedule"
    LEGEND = "legend"
    DETAIL = "detail"
    RISER = "riser"
    OTHER = "other"
    UNREADABLE = "unreadable"


class ScaleStatus(str, Enum):
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"
    CONFLICT = "CONFLICT"
    CALIBRATED = "CALIBRATED"


class AgentEventType(str, Enum):
    STARTED = "started"
    PROGRESS = "progress"
    SHEET_DISCOVERED = "sheet_discovered"
    SHEET_CLASSIFIED = "sheet_classified"
    SCALE_EVALUATED = "scale_evaluated"
    ROUTING_DECIDED = "routing_decided"
    AGENT_DISPATCHED = "agent_dispatched"
    AGENT_COMPLETED = "agent_completed"
    GATE_ENFORCED = "gate_enforced"
    ITEMS_EMITTED = "items_emitted"
    FLAG_RAISED = "flag_raised"
    WARNING = "warning"
    COMPLETED = "complete"
    FAILED = "failed"


_EVIDENCE_ID_RE = re.compile(r"^ev_[a-zA-Z0-9]+_[a-zA-Z0-9_\-]+$")


class EvidenceIDGenerator:
    """Authority for minting and registering traceable evidence IDs across product agents."""

    def __init__(self, project_id: str = "default_project") -> None:
        self.project_id = project_id
        self._registry: dict[str, dict[str, Any]] = {}

    def mint(self, artifact_type: str, sheet_id: str | None = None, suffix: str | None = None) -> str:
        clean_type = re.sub(r"[^a-zA-Z0-9]", "", artifact_type).lower() or "artifact"
        sheet_part = re.sub(r"[^a-zA-Z0-9_\-]", "_", sheet_id).lower() if sheet_id else "global"
        raw_suffix = suffix or uuid.uuid4().hex[:8]
        clean_suffix = re.sub(r"[^a-zA-Z0-9_\-]", "_", raw_suffix)
        evidence_id = f"ev_{clean_type}_{sheet_part}_{clean_suffix}"
        self.register(evidence_id, {"artifact_type": clean_type, "sheet_id": sheet_id})
        return evidence_id

    def mint_sheet_evidence(self, sheet_id: str) -> str:
        return self.mint("sheet", sheet_id, suffix="root")

    def mint_title_block_evidence(self, sheet_id: str) -> str:
        return self.mint("tb", sheet_id, suffix="crop")

    def mint_scale_evidence(self, sheet_id: str, candidate_index: int = 0) -> str:
        return self.mint("scale", sheet_id, suffix=f"cand{candidate_index}")

    def mint_tile_evidence(self, sheet_id: str, row: int, col: int) -> str:
        return self.mint("tile", sheet_id, suffix=f"r{row}c{col}")

    def mint_item_evidence(self, sheet_id: str, category: str, item_id: str | None = None) -> str:
        cat_prefix = category[:4].lower()
        suffix = f"{cat_prefix}_{item_id}" if item_id else f"{cat_prefix}_{uuid.uuid4().hex[:8]}"
        return self.mint("item", sheet_id, suffix=suffix)

    def register(self, evidence_id: str, metadata: dict[str, Any] | None = None) -> None:
        if evidence_id not in self._registry:
            self._registry[evidence_id] = {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
            }

    def is_valid_syntax(self, evidence_id: str) -> bool:
        return bool(_EVIDENCE_ID_RE.match(evidence_id))

    def has_evidence(self, evidence_id: str) -> bool:
        return evidence_id in self._registry

    def list_evidence_ids(self) -> list[str]:
        return list(self._registry.keys())


class AgentEvent(BaseModel):
    """Event frame emitted during agent execution, consumable by SSE endpoints."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    event_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    job_id: str
    agent_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    event_type: AgentEventType
    sheet_id: str | None = None
    page_index: int | None = None
    progress: float = 0.0
    message: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentContext(BaseModel):
    """Runtime context passed to all agent executions."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    project_id: str
    job_id: str
    # Session-scoped agents (05 Watchdog QA) operate on the ledger, not a PDF.
    pdf_path: Path | None = None
    byok_api_key: str | None = None
    evidence_generator: EvidenceIDGenerator = Field(default_factory=EvidenceIDGenerator)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentResult(BaseModel):
    """Standardized output returned by any product agent."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_id: str
    job_id: str
    success: bool
    sheet_id: str | None = None
    sheet_type: SheetType | None = None
    scale_status: ScaleStatus | None = None
    scale_ratio: float | None = None
    review_required: bool = False
    items: list[TakeoffRecord] = Field(default_factory=list)
    flags: list[dict[str, Any]] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    events: list[AgentEvent] = Field(default_factory=list)
    error: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


class BaseAgent(ABC):
    """Abstract base class for all BlueTrace-AI product agents."""

    agent_id: str
    agent_name: str
    agent_version: str = "1.0.0"
    is_llm_agent: bool = False

    @abstractmethod
    async def run(self, context: AgentContext, **kwargs: Any) -> AgentResult:
        """Execute agent workflow asynchronously."""
        ...

    async def run_stream(self, context: AgentContext, **kwargs: Any) -> AsyncGenerator[AgentEvent, None]:
        """Stream execution events. Default implementation yields single completed/failed event."""
        result = await self.execute_safe(context, **kwargs)
        for ev in result.events:
            yield ev

    async def execute_safe(self, context: AgentContext, **kwargs: Any) -> AgentResult:
        """Fail-closed execution wrapper that catches unexpected exceptions and records error state."""
        try:
            return await self.run(context, **kwargs)
        except Exception as exc:
            logger.exception("Agent %s failed", self.agent_id)
            error_event = AgentEvent(
                job_id=context.job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.FAILED,
                progress=1.0,
                message=f"Agent {self.agent_id} failed closed: {exc}",
                payload={"error": str(exc), "error_type": type(exc).__name__},
            )
            return AgentResult(
                agent_id=self.agent_id,
                job_id=context.job_id,
                success=False,
                review_required=True,
                error=str(exc),
                events=[error_event],
            )


class AgentRegistry:
    """Registry for discovering and dispatching available product agents."""

    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}
        self._aliases: dict[str, str] = {
            "agent_02_finder": "agent_02_finder_l1",
            "agent_02_finder_l1": "agent_02_finder",
            "agent_03_tracer": "agent_03_tracer_l2",
            "agent_03_tracer_l2": "agent_03_tracer",
        }

    def register(self, agent: BaseAgent) -> None:
        self._agents[agent.agent_id] = agent
        alias = self._aliases.get(agent.agent_id)
        if alias and alias not in self._agents:
            self._agents[alias] = agent

    def get(self, agent_id: str) -> BaseAgent | None:
        if agent_id in self._agents:
            return self._agents[agent_id]
        alias = self._aliases.get(agent_id)
        if alias and alias in self._agents:
            return self._agents[alias]
        return None

    def has(self, agent_id: str) -> bool:
        return self.get(agent_id) is not None

    def list_agents(self) -> list[str]:
        return list(self._agents.keys())
