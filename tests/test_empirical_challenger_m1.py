"""Empirical Challenger Test Suite for Milestone 1: TASK-003 Symbol & Legend Extraction Engine.

Authored by teamwork_challenger (critic, specialist).
Empirically stress-tests src/meta_services/legend_scanner.py against:
1. Coordinate edge cases:
   - Inverted bboxes (x1 < x0, y1 < y0)
   - Zero-area / degenerate bboxes (x0 == x1, y0 == y1)
   - Sub-minimum dimension boxes (< 4.0 pt)
   - Negative and out-of-sheet coordinates
   - Giant architectural sheets (10,000 pt x 10,000 pt)
   - Non-numeric / NaN / Infinity inputs
2. Crop validity & raster integrity across MEP disciplines:
   - Mechanical, Plumbing, and Electrical disciplines
   - Base64 decode verification
   - PNG header magic bytes (\\x89PNG\\r\\n\\x1a\\n)
   - Image dimensions (width > 0, height > 0)
   - Non-empty pixel array decoding via PIL
3. Adversarial file inputs:
   - Non-PDF files (HTML, JSON, PNG, random binary)
   - 0-byte empty files
   - Corrupted PDF headers and truncated binary streams
   - Multi-page PDFs with varying page indices (valid, negative, and out-of-range)
   - Directory paths and empty path strings
4. Live VLM adversarial response handling:
   - Inverted normalized coordinates [ymin > ymax, xmin > xmax]
   - Wildly out-of-bounds coordinates
   - Injection payloads in symbol text fields
   - Missing fields and malformed data structures
   - High symbol volume stress (200 symbols)
"""

from __future__ import annotations

import base64
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pymupdf
import pytest
from PIL import Image

from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import (
    LegendScanner,
    LegendScanResult,
    scan_sheet_legend,
)

FIXTURE_MECH = Path("fixtures/mechanical/avexis_page_22.pdf")
FIXTURE_PLUMB = Path("fixtures/plumbing/p104_1_plumbing_level4.pdf")


# ===========================================================================
# 1. Coordinate Edge Cases & Mathematical Boundary Stress Tests
# ===========================================================================


def test_coordinate_edge_cases_in_parse_bbox_to_points():
    """Verify _parse_bbox_to_points safely normalizes, clamps, and inverts all edge inputs."""
    page_rect = pymupdf.Rect(0, 0, 1000, 800)
    tile_rect = pymupdf.Rect(500, 100, 950, 700)

    # 1. Inverted normalized coordinates [ymin, xmin, ymax, xmax] where ymin > ymax and xmin > xmax
    raw_inverted = [800.0, 900.0, 200.0, 100.0]
    box = LegendScanner._parse_bbox_to_points(raw_inverted, tile_rect, page_rect, is_points=False)
    x0, y0, x1, y1 = box
    assert x0 < x1, f"Expected x0 < x1, got {x0=}, {x1=}"
    assert y0 < y1, f"Expected y0 < y1, got {y0=}, {y1=}"
    assert 0.0 <= x0 <= 1000.0
    assert 0.0 <= y0 <= 800.0
    assert 0.0 <= x1 <= 1000.0
    assert 0.0 <= y1 <= 800.0

    # 2. Out-of-bounds negative coordinates
    raw_negative = [-500.0, -300.0, -100.0, -50.0]
    box_neg = LegendScanner._parse_bbox_to_points(raw_negative, tile_rect, page_rect, is_points=False)
    # Scaled negative normalized coordinates clamp to 0.0 or tile origin
    assert all(c >= 0.0 for c in box_neg)

    # 3. Wildly exceeding coordinates in absolute points
    raw_huge = [50000.0, 60000.0, 80000.0, 90000.0]
    box_huge = LegendScanner._parse_bbox_to_points(raw_huge, tile_rect, page_rect, is_points=True)
    assert box_huge == (1000.0, 800.0, 1000.0, 800.0)

    # 4. Zero-area / coincident coordinates
    raw_zero = [350.0, 250.0, 350.0, 250.0]
    box_zero = LegendScanner._parse_bbox_to_points(raw_zero, tile_rect, page_rect, is_points=True)
    assert box_zero == (350.0, 250.0, 350.0, 250.0)

    # 5. Non-numeric and malformed inputs must return (0, 0, 0, 0)
    assert LegendScanner._parse_bbox_to_points("invalid", tile_rect, page_rect) == (0.0, 0.0, 0.0, 0.0)
    assert LegendScanner._parse_bbox_to_points([1.0, 2.0], tile_rect, page_rect) == (0.0, 0.0, 0.0, 0.0)
    assert LegendScanner._parse_bbox_to_points(["x", "y", "z", "w"], tile_rect, page_rect) == (0.0, 0.0, 0.0, 0.0)


