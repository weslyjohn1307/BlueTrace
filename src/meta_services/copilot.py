"""BlueTraceAI Copilot: Conversational Takeoff Assistant via muse-wonder-1.0.

Provides backward-compatible adapter exposing TakeoffCopilot and geometry/scale helpers,
subclassing the multi-agent Product Agent 06 (CopilotJudgeAgent).
"""

from __future__ import annotations

from src.agents.copilot_judge import (
    _DUCT_WORDS,
    _EQUIPMENT_LABEL_WORDS,
    _EQUIPMENT_WORDS,
    _MAX_CITATIONS,
    _MAX_CONTEXT_ITEMS,
    _POINT_HALF_EXTENT_PT,
    _SCALE_WORDS,
    CopilotJudgeAgent,
    _bbox_intersects,
    _clamp_to_sheet,
    _coerce_bbox4,
    _envelope,
    _finite_float,
    _points_from,
    _scale_state,
    bbox_from_geometry,
)

__all__ = [
    "_DUCT_WORDS",
    "_EQUIPMENT_LABEL_WORDS",
    "_EQUIPMENT_WORDS",
    "_MAX_CITATIONS",
    "_MAX_CONTEXT_ITEMS",
    "_POINT_HALF_EXTENT_PT",
    "_SCALE_WORDS",
    "CopilotJudgeAgent",
    "TakeoffCopilot",
    "_bbox_intersects",
    "_clamp_to_sheet",
    "_coerce_bbox4",
    "_envelope",
    "_finite_float",
    "_points_from",
    "_scale_state",
    "bbox_from_geometry",
]


class TakeoffCopilot(CopilotJudgeAgent):
    """Backward-compatible TakeoffCopilot wrapper inheriting from CopilotJudgeAgent."""

