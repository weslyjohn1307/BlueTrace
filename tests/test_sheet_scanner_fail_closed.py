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

    def parse_crop_ocr(self, base64_image: str, prompt: str | None = None) -> dict[str, Any]:
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
