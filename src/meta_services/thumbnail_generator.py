"""Background sheet thumbnail pipeline (TASK-INTK-002).

Renders one low-DPI thumbnail per drawing-set page into
``data/cache/thumbnails/{project_id}/p{i}.webp`` using
``asyncio.to_thread`` (PyMuPDF is blocking) bounded by a semaphore
(``max_workers``).

Format note: the PyMuPDF build pinned here cannot encode WebP directly
(``Pixmap.tobytes("webp")`` raises ``ValueError``), so PNG bytes from the
pixmap are re-encoded to WebP via Pillow — Pillow is already a declared
project dependency (``pyproject.toml``), not a new one. If WebP encoding
ever fails, the original PNG bytes are written to ``p{i}.png`` instead
(PNG fallback, WebP preferred). ``del pix`` releases the pixmap promptly
after each encode.
"""

from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path

import pymupdf
from PIL import Image

from src.models.validation import validate_project_id

logger = logging.getLogger(__name__)

#: Cache root every thumbnail directory must stay inside.
THUMBNAIL_CACHE_ROOT = Path("data/cache/thumbnails")


def _page_count(pdf_path: str) -> int:
    """Return the page count, translating engine failures to ValueError."""
    try:
        doc = pymupdf.open(pdf_path)
    except (RuntimeError, OSError, ValueError) as exc:
        raise ValueError(f"Could not open PDF drawing: {exc}") from exc
    try:
        return len(doc)
    finally:
        doc.close()


def _render_page(pdf_path: str, page_index: int, dpi: int, out_dir: str) -> str:
    """Render one page thumbnail; returns the workspace-relative file path."""
    doc = pymupdf.open(pdf_path)
    try:
        if page_index < 0 or page_index >= len(doc):
            raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
        pix = doc[page_index].get_pixmap(dpi=dpi)
        try:
            png_bytes = pix.tobytes("png")
            target = Path(out_dir) / f"p{page_index}.webp"
            try:
                img = Image.open(io.BytesIO(png_bytes))
                img.save(str(target), format="WEBP")
            except Exception as exc:  # noqa: BLE001 -- WebP unsupported: PNG fallback
                logger.warning("WebP encode failed (page_index=%s): %s; using PNG fallback", page_index, exc)
                target = Path(out_dir) / f"p{page_index}.png"
                target.write_bytes(png_bytes)
            return str(target)
        finally:
            del pix
    finally:
        doc.close()


async def generate_sheet_thumbnails_async(
    pdf_path: str | Path,
    project_id: str,
    dpi: int = 24,
    max_workers: int = 2,
) -> list[str]:
    """Generate WebP thumbnails for every page; returns file paths in order.

    Raises:
        ValueError: ``project_id`` is unsafe as a directory name (path
            traversal, absolute path, separators, empty) or the resolved
            output directory escapes the thumbnail cache root.
    """
    # Validate before touching the filesystem: a rejected id must not create
    # or write through any directory.
    safe_project_id = validate_project_id(project_id)
    cache_root = THUMBNAIL_CACHE_ROOT.resolve()
    out_dir = THUMBNAIL_CACHE_ROOT / safe_project_id
    resolved_out_dir = out_dir.resolve()
    if resolved_out_dir == cache_root or cache_root not in resolved_out_dir.parents:
        raise ValueError(f"Refusing thumbnail output directory outside the cache: {project_id!r}")
    out_dir.mkdir(parents=True, exist_ok=True)
    total = await asyncio.to_thread(_page_count, str(pdf_path))
    sem = asyncio.Semaphore(max(1, max_workers))

    async def _one(page_index: int) -> str:
        async with sem:
            return await asyncio.to_thread(_render_page, str(pdf_path), page_index, dpi, str(out_dir))

    return list(await asyncio.gather(*(_one(i) for i in range(total))))
