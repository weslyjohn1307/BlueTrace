"""Fail-Closed Scale Invariant & Dimension Authenticity Test Suite.

Verifies:
1. Sheets lacking explicit scale calibration or having ambiguous/conflicting scales
   strictly fail closed: review_required = True and scale_ratio = 0.0 (or None).
2. Endpoints and linework operations reject uncalibrated calculations without
   silently defaulting to standard scales (e.g. 1/8" or 1/4").
3. Verified calibrated sheets compute dimensions tracing directly to
   Euclidean vector coordinates and exact linear algebra without hallucination.
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.agents.base import EvidenceIDGenerator
from src.agents.tracer_l2 import TracerL2Agent
from src.api.main import app
from src.api.routes import set_takeoff_store
from src.core_vector.scale import detect_scale
from src.core_vector.scale_validator import ScaleValidator
from src.core_vector.schema import ScaleReasonCode, ScaleStatus
from src.models.schemas import SheetMetadata
from src.store.takeoff_store import TakeoffRecord, TakeoffStore, pipeline_results_to_records


# =============================================================================
# 1. Scale Detection & Gating Fail-Closed Invariants
# =============================================================================
class TestScaleDetectionFailClosed:
    """Adversarial stress-testing of core_vector.scale.detect_scale."""

    def test_empty_page_text_fails_closed(self) -> None:
        """Page text with zero scale information must fail-closed to SCALE_UNREADABLE."""
        decision = detect_scale(page_text="", sheet_id="M-101", filename="plan.pdf")
        assert decision.status == ScaleStatus.SCALE_UNREADABLE
        assert decision.scale_text is None
        assert decision.ft_per_pt is None
        assert decision.m_per_pt is None
        assert decision.reason_code == ScaleStatus.SCALE_UNREADABLE.value

    def test_conflicting_scales_on_same_sheet_fails_closed(self) -> None:
        """Multiple conflicting scale annotations on a single sheet must fail-closed."""
        # e.g., Title block says 1/4" = 1'-0" but detail notes say 1/8" = 1'-0"
        conflicting_text = (
            'PROJECT TITLE: ACME TOWER\n'
            'SHEET TITLE: MECHANICAL FIRST FLOOR PLAN\n'
            'SCALE: 1/4" = 1\'-0"\n'
            'DETAIL A SCALE: 1/8" = 1\'-0"\n'
        )
        decision = detect_scale(page_text=conflicting_text, sheet_id="M-101", filename="plan.pdf")
        assert decision.status == ScaleStatus.SCALE_UNREADABLE
        assert decision.scale_text is None
        assert decision.ft_per_pt is None
        assert decision.m_per_pt is None
        assert decision.reason_code == ScaleReasonCode.SCALE_CONFLICT.value

    def test_conflicting_scales_3_16_and_1_2_fails_closed(self) -> None:
        """Another conflict pair (3/16" and 1/2") must trigger SCALE_CONFLICT."""
        text = 'SCALE: 3/16" = 1\'-0"\nNOTE: SECTION B IS 1/2" = 1\'-0"\n'
        decision = detect_scale(page_text=text, sheet_id="M-102", filename="plan.pdf")
        assert decision.status == ScaleStatus.SCALE_UNREADABLE
        assert decision.scale_text is None
        assert decision.reason_code == ScaleReasonCode.SCALE_CONFLICT.value

    def test_nts_keywords_strictly_fail_closed(self) -> None:
        """NTS, NOT TO SCALE, and SCALE: N/A must fail-closed."""
        nts_samples = [
            "SCALE: N.T.S.",
            "SCALE: NTS",
            "DRAWING NOT TO SCALE",
            "SCALE: N/A",
        ]
        for s in nts_samples:
            decision = detect_scale(page_text=s, sheet_id="M-103", filename="plan.pdf")
            assert decision.status == ScaleStatus.NOT_TO_SCALE
            assert decision.scale_text is None
            assert decision.ft_per_pt is None
            assert decision.m_per_pt is None

    def test_unsupported_scale_format_strictly_fails_closed(self) -> None:
        """SCALE: AS NOTED, SCALE: VARIES, SCALE: AS INDICATED must fail closed."""
        unsupported_samples = [
            "SCALE: AS NOTED",
            "SCALE: VARIES",
            "SCALE: AS INDICATED",
        ]
        for s in unsupported_samples:
            decision = detect_scale(page_text=s, sheet_id="M-104", filename="plan.pdf")
            assert decision.status == ScaleStatus.SCALE_UNREADABLE
            assert decision.scale_text is None
            assert decision.reason_code == ScaleReasonCode.UNSUPPORTED_SCALE_FORMAT.value

    def test_schematic_and_riser_diagrams_fail_closed(self) -> None:
        """Schematic, P&ID, and Riser drawings must fail closed to non-VALID."""
        riser_text = "RISER DIAGRAM - DOMESTIC WATER"
        dec_riser = detect_scale(page_text=riser_text, sheet_id="P-501", filename="riser.pdf")
        assert dec_riser.status == ScaleStatus.SCHEMATIC_RISER
        assert dec_riser.ft_per_pt is None

        pid_text = "PIPING AND INSTRUMENTATION DIAGRAM (P&ID)"
        dec_pid = detect_scale(page_text=pid_text, sheet_id="M-701", filename="pid.pdf")
        assert dec_pid.status == ScaleStatus.PID_DIAGRAM
        assert dec_pid.ft_per_pt is None

        # Sheet ID pattern for risers (P6xx, PP6xx)
        dec_id = detect_scale(page_text="FLOOR PLAN", sheet_id="P601", filename="plan.pdf")
        assert dec_id.status == ScaleStatus.SCHEMATIC_RISER

    def test_filename_never_leaks_as_scale_evidence(self) -> None:
        """A scale string in a filename must NOT validate a sheet lacking text scale (L2-06)."""
        decision = detect_scale(
            page_text="GENERAL FLOOR PLAN NO SCALE",
            sheet_id="M-105",
            filename='M-105_scale_quarter_inch_1_4_1-0.pdf',
        )
        assert decision.status != ScaleStatus.VALID
        assert decision.scale_text is None


# =============================================================================
# 2. ScaleValidator Parsing & Calibration Boundaries
# =============================================================================
class TestScaleValidatorAdversarial:
    """Stress tests for ScaleValidator parser, points_to_feet, and calculate_scale_ratio."""

    @pytest.mark.parametrize(
        ("scale_str", "expected_ratio"),
        [
            ('1/8" = 1\'-0"', 96.0),
            ('3/16" = 1\'-0"', 64.0),
            ('1/4" = 1\'-0"', 48.0),
            ('3/8" = 1\'-0"', 32.0),
            ('1/2" = 1\'-0"', 24.0),
            ('3/4" = 1\'-0"', 16.0),
            ('1" = 1\'-0"', 12.0),
            ('1-1/2" = 1\'-0"', 8.0),
            ('3" = 1\'-0"', 4.0),
            ("1:50", 50.0),
            ("1:100", 100.0),
            ("1:200", 200.0),
        ],
    )
    def test_standard_scales_parse_verified(self, scale_str: str, expected_ratio: float) -> None:
        ratio, status = ScaleValidator.parse_scale_string(scale_str)
        assert status == "VERIFIED"
        assert ratio == pytest.approx(expected_ratio)

    def test_half_inch_negative_lookbehind_no_collision(self) -> None:
        """1-1/2" must not falsely trigger 1/2" pattern."""
        ratio, status = ScaleValidator.parse_scale_string('1-1/2" = 1\'-0"')
        assert status == "VERIFIED"
        assert ratio == 8.0

    def test_conflicting_strings_return_unverified(self) -> None:
        cand = 'SCALE: 1/4" = 1\'-0" OR 1/8" = 1\'-0"'
        ratio, status = ScaleValidator.parse_scale_string(cand)
        assert status == "UNVERIFIED"
        assert ratio is None

    def test_garbage_returns_unverified(self) -> None:
        garbage_samples = [
            "",
            "   ",
            "SCALE: NONE",
            "DIMENSIONS IN FEET",
            "123456",
            "SCALE: 1/5\" = 1'-0\"",  # non-standard fraction
        ]
        for g in garbage_samples:
            ratio, status = ScaleValidator.parse_scale_string(g)
            assert status == "UNVERIFIED"
            assert ratio is None

    def test_points_to_feet_rejects_none_and_nonpositive(self) -> None:
        """points_to_feet must return (None, False) for None, 0, or negative ratio."""
        assert ScaleValidator.points_to_feet(72.0, None) == (None, False)
        assert ScaleValidator.points_to_feet(72.0, 0.0) == (None, False)
        assert ScaleValidator.points_to_feet(72.0, -48.0) == (None, False)

    def test_calculate_scale_ratio_short_line_raises(self) -> None:
        """A paper calibration line shorter than 5 pt must raise ValueError."""
        with pytest.raises(ValueError, match="too short"):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [2.0, 2.0], real_ft=10.0)

    def test_calculate_scale_ratio_nonpositive_distance_raises(self) -> None:
        """Zero or negative real distance must raise ValueError."""
        with pytest.raises(ValueError, match="positive"):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [50.0, 0.0], real_ft=0.0, real_in=0.0)

        with pytest.raises(ValueError, match=">= 0"):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [50.0, 0.0], real_ft=-5.0, real_in=0.0)

        with pytest.raises(ValueError, match="0 <= real_in < 12"):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [50.0, 0.0], real_ft=5.0, real_in=12.5)

    def test_calculate_scale_ratio_non_finite_points_raises(self) -> None:
        """NaN or Inf coordinates must raise ValueError."""
        with pytest.raises(ValueError, match="finite"):
            ScaleValidator.calculate_scale_ratio([float("nan"), 0.0], [50.0, 0.0], real_ft=10.0)

        with pytest.raises(ValueError, match="finite"):
            ScaleValidator.calculate_scale_ratio([0.0, 0.0], [float("inf"), 0.0], real_ft=10.0)

    def test_calculate_scale_ratio_exact_math(self) -> None:
        """Verify ratio = (real_ft * 12 + real_in) * 72 / length_pt."""
        # 1/4" = 1'-0": 1 foot in reality is 1/4 inch on paper = 18 pt.
        # For a 10 ft line on paper: length_pt = 10 * 18 = 180 pt.
        ratio = ScaleValidator.calculate_scale_ratio([0.0, 0.0], [180.0, 0.0], real_ft=10.0, real_in=0.0)
        # Expected ratio: (10 * 12) * 72 / 180 = 120 * 72 / 180 = 48.0
        assert ratio == pytest.approx(48.0)

        # Snap to architectural string
        label = ScaleValidator.derive_architectural_scale_string(ratio)
        assert label == '1/4" = 1\'-0"'


# =============================================================================
# 3. Vector Geometry Math & Dimension Authenticity
# =============================================================================
class TestVectorDimensionAuthenticity:
    """Empirical verification that computed dimensions trace strictly to Euclidean coordinates."""

    def test_euclidean_pythagorean_distance_tracing(self) -> None:
        """Right-triangle 30-40-50 pt vector path must trace to exact footage."""
        # 3-4-5 triangle scaled by 10: (0,0) to (30, 40) -> hypot = 50.0 pt.
        hypot_pt = math.hypot(30.0, 40.0)
        assert hypot_pt == pytest.approx(50.0)

        # For 1/4" = 1'-0" (ratio = 48.0):
        # real_in = (50.0 / 72.0) * 48.0 = 33.3333 inches.
        # real_ft = 33.3333 / 12.0 = 2.7777... ft -> round(2.78)
        feet, valid = ScaleValidator.points_to_feet(hypot_pt, 48.0)
        assert valid is True
        assert feet == 2.78

    def test_manhattan_multisegment_route_exact_math(self) -> None:
        """Manhattan route (0,0) -> (72, 0) -> (72, 144) -> (216, 144) = 360.0 pt."""
        points = [[0.0, 0.0], [72.0, 0.0], [72.0, 144.0], [216.0, 144.0]]
        total_pt = 0.0
        for i in range(len(points) - 1):
            total_pt += math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
        assert total_pt == pytest.approx(360.0)

        # At 1/8" = 1'-0" (ratio = 96.0):
        # total_ft = 360.0 * 96.0 / 864.0 = 40.0 ft exact.
        feet, valid = ScaleValidator.points_to_feet(total_pt, 96.0)
        assert valid is True
        assert feet == 40.0

    def test_pipeline_results_to_records_unverified_scale_locks_zero_footage(self) -> None:
        """If sheet_scale_status is UNVERIFIED, total_length_ft MUST be 0.0 and review_required=True."""
        pipeline_output = {
            "scale_status": "VALID",  # Even if pipeline claims VALID, sheet is UNVERIFIED!
            "results": [
                {
                    "object_id": "duct-1",
                    "object_type": "duct",
                    "location_or_path": {"points": [[0.0, 0.0], [72.0, 0.0]]},
                    "geometric_length_pt": 72.0,
                    "length": 2.4384,
                    "length_unit": "m",
                }
            ],
        }

        records = pipeline_results_to_records(
            pipeline_output,
            project_id="proj_test",
            sheet_id="sheet_unverified",
            sheet_scale_status="UNVERIFIED",
        )
        assert len(records) == 1
        rec = records[0]
        assert rec.status == "SUGGESTED"
        assert rec.total_length_ft == 0.0
        assert rec.review_required is True

    def test_pipeline_results_to_records_conflict_scale_locks_zero_footage(self) -> None:
        """If sheet_scale_status is CONFLICT, total_length_ft MUST be 0.0 and review_required=True."""
        pipeline_output = {
            "scale_status": "VALID",
            "results": [
                {
                    "object_id": "duct-2",
                    "object_type": "duct",
                    "location_or_path": {"points": [[0.0, 0.0], [144.0, 0.0]]},
                    "geometric_length_pt": 144.0,
                    "length": 4.8768,
                    "length_unit": "m",
                }
            ],
        }

        records = pipeline_results_to_records(
            pipeline_output,
            project_id="proj_test",
            sheet_id="sheet_conflict",
            sheet_scale_status="CONFLICT",
        )
        assert len(records) == 1
        assert records[0].status == "SUGGESTED"
        assert records[0].total_length_ft == 0.0
        assert records[0].review_required is True

    def test_pipeline_results_to_records_verified_scale_accepts_measured_footage(self) -> None:
        """When sheet is VERIFIED and pipeline scale is VALID, records are ACCEPTED with exact footage."""
        # 144 pt at 1/4" scale = 16.0 ft = 4.8768 m.
        length_m = 4.8768
        pipeline_output = {
            "scale_status": "VALID",
            "results": [
                {
                    "object_id": "duct-3",
                    "object_type": "duct",
                    "location_or_path": {"points": [[0.0, 0.0], [144.0, 0.0]]},
                    "geometric_length_pt": 144.0,
                    "length": length_m,
                    "length_unit": "m",
                }
            ],
        }

        records = pipeline_results_to_records(
            pipeline_output,
            project_id="proj_test",
            sheet_id="sheet_verified",
            sheet_scale_status="VERIFIED",
        )
        assert len(records) == 1
        rec = records[0]
        assert rec.status == "ACCEPTED"
        # 4.8768 / 0.3048 = 16.0 ft exactly
        assert rec.total_length_ft == pytest.approx(16.0, rel=1e-3)
        assert rec.review_required is False

    def test_tracer_agent_locks_zero_footage_on_uncalibrated_sheet(self) -> None:
        """TracerL2Agent.to_takeoff_records must lock total_length_ft = 0.0 when scale is uncalibrated."""
        tracer = TracerL2Agent()
        ev_gen = EvidenceIDGenerator(project_id="proj_tracer")
        sheet_meta = SheetMetadata(
            sheet_id="M-101",
            page_index=0,
            sheet_number="M-101",
            sheet_title="First Floor Plan",
            discipline="MECHANICAL",
            scale_raw=None,
            scale_ratio=None,
            scale_status="UNVERIFIED",
            width_pt=792.0,
            height_pt=612.0,
        )
        raw_runs = [
            {
                "run_id": "run-1",
                "object_type": "duct",
                "polyline": [[0.0, 0.0], [100.0, 0.0]],
                "length_pt": 100.0,
            }
        ]

        records = tracer.to_takeoff_records(raw_runs, sheet_meta, ev_gen)
        assert len(records) == 1
        assert records[0].total_length_ft == 0.0
        assert records[0].review_required is True


# =============================================================================
# 4. Store Gating, Calibration & Acceptance State Machine
# =============================================================================
class TestStoreCalibrationAndReviewGating:
    """Stress tests on TakeoffStore calibration recalculation and status transitions."""

    @pytest.mark.asyncio
    async def test_acceptance_forbidden_on_unverified_scale_sheet(self, tmp_path: Path) -> None:
        """Attempting to transition an item to ACCEPTED on an UNVERIFIED sheet must raise ValueError."""
        store = TakeoffStore(tmp_path / "test_store.db")
        await store.initialize()

        # Seed project and unverified sheet
        await store.insert_sheet(
            sheet_id="s_unverified",
            project_id="p1",
            page_index=0,
            sheet_number="M-01",
            sheet_title="Mechanical Plan",
            discipline="MECHANICAL",
            scale_raw=None,
            scale_ratio=None,
            scale_status="UNVERIFIED",
            width_pt=792.0,
            height_pt=612.0,
        )

        item = TakeoffRecord(
            item_id="item-test-1",
            project_id="p1",
            sheet_id="s_unverified",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='12"x12"',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=0.0,
            count=1,
            review_required=True,
        )
        await store.add_takeoff_item(item)

        # Attempt to ACCEPT
        with pytest.raises(ValueError, match="UNVERIFIED"):
            await store.update_item_status("item-test-1", "ACCEPTED", action="USER_REVIEW")

    @pytest.mark.asyncio
    async def test_apply_sheet_calibration_recalculates_vector_items_and_demotes_to_suggested(
        self, tmp_path: Path
    ) -> None:
        """apply_sheet_calibration must recompute footage, demote to SUGGESTED, and log audit event."""
        store = TakeoffStore(tmp_path / "test_cal.db")
        await store.initialize()

        await store.insert_sheet(
            sheet_id="s_cal",
            project_id="p1",
            page_index=0,
            sheet_number="M-02",
            sheet_title="Mechanical Plan",
            discipline="MECHANICAL",
            scale_raw=None,
            scale_ratio=None,
            scale_status="UNVERIFIED",
            width_pt=792.0,
            height_pt=612.0,
        )

        # Vector item with 216 pt length
        # At ratio 48.0 (1/4" = 1'-0"): 216 * 48 / 864 = 12.0 ft
        geom = {"type": "polyline", "points": [[0.0, 0.0], [216.0, 0.0]], "geometric_length_pt": 216.0}
        item = TakeoffRecord(
            item_id="vec-1",
            project_id="p1",
            sheet_id="s_cal",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='16"x10"',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=0.0,
            count=1,
            geometry=geom,
            review_required=True,
        )
        await store.add_takeoff_item(item)

        updated, skipped = await store.apply_sheet_calibration("s_cal", scale_ratio=48.0, scale_raw='1/4" = 1\'-0"')
        assert updated == 1
        assert skipped == 0

        # Verify item was updated
        items = await store.list_items(sheet_id="s_cal")
        assert len(items) == 1
        updated_item = items[0]
        assert updated_item.total_length_ft == 12.0
        assert updated_item.status == "SUGGESTED"
        assert updated_item.review_required is True

        # Now that sheet is CALIBRATED, human acceptance is allowed
        success = await store.update_item_status("vec-1", "ACCEPTED", action="ONE_CLICK_ACCEPT")
        assert success is True
        items_after = await store.list_items(sheet_id="s_cal")
        assert items_after[0].status == "ACCEPTED"

    @pytest.mark.asyncio
    async def test_apply_sheet_calibration_rejects_non_positive_and_infinite_ratios(
        self, tmp_path: Path
    ) -> None:
        """apply_sheet_calibration must reject scale_ratio <= 0, NaN, or Inf."""
        store = TakeoffStore(tmp_path / "test_cal_err.db")
        await store.initialize()

        with pytest.raises(ValueError, match="positive"):
            await store.apply_sheet_calibration("s1", scale_ratio=0.0, scale_raw="0")

        with pytest.raises(ValueError, match="positive"):
            await store.apply_sheet_calibration("s1", scale_ratio=-48.0, scale_raw="neg")

        with pytest.raises(ValueError, match="positive"):
            await store.apply_sheet_calibration("s1", scale_ratio=float("nan"), scale_raw="nan")

        with pytest.raises(ValueError, match="positive"):
            await store.apply_sheet_calibration("s1", scale_ratio=float("inf"), scale_raw="inf")


# =============================================================================
# 5. API Endpoints Calibration & Rejection Integration
# =============================================================================
class TestApiEndpointsCalibrationAndRejection:
    """FastAPI TestClient integration verifying HTTP contract on scale operations."""

    @pytest.fixture
    def client(self, tmp_path: Path):
        db_path = tmp_path / "api_test.db"
        store = TakeoffStore(db_path)
        set_takeoff_store(store)
        import asyncio
        asyncio.run(store.initialize())
        # Seed test sheet
        asyncio.run(
            store.insert_sheet(
                sheet_id="api_sheet",
                project_id="api_proj",
                page_index=0,
                sheet_number="M-101",
                sheet_title="First Floor HVAC",
                discipline="MECHANICAL",
                scale_raw=None,
                scale_ratio=None,
                scale_status="UNVERIFIED",
                width_pt=792.0,
                height_pt=612.0,
            )
        )
        return TestClient(app)

    def test_api_calibration_short_line_returns_400(self, client: TestClient):
        """Line < 5 pt returns HTTP 400."""
        res = client.patch(
            "/api/sheets/api_sheet/calibration",
            json={
                "p1": [10.0, 10.0],
                "p2": [12.0, 12.0],  # hypot ~ 2.83 pt < 5 pt
                "real_ft": 10.0,
                "real_in": 0.0,
            },
        )
        assert res.status_code == 400
        assert "too short" in res.json()["detail"].lower()

    def test_api_calibration_zero_distance_returns_400(self, client: TestClient):
        """Real distance <= 0 returns HTTP 422 (or 400)."""
        res = client.patch(
            "/api/sheets/api_sheet/calibration",
            json={
                "p1": [0.0, 0.0],
                "p2": [100.0, 0.0],
                "real_ft": 0.0,
                "real_in": 0.0,
            },
        )
        assert res.status_code in (400, 422)

    def test_api_calibration_success_updates_sheet(self, client: TestClient):
        """Valid calibration calculates ratio and returns 200."""
        # 180 pt for 10 ft -> ratio 48.0 (1/4" = 1'-0")
        res = client.patch(
            "/api/sheets/api_sheet/calibration",
            json={
                "p1": [0.0, 0.0],
                "p2": [180.0, 0.0],
                "real_ft": 10.0,
                "real_in": 0.0,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["sheet_id"] == "api_sheet"
        assert data["scale_status"] == "CALIBRATED"
        assert data["scale_ratio"] == pytest.approx(48.0)
        assert '1/4" = 1\'-0"' in data["scale_raw"]

    def test_api_acceptance_on_unverified_returns_409(self, client: TestClient, tmp_path: Path):
        """Accepting an item on an UNVERIFIED sheet via API returns HTTP 409 Conflict."""
        # Create an item on unverified sheet
        created = client.post(
            "/api/takeoff/items",
            json={
                "project_id": "api_proj",
                "sheet_id": "api_sheet",
                "category": "DUCTWORK",
                "system": "Supply Air",
                "dimension_label": '12"x12"',
                "status": "SUGGESTED",
                "total_length_ft": 0.0,
                "count": 1,
            },
        )
        assert created.status_code == 200
        item_id = created.json()["item_id"]

        # Attempt to accept
        res = client.patch(
            f"/api/takeoff/items/{item_id}/status",
            json={"status": "ACCEPTED", "action": "ONE_CLICK_ACCEPT"},
        )
        assert res.status_code == 409
        assert "unverified" in res.json()["detail"].lower()
