"""Takeoff Ledger & Schedule Reconciliation Engine.

Matches scheduled equipment items extracted from drawing schedule tables against
spatial symbol instances detected on CAD floor plan sheets. Flags count variances,
generates Ghost Pins for unplaced equipment, and rolls up multi-discipline ledgers.

Conforms to AGENTS.md, ADR-003, and TASK-004 specifications.
"""

from __future__ import annotations

import math
import re
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator


def _utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------------------
# Pydantic v2 Core Schemas
# ---------------------------------------------------------------------------

DiscrepancyStatus = Literal["MATCHED", "UNDERCOUNT", "OVERCOUNT", "UNSCHEDULED", "UNPLACED_GHOST"]
DiscrepancySeverity = Literal["CRITICAL", "WARNING", "INFO"]
TradeDiscipline = Literal[
    "MECHANICAL", "ELECTRICAL", "PLUMBING", "FIRE_PROTECTION", "ARCHITECTURAL", "GENERAL"
]


class ScheduledEquipmentItem(BaseModel):
    """Equipment or fixture item specified in a drawing sheet schedule table."""

    model_config = ConfigDict(extra="ignore")

    tag: str = Field(
        ...,
        description="Equipment tag as specified in schedule, e.g. 'AHU-1', 'VAV-01', 'EF-2'",
    )
    description: str = ""
    schedule_sheet: str
    row_data: dict[str, Any] = Field(default_factory=dict)
    quantity: int = Field(default=1, ge=0)
    discipline: TradeDiscipline | None = None
    system: str = "General"
    cfm: float | None = None
    dimension: str | None = None
    entry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    @field_validator("tag")
    @classmethod
    def validate_tag(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("ScheduledEquipmentItem tag cannot be empty.")
        return s

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class PlanSymbolInstance(BaseModel):
    """Spatial symbol instance detected or placed on a CAD drawing plan sheet."""

    model_config = ConfigDict(extra="ignore")

    symbol_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str = Field(
        ..., description="Extracted symbol text label or tag from drawing plan, e.g. 'AHU-01', 'SD'"
    )
    description: str = ""
    sheet_id: str
    location_pt: list[float]
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    status: Literal["DETECTED", "VERIFIED", "SUGGESTED", "ACCEPTED", "REJECTED"] = "DETECTED"
    bounding_box_pt: list[float] | None = None
    system: str = "General"
    discipline: TradeDiscipline | None = None
    category: str = "EQUIPMENT"
    source: Literal["VLM_DETECTION", "VECTOR_ENGINE", "MANUAL", "QUICKDRAW_HOVER"] = "VLM_DETECTION"

    @field_validator("location_pt")
    @classmethod
    def validate_location(cls, v: list[float]) -> list[float]:
        if len(v) != 2:
            raise ValueError(f"location_pt must contain exactly 2 coordinates [x, y], got {len(v)}")
        x, y = float(v[0]), float(v[1])
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError(f"location_pt coordinates must be finite numbers, got [{x}, {y}]")
        return [round(x, 2), round(y, 2)]

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("PlanSymbolInstance label cannot be empty.")
        return s

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class DiscrepancyItem(BaseModel):
    """Itemized discrepancy record between equipment schedule and plan symbol counts."""

    model_config = ConfigDict(extra="ignore")

    item_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tag: str
    label: str
    schedule_qty: int = Field(default=0, ge=0)
    plan_qty: int = Field(default=0, ge=0)
    variance: int
    status: DiscrepancyStatus
    notes: str = ""
    severity: DiscrepancySeverity = "INFO"
    suggested_action: str = ""
    discipline: str = "MECHANICAL"
    system: str = "General"
    matched_symbol_ids: list[str] = Field(default_factory=list)
    schedule_sheet: str | None = None
    plan_sheets: list[str] = Field(default_factory=list)
    normalized_tag: str = ""

    @field_validator("variance")
    @classmethod
    def validate_variance_formula(cls, v: int, info: ValidationInfo) -> int:
        if info.data and "plan_qty" in info.data and "schedule_qty" in info.data:
            expected = info.data["plan_qty"] - info.data["schedule_qty"]
            if v != expected:
                raise ValueError(
                    f"variance must equal plan_qty - schedule_qty "
                    f"({info.data['plan_qty']} - {info.data['schedule_qty']} = {expected}), got {v}"
                )
        return v

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class GhostPin(BaseModel):
    """Virtual pin placeholder for scheduled equipment missing physical plan placement."""

    model_config = ConfigDict(extra="ignore")

    ghost_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tag: str
    description: str = ""
    schedule_ref: str
    suggested_discipline: str = "MECHANICAL"
    status: Literal["UNPLACED", "PLACED", "IGNORED"] = "UNPLACED"
    location_pt: list[float] | None = None
    suggested_system: str = "General"
    quantity: int = Field(default=1, ge=1)
    schedule_row_data: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=_utc_now_iso)
    placed_sheet_id: str | None = None

    def place(self, sheet_id: str, coordinates: list[float]) -> None:
        """Place ghost pin at a physical CAD coordinate on a plan sheet."""
        if len(coordinates) != 2 or not all(math.isfinite(c) for c in coordinates):
            raise ValueError(f"Coordinates must be 2 finite numbers, got {coordinates}")
        self.status = "PLACED"
        self.placed_sheet_id = sheet_id
        self.location_pt = [round(float(coordinates[0]), 2), round(float(coordinates[1]), 2)]

    def ignore(self) -> None:
        """Mark ghost pin as intentionally ignored by estimator."""
        self.status = "IGNORED"

    def to_canvas_pin(self) -> dict[str, Any]:
        """Convert to frontend CanvasPin schema for 150 DPI canvas overlay."""
        coords = self.location_pt or [60.0, 100.0]
        return {
            "id": self.ghost_id,
            "x": coords[0],
            "y": coords[1],
            "kind": "ghost",
            "label": self.tag,
            "description": self.description,
            "system": self.suggested_system,
            "status": "SUGGESTED" if self.status == "UNPLACED" else "ACCEPTED",
            "reviewRequired": (self.status == "UNPLACED"),
            "quantity": self.quantity,
        }

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class DisciplineSummary(BaseModel):
    """Aggregated takeoff reconciliation metrics for a single engineering trade discipline."""

    model_config = ConfigDict(extra="ignore")

    discipline: str
    total_scheduled: int = Field(default=0, ge=0)
    total_counted: int = Field(default=0, ge=0)
    total_matched: int = Field(default=0, ge=0)
    match_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    scheduled_count: int = Field(default=0, ge=0)
    plan_count: int = Field(default=0, ge=0)
    matched_count: int = Field(default=0, ge=0)
    undercount_items: int = Field(default=0, ge=0)
    overcount_items: int = Field(default=0, ge=0)
    unscheduled_items: int = Field(default=0, ge=0)
    ghost_pins_count: int = Field(default=0, ge=0)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