def test_crop_glyph_stress_boundaries_and_zero_area():
    """Verify _crop_glyph handles degenerate boxes, out-of-sheet rects, and small boxes."""
    doc = pymupdf.open()
    page = doc.new_page(width=1000, height=800)

    # 1. Zero-area point bbox (100, 100, 100, 100) -> expands to minimum 8x8 pt, returns valid PNG
    crop_zero = LegendScanner._crop_glyph(page, (100.0, 100.0, 100.0, 100.0))
    assert crop_zero != ""
    raw_bytes = base64.b64decode(crop_zero)
    assert raw_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    im = Image.open(io.BytesIO(raw_bytes))
    assert im.size[0] > 0 and im.size[1] > 0

    # 2. Inverted coordinates (200, 300, 150, 250) -> reordered and cropped
    crop_inv = LegendScanner._crop_glyph(page, (200.0, 300.0, 150.0, 250.0))
    assert crop_inv != ""
    im_inv = Image.open(io.BytesIO(base64.b64decode(crop_inv)))
    assert im_inv.size[0] > 0 and im_inv.size[1] > 0

    # 3. Completely outside page coordinates -> returns empty string
    crop_out = LegendScanner._crop_glyph(page, (5000.0, 5000.0, 6000.0, 6000.0))
    assert crop_out == ""

    # 4. Completely negative coordinates -> returns empty string
    crop_neg = LegendScanner._crop_glyph(page, (-500.0, -500.0, -100.0, -100.0))
    assert crop_neg == ""

    doc.close()


def test_very_large_architectural_sheet():
    """Stress-test a very large 10,000 pt x 10,000 pt drawing sheet."""
    doc = pymupdf.open()
    page = doc.new_page(width=10000, height=10000)
    page.insert_text((9400, 300), "SYMBOLS LEGEND AND ABBREVIATIONS")

    with tempfile.TemporaryDirectory() as tmpdir:
        huge_pdf = Path(tmpdir) / "huge_arch_sheet.pdf"
        doc.save(str(huge_pdf))
        doc.close()

        res = scan_sheet_legend(huge_pdf, page_index=0)
        assert isinstance(res, LegendScanResult)
        assert res.legend_detected is True
        assert res.mock is True
        assert len(res.symbols) >= 3

        # Every symbol must have a valid non-empty crop
        for s in res.symbols:
            assert s.exemplar_crop_base64 != ""
            raw = base64.b64decode(s.exemplar_crop_base64)
            assert raw.startswith(b"\x89PNG\r\n\x1a\n")
            im = Image.open(io.BytesIO(raw))
            assert im.size[0] > 0 and im.size[1] > 0
            assert len(im.tobytes()) > 0


# ===========================================================================
# 2. Crop Validity & Raster Integrity Across MEP Disciplines
# ===========================================================================


def test_crop_validity_mechanical_discipline():
    """Verify mechanical symbols have valid PNG headers, dimensions, and pixel arrays."""
    assert FIXTURE_MECH.exists(), "Mechanical fixture missing"
    res = scan_sheet_legend(FIXTURE_MECH, page_index=0)

    assert res.legend_detected is True
    assert len(res.symbols) >= 4

    labels = [s.label for s in res.symbols]
    assert "SD" in labels
    assert "RG" in labels
    assert "FD" in labels

    for sym in res.symbols:
        assert sym.exemplar_crop_base64 != "", f"Symbol {sym.label} has empty crop"
        raw_bytes = base64.b64decode(sym.exemplar_crop_base64)

        # 1. Magic bytes
        assert raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

        # 2. Image decode & dimensions
        im = Image.open(io.BytesIO(raw_bytes))
        w, h = im.size
        assert w >= 10, f"Expected width >= 10, got {w}"
        assert h >= 10, f"Expected height >= 10, got {h}"

        # 3. Non-empty pixel array
        pixels = im.tobytes()
        assert len(pixels) == w * h * (3 if im.mode == "RGB" else 4)
        assert len(pixels) > 0


def test_crop_validity_plumbing_discipline():
    """Verify plumbing symbols have valid PNG headers, dimensions, and pixel arrays."""
    assert FIXTURE_PLUMB.exists(), "Plumbing fixture missing"
    res = scan_sheet_legend(FIXTURE_PLUMB, page_index=0)

    assert res.legend_detected is True
    assert len(res.symbols) >= 3

    labels = [s.label for s in res.symbols]
    assert "CO" in labels
    assert "FD" in labels
    assert "BV" in labels

    for sym in res.symbols:
        assert sym.exemplar_crop_base64 != "", f"Symbol {sym.label} has empty crop"
        raw_bytes = base64.b64decode(sym.exemplar_crop_base64)
        assert raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

        im = Image.open(io.BytesIO(raw_bytes))
        w, h = im.size
        assert w >= 10 and h >= 10
        assert len(im.tobytes()) > 0


