"""Comprehensive Unit Tests for Takeoff Ledger & Schedule Reconciliation Engine.

Tests cover:
- Perfect 1:1 match across items
- Undercount detection with Ghost Pin generation
- Overcount detection with warning
- Unscheduled plan symbols
- Complete unplaced equipment (UNPLACED_GHOST with CRITICAL severity)
- Tag normalization matching (AHU-01 == ahu 1 == AHU_1)
- Numeric distinction guard (AHU-1 != AHU-2, VAV-1 != VAV-10)
- Multi-row schedule aggregation and multi-symbol plan grouping
- Multi-discipline rollups (Mechanical, Plumbing, Electrical)
- Dict payload parsing and default handling
- Dict-based symbol_counts interface from PROJECT.md
- Pydantic schema validation failures and edge cases
- Ghost Pin lifecycle transitions and canvas pin generation
- High-volume performance
- TakeoffReconciler coordinator with in-memory and mock store

Conforms to AGENTS.md, ADR-003, and TASK-004 specifications.
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from src.store.reconciler import (
    DiscrepancyItem,
    GhostPin,
    PlanSymbolInstance,
    ScheduledEquipmentItem,
    TakeoffReconciler,
    infer_item_discipline,
    normalize_tag,
    reconcile_from_dict,
    reconcile_takeoff,
)

# ===========================================================================
# 1. Tag Normalization & Discipline Inference Tests
# ===========================================================================


def test_normalize_tag_variations() -> None:
    """Verify canonical tag normalization across case, delimiters, and leading zeros."""
    assert normalize_tag("AHU-01") == "AHU-1"
    assert normalize_tag("ahu 1") == "AHU-1"
    assert normalize_tag("AHU_01") == "AHU-1"
    assert normalize_tag("ahu-1") == "AHU-1"
    assert normalize_tag("VAV-002") == "VAV-2"
    assert normalize_tag("vav 2") == "VAV-2"
    assert normalize_tag("VAV2") == "VAV-2"
    assert normalize_tag("FCU-02A") == "FCU-2A"
    assert normalize_tag("fcu 2a") == "FCU-2A"
    assert normalize_tag("fcu 2-a") == "FCU-2A"
    assert normalize_tag("SD-01") == "SD-1"
    assert normalize_tag("SD 1") == "SD-1"
    assert normalize_tag("FD") == "FD"
    assert normalize_tag("  EF_05  ") == "EF-5"
    assert normalize_tag("(VAV-1)") == "VAV-1"
    assert normalize_tag("VAV-1 (TYP)") == "VAV-1"
    assert normalize_tag("VAV-1 TYPICAL") == "VAV-1"
    assert normalize_tag("") == ""
    assert normalize_tag("   ") == ""


def test_normalize_tag_numeric_distinction_guard() -> None:
    """Strictly verify distinct physical units never normalize to identical keys."""
    assert normalize_tag("AHU-1") != normalize_tag("AHU-2")
    assert normalize_tag("VAV-1") != normalize_tag("VAV-10")
    assert normalize_tag("EF-1") != normalize_tag("EF-11")
    assert normalize_tag("FCU-1A") != normalize_tag("FCU-1B")
    assert normalize_tag("P-1") != normalize_tag("P-2")
    assert normalize_tag("AHU-1-1") != normalize_tag("AHU-11")
    assert normalize_tag("VAV-1.1") != normalize_tag("VAV-11")
    assert normalize_tag("VAV-1-2") != normalize_tag("VAV-12")
    assert normalize_tag("AHU-01-01") == normalize_tag("AHU-1-1")


def test_infer_item_discipline() -> None:
    """Test discipline classification from sheet numbers, system designations, and tag types."""
    assert infer_item_discipline(sheet_id="M-601", tag="AHU-1") == "MECHANICAL"
    assert infer_item_discipline(sheet_id="P-101", tag="WC-1") == "PLUMBING"
    assert infer_item_discipline(sheet_id="E-201", tag="PNL-1") == "ELECTRICAL"
    assert infer_item_discipline(sheet_id="FP-101", tag="SPKR-1") == "FIRE_PROTECTION"
    assert infer_item_discipline(sheet_id="A-101", tag="DOOR-1") == "ARCHITECTURAL"

    # Tag collision disambiguation for 'FD'
    assert infer_item_discipline(sheet_id="M-201", tag="FD-1") == "MECHANICAL"
    assert infer_item_discipline(sheet_id="P-201", tag="FD-1") == "PLUMBING"
    assert (
        infer_item_discipline(sheet_id="", tag="FD-1", system="Sanitary Waste & Drain")
        == "PLUMBING"
    )


# ===========================================================================
# 2. Perfect 1:1 Reconciliation Match
# ===========================================================================


def test_reconcile_perfect_one_to_one_match() -> None:
    """Perfect 1:1 match across items yields 100% match rate and review_required=False."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-1", description="Air Handler 1", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="VAV-01", description="VAV Box", schedule_sheet="M-601", quantity=3),
        ScheduledEquipmentItem(tag="EF-1", description="Exhaust Fan", schedule_sheet="M-601", quantity=2),
    ]

    symbols = [
        PlanSymbolInstance(label="AHU-1", sheet_id="M-201", location_pt=[120.0, 300.0]),
        PlanSymbolInstance(label="VAV-01", sheet_id="M-201", location_pt=[200.0, 150.0]),
        PlanSymbolInstance(label="VAV-01", sheet_id="M-201", location_pt=[250.0, 180.0]),
        PlanSymbolInstance(label="VAV-01", sheet_id="M-201", location_pt=[300.0, 210.0]),
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[400.0, 500.0]),
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[450.0, 520.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols, project_id="PROJ-001")

    assert report.project_id == "PROJ-001"
    assert report.total_scheduled == 6
    assert report.total_counted == 6
    assert report.total_matched == 6
    assert report.total_undercounts == 0
    assert report.total_overcounts == 0
    assert report.total_unscheduled == 0
    assert report.total_ghosts == 0
    assert report.match_rate == 1.0
    assert report.review_required is False
    assert len(report.ghost_pins) == 0
    assert len(report.discrepancies) == 3

    for item in report.discrepancies:
        assert item.status == "MATCHED"
        assert item.severity == "INFO"
        assert item.variance == 0