class ReconciliationReport(BaseModel):
    """Comprehensive takeoff reconciliation report comparing schedule against plan symbols."""

    model_config = ConfigDict(extra="ignore")

    reconciliation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str = ""
    timestamp: str = Field(default_factory=_utc_now_iso)
    total_scheduled: int = Field(default=0, ge=0)
    total_counted: int = Field(default=0, ge=0)
    total_matched: int = Field(default=0, ge=0)
    total_undercounts: int = Field(default=0, ge=0)
    total_overcounts: int = Field(default=0, ge=0)
    total_unscheduled: int = Field(default=0, ge=0)
    total_ghosts: int = Field(default=0, ge=0)
    match_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    discrepancies: list[DiscrepancyItem] = Field(default_factory=list)
    ghost_pins: list[GhostPin] = Field(default_factory=list)
    summary_by_discipline: dict[str, Any] = Field(default_factory=dict)
    review_required: bool = False

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()


# ---------------------------------------------------------------------------
# Tag Normalization & Discipline Helpers
# ---------------------------------------------------------------------------

_CLEAN_PUNCT_REGEX = re.compile(r"[\(\)\[\]\{\}\<\>\"':;,#]")
_CLEAN_TYP_REGEX = re.compile(r"\b(TYP|TYPICAL)\b", re.IGNORECASE)
_CLEAN_DELIM_REGEX = re.compile(r"[\s_.\-]+")
_TAG_SPLIT_REGEX = re.compile(r"^([A-Z]+(?:[-_.\s]+[A-Z]+)*)[-_.\s]*0*(\d+)(.*)$")


