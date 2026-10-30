from typing import Literal

from pydantic import BaseModel, Field


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


class ProjectResponse(BaseModel):
    project_id: str
    name: str
    created_at: str
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