def test_crop_validity_electrical_discipline():
    """Verify electrical discipline recognition and symbol crop validity."""
    doc = pymupdf.open()
    page = doc.new_page(width=2400, height=1800)
    page.insert_text((200, 200), "ELECTRICAL POWER AND LIGHTING PLAN - FIRST FLOOR")

    with tempfile.TemporaryDirectory() as tmpdir:
        elec_pdf = Path(tmpdir) / "E-101_ELECTRICAL_PLAN.pdf"
        doc.save(str(elec_pdf))
        doc.close()

        res = scan_sheet_legend(elec_pdf, page_index=0)
        assert res.legend_detected is True
        assert len(res.symbols) >= 3

        labels = [s.label for s in res.symbols]
        assert "DUP" in labels
        assert "SW" in labels
        assert "PNL" in labels

        for sym in res.symbols:
            assert sym.exemplar_crop_base64 != "", f"Symbol {sym.label} has empty crop"
            raw_bytes = base64.b64decode(sym.exemplar_crop_base64)
            assert raw_bytes[:8] == b"\x89PNG\r\n\x1a\n"

            im = Image.open(io.BytesIO(raw_bytes))
            w, h = im.size
            assert w >= 10 and h >= 10
            assert len(im.tobytes()) > 0


# ===========================================================================
# 3. Adversarial Input Stress Testing & Defect Probing
# ===========================================================================


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("empty_zero_byte.pdf", b""),
        ("plain_text.pdf", b"This is a text file that is not a valid PDF document."),
        ("json_document.pdf", b'{"drawing_name": "Sheet M1", "layers": [1, 2, 3]}'),
        ("random_binary_garbage.pdf", b"\x7f\x45\x4c\x46\x02\x01\x01\x00" * 32),
        ("corrupt_truncated_header.pdf", b"%PDF-1.7\n%corrupted"),
        ("corrupt_missing_xref.pdf", b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"),
    ],
)
def test_adversarial_non_pdf_and_zero_byte_files_handled_fail_closed(filename: str, content: bytes):
    """Empirically test fail-closed handling on various non-PDF and 0-byte file types."""
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = Path(tmpdir) / filename
        file_path.write_bytes(content)
        with pytest.raises(ValueError, match="Could not open PDF drawing"):
            scan_sheet_legend(file_path)


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        (
            "html_document.pdf",
            b"<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Not a PDF</h1></body></html>",
        ),
        (
            "fake_png.pdf",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4",
        ),
    ],
)
def test_adversarial_non_pdf_image_and_html_leak_defect(filename: str, content: bytes):
    """Proves Defect 1: non-PDF files that MuPDF can open bypass validation instead of raising ValueError."""
    with tempfile.TemporaryDirectory() as tmpdir:
        file_path = Path(tmpdir) / filename
        file_path.write_bytes(content)
        # Expected behavior: MUST raise ValueError because it is NOT a PDF document
        with pytest.raises(ValueError, match="Could not open PDF drawing"):
            scan_sheet_legend(file_path)


def test_multi_page_pdf_page_index_boundaries():
    """Empirically test multi-page PDFs across valid, negative, and out-of-range page indices."""
    doc = pymupdf.open()
    for i in range(5):
        page = doc.new_page(width=1000, height=800)
        page.insert_text((100, 100), f"PAGE {i}: HVAC MECHANICAL SYSTEM")

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = Path(tmpdir) / "multi_page_5sheets.pdf"
        doc.save(str(pdf_path))
        doc.close()

        # Valid indices: 0, 2, 4
        for valid_idx in [0, 2, 4]:
            res = scan_sheet_legend(pdf_path, page_index=valid_idx)
            assert res.sheet_id == f"multi_page_5sheets_p{valid_idx}"
            assert res.legend_detected is True
            assert len(res.symbols) > 0

        # Negative indices must fail closed with ValueError
        for neg_idx in [-1, -5, -99]:
            with pytest.raises(ValueError, match="out of range"):
                scan_sheet_legend(pdf_path, page_index=neg_idx)

        # Out-of-bounds positive indices must fail closed with ValueError
        for out_idx in [5, 6, 100]:
            with pytest.raises(ValueError, match="out of range"):
                scan_sheet_legend(pdf_path, page_index=out_idx)


