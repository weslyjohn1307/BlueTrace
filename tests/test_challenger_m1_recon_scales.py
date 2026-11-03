"""Challenger Adversarial Test Suite — ReconAgent.evaluate_scales & Scale Adjudication.

Authored by challenger_m1_r_2 to empirically verify edge cases:
1. Multiple identical native scales (set of 1)
2. Multiple conflicting native scales (set > 1)
3. Native ratio None
4. VLM ratio None
5. Both non-None within 1% tolerance
6. Both non-None exceeding 1% tolerance
7. VLM candidate source separation & self-certification guard
8. Non-PLAN sheet types with verified scales
9. Boundary/invalid scale candidates
"""

import pytest

from src.agents.base import ScaleStatus, SheetType
from src.agents.recon import ReconAgent, ScaleCandidate


class TestChallengerReconScalesAdversarial:
    """Adversarial stress testing of ReconAgent.evaluate_scales."""

    # -------------------------------------------------------------------------
    # 1. Multiple identical native scales (set of 1)
    # -------------------------------------------------------------------------
    def test_multiple_identical_native_scales_alone(self) -> None:
        """Two identical native scales (same ratio 48.0) without VLM must resolve to VERIFIED."""
        cand1 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev_native_1",
            is_valid=True,
        )
        cand2 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_page",
            evidence_id="ev_native_2",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [cand1, cand2], None, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.VERIFIED
        assert ratio == 48.0
        assert raw == '1/4"=1\'-0"'
        assert rev_req is False
        assert is_meas is True
        assert any("verified via deterministic native title block parsing" in n.lower() for n in notes)

    def test_multiple_identical_native_scales_with_invalid_distractors(self) -> None:
        """Multiple identical native scales mixed with invalid or None-ratio candidates."""
        cand_valid_1 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev_valid_1",
            is_valid=True,
        )
        cand_valid_2 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_page",
            evidence_id="ev_valid_2",
            is_valid=True,
        )
        cand_invalid = ScaleCandidate(
            raw_string="garbage text",
            scale_ratio=None,
            source="native_page",
            evidence_id="ev_inv",
            is_valid=False,
        )
        cand_unsupported_ratio = ScaleCandidate(
            raw_string="scale?",
            scale_ratio=96.0,
            source="native_page",
            evidence_id="ev_unsupp",
            is_valid=False,  # is_valid is False, so should be filtered out!
        )

        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand_valid_1, cand_invalid, cand_valid_2, cand_unsupported_ratio],
            None,
            is_nts=False,
            sheet_type=SheetType.PLAN,
        )

        assert stat == ScaleStatus.VERIFIED
        assert ratio == 48.0
        assert rev_req is False
        assert is_meas is True

    # -------------------------------------------------------------------------
    # 2. Multiple conflicting native scales (set > 1)
    # -------------------------------------------------------------------------
    def test_multiple_conflicting_native_scales(self) -> None:
        """Two conflicting native scales (48.0 vs 96.0) must fail closed to CONFLICT."""
        cand1 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev1",
            is_valid=True,
        )
        cand2 = ScaleCandidate(
            raw_string='1/8"=1\'-0"',
            scale_ratio=96.0,
            source="native_titleblock",
            evidence_id="ev2",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [cand1, cand2], None, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert rev_req is True
        assert is_meas is False
        assert raw is not None and "CONFLICT" in raw
        assert any("conflicting native scales" in n.lower() for n in notes)

    def test_conflicting_native_takes_precedence_over_vlm_agreement(self) -> None:
        """If native scales conflict, even if VLM agrees with one of them, it MUST remain CONFLICT."""
        cand1 = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev1",
            is_valid=True,
        )
        cand2 = ScaleCandidate(
            raw_string='1/8"=1\'-0"',
            scale_ratio=96.0,
            source="native_titleblock",
            evidence_id="ev2",
            is_valid=True,
        )
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand1, cand2], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.CONFLICT
        assert ratio is None
        assert rev_req is True
        assert is_meas is False
        assert raw is not None and "CONFLICT" in raw

    # -------------------------------------------------------------------------
    # 3. Native ratio None
    # -------------------------------------------------------------------------
    def test_native_ratio_none_with_no_vlm(self) -> None:
        """Completely empty native candidates and no VLM -> UNVERIFIED, ratio None."""
        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [], None, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert raw is None
        assert rev_req is True
        assert is_meas is False
        assert any("no readable scale annotation found" in n.lower() for n in notes)

    def test_native_candidates_all_ratio_none(self) -> None:
        """Native candidates present but all have scale_ratio=None -> UNVERIFIED."""
        cand_none = ScaleCandidate(
            raw_string="AS NOTED",
            scale_ratio=None,
            source="native_titleblock",
            evidence_id="ev_none",
            is_valid=False,
        )

        stat, ratio, raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand_none], None, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert raw is None
        assert rev_req is True
        assert is_meas is False

    def test_native_ratio_none_with_valid_vlm(self) -> None:
        """Native has no scale, VLM finds scale -> UNVERIFIED (Gate 5: VLM cannot self-certify)."""
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert raw == '1/4"=1\'-0"'
        assert rev_req is True
        assert is_meas is False
        assert any("unverified by native text" in n.lower() for n in notes)

    # -------------------------------------------------------------------------
    # 4. VLM ratio None
    # -------------------------------------------------------------------------
    def test_vlm_ratio_none_with_valid_native(self) -> None:
        """Valid native scale with VLM candidate whose scale_ratio is None -> VERIFIED via native."""
        cand_native = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev_native",
            is_valid=True,
        )
        cand_vlm_none = ScaleCandidate(
            raw_string="UNREADABLE_BLUR",
            scale_ratio=None,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=False,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [cand_native], cand_vlm_none, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.VERIFIED
        assert ratio == 48.0
        assert raw == '1/4"=1\'-0"'
        assert rev_req is False
        assert is_meas is True
        assert any("deterministic native title block parsing" in n.lower() for n in notes)

    def test_vlm_candidate_none_object_with_valid_native(self) -> None:
        """Valid native scale with vlm_candidate=None -> VERIFIED via native."""
        cand_native = ScaleCandidate(
            raw_string='3/8"=1\'-0"',
            scale_ratio=32.0,
            source="native_titleblock",
            evidence_id="ev_native",
            is_valid=True,
        )

        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand_native], None, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.VERIFIED
        assert ratio == 32.0
        assert rev_req is False
        assert is_meas is True

    def test_both_native_and_vlm_ratio_none(self) -> None:
        """Both native and VLM candidates exist but both have ratio=None -> UNVERIFIED."""
        cand_nat = ScaleCandidate(
            raw_string="NATIVE_NO_RATIO",
            scale_ratio=None,
            source="native_titleblock",
            evidence_id="ev1",
            is_valid=False,
        )
        cand_vlm = ScaleCandidate(
            raw_string="VLM_NO_RATIO",
            scale_ratio=None,
            source="vlm_crop",
            evidence_id="ev2",
            is_valid=False,
        )

        stat, ratio, raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert raw is None
        assert rev_req is True
        assert is_meas is False

    # -------------------------------------------------------------------------
    # 5. Both non-None within 1% tolerance
    # -------------------------------------------------------------------------
    @pytest.mark.parametrize(
        ("native_ratio", "vlm_ratio", "expected_match"),
        [
            (48.0, 48.0, True),             # Exact match
            (48.0, 48.4, True),             # +0.83% diff (within 1%)
            (48.0, 47.6, True),             # -0.83% diff (within 1%)
            (48.0, 48.47, True),            # +0.979% diff (within 1%)
            (48.0, 48.55, False),           # +1.14% diff (exceeds 1%)
            (48.0, 47.45, False),           # -1.14% diff (exceeds 1%)
            (96.0, 96.5, True),             # +0.52% diff (within 1%)
            (96.0, 97.5, False),            # +1.56% diff (exceeds 1%)
            (24.0, 24.2, True),             # +0.83% diff (within 1%)
            (24.0, 24.3, False),            # +1.25% diff (exceeds 1%)
        ],
    )
    def test_native_and_vlm_tolerance_boundary(
        self, native_ratio: float, vlm_ratio: float, expected_match: bool
    ) -> None:
        """Cross-check native and VLM ratio within and exceeding 1% relative tolerance."""
        cand_nat = ScaleCandidate(
            raw_string=f"ratio_{native_ratio}",
            scale_ratio=native_ratio,
            source="native_titleblock",
            evidence_id="ev_nat",
            is_valid=True,
        )
        cand_vlm = ScaleCandidate(
            raw_string=f"ratio_{vlm_ratio}",
            scale_ratio=vlm_ratio,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )

        if expected_match:
            assert stat == ScaleStatus.VERIFIED
            assert ratio == native_ratio
            assert rev_req is False
            assert is_meas is True
            assert any("confirmed by vlm crop recognition" in n.lower() for n in notes)
        else:
            assert stat == ScaleStatus.CONFLICT
            assert ratio is None
            assert rev_req is True
            assert is_meas is False
            assert raw is not None and "CONFLICT" in raw
            assert any("scale conflict" in n.lower() for n in notes)

    # -------------------------------------------------------------------------
    # 6. Additional Adversarial Scenarios
    # -------------------------------------------------------------------------
    def test_nts_overrides_everything(self) -> None:
        """Sheet marked NTS must fail closed even if native and VLM both have valid agreeing ratios."""
        cand_nat = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev_nat",
            is_valid=True,
        )
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        stat, ratio, raw, rev_req, is_meas, notes = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=True, sheet_type=SheetType.PLAN
        )

        assert stat == ScaleStatus.UNVERIFIED
        assert ratio is None
        assert raw == "NOT TO SCALE"
        assert rev_req is True
        assert is_meas is False
        assert any("marked not to scale" in n.lower() for n in notes)

    @pytest.mark.parametrize(
        "non_plan_type",
        [
            SheetType.SCHEDULE,
            SheetType.DETAIL,
            SheetType.RISER,
            SheetType.LEGEND,
            SheetType.OTHER,
        ],
    )
    def test_non_plan_sheet_types_unmeasurable(self, non_plan_type: SheetType) -> None:
        """Non-plan sheets with verified scales MUST have is_measurable=False and review_required=True."""
        cand_nat = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="native_titleblock",
            evidence_id="ev_nat",
            is_valid=True,
        )
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        stat, ratio, _raw, rev_req, is_meas, _notes = ReconAgent.evaluate_scales(
            [cand_nat], cand_vlm, is_nts=False, sheet_type=non_plan_type
        )

        assert stat == ScaleStatus.VERIFIED
        assert ratio == 48.0
        assert is_meas is False
        assert rev_req is True

    def test_vlm_candidate_accidentally_in_native_candidates_boundary(self) -> None:
        """Adversarial check: what happens if a caller passes a vlm_crop candidate in native_candidates?

        If native_candidates only contains a vlm_crop candidate and it is passed as both
        native_candidates and vlm_candidate, evaluate_scales checks native_valid:
        currently native_valid = [c for c in native_candidates if c.is_valid and c.scale_ratio is not None].
        This test documents the exact empirical behavior of evaluate_scales.
        """
        cand_vlm = ScaleCandidate(
            raw_string='1/4"=1\'-0"',
            scale_ratio=48.0,
            source="vlm_crop",
            evidence_id="ev_vlm",
            is_valid=True,
        )

        # When caller properly keeps native_candidates empty:
        stat_proper, ratio_proper, _, rev_req_proper, _, _ = ReconAgent.evaluate_scales(
            [], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        assert stat_proper == ScaleStatus.UNVERIFIED
        assert ratio_proper is None
        assert rev_req_proper is True

        # When caller passes cand_vlm inside native_candidates:
        stat_polluted, _ratio_polluted, _, _, _, _ = ReconAgent.evaluate_scales(
            [cand_vlm], cand_vlm, is_nts=False, sheet_type=SheetType.PLAN
        )
        # Note: evaluate_scales treats native_candidates as native, so it would see 1 ratio
        # and compare against vlm_candidate.
        assert stat_polluted == ScaleStatus.VERIFIED
