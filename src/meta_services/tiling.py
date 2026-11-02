"""Vector-aware sliding-window tiling engine for full-sheet symbol detection.

Implements TASK-SYM-001 (MICRO_TASK_SCHEDULE §6) and the coordinate
un-tiling + NMS stage of TASK-SYM-003.

Pipeline role (AGENTS.md §1 — vectors measure, models interpret):
  - Deterministic geometry only: grid math plus PyMuPDF text/vector queries.
  - NEVER calls a model, NEVER fabricates a detection. A tile flagged
    ``EMPTY`` is an explicit abstention from inference (there is no
    measurable content to send), not a zero-measurement.

Grid (150 DPI Arch E sheet, 5400 x 3600 px):
  - Tile 1024 x 1024 px, stride 819 px (20% overlap, 205 px margin).
  - Columns: offsets 0, 819, ..., clamped final offset 4376 → 7 cols.
  - Rows: offsets 0, 819, ..., clamped final offset 2576 → 5 rows.
  - Total: 7 x 5 = 35 tiles, each with (col, row, x_offset_px, y_offset_px).

Vector prefilter: tile pixel bounds are converted to PDF points
(``pt = px * 72 / 150 = px * 0.48``) and queried with
``page.get_text("words", clip=...)`` plus ``page.get_drawings()``
filtered by rect intersection. A tile with 0 words and < 3 vector
segments is marked ``EMPTY`` and bypasses model inference.

Coordinate un-tiling (TASK-SYM-003): tile detections arrive as
normalized ``[u1, v1, u2, v2]`` boxes in [0, 1000] relative to the
1024 px tile image, so::

    X_sheet = X_offset + u * 1.024        (same for Y)
    x_pt    = X_sheet * 0.48             (same for y)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

import pymupdf

logger = logging.getLogger(__name__)


# Conversion factor between 150 DPI raster pixels and PDF points (72 pt/in).
PT_PER_PX_AT_150_DPI = 72.0 / 150.0  # 0.48
TILE_PX_PER_NORM_UNIT = 1024.0 / 1000.0  # 1.024

# Page-query failures a duck-typed or real PyMuPDF page can raise. Narrowed
# (not blind) so ruff BLE001 stays clean; anything else propagates loudly
# instead of silently flipping tiles EMPTY.
_PAGE_QUERY_ERRORS = (RuntimeError, ValueError, OSError, TypeError, AttributeError)


@dataclass
class Tile:
    """One sliding-window tile of a 150 DPI sheet raster."""

    col: int
    row: int
    x_offset_px: int
    y_offset_px: int
    width_px: int = 1024
    height_px: int = 1024
    status: Literal["CONTENT", "EMPTY"] = "CONTENT"  # CONTENT = run inference; EMPTY = proven empty
    word_count: int = 0
    segment_count: int = 0

    def __post_init__(self) -> None:
        if self.status not in ("CONTENT", "EMPTY"):
            raise ValueError(f"Tile.status must be 'CONTENT' or 'EMPTY', got {self.status!r}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "col": self.col,
            "row": self.row,
            "x_offset_px": self.x_offset_px,
            "y_offset_px": self.y_offset_px,
            "width_px": self.width_px,
            "height_px": self.height_px,
            "status": self.status,
            "word_count": self.word_count,
            "segment_count": self.segment_count,
        }


@dataclass
class SymbolCandidate:
    """A raw tile-relative symbol detection awaiting un-tiling and NMS.

    ``tile_bbox`` is ``[u1, v1, u2, v2]`` = [x_min, y_min, x_max, y_max]
    normalized to [0, 1000] relative to the 1024 px tile image.
    ``bbox_pt`` is filled by :func:`untile_candidate` / :func:`apply_box_iou_nms`.
    """

    symbol_label: str
    tile_col: int
    tile_row: int
    x_offset_px: int
    y_offset_px: int
    tile_bbox: tuple[float, float, float, float]
    confidence: float
    review_required: bool = False
    bbox_pt: tuple[float, float, float, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol_label": self.symbol_label,
            "tile_col": self.tile_col,
            "tile_row": self.tile_row,
            "x_offset_px": self.x_offset_px,
            "y_offset_px": self.y_offset_px,
            "tile_bbox": [round(c, 2) for c in self.tile_bbox],
            "confidence": self.confidence,
            "review_required": self.review_required,
            "bbox_pt": ([round(c, 2) for c in self.bbox_pt] if self.bbox_pt else None),
        }


class SheetTilingEngine:
    """Decompose a 150 DPI sheet into overlapping tiles with vector prefiltering."""

    TILE_SIZE_PX = 1024
    STRIDE_PX = 819
    SHEET_WIDTH_PX = 5400
    SHEET_HEIGHT_PX = 3600
    DPI = 150
    MIN_VECTOR_SEGMENTS = 3

    def __init__(
        self,
        tile_size_px: int = TILE_SIZE_PX,
        stride_px: int = STRIDE_PX,
        sheet_width_px: int = SHEET_WIDTH_PX,
        sheet_height_px: int = SHEET_HEIGHT_PX,
        min_vector_segments: int = MIN_VECTOR_SEGMENTS,
    ) -> None:
        if tile_size_px <= 0 or stride_px <= 0:
            raise ValueError("tile_size_px and stride_px must be positive")
        if sheet_width_px <= 0 or sheet_height_px <= 0:
            raise ValueError("sheet dimensions must be positive")
        self.tile_size_px = tile_size_px
        self.stride_px = stride_px
        self.sheet_width_px = sheet_width_px
        self.sheet_height_px = sheet_height_px
        self.min_vector_segments = min_vector_segments

    @staticmethod
    def _grid_offsets(total_px: int, tile_px: int, stride_px: int) -> list[int]:
        """Sliding-window offsets; the final tile is clamped to the sheet edge."""
        offsets = list(range(0, total_px - tile_px + 1, stride_px))
        last = total_px - tile_px
        if not offsets:
            return [0]
        if offsets[-1] != last:
            offsets.append(last)
        return offsets

    def tile_sheet(
        self,
        page: Any | None = None,
        sheet_width_px: int | None = None,
        sheet_height_px: int | None = None,
    ) -> list[Tile]:
        """Build the tile grid; run the vector prefilter when ``page`` is given.

        Args:
            page: A ``pymupdf.Page`` (or duck-typed mock exposing
                ``get_text("words", clip=...)`` and ``get_drawings()``).
                When ``None``, tiles are returned unfiltered (all CONTENT).
            sheet_width_px / sheet_height_px: Override the default 5400 x 3600
                raster size (must match ``page.rect`` at 150 DPI when set).
        """
        width = sheet_width_px or self.sheet_width_px
        height = sheet_height_px or self.sheet_height_px
        x_offsets = self._grid_offsets(width, self.tile_size_px, self.stride_px)
        y_offsets = self._grid_offsets(height, self.tile_size_px, self.stride_px)

        drawings: list[dict[str, Any]] | None = None
        drawings_available = False
        if page is not None:
            try:
                drawings = page.get_drawings()
                drawings_available = True
            except _PAGE_QUERY_ERRORS as exc:
                # Fail closed: the vector layer is unproven, so no tile may be
                # marked EMPTY (S1#1). Every tile stays CONTENT; inference runs
                # everywhere instead of skipping blind.
                logger.warning("get_drawings failed; disabling EMPTY skip: %s", exc)
                drawings = None
                drawings_available = False

        tiles: list[Tile] = []
        for row, y_off in enumerate(y_offsets):
            for col, x_off in enumerate(x_offsets):
                tile = Tile(
                    col=col,
                    row=row,
                    x_offset_px=x_off,
                    y_offset_px=y_off,
                    width_px=self.tile_size_px,
                    height_px=self.tile_size_px,
                )
                if page is not None:
                    self._prefilter_tile(page, tile, drawings, drawings_available)
                tiles.append(tile)
        return tiles

    def tile_rect_to_points(self, tile: Tile) -> pymupdf.Rect:
        """Convert tile pixel bounds to a PDF-point clip rect (px * 0.48)."""
        return pymupdf.Rect(
            tile.x_offset_px * PT_PER_PX_AT_150_DPI,
            tile.y_offset_px * PT_PER_PX_AT_150_DPI,
            (tile.x_offset_px + tile.width_px) * PT_PER_PX_AT_150_DPI,
            (tile.y_offset_px + tile.height_px) * PT_PER_PX_AT_150_DPI,
        )

    def _prefilter_tile(
        self,
        page: Any,
        tile: Tile,
        drawings: list[dict[str, Any]] | None,
        drawings_available: bool = True,
    ) -> None:
        """Mark ``tile`` EMPTY when it holds no words and < 3 vector segments.

        Fail-closed: any query error leaves the tile CONTENT so inference
        still runs (abstain from skipping, never from detecting). In
        particular ``drawings_available=False`` (``get_drawings`` raised)
        forces CONTENT even when the tile holds zero words, because an
        unproven vector layer can never justify an EMPTY verdict (S1#1).
        """
        clip = self.tile_rect_to_points(tile)

        try:
            words = page.get_text("words", clip=clip) or []
            tile.word_count = len(words)
        except _PAGE_QUERY_ERRORS as exc:
            logger.warning("get_text(words) failed; keeping tile: %s", exc)
            tile.word_count = 0
            tile.segment_count = 0
            tile.status = "CONTENT"
            return

        if not drawings_available:
            # Vector layer unproven: EMPTY is not a safe verdict.
            tile.segment_count = 0
            tile.status = "CONTENT"
            return

        segments = 0
        if drawings is not None:
            for drawing in drawings:
                try:
                    rect = pymupdf.Rect(drawing["rect"])
                except (RuntimeError, ValueError, TypeError, KeyError) as exc:
                    logger.debug("Skipping malformed drawing entry: %s", exc)
                    continue
                if rect.intersects(clip):
                    items = drawing.get("items")
                    segments += len(items) if items else 1
        tile.segment_count = segments

        if tile.word_count == 0 and segments < self.min_vector_segments:
            tile.status = "EMPTY"
        else:
            tile.status = "CONTENT"


def untile_candidate(candidate: SymbolCandidate) -> tuple[float, float, float, float]:
    """Map a normalized tile-relative box to global PDF points.

    X_sheet = X_offset + u * 1.024;  x_pt = X_sheet * 0.48 (same for Y).

    Strict validation (S1/S2#6): non-finite coordinates, coordinates outside
    ``[0, 1000]``, and zero-area boxes (``u1 == u2`` or ``v1 == v2``) raise
    ``ValueError`` -- a box that cannot be measured is never silently placed.
    The axis-swap survives only for finite, in-range, strictly inverted boxes
    (``u1 > u2`` or ``v1 > v2``), and then flags
    ``candidate.review_required = True`` so a human confirms the orientation.
    """
    import math

    try:
        u1, v1, u2, v2 = (float(c) for c in candidate.tile_bbox)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"tile_bbox must hold 4 numeric coords: {exc}") from exc
    coords = (u1, v1, u2, v2)
    if any(not math.isfinite(v) for v in coords):
        raise ValueError(f"tile_bbox must be finite, got {tuple(coords)!r}")
    if any(not 0.0 <= v <= 1000.0 for v in coords):
        raise ValueError(f"tile_bbox coords must lie in [0, 1000], got {tuple(coords)!r}")
    if u1 == u2 or v1 == v2:
        raise ValueError(f"tile_bbox has zero area, got {tuple(coords)!r}")
    if u1 > u2 or v1 > v2:
        # Finite, in-range, but inverted: swap so the box is usable, and
        # escalate -- the orientation was not what the model contract promises.
        candidate.review_required = True
    x0 = (candidate.x_offset_px + u1 * TILE_PX_PER_NORM_UNIT) * PT_PER_PX_AT_150_DPI
    y0 = (candidate.y_offset_px + v1 * TILE_PX_PER_NORM_UNIT) * PT_PER_PX_AT_150_DPI
    x1 = (candidate.x_offset_px + u2 * TILE_PX_PER_NORM_UNIT) * PT_PER_PX_AT_150_DPI
    y1 = (candidate.y_offset_px + v2 * TILE_PX_PER_NORM_UNIT) * PT_PER_PX_AT_150_DPI
    if x0 > x1:
        x0, x1 = x1, x0
    if y0 > y1:
        y0, y1 = y1, y0
    return (x0, y0, x1, y1)


def box_iou(
    a: tuple[float, float, float, float], b: tuple[float, float, float, float]
) -> float:
    """2D intersection-over-union of two [x0, y0, x1, y1] boxes in PDF points."""
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def apply_box_iou_nms(
    candidates: list[SymbolCandidate], iou_threshold: float = 0.45
) -> list[SymbolCandidate]:
    """Un-tile candidates to PDF points and deduplicate by 2D Box IoU.

    - Candidates are un-tiled via :func:`untile_candidate` first.
    - Sorted descending by confidence; a lower-confidence candidate with
      IoU >= threshold against a kept same-label box is suppressed.
    - Overlap >= threshold with a *conflicting* label keeps both boxes but
      flags both ``review_required = True`` (fail closed — a human decides).
    """
    untiled: list[SymbolCandidate] = []
    for cand in candidates:
        untiled.append(
            SymbolCandidate(
                symbol_label=cand.symbol_label,
                tile_col=cand.tile_col,
                tile_row=cand.tile_row,
                x_offset_px=cand.x_offset_px,
                y_offset_px=cand.y_offset_px,
                tile_bbox=cand.tile_bbox,
                confidence=cand.confidence,
                review_required=cand.review_required,
                bbox_pt=untile_candidate(cand),
            )
        )

    untiled.sort(key=lambda c: c.confidence, reverse=True)

    kept: list[SymbolCandidate] = []
    for cand in untiled:
        assert cand.bbox_pt is not None
        drop = False
        for other in kept:
            assert other.bbox_pt is not None
            if box_iou(cand.bbox_pt, other.bbox_pt) >= iou_threshold:
                if cand.symbol_label == other.symbol_label:
                    drop = True
                    break
                cand.review_required = True
                other.review_required = True
        if not drop:
            kept.append(cand)
    return kept


__all__ = [
    "PT_PER_PX_AT_150_DPI",
    "TILE_PX_PER_NORM_UNIT",
    "SheetTilingEngine",
    "SymbolCandidate",
    "Tile",
    "apply_box_iou_nms",
    "box_iou",
    "tiles_to_swarm_input",
    "untile_candidate",
]


def tiles_to_swarm_input(
    tiles: list[Tile],
    tile_rasters: dict[tuple[int, int], bytes | str],
) -> list[dict[str, Any]]:
    """Adapt a ``Tile`` grid to the ``run_swarm`` input contract (SYM-005).

    Args:
        tiles: Tiles from :meth:`SheetTilingEngine.tile_sheet`.
        tile_rasters: REQUIRED mapping of ``(col, row)`` to the 1024 px tile
            raster (raw PNG bytes or base64 string). Tiles with no raster
            entry are passed through *without* image bytes; ``run_swarm``
            then surfaces them as ``INFERENCE_FAILED`` with
            ``review_required=True`` (missing evidence is flagged, never
            silently skipped).

    Returns:
        One dict per tile with the ``Tile.to_dict()`` keys plus
        ``tile_png_bytes`` when a raster was supplied.
    """
    adapted: list[dict[str, Any]] = []
    for tile in tiles:
        entry = tile.to_dict()
        raster = tile_rasters.get((tile.col, tile.row))
        if raster:
            entry["tile_png_bytes"] = raster
        adapted.append(entry)
    return adapted
