"""View-bound physical-length projection (L2-07).

Reuses ViewBoundScaleDecision.conversion_factor_m_per_pdf_point().
Does not guess scale. Does not convert null length to zero.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Any

from src.core_vector.scale import is_testing_path
from src.core_vector.schema import ViewBoundScaleDecision, ViewBoundScaleStatus

SUPPORTED_REPRESENTATIONS = frozenset({"PAIRED_BOUNDARY_DERIVED", "SINGLE_LINE_ROUTE"})
REVIEW_CONTINUITY = frozenset({"REVIEW_REQUIRED", "GAP_UNCLOSED"})
OWNER_NO_SCALE = "NO_VERIFIED_SCALE_AVAILABLE"


class MeasurementStatus(str, Enum):
    """Physical-length availability for one route run."""

    MEASURED_VERIFIED_SCALE = "MEASURED_VERIFIED_SCALE"
    UNAVAILABLE_NO_VERIFIED_SCALE = "UNAVAILABLE_NO_VERIFIED_SCALE"
    UNAVAILABLE_SCALE_CONFLICT = "UNAVAILABLE_SCALE_CONFLICT"
    UNAVAILABLE_SCALE_NOT_APPLICABLE = "UNAVAILABLE_SCALE_NOT_APPLICABLE"
    UNAVAILABLE_UNSUPPORTED_REPRESENTATION = "UNAVAILABLE_UNSUPPORTED_REPRESENTATION"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


@dataclass
class RouteMeasurementResult:
    """Typed measurement result for one route run and one view-bound scale decision."""

    route_run_id: str
    fixture_id: str
    source_page_id: str | int
    view_id: str | None
    discipline: str
    representation_family: str
    geometry_length_pt: float
    scale_decision_id: str | None
    scale_status: str | None
    scale_source_type: str | None
    meters_per_pdf_point: float | None
    physical_length: float | None
    physical_length_unit: str | None
    measurement_status: MeasurementStatus
    reason_codes: list[str]
    source_route_hash: str
    source_scale_hash: str
    source_owner_hash: str | None
    config_hash: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize with explicit nulls. Never emit 0 for an unavailable length."""
        return {
            "route_run_id": self.route_run_id,
            "fixture_id": self.fixture_id,
            "source_page_id": self.source_page_id,
            "view_id": self.view_id,
            "discipline": self.discipline,
            "representation_family": self.representation_family,
            "geometry_length_pt": self.geometry_length_pt,
            "scale_decision_id": self.scale_decision_id,
            "scale_status": self.scale_status,
            "scale_source_type": self.scale_source_type,
            "meters_per_pdf_point": self.meters_per_pdf_point,
            "physical_length": self.physical_length,
            "physical_length_unit": self.physical_length_unit,
            "measurement_status": self.measurement_status.value,
            "reason_codes": list(self.reason_codes),
            "source_route_hash": self.source_route_hash,
            "source_scale_hash": self.source_scale_hash,
            "source_owner_hash": self.source_owner_hash,
            "config_hash": self.config_hash,
        }


def _scale_field(scale: ViewBoundScaleDecision | Mapping[str, Any], name: str) -> Any:
    if isinstance(scale, ViewBoundScaleDecision):
        value = getattr(scale, name)
        if name == "status":
            return value.value if hasattr(value, "value") else value
        if name == "source_type":
            return value.value if hasattr(value, "value") else value
        if name == "reason_codes":
            return list(value or [])
        return value
    if name == "status":
        return scale.get("status")
    if name == "source_type":
        return scale.get("source_type")
    if name == "reason_codes":
        return list(scale.get("reason_codes") or [])
    return scale.get(name)


def _conversion_factor(scale: ViewBoundScaleDecision | Mapping[str, Any]) -> float | None:
    if isinstance(scale, ViewBoundScaleDecision):
        return scale.conversion_factor_m_per_pdf_point()
    status = scale.get("status")
    enabled = scale.get("physical_conversion_enabled") is True
    factor = scale.get("meters_per_pdf_point")
    if (
        status
        in {
            ViewBoundScaleStatus.VERIFIED_AUTOMATIC.value,
            ViewBoundScaleStatus.VERIFIED_DECLARED.value,
            ViewBoundScaleStatus.MANUAL_VALIDATION.value,
            "MANUAL_VALIDATION",
        }
        and enabled
    ):
        return factor
    return None


