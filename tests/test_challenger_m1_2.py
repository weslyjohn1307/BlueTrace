"""Empirical Stress Test Suite for Milestone 1 Challenger (p4_challenger_m1_2).

Covers:
1. Citation Validation under extreme adversarial conditions:
   - Flooding with 100+ fabricated UUIDs and non-existent IDs.
   - Malformed, boundary, and injection-like syntax.
   - Degenerate, out-of-bounds, NaN/Inf, and malformed geometries.
   - Deduplication and mixed valid/fabricated corpora.
   - Verification that 0 coordinates and 0 ungrounded item IDs are ever hallucinated.

2. Missing Data Disclosures under unverified scales and missing equipment:
   - Sheets with scale_status='UNVERIFIED', 'CONFLICT', 'NTS', or sheet_meta=None.
   - Sheets with scale_status='VERIFIED' but scale_ratio=0.0 (fail-closed zero-ratio trap).
   - Queries requesting linear footage / ductwork / piping on unverified sheets.
   - Queries requesting equipment when 0 equipment items exist in ledger.
   - Idempotency and tool loop disclosure integration.

3. Orchestrator SSE Event Streaming Robustness:
   - Strict event sequence: STARTED -> SHEET_DISCOVERED -> SHEET_CLASSIFIED -> COMPLETED.
   - Monotonic progress bounds: 0.0 <= p <= 1.0.
   - Wire serialization: 100% valid JSON and valid SSE framing without non-serializable types.
   - Adversarial PDF handling: missing files, 0-byte files, non-PDF junk files yield FAILED cleanly.
   - Fault-tolerance: handling failing pages gracefully with WARNING events without aborting stream.
   - Concurrency stress: multiple concurrent streaming sessions.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

import pytest

from src.agents import (
    AgentContext,
    AgentEventType,
    AgentID,
    AgentRegistry,
    CopilotJudgeAgent,
    OrchestratorAgent,
    ReconAgent,
)
from src.agents.base import BaseAgent
from src.agents.copilot_judge import bbox_from_geometry
from src.models.schemas import CopilotQueryRequest
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


async def _create_test_store(tmp_path: Path, db_name: str = "stress_test.sqlite3") -> TakeoffStore:
    store = TakeoffStore(db_path=tmp_path / db_name)
    await store.initialize()
    return store


# ===========================================================================
# 1. CITATION VALIDATION ADVERSARIAL STRESS SUITE
# ===========================================================================
class TestCitationValidationStress:
    """Adversarial stress testing of CopilotJudgeAgent.validate_citations."""

    def test_clean_process_import_src_agents(self) -> None:
        """Adversarial test: verify that importing src.agents in an isolated Python process does not fail."""
        res = subprocess.run(
            [sys.executable, "-c", "import sys; from src.agents import CopilotJudgeAgent"],
            check=False,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, f"Clean import failed with circular import: {res.stderr}"

    def test_fabricated_uuid_flood_100_percent_stripped(self) -> None:
        """Pass 100 fabricated UUIDs and random tokens; verify ZERO hallucinated coordinates."""
        copilot = CopilotJudgeAgent()
        valid_item = TakeoffRecord(
            item_id="item-ground-truth-001",
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="SupplyAir",
            dimension_label="VAV-01",
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [250.0, 350.0]},
            confidence=1.0,
            review_required=False,
        )

        sheet_meta = {"width_pt": 1200.0, "height_pt": 900.0}

        # Generate 100 random fabricated tokens with different prefixes
        fake_tokens = []
        for i in range(100):
            token_val = f"fake_{uuid.uuid4().hex}_{i}"
            tag_type = ["item", "evidence", "tag"][i % 3]
            fake_tokens.append(f"[{tag_type}:{token_val}]")

        # Intersperse fabricated tokens in arbitrary text
        adversarial_text = "Analysis start: " + " and then ".join(fake_tokens) + " End analysis."

        sanitized, coords, item_ids, warnings = copilot.validate_citations(
            text=adversarial_text,
            items=[valid_item],
            sheet_meta=sheet_meta,
        )

        # Invariant 1: Exactly 0 coordinates hallucinated
        assert len(coords) == 0, f"Expected 0 cited coordinates, got {len(coords)}: {coords}"

        # Invariant 2: Exactly 0 fabricated IDs in referenced_ids
        assert len(item_ids) == 0, f"Expected 0 referenced item IDs, got {len(item_ids)}: {item_ids}"

        # Invariant 3: Exactly 100 warnings generated (1 per fake token)
        assert len(warnings) == 100, f"Expected 100 warnings, got {len(warnings)}"

        # Invariant 4: All fake tokens replaced with [unverified:...]
        for fake in fake_tokens:
            assert fake not in sanitized, f"Fabricated token '{fake}' was not sanitized!"
        assert sanitized.count("[unverified:") == 100

    def test_mixed_valid_and_fabricated_corpus(self) -> None:
        """Verify that valid tokens are resolved accurately while fabricated tokens are stripped."""
        copilot = CopilotJudgeAgent()
        sheet_meta = {"width_pt": 1000.0, "height_pt": 800.0}

        # 5 legitimate items
        valid_items = [
            TakeoffRecord(
                item_id=f"valid-item-{i}",
                project_id="p1",
                sheet_id="s1",
                category="EQUIPMENT",
                system="Supply",
                dimension_label=f"VAV-0{i}",
                status="ACCEPTED",
                source="VECTOR_ENGINE",
                total_length_ft=0.0,
                count=1,
                geometry={"type": "point", "coordinates": [100.0 * (i + 1), 100.0 * (i + 1)]},
                confidence=1.0,
                review_required=False,
            )
            for i in range(5)
        ]

        # Interleave 5 valid tokens with 25 fabricated tokens
        tokens = []
        for i in range(5):
            tokens.append(f"[item:valid-item-{i}]")
            for j in range(5):
                tokens.append(f"[item:ghost-uuid-{i}-{j}-{uuid.uuid4().hex[:6]}]")

        raw_text = "Ledger items: " + ", ".join(tokens)

        _sanitized, coords, item_ids, warnings = copilot.validate_citations(
            text=raw_text,
            items=valid_items,
            sheet_meta=sheet_meta,
        )

        assert len(coords) == 5, f"Expected exactly 5 coordinates, got {len(coords)}"
        assert len(item_ids) == 5, f"Expected exactly 5 valid item IDs, got {len(item_ids)}"
        assert set(item_ids) == {f"valid-item-{i}" for i in range(5)}
        assert len(warnings) == 25, f"Expected 25 warnings for 25 ghost tokens, got {len(warnings)}"

    def test_deduplication_of_repeated_citations(self) -> None:
        """Verify that repeating the same citation 50 times yields only 1 coordinate and 1 ID."""
        copilot = CopilotJudgeAgent()
        item = TakeoffRecord(
            item_id="vav-singleton",
            project_id="p1",
            sheet_id="s1",
            category="EQUIPMENT",
            system="Supply",
            dimension_label="VAV-Singleton",
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [300.0, 400.0]},
            confidence=1.0,
            review_required=False,
        )
        sheet_meta = {"width_pt": 1000.0, "height_pt": 800.0}

        repeated_text = "Repeated: " + " ".join(["[item:vav-singleton]"] * 50)
        _sanitized, coords, item_ids, warnings = copilot.validate_citations(
            text=repeated_text,
            items=[item],
            sheet_meta=sheet_meta,
        )

        assert len(coords) == 1
        assert len(item_ids) == 1
        assert item_ids[0] == "vav-singleton"
        assert len(warnings) == 0

    def test_corrupted_and_out_of_bounds_geometries(self) -> None:
        """Verify robust fail-closed handling of malformed geometries without crashing."""
        copilot = CopilotJudgeAgent()
        sheet_meta = {"width_pt": 1000.0, "height_pt": 800.0}

        # Test bbox_from_geometry directly on None and primitives
        assert bbox_from_geometry(None) is None
        assert bbox_from_geometry("invalid_string") is None
        assert bbox_from_geometry(12345) is None

        test_cases: list[tuple[str, dict[str, Any] | list[Any], bool]] = [
            ("item-empty-dict", {}, False),
            ("item-empty-coords", {"type": "point", "coordinates": []}, False),
            ("item-non-finite", {"type": "point", "coordinates": [float("inf"), 200.0]}, False),
            ("item-out-of-bounds-negative", {"type": "point", "coordinates": [-500.0, -500.0]}, False),
            ("item-out-of-bounds-far", {"type": "point", "coordinates": [99999.0, 99999.0]}, False),
            ("item-valid", {"type": "point", "coordinates": [500.0, 400.0]}, True),
        ]

        items = [
            TakeoffRecord(
                item_id=item_id,
                project_id="p1",
                sheet_id="s1",
                category="EQUIPMENT",
                system="Supply",
                dimension_label=item_id,
                status="ACCEPTED",
                source="VECTOR_ENGINE",
                total_length_ft=0.0,
                count=1,
                geometry=geom,
                confidence=1.0,
                review_required=False,
            )
            for item_id, geom, _ in test_cases
        ]

        text = " ".join(f"[item:{item_id}]" for item_id, _, _ in test_cases)
        _sanitized, coords, item_ids, _warnings = copilot.validate_citations(
            text=text,
            items=items,
            sheet_meta=sheet_meta,
        )

        # Only 'item-valid' should yield coordinates and referenced_ids
        assert len(coords) == 1, f"Expected only 1 valid clamped coordinate, got {len(coords)}"
        assert item_ids == ["item-valid"], f"Expected only ['item-valid'], got {item_ids}"

    def test_malformed_syntax_and_special_characters(self) -> None:
        """Verify regex does not catastrophic backtrack or crash on unusual syntax."""
        copilot = CopilotJudgeAgent()
        # Edge cases: nested brackets, quotes, punctuation, injection patterns
        adversarial_inputs = [
            "[[item:valid]]",
            "[item:]",
            "[item: ]",
            "[item:'; DROP TABLE items; --]",
            "[tag:hello:world:foo]",
            "[evidence:ev_scale_123.456-789]",
            "[" * 500 + "item:deep" + "]" * 500,
            "[unknown_type:foo_bar]",
        ]

        for raw_in in adversarial_inputs:
            # Must complete without exception and return a tuple
            sanitized, coords, item_ids, _warnings = copilot.validate_citations(
                text=raw_in,
                items=[],
                sheet_meta={"width_pt": 1000.0, "height_pt": 800.0},
            )
            assert isinstance(sanitized, str)
            assert len(coords) == 0
            assert len(item_ids) == 0


# ===========================================================================
# 2. MISSING DATA DISCLOSURE STRESS SUITE
# ===========================================================================
class TestMissingDataDisclosureStress:
    """Stress testing of fail-closed missing data disclosures and unverified scale handling."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("scale_status", "scale_ratio", "scale_raw"),
        [
            ("UNVERIFIED", None, "UNVERIFIED"),
            ("UNVERIFIED", 48.0, '1/4"=1\'-0"'),  # unverified status overrides ratio
            ("VERIFIED", 0.0, '1/4"=1\'-0"'),  # 0.0 ratio overrides VERIFIED status!
            ("VERIFIED", -48.0, '1/4"=1\'-0"'),  # negative ratio
            ("CONFLICT", None, "CONFLICT (1/4 vs 1/8)"),
            ("NTS", None, "N.T.S."),
            ("REVIEW_REQUIRED", None, "None detected"),
        ],
    )
    async def test_offline_queries_on_unverified_scale_strictly_disclose(
        self,
        tmp_path: Path,
        scale_status: str,
        scale_ratio: float | None,
        scale_raw: str,
    ) -> None:
        """Every linear footage or ductwork query on an unverified sheet MUST disclose scale status."""
        store = await _create_test_store(tmp_path, f"store_{scale_status}_{scale_ratio}.sqlite3")
        sheet_id = f"sheet_{scale_status}_{abs(int(scale_ratio or 0))}"
        await store.insert_sheet(
            sheet_id=sheet_id,
            project_id="proj_disclosure",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Duct Plan",
            discipline="MECHANICAL",
            scale_status=scale_status,
            scale_ratio=scale_ratio,
            scale_raw=scale_raw,
            width_pt=1000.0,
            height_pt=800.0,
            pdf_path="dummy.pdf",
        )

        copilot = CopilotJudgeAgent(store=store)

        test_queries = [
            "What is the total duct length on this sheet?",
            "How many linear feet of supply air duct are installed?",
            "Calculate linear footage of piping.",
        ]

        for query in test_queries:
            req = CopilotQueryRequest(sheet_id=sheet_id, query=query)
            res = await copilot.answer_query(req, use_tools=False)

            assert res.scale_verified is False, f"scale_verified should be False for {scale_status}/{scale_ratio}"
            ans_upper = res.answer.upper()
            assert "UNVERIFIED" in ans_upper, f"Answer missing 'UNVERIFIED' disclosure in query: '{query}'"
            assert "CANNOT BE CALCULATED" in ans_upper or "REVIEW REQUIRED" in ans_upper or "FAIL-CLOSED" in ans_upper

    @pytest.mark.asyncio
    async def test_missing_equipment_query_returns_zero_without_hallucinations(self, tmp_path: Path) -> None:
        """When 0 equipment exists in ledger, copilot must state 0 and cite 0 coordinates."""
        store = await _create_test_store(tmp_path, "store_empty_eq.sqlite3")
        sheet_id = "sheet_no_eq"
        await store.insert_sheet(
            sheet_id=sheet_id,
            project_id="proj_empty",
            page_index=0,
            sheet_number="M-102",
            sheet_title="Mechanical Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            scale_raw='1/4"=1\'-0"',
            width_pt=1000.0,
            height_pt=800.0,
            pdf_path="dummy.pdf",
        )

        copilot = CopilotJudgeAgent(store=store)
        req = CopilotQueryRequest(sheet_id=sheet_id, query="Where are the exhaust fans and VAV boxes?")
        res = await copilot.answer_query(req, use_tools=False)

        assert "Found 0 scheduled equipment instances" in res.answer
        assert len(res.cited_coordinates) == 0
        assert len(res.referenced_item_ids) == 0

    def test_apply_missing_data_disclosure_idempotence(self) -> None:
        """Applying missing data disclosure repeatedly must not duplicate text."""
        copilot = CopilotJudgeAgent()
        sheet_meta = {"scale_raw": "None detected", "scale_status": "UNVERIFIED"}
        base_answer = "Total duct length is uncalculated."

        step1 = copilot.apply_missing_data_disclosure(
            text=base_answer,
            sheet_id="s_idem",
            sheet_meta=sheet_meta,
            scale_verified=False,
        )
        step2 = copilot.apply_missing_data_disclosure(
            text=step1,
            sheet_id="s_idem",
            sheet_meta=sheet_meta,
            scale_verified=False,
        )
        assert step1 == step2, "Disclosure was redundantly applied in step2"


