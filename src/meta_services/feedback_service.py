"""Engineer-feedback crop extraction (TASK-FDBK-002).

Renders the 150 DPI context crop around a corrected/relocated pin bbox so a
later curation slice can assemble supervised examples. This module only
extracts and stores pixels; it never marks anything training-eligible
(``training_eligible`` stays 0 in ``engineer_feedback_events`` until a
permission/quality slice says otherwise).
"""

from __future__ import annotations

import math
from pathlib import Path

from src.models.validation import validate_project_id

#: Root every feedback crop must stay inside.
FEEDBACK_CROP_ROOT = Path("data/feedback/crops")

#: Render resolution for feedback crops (matches the canvas viewer DPI).
FEEDBACK_CROP_DPI = 150


def _validate_feedback_id(feedback_id: object) -> str:
    """Return ``feedback_id`` unchanged when safe as a PNG file stem."""
    if not isinstance(feedback_id, str):
        # One failure type for the whole identifier contract, mirroring
        # validate_project_id: the route maps ValueError to HTTP 400.
        raise ValueError("feedback_id must be a string.")  # noqa: TRY004
    candidate = feedback_id.strip()
    if not candidate:
        raise ValueError("feedback_id cannot be empty.")
    if "/" in candidate or "\\" in candidate or ".." in candidate:
        raise ValueError("feedback_id cannot contain path separators or '..'.")
    return candidate


def capture_feedback_crop(
    pdf_path: str | Path,
    page_index: int,
    bbox_pt: tuple[float, float, float, float],
    feedback_id: str,
    project_id: str,
    padding_pt: float = 18.0,
) -> str:
    """Extract a 150 DPI PNG crop around ``bbox_pt`` and return its relpath.

    The padded rectangle (``padding_pt`` on every side) is clamped to the
    page bounds; an empty clamped rect is a ``ValueError`` (fail closed,
    never a zero-byte PNG). Pixels land at
    ``data/feedback/crops/{project_id}/{feedback_id}.png`` and the
    workspace-relative path is returned for ``crop_storage_relpath``.

    Raises:
        ValueError: unsafe ``project_id``/``feedback_id``, malformed bbox,
            bad page index, or an output path escaping the crop root.
    """
    safe_project_id = validate_project_id(project_id)
    safe_feedback_id = _validate_feedback_id(feedback_id)
    try:
        x0, y0, x1, y1 = (float(v) for v in bbox_pt)
    except (TypeError, ValueError) as exc:
        raise ValueError("bbox_pt must be four numeric PDF-point values.") from exc
    for value in (x0, y0, x1, y1):
        if not math.isfinite(value):
            raise ValueError("bbox_pt values must be finite numbers.")
    if x1 <= x0 or y1 <= y0:
        raise ValueError(f"bbox_pt has non-positive area: {(x0, y0, x1, y1)!r}.")
    try:
        pad = float(padding_pt)
    except (TypeError, ValueError) as exc:
        raise ValueError("padding_pt must be numeric.") from exc
    if not math.isfinite(pad) or pad < 0:
        raise ValueError("padding_pt must be a finite number >= 0.")

    import pymupdf

    try:
        doc = pymupdf.open(str(pdf_path))
    except (RuntimeError, OSError, ValueError) as exc:
        raise ValueError(f"Could not open PDF drawing: {exc}") from exc
    try:
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
        page = doc[page_index]
        page_rect = page.rect
        clip = pymupdf.Rect(
            max(x0 - pad, page_rect.x0),
            max(y0 - pad, page_rect.y0),
            min(x1 + pad, page_rect.x1),
            min(y1 + pad, page_rect.y1),
        )
        if clip.is_empty or clip.width <= 0 or clip.height <= 0:
            raise ValueError("Padded bbox is empty after clamping to the page.")
        pix = page.get_pixmap(dpi=FEEDBACK_CROP_DPI, clip=clip)
        try:
            png_bytes = pix.tobytes("png")
        finally:
            del pix
    finally:
        doc.close()

    cache_root = FEEDBACK_CROP_ROOT.resolve()
    out_dir = FEEDBACK_CROP_ROOT / safe_project_id
    resolved_out_dir = out_dir.resolve()
    if resolved_out_dir == cache_root or cache_root not in resolved_out_dir.parents:
        raise ValueError(f"Refusing crop output directory outside the cache: {project_id!r}")
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{safe_feedback_id}.png"
    if target.resolve().parent != resolved_out_dir:
        raise ValueError("Refusing crop output path outside the project directory.")
    target.write_bytes(png_bytes)
    return str(target).replace("\\", "/")