def _unavailable(
    route: Mapping[str, Any],
    scale: ViewBoundScaleDecision | Mapping[str, Any] | None,
    status: MeasurementStatus,
    reasons: list[str],
    *,
    source_route_hash: str,
    source_scale_hash: str,
    source_owner_hash: str | None,
    config_hash: str,
) -> RouteMeasurementResult:
    view_id = None
    scale_id = None
    scale_status = None
    source_type = None
    if scale is not None:
        view_id = _scale_field(scale, "view_id")
        scale_id = _scale_field(scale, "scale_decision_id")
        scale_status = _scale_field(scale, "status")
        source_type = _scale_field(scale, "source_type")
    return RouteMeasurementResult(
        route_run_id=str(route.get("route_run_id") or ""),
        fixture_id=str(route.get("fixture_id") or ""),
        source_page_id=route.get("source_page_id", 0),
        view_id=view_id or route.get("viewport_id"),
        discipline=str(route.get("discipline") or ""),
        representation_family=str(route.get("representation_family") or ""),
        geometry_length_pt=float(route.get("geometry_length_pt") or 0.0),
        scale_decision_id=scale_id,
        scale_status=scale_status,
        scale_source_type=source_type,
        meters_per_pdf_point=None,
        physical_length=None,
        physical_length_unit=None,
        measurement_status=status,
        reason_codes=reasons,
        source_route_hash=source_route_hash,
        source_scale_hash=source_scale_hash,
        source_owner_hash=source_owner_hash,
        config_hash=config_hash,
    )


