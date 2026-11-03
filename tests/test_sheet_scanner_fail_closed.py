"""Fail-closed SheetScanner tests (TASK-001).

Contract deviation (honoured, not fought): the brief describes the
fail-closed form as ``scale_ratio = 0.0`` + ``review_required = True``,
but ``SheetMetadata`` (src/models/schemas.py:6-17, forbidden to edit here)
has no ``review_required`` field and ``scale_ratio: float | None``. The
codebase-wide fail-closed representation is therefore asserted instead:
``scale_ratio is None`` + ``scale_status == "UNVERIFIED"`` (see
ScaleValidator.parse_scale_string / points_to_feet, which treat None/<=0
identically).

Env note: the brief says ``META_API_KEY``; the client reads
``MODEL_API_KEY`` (client.py:30, forbidden to edit here). These tests do
not rely on env at all: they inject ``MetaModelClient(api_key="")`` or
duck-typed stub clients via SheetScanner's constructor.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pymupdf
import pytest

from src.meta_services.client import MetaModelClient
from src.meta_services.sheet_scanner import SheetScanner


def _make_pdf_no_scale(tmp_path: Path) -> Path:
    """Synthetic one-page PDF with no scale text anywhere on the sheet."""
    pdf_path = tmp_path / "synthetic_sheet.pdf"
    doc = pymupdf.open()
    try:
        page = doc.new_page(width=612, height=792)
        page.insert_text((72, 72), "FLOOR PLAN")
        doc.save(str(pdf_path))
    finally:
        doc.close()
    return pdf_path


class _RaisingStubClient:
    """Configured stub whose OCR call fails as an offline/network error would."""

    def is_configured(self) -> bool:
        return True

    def parse_crop_ocr(self, base64_image: str, prompt: str | None = None) -> dict[str, Any]:
        raise RuntimeError("offline")


class _MockStubClient:
    """Configured stub returning the client's offline-stub shape (mock: True)."""

    def is_configured(self) -> bool:
        return True

    def parse_crop_ocr(self, base64_image: str, prompt: str | None = None) -> dict[str, Any]:
        return {
            "mock": True,
            "raw_content": '{"sheet_number":"X-999","scale_string":"1/4\\" = 1\'-0\""}',
        }


def _make_pdf_conflicting_scales(tmp_path: Path) -> Path:
    """One-page PDF with two conflicting scales in the title-block quadrant.

    Page is 612x792; the scanner clips x>398, y>515 for title-block text.
    """
    pdf_path = tmp_path / "conflicting_sheet.pdf"
    doc = pymupdf.open()
    try:
        page = doc.new_page(width=612, height=792)
        page.insert_text((450, 600), '1/8" = 1\'-0"')
        page.insert_text((450, 630), '1/4" = 1\'-0"')
        doc.save(str(pdf_path))
    finally:
        doc.close()
    return pdf_path


