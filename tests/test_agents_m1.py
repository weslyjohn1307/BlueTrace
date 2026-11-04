"""Comprehensive Milestone 1 Test Suite for BlueTrace-AI Multi-Agent Architecture.

Covers:
- Base contracts, EvidenceIDGenerator syntax, and AgentRegistry.
- Product Agent 00 (Orchestrator): deterministic job routing, fail-closed gates, and SSE streaming.
- Product Agent 01 (Recon): sheet classification, native vs VLM scale adjudication, and metadata export.
- ToolRegistry (TASK-COP-001): read-only SQL security (blocks mutations), HITL SUGGESTED-only writes.
- Product Agent 06 (Copilot-Judge & TASK-COP-002..004): multi-turn tool calling, citation validation,
  missing data disclosure enforcement, and 4-way conflict adjudication.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pymupdf
import pytest

from src.agents import (
    AgentContext,
    AgentEventType,
    AgentID,
    AgentRegistry,
    ConflictRecord,
    ConflictRulingType,
    CopilotJudgeAgent,
    EvidenceIDGenerator,
    OrchestratorAgent,
    ReconAgent,
    ScaleCandidate,
    ScaleStatus,
    SheetReconResult,
    SheetType,
    ToolRegistry,
)
from src.agents.base import BaseAgent
from src.models.schemas import CopilotQueryRequest, SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


# ---------------------------------------------------------------------------
# Test Helpers & Stubs
# ---------------------------------------------------------------------------
class MockFailingAgent(BaseAgent):
    agent_id = "agent_mock_fail"
    agent_name = "Mock Failing Agent"

    async def run(self, context: AgentContext, **kwargs: Any) -> Any:
        raise RuntimeError("Simulated failure in mock agent")


class StubWonderToolClient:
    """Mock client returning scripted tool calls or text."""

    def __init__(self, turns: list[dict[str, Any]] | None = None) -> None:
        self.turns = turns or []
        self.call_count = 0
        self.history: list[dict[str, Any]] = []

    def is_configured(self) -> bool:
        return True

    def chat_completion_with_tools(
        self,
        model: str = "muse-wonder-1.0",
        messages: list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.1,
    ) -> dict[str, Any]:
        self.history.append({"messages": messages, "tools": tools})
        if self.call_count < len(self.turns):
            resp = self.turns[self.call_count]
            self.call_count += 1
            return resp
        return {"content": "Final answer with no further tool calls.", "tool_calls": [], "mock": False}


async def _create_test_store(tmp_path: Path) -> TakeoffStore:
    store = TakeoffStore(db_path=tmp_path / "test_agents_m1.sqlite3")
    await store.initialize()
    return store


# ---------------------------------------------------------------------------
# 1. Base Contracts & Evidence ID Authority Tests
# ---------------------------------------------------------------------------
class TestBaseContracts:
    def test_evidence_id_generator_minting_and_registry(self) -> None:
        ev_gen = EvidenceIDGenerator(project_id="proj_alpha")

        # Test sheet root evidence
        ev_sheet = ev_gen.mint_sheet_evidence("m_101")
        assert ev_sheet == "ev_sheet_m_101_root"
        assert ev_gen.is_valid_syntax(ev_sheet)
        assert ev_gen.has_evidence(ev_sheet)

        # Test title block evidence
        ev_tb = ev_gen.mint_title_block_evidence("m_101")
        assert ev_tb == "ev_tb_m_101_crop"
        assert ev_gen.is_valid_syntax(ev_tb)

        # Test scale candidate evidence
        ev_scale = ev_gen.mint_scale_evidence("m_101", candidate_index=1)
        assert ev_scale == "ev_scale_m_101_cand1"

        # Test tile crop evidence
        ev_tile = ev_gen.mint_tile_evidence("m_101", row=2, col=3)
        assert ev_tile == "ev_tile_m_101_r2c3"

        # Test item candidate evidence
        ev_item = ev_gen.mint_item_evidence("m_101", category="EQUIPMENT", item_id="vav_01")
        assert ev_item == "ev_item_m_101_equi_vav_01"

        # Registry enumeration
        all_ids = ev_gen.list_evidence_ids()
        assert len(all_ids) == 5
        assert ev_sheet in all_ids
        assert not ev_gen.has_evidence("ev_fake_nonexistent")
        assert not ev_gen.is_valid_syntax("invalid-syntax-without-ev-prefix")

    @pytest.mark.asyncio
    async def test_base_agent_execute_safe_catches_exceptions(self, tmp_path: Path) -> None:
        failing_agent = MockFailingAgent()
        context = AgentContext(
            project_id="p1",
            job_id="j1",
            pdf_path=tmp_path / "dummy.pdf",
        )
        res = await failing_agent.execute_safe(context)
        assert res.success is False
        assert res.review_required is True
        assert "Simulated failure" in (res.error or "")
        assert len(res.events) == 1
        assert res.events[0].event_type == AgentEventType.FAILED

    def test_agent_registry_lookup(self) -> None:
        registry = AgentRegistry()
        orchestrator = OrchestratorAgent()
        registry.register(orchestrator)

        assert registry.has(AgentID.AGENT_00_ORCHESTRATOR.value)
        assert not registry.has(AgentID.AGENT_02_FINDER.value)
        found = registry.get(AgentID.AGENT_00_ORCHESTRATOR.value)
        assert found is orchestrator
        assert AgentID.AGENT_00_ORCHESTRATOR.value in registry.list_agents()


# ---------------------------------------------------------------------------
# 2. Product Agent 00 (Orchestrator) Tests
# ---------------------------------------------------------------------------
class TestOrchestratorAgent:
    def test_deterministic_routing_table(self) -> None:
        orch = OrchestratorAgent()

        assert orch.route_sheet_type(SheetType.PLAN) == [
            AgentID.AGENT_02_FINDER.value,
            AgentID.AGENT_03_TRACER.value,
        ]
        assert orch.route_sheet_type(SheetType.SCHEDULE) == [
            AgentID.AGENT_04_RECONCILER.value,
        ]
        assert orch.route_sheet_type(SheetType.LEGEND) == [
            AgentID.AGENT_02_FINDER.value,
        ]
        assert orch.route_sheet_type(SheetType.DETAIL) == []
        assert orch.route_sheet_type(SheetType.RISER) == []
        assert orch.route_sheet_type(SheetType.OTHER) == []
        assert orch.route_sheet_type(SheetType.UNREADABLE) == []

    def test_fail_closed_scale_gate_locks_ductwork_footages(self) -> None:
        orch = OrchestratorAgent()
        sheet_unverified = SheetMetadata(
            sheet_id="s1",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            scale_ratio=None,
            width_pt=1000.0,
            height_pt=800.0,
        )

        duct_run = TakeoffRecord(
            item_id="run-1",
            project_id="p1",
            sheet_id="s1",
            category="DUCTWORK",
            system="SupplyAir",
            dimension_label='12x10" Supply',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=45.5,
            count=1,
            geometry={"type": "polyline", "points": [[100, 100], [200, 100]]},
            confidence=0.9,
            review_required=False,
        )

        sanitized, flags = orch.enforce_fail_closed_gates(sheet_unverified, [duct_run])
        assert len(sanitized) == 1
        assert sanitized[0].total_length_ft == 0.0  # LOCKED TO 0.0
        assert sanitized[0].review_required is True
        assert len(flags) == 1
        assert flags[0]["type"] == "SCALE_UNVERIFIED_LINEAR_LOCKED"

    def test_fail_closed_evidence_gate_rejects_missing_geometry(self) -> None:
        orch = OrchestratorAgent()
        sheet_verified = SheetMetadata(
            sheet_id="s1",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        hallucinated_item = TakeoffRecord(
            item_id="ghost-1",
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="Exhaust",
            dimension_label="Exhaust Fan EF-1",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={},  # EMPTY GEOMETRY
            confidence=0.95,
            review_required=False,
        )

        sanitized, flags = orch.enforce_fail_closed_gates(sheet_verified, [hallucinated_item])
        assert len(sanitized) == 0  # REJECTED
        assert len(flags) == 1
        assert flags[0]["type"] == "MISSING_EVIDENCE_GEOMETRY"

    def test_fail_closed_status_gate_coerces_accepted_to_suggested(self) -> None:
        orch = OrchestratorAgent()
        sheet_verified = SheetMetadata(
            sheet_id="s1",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        model_item = TakeoffRecord(
            item_id="item-auto-1",
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="SupplyAir",
            dimension_label="VAV-01",
            status="ACCEPTED",  # AI MODEL TRIED TO SELF-APPROVE
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [500, 400]},
            confidence=0.95,
            review_required=False,
        )

        sanitized, _ = orch.enforce_fail_closed_gates(sheet_verified, [model_item])
        assert len(sanitized) == 1
        assert sanitized[0].status == "SUGGESTED"  # DOWNGRADED TO SUGGESTED

    @pytest.mark.asyncio
    async def test_orchestrate_stream_end_to_end_on_real_pdf(self, tmp_path: Path) -> None:
        pdf_fixture = Path("fixtures/mechanical/hvac_plan_level2.pdf")
        assert pdf_fixture.is_file(), "Fixture hvac_plan_level2.pdf must exist"

        store = await _create_test_store(tmp_path)
        registry = AgentRegistry()
        recon = ReconAgent()
        registry.register(recon)

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_proj",
            job_id="job_001",
            pdf_path=pdf_fixture,
        )

        events = []
        async for ev in orch.orchestrate_stream(context):
            events.append(ev)

        assert len(events) >= 3
        assert events[0].event_type == AgentEventType.STARTED
        assert events[1].event_type == AgentEventType.SHEET_DISCOVERED
        assert events[-1].event_type == AgentEventType.COMPLETED

        doc_map_raw = events[-1].payload.get("document_map")
        assert doc_map_raw is not None
        assert doc_map_raw["total_pages"] == 1
        assert len(doc_map_raw["sheets"]) == 1
        assert len(doc_map_raw["routes"]) == 1

        # Check sheet in store
        sheet_meta = await store.get_sheet(doc_map_raw["sheets"][0]["sheet_id"])
        assert sheet_meta is not None
        assert sheet_meta["sheet_id"] == doc_map_raw["sheets"][0]["sheet_id"]


# ---------------------------------------------------------------------------
# 3. Product Agent 01 (Sheet Recon) Tests
# ---------------------------------------------------------------------------
class TestReconAgent:
    def test_sheet_type_classification_taxonomy(self) -> None:
        assert ReconAgent.classify_sheet_type("LEVEL 1 HVAC DUCTWORK PLAN", "M-101")[0] == SheetType.PLAN
        assert ReconAgent.classify_sheet_type("AIR TERMINAL DEVICE SCHEDULE", "M-601")[0] in (
            SheetType.SCHEDULE,
            SheetType.RISER,
        )
        assert ReconAgent.classify_sheet_type("AIR TERMINAL DEVICE SCHEDULE", "M-501")[0] == SheetType.SCHEDULE
        assert ReconAgent.classify_sheet_type("SYMBOLS LEGEND & GENERAL NOTES", "M-001")[0] == SheetType.LEGEND
        assert ReconAgent.classify_sheet_type("P601 CHILLED WATER RISER DIAGRAM", "P-601")[0] == SheetType.RISER
        assert ReconAgent.classify_sheet_type("TYPICAL DUCT HANGER DETAILS", "M-502")[0] == SheetType.DETAIL
        assert ReconAgent.classify_sheet_type("COVER SHEET & DRAWING INDEX", "G-001")[0] == SheetType.OTHER
        assert ReconAgent.classify_sheet_type("", "")[0] == SheetType.UNREADABLE
        assert ReconAgent.classify_sheet_type(
            "HVAC Schedule Plan", "M-118", text="FIRE RISER"
        )[0] == SheetType.PLAN

    def test_scale_adjudication_matrix_native_vs_vlm(self) -> None:
        # Case 1: Concordant Native + VLM -> VERIFIED
        cand_nat = ScaleCandidate(
            raw_string='1/4"=1\'-0"', scale_ratio=48.0, source="native_titleblock", evidence_id="ev1", is_valid=True
        )
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"', scale_ratio=48.0, source="vlm_crop", evidence_id="ev2", is_valid=True
        )
        stat, ratio, raw, rev_req, is_meas, _ = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.VERIFIED
        assert ratio == 48.0
        assert is_meas is True
        assert rev_req is False

        # Case 2: Conflicting Native vs VLM -> CONFLICT
        cand_vlm_diff = ScaleCandidate(
            raw_string='1/8"=1\'-0"', scale_ratio=96.0, source="vlm_crop", evidence_id="ev3", is_valid=True
        )
        stat, ratio, raw, rev_req, is_meas, _ = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm_diff, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert is_meas is False
        assert rev_req is True
        assert "CONFLICT" in (raw or "")

        # Case 3: Multiple conflicting native scales -> CONFLICT
        cand_nat_2 = ScaleCandidate(
            raw_string='1/8"=1\'-0"', scale_ratio=96.0, source="native_titleblock", evidence_id="ev4", is_valid=True
        )
        stat, ratio, _, rev_req, is_meas, _ = ReconAgent.evaluate_scales(
            [cand_nat, cand_nat_2], None, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert is_meas is False

        # Case 4: VLM alone (native missed) -> UNVERIFIED (VLM cannot self-certify)
        stat, ratio, _, rev_req, is_meas, _ = ReconAgent.evaluate_scales(
            [], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert is_meas is False
        assert rev_req is True

        # Case 5: NTS (Not To Scale) -> UNVERIFIED
        stat, ratio, raw, rev_req, is_meas, _ = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=True, sheet_type=SheetType.PLAN
        )
        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert is_meas is False
        assert raw == "NOT TO SCALE"

    def test_recon_result_to_metadata_compatibility(self) -> None:
        recon_res = SheetReconResult(
            sheet_id="m_101_p0",
            page_index=0,
            sheet_number="M-101",
            sheet_title="First Floor HVAC Plan",
            discipline="MECHANICAL",
            sheet_type=SheetType.PLAN,
            scale_status=ScaleStatus.VERIFIED,
            scale_ratio=48.0,
            scale_raw='1/4"=1\'-0"',
            is_measurable=True,
            review_required=False,
            width_pt=2500.0,
            height_pt=1800.0,
            dpi=150,
        )
        meta = recon_res.to_metadata()
        assert isinstance(meta, SheetMetadata)
        assert meta.sheet_id == "m_101_p0"
        assert meta.scale_status == "VERIFIED"
        assert meta.scale_ratio == 48.0

    @pytest.mark.asyncio
    async def test_recon_sheet_on_real_fixture(self) -> None:
        pdf_fixture = Path("fixtures/mechanical/sample_mechanical_p1_p3.pdf")
        if not pdf_fixture.is_file():
            pdf_fixture = Path("fixtures/mechanical/hvac_plan_level2.pdf")
        assert pdf_fixture.is_file(), f"{pdf_fixture} must exist"

        recon = ReconAgent()
        res = await recon.recon_sheet(pdf_fixture, page_index=0)
        assert res.page_index == 0
        assert res.discipline in ("MECHANICAL", "PLUMBING", "GENERAL")
        assert res.width_pt > 0
        assert res.height_pt > 0
        assert len(res.evidence_ids) >= 2

    @pytest.mark.asyncio
    async def test_recon_finds_native_scale_outside_title_block(self, tmp_path: Path) -> None:
        pdf_path = tmp_path / "plumbing_plan.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=600, height=400)
        page.insert_text((430, 280), "P-101")
        page.insert_text((430, 300), "PLUMBING FLOOR PLAN")
        page.insert_text((20, 370), '1/8\" = 1\'-0\"')
        doc.save(pdf_path)
        doc.close()

        result = await ReconAgent().recon_sheet(pdf_path, page_index=0, project_id="scale-test")

        assert result.sheet_type == SheetType.PLAN
        assert result.scale_status == ScaleStatus.VERIFIED
        assert result.scale_ratio == 96.0
        assert result.scale_raw == '1/8\" = 1\'-0\"'
        assert result.scale_candidates[0].source == "native_page"
        assert result.scale_candidates[0].bbox == [0.0, 0.0, 600.0, 400.0]


# ---------------------------------------------------------------------------
# 4. Tool Registry (TASK-COP-001) Tests
# ---------------------------------------------------------------------------
class TestToolRegistry:
    @pytest.mark.asyncio
    async def test_sql_read_only_security_blocks_mutations(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        tools = ToolRegistry(store=store)

        # Rejects DELETE
        del_res = await tools.execute_takeoff_query(project_id="p1", raw_sql="DELETE FROM takeoff_items WHERE 1=1")
        assert del_res["success"] is False
        assert "rejected by security governance" in del_res["error"]

        # Rejects DROP TABLE
        drop_res = await tools.execute_takeoff_query(project_id="p1", raw_sql="DROP TABLE takeoff_items")
        assert drop_res["success"] is False
        assert "rejected by security governance" in drop_res["error"]

        # Rejects multi-statement injection with semicolon
        inject_res = await tools.execute_takeoff_query(
            project_id="p1", raw_sql="SELECT * FROM takeoff_items; DROP TABLE sheets;"
        )
        assert inject_res["success"] is False

    @pytest.mark.asyncio
    async def test_execute_takeoff_query_parameterized_aggregations(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        tools = ToolRegistry(store=store)

        # Seed test items
        item1 = TakeoffRecord(
            item_id="it-1",
            project_id="proj_agg",
            sheet_id="s1",
            category="DUCTWORK",
            system="Supply",
            dimension_label='12x10" Supply',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=25.0,
            count=1,
            geometry={"type": "polyline", "points": [[0, 0], [10, 0]]},
            confidence=1.0,
            review_required=False,
        )
        item2 = TakeoffRecord(
            item_id="it-2",
            project_id="proj_agg",
            sheet_id="s1",
            category="DUCTWORK",
            system="Supply",
            dimension_label='12x10" Supply',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=15.0,
            count=1,
            geometry={"type": "polyline", "points": [[10, 0], [20, 0]]},
            confidence=0.8,
            review_required=True,
        )
        await store.add_takeoff_item(item1)
        await store.add_takeoff_item(item2)

        # Query aggregations
        res = await tools.execute_takeoff_query(project_id="proj_agg", category="DUCTWORK")
        assert res["success"] is True
        summary = res["summary"]
        assert summary["total_count"] == 2
        assert summary["accepted_count"] == 1
        assert summary["suggested_count"] == 1
        assert summary["total_linear_feet"] == 40.0
        assert summary["accepted_linear_feet"] == 25.0

    @pytest.mark.asyncio
    async def test_create_flag_and_propose_note_hitl_suggested_only(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        tools = ToolRegistry(store=store)

        # Create flag
        flag_res = await tools.create_flag(
            sheet_id="s_flag",
            geometry=[100.0, 100.0, 150.0, 150.0],
            reason="Unlabeled branch connection",
            severity="WARNING",
        )
        assert flag_res["success"] is True
        assert flag_res["status"] == "SUGGESTED"

        # Verify flag persisted in store strictly as SUGGESTED with review_required=True
        items = await store.list_items(sheet_id="s_flag")
        assert len(items) == 1
        assert items[0].status == "SUGGESTED"
        assert items[0].review_required is True

        # Propose note
        note_res = await tools.propose_note(
            sheet_id="s_flag",
            text="Verify CFM requirements on terminal box",
            annotation_id="it-vav-101",
        )
        assert note_res["success"] is True
        assert note_res["status"] == "SUGGESTED"

    @pytest.mark.asyncio
    async def test_tool_registry_schema_export_and_execution_dispatch(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        tools = ToolRegistry(store=store)

        meta_tools = tools.get_meta_tools()
        tool_names = [t["function"]["name"] for t in meta_tools]
        assert "execute_takeoff_query" in tool_names
        assert "get_sheet" in tool_names
        assert "list_items" in tool_names
        assert "get_annotation" in tool_names
        assert "create_flag" in tool_names
        assert "propose_note" in tool_names
        assert "get_reconciliation" in tool_names

        # Execute dispatch for unknown tool
        fail_res = await tools.execute("non_existent_tool", {})
        assert fail_res["success"] is False
        assert "not registered" in fail_res["error"]

    @pytest.mark.asyncio
    async def test_list_items_invocation_and_system_filtering(self, tmp_path: Path) -> None:
        """Verify list_items invokes TakeoffStore correctly, filters by system in memory, and handles limits."""
        store = await _create_test_store(tmp_path)
        tools = ToolRegistry(store=store)

        sheet_id = "sheet_m1_test"
        await store.insert_sheet(
            sheet_id=sheet_id,
            project_id="p1",
            page_index=0,
            sheet_number="M-101",
            sheet_title="Mechanical Plan",
            discipline="MECHANICAL",
            scale_raw='1/4" = 1\'-0"',
            scale_ratio=48.0,
            scale_status="VERIFIED",
            width_pt=1000.0,
            height_pt=800.0,
        )

        item_sup_1 = TakeoffRecord(
            item_id="it-sup-1",
            project_id="p1",
            sheet_id=sheet_id,
            category="DUCTWORK",
            system="Supply",
            dimension_label='12x10" Supply Duct',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=20.0,
            count=1,
            geometry={"type": "polyline", "points": [[10.0, 10.0], [50.0, 10.0]]},
            confidence=1.0,
            review_required=False,
        )
        item_sup_2 = TakeoffRecord(
            item_id="it-sup-2",
            project_id="p1",
            sheet_id=sheet_id,
            category="EQUIPMENT",
            system="Supply",
            dimension_label="VAV-01",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [200.0, 150.0]},
            confidence=0.9,
            review_required=True,
        )
        item_ret_1 = TakeoffRecord(
            item_id="it-ret-1",
            project_id="p1",
            sheet_id=sheet_id,
            category="DUCTWORK",
            system="Return",
            dimension_label='14x12" Return Duct',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=35.0,
            count=1,
            geometry={"type": "polyline", "points": [[100.0, 50.0], [180.0, 50.0]]},
            confidence=1.0,
            review_required=False,
        )
        item_other_sheet = TakeoffRecord(
            item_id="it-other",
            project_id="p1",
            sheet_id="other_sheet",
            category="DUCTWORK",
            system="Supply",
            dimension_label='10x8" Duct',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=12.0,
            count=1,
            geometry={"type": "polyline", "points": [[0.0, 0.0], [10.0, 0.0]]},
            confidence=1.0,
            review_required=False,
        )
        for it in (item_sup_1, item_sup_2, item_ret_1, item_other_sheet):
            await store.add_takeoff_item(it)

        # 1. Direct call - list all items for sheet
        all_res = await tools.list_items(sheet_id=sheet_id)
        assert all_res["sheet_id"] == sheet_id
        assert all_res["total_matched"] == 3
        assert all_res["count"] == 3
        assert len(all_res["items"]) == 3
        ids = {it["item_id"] for it in all_res["items"]}
        assert ids == {"it-sup-1", "it-sup-2", "it-ret-1"}

        # 2. Direct call with system="Supply"
        sup_res = await tools.list_items(sheet_id=sheet_id, system="Supply")
        assert sup_res["total_matched"] == 2
        assert sup_res["count"] == 2
        assert all(it["system"] == "Supply" for it in sup_res["items"])
        assert {it["item_id"] for it in sup_res["items"]} == {"it-sup-1", "it-sup-2"}

        # 3. Direct call with system="Return"
        ret_res = await tools.list_items(sheet_id=sheet_id, system="Return")
        assert ret_res["total_matched"] == 1
        assert ret_res["count"] == 1
        assert ret_res["items"][0]["item_id"] == "it-ret-1"

        # 4. In-memory filtering case-insensitivity: system="supply"
        case_res = await tools.list_items(sheet_id=sheet_id, system="supply")
        assert case_res["total_matched"] == 2
        assert case_res["count"] == 2

        # 5. Direct call with category filter
        cat_res = await tools.list_items(sheet_id=sheet_id, category="EQUIPMENT")
        assert cat_res["total_matched"] == 1
        assert cat_res["items"][0]["item_id"] == "it-sup-2"

        # 6. Combined category and system filter
        combo_res = await tools.list_items(sheet_id=sheet_id, category="DUCTWORK", system="Supply")
        assert combo_res["total_matched"] == 1
        assert combo_res["items"][0]["item_id"] == "it-sup-1"

        # 7. Non-matching system returns empty
        none_res = await tools.list_items(sheet_id=sheet_id, system="Exhaust")
        assert none_res["total_matched"] == 0
        assert none_res["count"] == 0
        assert none_res["items"] == []

        # 8. Limit bounding: limit=1
        lim_res = await tools.list_items(sheet_id=sheet_id, limit=1)
        assert lim_res["total_matched"] == 3
        assert lim_res["count"] == 1
        assert len(lim_res["items"]) == 1

        # 9. Dispatch via call_tool
        call_res = await tools.call_tool("list_items", {"sheet_id": sheet_id, "system": "Supply"})
        assert call_res["total_matched"] == 2
        assert call_res["count"] == 2
        assert {it["item_id"] for it in call_res["items"]} == {"it-sup-1", "it-sup-2"}

        # 10. Dispatch via execute
        exec_res = await tools.execute("list_items", {"sheet_id": sheet_id})
        assert exec_res["total_matched"] == 3
        assert exec_res["count"] == 3

        # 11. Geometry bounding box presence and verification
        sup_item_res = next(it for it in all_res["items"] if it["item_id"] == "it-sup-1")
        assert sup_item_res["bbox_pdf_pt"] == [10.0, 10.0, 50.0, 10.0]
        assert sup_item_res["dimension_label"] == '12x10" Supply Duct'
        assert sup_item_res["status"] == "ACCEPTED"
        assert sup_item_res["review_required"] is False


# ---------------------------------------------------------------------------
# 5. Product Agent 06 (Copilot-Judge & Citations) Tests
# ---------------------------------------------------------------------------
class TestCopilotJudgeAgent:
    @pytest.mark.asyncio
    async def test_citation_validator_retains_valid_and_strips_fabricated_tokens(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        copilot = CopilotJudgeAgent(store=store)

        valid_item = TakeoffRecord(
            item_id="vav-valid-101",
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="Supply",
            dimension_label="VAV-01",
            status="ACCEPTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [400.0, 300.0]},
            confidence=1.0,
            review_required=False,
        )

        sheet_meta = {"width_pt": 1000.0, "height_pt": 800.0}
        raw_model_prose = (
            "Found VAV unit [item:vav-valid-101] at corridor junction, "
            "and fake unit [item:vav-ghost-999] near the riser."
        )

        sanitized, coords, item_ids, warnings = copilot.validate_citations(
            text=raw_model_prose,
            items=[valid_item],
            sheet_meta=sheet_meta,
        )

        # Valid ID retained
        assert "[item:vav-valid-101]" in sanitized
        assert "vav-valid-101" in item_ids
        assert len(coords) == 1
        assert coords[0] == [380.0, 280.0, 420.0, 320.0]

        # Fabricated ID stripped/flagged
        assert "[item:vav-ghost-999]" not in sanitized
        assert "[unverified:vav-ghost-999]" in sanitized
        assert len(warnings) == 1
        assert "vav-ghost-999" in warnings[0]

    def test_missing_data_disclosure_enforced_when_unverified(self) -> None:
        copilot = CopilotJudgeAgent()
        sheet_meta = {"scale_raw": "None detected", "scale_status": "UNVERIFIED"}

        answer_without_disclosure = "The total ductwork length across the floor plan is 1,200 ft."
        disclosed = copilot.apply_missing_data_disclosure(
            text=answer_without_disclosure,
            sheet_id="sheet_unver",
            sheet_meta=sheet_meta,
            scale_verified=False,
        )

        assert "scale_status: UNVERIFIED" in disclosed
        assert "cannot be calculated" in disclosed

        # If already disclosed, do not double-append
        disclosed_again = copilot.apply_missing_data_disclosure(
            text=disclosed,
            sheet_id="sheet_unver",
            sheet_meta=sheet_meta,
            scale_verified=False,
        )
        assert disclosed_again == disclosed

    @pytest.mark.asyncio
    async def test_conflict_adjudication_rules(self) -> None:
        copilot = CopilotJudgeAgent()

        # Rule 1: Human override always wins
        human_conf = ConflictRecord(
            conflict_id="c1",
            sheet_id="s1",
            conflict_type="HUMAN_OVERRIDE",
            source_a={"source": "ESTIMATOR", "is_human": True},
            source_b={"source": "VLM_DETECTION", "is_human": False},
        )
        ruling1 = await copilot.adjudicate_conflict(human_conf)
        assert ruling1.ruling == ConflictRulingType.PREFER_HUMAN

        # Rule 2: Deterministic vector vs VLM perception
        vector_conf = ConflictRecord(
            conflict_id="c2",
            sheet_id="s1",
            conflict_type="NATIVE_VS_VLM",
            source_a={"source": "NATIVE_VECTOR", "native_confidence": 0.95, "evidence_ids": ["ev_nat_1"]},
            source_b={"source": "VLM_SPARK", "confidence": 0.7},
        )
        ruling2 = await copilot.adjudicate_conflict(vector_conf)
        assert ruling2.ruling == ConflictRulingType.PREFER_NATIVE
        assert "ev_nat_1" in ruling2.cited_evidence_ids

        # Rule 3: Conflicting scales -> NEEDS_HUMAN
        scale_conf = ConflictRecord(
            conflict_id="c3",
            sheet_id="s1",
            conflict_type="SCALE_CONFLICT",
            source_a={"scale": '1/4"=1\'-0"'},
            source_b={"scale": '1/8"=1\'-0"'},
        )
        ruling3 = await copilot.adjudicate_conflict(scale_conf)
        assert ruling3.ruling == ConflictRulingType.NEEDS_HUMAN
        assert ruling3.action_required == "MANUAL_CALIBRATION"

    @pytest.mark.asyncio
    async def test_wonder_tool_calling_loop(self, tmp_path: Path) -> None:
        store = await _create_test_store(tmp_path)
        await store.insert_sheet(
            sheet_id="sheet_wonder",
            project_id="proj_w",
            page_index=0,
            sheet_number="M-201",
            sheet_title="Second Floor Mechanical",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            scale_raw='1/4"=1\'-0"',
            width_pt=1000.0,
            height_pt=800.0,
            pdf_path="dummy.pdf",
        )

        item = TakeoffRecord(
            item_id="vav-wonder-01",
            project_id="proj_w",
            sheet_id="sheet_wonder",
            category="EQUIPMENT",
            system="Supply",
            dimension_label="VAV-01",
            status="ACCEPTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [350.0, 250.0]},
            confidence=1.0,
            review_required=False,
        )
        await store.add_takeoff_item(item)

        # Script Wonder 1.0 tool calling: Turn 1 calls get_sheet, Turn 2 answers citing the valid item
        stub_client = StubWonderToolClient(
            turns=[
                {
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {"name": "get_sheet", "arguments": '{"sheet_id": "sheet_wonder"}'},
                        }
                    ],
                    "mock": False,
                },
                {
                    "content": "Sheet M-201 is verified. Found unit [item:vav-wonder-01] on the supply system.",
                    "tool_calls": [],
                    "mock": False,
                },
            ]
        )

        copilot = CopilotJudgeAgent(client=stub_client, store=store)  # type: ignore[arg-type]
        req = CopilotQueryRequest(sheet_id="sheet_wonder", query="Where is VAV-01?")
        res = await copilot.answer_query_with_tools(req)

        assert res.model_used is True
        assert res.scale_verified is True
        assert "vav-wonder-01" in res.referenced_item_ids
        assert len(res.cited_coordinates) == 1
        assert res.cited_coordinates[0] == [330.0, 230.0, 370.0, 270.0]
        assert "[item:vav-wonder-01]" in res.answer