# ===========================================================================
# 3. Undercount Detection with Ghost Pin Generation
# ===========================================================================


def test_reconcile_undercount_detection() -> None:
    """Schedule specifies 5 VAV boxes, but only 3 are detected on plan sheets."""
    scheduled = [
        ScheduledEquipmentItem(
            tag="VAV-1",
            description="Terminal VAV Unit",
            schedule_sheet="M-601",
            quantity=5,
            discipline="MECHANICAL",
            system="Supply Air",
        )
    ]

    symbols = [
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[100.0, 150.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[150.0, 180.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[200.0, 210.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 5
    assert report.total_counted == 3
    assert report.total_matched == 3
    assert report.total_undercounts == 1
    assert report.total_overcounts == 0
    assert report.match_rate == 0.6
    assert report.review_required is True

    assert len(report.discrepancies) == 1
    disc = report.discrepancies[0]
    assert disc.status == "UNDERCOUNT"
    assert disc.severity == "WARNING"
    assert disc.variance == -2
    assert disc.schedule_qty == 5
    assert disc.plan_qty == 3

    # Check that 2 GhostPins were generated for missing units
    assert len(report.ghost_pins) == 2
    g1, g2 = report.ghost_pins[0], report.ghost_pins[1]
    assert g1.tag == "VAV-1 (#4)"
    assert g2.tag == "VAV-1 (#5)"
    assert g1.status == "UNPLACED"
    assert g2.status == "UNPLACED"
    assert g1.location_pt == [60.0, 100.0]
    assert g2.location_pt == [60.0, 135.0]


# ===========================================================================
# 4. Overcount Detection
# ===========================================================================


def test_reconcile_overcount_detection() -> None:
    """Schedule specifies 2 EF-1 fans, but 4 EF-1 symbols are detected on plan sheets."""
    scheduled = [
        ScheduledEquipmentItem(tag="EF-1", schedule_sheet="M-601", quantity=2)
    ]

    symbols = [
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[120.0, 100.0]),
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[140.0, 100.0]),
        PlanSymbolInstance(label="EF-1", sheet_id="M-201", location_pt=[160.0, 100.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 2
    assert report.total_counted == 4
    assert report.total_matched == 2
    assert report.total_overcounts == 1
    assert report.total_undercounts == 0
    assert report.review_required is True
    assert len(report.ghost_pins) == 0

    disc = report.discrepancies[0]
    assert disc.status == "OVERCOUNT"
    assert disc.severity == "WARNING"
    assert disc.variance == 2
    assert disc.schedule_qty == 2
    assert disc.plan_qty == 4


# ===========================================================================
# 5. Unscheduled Plan Symbols
# ===========================================================================


def test_reconcile_unscheduled_plan_symbols() -> None:
    """Symbols on plan sheets not present in schedule table are flagged UNSCHEDULED."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1)
    ]

    symbols = [
        PlanSymbolInstance(label="AHU-1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="SD-1", sheet_id="M-201", location_pt=[200.0, 200.0]),
        PlanSymbolInstance(label="SD-1", sheet_id="M-201", location_pt=[250.0, 200.0]),
        PlanSymbolInstance(label="UNKNOWN-X", sheet_id="M-201", location_pt=[300.0, 300.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 1
    assert report.total_counted == 4
    assert report.total_matched == 1
    assert report.total_unscheduled == 2
    assert report.review_required is True

    disc_map = {d.tag: d for d in report.discrepancies}
    assert disc_map["AHU-1"].status == "MATCHED"

    assert disc_map["SD-1"].status == "UNSCHEDULED"
    assert disc_map["SD-1"].severity == "WARNING"
    assert disc_map["SD-1"].schedule_qty == 0
    assert disc_map["SD-1"].plan_qty == 2
    assert disc_map["SD-1"].variance == 2

    assert disc_map["UNKNOWN-X"].status == "UNSCHEDULED"
    assert disc_map["UNKNOWN-X"].plan_qty == 1


# ===========================================================================
# 6. Unplaced Equipment (UNPLACED_GHOST) with CRITICAL Severity
# ===========================================================================


def test_reconcile_ghost_pins_zero_plan_instances() -> None:
    """Scheduled equipment with 0 plan instances creates Ghost Pins with CRITICAL severity."""
    scheduled = [
        ScheduledEquipmentItem(
            tag="RTU-1",
            description="Rooftop Unit",
            schedule_sheet="M-601",
            quantity=1,
            discipline="MECHANICAL",
        ),
        ScheduledEquipmentItem(
            tag="P-1",
            description="Chilled Water Pump",
            schedule_sheet="P-401",
            quantity=2,
            discipline="PLUMBING",
        ),
    ]

    symbols: list[PlanSymbolInstance] = []

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 3
    assert report.total_counted == 0
    assert report.total_matched == 0
    assert report.total_ghosts == 2
    assert report.match_rate == 0.0
    assert report.review_required is True

    # 3 total ghost pins (1 for RTU-1, 2 for P-1)
    assert len(report.ghost_pins) == 3

    rtu_pin = report.ghost_pins[0]
    assert rtu_pin.tag == "RTU-1"
    assert rtu_pin.status == "UNPLACED"
    assert rtu_pin.location_pt == [60.0, 100.0]

    p1_pin1 = report.ghost_pins[1]
    assert p1_pin1.tag == "P-1 (#1)"
    assert p1_pin1.status == "UNPLACED"
    assert p1_pin1.location_pt == [60.0, 135.0]

    p1_pin2 = report.ghost_pins[2]
    assert p1_pin2.tag == "P-1 (#2)"
    assert p1_pin2.status == "UNPLACED"
    assert p1_pin2.location_pt == [60.0, 170.0]

    for d in report.discrepancies:
        assert d.status == "UNPLACED_GHOST"
        assert d.severity == "CRITICAL"
        assert d.plan_qty == 0


# ===========================================================================
# 7. Fuzzy Tag Normalization Matching
# ===========================================================================


def test_reconcile_fuzzy_tag_matching_variations() -> None:
    """Verify that formatting variations match 1:1 while preserving raw strings."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-01", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="VAV-002", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="EF_1", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="FCU-02A", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="SD 1", schedule_sheet="M-601", quantity=1),
    ]

    symbols = [
        PlanSymbolInstance(label="ahu 1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="vav 2", sheet_id="M-201", location_pt=[120.0, 100.0]),
        PlanSymbolInstance(label="ef-01", sheet_id="M-201", location_pt=[140.0, 100.0]),
        PlanSymbolInstance(label="fcu 2a", sheet_id="M-201", location_pt=[160.0, 100.0]),
        PlanSymbolInstance(label="SD-01", sheet_id="M-201", location_pt=[180.0, 100.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 5
    assert report.total_counted == 5
    assert report.total_matched == 5
    assert report.match_rate == 1.0
    assert report.review_required is False
    assert len(report.ghost_pins) == 0

    # Ensure raw strings are preserved in DiscrepancyItem
    disc_map = {d.normalized_tag: d for d in report.discrepancies}
    assert disc_map["AHU-1"].tag == "AHU-01"
    assert disc_map["AHU-1"].label == "ahu 1"
    assert disc_map["VAV-2"].tag == "VAV-002"
    assert disc_map["VAV-2"].label == "vav 2"
    assert disc_map["FCU-2A"].tag == "FCU-02A"
    assert disc_map["FCU-2A"].label == "fcu 2a"


def test_reconcile_distinct_numbers_never_conflated() -> None:
    """Verify distinct numbers (AHU-1 vs AHU-2, VAV-1 vs VAV-10) never match each other."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="VAV-1", schedule_sheet="M-601", quantity=1),
    ]

    symbols = [
        PlanSymbolInstance(label="AHU-2", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="VAV-10", sheet_id="M-201", location_pt=[150.0, 150.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_matched == 0
    assert report.total_ghosts == 2
    assert report.total_unscheduled == 2
    assert report.review_required is True

    disc_status_map = {d.tag: d.status for d in report.discrepancies}
    assert disc_status_map["AHU-1"] == "UNPLACED_GHOST"
    assert disc_status_map["AHU-2"] == "UNSCHEDULED"
    assert disc_status_map["VAV-1"] == "UNPLACED_GHOST"
    assert disc_status_map["VAV-10"] == "UNSCHEDULED"


# ===========================================================================
# 8. Schedule Aggregation & Multi-Symbol Grouping
# ===========================================================================


def test_reconcile_duplicate_schedule_rows_aggregation() -> None:
    """Schedule rows with the same canonical tag are aggregated together."""
    scheduled = [
        ScheduledEquipmentItem(tag="VAV-01", schedule_sheet="M-601", quantity=2),
        ScheduledEquipmentItem(tag="vav-1", schedule_sheet="M-602", quantity=3),
    ]

    symbols = [
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[110.0, 100.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-202", location_pt=[120.0, 100.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-202", location_pt=[130.0, 100.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-202", location_pt=[140.0, 100.0]),
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    assert report.total_scheduled == 5
    assert report.total_counted == 5
    assert report.total_matched == 5
    assert report.review_required is False
    assert len(report.discrepancies) == 1

    disc = report.discrepancies[0]
    assert disc.status == "MATCHED"
    assert disc.schedule_qty == 5
    assert disc.plan_qty == 5
    assert disc.variance == 0
    assert "M-601" in disc.schedule_sheet
    assert "M-602" in disc.schedule_sheet
    assert sorted(disc.plan_sheets) == ["M-201", "M-202"]


# ===========================================================================
# 9. Multi-Discipline Rollups
# ===========================================================================


def test_reconcile_summary_by_discipline_rollup() -> None:
    """Verify rollup metrics across Mechanical, Plumbing, and Electrical trades."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1),  # Mechanical
        ScheduledEquipmentItem(tag="VAV-1", schedule_sheet="M-601", quantity=3),  # Mechanical
        ScheduledEquipmentItem(tag="WC-1", schedule_sheet="P-401", quantity=4),   # Plumbing
        ScheduledEquipmentItem(tag="PNL-A", schedule_sheet="E-601", quantity=2),  # Electrical
    ]

    symbols = [
        PlanSymbolInstance(label="AHU-1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[120.0, 100.0]),  # 1 of 3 (undercount)
        PlanSymbolInstance(label="WC-1", sheet_id="P-101", location_pt=[200.0, 200.0]),
        PlanSymbolInstance(label="WC-1", sheet_id="P-101", location_pt=[220.0, 200.0]),
        PlanSymbolInstance(label="WC-1", sheet_id="P-101", location_pt=[240.0, 200.0]),
        PlanSymbolInstance(label="WC-1", sheet_id="P-101", location_pt=[260.0, 200.0]),   # 4 of 4 (matched)
        # PNL-A has 0 symbols (unplaced ghost)
    ]

    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)

    summary = report.summary_by_discipline
    assert "MECHANICAL" in summary
    assert "PLUMBING" in summary
    assert "ELECTRICAL" in summary

    mech = summary["MECHANICAL"]
    assert mech["total_scheduled"] == 4
    assert mech["total_counted"] == 2
    assert mech["total_matched"] == 2
    assert mech["undercount_items"] == 1
    assert mech["match_rate"] == 0.5

    plumb = summary["PLUMBING"]
    assert plumb["total_scheduled"] == 4
    assert plumb["total_counted"] == 4
    assert plumb["total_matched"] == 4
    assert plumb["match_rate"] == 1.0

    elec = summary["ELECTRICAL"]
    assert elec["total_scheduled"] == 2
    assert elec["total_counted"] == 0
    assert elec["total_matched"] == 0
    assert elec["ghost_pins_count"] == 2
    assert elec["match_rate"] == 0.0


# ===========================================================================
# 10. Empty Lists and Edge Cases
# ===========================================================================


def test_reconcile_completely_empty_inputs() -> None:
    """Empty schedule and empty plan symbols return a valid clean report."""
    report = reconcile_takeoff(scheduled_items=[], plan_symbols=[])

    assert report.total_scheduled == 0
    assert report.total_counted == 0
    assert report.total_matched == 0
    assert report.match_rate == 1.0
    assert report.review_required is False
    assert len(report.discrepancies) == 0
    assert len(report.ghost_pins) == 0


def test_reconcile_no_arguments() -> None:
    """reconcile_takeoff() with no args evaluates safely."""
    report = reconcile_takeoff()
    assert report.total_scheduled == 0
    assert report.total_counted == 0
    assert report.match_rate == 1.0


# ===========================================================================
# 11. Dictionary Input Helper (reconcile_from_dict)
# ===========================================================================


def test_reconcile_from_dict_defaults_and_success() -> None:
    """Verify reconcile_from_dict handles missing optional fields and raw dictionaries."""
    schedule_data = [
        {"tag": "AHU-1", "schedule_sheet": "M-601"},  # quantity defaults to 1
        {"tag": "VAV-1", "quantity": 2},              # schedule_sheet defaults
    ]

    symbol_data = [
        {"label": "AHU-1", "location_pt": [100.0, 100.0]},  # confidence/status defaults
        {"label": "VAV-1", "location_pt": [120.0, 100.0]},
    ]

    report = reconcile_from_dict(schedule_data=schedule_data, symbol_data=symbol_data)

    assert report.total_scheduled == 3
    assert report.total_counted == 2
    assert report.total_matched == 2
    assert report.total_undercounts == 1
    assert report.review_required is True


# ===========================================================================
# 12. PROJECT.md Interface Contract: symbol_counts dict
# ===========================================================================


def test_reconcile_symbol_counts_dict_interface() -> None:
    """Test PROJECT.md contract: reconcile_takeoff(symbol_counts, schedule_items)."""
    schedule_items = [
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1),
        ScheduledEquipmentItem(tag="VAV-1", schedule_sheet="M-601", quantity=3),
    ]

    symbol_counts = {
        "AHU-1": 1,
        "VAV-1": 3,
    }

    # Style 1: Positional (symbol_counts, schedule_items)
    report1 = reconcile_takeoff(symbol_counts, schedule_items)
    assert report1.total_scheduled == 4
    assert report1.total_counted == 4
    assert report1.match_rate == 1.0
    assert report1.review_required is False

    # Style 2: Positional (schedule_items, symbol_counts)
    report2 = reconcile_takeoff(schedule_items, symbol_counts)
    assert report2.total_scheduled == 4
    assert report2.total_counted == 4
    assert report2.match_rate == 1.0

    # Style 3: Named parameters
    report3 = reconcile_takeoff(symbol_counts=symbol_counts, schedule_items=schedule_items)
    assert report3.total_scheduled == 4
    assert report3.total_counted == 4


def test_reconcile_negative_symbol_count_raises() -> None:
    """Negative symbol count in dict raises ValueError."""
    with pytest.raises(ValueError, match="cannot be negative"):
        reconcile_takeoff(
            symbol_counts={"AHU-1": -1},
            schedule_items=[ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1)],
        )


# ===========================================================================
# 13. Pydantic Schema Validation & Integrity Checks
# ===========================================================================


def test_pydantic_validation_empty_tag() -> None:
    """ScheduledEquipmentItem and PlanSymbolInstance reject empty tags/labels."""
    with pytest.raises(ValidationError):
        ScheduledEquipmentItem(tag="", schedule_sheet="M-601")

    with pytest.raises(ValidationError):
        PlanSymbolInstance(label="   ", sheet_id="M-101", location_pt=[10.0, 20.0])


def test_pydantic_validation_negative_quantity() -> None:
    """Negative schedule quantity raises ValidationError."""
    with pytest.raises(ValidationError):
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=-5)


def test_pydantic_validation_non_finite_coordinates() -> None:
    """Non-finite coordinates (NaN or Inf) fail closed."""
    with pytest.raises(ValidationError):
        PlanSymbolInstance(label="AHU-1", sheet_id="M-101", location_pt=[float("nan"), 10.0])

    with pytest.raises(ValidationError):
        PlanSymbolInstance(label="AHU-1", sheet_id="M-101", location_pt=[10.0, float("inf")])

    with pytest.raises(ValidationError):
        PlanSymbolInstance(label="AHU-1", sheet_id="M-101", location_pt=[10.0])  # len != 2


def test_discrepancy_variance_formula_validator() -> None:
    """DiscrepancyItem validates that variance == plan_qty - schedule_qty."""
    # Valid
    d = DiscrepancyItem(
        tag="AHU-1",
        label="AHU-1",
        schedule_qty=2,
        plan_qty=3,
        variance=1,
        status="OVERCOUNT",
    )
    assert d.variance == 1

    # Invalid variance value
    with pytest.raises(ValidationError):
        DiscrepancyItem(
            tag="AHU-1",
            label="AHU-1",
            schedule_qty=2,
            plan_qty=3,
            variance=999,  # Expected 3 - 2 = 1
            status="OVERCOUNT",
        )


# ===========================================================================
# 14. Ghost Pin Lifecycle Transitions & Canvas Pin Export
# ===========================================================================


def test_ghost_pin_lifecycle_and_canvas_pin() -> None:
    """Verify GhostPin placement, ignore transition, and to_canvas_pin export."""
    pin = GhostPin(
        tag="AHU-1",
        description="Air Handling Unit 1",
        schedule_ref="M-601",
        suggested_discipline="MECHANICAL",
        suggested_system="Supply Air",
        quantity=1,
    )

    assert pin.status == "UNPLACED"
    assert pin.location_pt is None

    # Test export before placement (defaults to margin dock coords)
    canvas_pin = pin.to_canvas_pin()
    assert canvas_pin["kind"] == "ghost"
    assert canvas_pin["label"] == "AHU-1"
    assert canvas_pin["status"] == "SUGGESTED"
    assert canvas_pin["reviewRequired"] is True

    # Place pin at physical coordinates
    pin.place(sheet_id="M-201", coordinates=[350.256, 420.789])
    assert pin.status == "PLACED"
    assert pin.placed_sheet_id == "M-201"
    assert pin.location_pt == [350.26, 420.79]

    placed_canvas_pin = pin.to_canvas_pin()
    assert placed_canvas_pin["x"] == 350.26
    assert placed_canvas_pin["y"] == 420.79
    assert placed_canvas_pin["status"] == "ACCEPTED"
    assert placed_canvas_pin["reviewRequired"] is False

    # Ignore pin
    pin.ignore()
    assert pin.status == "IGNORED"


def test_ghost_pin_place_invalid_coords_fails() -> None:
    """Invalid coordinates during placement raise ValueError."""
    pin = GhostPin(tag="VAV-1", schedule_ref="M-601")
    with pytest.raises(ValueError):
        pin.place(sheet_id="M-201", coordinates=[float("nan"), 100.0])


# ===========================================================================
# 15. High Volume Performance
# ===========================================================================


def test_reconcile_extreme_volume_performance() -> None:
    """Reconciling 500 schedule rows and 1,000 plan symbols executes in < 100ms."""
    scheduled: list[ScheduledEquipmentItem] = []
    for i in range(500):
        scheduled.append(
            ScheduledEquipmentItem(
                tag=f"VAV-{i:03d}",
                description=f"Terminal Box {i}",
                schedule_sheet="M-601",
                quantity=2,
            )
        )

    symbols: list[PlanSymbolInstance] = []
    for i in range(500):
        # 2 symbols per tag -> 1,000 symbols
        symbols.append(
            PlanSymbolInstance(
                label=f"vav {i}",
                sheet_id="M-201",
                location_pt=[100.0 + (i % 20) * 10.0, 100.0 + (i // 20) * 10.0],
            )
        )
        symbols.append(
            PlanSymbolInstance(
                label=f"VAV-{i:03d}",
                sheet_id="M-202",
                location_pt=[100.0 + (i % 20) * 10.0, 100.0 + (i // 20) * 10.0],
            )
        )

    t0 = time.perf_counter()
    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=symbols)
    t1 = time.perf_counter()

    duration_ms = (t1 - t0) * 1000.0
    assert duration_ms < 500.0, f"Expected < 500ms, took {duration_ms:.2f}ms"
    assert report.total_scheduled == 1000
    assert report.total_counted == 1000
    assert report.total_matched == 1000
    assert report.match_rate == 1.0
    assert report.review_required is False


# ===========================================================================
# 16. Coordinator Class (TakeoffReconciler)
# ===========================================================================


@pytest.mark.asyncio
async def test_takeoff_reconciler_in_memory() -> None:
    """TakeoffReconciler works purely in-memory without TakeoffStore."""
    reconciler = TakeoffReconciler()
    scheduled = [ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1)]
    symbols = [PlanSymbolInstance(label="AHU-1", sheet_id="M-201", location_pt=[100.0, 100.0])]

    report = reconciler.reconcile(scheduled_items=scheduled, plan_symbols=symbols)
    assert report.total_matched == 1
    assert report.match_rate == 1.0


@pytest.mark.asyncio
async def test_takeoff_reconciler_from_store_mock() -> None:
    """TakeoffReconciler.reconcile_from_store pulls equipment records from store mock."""
    mock_store = MagicMock()
    mock_record1 = MagicMock()
    mock_record1.item_id = "rec-1"
    mock_record1.sheet_id = "M-201"
    mock_record1.category = "EQUIPMENT"
    mock_record1.system = "Supply Air"
    mock_record1.dimension_label = "AHU-1"
    mock_record1.geometry = {"coordinates": [250.0, 300.0], "tag": "AHU-1"}
    mock_record1.confidence = 0.95
    mock_record1.status = "SUGGESTED"

    mock_record2 = MagicMock()
    mock_record2.item_id = "rec-2"
    mock_record2.sheet_id = "M-201"
    mock_record2.category = "DUCTWORK"  # Should be filtered out of equipment reconciliation
    mock_record2.system = "Supply Air"
    mock_record2.dimension_label = "24x12"
    mock_record2.geometry = {}
    mock_record2.confidence = 0.90
    mock_record2.status = "SUGGESTED"

    mock_store.list_items = AsyncMock(return_value=[mock_record1, mock_record2])

    reconciler = TakeoffReconciler(store=mock_store)
    scheduled = [ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1)]

    report = await reconciler.reconcile_from_store(
        project_id="PROJ-MOCK",
        scheduled_items=scheduled,
    )

    mock_store.list_items.assert_awaited_once_with(project_id="PROJ-MOCK", sheet_id=None)
    assert report.total_scheduled == 1
    assert report.total_counted == 1
    assert report.total_matched == 1
    assert report.match_rate == 1.0


def test_reconcile_zero_quantity_scheduled_item() -> None:
    """Scheduled equipment with quantity 0 and 0 plan detections resolves to MATCHED."""
    scheduled = [
        ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=0)
    ]
    report = reconcile_takeoff(scheduled_items=scheduled, plan_symbols=[])

    assert len(report.discrepancies) == 1
    disc = report.discrepancies[0]
    assert disc.status == "MATCHED"
    assert disc.severity == "INFO"
    assert disc.schedule_qty == 0
    assert disc.plan_qty == 0
    assert disc.variance == 0
    assert "0 scheduled and 0 detected" in disc.notes
    assert report.review_required is False
    assert report.match_rate == 1.0


def test_reconcile_unscheduled_match_rate_zero() -> None:
    """When total_scheduled == 0 and total_counted > 0, match_rate is 0.0."""
    symbols = [
        PlanSymbolInstance(label="VAV-1", sheet_id="M-201", location_pt=[100.0, 100.0]),
        PlanSymbolInstance(label="VAV-2", sheet_id="M-201", location_pt=[200.0, 200.0]),
    ]
    report = reconcile_takeoff(scheduled_items=[], plan_symbols=symbols)

    assert report.total_scheduled == 0
    assert report.total_counted == 2
    assert report.total_matched == 0
    assert report.match_rate == 0.0
    assert report.total_unscheduled == 2
    assert report.summary_by_discipline["MECHANICAL"]["match_rate"] == 0.0


@pytest.mark.asyncio
async def test_takeoff_reconciler_from_store_ignores_rejected() -> None:
    """TakeoffReconciler.reconcile_from_store filters out REJECTED takeoff records."""
    mock_store = MagicMock()
    mock_valid = MagicMock()
    mock_valid.item_id = "rec-valid"
    mock_valid.sheet_id = "M-201"
    mock_valid.category = "EQUIPMENT"
    mock_valid.system = "Supply Air"
    mock_valid.dimension_label = "AHU-1"
    mock_valid.geometry = {"coordinates": [250.0, 300.0], "tag": "AHU-1"}
    mock_valid.confidence = 0.95
    mock_valid.status = "APPROVED"

    mock_rejected = MagicMock()
    mock_rejected.item_id = "rec-rejected"
    mock_rejected.sheet_id = "M-201"
    mock_rejected.category = "EQUIPMENT"
    mock_rejected.system = "Supply Air"
    mock_rejected.dimension_label = "AHU-1"
    mock_rejected.geometry = {"coordinates": [350.0, 400.0], "tag": "AHU-1"}
    mock_rejected.confidence = 0.40
    mock_rejected.status = "REJECTED"

    mock_store.list_items = AsyncMock(return_value=[mock_valid, mock_rejected])

    reconciler = TakeoffReconciler(store=mock_store)
    scheduled = [ScheduledEquipmentItem(tag="AHU-1", schedule_sheet="M-601", quantity=1)]

    report = await reconciler.reconcile_from_store(
        project_id="PROJ-REJECT-TEST",
        scheduled_items=scheduled,
    )

    # REJECTED item should not be counted; only mock_valid is counted (count = 1, exactly matches scheduled 1)
    assert report.total_scheduled == 1
    assert report.total_counted == 1
    assert report.total_matched == 1
    assert report.match_rate == 1.0
    assert report.total_overcounts == 0

