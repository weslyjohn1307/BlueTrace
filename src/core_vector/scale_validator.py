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
        (r'1/2"\s*[:=]\s*1\'?\s*-?\s*0"', 24.0),
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