# ===========================================================================
# 3. ORCHESTRATOR SSE STREAMING ROBUSTNESS SUITE
# ===========================================================================
class FailingReconMockAgent(BaseAgent):
    agent_id = AgentID.AGENT_01_RECON.value
    agent_name = "Failing Recon Agent"

    async def recon_sheet(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("Simulated Recon VLM timeout / network fault")

    async def run(self, context: AgentContext, **kwargs: Any) -> Any:
        raise RuntimeError("Simulated Recon VLM timeout / network fault")


class TestOrchestratorStreamingStress:
    """Stress testing of OrchestratorAgent.orchestrate_stream SSE event generation."""

    @pytest.mark.asyncio
    async def test_streaming_event_ordering_and_monotonic_progress(self, tmp_path: Path) -> None:
        """Verify strict ordering and non-decreasing progress on a multi-page PDF package."""
        pdf_fixture = Path("fixtures/mechanical/sample_mechanical_p1_p3.pdf")
        if not pdf_fixture.is_file():
            import pymupdf

            pdf_fixture = tmp_path / "synthetic_3page.pdf"
            doc = pymupdf.open()
            for i in range(3):
                page = doc.new_page(width=792, height=612)
                page.insert_text((72, 72), f"SHEET M-10{i + 1}\nSCALE: 1/4\" = 1'-0\"")
            doc.save(str(pdf_fixture))
            doc.close()
        assert pdf_fixture.is_file(), f"Fixture {pdf_fixture} missing"

        store = await _create_test_store(tmp_path, "store_stream.sqlite3")
        registry = AgentRegistry()
        recon = ReconAgent()
        registry.register(recon)

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="stress_proj",
            job_id="stress_job_001",
            pdf_path=pdf_fixture,
        )

        events = []
        progress_history = []
        async for event in orch.orchestrate_stream(context):
            events.append(event)
            progress_history.append(event.progress)

        # Ordering invariant:
        # First event MUST be STARTED
        assert events[0].event_type == AgentEventType.STARTED
        assert events[0].progress == 0.0

        # Second event MUST be SHEET_DISCOVERED
        assert events[1].event_type == AgentEventType.SHEET_DISCOVERED
        total_pages = events[1].payload.get("total_pages")
        assert total_pages == 3, f"Expected 3 pages in sample_mechanical_p1_p3.pdf, got {total_pages}"

        # Middle events MUST be SHEET_CLASSIFIED or WARNING
        for ev in events[2:-1]:
            assert ev.event_type in (AgentEventType.SHEET_CLASSIFIED, AgentEventType.WARNING)

        # Final event MUST be COMPLETED
        assert events[-1].event_type == AgentEventType.COMPLETED
        assert events[-1].progress == 1.0

        # Progress monotonicity invariant: progress must never decrease
        for idx in range(1, len(progress_history)):
            assert progress_history[idx] >= progress_history[idx - 1], (
                f"Progress regressed from {progress_history[idx-1]} to {progress_history[idx]} at step {idx}"
            )

    @pytest.mark.asyncio
    async def test_sse_wire_json_serialization_integrity(self, tmp_path: Path) -> None:
        """Verify 100% of streamed events serialize to valid JSON without non-standard types."""
        pdf_fixture = Path("fixtures/mechanical/avexis_page_22.pdf")
        assert pdf_fixture.is_file()

        store = await _create_test_store(tmp_path, "store_sse.sqlite3")
        orch = OrchestratorAgent(store=store)
        context = AgentContext(project_id="p_sse", job_id="j_sse", pdf_path=pdf_fixture)

        async for event in orch.orchestrate_stream(context):
            # Test model_dump_json()
            json_str = event.model_dump_json()
            assert isinstance(json_str, str)

            # Test deserialization
            parsed = json.loads(json_str)
            assert parsed["job_id"] == "j_sse"
            assert parsed["agent_id"] == AgentID.AGENT_00_ORCHESTRATOR.value
            assert "event_type" in parsed
            assert "progress" in parsed

            # Test SSE wire framing
            sse_frame = f"event: {event.event_type.value}\ndata: {json_str}\n\n"
            assert sse_frame.startswith("event: ")
            assert sse_frame.endswith("\n\n")

    @pytest.mark.asyncio
    async def test_adversarial_pdf_inputs_yield_clean_failed_event(self, tmp_path: Path) -> None:
        """Verify corrupt, empty, or non-existent PDFs do not crash, but yield FAILED events."""
        orch = OrchestratorAgent()

        # Case 1: Non-existent PDF file
        missing_path = tmp_path / "does_not_exist.pdf"
        ctx1 = AgentContext(project_id="p_fail", job_id="j_fail1", pdf_path=missing_path)
        events1 = [ev async for ev in orch.orchestrate_stream(ctx1)]
        assert len(events1) == 2
        assert events1[0].event_type == AgentEventType.STARTED
        assert events1[1].event_type == AgentEventType.FAILED
        assert "does_not_exist" in events1[1].message or "Could not open" in events1[1].message

        # Case 2: 0-byte file
        empty_path = tmp_path / "zero_bytes.pdf"
        empty_path.write_bytes(b"")
        ctx2 = AgentContext(project_id="p_fail", job_id="j_fail2", pdf_path=empty_path)
        events2 = [ev async for ev in orch.orchestrate_stream(ctx2)]
        assert len(events2) == 2
        assert events2[0].event_type == AgentEventType.STARTED
        assert events2[1].event_type == AgentEventType.FAILED

        # Case 3: Junk non-PDF text file
        junk_path = tmp_path / "garbage.pdf"
        junk_path.write_text("This is plain text pretending to be a drawing file.")
        ctx3 = AgentContext(project_id="p_fail", job_id="j_fail3", pdf_path=junk_path)
        events3 = [ev async for ev in orch.orchestrate_stream(ctx3)]
        assert len(events3) == 2
        assert events3[0].event_type == AgentEventType.STARTED
        assert events3[1].event_type == AgentEventType.FAILED

    @pytest.mark.asyncio
    async def test_fault_tolerant_recon_failure_emits_warning_and_continues(self, tmp_path: Path) -> None:
        """If ReconAgent throws an exception, Orchestrator emits WARNING and completes orchestration."""
        pdf_fixture = Path("fixtures/mechanical/avexis_page_22.pdf")
        assert pdf_fixture.is_file()

        registry = AgentRegistry()
        failing_recon = FailingReconMockAgent()
        registry.register(failing_recon)

        orch = OrchestratorAgent(registry=registry)
        context = AgentContext(project_id="p_recon_fail", job_id="j_recon_fail", pdf_path=pdf_fixture)

        events = [ev async for ev in orch.orchestrate_stream(context)]

        assert events[0].event_type == AgentEventType.STARTED
        assert events[1].event_type == AgentEventType.SHEET_DISCOVERED
        assert events[2].event_type == AgentEventType.WARNING
        assert "unreadable" in events[2].message or "Simulated Recon" in events[2].message
        assert events[-1].event_type == AgentEventType.COMPLETED
        assert events[-1].payload["unreadable_count"] == 1

    @pytest.mark.asyncio
    async def test_concurrent_streaming_stress(self, tmp_path: Path) -> None:
        """Run 5 concurrent streaming orchestration tasks to test race conditions and concurrency."""
        pdf_fixture = Path("fixtures/mechanical/avexis_page_22.pdf")
        assert pdf_fixture.is_file()
        store = await _create_test_store(tmp_path, "store_concurrent.sqlite3")
        orch = OrchestratorAgent(store=store)

        async def _run_stream(idx: int) -> list[AgentEventType]:
            ctx = AgentContext(project_id=f"p_{idx}", job_id=f"job_{idx}", pdf_path=pdf_fixture)
            return [ev.event_type async for ev in orch.orchestrate_stream(ctx)]

        tasks = [_run_stream(i) for i in range(5)]
        results = await asyncio.gather(*tasks)

        for res in results:
            assert res[0] == AgentEventType.STARTED
            assert res[-1] == AgentEventType.COMPLETED