class _JsonStubClient:
    """Configured stub returning a caller-supplied JSON payload (not mock)."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def is_configured(self) -> bool:
        return True

    def parse_crop_ocr(
        self,
        base64_image: str,
        prompt: str | None = None,
        profile: str = "fast",
        **kwargs: Any,
    ) -> dict[str, Any]:
        return {"raw_content": json.dumps(self._payload)}


def test_unconfigured_client_fails_closed(tmp_path: Path):
    pdf_path = _make_pdf_no_scale(tmp_path)
    scanner = SheetScanner(client=MetaModelClient(api_key=""))

    meta = scanner.scan_page(pdf_path, page_index=0)

    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"
    # Deterministic sheet-number fallback (PDF stem) must still produce a value.
    assert meta.sheet_number != ""


def test_configured_client_ocr_exception_fails_closed(tmp_path: Path):
    pdf_path = _make_pdf_no_scale(tmp_path)
    scanner = SheetScanner(client=cast(MetaModelClient, _RaisingStubClient()))

    # No exception may escape scan_page, and no scale may be fabricated.
    meta = scanner.scan_page(pdf_path, page_index=0)

    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"
    assert meta.sheet_number != ""


def test_mock_ocr_payload_is_ignored(tmp_path: Path):
    pdf_path = _make_pdf_no_scale(tmp_path)
    scanner = SheetScanner(client=cast(MetaModelClient, _MockStubClient()))

    meta = scanner.scan_page(pdf_path, page_index=0)

    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"
    assert meta.sheet_number != "X-999"
    assert meta.sheet_number != ""


def test_vlm_scale_string_is_provenance_only(tmp_path: Path):
    pdf_path = _make_pdf_no_scale(tmp_path)
    scale_string = '1/4" = 1\'-0"'
    stub = _JsonStubClient(
        {
            "sheet_number": "M-101",
            "sheet_title": "HVAC PLAN",
            "discipline": "MECHANICAL",
            "scale_string": scale_string,
        }
    )
    scanner = SheetScanner(client=cast(MetaModelClient, stub))

    meta = scanner.scan_page(pdf_path, page_index=0)

    # VLM scale records provenance but must never self-certify.
    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"
    assert meta.scale_raw == scale_string


def test_vlm_scale_does_not_override_native_conflict(tmp_path: Path):
    pdf_path = _make_pdf_conflicting_scales(tmp_path)
    stub = _JsonStubClient({"scale_string": '1/4" = 1\'-0"'})
    scanner = SheetScanner(client=cast(MetaModelClient, stub))

    meta = scanner.scan_page(pdf_path, page_index=0)

    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"


def test_non_string_vlm_json_fields_are_treated_as_absent(tmp_path: Path):
    pdf_path = _make_pdf_no_scale(tmp_path)
    stub = _JsonStubClient({"sheet_number": 123, "sheet_title": ["x"], "scale_string": 42})
    scanner = SheetScanner(client=cast(MetaModelClient, stub))

    # Must return normally with the deterministic fallback, not crash on
    # e.g. ``(123).lower()`` outside the VLM try block.
    meta = scanner.scan_page(pdf_path, page_index=0)

    assert meta.sheet_number != ""
    assert meta.sheet_number != "123"
    assert meta.scale_ratio is None
    assert meta.scale_status == "UNVERIFIED"
    assert meta.scale_raw is None


def _make_pdf_multi_page(tmp_path: Path, pages: int = 50) -> Path:
    """Synthetic multi-page set with strict ``[MAEP]-DDD`` title-block tokens."""
    pdf_path = tmp_path / "package_set.pdf"
    doc = pymupdf.open()
    try:
        prefixes = ("M", "E", "A", "P")
        for i in range(pages):
            page = doc.new_page(width=612, height=792)
            # Bottom-right title-block quadrant (x>398, y>594 for this scanner).
            page.insert_text((450, 650), f"{prefixes[i % 4]}-{100 + i % 100:03d} PLAN")
        doc.save(str(pdf_path))
    finally:
        doc.close()
    return pdf_path


def test_fast_reconnaissance(tmp_path: Path, monkeypatch):
    """TASK-INTK-001: one open, no raster, fail-closed scale, fast on 50 pages."""
    import time

    import pymupdf as _pymupdf

    pdf_path = _make_pdf_multi_page(tmp_path, pages=50)
    real_open = _pymupdf.open
    calls = {"count": 0}

    def _counting_open(*args, **kwargs):
        calls["count"] += 1
        return real_open(*args, **kwargs)

    monkeypatch.setattr(_pymupdf, "open", _counting_open)

    def _no_raster(self, *args, **kwargs):
        raise AssertionError("scan_package_reconnaissance must not rasterize")

    monkeypatch.setattr(_pymupdf.Page, "get_pixmap", _no_raster)

    scanner = SheetScanner(client=MetaModelClient(api_key=""))
    start = time.perf_counter()
    sheets = scanner.scan_package_reconnaissance(pdf_path, "recon_proj")
    elapsed = time.perf_counter() - start

    assert calls["count"] == 1
    assert elapsed < 2.5
    assert len(sheets) == 50
    # Strict token extraction on page 0 ("M-100"), stem fallback nowhere needed.
    assert sheets[0].sheet_number == "M-100"
    assert sheets[0].page_index == 0
    for meta in sheets:
        # Fail-closed scale representation (repo convention: None + UNVERIFIED;
        # 0.0 is treated identically downstream by points_to_feet).
        assert meta.scale_ratio is None
        assert meta.scale_status == "UNVERIFIED"
        assert meta.scale_raw is None
        assert meta.discipline in ("MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL")
        assert meta.width_pt == 612
        assert meta.height_pt == 792

    # Stem fallback: page text without a strict token still yields an index entry.
    single = tmp_path / "no_token.pdf"
    doc = _pymupdf.open()
    try:
        doc.new_page(width=612, height=792)
        doc.save(str(single))
    finally:
        doc.close()
    fallback = scanner.scan_package_reconnaissance(single, "recon_proj")
    assert len(fallback) == 1
    assert fallback[0].sheet_number == "no_token_p0"
    assert fallback[0].scale_status == "UNVERIFIED"


def _make_pdf_three_pages(tmp_path: Path) -> Path:
    pdf_path = tmp_path / "thumb_set.pdf"
    doc = pymupdf.open()
    try:
        for i in range(3):
            page = doc.new_page(width=612, height=792)
            page.insert_text((72, 72), f"THUMB PAGE {i}")
        doc.save(str(pdf_path))
    finally:
        doc.close()
    return pdf_path


async def test_thumbnail_generator(tmp_path: Path, monkeypatch):
    """TASK-INTK-002: WebP thumbnails for every page, bounded workers, pix freed."""
    from PIL import Image

    from src.meta_services.thumbnail_generator import generate_sheet_thumbnails_async

    pdf_path = _make_pdf_three_pages(tmp_path)
    monkeypatch.chdir(tmp_path)

    paths = await generate_sheet_thumbnails_async(pdf_path, "thumb_proj", dpi=24, max_workers=2)

    assert len(paths) == 3
    assert paths == [str(Path(f"data/cache/thumbnails/thumb_proj/p{i}.webp")) for i in range(3)]
    for p in paths:
        target = tmp_path / p
        assert target.is_file()
        assert target.stat().st_size > 0
        with Image.open(target) as img:
            # WebP preferred; PNG only if this build cannot encode WebP.
            assert img.format in ("WEBP", "PNG")
    # WebP preferred on this build: every path must be .webp unless Pillow
    # itself lacks a WebP encoder (documented PNG fallback in the module).
    from PIL import features as _features

    if _features.check("webp"):
        assert all(p.endswith(".webp") for p in paths)


async def test_thumbnail_generator_rejects_unsafe_project_id(tmp_path: Path, monkeypatch):
    """project_id is a directory name: traversal must raise, never write."""
    from src.meta_services.thumbnail_generator import generate_sheet_thumbnails_async

    pdf_path = _make_pdf_three_pages(tmp_path)
    monkeypatch.chdir(tmp_path)
    escape_root = tmp_path / "data" / "cache" / "evil"

    for unsafe in ("../../evil", "..\\..\\evil", "a/b", "a\\b", "..", "", " ./x"):
        with pytest.raises(ValueError):
            await generate_sheet_thumbnails_async(pdf_path, unsafe, dpi=24, max_workers=2)
    assert not escape_root.exists()
    assert not (tmp_path.parent / "evil").exists()
    assert not (tmp_path / "data" / "cache" / "evil").exists()

    # A normal id still writes into its own bounded directory.
    paths = await generate_sheet_thumbnails_async(pdf_path, "thumb_proj", dpi=24, max_workers=2)
    assert len(paths) == 3
    assert all(Path(p).parent == Path("data/cache/thumbnails/thumb_proj") for p in paths)


async def test_thumbnail_50page_budget(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """TASK-INTK-002/005 gate: 50 thumbnails, every file <= 15 KB (15360 bytes).

    Synthetic 50-page set via PyMuPDF, generate at the production dpi (24),
    then assert the per-file budget. No quality/size guard exists in the
    generator: this test fails first if any file exceeds the budget, and the
    guard is added only then (none needed while max stays under 15360).
    """
    from src.meta_services.thumbnail_generator import generate_sheet_thumbnails_async

    pdf_path = _make_pdf_multi_page(tmp_path, pages=50)
    monkeypatch.chdir(tmp_path)

    paths = await generate_sheet_thumbnails_async(pdf_path, "budget_proj", dpi=24, max_workers=2)

    assert len(paths) == 50
    sizes: list[int] = []
    for p in paths:
        target = tmp_path / p
        assert target.is_file(), f"missing thumbnail {p}"
        sizes.append(target.stat().st_size)
    peak = max(sizes)
    mean = sum(sizes) / len(sizes)
    over = [(p, s) for p, s in zip(paths, sizes) if s > 15360]
    assert not over, (
        f"{len(over)} thumbnails over the 15 KB budget "
        f"(max={peak} avg={mean:.0f}): {over[:5]}"
    )
