"""Milestone 3 Test Suite: Reconciliation & Watchdog Agents.

Product Agent 04 (Schedule Reconciler): schedule extraction with cell-level
evidence, deterministic 3-tier tag linking (exact -> normalized -> fuzzy),
acceptance-aware family counts, ghost links, and mismatch flags.
Product Agent 05 (Watchdog QA): see TestWatchdogQA below (slice 2).
"""

from __future__ import annotations

from typing import Any

import pytest

from src.agents.schedule_reconciler import (
    ScheduleReconcilerAgent,
    ScheduleRow,
    count_families,
    family_of_tag,
    first_number_of_tag,
    fuzzy_linkable,
    link_schedule_rows,
)
from src.store.takeoff_store import TakeoffRecord


def _rec(
    label: str,
    tag: str | None = None,
    status: str = "SUGGESTED",
    geometry: dict[str, Any] | None = None,
    sheet_id: str = "m_101",
    item_id: str | None = None,
    confidence: float | None = 0.9,
    category: str = "EQUIPMENT",
    length_ft: float = 0.0,
) -> TakeoffRecord:
    return TakeoffRecord(
        item_id=item_id or f"item_{label}_{tag}_{status}",
        project_id="p1",
        sheet_id=sheet_id,
        category=category,  # type: ignore[arg-type]
        dimension_label=label,
        equipment_tag=tag,
        status=status,  # type: ignore[arg-type]
        source="SYMBOL_SWARM",
        total_length_ft=length_ft,
        geometry=geometry or {"type": "point", "coordinates": [100.0, 200.0]},
        confidence=confidence,
        review_required=True,
    )


def _row(tag: str, idx: int = 0) -> ScheduleRow:
    return ScheduleRow(tag=tag, row_index=idx, evidence_id=f"ev_row_{idx}")


# ===========================================================================
# Product Agent 04: pure-helper unit tests (slice A)
# ===========================================================================
class TestTagFamiliesAndFuzzyGuard:
    def test_family_and_first_number(self) -> None:
        assert family_of_tag("VAV-1") == "VAV"
        assert family_of_tag("S-1") == "S"
        assert family_of_tag("FD") == "FD"
        assert family_of_tag("") == ""
        assert first_number_of_tag("VAV-11") == "11"
        assert first_number_of_tag("VAV-1") == "1"
        assert first_number_of_tag("FD") is None

    def test_fuzzy_passes_same_unit_variant(self) -> None:
        ok, ratio = fuzzy_linkable("VAV-1", "VAV–1")  # en-dash variant
        assert ok is True
        assert ratio >= 0.8

    def test_fuzzy_rejects_distinct_units(self) -> None:
        # Same family, different number: never conflated (high raw ratio!).
        ok, _ = fuzzy_linkable("VAV-1", "VAV-11")
        assert ok is False
        ok, _ = fuzzy_linkable("VAV-1", "VAV-2")
        assert ok is False

    def test_fuzzy_rejects_cross_family(self) -> None:
        ok, _ = fuzzy_linkable("VAV-1", "EF-1")
        assert ok is False

    def test_fuzzy_rejects_distant_strings(self) -> None:
        ok, ratio = fuzzy_linkable("AHU-1", "VAV-1")
        assert ok is False
        assert ratio < 0.8