def normalize_tag(raw_tag: str) -> str:
    """Normalize equipment tags for robust matching while preserving distinct numbers.

    Normalizes case, whitespace, delimiters to hyphens, and strips leading numeric zeros.
    Never conflates distinct numbers (e.g. 'AHU-1' != 'AHU-2', 'VAV-1' != 'VAV-10').

    Examples:
        'AHU-01'  -> 'AHU-1'
        'ahu 1'   -> 'AHU-1'
        'AHU_01'  -> 'AHU-1'
        'ahu-1'   -> 'AHU-1'
        'VAV-002' -> 'VAV-2'
        'vav 2'   -> 'VAV-2'
        'VAV2'    -> 'VAV-2'
        'FCU-02A' -> 'FCU-2A'
        'fcu 2a'  -> 'FCU-2A'
        'fcu 2-a' -> 'FCU-2A'
        'SD-01'   -> 'SD-1'
        'FD'      -> 'FD'
        'AHU-1'   -> 'AHU-1'
        'AHU-2'   -> 'AHU-2' (distinct from 'AHU-1')
        'VAV-10'  -> 'VAV-10' (distinct from 'VAV-1')
    """
    if not raw_tag or not isinstance(raw_tag, str):
        return ""
    clean = raw_tag.strip().upper()
    if not clean:
        return ""

    # Strip surrounding brackets, quotes, typical annotations
    clean = _CLEAN_PUNCT_REGEX.sub("", clean)
    clean = _CLEAN_TYP_REGEX.sub("", clean).strip()
    if not clean:
        return ""

    match = _TAG_SPLIT_REGEX.match(clean)
    if match:
        prefix_raw = match.group(1)
        prefix = _CLEAN_DELIM_REGEX.sub("-", prefix_raw).strip("-")
        num_raw = match.group(2)
        # Leading zeros stripped safely via int conversion
        num = str(int(num_raw))
        suffix_raw = match.group(3).strip()
        if suffix_raw:
            # Case 1: Pure letter suffix (e.g. 'A', '-A', 'EXT') attaches directly to num
            letter_match = re.fullmatch(r"[-_.\s]*([A-Z]+)", suffix_raw)
            if letter_match:
                return f"{prefix}-{num}{letter_match.group(1)}"

            # Case 2: Compound or hierarchical suffix (e.g. '-1', '.1', '-01', '-1A')
            # Preserves delimiters separating distinct numeric sub-units.
            raw_parts = [p for p in _CLEAN_DELIM_REGEX.split(suffix_raw) if p]
            norm_parts: list[str] = []
            for p in raw_parts:
                num_sub = re.match(r"^0*(\d+)([A-Z]*)$", p)
                if num_sub:
                    norm_parts.append(f"{int(num_sub.group(1))}{num_sub.group(2)}")
                else:
                    norm_parts.append(p)
            if norm_parts:
                return f"{prefix}-{num}-" + "-".join(norm_parts)
        return f"{prefix}-{num}"

    # Fallback for non-numeric tags, e.g. 'SD', 'FD', 'VCD'
    return _CLEAN_DELIM_REGEX.sub("-", clean).strip("-")


def infer_item_discipline(
    sheet_id: str = "",
    tag: str = "",
    system: str = "",
) -> TradeDiscipline:
    """Infers engineering discipline from sheet number prefix, system, and tag taxonomy."""
    s_upper = sheet_id.strip().upper()
    tag_upper = tag.strip().upper()
    sys_upper = system.strip().upper()

    # 1. Sheet prefix check
    if s_upper.startswith("P") and not s_upper.startswith("PP"):
        return "PLUMBING"
    if s_upper.startswith("M"):
        return "MECHANICAL"
    if s_upper.startswith("E"):
        return "ELECTRICAL"
    if s_upper.startswith(("FP", "FA")):
        return "FIRE_PROTECTION"
    if s_upper.startswith("A"):
        return "ARCHITECTURAL"

    # 2. System keyword check
    if any(k in sys_upper for k in ["AIR", "HVAC", "DUCT", "EXHAUST", "CHILLED", "HEATING"]):
        return "MECHANICAL"
    if any(k in sys_upper for k in ["WATER", "DRAIN", "PLUMB", "WASTE", "VENT", "GAS", "SAN"]):
        return "PLUMBING"
    if any(k in sys_upper for k in ["POWER", "LIGHT", "VOLT", "ELEC", "PANEL", "CIRCUIT"]):
        return "ELECTRICAL"
    if any(k in sys_upper for k in ["SPRINKLER", "FIRE"]):
        return "FIRE_PROTECTION"

    # 3. Tag prefix check
    if any(
        tag_upper.startswith(k)
        for k in [
            "AHU",
            "VAV",
            "RTU",
            "FCU",
            "EF",
            "SF",
            "CU",
            "ACCU",
            "CH",
            "CRAC",
            "MAU",
            "SD",
            "RG",
            "EG",
            "VD",
        ]
    ):
        return "MECHANICAL"
    if any(
        tag_upper.startswith(k)
        for k in ["WC", "LAV", "UR", "WH", "SH", "EWC", "CO", "BFP", "RP", "PUMP", "P-"]
    ):
        return "PLUMBING"
    if any(
        tag_upper.startswith(k)
        for k in ["PNL", "MDP", "SWBD", "XFMR", "GEN", "ATS", "REC", "DUP"]
    ):
        return "ELECTRICAL"
    if any(tag_upper.startswith(k) for k in ["SPKR", "FDC", "PIV"]):
        return "FIRE_PROTECTION"

    # Tag collision resolution for 'FD' (Fire Damper vs Floor Drain)
    if tag_upper.startswith("FD"):
        if "DRAIN" in sys_upper or s_upper.startswith("P"):
            return "PLUMBING"
        return "MECHANICAL"

    return "MECHANICAL"


