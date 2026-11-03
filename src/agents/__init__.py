"""BlueTrace-AI Multi-Agent Architecture (src/agents).

Exposes the product agent interfaces, base contracts, evidence identity authorities,
and tool registries conforming to the AGENTS.md Constitution.
"""

from __future__ import annotations

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentRegistry,
    AgentResult,
    BaseAgent,
    EvidenceIDGenerator,
    ScaleStatus,
    SheetType,
)
from src.agents.copilot_judge import (
    ConflictRecord,
    ConflictRuling,
    ConflictRulingType,
    CopilotJudgeAgent,
)
from src.agents.finder_l1 import (
    FinderL1Agent,
    FinderL1Metrics,
    FinderL1Result,
    SymbolDetectionCandidate,
)
from src.agents.orchestrator import (
    DocumentMap,
    OrchestratorAgent,
    OrchestratorResult,
    SheetRoute,
)
from src.agents.recon import (
    ReconAgent,
    ScaleCandidate,
    SheetReconResult,
)
from src.agents.schedule_reconciler import (
    FamilyCount,
    ScheduleLink,
    ScheduleReconcilerAgent,
    ScheduleReconcilerResult,
    ScheduleRow,
)
from src.agents.tools import (
    TakeoffSummary,
    ToolDefinition,
    ToolRegistry,
)
from src.agents.tracer_l2 import (
    LinearRunSemantic,
    PolylineGeometry,
    TracerL2Agent,
    TracerL2Result,
    TracerL2Run,
)
from src.agents.watchdog_qa import (
    QAAnnotation,
    QAChecklist,
    WatchdogQAAgent,
    WatchdogQAResult,
)

__all__ = [
    "AgentContext",
    "AgentEvent",
    "AgentEventType",
    "AgentID",
    "AgentRegistry",
    "AgentResult",
    "BaseAgent",
    "ConflictRecord",
    "ConflictRuling",
    "ConflictRulingType",
    "CopilotJudgeAgent",
    "DocumentMap",
    "EvidenceIDGenerator",
    "FamilyCount",
    "FinderL1Agent",
    "FinderL1Metrics",
    "FinderL1Result",
    "LinearRunSemantic",
    "OrchestratorAgent",
    "OrchestratorResult",
    "PolylineGeometry",
    "QAAnnotation",
    "QAChecklist",
    "ReconAgent",
    "ScaleCandidate",
    "ScaleStatus",
    "ScheduleLink",
    "ScheduleReconcilerAgent",
    "ScheduleReconcilerResult",
    "ScheduleRow",
    "SheetReconResult",
    "SheetRoute",
    "SheetType",
    "SymbolDetectionCandidate",
    "TakeoffSummary",
    "ToolDefinition",
    "ToolRegistry",
    "TracerL2Agent",
    "TracerL2Result",
    "TracerL2Run",
    "WatchdogQAAgent",
    "WatchdogQAResult",
]
