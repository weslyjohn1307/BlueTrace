from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class SheetMetadata(BaseModel):
    sheet_id: str
    page_index: int
    sheet_number: str
    sheet_title: str
    discipline: Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"]
    scale_raw: str | None = None
    scale_ratio: float | None = None
    scale_status: Literal["VERIFIED", "UNVERIFIED", "CALIBRATED"] = "UNVERIFIED"
    width_pt: float
    height_pt: float
    dpi: int = 150


class ProjectCreate(BaseModel):
    name: str = Field(..., description="Project or building name")
    description: str | None = None
    package_hash_sha256: str | None = None
    file_size_bytes: int | None = None


class ProjectCreateRequest(BaseModel):
    name: str = Field(..., description="Project or building name")
    package_hash_sha256: str = ""
    file_size_bytes: int | None = None


class ProjectResponse(BaseModel):
    project_id: str
    name: str
    created_at: str
    package_hash_sha256: str = ""
    file_size_bytes: int | None = None
    meta_file_id: str | None = None
    sheets: list[SheetMetadata] = []


class CursorCropRequest(BaseModel):
    sheet_id: str
    cursor_pt: list[float] = Field(..., description="[x, y] in 72 DPI PDF points")
    crop_size_pt: float = 150.0
    image_base64: str = Field(..., description="Base64 encoded PNG crop")


class DimensionExtraction(BaseModel):
    width_in: float
    height_in: float | None = None
    shape: Literal["ROUND", "RECTANGULAR", "OVAL"] = "RECTANGULAR"

    @field_validator("shape", mode="before")
    @classmethod
    def coerce_shape(cls, v: Any) -> str:
        if not isinstance(v, str):
            return "RECTANGULAR"
        normalized = v.strip().upper()
        if normalized in {"ROUND", "CIRCULAR", "CYLINDRICAL", "SPIRAL"}:
            return "ROUND"
        if normalized in {"OVAL", "FLAT_OVAL", "FLAT-OVAL", "ELLIPTICAL"}:
            return "OVAL"
        if normalized in {"RECTANGULAR", "SQUARE", "RECT", "BOX"}:
            return "RECTANGULAR"
        return "RECTANGULAR"


class CursorCropResponse(BaseModel):
    latency_ms: int
    detected_text: str
    parsed_dimension: DimensionExtraction | None = None
    confidence: float
    badge_text: str
    review_required: bool = False


class TakeoffSegment(BaseModel):
    segment_id: str
    start_pt: list[float]
    end_pt: list[float]
    length_pt: float
    length_ft: float


class TakeoffItem(BaseModel):
    item_id: str
    sheet_id: str
    category: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"]
    system: str
    dimension_label: str
    segments: list[TakeoffSegment] = []
    total_length_ft: float
    review_status: Literal["ACCEPTED", "REVIEW_REQUIRED", "REJECTED"] = "ACCEPTED"


class CopilotQueryRequest(BaseModel):
    sheet_id: str | None = None
    query: str
    selection_bbox: list[float] | None = None


class CopilotQueryResponse(BaseModel):
    answer: str
    cited_coordinates: list[list[float]] = []
    referenced_item_ids: list[str] = []
    scale_verified: bool
    # True only when muse-wonder-1.0 produced the answer; False for the
    # deterministic offline fallback. Clients must surface this, never assume it.
    model_used: bool = False


class UploadResponse(BaseModel):
    filename: str
    file_path: str
    byte_size: int
    sha256: str


class SheetCalibrationRequest(BaseModel):
    p1: list[float] = Field(..., description="[x, y] in PDF points (top-left origin)")
    p2: list[float] = Field(..., description="[x, y] in PDF points (top-left origin)")
    real_ft: float = Field(..., description="Real-world feet portion of the calibration run")
    real_in: float = Field(default=0.0, description="Real-world extra inches portion")

    @field_validator("p1", "p2")
    @classmethod
    def validate_point(cls, v: Any) -> Any:
        import math as _math

        if not isinstance(v, (list, tuple)) or len(v) != 2:
            raise ValueError("Calibration points must be [x, y] pairs.")
        coords = [float(x) for x in v]
        if not all(_math.isfinite(c) for c in coords):
            raise ValueError("Calibration points must be finite numbers.")
        return coords

    @field_validator("real_ft")
    @classmethod
    def validate_real_ft(cls, v: Any) -> float:
        import math as _math

        number = float(v)
        if not _math.isfinite(number):
            raise ValueError("real_ft must be finite.")
        if number < 0:
            raise ValueError("real_ft must be >= 0.")
        return number

    @field_validator("real_in")
    @classmethod
    def validate_real_in(cls, v: Any) -> float:
        import math as _math

        number = float(v)
        if not _math.isfinite(number):
            raise ValueError("real_in must be finite.")
        if number < 0 or number >= 12:
            raise ValueError("real_in must satisfy 0 <= real_in < 12.")
        return number

    @field_validator("real_in", mode="after")
    @classmethod
    def validate_total_distance(cls, v: float, info: Any) -> float:
        import math as _math

        ft = info.data.get("real_ft", 0.0) if isinstance(info.data, dict) else 0.0
        try:
            total = float(ft) * 12.0 + float(v)
        except (TypeError, ValueError):
            raise ValueError("Real-world distance must be numeric.")
        if not _math.isfinite(total) or total <= 0:
            raise ValueError("Real-world calibration distance must be greater than 0.")
        return v


class SheetCalibrationResponse(BaseModel):
    sheet_id: str
    scale_ratio: float
    scale_raw: str
    scale_status: Literal["CALIBRATED"] = "CALIBRATED"
    updated_items: int
    skipped_items: int = 0


class MetaFileUploadRequest(BaseModel):
    file_path: str


class MetaFileUploadResponse(BaseModel):
    file_id: str
    filename: str
    status: str = "uploaded"


class SessionStatePayload(BaseModel):
    project_id: str
    active_sheet_id: str | None = None
    viewport_scale: float = 1.0
    viewport_tx: float = 0.0
    viewport_ty: float = 0.0
    selected_pin_id: str | None = None
    active_tool_mode: Literal["select", "pan", "quickdraw", "segment", "calibrate"] = "select"
    discipline_filter: str = "ALL"
    search_query: str = ""

    @field_validator("viewport_scale", "viewport_tx", "viewport_ty", mode="before")
    @classmethod
    def validate_finite_viewport(cls, v: Any) -> float:
        try:
            number = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError("Viewport coordinates must be finite numbers.") from exc
        import math as _math

        if not _math.isfinite(number):
            raise ValueError("Viewport coordinates must be finite numbers.")
        return number

    @field_validator("viewport_scale", mode="after")
    @classmethod
    def validate_viewport_scale_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("viewport_scale must be greater than 0.")
        return v


class ProjectSummaryResponse(BaseModel):
    project_id: str
    name: str
    created_at: str
    sheet_count: int = 0
    item_count: int = 0
    updated_at: str | None = None