# ---------------------------------------------------------------------------
# Core Engine Function: reconcile_takeoff
# ---------------------------------------------------------------------------


def reconcile_takeoff(
    arg1: Any = None,
    arg2: Any = None,
    *,
    scheduled_items: list[Any] | None = None,
    plan_symbols: list[Any] | None = None,
    symbol_counts: dict[str, int] | None = None,
    schedule_items: list[Any] | None = None,
    project_id: str = "",
    sheet_id: str | None = None,
) -> ReconciliationReport:
    """Reconciles scheduled equipment entries against spatial plan symbol counts.

    Supports dual invocation styles:
      1. Pure typed models:
         `reconcile_takeoff(scheduled_items=[ScheduledEquipmentItem(...)], plan_symbols=[PlanSymbolInstance(...)])`
      2. Dictionary count interface (PROJECT.md contract):
         `reconcile_takeoff(symbol_counts={'AHU-1': 1}, schedule_items=[ScheduledEquipmentItem(...)])`
         or `reconcile_takeoff(schedule_items, symbol_counts)`.

    Args:
        arg1: Positional argument 1 (schedule items or symbol counts).
        arg2: Positional argument 2 (plan symbols or schedule items).
        scheduled_items: Explicit list of scheduled equipment items or dicts.
        plan_symbols: Explicit list of plan symbol instances or dicts.
        symbol_counts: Dict mapping symbol tags/labels to detected integer counts.
        schedule_items: Alias for scheduled_items.
        project_id: Optional project identifier for provenance.
        sheet_id: Optional sheet identifier fallback.

    Returns:
        ReconciliationReport with variance calculation, discrepancy severity, and ghost pins.
    """
    # Resolve alias parameters
    if scheduled_items is None and schedule_items is not None:
        scheduled_items = schedule_items

    # Argument pattern dispatching
    if arg1 is not None and arg2 is not None:
        if isinstance(arg1, dict) and isinstance(arg2, list):
            # Pattern: reconcile_takeoff(symbol_counts, schedule_items)
            symbol_counts = arg1
            scheduled_items = arg2
        elif isinstance(arg2, dict) and isinstance(arg1, list):
            # Pattern: reconcile_takeoff(schedule_items, symbol_counts)
            scheduled_items = arg1
            symbol_counts = arg2
        elif isinstance(arg1, list) and isinstance(arg2, list):
            # Pattern: reconcile_takeoff(scheduled_items, plan_symbols)
            scheduled_items = arg1
            plan_symbols = arg2

    # Convert symbol_counts dict to PlanSymbolInstance list if supplied
    if symbol_counts is not None and plan_symbols is None:
        converted_symbols: list[PlanSymbolInstance] = []
        for label, count in symbol_counts.items():
            if count < 0:
                raise ValueError(f"Symbol count for '{label}' cannot be negative: {count}")
            for i in range(count):
                converted_symbols.append(
                    PlanSymbolInstance(
                        symbol_id=f"sym-{label}-{i + 1}",
                        label=label,
                        sheet_id=sheet_id or "M-101",
                        location_pt=[100.0, 100.0 + i * 20.0],
                        confidence=0.95,
                        status="DETECTED",
                    )
                )
        plan_symbols = converted_symbols

    # Normalize scheduled_items input to list[ScheduledEquipmentItem]
    norm_scheduled: list[ScheduledEquipmentItem] = []
    for item in (scheduled_items or []):
        if isinstance(item, ScheduledEquipmentItem):
            norm_scheduled.append(item)
        elif isinstance(item, dict):
            s_dict = dict(item)
            if "quantity" not in s_dict or s_dict["quantity"] is None:
                s_dict["quantity"] = 1
            if "schedule_sheet" not in s_dict or not s_dict["schedule_sheet"]:
                s_dict["schedule_sheet"] = sheet_id or "M-601"
            norm_scheduled.append(ScheduledEquipmentItem(**s_dict))
        else:
            raise TypeError(f"Unsupported schedule item type: {type(item)}")

    # Normalize plan_symbols input to list[PlanSymbolInstance]
    norm_symbols: list[PlanSymbolInstance] = []
    for sym in (plan_symbols or []):
        if isinstance(sym, PlanSymbolInstance):
            norm_symbols.append(sym)
        elif isinstance(sym, dict):
            sym_dict = dict(sym)
            if "sheet_id" not in sym_dict or not sym_dict["sheet_id"]:
                sym_dict["sheet_id"] = sheet_id or "M-101"
            if "location_pt" not in sym_dict or sym_dict["location_pt"] is None:
                sym_dict["location_pt"] = [100.0, 100.0]
            if "confidence" not in sym_dict or sym_dict["confidence"] is None:
                sym_dict["confidence"] = 0.95
            if "status" not in sym_dict or not sym_dict["status"]:
                sym_dict["status"] = "DETECTED"
            norm_symbols.append(PlanSymbolInstance(**sym_dict))
        else:
            raise TypeError(f"Unsupported plan symbol type: {type(sym)}")

    # Step 1: Aggregate schedule items by canonical tag
    schedule_map: dict[str, dict[str, Any]] = {}
    for item in norm_scheduled:
        c_tag = normalize_tag(item.tag)
        if not c_tag:
            continue
        disc = item.discipline or infer_item_discipline(
            item.schedule_sheet, item.tag, item.system
        )
        if c_tag not in schedule_map:
            schedule_map[c_tag] = {
                "original_tag": item.tag,
                "total_qty": 0,
                "items": [],
                "description": item.description,
                "discipline": disc,
                "system": item.system,
                "sheets": set(),
                "row_data": item.row_data,
            }
        schedule_map[c_tag]["total_qty"] += item.quantity
        schedule_map[c_tag]["items"].append(item)
        if item.schedule_sheet:
            schedule_map[c_tag]["sheets"].add(item.schedule_sheet)
        if not schedule_map[c_tag]["description"] and item.description:
            schedule_map[c_tag]["description"] = item.description

    # Step 2: Aggregate plan symbol instances by canonical label
    plan_map: dict[str, dict[str, Any]] = {}
    for sym in norm_symbols:
        c_label = normalize_tag(sym.label)
        if not c_label:
            continue
        disc = sym.discipline or infer_item_discipline(sym.sheet_id, sym.label, sym.system)
        if c_label not in plan_map:
            plan_map[c_label] = {
                "original_label": sym.label,
                "symbols": [],
                "sheets": set(),
                "discipline": disc,
                "system": sym.system,
            }
        plan_map[c_label]["symbols"].append(sym)
        if sym.sheet_id:
            plan_map[c_label]["sheets"].add(sym.sheet_id)

    # Step 3: Match across all unique canonical tags preserving schedule order
    all_keys: list[str] = []
    for k in schedule_map:
        if k not in all_keys:
            all_keys.append(k)
    for k in plan_map:
        if k not in all_keys:
            all_keys.append(k)

    discrepancies: list[DiscrepancyItem] = []
    ghost_pins: list[GhostPin] = []

    total_scheduled = 0
    total_counted = 0
    total_matched = 0
    total_undercounts = 0
    total_overcounts = 0
    total_unscheduled = 0
    total_ghosts = 0
    ghost_counter = 0

    for c_key in all_keys:
        sched_entry = schedule_map.get(c_key)
        plan_entry = plan_map.get(c_key)

        sched_qty = int(sched_entry["total_qty"]) if sched_entry else 0
        plan_qty = len(plan_entry["symbols"]) if plan_entry else 0
        total_scheduled += sched_qty
        total_counted += plan_qty

        variance = plan_qty - sched_qty

        # Preserve verbatim display strings
        tag_str = (
            sched_entry["original_tag"]
            if sched_entry
            else (plan_entry["original_label"] if plan_entry else c_key)
        )
        label_str = plan_entry["original_label"] if plan_entry else tag_str
        description_str = (
            (sched_entry["description"] if sched_entry else "")
            or (
                plan_entry["symbols"][0].description
                if plan_entry and plan_entry["symbols"]
                else ""
            )
        )
        discipline_str = (
            sched_entry["discipline"]
            if sched_entry
            else (plan_entry["discipline"] if plan_entry else "MECHANICAL")
        )
        system_str = (
            sched_entry["system"]
            if sched_entry
            else (plan_entry["system"] if plan_entry else "General")
        )
        sched_sheet_str = (
            ", ".join(sorted(sched_entry["sheets"]))
            if sched_entry and sched_entry["sheets"]
            else None
        )
        plan_sheets_list = sorted(plan_entry["sheets"]) if plan_entry else []
        matched_sym_ids = [s.symbol_id for s in plan_entry["symbols"]] if plan_entry else []

        if sched_qty > 0 and plan_qty > 0:
            if variance == 0:
                status: DiscrepancyStatus = "MATCHED"
                severity: DiscrepancySeverity = "INFO"
                notes = f"Exact match: {sched_qty} scheduled, {plan_qty} detected on plan."
                suggested_action = "No action needed; schedule matches plan counts exactly."
                matched_credit = sched_qty
            elif variance < 0:
                status = "UNDERCOUNT"
                severity = "WARNING"
                notes = (
                    f"Undercount discrepancy: {sched_qty} scheduled vs {plan_qty} on plan "
                    f"(missing {abs(variance)})."
                )
                suggested_action = (
                    "Review plan sheets for missing symbols or check for obscured/unlabeled equipment."
                )
                total_undercounts += 1
                matched_credit = plan_qty

                # Spawn Ghost Pins for missing delta instances
                missing_delta = abs(variance)
                for i in range(missing_delta):
                    ghost_tag = f"{tag_str} (#{plan_qty + i + 1})"
                    dock_pt = [60.0, 100.0 + ghost_counter * 35.0]
                    ghost_pins.append(
                        GhostPin(
                            tag=ghost_tag,
                            description=description_str,
                            schedule_ref=sched_sheet_str or "Schedule",
                            suggested_discipline=discipline_str,
                            suggested_system=system_str,
                            status="UNPLACED",
                            location_pt=dock_pt,
                            quantity=1,
                            schedule_row_data=sched_entry.get("row_data", {}) if sched_entry else {},
                        )
                    )
                    ghost_counter += 1
            else:
                status = "OVERCOUNT"
                severity = "WARNING"
                notes = (
                    f"Overcount discrepancy: {plan_qty} on plan vs {sched_qty} scheduled "
                    f"(excess {variance})."
                )
                suggested_action = (
                    "Verify plan drawing for duplicate symbol detections or verify if schedule is outdated."
                )
                total_overcounts += 1
                matched_credit = sched_qty

            total_matched += matched_credit

        elif sched_qty > 0 and plan_qty == 0:
            status = "UNPLACED_GHOST"
            severity = "CRITICAL"
            notes = (
                f"Scheduled equipment {tag_str} ({sched_qty} specified) has 0 instances "
                f"detected on plan drawings."
            )
            suggested_action = (
                "Create ghost pin placeholder for manual estimator placement on plan canvas."
            )
            total_ghosts += 1

            # Spawn Ghost Pins for every scheduled unit with default margin dock staging
            for i in range(sched_qty):
                ghost_tag = f"{tag_str} (#{i + 1})" if sched_qty > 1 else tag_str
                dock_pt = [60.0, 100.0 + ghost_counter * 35.0]
                ghost_pins.append(
                    GhostPin(
                        tag=ghost_tag,
                        description=description_str,
                        schedule_ref=sched_sheet_str or "Schedule",
                        suggested_discipline=discipline_str,
                        suggested_system=system_str,
                        status="UNPLACED",
                        location_pt=dock_pt,
                        quantity=1,
                        schedule_row_data=sched_entry.get("row_data", {}) if sched_entry else {},
                    )
                )
                ghost_counter += 1

        elif sched_qty == 0 and plan_qty == 0:
            status = "MATCHED"
            severity = "INFO"
            notes = f"Exact match: 0 scheduled and 0 detected for {tag_str}."
            suggested_action = (
                "No action needed; scheduled quantity 0 matches 0 detected symbols."
            )

        else:  # sched_qty == 0 and plan_qty > 0
            status = "UNSCHEDULED"
            severity = "WARNING"
            notes = (
                f"Plan symbol {label_str} ({plan_qty} detected) is not present in equipment "
                f"schedule tables."
            )
            suggested_action = (
                "Confirm whether symbol is existing-to-remain, future phase, or omitted from schedule."
            )
            total_unscheduled += 1

        discrepancies.append(
            DiscrepancyItem(
                tag=tag_str,
                label=label_str,
                schedule_qty=sched_qty,
                plan_qty=plan_qty,
                variance=variance,
                status=status,
                notes=notes,
                severity=severity,
                suggested_action=suggested_action,
                discipline=discipline_str,
                system=system_str,
                matched_symbol_ids=matched_sym_ids,
                schedule_sheet=sched_sheet_str,
                plan_sheets=plan_sheets_list,
                normalized_tag=c_key,
            )
        )

    # Step 4: Multi-Discipline Rollup
    discipline_groups: dict[str, DisciplineSummary] = {}
    for disc_item in discrepancies:
        disc_name = disc_item.discipline.upper()
        if disc_name not in discipline_groups:
            discipline_groups[disc_name] = DisciplineSummary(
                discipline=disc_name,
                total_scheduled=0,
                total_counted=0,
                total_matched=0,
                scheduled_count=0,
                plan_count=0,
                matched_count=0,
                undercount_items=0,
                overcount_items=0,
                unscheduled_items=0,
                ghost_pins_count=0,
                match_rate=0.0,
            )
        g = discipline_groups[disc_name]
        g.total_scheduled += disc_item.schedule_qty
        g.scheduled_count += disc_item.schedule_qty
        g.total_counted += disc_item.plan_qty
        g.plan_count += disc_item.plan_qty
        if disc_item.status == "MATCHED":
            g.total_matched += disc_item.plan_qty
            g.matched_count += disc_item.plan_qty
        elif disc_item.status == "UNDERCOUNT":
            g.total_matched += disc_item.plan_qty
            g.matched_count += disc_item.plan_qty
            g.undercount_items += 1
        elif disc_item.status == "OVERCOUNT":
            g.total_matched += disc_item.schedule_qty
            g.matched_count += disc_item.schedule_qty
            g.overcount_items += 1
        elif disc_item.status == "UNSCHEDULED":
            g.unscheduled_items += 1
        elif disc_item.status == "UNPLACED_GHOST":
            g.ghost_pins_count += disc_item.schedule_qty

    for g in discipline_groups.values():
        if g.total_scheduled > 0:
            g.match_rate = round(min(1.0, g.total_matched / g.total_scheduled), 4)
        else:
            g.match_rate = 1.0 if g.total_counted == 0 else 0.0

    match_rate = (
        round(total_matched / total_scheduled, 4)
        if total_scheduled > 0
        else (1.0 if total_counted == 0 else 0.0)
    )
    review_required = (
        (total_undercounts > 0)
        or (total_overcounts > 0)
        or (total_unscheduled > 0)
        or (total_ghosts > 0)
    )

    return ReconciliationReport(
        project_id=project_id,
        timestamp=_utc_now_iso(),
        total_scheduled=total_scheduled,
        total_counted=total_counted,
        total_matched=total_matched,
        total_undercounts=total_undercounts,
        total_overcounts=total_overcounts,
        total_unscheduled=total_unscheduled,
        total_ghosts=total_ghosts,
        match_rate=match_rate,
        discrepancies=discrepancies,
        ghost_pins=ghost_pins,
        summary_by_discipline={k: v.model_dump() for k, v in discipline_groups.items()},
        review_required=review_required,
    )