class TestLinkScheduleRows:
    def test_exact_tier_record_link(self) -> None:
        rec = _rec("VAV Box", tag="VAV-01", item_id="rec_exact")
        links = link_schedule_rows([_row("VAV-01")], [rec])
        assert len(links) == 1
        link = links[0]
        assert link.tier == "exact"
        assert link.ghost is False
        assert link.plan_evidence_id == "rec_exact"
        assert link.plan_sheet_id == "m_101"
        assert link.plan_coords_pt == [100.0, 200.0]

    def test_normalized_tier_zero_variant(self) -> None:
        rec = _rec("vav 1", item_id="rec_norm")  # normalizes to VAV-1
        links = link_schedule_rows([_row("VAV-01")], [rec])
        assert links[0].tier == "normalized"
        assert links[0].ghost is False
        assert links[0].plan_evidence_id == "rec_norm"

    def test_fuzzy_tier_labelled_with_ratio(self) -> None:
        rec = _rec("VAV–1", item_id="rec_fuzzy")  # en-dash: exact+normalized miss
        links = link_schedule_rows([_row("VAV-1")], [rec])
        assert links[0].tier == "fuzzy"
        assert links[0].ghost is False
        assert links[0].fuzzy_ratio is not None and links[0].fuzzy_ratio >= 0.8

    def test_ghost_when_no_match(self) -> None:
        rec = _rec("Diffuser", tag="SD-1")
        links = link_schedule_rows([_row("VAV-99")], [rec])
        assert links[0].tier == "none"
        assert links[0].ghost is True
        assert links[0].plan_evidence_id is None

    def test_rejected_records_are_not_evidence(self) -> None:
        rec = _rec("VAV Box", tag="VAV-01", status="REJECTED")
        links = link_schedule_rows([_row("VAV-01")], [rec])
        assert links[0].ghost is True
        assert links[0].tier == "none"

    def test_duplicate_rows_consume_evidence_once(self) -> None:
        rec = _rec("VAV Box", tag="VAV-01", item_id="rec_once")
        links = link_schedule_rows([_row("VAV-01", 0), _row("VAV-01", 1)], [rec])
        assert links[0].ghost is False
        assert links[0].plan_evidence_id == "rec_once"
        assert links[1].ghost is True  # same evidence cannot link twice

    def test_text_block_grounds_link_spatially(self) -> None:
        blocks = [("VAV-01 450 CFM schedule tag", [100.0, 100.0, 300.0, 200.0])]
        links = link_schedule_rows([_row("VAV-01")], [], plan_text_blocks=blocks, plan_sheet_id="m_plan")
        assert links[0].tier == "exact"
        assert links[0].ghost is False
        assert links[0].plan_evidence_id is None  # text is grounding, not ledger evidence
        assert links[0].plan_coords_pt == [200.0, 150.0]
        assert links[0].plan_sheet_id == "m_plan"

    def test_record_preferred_over_text_within_tier(self) -> None:
        rec = _rec("VAV Box", tag="VAV-01", item_id="rec_win")
        blocks = [("VAV-01 noted on plan", [0.0, 0.0, 100.0, 100.0])]
        links = link_schedule_rows([_row("VAV-01")], [rec], plan_text_blocks=blocks)
        assert links[0].tier == "exact"
        assert links[0].plan_evidence_id == "rec_win"


class TestCountFamilies:
    def test_accepted_pending_split_and_variance(self) -> None:
        rows = [_row("VAV-01"), _row("VAV-02"), _row("EF-1")]
        records = [
            _rec("VAV Box", tag="VAV-01", status="ACCEPTED"),
            _rec("VAV Box", tag="VAV-02", status="SUGGESTED"),
            _rec("Fan", tag="EF-1", status="SUGGESTED"),
            _rec("Fan", tag="EF-2", status="SUGGESTED"),
        ]
        counts = {c.family: c for c in count_families(rows, records)}
        assert counts["VAV"].scheduled_qty == 2
        assert counts["VAV"].plan_accepted == 1
        assert counts["VAV"].plan_pending == 1
        assert counts["VAV"].plan_total == 2
        assert counts["VAV"].variance == 0
        assert counts["VAV"].status == "MATCHED"
        assert counts["EF"].scheduled_qty == 1
        assert counts["EF"].plan_total == 2
        assert counts["EF"].variance == 1
        assert counts["EF"].status == "OVERCOUNT"

    def test_undercount_and_rejected_excluded(self) -> None:
        rows = [_row("VAV-01"), _row("VAV-02")]
        records = [
            _rec("VAV Box", tag="VAV-01", status="ACCEPTED"),
            _rec("VAV Box", tag="VAV-02", status="REJECTED"),  # not evidence
        ]
        counts = {c.family: c for c in count_families(rows, records)}
        assert counts["VAV"].plan_total == 1
        assert counts["VAV"].variance == -1
        assert counts["VAV"].status == "UNDERCOUNT"

    def test_runs_without_family_are_out_of_scope(self) -> None:
        rows = [_row("VAV-01")]
        records = [
            _rec("16x12", status="SUGGESTED"),  # dimensioned run, no tag family
            _rec("VAV Box", tag="VAV-01", status="SUGGESTED"),
        ]
        counts = {c.family: c for c in count_families(rows, records)}
        assert set(counts) == {"VAV"}
        assert counts["VAV"].plan_total == 1


