"""Empirical Challenger Stress Harness for Milestone 1 (M1).

Adversarial stress-testing across:
1. ToolRegistry: SQL mutation injection vectors, semicolon evasion, comment hiding, PRAGMA/subquery injection.
2. ReconAgent: Malformed, zero, negative, conflicting scale strings, NTS variations, and VLM self-certification attacks.
3. OrchestratorAgent: Geometry edge cases, corrupt coordinates, missing geometry, fail-closed scale locking, and status coercion.
4. Architecture: Module import isolation and circular dependency verification.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from src.agents import (
    OrchestratorAgent,
    ReconAgent,
    ScaleCandidate,
    ScaleStatus,
    SheetType,
    ToolRegistry,
)
from src.agents.tools import bbox_from_geometry
from src.core_vector.scale_validator import ScaleValidator
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


async def _create_test_store(tmp_path: Path) -> TakeoffStore:
    store = TakeoffStore(db_path=tmp_path / "test_stress_m1.sqlite3")
    await store.initialize()
    return store


# ===========================================================================
# 1. SQL MUTATION INJECTION & READ-ONLY SAFETY HARNESS
# ===========================================================================
class TestSQLMutationStressHarness:
    """Stress-tests ToolRegistry.is_safe_read_query and execute_takeoff_query."""

    @pytest.fixture
    async def tool_reg(self, tmp_path: Path) -> ToolRegistry:
        store = await _create_test_store(tmp_path)
        await store.add_takeoff_item(
            TakeoffRecord(
                item_id="seed-1",
                project_id="proj_sec",
                sheet_id="sheet_sec",
                category="DUCTWORK",
                system="Supply",
                dimension_label="12x10",
                status="ACCEPTED",
                source="VECTOR_ENGINE",
                total_length_ft=10.0,
                count=1,
                geometry={"type": "point", "coordinates": [10.0, 10.0]},
                confidence=1.0,
                review_required=False,
            )
        )
        return ToolRegistry(store=store)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "malicious_sql",
        [
            # Semicolon statement stacking
            "SELECT * FROM takeoff_items; DROP TABLE takeoff_items;",
            "SELECT * FROM takeoff_items; DELETE FROM takeoff_items WHERE 1=1;",
            "SELECT * FROM takeoff_items; UPDATE takeoff_items SET status='ACCEPTED';",
            "SELECT * FROM takeoff_items;\nDROP TABLE takeoff_items;",
            "SELECT * FROM takeoff_items;\r\nDELETE FROM takeoff_items;",
            "SELECT * FROM takeoff_items;--\nDROP TABLE takeoff_items;",
            "SELECT * FROM takeoff_items;/*comment*/DROP TABLE takeoff_items;",
            "SELECT 1; ; SELECT 2;",
            "SELECT 1;\n;",
            # Direct DDL & DML mutations
            "INSERT INTO takeoff_items (item_id) VALUES ('evil')",
            "UPDATE takeoff_items SET count=999",
            "DELETE FROM takeoff_items",
            "DROP TABLE takeoff_items",
            "ALTER TABLE takeoff_items ADD COLUMN evil text",
            "CREATE TABLE evil_table (id int)",
            "REPLACE INTO takeoff_items (item_id) VALUES ('evil')",
            "TRUNCATE TABLE takeoff_items",
            "ATTACH DATABASE 'evil.db' AS evil",
            "DETACH DATABASE evil",
            "PRAGMA table_info(takeoff_items)",
            "EXEC sp_executesql N'SELECT 1'",
            "GRANT ALL ON takeoff_items TO public",
            "REVOKE ALL ON takeoff_items FROM public",
            # Case sensitivity and mixed casing evasion
            "dRoP tAbLe takeoff_items",
            "uPdAtE takeoff_items SET status='SUGGESTED'",
            "DeLeTe FrOm takeoff_items",
            "iNsErT InTo takeoff_items VALUES ('x')",
            "sElEcT 1; dRoP tAbLe takeoff_items",
            # Subqueries attempting mutations
            "SELECT (UPDATE takeoff_items SET status='ACCEPTED')",
            "SELECT * FROM takeoff_items WHERE id IN (DELETE FROM takeoff_items)",
            "SELECT * FROM (INSERT INTO takeoff_items VALUES ('x'))",
            # CTE evasion (must start strictly with SELECT)
            "WITH cte AS (SELECT 1) SELECT * FROM cte",
            "WITH evil AS (DELETE FROM takeoff_items) SELECT 1",
            # Comments prefix evasion
            "-- comment\nSELECT * FROM takeoff_items",
            "/* comment */ SELECT * FROM takeoff_items",
            # Comment containing forbidden keywords (fail-closed test)
            "SELECT * FROM takeoff_items -- DROP TABLE takeoff_items",
            "SELECT * FROM takeoff_items /* DELETE FROM takeoff_items */",
        ],
    )
    async def test_all_sql_mutations_and_evasions_rejected(
        self, tool_reg: ToolRegistry, malicious_sql: str
    ) -> None:
        """Every single mutation or evasion pattern MUST be rejected."""
        # 1. is_safe_read_query must return False
        assert tool_reg.is_safe_read_query(malicious_sql) is False

        # 2. execute_takeoff_query must reject the query and NOT mutate the database
        res = await tool_reg.execute_takeoff_query(project_id="proj_sec", raw_sql=malicious_sql)
        assert res["success"] is False
        assert "rejected by security governance" in res["error"]

        # 3. Verify seed item survived intact
        items = await tool_reg.store.list_items(sheet_id="sheet_sec")
        assert len(items) == 1
        assert items[0].item_id == "seed-1"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "malicious_param",
        [
            "proj_sec' OR '1'='1",
            "proj_sec'; DROP TABLE takeoff_items; --",
            "proj_sec' UNION SELECT 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 --",
            "'; DELETE FROM takeoff_items; --",
        ],
    )
    async def test_sql_parameter_injection_safely_parameterized(
        self, tool_reg: ToolRegistry, malicious_param: str
    ) -> None:
        """Parameters passed via project_id/system/category must not cause injection."""
        res = await tool_reg.execute_takeoff_query(
            project_id=malicious_param,
            system=malicious_param,
            category=malicious_param,
        )
        assert res["success"] is True
        assert res["summary"]["total_count"] == 0

        # Seed item must still exist
        items = await tool_reg.store.list_items(sheet_id="sheet_sec")
        assert len(items) == 1

    @pytest.mark.asyncio
    async def test_tool_registry_empty_raw_sql_fallback(self, tool_reg: ToolRegistry) -> None:
        """Empirically document that empty raw_sql falls back to default parameterized query."""
        assert tool_reg.is_safe_read_query("") is False
        assert tool_reg.is_safe_read_query("   ") is False

        # Empty string evaluates falsy in `if raw_sql:`, falling through to default aggregation
        res = await tool_reg.execute_takeoff_query(project_id="proj_sec", raw_sql="")
        assert res["success"] is True
        assert res["summary"]["total_count"] == 1

    def test_pragma_table_valued_functions_bypass_word_boundary(self, tool_reg: ToolRegistry) -> None:
        """Empirical test documenting that pragma_table_info passes word boundary \\bPRAGMA\\b."""
        # Due to \bPRAGMA\b, underscore in pragma_table_info prevents matching
        is_safe = tool_reg.is_safe_read_query("SELECT * FROM pragma_table_info('takeoff_items')")
        assert is_safe is True, "Table function pragma_table_info passes regex because underscore is \\w"

    @pytest.mark.asyncio
    async def test_tool_registry_execute_malformed_types_no_unhandled_crash(
        self, tool_reg: ToolRegistry
    ) -> None:
        """Passing wrong types (e.g. int for raw_sql) must fail gracefully, zero unhandled crash."""
        res = await tool_reg.execute(
            "execute_takeoff_query",
            {"project_id": "proj_sec", "raw_sql": 12345},
        )
        assert res["success"] is False
        assert "error" in res

    def test_safe_select_queries_allowed(self, tool_reg: ToolRegistry) -> None:
        """Legitimate SELECT queries should be accepted."""
        assert tool_reg.is_safe_read_query("SELECT count(*) FROM takeoff_items") is True
        assert tool_reg.is_safe_read_query("SELECT * FROM takeoff_items WHERE count > 0") is True
        assert tool_reg.is_safe_read_query("SELECT * FROM takeoff_items;") is True  # Trailing semicolon allowed
        assert tool_reg.is_safe_read_query("SELECT a.item_id FROM (SELECT item_id FROM takeoff_items) a") is True


# ===========================================================================
# 2. MALFORMED SCALE STRINGS & ADJUDICATION STRESS HARNESS
# ===========================================================================
class TestScaleMalformedStressHarness:
    """Stress-tests ReconAgent.evaluate_scales and ScaleValidator.parse_scale_string."""

    @pytest.mark.parametrize(
        "malformed_scale",
        [
            "",
            "   ",
            "0",
            "0.0",
            "0'-0\" = 0'-0\"",
            "0\" = 1'-0\"",
            "1/4\" = 0'-0\"",
            "1/4\" = -1'-0\"",
            "1:-50",
            "SCALE: AS NOTED",
            "SCALE: NONE",
            "N.T.S.",
            "NTS",
            "NOT TO SCALE",
            "!@#$%^&*()_+",
            "SCALE: 1/4\" PER FOOT APPROX",
            "NaN",
            "inf",
            "-inf",
            "1/4\" = 1'-0\" OR 1/8\" = 1'-0\"",  # Conflicting in same string
            "1:0",
            "0:1",
            "A" * 500,
        ],
    )
    def test_scale_validator_parse_malformed_returns_unverified(self, malformed_scale: str) -> None:
        """ScaleValidator must return UNVERIFIED and None ratio for all malformed inputs."""
        ratio, status = ScaleValidator.parse_scale_string(malformed_scale)
        assert status == "UNVERIFIED"
        assert ratio is None

    def test_negative_scale_regex_leakage_empirical(self) -> None:
        """Empirical finding: Leading minus sign is matched by SCALE_PATTERNS due to missing lookbehind.
        
        Only 1/2\" has (?<![-/0-9]). Other patterns like 1/4\" and 1:50 lack negative lookbehind for '-',
        causing '-1/4\" = 1\'-0\"' to parse as VERIFIED with ratio 48.0.
        """
        # 1/2" has lookbehind, so negative is blocked:
        _ratio_half, status_half = ScaleValidator.parse_scale_string('-1/2" = 1\'-0"')
        assert status_half == "UNVERIFIED"

        # 1/4" lacks lookbehind, demonstrating the regex leakage:
        ratio_quarter, status_quarter = ScaleValidator.parse_scale_string('-1/4" = 1\'-0"')
        assert status_quarter == "VERIFIED"
        assert ratio_quarter == 48.0

    @pytest.mark.parametrize(
        "length_pt, ratio, expected_valid",
        [
            (100.0, None, False),
            (100.0, 0.0, False),
            (100.0, -48.0, False),
            (0.0, 48.0, True),
            (-50.0, 48.0, True),  # points_to_feet does not reject negative length_pt
        ],
    )
    def test_scale_validator_points_to_feet_boundary_empirical(
        self, length_pt: float, ratio: float | None, expected_valid: bool
    ) -> None:
        """Empirically assert points_to_feet behavior on boundaries."""
        _feet, valid = ScaleValidator.points_to_feet(length_pt, ratio)
        assert valid is expected_valid

    def test_recon_agent_evaluate_scales_all_failure_modes(self) -> None:
        """Test matrix of failure modes in ReconAgent.evaluate_scales."""
        # 1. NTS flag active
        cand = ScaleCandidate(
            raw_string='1/4"=1\'-0"', scale_ratio=48.0, source="native_titleblock", evidence_id="ev1", is_valid=True
        )
        stat, ratio, raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand], None, is_nts=True, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert is_meas is False
        assert rev_req is True
        assert raw == "NOT TO SCALE"

        # 2. Conflicting native scales
        cand2 = ScaleCandidate(
            raw_string='1/8"=1\'-0"', scale_ratio=96.0, source="native_titleblock", evidence_id="ev2", is_valid=True
        )
        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand, cand2], None, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert is_meas is False
        assert rev_req is True

        # 3. Discrepant Native vs VLM (>1% tolerance)
        cand_vlm = ScaleCandidate(
            raw_string='1/8"=1\'-0"', scale_ratio=96.0, source="vlm_crop", evidence_id="ev3", is_valid=True
        )
        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert is_meas is False
        assert rev_req is True

        # 4. VLM trying to self-certify without native verification
        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert is_meas is False
        assert rev_req is True

        # 5. Non-plan sheet (e.g. SCHEDULE, DETAIL, RISER) with valid scale
        # Even with verified scale, is_measurable MUST be False and review_required True
        for non_plan in [SheetType.SCHEDULE, SheetType.DETAIL, SheetType.RISER, SheetType.LEGEND, SheetType.OTHER]:
            stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
                [cand], None, is_nts=False, sheet_type=non_plan
            )
            assert stat == ScaleStatus.VERIFIED
            assert ratio == 48.0
            assert is_meas is False, f"SheetType {non_plan} must not be measurable"
            assert rev_req is True, f"SheetType {non_plan} must require review"

        # 6. Completely empty candidates
        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [], None, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert is_meas is False
        assert rev_req is True


# ===========================================================================
# 3. GEOMETRY EDGE CASES & ORCHESTRATOR EVIDENCE GATE STRESS HARNESS
# ===========================================================================
class TestGeometryAndOrchestratorStressHarness:
    """Stress-tests OrchestratorAgent.enforce_fail_closed_gates and geometry parsing."""

    @pytest.fixture
    def orch(self) -> OrchestratorAgent:
        return OrchestratorAgent()

    @pytest.fixture
    def verified_sheet(self) -> SheetMetadata:
        return SheetMetadata(
            sheet_id="sheet_m101",
            page_index=0,
            sheet_number="M-101",
            sheet_title="First Floor Ductwork Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=2000.0,
            height_pt=1400.0,
        )

    @pytest.fixture
    def unverified_sheet(self) -> SheetMetadata:
        return SheetMetadata(
            sheet_id="sheet_m102",
            page_index=1,
            sheet_number="M-102",
            sheet_title="Second Floor Ductwork Plan",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            scale_ratio=0.0,
            width_pt=2000.0,
            height_pt=1400.0,
        )

    @pytest.mark.parametrize("missing_geom", [{}, []])
    def test_missing_geometry_completely_rejected_by_evidence_gate(
        self, orch: OrchestratorAgent, verified_sheet: SheetMetadata, missing_geom: Any
    ) -> None:
        """Any item with empty dict/list geometry is filtered out and flagged as CRITICAL."""
        item = TakeoffRecord(
            item_id="ghost-item",
            project_id="p1",
            sheet_id="sheet_m101",
            category="EQUIPMENT",
            system="Exhaust",
            dimension_label="EF-1",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry=missing_geom,
            confidence=0.9,
            review_required=False,
        )

        sanitized, flags = orch.enforce_fail_closed_gates(verified_sheet, [item])
        assert len(sanitized) == 0, f"Item with geometry {missing_geom!r} must be rejected"
        assert len(flags) == 1
        assert flags[0]["type"] == "MISSING_EVIDENCE_GEOMETRY"
        assert flags[0]["severity"] == "CRITICAL"

    @pytest.mark.parametrize("invalid_geom", [None, "", 0, False, "invalid_str"])
    def test_pydantic_schema_validation_blocks_non_dict_geometry(
        self, invalid_geom: Any
    ) -> None:
        """Pydantic rejects non-dict/non-list geometry during TakeoffRecord construction."""
        with pytest.raises(ValidationError):
            TakeoffRecord(
                item_id="invalid-geom-item",
                project_id="p1",
                sheet_id="s1",
                category="EQUIPMENT",
                system="Supply",
                dimension_label="D",
                status="SUGGESTED",
                source="VLM_DETECTION",
                total_length_ft=0.0,
                count=1,
                geometry=invalid_geom,
            )

    def test_empty_coordinates_in_geometry_dict_empirical(
        self, orch: OrchestratorAgent, verified_sheet: SheetMetadata
    ) -> None:
        """Empirical finding: Orchestrator evidence gate checks len(geometry) > 0.
        
        A non-empty dict with empty coordinates (e.g. {'type': 'point', 'coordinates': []})
        passes Gate 2, but downstream bbox_from_geometry returns None.
        """
        item = TakeoffRecord(
            item_id="item-empty-coords",
            project_id="p1",
            sheet_id="sheet_m101",
            category="EQUIPMENT",
            system="Exhaust",
            dimension_label="EF-1",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": []},
            confidence=0.9,
            review_required=False,
        )
        sanitized, _flags = orch.enforce_fail_closed_gates(verified_sheet, [item])
        # Container check len(geometry) == 2 > 0 passes
        assert len(sanitized) == 1
        # Downstream extractor correctly identifies absence of coordinates
        assert bbox_from_geometry(sanitized[0].geometry) is None

    @pytest.mark.parametrize(
        "corrupt_geom",
        [
            {"type": "point", "coordinates": []},
            {"type": "point", "coordinates": [None, None]},
            {"type": "point", "coordinates": ["bad", "coords"]},
            {"type": "point", "coordinates": [float("nan"), float("inf")]},
            {"type": "polyline", "points": []},
            {"type": "polyline", "points": [["invalid"]]},
            {"bbox": [10.0, 20.0]},  # only 2 points instead of 4
            {"bbox": ["a", "b", "c", "d"]},
            {"bbox": [float("nan"), 0.0, 10.0, 20.0]},
            {"unknown_key": "junk_data"},
            {"points": []},
        ],
    )
    def test_corrupt_geometry_coordinates_bbox_extraction_fail_closed(
        self, corrupt_geom: Any
    ) -> None:
        """Corrupt or non-finite geometry structures must return None from bbox_from_geometry."""
        bbox = bbox_from_geometry(corrupt_geom)
        assert bbox is None, f"Corrupt geometry {corrupt_geom!r} must resolve to None, got {bbox}"

    def test_fail_closed_scale_gate_locks_ductwork_and_piping(
        self, orch: OrchestratorAgent, unverified_sheet: SheetMetadata
    ) -> None:
        """When sheet scale is UNVERIFIED, linear footages must be locked to 0.0 and review_required=True."""
        duct_item = TakeoffRecord(
            item_id="duct-1",
            project_id="p1",
            sheet_id="sheet_m102",
            category="DUCTWORK",
            system="SupplyAir",
            dimension_label='12x10" Supply',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=55.5,
            count=1,
            geometry={"type": "polyline", "points": [[100, 100], [200, 100]]},
            confidence=1.0,
            review_required=False,
        )
        pipe_item = TakeoffRecord(
            item_id="pipe-1",
            project_id="p1",
            sheet_id="sheet_m102",
            category="PIPING",
            system="Hydronic",
            dimension_label='2" Chilled Water',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=33.3,
            count=1,
            geometry={"type": "polyline", "points": [[100, 200], [200, 200]]},
            confidence=1.0,
            review_required=False,
        )
        equip_item = TakeoffRecord(
            item_id="equip-1",
            project_id="p1",
            sheet_id="sheet_m102",
            category="EQUIPMENT",
            system="Exhaust",
            dimension_label="Exhaust Fan EF-2",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [300, 300]},
            confidence=0.9,
            review_required=False,
        )

        sanitized, flags = orch.enforce_fail_closed_gates(unverified_sheet, [duct_item, pipe_item, equip_item])
        assert len(sanitized) == 3

        # Ductwork locked
        assert sanitized[0].total_length_ft == 0.0
        assert sanitized[0].review_required is True

        # Piping locked
        assert sanitized[1].total_length_ft == 0.0
        assert sanitized[1].review_required is True

        # Equipment not modified in footage but preserved
        assert sanitized[2].total_length_ft == 0.0

        # Check flags generated for scale unverified
        scale_flags = [f for f in flags if f["type"] == "SCALE_UNVERIFIED_LINEAR_LOCKED"]
        assert len(scale_flags) == 1
        assert scale_flags[0]["item_count"] == 2
        assert scale_flags[0]["item_ids"] == ["duct-1", "pipe-1"]

    def test_status_gate_coerces_accepted_to_suggested(
        self, orch: OrchestratorAgent, verified_sheet: SheetMetadata
    ) -> None:
        """Automated model attempting to write ACCEPTED must be demoted to SUGGESTED."""
        ai_item = TakeoffRecord(
            item_id="item-vlm",
            project_id="p1",
            sheet_id="sheet_m101",
            category="EQUIPMENT",
            system="SupplyAir",
            dimension_label="VAV-01",
            status="ACCEPTED",  # AI tries to approve
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [400, 400]},
            confidence=0.98,
            review_required=False,
        )

        sanitized, _ = orch.enforce_fail_closed_gates(verified_sheet, [ai_item])
        assert len(sanitized) == 1
        assert sanitized[0].status == "SUGGESTED"


# ===========================================================================
# 4. ARCHITECTURAL ISOLATION & CIRCULAR DEPENDENCY HARNESS
# ===========================================================================
class TestArchitecturalIsolationHarness:
    """Empirical check for circular dependency between src.agents and src.meta_services."""

    def test_direct_import_src_agents_circular_dependency(self) -> None:
        """Empirically verify that direct import of src.agents in fresh process succeeds cleanly."""
        code = "import sys; sys.path.insert(0, '.'); import src.agents"
        proc = subprocess.run(
            [sys.executable, "-c", code],
            check=False,
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0, f"Direct import of src.agents failed: {proc.stderr}"
        assert "ImportError" not in proc.stderr
