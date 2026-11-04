"""Comprehensive Milestone 2 Test Suite: Perception & Linework Tracing Agents.

Covers:
- Product Agent 02 (Finder L1 Symbols): legend exemplar extraction, sliding-window tiling,
  vector prefiltering, candidate discovery & un-tiling, NMS suppression, SAM 3.1 mask refinement,
  independent verifier pass demotion, zero-legend fallback flag, and fail-closed SUGGESTED status.
- Product Agent 03 (Tracer L2 Linework): deterministic vector tracing via PyMuPDF linework,
  topology continuity graph, fail-closed scale lock to 0.0, Spark semantic labeling,
  ambiguous junction splitting into sub-segments, stream flag emission, and raster PDF fallback.
- Product Agent 00 (Orchestrator M2 Integration): multi-agent dispatch on SheetType.PLAN,
  AgentRegistry alias resolution, fail-closed gate interception, atomic TakeoffStore persistence,
  anti-redundancy check on zero items, subagent flag relaying, and SSE lifecycle event streaming.
- End-to-End Fixture Verification: live evaluation on real PDF fixtures (hvac_plan_level2.pdf).
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pymupdf
import pytest

from src.agents import (
    AgentContext,
    AgentEventType,
    AgentRegistry,
    EvidenceIDGenerator,
    FinderL1Agent,
    OrchestratorAgent,
    ReconAgent,
    SheetType,
    TracerL2Agent,
)
from src.agents.base import AgentEvent
from src.agents.finder_l1 import FinderL1Result
from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import LegendScanResult, LegendSymbolEntry
from src.meta_services.tiling import SymbolCandidate, Tile
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


# ===========================================================================
# 1. Product Agent 02: Finder L1 Symbols Unit & Component Tests
# ===========================================================================
class TestFinderL1Symbols:
    """Unit and component tests for Agent 02 (Finder L1 Symbols)."""

    def test_finder_initialization_and_metadata(self) -> None:
        """Verify agent_id, agent_name, is_llm_agent, and default thresholds."""
        finder = FinderL1Agent()
        assert finder.agent_id in ("agent_02_finder_l1", "agent_02_finder")
        assert "Finder" in finder.agent_name
        assert finder.is_llm_agent is True
        assert finder.confidence_threshold >= 0.60
        assert finder.verifier_demote_factor < 1.0

    def test_legend_exemplar_extraction_offline_fallback(self) -> None:
        """Verify legend parsing extracts exemplar vocabulary, or falls back gracefully offline."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = False

        finder = FinderL1Agent(client=mock_client)
        res = finder.parse_legend_exemplars("fixtures/mechanical/hvac_plan_level2.pdf", page_index=0)
        assert isinstance(res, (LegendScanResult, list, dict))

    def test_tiling_vector_prefilter_skips_empty_tiles(self) -> None:
        """Verify that empty tiles with 0 text words and <3 vector segments are bypassed."""
        finder = FinderL1Agent()
        tiles = [
            Tile(col=0, row=0, x_offset_px=0, y_offset_px=0, status="CONTENT", word_count=15, segment_count=10),
            Tile(col=1, row=0, x_offset_px=819, y_offset_px=0, status="EMPTY", word_count=0, segment_count=1),
        ]
        active_tiles = finder.filter_tiles_for_inference(tiles)
        assert len(active_tiles) == 1
        assert active_tiles[0].status == "CONTENT"

    def test_candidate_discovery_untiling_coordinate_math(self) -> None:
        """Verify normalized tile coordinates [u1, v1, u2, v2] are correctly un-tiled to PDF points."""
        candidate = SymbolCandidate(
            symbol_label="FireDamper",
            tile_col=1,
            tile_row=0,
            x_offset_px=819,
            y_offset_px=0,
            tile_bbox=(100.0, 100.0, 200.0, 200.0),
            confidence=0.88,
        )
        finder = FinderL1Agent()
        bbox_pt = finder.untile_bbox(candidate)
        assert len(bbox_pt) == 4
        assert bbox_pt[0] > 0
        assert bbox_pt[2] > bbox_pt[0]
        assert bbox_pt[3] > bbox_pt[1]

    def test_nms_suppression_deduplicates_overlapping_candidates(self) -> None:
        """Verify non-maximum suppression suppresses duplicate boxes for same symbol above IoU 0.45."""
        finder = FinderL1Agent()
        candidates = [
            {"label": "VAV", "bbox_pt": (100.0, 100.0, 150.0, 150.0), "confidence": 0.95},
            {"label": "VAV", "bbox_pt": (102.0, 101.0, 151.0, 152.0), "confidence": 0.82},
            {"label": "VAV", "bbox_pt": (300.0, 300.0, 350.0, 350.0), "confidence": 0.90},
        ]
        kept = finder.apply_nms(candidates, iou_threshold=0.45)
        assert len(kept) == 2
        assert (kept[0]["confidence"] if isinstance(kept[0], dict) else kept[0].confidence) == 0.95
        assert (kept[1]["confidence"] if isinstance(kept[1], dict) else kept[1].confidence) == 0.90

    def test_sam_mask_refinement_mock(self) -> None:
        """Verify SAM 3.1 refines candidate bboxes and generates polygon masks for items."""
        mock_client = MagicMock()
        mock_client.is_configured.return_value = True
        mock_client.segment_concept.return_value = {
            "concept": "diffuser",
            "masks": [],
            "polygons": [[[100.0, 100.0], [160.0, 100.0], [160.0, 160.0], [100.0, 160.0]]],
            "confidence": 0.95,
        }
        finder = FinderL1Agent(client=mock_client)

        raw_candidate = {"label": "Diffuser", "bbox_pt": (100.0, 100.0, 160.0, 160.0), "confidence": 0.85}
        refined = finder.refine_with_sam(raw_candidate, image_crop_b64="dummy_b64")
        assert "geometry" in refined or "bbox_pt" in refined
        assert refined.get("sam_refined") is True
        assert "polygon" in refined

    def test_independent_verifier_pass_demotion_on_disagreement(self) -> None:
        """Rule 02: Second independent Spark call verifies crop; disagreement demotes confidence."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True

        finder = FinderL1Agent(client=mock_client)

        # Case A: Verifier agrees ("yes")
        finder._verify_crop = MagicMock(return_value={"verified": True, "confidence": 0.90})  # type: ignore[method-assign]
        res_agree = finder.run_verifier_pass({"label": "Damper", "confidence": 0.88, "crop_b64": "b64"})
        assert res_agree["confidence"] >= 0.88
        assert res_agree["review_required"] is True

        # Case B: Verifier disagrees ("no")
        finder._verify_crop = MagicMock(return_value={"verified": False, "confidence": 0.20})  # type: ignore[method-assign]
        res_disagree = finder.run_verifier_pass({"label": "Damper", "confidence": 0.88, "crop_b64": "b64"})
        assert res_disagree["confidence"] < 0.60
        assert res_disagree.get("verifier_disagreed") is True
        assert res_disagree["review_required"] is True

    def test_fail_closed_suggested_status_and_evidence_id_minting(self) -> None:
        """Verify all emitted items land in SUGGESTED status with minted evidence IDs and clamped bboxes."""
        finder = FinderL1Agent()
        ev_gen = EvidenceIDGenerator(project_id="test_proj")
        sheet_meta = SheetMetadata(
            sheet_id="m_101",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        raw_symbols = [
            {"label": "VAV Box", "category": "EQUIPMENT", "system": "SupplyAir", "bbox_pt": (50.0, 60.0, 90.0, 100.0), "confidence": 0.91}
        ]
        records = finder.to_takeoff_records(raw_symbols, sheet_meta, ev_gen)
        assert len(records) == 1
        rec = records[0]
        assert rec.status == "SUGGESTED"
        assert rec.review_required is True
        assert rec.item_id.startswith("ev_item_m_101_")
        assert isinstance(rec.geometry, dict)
        assert rec.geometry["type"] == "bbox"
        assert rec.total_length_ft == 0.0

    @pytest.mark.asyncio
    async def test_finder_run_stream_integrated_vlm_swarm_sam_and_verifier(self, tmp_path: Path) -> None:
        """Finding 05: Verify run_stream() integrates candidate discovery, SAM refinement, and verifier demotion."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True

        mock_client.segment_concept.return_value = {
            "concept": "FireDamper",
            "masks": [],
            "polygons": [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]],
            "confidence": 0.95,
        }

        def mock_governed_completion(model: str, messages: list[dict[str, Any]], profile: Any, **kwargs: Any) -> tuple[str, dict[str, Any]]:
            msg_str = str(messages)
            # Route on execution profile only: tile prompts legitimately mention exemplar glyphs,
            # so substring routing misroutes tile inference into the verifier branch.
            if profile.name == "hover_ocr":
                if "diffuser" in msg_str.lower():
                    # Disagreement on diffuser -> demote confidence to 0.20
                    return json.dumps({"match": False, "confidence": 0.20}), {"mock": True, "truncated": False}
                # Agreement on fire damper
                return json.dumps({"match": True, "confidence": 0.92}), {"mock": True, "truncated": False}
            # Tile candidate detection
            return json.dumps({
                "detections": [
                    {"symbol_label": "FireDamper", "tile_bbox": [100.0, 100.0, 200.0, 200.0], "confidence": 0.88},
                    {"symbol_label": "Diffuser", "tile_bbox": [300.0, 300.0, 400.0, 400.0], "confidence": 0.82},
                ]
            }), {"mock": True, "truncated": False}

        mock_client._execute_governed_completion.side_effect = mock_governed_completion

        finder = FinderL1Agent(client=mock_client)

        pdf_path = tmp_path / "plan_symbols_test.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=1000, height=800)
        page.insert_text((150, 150), "HVAC Supply Air Plan M-101")
        page.draw_rect(pymupdf.Rect(100, 100, 300, 300))
        page.draw_rect(pymupdf.Rect(300, 300, 500, 500))
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(
            project_id="test_proj_finder",
            job_id="job_finder_001",
            pdf_path=pdf_path,
        )

        exemplars = [
            LegendSymbolEntry(
                symbol_id="sym_fd",
                label="FireDamper",
                description="Fire Damper",
                system="SupplyAir",
                confidence=0.90,
                exemplar_crop_base64="ZHVtbXk=",
            ),
            LegendSymbolEntry(
                symbol_id="sym_diff",
                label="Diffuser",
                description="Diffuser",
                system="SupplyAir",
                confidence=0.85,
                exemplar_crop_base64="ZHVtbXk=",
            ),
        ]

        events: list[AgentEvent] = []
        async for ev in finder.run_stream(context, page_index=0, legend_crops=exemplars):
            events.append(ev)

        event_types = [e.event_type for e in events]
        assert AgentEventType.STARTED in event_types
        assert AgentEventType.ITEMS_EMITTED in event_types
        assert AgentEventType.COMPLETED in event_types

        items_event = next(e for e in events if e.event_type == AgentEventType.ITEMS_EMITTED)
        emitted_raw = items_event.payload.get("items", [])
        assert len(emitted_raw) >= 2

        # 1. FireDamper retained confidence and attached polygon mask
        fd_items = [it for it in emitted_raw if it.get("dimension_label") == "FireDamper" or it.get("label") == "FireDamper"]
        assert len(fd_items) >= 1
        fd = fd_items[0]
        assert "polygon" in fd.get("geometry", {}) or fd.get("sam_refined") is True
        assert fd.get("confidence", 0.0) >= 0.80

        # 2. Diffuser received verifier disagreement demotion to 0.20
        diff_items = [it for it in emitted_raw if it.get("dimension_label") == "Diffuser" or it.get("label") == "Diffuser"]
        assert len(diff_items) >= 1
        diff = diff_items[0]
        assert diff.get("confidence", 1.0) == 0.20 or diff.get("confidence", 1.0) <= 0.25
        assert diff.get("review_required") is True

    @pytest.mark.asyncio
    async def test_finder_run_integrated_full_execution_loop(self, tmp_path: Path) -> None:
        """Verify synchronous FinderL1Agent.run() aggregates items, counts, and flags from run_stream."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client.segment_concept.return_value = {
            "concept": "FireDamper",
            "masks": [],
            "polygons": [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]],
            "confidence": 0.95,
        }

        def mock_governed_completion(model: str, messages: list[dict[str, Any]], profile: Any, **kwargs: Any) -> tuple[str, dict[str, Any]]:
            # Route on execution profile only: tile prompts legitimately mention exemplar glyphs,
            # so substring routing misroutes tile inference into the verifier branch.
            if profile.name == "hover_ocr":
                return json.dumps({"match": True, "confidence": 0.90}), {"mock": True, "truncated": False}
            return json.dumps({
                "detections": [
                    {"symbol_label": "FireDamper", "tile_bbox": [100.0, 100.0, 200.0, 200.0], "confidence": 0.88},
                ]
            }), {"mock": True, "truncated": False}

        mock_client._execute_governed_completion.side_effect = mock_governed_completion

        pdf_path = tmp_path / "plan_single_symbol.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=1000, height=800)
        page.insert_text((150, 150), "HVAC Plan")
        page.draw_rect(pymupdf.Rect(100, 100, 300, 300))
        doc.save(str(pdf_path))
        doc.close()

        finder = FinderL1Agent(client=mock_client)
        context = AgentContext(project_id="p1", job_id="j1", pdf_path=pdf_path)
        exemplars = [
            LegendSymbolEntry(
                symbol_id="sym_fd",
                label="FireDamper",
                description="Fire Damper",
                system="SupplyAir",
                confidence=0.90,
                exemplar_crop_base64="ZHVtbXk=",
            )
        ]

        res = await finder.run(context, page_index=0, legend_crops=exemplars)
        assert isinstance(res, FinderL1Result)
        assert res.success is True
        assert len(res.items) >= 1
        assert res.symbol_counts.get("FireDamper", 0) >= 1
        assert all(it.status == "SUGGESTED" for it in res.items)
        assert all(it.review_required is True for it in res.items)

    @pytest.mark.asyncio
    async def test_finder_zero_legend_fallback_raises_flag(self, tmp_path: Path) -> None:
        """Finding 03: When zero legend exemplars are found, emit FLAG_RAISED with NO_LEGEND_FOUND."""
        finder = FinderL1Agent()
        pdf_path = tmp_path / "plan_no_legend.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=1000, height=800)
        page.insert_text((100, 100), "Plan without legend")
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(project_id="p_no_legend", job_id="j_no_legend", pdf_path=pdf_path)

        events: list[AgentEvent] = []
        async for ev in finder.run_stream(context, page_index=0, legend_crops=[]):
            events.append(ev)

        flag_events = [e for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert len(flag_events) > 0
        flag_payload = flag_events[0].payload
        assert flag_payload.get("type") == "NO_LEGEND_FOUND" or flag_payload.get("flag_type") == "NO_LEGEND_FOUND" or "NO_LEGEND" in str(flag_payload)

        res = await finder.run(context, page_index=0, legend_crops=[])
        assert res.review_required is True
        assert len(res.items) == 0
        assert any(
            f.get("type") == "NO_LEGEND_FOUND" or f.get("flag_type") == "NO_LEGEND_FOUND" or "NO_LEGEND" in str(f)
            for f in res.flags
        )


    @pytest.mark.asyncio
    async def test_finder_swarm_total_failure_raises_flag(self, tmp_path: Path) -> None:
        """Swarm tile failures on every tile must raise FLAG_RAISED, never silently emit 0 items."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_client._execute_governed_completion.side_effect = RuntimeError("VLM down")

        finder = FinderL1Agent(client=mock_client)
        pdf_path = tmp_path / "plan_swarm_fail.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=1000, height=800)
        page.insert_text((150, 150), "HVAC Plan")
        page.draw_rect(pymupdf.Rect(100, 100, 300, 300))
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(project_id="p_swarm_fail", job_id="j_swarm_fail", pdf_path=pdf_path)
        exemplars = [
            LegendSymbolEntry(
                symbol_id="sym_fd",
                label="FireDamper",
                description="Fire Damper",
                system="SupplyAir",
                confidence=0.90,
                exemplar_crop_base64="ZHVtbXk=",
            )
        ]

        events: list[AgentEvent] = []
        async for ev in finder.run_stream(context, page_index=0, legend_crops=exemplars):
            events.append(ev)

        flag_events = [e for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert any(f.payload.get("type") == "SWARM_INFERENCE_FAILED" for f in flag_events)
        items_event = next(e for e in events if e.event_type == AgentEventType.ITEMS_EMITTED)
        assert items_event.payload.get("items", []) == []

    @pytest.mark.asyncio
    async def test_finder_swarm_crash_raises_flag(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A run_swarm() crash must raise FLAG_RAISED with 0 fabricated items."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True

        async def _boom(**kwargs: Any) -> list[dict[str, Any]]:
            raise RuntimeError("swarm crashed")

        monkeypatch.setattr("src.agents.finder_l1.run_swarm", _boom)

        finder = FinderL1Agent(client=mock_client)
        pdf_path = tmp_path / "plan_swarm_crash.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=1000, height=800)
        page.insert_text((150, 150), "HVAC Plan")
        page.draw_rect(pymupdf.Rect(100, 100, 300, 300))
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(project_id="p_swarm_crash", job_id="j_swarm_crash", pdf_path=pdf_path)
        exemplars = [
            LegendSymbolEntry(
                symbol_id="sym_fd",
                label="FireDamper",
                description="Fire Damper",
                system="SupplyAir",
                confidence=0.90,
                exemplar_crop_base64="ZHVtbXk=",
            )
        ]

        events: list[AgentEvent] = []
        async for ev in finder.run_stream(context, page_index=0, legend_crops=exemplars):
            events.append(ev)

        flag_events = [e for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert any(f.payload.get("type") == "SWARM_INFERENCE_FAILED" for f in flag_events)
        items_event = next(e for e in events if e.event_type == AgentEventType.ITEMS_EMITTED)
        assert items_event.payload.get("items", []) == []

    @pytest.mark.asyncio
    async def test_finder_blank_sheet_no_false_offline_flag(self, tmp_path: Path) -> None:
        """Configured client + zero content tiles completes with 0 items and no offline flag."""
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True

        finder = FinderL1Agent(client=mock_client)
        pdf_path = tmp_path / "plan_blank.pdf"
        doc = pymupdf.open()
        doc.new_page(width=1000, height=800)
        doc.save(str(pdf_path))
        doc.close()

        # Premise: a blank page yields zero content tiles.
        blank_doc = pymupdf.open(str(pdf_path))
        try:
            blank_tiles = finder.tiler.tile_sheet(blank_doc[0])
        finally:
            blank_doc.close()
        assert finder.filter_tiles_for_inference(blank_tiles) == []

        context = AgentContext(project_id="p_blank", job_id="j_blank", pdf_path=pdf_path)
        exemplars = [
            LegendSymbolEntry(
                symbol_id="sym_fd",
                label="FireDamper",
                description="Fire Damper",
                system="SupplyAir",
                confidence=0.90,
                exemplar_crop_base64="ZHVtbXk=",
            )
        ]

        events: list[AgentEvent] = []
        async for ev in finder.run_stream(context, page_index=0, legend_crops=exemplars):
            events.append(ev)

        event_types = [e.event_type for e in events]
        assert AgentEventType.ITEMS_EMITTED in event_types
        assert AgentEventType.COMPLETED in event_types
        flag_types = [e.payload.get("type") for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert "MODEL_API_NOT_CONFIGURED" not in flag_types
        items_event = next(e for e in events if e.event_type == AgentEventType.ITEMS_EMITTED)
        assert items_event.payload.get("items", []) == []
# ===========================================================================
# 2. Product Agent 03: Tracer L2 Linework Unit & Component Tests
# ===========================================================================
class TestTracerL2Linework:
    """Unit and component tests for Agent 03 (Tracer L2 Linework Runs)."""

    def test_batch_semantic_labeling_matches_nearby_page_text(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        agent = TracerL2Agent()
        pdf_path = tmp_path / "semantic-labels.pdf"
        doc = pymupdf.open()
        page = doc.new_page(width=400, height=300)
        page.insert_text((100, 100), "SA 12x8")
        doc.save(pdf_path)
        doc.close()

        get_text = pymupdf.Page.get_text
        word_reads: list[object] = []

        def track_word_reads(page: pymupdf.Page, option: str, *args: object, **kwargs: object):
            if option == "words":
                word_reads.append(kwargs.get("clip"))
            return get_text(page, option, *args, **kwargs)

        monkeypatch.setattr(pymupdf.Page, "get_text", track_word_reads)

        runs = [
            {"run_id": "run-1", "polyline": [[105.0, 105.0], [130.0, 105.0]]},
            {"run_id": "run-2", "polyline": [[350.0, 250.0], [370.0, 250.0]]},
        ]
        labeled = agent._label_runs_from_pdf(pdf_path, 0, runs)

        assert labeled[0]["system"] == "SupplyAir"
        assert labeled[0]["dimension_label"] == "12x8"
        assert "system" not in labeled[1]
        assert labeled[0]["polyline"] == runs[0]["polyline"]
        assert word_reads == [None]

    def test_tracer_initialization_and_metadata(self) -> None:
        """Verify agent_id, agent_name, is_llm_agent is False (deterministic code traces)."""
        tracer = TracerL2Agent()
        assert tracer.agent_id in ("agent_03_tracer_l2", "agent_03_tracer")
        assert "Tracer" in tracer.agent_name
        assert tracer.use_topology is True

    def test_empty_topology_on_unscaled_vector_plan_retries_review_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Keep vector evidence visible when topology finds no runs; never infer scale."""
        topology_result = {
            "raw_segment_count": 12,
            "filtered_count": 8,
            "results": [],
            "scale_status": "SCALE_UNREADABLE",
            "drawing_type": "PLAN_VIEW_UNSCALED",
        }
        fallback_result = {
            "raw_segment_count": 12,
            "filtered_count": 8,
            "results": [{"polyline": [[10.0, 20.0], [30.0, 20.0]], "geometric_length_pt": 20.0}],
        }
        responses = iter([topology_result, fallback_result])
        calls: list[dict[str, Any]] = []

        def fake_pipeline(**kwargs: Any) -> dict[str, Any]:
            calls.append(kwargs)
            return next(responses)

        monkeypatch.setattr("src.agents.tracer_l2.run_l2_pipeline", fake_pipeline)
        runs = TracerL2Agent().extract_linework_runs("fixture.pdf", use_topology=True)

        assert len(runs) == 1
        assert runs[0]["polyline"] == [[10.0, 20.0], [30.0, 20.0]]
        assert "TOPOLOGY_EMPTY_FALLBACK" in runs[0]["uncertainty_codes"]
        assert runs[0]["continuity_status"] == "REVIEW_REQUIRED"
        assert calls[0]["use_topology"] is True
        assert calls[1]["use_topology"] is False
        assert calls[1]["use_centerline"] is False

    def test_dense_page_uses_review_required_vector_fallback(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        """Avoid multi-minute topology on a huge vector page without dropping geometry."""
        monkeypatch.setattr(
            "src.agents.tracer_l2._page_drawing_object_count",
            lambda _path, _page: 100_000,
        )
        calls: list[dict[str, Any]] = []

        def fake_pipeline(**kwargs: Any) -> dict[str, Any]:
            calls.append(kwargs)
            return {
                "raw_segment_count": 108_767,
                "filtered_count": 655,
                "scale_status": "VALID",
                "drawing_type": "PLAN_VIEW",
                "results": [
                    {
                        "polyline": [[10.0, 20.0], [30.0, 20.0]],
                        "geometric_length_pt": 20.0,
                    }
                ],
            }

        monkeypatch.setattr("src.agents.tracer_l2.run_l2_pipeline", fake_pipeline)
        runs = TracerL2Agent().extract_linework_runs(tmp_path / "dense.pdf", use_topology=True)

        assert len(runs) == 1
        assert runs[0]["uncertainty_codes"] == ["TOPOLOGY_DENSITY_FALLBACK"]
        assert runs[0]["continuity_status"] == "REVIEW_REQUIRED"
        assert calls[0]["use_topology"] is False
        assert calls[0]["use_centerline"] is False

    def test_deterministic_linework_extraction_on_vector_fixture(self) -> None:
        """Verify native PyMuPDF linework extraction traces physical vector segments."""
        tracer = TracerL2Agent()
        context = AgentContext(
            project_id="test_proj",
            job_id="job_001",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )
        sheet_meta = SheetMetadata(
            sheet_id="hvac_plan_level2",
            page_index=0,
            sheet_number="M-22",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        runs = tracer.extract_linework_runs(context.pdf_path, page_index=0, sheet_metadata=sheet_meta)
        assert len(runs) > 0
        assert all("polyline" in r or "points" in r.get("geometry", {}) for r in runs)

    def test_fail_closed_scale_lock_zero_footage_on_unverified_scale(self) -> None:
        """Rule 01: When ScaleStatus is UNVERIFIED/CONFLICT, footage MUST be 0.0 with review_required=True."""
        tracer = TracerL2Agent()
        sheet_unverified = SheetMetadata(
            sheet_id="m_101",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            scale_ratio=None,
            width_pt=1000.0,
            height_pt=800.0,
        )

        raw_runs = [
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100, 100], [200, 100]], "length_pt": 100.0}
        ]
        records = tracer.to_takeoff_records(raw_runs, sheet_unverified, EvidenceIDGenerator())
        assert len(records) == 1
        assert records[0].total_length_ft == 0.0
        assert records[0].review_required is True
        assert isinstance(records[0].geometry, dict)
        assert records[0].geometry["points"] == [[100, 100], [200, 100]]

    def test_verified_scale_calculates_exact_physical_length(self) -> None:
        """When ScaleStatus is VERIFIED, footage is computed deterministically from scale ratio."""
        tracer = TracerL2Agent()
        sheet_verified = SheetMetadata(
            sheet_id="m_101",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        raw_runs = [
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100, 100], [172, 100]], "length_pt": 72.0}
        ]
        records = tracer.to_takeoff_records(raw_runs, sheet_verified, EvidenceIDGenerator())
        assert len(records) == 1
        assert pytest.approx(records[0].total_length_ft, rel=1e-2) == 4.0

    def test_spark_semantic_labeling_never_mutates_geometry(self) -> None:
        """Invariant: Semantic labeling assigns system/type/size without altering vector coordinates."""
        tracer = TracerL2Agent()
        original_poly = [[150.0, 200.0], [300.0, 200.0], [300.0, 450.0]]
        run = {
            "category": "DUCTWORK",
            "system": "Unknown",
            "dimension_label": "Unknown",
            "geometry": {"type": "polyline", "points": [p[:] for p in original_poly]},
        }

        labeled_run = tracer.label_run_semantics(run, nearby_text="16x12 SA-1")
        assert labeled_run["system"] in ("SupplyAir", "Supply")
        assert "16x12" in labeled_run["dimension_label"]
        assert labeled_run["geometry"]["points"] == original_poly

    def test_ambiguous_junction_splitting(self) -> None:
        """Finding 02: Ambiguous crossing junctions must be split into sub-segments rather than passed unbroken."""
        tracer = TracerL2Agent()
        crossing_paths = [
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100.0, 200.0], [300.0, 200.0]], "length_pt": 200.0},
            {"category": "DUCTWORK", "system": "ReturnAir", "polyline": [[200.0, 100.0], [200.0, 300.0]], "length_pt": 200.0},
        ]
        split_runs, flags = tracer.resolve_junction_topology(crossing_paths)

        # Invariant: Each crossing line is divided at intersection (200, 200) into 2 sub-segments -> 4 total split runs
        assert len(split_runs) == 4, f"Expected 4 split sub-segments, got {len(split_runs)}"
        assert len(flags) > 0
        assert any(f.get("type") == "AMBIGUOUS_JUNCTION_SPLIT" or f.get("flag_type") == "AMBIGUOUS_JUNCTION_SPLIT" for f in flags)

        original_polys = [p["polyline"] for p in crossing_paths]
        for sr in split_runs:
            sr_poly = sr.get("polyline") or sr.get("geometry", {}).get("points")
            assert sr_poly not in original_polys, "Crossing path was not split at intersection point"
            assert sr.get("continuity_status") == "REVIEW_REQUIRED" or sr.get("review_required") is True

    def test_tee_junction_splitting(self) -> None:
        """Tee-junctions where a branch endpoint touches a trunk interior must split the trunk."""
        tracer = TracerL2Agent()
        tee_paths = [
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100.0, 200.0], [300.0, 200.0]], "length_pt": 200.0},
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[200.0, 200.0], [200.0, 300.0]], "length_pt": 100.0},
        ]
        split_runs, flags = tracer.resolve_junction_topology(tee_paths)

        # Trunk (2 segments) + branch (1 segment) = 3 segments
        assert len(split_runs) == 3, f"Expected 3 segments after tee-junction split, got {len(split_runs)}"
        assert len(flags) == 1
        assert flags[0]["type"] == "AMBIGUOUS_JUNCTION_SPLIT"
        assert flags[0].get("junction_subtype") == "TEE"

    @pytest.mark.asyncio
    async def test_tracer_run_stream_crossing_junction_emits_split_items_and_flags(self, tmp_path: Path) -> None:
        """Finding 02 & 05: Verify tracer.run_stream() invokes resolve_junction_topology and yields FLAG_RAISED."""
        tracer = TracerL2Agent()
        pdf_path = tmp_path / "crossing_runs.pdf"
        doc = pymupdf.open()
        doc.new_page(width=1000, height=800)
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(
            project_id="test_tracer_cross",
            job_id="job_cross_001",
            pdf_path=pdf_path,
        )
        sheet_meta = SheetMetadata(
            sheet_id="m_cross",
            page_index=0,
            sheet_number="M-201",
            sheet_title="HVAC Duct Crossing",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        tracer.extract_linework_runs = MagicMock(return_value=[  # type: ignore[method-assign]
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100.0, 200.0], [300.0, 200.0]], "length_pt": 200.0},
            {"category": "DUCTWORK", "system": "ReturnAir", "polyline": [[200.0, 100.0], [200.0, 300.0]], "length_pt": 200.0},
        ])

        events: list[AgentEvent] = []
        async for ev in tracer.run_stream(context, page_index=0, sheet_metadata=sheet_meta):
            events.append(ev)

        event_types = [e.event_type for e in events]
        assert AgentEventType.FLAG_RAISED in event_types, "Tracer stream must emit FLAG_RAISED on ambiguous crossing junction"
        assert AgentEventType.ITEMS_EMITTED in event_types

        flag_ev = next(e for e in events if e.event_type == AgentEventType.FLAG_RAISED)
        payload = flag_ev.payload
        assert payload.get("type") == "AMBIGUOUS_JUNCTION_SPLIT" or payload.get("flag_type") == "AMBIGUOUS_JUNCTION_SPLIT"

        items_ev = next(e for e in events if e.event_type == AgentEventType.ITEMS_EMITTED)
        items = items_ev.payload.get("items", [])
        assert len(items) == 4, f"Expected 4 split items in stream, got {len(items)}"
        assert all(it.get("status") == "SUGGESTED" for it in items)
        assert all(it.get("review_required") is True for it in items)

    @pytest.mark.asyncio
    async def test_tracer_run_integrated_crossing_junction(self, tmp_path: Path) -> None:
        """Verify synchronous tracer.run() collects AMBIGUOUS_JUNCTION_SPLIT flags and split items."""
        tracer = TracerL2Agent()
        pdf_path = tmp_path / "crossing_sync.pdf"
        doc = pymupdf.open()
        doc.new_page(width=1000, height=800)
        doc.save(str(pdf_path))
        doc.close()

        context = AgentContext(project_id="p_sync", job_id="j_sync", pdf_path=pdf_path)
        sheet_meta = SheetMetadata(
            sheet_id="m_sync",
            page_index=0,
            sheet_number="M-202",
            sheet_title="HVAC Sync Crossing",
            discipline="MECHANICAL",
            scale_status="VERIFIED",
            scale_ratio=48.0,
            width_pt=1000.0,
            height_pt=800.0,
        )

        tracer.extract_linework_runs = MagicMock(return_value=[  # type: ignore[method-assign]
            {"category": "DUCTWORK", "system": "SupplyAir", "polyline": [[100.0, 200.0], [300.0, 200.0]], "length_pt": 200.0},
            {"category": "DUCTWORK", "system": "ReturnAir", "polyline": [[200.0, 100.0], [200.0, 300.0]], "length_pt": 200.0},
        ])

        res = await tracer.run(context, page_index=0, sheet_metadata=sheet_meta)
        assert res.success is True
        assert len(res.flags) > 0
        assert any(f.get("type") == "AMBIGUOUS_JUNCTION_SPLIT" or f.get("flag_type") == "AMBIGUOUS_JUNCTION_SPLIT" for f in res.flags)
        assert len(res.items) == 4
        assert res.review_required is True

    def test_scanned_pdf_raster_fallback(self, tmp_path: Path) -> None:
        """When PDF has 0 vector segments, tracer returns empty linework and does not crash."""
        pdf_path = tmp_path / "raster_only.pdf"
        doc = pymupdf.open()
        doc.new_page(width=1000, height=800)
        doc.save(str(pdf_path))
        doc.close()

        tracer = TracerL2Agent()
        sheet_meta = SheetMetadata(
            sheet_id="r1",
            page_index=0,
            sheet_number="R-1",
            sheet_title="Scanned Sheet",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            width_pt=1000.0,
            height_pt=800.0,
        )
        res = tracer.extract_linework_runs(pdf_path, page_index=0, sheet_metadata=sheet_meta)
        assert len(res) == 0


# ===========================================================================
# 3. Product Agent 00: Orchestrator M2 Integration Tests
# ===========================================================================
class TestOrchestratorM2Integration:
    """Integration tests for Orchestrator dispatching Agent 02 & Agent 03."""

    def test_agent_registry_bidirectional_aliasing(self) -> None:
        """Verify AgentRegistry resolves both agent_02_finder and agent_02_finder_l1."""
        registry = AgentRegistry()
        finder = FinderL1Agent()
        tracer = TracerL2Agent()

        registry.register(finder)
        registry.register(tracer)

        assert registry.get("agent_02_finder") is not None
        assert registry.get("agent_02_finder_l1") is not None
        assert registry.get("agent_03_tracer") is not None
        assert registry.get("agent_03_tracer_l2") is not None

    @pytest.mark.asyncio
    async def test_orchestrator_dispatches_finder_and_tracer_on_plan_sheet(self, tmp_path: Path) -> None:
        """Verify orchestrate_stream dispatches both Finder and Tracer on SheetType.PLAN."""
        store = TakeoffStore(db_path=tmp_path / "test_m2.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        recon = ReconAgent()
        finder = FinderL1Agent()
        tracer = TracerL2Agent()
        registry.register(recon)
        registry.register(finder)
        registry.register(tracer)

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_proj",
            job_id="job_m2_001",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        events = []
        async for ev in orch.orchestrate_stream(context):
            events.append(ev)

        event_types = [e.event_type for e in events]
        assert AgentEventType.STARTED in event_types
        assert AgentEventType.SHEET_DISCOVERED in event_types
        assert AgentEventType.SHEET_CLASSIFIED in event_types
        assert AgentEventType.AGENT_DISPATCHED in event_types
        assert AgentEventType.ITEMS_EMITTED in event_types
        assert AgentEventType.AGENT_COMPLETED in event_types
        assert AgentEventType.COMPLETED in event_types

        dispatched_agents = [
            e.payload.get("target_agent") for e in events if e.event_type == AgentEventType.AGENT_DISPATCHED
        ]
        assert any("finder" in str(a) for a in dispatched_agents)
        assert any("tracer" in str(a) for a in dispatched_agents)

    @pytest.mark.asyncio
    async def test_orchestrator_persists_items_atomically_to_store(self, tmp_path: Path) -> None:
        """Verify items emitted by Finder and Tracer are persisted in SQLite takeoff_items table."""
        store = TakeoffStore(db_path=tmp_path / "test_m2_store.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        registry.register(ReconAgent())
        registry.register(FinderL1Agent())
        registry.register(TracerL2Agent())

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_proj",
            job_id="job_m2_002",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        async for _ in orch.orchestrate_stream(context):
            pass

        items = await store.list_items(project_id="test_proj")
        assert len(items) > 0
        categories = {it.category for it in items}
        assert "DUCTWORK" in categories or "PIPING" in categories or "EQUIPMENT" in categories
        assert all(it.status == "SUGGESTED" for it in items)
        assert all(it.review_required is True for it in items)

    @pytest.mark.asyncio
    async def test_orchestrator_enforces_scale_gate_on_tracer_runs(self) -> None:
        """Verify orchestrator locks tracer items to 0.0 footage if sheet recon reported UNVERIFIED."""
        orch = OrchestratorAgent()
        sheet_unverified = SheetMetadata(
            sheet_id="s_bad_scale",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            scale_ratio=None,
            width_pt=1000.0,
            height_pt=800.0,
        )

        raw_linear_item = TakeoffRecord(
            item_id="run-1",
            project_id="p1",
            sheet_id="s_bad_scale",
            category="DUCTWORK",
            system="SupplyAir",
            dimension_label='12x10" Supply',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=50.0,
            count=1,
            geometry={"type": "polyline", "points": [[100, 100], [200, 100]]},
            confidence=0.9,
            review_required=False,
        )

        sanitized, flags = orch.enforce_fail_closed_gates(sheet_unverified, [raw_linear_item])
        assert len(sanitized) == 1
        assert sanitized[0].total_length_ft == 0.0
        assert sanitized[0].review_required is True
        assert len(flags) == 1
        assert flags[0]["type"] == "SCALE_UNVERIFIED_LINEAR_LOCKED"

    def test_orchestrator_groups_scale_gate_warning_per_sheet(self) -> None:
        orch = OrchestratorAgent()
        sheet = SheetMetadata(
            sheet_id="s_bad_scale",
            page_index=0,
            sheet_number="M-101",
            sheet_title="HVAC Plan",
            discipline="MECHANICAL",
            scale_status="UNVERIFIED",
            scale_ratio=None,
            width_pt=1000.0,
            height_pt=800.0,
        )
        template = TakeoffRecord(
            item_id="run-1",
            project_id="p1",
            sheet_id="s_bad_scale",
            category="DUCTWORK",
            system="SupplyAir",
            dimension_label='12x10" Supply',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=50.0,
            count=1,
            geometry={"type": "polyline", "points": [[100, 100], [200, 100]]},
            confidence=0.9,
            review_required=False,
        )
        items = [template.model_copy(update={"item_id": f"run-{i}"}) for i in (1, 2)]
        items.append(template.model_copy(update={"item_id": "run-no-geometry", "geometry": {}}))

        sanitized, flags = orch.enforce_fail_closed_gates(sheet, items)

        assert len(sanitized) == 2
        assert all(item.total_length_ft == 0.0 and item.review_required for item in sanitized)
        assert len(flags) == 2
        scale_flag = next(flag for flag in flags if flag["type"] == "SCALE_UNVERIFIED_LINEAR_LOCKED")
        assert scale_flag["item_count"] == 2
        assert scale_flag["item_ids"] == ["run-1", "run-2"]
        assert any(flag["type"] == "MISSING_EVIDENCE_GEOMETRY" for flag in flags)

    @pytest.mark.asyncio
    async def test_orchestrator_handles_missing_agent_without_failing(self, tmp_path: Path) -> None:
        """When only Finder L1 is registered, Orchestrator warns and continues without crashing."""
        store = TakeoffStore(db_path=tmp_path / "test_m2_partial.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        registry.register(ReconAgent())
        registry.register(FinderL1Agent())

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_proj",
            job_id="job_m2_003",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        events = []
        async for ev in orch.orchestrate_stream(context):
            events.append(ev)

        assert any(e.event_type == AgentEventType.WARNING for e in events)
        assert events[-1].event_type == AgentEventType.COMPLETED

    @pytest.mark.asyncio
    async def test_orchestrator_does_not_redundantly_rerun_agent_on_zero_items(self, tmp_path: Path) -> None:
        """Finding 04: When run_stream() completes yielding 0 items, orchestrator must NOT call agent.run() redundantly."""
        store = TakeoffStore(db_path=tmp_path / "test_no_duplicate.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        recon = ReconAgent()
        registry.register(recon)

        mock_finder = MagicMock(spec=FinderL1Agent)
        mock_finder.agent_id = "agent_02_finder_l1"
        mock_finder.agent_name = "Product Agent 02 (Finder L1 Symbols)"
        mock_finder.is_llm_agent = True

        async def empty_stream(*args: Any, **kwargs: Any) -> AsyncGenerator[AgentEvent, None]:
            yield AgentEvent(job_id="j1", agent_id="agent_02_finder_l1", event_type=AgentEventType.STARTED, progress=0.0)
            yield AgentEvent(job_id="j1", agent_id="agent_02_finder_l1", event_type=AgentEventType.ITEMS_EMITTED, payload={"items": []}, progress=0.9)
            yield AgentEvent(job_id="j1", agent_id="agent_02_finder_l1", event_type=AgentEventType.COMPLETED, payload={"items_count": 0}, progress=1.0)

        mock_finder.run_stream.side_effect = empty_stream
        registry.register(mock_finder)

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_no_dup",
            job_id="job_no_dup_001",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        async for _ in orch.orchestrate_stream(context):
            pass

        mock_finder.run.assert_not_called()

    @pytest.mark.asyncio
    async def test_orchestrator_relays_flags_from_subagents(self, tmp_path: Path) -> None:
        """Verify that FLAG_RAISED events emitted by subagents (e.g. NO_LEGEND_FOUND) are relayed in orchestrator stream."""
        store = TakeoffStore(db_path=tmp_path / "test_flags.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        registry.register(ReconAgent())

        mock_finder = MagicMock(spec=FinderL1Agent)
        mock_finder.agent_id = "agent_02_finder_l1"
        mock_finder.agent_name = "Product Agent 02 (Finder L1 Symbols)"
        mock_finder.is_llm_agent = True

        async def flag_stream(*args: Any, **kwargs: Any) -> AsyncGenerator[AgentEvent, None]:
            yield AgentEvent(job_id="j2", agent_id="agent_02_finder_l1", event_type=AgentEventType.STARTED, progress=0.0)
            yield AgentEvent(
                job_id="j2",
                agent_id="agent_02_finder_l1",
                event_type=AgentEventType.FLAG_RAISED,
                payload={"type": "NO_LEGEND_FOUND", "message": "No legend exemplars found on sheet."},
                progress=0.3,
            )
            yield AgentEvent(job_id="j2", agent_id="agent_02_finder_l1", event_type=AgentEventType.COMPLETED, payload={"items_count": 0}, progress=1.0)

        mock_finder.run_stream.side_effect = flag_stream
        registry.register(mock_finder)

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="test_flag_relay",
            job_id="job_flag_002",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        events: list[AgentEvent] = []
        async for ev in orch.orchestrate_stream(context):
            events.append(ev)

        relayed_flags = [e for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert len(relayed_flags) > 0
        assert any("NO_LEGEND" in str(e.payload) for e in relayed_flags)


# ===========================================================================
# 4. End-to-End Real Fixture Verification Tests
# ===========================================================================
class TestEndToEndRealFixture:
    """Full vertical pipeline execution against verified drawing fixtures."""

    @pytest.mark.asyncio
    async def test_e2e_hvac_plan_level2_takeoff(self, tmp_path: Path) -> None:
        """Execute end-to-end multi-agent pipeline on hvac_plan_level2.pdf."""
        store = TakeoffStore(db_path=tmp_path / "e2e_hvac.sqlite3")
        await store.initialize()

        registry = AgentRegistry()
        registry.register(ReconAgent())
        registry.register(FinderL1Agent())
        registry.register(TracerL2Agent())

        orch = OrchestratorAgent(registry=registry, store=store)
        context = AgentContext(
            project_id="proj_hvac",
            job_id="job_hvac_01",
            pdf_path=Path("fixtures/mechanical/hvac_plan_level2.pdf"),
        )

        events: list[AgentEvent] = []
        async for ev in orch.orchestrate_stream(context):
            events.append(ev)

        res = await orch.run(context)
        assert res.success is True
        assert res.document_map is not None
        assert len(res.document_map.sheets) == 1
        assert res.document_map.routes[0].sheet_type == SheetType.PLAN

        items = await store.list_items(project_id="proj_hvac")
        # Tracer extracts > 300 physical vector duct runs
        assert len(items) >= 300, f"Expected >= 300 duct runs from vector engine, got {len(items)}"
        assert all(it.status == "SUGGESTED" for it in items)
        assert all(it.review_required is True for it in items)

        # On hvac_plan_level2 (which has no legend), Finder must have emitted NO_LEGEND_FOUND flag
        all_flags = res.flags + [e.payload for e in events if e.event_type == AgentEventType.FLAG_RAISED]
        assert any("NO_LEGEND" in str(f) for f in all_flags), "Expected NO_LEGEND_FOUND flag on legendless sheet"

        summary = await store.get_ledger_summary(project_id="proj_hvac")
        assert len(summary) > 0