def measure_route_run(
    route: Mapping[str, Any],
    scale: ViewBoundScaleDecision | Mapping[str, Any] | None,
    *,
    owner_decision: str | None = None,
    source_route_hash: str,
    source_scale_hash: str,
    source_owner_hash: str | None = None,
    config_hash: str = "",
    source_path: str | None = None,
) -> RouteMeasurementResult:
    """Project one route run against one view-bound scale decision.

    Owner NO_VERIFIED_SCALE_AVAILABLE forces null even if geometry is review-required.
    Verified conversion is used only when the owner has not blocked the view.
    """
    if is_testing_path(source_path):
        raise ValueError("Testing partition is prohibited for L2-07 measurement")

    hashes = {
        "source_route_hash": source_route_hash,
        "source_scale_hash": source_scale_hash,
        "source_owner_hash": source_owner_hash,
        "config_hash": config_hash or str(route.get("config_hash") or ""),
    }

    if owner_decision == OWNER_NO_SCALE:
        return _unavailable(
            route,
            scale,
            MeasurementStatus.UNAVAILABLE_NO_VERIFIED_SCALE,
            [OWNER_NO_SCALE],
            **hashes,
        )
    if scale is None:
        return _unavailable(
            route,
            None,
            MeasurementStatus.UNAVAILABLE_NO_VERIFIED_SCALE,
            ["SCALE_TEXT_MISSING"],
            **hashes,
        )

    scale_reasons = _scale_field(scale, "reason_codes")
    status = _scale_field(scale, "status")
    factor = _conversion_factor(scale)

    if status == ViewBoundScaleStatus.FAIL_CLOSED.value or factor is None:
        mapped = MeasurementStatus.UNAVAILABLE_NO_VERIFIED_SCALE
        if "SCALE_CONFLICT" in scale_reasons:
            mapped = MeasurementStatus.UNAVAILABLE_SCALE_CONFLICT
        elif any(
            code in scale_reasons
            for code in (
                "NOT_TO_SCALE",
                "SCHEMATIC_RISER",
                "MIXED_VIEW_SCALE_UNBOUND",
                "VIEW_UNBOUND",
            )
        ):
            mapped = MeasurementStatus.UNAVAILABLE_SCALE_NOT_APPLICABLE
        reasons = list(scale_reasons) if scale_reasons else ["SCALE_TEXT_MISSING"]
        return _unavailable(route, scale, mapped, reasons, **hashes)

    representation = str(
        route.get("representation_family")
        or (
            "SINGLE_LINE_ROUTE"
            if route.get("kind") == "linear" or route.get("object_type") in {"duct", "pipe"}
            else ""
        )
    )
    if representation not in SUPPORTED_REPRESENTATIONS:
        return _unavailable(
            route,
            scale,
            MeasurementStatus.UNAVAILABLE_UNSUPPORTED_REPRESENTATION,
            ["UNSUPPORTED_REPRESENTATION"],
            **hashes,
        )

    continuity = str(route.get("continuity_status") or "CONTINUOUS")
    uncertainty = [str(c) for c in (route.get("uncertainty_codes") or [])]
    if continuity in REVIEW_CONTINUITY or "REVIEW_REQUIRED" in uncertainty:
        return _unavailable(
            route,
            scale,
            MeasurementStatus.REVIEW_REQUIRED,
            ["REVIEW_REQUIRED_GEOMETRY"],
            **hashes,
        )

    scale_view = _scale_field(scale, "view_id")
    route_view = route.get("view_id") or route.get("viewport_id")
    if scale_view and route_view and scale_view != route_view:
        return _unavailable(
            route,
            scale,
            MeasurementStatus.UNAVAILABLE_NO_VERIFIED_SCALE,
            ["VIEW_MISMATCH"],
            **hashes,
        )

    pts = (
        route.get("centerline_points") or (route.get("location_or_path") or {}).get("points") or []
    )
    bounds = _scale_field(scale, "view_bounds_pdf_pt")
    if bounds and len(bounds) == 4 and any(bounds) and pts:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        if not (bounds[0] <= cx <= bounds[2] and bounds[1] <= cy <= bounds[3]):
            return _unavailable(
                route,
                scale,
                MeasurementStatus.UNAVAILABLE_NO_VERIFIED_SCALE,
                ["OUTSIDE_VERIFIED_VIEW"],
                **hashes,
            )

    geometry_pt = float(route.get("geometry_length_pt") or 0.0)
    if geometry_pt == 0.0 and pts and len(pts) >= 2:
        # Calculate Euclidean polyline length from points
        geometry_pt = sum(
            ((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2) ** 0.5
            for i in range(1, len(pts))
        )
    physical = geometry_pt * float(factor)
    view_id = _scale_field(scale, "view_id")
    r_id = str(route.get("route_run_id") or route.get("object_id") or "")
    disc = str(route.get("discipline") or route.get("object_type") or "")
    return RouteMeasurementResult(
        route_run_id=r_id,
        fixture_id=str(route.get("fixture_id") or route.get("sheet_id") or ""),
        source_page_id=route.get("source_page_id", 0),
        view_id=view_id or route.get("viewport_id"),
        discipline=disc,
        representation_family=representation,
        geometry_length_pt=geometry_pt,
        scale_decision_id=_scale_field(scale, "scale_decision_id"),
        scale_status=status,
        scale_source_type=_scale_field(scale, "source_type"),
        meters_per_pdf_point=float(factor),
        physical_length=physical,
        physical_length_unit="m",
        measurement_status=MeasurementStatus.MEASURED_VERIFIED_SCALE,
        reason_codes=(
            ["MANUAL_VALIDATION"]
            if status in (ViewBoundScaleStatus.MANUAL_VALIDATION.value, "MANUAL_VALIDATION")
            else ["SCALE_VERIFIED"]
        ),
        **hashes,
    )


def aggregate_measurements(records: list[RouteMeasurementResult]) -> dict[str, Any]:
    """Sheet/discipline totals. Unavailable lengths never become 0.0."""
    measured = [
        r for r in records if r.measurement_status == MeasurementStatus.MEASURED_VERIFIED_SCALE
    ]
    unavailable_count = len(records) - len(measured)
    if not measured:
        total = None
        coverage = "NO_MEASURED_SUBSET"
    else:
        total = 0.0
        for rec in measured:
            if rec.physical_length is None:
                total = None
                coverage = "NO_MEASURED_SUBSET"
                break
            total += rec.physical_length
        else:
            coverage = "MEASURED_SUBSET"
    return {
        "physical_length_total": total,
        "measured_route_count": len(measured),
        "unavailable_route_count": unavailable_count,
        "coverage_status": coverage,
        "route_count": len(records),
    }