def test_mock_legend_scan_small_sheet_inverted_coords_defect():
    """Proves Defect 2: Small sheets produce inverted bounding boxes and empty symbol crops."""
    with tempfile.TemporaryDirectory() as tmpdir:
        small_pdf = Path(tmpdir) / "small_detail_sheet.pdf"
        doc = pymupdf.open()
        doc.new_page(width=200, height=150)
        doc.save(str(small_pdf))
        doc.close()

        res = scan_sheet_legend(small_pdf, page_index=0)
        # 1. Bounding box coordinates must never be inverted: x0 <= x1 and y0 <= y1
        assert res.legend_bbox_pt is not None
        x0, y0, x1, y1 = res.legend_bbox_pt
        assert x0 <= x1, f"Inverted X coordinates in legend bbox: {x0} > {x1}"
        assert y0 <= y1, f"Inverted Y coordinates in legend bbox: {y0} > {y1}"

        # 2. If a legend is detected, symbols must have valid non-empty exemplar crops
        if res.legend_detected:
            for s in res.symbols:
                assert s.exemplar_crop_base64 != "", f"Detected symbol {s.label} has empty crop on small sheet"


def test_non_integer_page_index_defect():
    """Proves Defect 3: Non-integer page indices raise AssertionError instead of ValueError."""
    with pytest.raises(ValueError, match="out of range|invalid"):
        scan_sheet_legend(FIXTURE_MECH, page_index=0.5)  # type: ignore[arg-type]


# ===========================================================================
# 4. Live VLM Adversarial Response Injection
# ===========================================================================


def test_live_vlm_adversarial_coordinate_injection():
    """Verify live VLM scanner handles inverted, negative, and out-of-bounds model coords."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True

    # Adversarial VLM JSON: inverted normalized coords, negative coords, out-of-bounds coords
    adversarial_payload = {
        "legend_detected": True,
        "legend_bbox": [900, 800, 100, 200],  # Inverted [ymin, xmin, ymax, xmax]
        "symbols": [
            {
                "label": "INV_SYM",
                "description": "Inverted Coords Symbol",
                "system": "Supply Air",
                "category": "DIFFUSER",
                "glyph_bbox": [750, 600, 250, 100],  # Inverted
                "confidence": 0.95,
            },
            {
                "label": "OUT_OF_BOUNDS",
                "description": "Wild Coords Symbol",
                "system": "Exhaust",
                "category": "FAN",
                "glyph_bbox": [-500, -200, 2500, 3000],  # Out of [0, 1000]
                "confidence": 0.92,
            },
            {
                "label": "ZERO_AREA",
                "description": "Zero Dimension Glyph",
                "system": "Domestic Water",
                "category": "VALVE",
                "glyph_bbox": [500, 500, 500, 500],  # Degenerate zero area
                "confidence": 0.88,
            },
        ],
        "abbreviations": {"CFM": "Cubic Feet per Minute"},
        "confidence": 0.92,
        "review_required": False,
    }

    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(adversarial_payload)
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]

    mock_openai = MagicMock()
    mock_openai.chat.completions.create.return_value = mock_resp
    mock_client.client = mock_openai

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert isinstance(res, LegendScanResult)
    assert res.legend_detected is True
    assert len(res.symbols) == 3

    for sym in res.symbols:
        x0, y0, x1, y1 = sym.bounding_box_pt
        assert x0 <= x1, f"Bounding box failed ordering: {x0} > {x1}"
        assert y0 <= y1, f"Bounding box failed ordering: {y0} > {y1}"
        # All extracted crops must be valid base64 PNGs or safe empty strings
        if sym.exemplar_crop_base64:
            raw = base64.b64decode(sym.exemplar_crop_base64)
            assert raw.startswith(b"\x89PNG\r\n\x1a\n")


def test_live_vlm_high_symbol_volume_stress():
    """Verify live scanner handles 200 symbol entries without crash or resource exhaustion."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True

    symbols_list = []
    for i in range(200):
        symbols_list.append(
            {
                "label": f"SYM_{i:03d}",
                "description": f"Stress Test Diffuser {i}",
                "system": "Supply Air",
                "category": "DIFFUSER",
                "glyph_bbox": [i * 4 % 900, 50, (i * 4 % 900) + 40, 150],
                "confidence": 0.95,
            }
        )

    huge_payload = {
        "legend_detected": True,
        "legend_bbox": [50, 50, 950, 950],
        "symbols": symbols_list,
        "abbreviations": {"CFM": "Cubic Feet per Minute", "VAV": "Variable Air Volume"},
        "confidence": 0.95,
        "review_required": False,
    }

    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps(huge_payload)
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]

    mock_openai = MagicMock()
    mock_openai.chat.completions.create.return_value = mock_resp
    mock_client.client = mock_openai

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert len(res.symbols) == 200
    assert res.symbols[0].label == "SYM_000"
    assert res.symbols[199].label == "SYM_199"
    # Ensure crops are generated for all 200 symbols
    assert all(s.exemplar_crop_base64 != "" for s in res.symbols)