# ---------------------------------------------------------------------------
# Dictionary Parsing Helper: reconcile_from_dict
# ---------------------------------------------------------------------------


def reconcile_from_dict(
    schedule_data: list[dict[str, Any]],
    symbol_data: list[dict[str, Any]],
    project_id: str = "",
    sheet_id: str | None = None,
) -> ReconciliationReport:
    """Parses raw dictionaries and executes takeoff reconciliation.

    Handles default values and graceful validation for JSON API endpoints and SQLite results.

    Args:
        schedule_data: List of dictionaries matching ScheduledEquipmentItem fields.
        symbol_data: List of dictionaries matching PlanSymbolInstance fields.
        project_id: Target project identifier.
        sheet_id: Optional sheet identifier fallback.

    Returns:
        ReconciliationReport object.
    """
    scheduled_items: list[ScheduledEquipmentItem] = []
    for s_raw in schedule_data:
        item_dict = dict(s_raw)
        if "quantity" not in item_dict or item_dict["quantity"] is None:
            item_dict["quantity"] = 1
        if "schedule_sheet" not in item_dict or not item_dict["schedule_sheet"]:
            item_dict["schedule_sheet"] = sheet_id or "UNKNOWN_SCHEDULE_SHEET"
        scheduled_items.append(ScheduledEquipmentItem(**item_dict))

    plan_symbols: list[PlanSymbolInstance] = []
    for sym_raw in symbol_data:
        sym_dict = dict(sym_raw)
        if "sheet_id" not in sym_dict or not sym_dict["sheet_id"]:
            sym_dict["sheet_id"] = sheet_id or "UNKNOWN_PLAN_SHEET"
        if "confidence" not in sym_dict or sym_dict["confidence"] is None:
            sym_dict["confidence"] = 0.95
        if "status" not in sym_dict or not sym_dict["status"]:
            sym_dict["status"] = "DETECTED"
        if "location_pt" not in sym_dict or sym_dict["location_pt"] is None:
            sym_dict["location_pt"] = [100.0, 100.0]
        plan_symbols.append(PlanSymbolInstance(**sym_dict))

    return reconcile_takeoff(
        scheduled_items=scheduled_items,
        plan_symbols=plan_symbols,
        project_id=project_id,
        sheet_id=sheet_id,
    )


