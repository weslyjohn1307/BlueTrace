import math
import re
from typing import ClassVar, Literal


class ScaleValidator:
    """Validates architectural and engineering drawing scale strings deterministically.

    API-facing twin of ``src/core_vector/scale.py`` (which owns pipeline-internal
    schematic/riser/NTS gating). Boundary: API/meta-services code uses this class;
    pipeline code uses ``scale.py``; both must agree on fixtures (see
    ``test_scale_validator_reconciles_with_pipeline_scale``).

    Adheres strictly to the Fail-Closed Scale Rule:
    Unverified, ambiguous, or conflicting scale annotations return status 'UNVERIFIED'.
    """

    # Common US Architectural scales -> ratio (points to real inches or feet)
    # E.g., 1/4" = 1'-0" means 1/4" on paper (18 points) represents 12 inches in reality -> ratio = 48.0
    SCALE_PATTERNS: ClassVar[list[tuple[str, float]]] = [
        (r'1/8"\s*[:=]\s*1\'?\s*-?\s*0"', 96.0),
        (r'3/16"\s*[:=]\s*1\'?\s*-?\s*0"', 64.0),
        (r'1/4"\s*[:=]\s*1\'?\s*-?\s*0"', 48.0),
        (r'3/8"\s*[:=]\s*1\'?\s*-?\s*0"', 32.0),
        (r'(?<![-/0-9])1/2"\s*[:=]\s*1\'?\s*-?\s*0"', 24.0),
        (r'3/4"\s*[:=]\s*1\'?\s*-?\s*0"', 16.0),
        (r'1"\s*[:=]\s*1\'?\s*-?\s*0"', 12.0),
        (r'1-1/2"\s*[:=]\s*1\'?\s*-?\s*0"', 8.0),
        (r'3"\s*[:=]\s*1\'?\s*-?\s*0"', 4.0),
        # Metric scales
        (r'1\s*:\s*50\b', 50.0),
        (r'1\s*:\s*100\b', 100.0),
        (r'1\s*:\s*200\b', 200.0),
    ]

    @classmethod
    def parse_scale_string(cls, text: str) -> tuple[float | None, Literal["VERIFIED", "UNVERIFIED"]]:
        """Parses a scale string candidate and returns (scale_ratio, status)."""
        clean_text = text.strip()
        matched_ratios = []

        for pattern, ratio in cls.SCALE_PATTERNS:
            if re.search(pattern, clean_text, re.IGNORECASE):
                matched_ratios.append(ratio)

        # Fail-closed check: if no matches or multiple conflicting matches, fail closed
        if len(matched_ratios) == 1:
            return matched_ratios[0], "VERIFIED"
        
        return None, "UNVERIFIED"

    @classmethod
    def points_to_feet(cls, length_pt: float, scale_ratio: float | None) -> tuple[float | None, bool]:
        """Converts PDF points (72 pt/inch) to physical feet.
        
        Returns (feet, is_valid). If scale is unverified, returns (None, False).
        """
        if scale_ratio is None or scale_ratio <= 0:
            return None, False
        
        # 72 points in PDF = 1 paper inch
        paper_inches = length_pt / 72.0
        real_inches = paper_inches * scale_ratio
        real_feet = real_inches / 12.0
        return round(real_feet, 2), True

    # --- Two-point manual calibration (Phase 1 WS2) ---
    # Canonical architectural scale strings keyed by denominator ratio.
    CALIBRATION_SNAP_TABLE: ClassVar[list[tuple[float, str]]] = [
        (96.0, '1/8" = 1\'-0"'),
        (64.0, '3/16" = 1\'-0"'),
        (48.0, '1/4" = 1\'-0"'),
        (32.0, '3/8" = 1\'-0"'),
        (24.0, '1/2" = 1\'-0"'),
        (16.0, '3/4" = 1\'-0"'),
        (12.0, '1" = 1\'-0"'),
        (8.0, '1-1/2" = 1\'-0"'),
        (4.0, '3" = 1\'-0"'),
    ]

    @classmethod
    def calculate_scale_ratio(
        cls,
        p1: tuple[float, float] | list[float],
        p2: tuple[float, float] | list[float],
        real_ft: float,
        real_in: float = 0,
    ) -> float:
        """Derives the denominator ratio from a two-point calibration line.

        ratio = (real_ft * 12 + real_in) * 72 / L_pt
        where L_pt is the Euclidean distance between p1 and p2 in PDF points.

        Raises ValueError when the paper line is too short (L_pt < 5) or the
        stated real-world distance is non-positive.
        """
        try:
            x1, y1 = float(p1[0]), float(p1[1])
            x2, y2 = float(p2[0]), float(p2[1])
        except (TypeError, ValueError, IndexError) as e:
            raise ValueError(f"Calibration points must be [x, y] pairs: {e}") from e
        if not (math.isfinite(x1) and math.isfinite(y1) and math.isfinite(x2) and math.isfinite(y2)):
            raise ValueError("Calibration points must be finite numbers.")
        length_pt = math.hypot(x2 - x1, y2 - y1)
        if length_pt < 5:
            raise ValueError(f"Calibration line too short: L_pt={length_pt:.2f} < 5 pt.")
        try:
            real_total_in = float(real_ft) * 12.0 + float(real_in)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Real-world distance must be numeric: {e}") from e
        try:
            ft_val = float(real_ft)
            in_val = float(real_in)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Real-world distance must be numeric: {e}") from e
        if not math.isfinite(ft_val) or ft_val < 0:
            raise ValueError(f"real_ft must be >= 0, got {real_ft!r}.")
        if not math.isfinite(in_val) or in_val < 0 or in_val >= 12:
            raise ValueError(f"real_in must satisfy 0 <= real_in < 12, got {real_in!r}.")
        if not math.isfinite(real_total_in) or real_total_in <= 0:
            raise ValueError(f"Real-world calibration distance must be positive, got {real_total_in}.")
        return (real_total_in * 72.0) / length_pt

    @classmethod
    def derive_architectural_scale_string(cls, ratio: float, tol: float = 0.02) -> str:
        """Snaps a denominator ratio to the nearest canonical scale string.

        Within relative tolerance ``tol`` of a known denominator
        (96/64/48/32/24/16/12/8/4) the canonical architectural string is
        returned; otherwise a ``Custom (1" = X'-Y")`` string is returned
        where X = ratio // 12 (feet) and Y = round(ratio % 12, 1) (inches).
        """
        try:
            r = float(ratio)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Scale ratio must be numeric: {e}") from e
        if not math.isfinite(r) or r <= 0:
            raise ValueError(f"Scale ratio must be a positive finite number, got {ratio!r}.")
        for known, label in cls.CALIBRATION_SNAP_TABLE:
            if abs(r - known) / known <= tol:
                return label
        feet = int(r // 12)
        inches = round(r % 12, 1)
        return f'Custom (1" = {feet}\'-{inches:.1f}")'


def calculate_scale_ratio(
    p1: tuple[float, float] | list[float],
    p2: tuple[float, float] | list[float],
    real_ft: float,
    real_in: float = 0,
) -> float:
    """Module-level wrapper for :meth:`ScaleValidator.calculate_scale_ratio`."""
    return ScaleValidator.calculate_scale_ratio(p1, p2, real_ft, real_in)


def derive_architectural_scale_string(ratio: float, tol: float = 0.02) -> str:
    """Module-level wrapper for :meth:`ScaleValidator.derive_architectural_scale_string`."""
    return ScaleValidator.derive_architectural_scale_string(ratio, tol)