class TestScheduleReconcilerAgentMeta:
    def test_initialization_and_metadata(self) -> None:
        agent = ScheduleReconcilerAgent()
        assert agent.agent_id == "agent_04_reconciler"
        assert "Reconciler" in agent.agent_name
        assert agent.is_llm_agent is True


def _schedule_pdf(path, lines: list[str]):
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=1000, height=800)
    page.insert_text((100, 100), "EQUIPMENT SCHEDULE M-601")
    for i, line in enumerate(lines):
        page.insert_text((100, 150 + i * 30), line)
    doc.save(str(path))
    doc.close()


# ===========================================================================
# Product Agent 04: extraction + grounding (slice B)
# ===========================================================================
class TestExtractRows:
    def test_offline_mock_rows_are_labelled(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import EvidenceIDGenerator
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = False
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched.pdf"
        _schedule_pdf(pdf_path, ["VAV-01 450 CFM"])

        ev_gen = EvidenceIDGenerator(project_id="p1")
        rows, mock = agent.extract_rows(pdf_path, 0, "Schedule", "m_601", ev_gen)
        assert mock is True
        assert len(rows) == 4  # deterministic offline mock
        assert all(r.mock is True for r in rows)
        assert all(r.review_required is True for r in rows)
        assert all(ev_gen.is_valid_syntax(r.evidence_id) for r in rows)
        assert {r.tag for r in rows} == {"VAV-01", "VAV-02", "EF-1", "S1"}

    def test_live_extraction_parses_rows(self, tmp_path) -> None:
        import json
        from unittest.mock import MagicMock

        from src.agents.base import EvidenceIDGenerator
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client.parse_crop_ocr.return_value = {
            "raw_content": json.dumps([
                {"tag": "VAV-01", "description": "VAV box", "system": "Supply Air",
                 "cfm": 450, "dimension": '10"'},
                {"tag": "EF-1", "description": "Exhaust fan", "system": "Exhaust Air",
                 "cfm": 1200, "dimension": '16"'},
            ]),
            "mock": False,
        }
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched_live.pdf"
        _schedule_pdf(pdf_path, ["VAV-01", "EF-1"])

        ev_gen = EvidenceIDGenerator(project_id="p1")
        rows, mock = agent.extract_rows(pdf_path, 0, "Schedule", "m_601", ev_gen)
        assert mock is False
        assert [r.tag for r in rows] == ["VAV-01", "EF-1"]
        assert rows[0].params["cfm"] == 450.0
        assert rows[0].params["system"] == "Supply Air"
        assert all(r.mock is False for r in rows)

    def test_live_unparseable_yields_no_rows(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import EvidenceIDGenerator
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client.parse_crop_ocr.return_value = {"raw_content": "not json {{{", "mock": False}
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched_bad.pdf"
        _schedule_pdf(pdf_path, ["VAV-01"])

        rows, mock = agent.extract_rows(pdf_path, 0, "Schedule", "m_601", EvidenceIDGenerator())
        assert mock is False
        assert rows == []


class TestGroundRows:
    def test_native_match_attaches_bbox(self, tmp_path) -> None:
        agent = ScheduleReconcilerAgent()
        pdf_path = tmp_path / "sched_ground.pdf"
        _schedule_pdf(pdf_path, ["VAV-01 450 CFM", "EF-1 1200 CFM"])

        rows = agent.ground_rows([_row("VAV-01"), _row("MISSING-9")], pdf_path, 0)
        assert rows[0].source_bbox is not None
        x0, y0, x1, y1 = rows[0].source_bbox
        assert 0.0 <= x0 < x1 <= 1000.0
        assert 0.0 <= y0 < y1 <= 800.0
        assert rows[1].source_bbox is None  # no evidence invented


# ===========================================================================
# Product Agent 04: run/run_stream + engine integration (slice C)
# ===========================================================================
class TestReconcilerRun:
    @pytest.mark.asyncio
    async def test_run_offline_reconciles_with_mock_labels(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import AgentContext
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = False
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched_run.pdf"
        _schedule_pdf(pdf_path, ["VAV-01 450 CFM", "VAV-02 650 CFM"])

        plan = [
            _rec("VAV Box", tag="VAV-01", status="ACCEPTED", item_id="plan_vav1"),
            _rec("VAV Box", tag="VAV-02", status="SUGGESTED", item_id="plan_vav2"),
        ]
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        res = await agent.run(context, plan_items=plan)

        assert res.success is True
        assert res.review_required is True
        assert res.items == []  # links reference evidence; never duplicated
        assert res.mock_rows is True
        assert len(res.rows) == 4
        assert all(r.mock is True for r in res.rows)
        by_tag = {link.tag: link for link in res.links}
        assert by_tag["VAV-01"].ghost is False
        assert by_tag["VAV-01"].plan_evidence_id == "plan_vav1"
        assert by_tag["VAV-02"].ghost is False
        assert by_tag["EF-1"].ghost is True
        assert by_tag["S1"].ghost is True

        flag_types = [f.get("type") for f in res.flags]
        assert "OFFLINE_SCHEDULE_MOCK" in flag_types
        assert "COUNT_MISMATCH_PENDING" in flag_types  # VAV matched, 1 pending
        assert "COUNT_MISMATCH" in flag_types  # EF + S undercounted
        assert sum(1 for f in res.flags if f.get("type") == "UNPLACED_TAG") == 2
        assert all(f.get("agent05_task") is True for f in res.flags
                   if f.get("type") in ("COUNT_MISMATCH", "COUNT_MISMATCH_PENDING", "UNPLACED_TAG"))

        assert res.report is not None
        assert res.report["total_scheduled"] == 4
        assert res.report["total_ghosts"] == 2
        assert len(res.report["ghost_pins"]) == 2
        assert all(g["status"] == "UNPLACED" for g in res.report["ghost_pins"])

    @pytest.mark.asyncio
    async def test_run_reads_plan_evidence_from_store(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import AgentContext
        from src.meta_services.client import MetaModelClient
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_store.sqlite3")
        await store.initialize()
        rec = _rec("VAV Box", tag="VAV-01", status="ACCEPTED", item_id="stored_vav1")
        await store.bulk_add_takeoff_items([rec])

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = False
        agent = ScheduleReconcilerAgent(client=mock_client, store=store)
        pdf_path = tmp_path / "sched_store.pdf"
        _schedule_pdf(pdf_path, ["VAV-01"])

        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        res = await agent.run(context)
        by_tag = {link.tag: link for link in res.links}
        assert by_tag["VAV-01"].plan_evidence_id == "stored_vav1"

    @pytest.mark.asyncio
    async def test_unparseable_schedule_flag_and_human_entry(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import AgentContext
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client.parse_crop_ocr.return_value = {"raw_content": "garbage {{{", "mock": False}
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched_unparse.pdf"
        _schedule_pdf(pdf_path, ["VAV-01"])

        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        res = await agent.run(context, plan_items=[])
        assert res.success is True  # fail-closed, not a crash
        assert res.rows == []
        assert res.report is None
        assert any(f.get("type") == "SCHEDULE_UNPARSEABLE" for f in res.flags)
        flag = next(f for f in res.flags if f.get("type") == "SCHEDULE_UNPARSEABLE")
        assert flag.get("fallback") == "HUMAN_ENTRY_REQUIRED"

    @pytest.mark.asyncio
    async def test_seeded_mismatch_recall_is_total(self, tmp_path) -> None:
        import json
        from unittest.mock import MagicMock

        from src.agents.base import AgentContext
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client.parse_crop_ocr.return_value = {
            "raw_content": json.dumps([
                {"tag": "VAV-01", "description": "VAV", "system": "Supply Air"},
                {"tag": "VAV-02", "description": "VAV", "system": "Supply Air"},
                {"tag": "VAV-03", "description": "VAV", "system": "Supply Air"},
                {"tag": "EF-1", "description": "Fan", "system": "Exhaust Air"},
            ]),
            "mock": False,
        }
        agent = ScheduleReconcilerAgent(client=mock_client)
        pdf_path = tmp_path / "sched_seed.pdf"
        _schedule_pdf(pdf_path, ["VAV-01", "EF-1"])

        plan = [
            _rec("VAV Box", tag="VAV-01", status="ACCEPTED"),  # VAV undercount (1/3)
            _rec("Fan", tag="EF-1", status="SUGGESTED"),
            _rec("Fan", tag="EF-2", status="SUGGESTED"),  # EF overcount (2/1)
            _rec("Pump", tag="P-9", status="SUGGESTED"),  # unscheduled tag
        ]
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        res = await agent.run(context, plan_items=plan)

        mismatch_fams = {f.get("family") for f in res.flags if f.get("type") == "COUNT_MISMATCH"}
        assert {"VAV", "EF", "P"} <= mismatch_fams  # recall 1.0 on seeded mismatches
        by_tag = {link.tag: link for link in res.links}
        assert by_tag["VAV-02"].ghost is True
        assert by_tag["VAV-03"].ghost is True
        statuses = {d["status"] for d in res.report["discrepancies"]}
        assert "UNPLACED_GHOST" in statuses
        assert "UNSCHEDULED" in statuses
        assert len(res.report["ghost_pins"]) >= 2
        assert all(g["location_pt"][0] == 60.0 for g in res.report["ghost_pins"])  # dock staging

    @pytest.mark.asyncio
    async def test_no_store_no_items_all_ghost(self, tmp_path) -> None:
        from unittest.mock import MagicMock

        from src.agents.base import AgentContext
        from src.meta_services.client import MetaModelClient

        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = False
        agent = ScheduleReconcilerAgent(client=mock_client)  # no store
        pdf_path = tmp_path / "sched_nostore.pdf"
        _schedule_pdf(pdf_path, ["VAV-01"])

        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        res = await agent.run(context)
        assert any(f.get("type") == "PLAN_EVIDENCE_UNAVAILABLE" for f in res.flags)
        assert all(link.ghost is True for link in res.links)
        assert all(c.status == "UNDERCOUNT" for c in res.family_counts)

    @pytest.mark.asyncio
    async def test_orchestrator_dispatches_reconciler_on_schedule_sheet(self, tmp_path) -> None:
        from src.agents import (
            AgentContext,
            AgentEventType,
            AgentRegistry,
            OrchestratorAgent,
            ReconAgent,
        )
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_dispatch.sqlite3")
        await store.initialize()
        registry = AgentRegistry()
        registry.register(ReconAgent())
        registry.register(ScheduleReconcilerAgent(store=store))
        orch = OrchestratorAgent(registry=registry, store=store)

        pdf_path = tmp_path / "sched_only.pdf"
        _schedule_pdf(pdf_path, ["VAV-01 450 CFM"])
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)

        events = [ev async for ev in orch.orchestrate_stream(context)]
        types = [e.event_type for e in events]
        assert AgentEventType.SHEET_CLASSIFIED in types
        dispatched = [e.payload.get("target_agent") for e in events
                      if e.event_type == AgentEventType.AGENT_DISPATCHED]
        assert "agent_04_reconciler" in dispatched
        assert AgentEventType.COMPLETED in types
        assert any("report" in (e.payload or {}) for e in events
                   if e.event_type == AgentEventType.ITEMS_EMITTED)


# ===========================================================================
# Product Agent 05: pure checks (slice 2b, chunk 1)
# ===========================================================================
class TestWatchdogChecks:
    def test_scale_unverified_measured(self) -> None:
        from src.agents.watchdog_qa import check_scale_measured

        sheets = [
            {"sheet_id": "s_bad", "scale_status": "UNVERIFIED"},
            {"sheet_id": "s_ok", "scale_status": "VERIFIED"},
            {"sheet_id": "s_sym", "scale_status": "UNVERIFIED"},
        ]
        items = [
            _rec("24x12", sheet_id="s_bad", category="DUCTWORK", length_ft=10.0, item_id="m1"),
            _rec("24x12", sheet_id="s_ok", category="DUCTWORK", length_ft=10.0, item_id="m2"),
            _rec("VAV Box", sheet_id="s_sym", item_id="s1"),  # symbols need no scale
        ]
        findings = check_scale_measured(sheets, items)
        assert len(findings) == 1
        assert findings[0].reason_code == "SCALE_UNVERIFIED_MEASURED"
        assert findings[0].severity == "HIGH"
        assert findings[0].sheet_id == "s_bad"
        assert findings[0].evidence_ids == ["m1"]

    def test_reconcile_flag_conversion(self) -> None:
        from src.agents.watchdog_qa import check_reconcile_flags

        flags = [
            {"type": "COUNT_MISMATCH", "severity": "HIGH", "family": "VAV",
             "message": "VAV short", "sheet_id": "sched"},
            {"type": "COUNT_MISMATCH_PENDING", "family": "EF", "message": "EF pending"},
            {"type": "UNPLACED_TAG", "tag": "VAV-9", "schedule_sheet_id": "sched"},
            {"type": "OFFLINE_SCHEDULE_MOCK"},  # operational: out of watch scope
        ]
        findings = check_reconcile_flags(flags)
        by_reason = {f.reason_code: f for f in findings}
        assert set(by_reason) == {"COUNT_MISMATCH", "COUNT_MISMATCH_PENDING", "UNPLACED_TAG"}
        assert by_reason["COUNT_MISMATCH"].annotation_type == "CONFLICT"
        assert by_reason["COUNT_MISMATCH_PENDING"].annotation_type == "NOTE"
        assert by_reason["UNPLACED_TAG"].annotation_type == "FLAG"

    def test_orphan_runs(self) -> None:
        from src.agents.watchdog_qa import check_orphan_runs

        orphan = _rec("24x12", category="DUCTWORK", item_id="orphan")
        orphan.system = "General"
        labelled = _rec("24x12", category="DUCTWORK", item_id="labelled")
        labelled.system = "SupplyAir"
        accepted_orphan = _rec("24x12", category="DUCTWORK", status="ACCEPTED", item_id="acc")
        accepted_orphan.system = "General"
        symbol = _rec("VAV Box", item_id="sym")  # not a run
        findings = check_orphan_runs([orphan, labelled, accepted_orphan, symbol])
        assert [f.evidence_ids for f in findings] == [["orphan"]]
        assert findings[0].reason_code == "ORPHAN_RUN"

    def test_ambiguous_junctions(self) -> None:
        from src.agents.watchdog_qa import check_ambiguous_junctions

        geom = {"type": "polyline", "points": [[0, 0], [10, 0]], "uncertainty_codes": ["AMBIGUOUS_JUNCTION"]}
        split = _rec("24x12", category="DUCTWORK", geometry=geom, item_id="split")
        plain = _rec("24x12", category="DUCTWORK", item_id="plain")
        findings = check_ambiguous_junctions([split, plain])
        assert len(findings) == 1
        assert findings[0].reason_code == "AMBIGUOUS_JUNCTION"
        assert findings[0].evidence_ids == ["split"]

    def test_low_confidence_flags_and_clusters(self) -> None:
        from src.agents.watchdog_qa import check_low_confidence

        demoted = _rec("VAV Box", confidence=0.20, item_id="demoted")
        lows = [_rec("VAV Box", confidence=0.40, item_id=f"low{i}", sheet_id="s_c") for i in range(3)]
        pair = [_rec("Diffuser", confidence=0.40, item_id=f"pair{i}", sheet_id="s_p") for i in range(2)]
        none_conf = _rec("VAV Box", confidence=None, item_id="none")
        findings = check_low_confidence([demoted, *lows, *pair, none_conf])
        by_reason = {}
        for f in findings:
            by_reason.setdefault(f.reason_code, []).append(f)
        assert [f.evidence_ids for f in by_reason["VERIFIER_DEMOTED_SUSPECT"]] == [["demoted"]]
        assert len(by_reason["LOW_CONFIDENCE_CLUSTER"]) == 1  # s_c trio only; pair too small
        assert all(f.annotation_type == "NOTE" for f in by_reason["LOW_CONFIDENCE_CLUSTER"])

    def test_rejection_pattern(self) -> None:
        from src.agents.watchdog_qa import check_rejection_pattern

        items = {f"r{i}": _rec("VAV Box", item_id=f"r{i}", sheet_id="s1") for i in range(4)}
        feedback = [
            {"previous_status": "SUGGESTED", "new_status": "REJECTED",
             "item_id": f"r{i}", "sheet_id": "s1"}
            for i in range(3)
        ]
        feedback.append({"previous_status": "SUGGESTED", "new_status": "REJECTED",
                         "item_id": "ghost", "sheet_id": "s1"})  # item gone: skipped
        feedback.append({"previous_status": "SUGGESTED", "new_status": "ACCEPTED",
                         "item_id": "r3", "sheet_id": "s1"})  # not a rejection
        findings = check_rejection_pattern(feedback, items)
        assert len(findings) == 1
        assert findings[0].reason_code == "REJECTION_PATTERN"
        assert "re-running Agent 02" in findings[0].message

    def test_dedupe(self) -> None:
        from src.agents.watchdog_qa import QAAnnotation, dedupe_annotations, dedupe_key

        def _ann(reason: str, sheet: str | None, geom: dict | None) -> QAAnnotation:
            return QAAnnotation(reason_code=reason, sheet_id=sheet, geometry=geom)

        geom = {"type": "point", "coordinates": [1.0, 2.0]}
        fresh = [_ann("R", "s1", geom), _ann("R", "s1", dict(geom)), _ann("R", "s2", geom)]
        assert len(dedupe_annotations(fresh)) == 2  # same sheet+geometry collapses
        stored = {dedupe_key("R", "s1", geom)}
        assert len(dedupe_annotations(fresh, stored)) == 1  # stored OPEN suppresses
        assert dedupe_annotations(fresh, stored)[0].sheet_id == "s2"


# ===========================================================================
# Product Agent 05: run/stream + persistence (slice 2b, chunk 2)
# ===========================================================================
class TestWatchdogRun:
    @pytest.mark.asyncio
    async def test_run_full_pass_with_store(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_watch.sqlite3")
        await store.initialize()
        await store.insert_project("p1", "Watch")
        await store.insert_sheet(
            sheet_id="s1", project_id="p1", page_index=0, sheet_number="M-101",
            sheet_title="Plan", discipline="MECHANICAL", scale_raw="",
            scale_ratio=0.0, scale_status="UNVERIFIED", width_pt=1000.0, height_pt=800.0,
        )
        orphan = _rec("24x12", category="DUCTWORK", length_ft=25.0, item_id="orphan1", sheet_id="s1")
        junction_geom: dict[str, Any] = {
            "type": "polyline", "points": [[0, 0], [10, 0]], "uncertainty_codes": ["AMBIGUOUS_JUNCTION"],
        }
        junction = _rec("24x12", category="DUCTWORK", length_ft=10.0, geometry=junction_geom,
                         item_id="junct1", sheet_id="s1")
        junction.system = "SupplyAir"
        demoted = _rec("VAV Box", confidence=0.20, item_id="dem1", sheet_id="s1")
        clean = _rec("VAV Box", item_id="clean1", sheet_id="s1")
        await store.bulk_add_takeoff_items([orphan, junction, demoted, clean])

        agent = WatchdogQAAgent(store=store)
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        reconcile_flags = [
            {"type": "COUNT_MISMATCH", "severity": "HIGH", "family": "VAV",
             "message": "VAV short", "sheet_id": "s1"},
        ]
        res = await agent.run(context, reconcile_flags=reconcile_flags)

        assert res.success is True
        assert res.rules_only is True
        assert res.items == []  # ledger untouched
        assert res.persisted is True
        assert res.review_required is True
        reasons = sorted(a.reason_code for a in res.annotations)
        assert reasons == [
            "AMBIGUOUS_JUNCTION", "COUNT_MISMATCH", "ORPHAN_RUN",
            "SCALE_UNVERIFIED_MEASURED", "VERIFIER_DEMOTED_SUSPECT",
        ]
        assert "reconcile_flags" in res.checks_run
        stored = await store.list_qa_annotations("p1")
        assert len(stored) == 5
        assert len(await store.list_items(project_id="p1")) == 4  # no ledger writes
        assert len(res.checklist) == 1
        assert res.checklist[0].verdict == "NEEDS_REVIEW"
        assert res.checklist[0].open_flags == 4
        assert res.checklist[0].open_conflicts == 1

    @pytest.mark.asyncio
    async def test_run_clean_bill(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_clean.sqlite3")
        await store.initialize()
        await store.insert_project("p1", "Watch")
        await store.insert_sheet(
            sheet_id="s1", project_id="p1", page_index=0, sheet_number="M-101",
            sheet_title="Plan", discipline="MECHANICAL", scale_raw="",
            scale_ratio=0.0556, scale_status="VERIFIED", width_pt=1000.0, height_pt=800.0,
        )
        run = _rec("24x12", category="DUCTWORK", length_ft=25.0, item_id="run1", sheet_id="s1")
        run.system = "SupplyAir"
        await store.bulk_add_takeoff_items([run, _rec("VAV Box", item_id="sym1", sheet_id="s1")])

        agent = WatchdogQAAgent(store=store)
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        res = await agent.run(context)
        assert res.annotations == []
        assert res.review_required is False  # clean bill needs no gate
        assert res.checklist[0].verdict == "CLEAN"
        assert res.persisted is False

    @pytest.mark.asyncio
    async def test_run_without_store_warns_and_returns(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent

        agent = WatchdogQAAgent()  # no store
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        orphan = _rec("24x12", category="DUCTWORK", item_id="o1", sheet_id="s1")
        res = await agent.run(
            context,
            items=[orphan],
            sheets=[{"sheet_id": "s1", "scale_status": "VERIFIED"}],
            feedback_events=[],
        )
        assert [a.reason_code for a in res.annotations] == ["ORPHAN_RUN"]
        assert res.persisted is False
        assert any(f.get("type") == "WATCHDOG_STORAGE_UNAVAILABLE" for f in res.flags)

    @pytest.mark.asyncio
    async def test_second_run_dedupes_stored_open(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_dedupe.sqlite3")
        await store.initialize()
        await store.insert_project("p1", "Watch")
        await store.insert_sheet(
            sheet_id="s1", project_id="p1", page_index=0, sheet_number="M-101",
            sheet_title="Plan", discipline="MECHANICAL", scale_raw="",
            scale_ratio=0.0, scale_status="VERIFIED", width_pt=1000.0, height_pt=800.0,
        )
        await store.bulk_add_takeoff_items(
            [_rec("24x12", category="DUCTWORK", item_id="o1", sheet_id="s1")]
        )
        agent = WatchdogQAAgent(store=store)
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        first = await agent.run(context)
        assert len(first.annotations) == 1
        second = await agent.run(context)
        assert second.annotations == []  # stored OPEN suppresses re-raise
        assert second.checklist[0].verdict == "NEEDS_REVIEW"  # still unresolved
        assert second.checklist[0].open_flags == 1

    @pytest.mark.asyncio
    async def test_disposed_annotations_stay_suppressed(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent
        from src.store.takeoff_store import TakeoffStore

        store = TakeoffStore(db_path=tmp_path / "m3_disposed.sqlite3")
        await store.initialize()
        await store.insert_project("p1", "Watch")
        await store.insert_sheet(
            sheet_id="s1", project_id="p1", page_index=0, sheet_number="M-101",
            sheet_title="Plan", discipline="MECHANICAL", scale_raw="",
            scale_ratio=0.0, scale_status="VERIFIED", width_pt=1000.0, height_pt=800.0,
        )
        await store.bulk_add_takeoff_items(
            [_rec("24x12", category="DUCTWORK", item_id="o1", sheet_id="s1")]
        )
        agent = WatchdogQAAgent(store=store)
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        first = await agent.run(context)
        assert len(first.annotations) == 1
        # Human dismisses with reason; a re-run must not resurrect the same flag.
        await store.update_qa_annotation_status(
            first.annotations[0].annotation_id, "DISMISSED", "verified manually off-system"
        )
        second = await agent.run(context)
        assert second.annotations == []
        assert second.checklist[0].verdict == "CLEAN"  # nothing OPEN remains

    @pytest.mark.asyncio
    async def test_sheet_scope_filter(self, tmp_path) -> None:
        from src.agents.base import AgentContext
        from src.agents.watchdog_qa import WatchdogQAAgent

        agent = WatchdogQAAgent()
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=tmp_path / "dummy.pdf")
        res = await agent.run(
            context,
            sheet_ids=["s1"],
            items=[
                _rec("24x12", category="DUCTWORK", item_id="o1", sheet_id="s1"),
                _rec("24x12", category="DUCTWORK", item_id="o2", sheet_id="s2"),
            ],
            sheets=[
                {"sheet_id": "s1", "scale_status": "VERIFIED"},
                {"sheet_id": "s2", "scale_status": "VERIFIED"},
            ],
            feedback_events=[],
        )
        assert [a.evidence_ids for a in res.annotations] == [["o1"]]
        assert [c.sheet_id for c in res.checklist] == ["s1"]

    def test_metadata(self) -> None:
        from src.agents.watchdog_qa import WatchdogQAAgent

        agent = WatchdogQAAgent()
        assert agent.agent_id == "agent_05_watchdog"
        assert "Watchdog" in agent.agent_name
        assert agent.is_llm_agent is False  # RULES_ONLY in M3