# ---------------------------------------------------------------------------
# Coordinator Class: TakeoffReconciler
# ---------------------------------------------------------------------------


class TakeoffReconciler:
    """Coordinates takeoff ledger reconciliation and optional TakeoffStore persistence."""

    def __init__(self, store: Any | None = None) -> None:
        self.store = store

    def reconcile(
        self,
        arg1: Any = None,
        arg2: Any = None,
        *,
        scheduled_items: list[Any] | None = None,
        plan_symbols: list[Any] | None = None,
        symbol_counts: dict[str, int] | None = None,
        schedule_items: list[Any] | None = None,
        project_id: str = "",
        sheet_id: str | None = None,
    ) -> ReconciliationReport:
        """Run synchronous in-memory takeoff reconciliation."""
        return reconcile_takeoff(
            arg1=arg1,
            arg2=arg2,
            scheduled_items=scheduled_items,
            plan_symbols=plan_symbols,
            symbol_counts=symbol_counts,
            schedule_items=schedule_items,
            project_id=project_id,
            sheet_id=sheet_id,
        )

    async def reconcile_from_store(
        self,
        project_id: str,
        scheduled_items: list[ScheduledEquipmentItem] | list[dict[str, Any]],
        sheet_id: str | None = None,
    ) -> ReconciliationReport:
        """Reconciles scheduled items against plan equipment loaded from TakeoffStore."""
        if self.store is None:
            raise RuntimeError("TakeoffStore instance is required for reconcile_from_store.")

        records = await self.store.list_items(project_id=project_id, sheet_id=sheet_id)
        plan_symbols: list[PlanSymbolInstance] = []
        for r in records:
            if getattr(r, "status", None) == "REJECTED":
                continue
            if getattr(r, "category", None) in ("EQUIPMENT", "FIXTURE"):
                coords = [100.0, 100.0]
                tag = getattr(r, "dimension_label", "Unknown")
                geom = getattr(r, "geometry", {})
                if isinstance(geom, dict):
                    if (
                        "coordinates" in geom
                        and isinstance(geom["coordinates"], list)
                        and len(geom["coordinates"]) == 2
                    ):
                        coords = [float(geom["coordinates"][0]), float(geom["coordinates"][1])]
                    if geom.get("tag"):
                        tag = str(geom["tag"])

                plan_symbols.append(
                    PlanSymbolInstance(
                        symbol_id=getattr(r, "item_id", str(uuid.uuid4())),
                        label=tag,
                        description=f"{getattr(r, 'category', 'EQUIPMENT')} - {getattr(r, 'dimension_label', '')}",
                        sheet_id=getattr(r, "sheet_id", sheet_id or "M-101"),
                        location_pt=coords,
                        confidence=getattr(r, "confidence", 0.95) or 0.95,
                        status="SUGGESTED",
                        system=getattr(r, "system", "General"),
                        category=getattr(r, "category", "EQUIPMENT"),
                    )
                )

        parsed_sched: list[ScheduledEquipmentItem] = []
        for s in scheduled_items:
            if isinstance(s, ScheduledEquipmentItem):
                parsed_sched.append(s)
            elif isinstance(s, dict):
                item_dict = dict(s)
                if "schedule_sheet" not in item_dict:
                    item_dict["schedule_sheet"] = sheet_id or "M-601"
                if "quantity" not in item_dict or item_dict["quantity"] is None:
                    item_dict["quantity"] = 1
                parsed_sched.append(ScheduledEquipmentItem(**item_dict))

        return reconcile_takeoff(
            scheduled_items=parsed_sched,
            plan_symbols=plan_symbols,
            project_id=project_id,
            sheet_id=sheet_id,
        )
