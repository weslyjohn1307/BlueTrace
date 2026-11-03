"""Comprehensive unit and integration tests for LegendScanner (TASK-003).

Verifies:
- LegendSymbolEntry and LegendScanResult schemas and serialization.
- Mock mode for Mechanical, Plumbing, and Electrical disciplines with real 150 DPI exemplar glyph crops.
- Live VLM mode targeting candidate tiles, denormalizing normalized [0, 1000] coordinates,
  OpenAI SDK and httpx fallback execution, and exemplar generation.
- Fail-closed error handling (missing files, 0-byte files, out-of-range pages,
  network timeouts, malformed JSON, schema validation failures).
"""

from __future__ import annotations

import base64
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import openai
import pytest

from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import (
    LegendScanner,
    LegendScanResult,
    LegendSymbolDefinition,
    LegendSymbolEntry,
    scan_sheet_legend,
)
from src.meta_services.tiling import (
    SheetTilingEngine,
    SymbolCandidate,
    apply_box_iou_nms,
    untile_candidate,
)

FIXTURE_MECH = Path("fixtures/mechanical/hvac_plan_level2.pdf")
FIXTURE_PLUMB = Path("fixtures/plumbing/plumbing_plan_level4.pdf")


# ---------------------------------------------------------------------------
# 1. Dataclass & Serialization Contracts
# ---------------------------------------------------------------------------


def test_legend_symbol_entry_dataclass_and_dict():
    """Verify LegendSymbolEntry attributes and to_dict() serialization."""
    entry = LegendSymbolEntry(
        symbol_id="sym_1",
        label="SD",
        description="Supply Air Ceiling Diffuser",
        system="Supply Air",
        category="DIFFUSER",
        bounding_box_pt=(100.123, 200.456, 150.789, 250.012),
        exemplar_crop_base64="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        confidence=0.96,
        status="SUGGESTED",
    )
    assert entry.symbol_id == "sym_1"
    assert entry.label == "SD"
    assert entry.status == "SUGGESTED"

    d = entry.to_dict()
    assert d["symbol_id"] == "sym_1"
    assert d["label"] == "SD"
    assert d["description"] == "Supply Air Ceiling Diffuser"
    assert d["system"] == "Supply Air"
    assert d["category"] == "DIFFUSER"
    assert d["bounding_box_pt"] == [100.12, 200.46, 150.79, 250.01]
    assert d["exemplar_crop_base64"] == "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
    assert d["confidence"] == 0.96
    assert d["status"] == "SUGGESTED"

    # Compatibility alias check
    assert LegendSymbolDefinition is LegendSymbolEntry


def test_legend_scan_result_dataclass_and_dict():
    """Verify LegendScanResult structure and to_dict() serialization."""
    sym = LegendSymbolEntry(
        symbol_id="sym_1",
        label="FD",
        description="Fire Damper",
        system="Fire Life Safety",
        bounding_box_pt=(50.0, 50.0, 90.0, 90.0),
    )
    result = LegendScanResult(
        sheet_id="sheet_01",
        legend_detected=True,
        legend_bbox_pt=(40.0, 40.0, 300.0, 500.0),
        symbols=[sym],
        abbreviations={"FD": "Fire Damper"},
        confidence=0.95,
        mock=False,
        review_required=False,
    )

    d = result.to_dict()
    assert d["sheet_id"] == "sheet_01"
    assert d["legend_detected"] is True
    assert d["legend_bbox_pt"] == [40.0, 40.0, 300.0, 500.0]
    assert d["symbols_count"] == 1
    assert len(d["symbols"]) == 1
    assert d["symbols"][0]["label"] == "FD"
    assert d["abbreviations"]["FD"] == "Fire Damper"
    assert d["confidence"] == 0.95
    assert d["mock"] is False
    assert d["review_required"] is False


# ---------------------------------------------------------------------------
# 2. Mock Mode Extraction with Real Exemplar Glyph Crops
# ---------------------------------------------------------------------------


def test_mock_mode_mechanical_exemplar_crops():
    """Mechanical mock mode produces non-empty, valid 150 DPI PNG glyph crops."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    assert client.is_configured() is False

    res = scan_sheet_legend(FIXTURE_MECH, page_index=0, client=client)

    assert isinstance(res, LegendScanResult)
    assert res.legend_detected is True
    assert res.legend_bbox_pt is not None
    assert res.mock is True
    assert res.review_required is False
    assert len(res.symbols) >= 5

    labels = [s.label for s in res.symbols]
    for expected in ["SD", "RG", "FD", "VD", "VAV"]:
        assert expected in labels

    assert "CFM" in res.abbreviations
    assert res.abbreviations["CFM"] == "Cubic Feet per Minute"

    # Verify that every extracted symbol contains genuine 150 DPI PNG raster crops
    for sym in res.symbols:
        assert sym.exemplar_crop_base64 != "", f"Exemplar crop missing for {sym.label}"
        raw_bytes = base64.b64decode(sym.exemplar_crop_base64)
        assert raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"), f"Not a valid PNG for {sym.label}"
        assert sym.status == "SUGGESTED"
        assert sym.confidence >= 0.90


def test_mock_mode_plumbing_exemplar_crops():
    """Plumbing mock mode adapts symbols and extracts valid PNG glyph crops."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    res = scan_sheet_legend(FIXTURE_PLUMB, page_index=0, client=client)

    assert res.legend_detected is True
    assert res.mock is True
    assert len(res.symbols) >= 3

    labels = [s.label for s in res.symbols]
    assert "CO" in labels
    assert "FD" in labels
    assert "BV" in labels

    assert "SAN" in res.abbreviations
    assert "CW" in res.abbreviations

    for sym in res.symbols:
        assert sym.exemplar_crop_base64 != ""
        raw = base64.b64decode(sym.exemplar_crop_base64)
        assert raw.startswith(b"\x89PNG\r\n\x1a\n")
        assert sym.status == "SUGGESTED"


def test_mock_mode_electrical_exemplar_crops(tmp_path: Path):
    """Electrical mock mode activates on electrical drawing name and generates valid crops."""
    # Create an electrical copy of the mechanical fixture
    elec_pdf = tmp_path / "E101_ELECTRICAL_POWER_PLAN.pdf"
    elec_pdf.write_bytes(FIXTURE_MECH.read_bytes())

    client = MetaModelClient(api_key="mock_key_unconfigured")
    res = scan_sheet_legend(elec_pdf, page_index=0, client=client)

    assert res.legend_detected is True
    assert res.mock is True

    labels = [s.label for s in res.symbols]
    assert "DUP" in labels
    assert "SW" in labels
    assert "PNL" in labels

    assert "EMT" in res.abbreviations
    assert "EGC" in res.abbreviations

    for sym in res.symbols:
        assert sym.exemplar_crop_base64 != ""
        raw = base64.b64decode(sym.exemplar_crop_base64)
        assert raw.startswith(b"\x89PNG\r\n\x1a\n")
        assert sym.status == "SUGGESTED"


# ---------------------------------------------------------------------------
# 3. Live VLM Extraction with Candidate Tile Grounding & Denormalization
# ---------------------------------------------------------------------------


def test_live_vlm_normalized_coordinates_denormalization():
    """Normalized [ymin, xmin, ymax, xmax] coordinates from muse-spark-1.3 are denormalized."""
    # VLM output simulating normalized [0, 1000] bounding boxes relative to the candidate tile
    mock_vlm_json = (
        '{\n'
        '  "legend_detected": true,\n'
        '  "legend_bbox": [50, 50, 900, 950],\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "VAV",\n'
        '      "description": "Variable Air Volume Terminal Box",\n'
        '      "system": "Supply Air",\n'
        '      "category": "EQUIPMENT",\n'
        '      "glyph_bbox": [100, 100, 200, 200],\n'
        '      "confidence": 0.94\n'
        '    }\n'
        '  ],\n'
        '  "abbreviations": {"VAV": "Variable Air Volume"},\n'
        '  "confidence": 0.94,\n'
        '  "review_required": false\n'
        '}'
    )

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    mock_choice = MagicMock()
    mock_choice.message.content = mock_vlm_json
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.mock is False
    assert res.legend_detected is True
    assert res.review_required is False
    assert len(res.symbols) == 1

    sym = res.symbols[0]
    assert sym.label == "VAV"
    assert sym.description == "Variable Air Volume Terminal Box"
    assert sym.confidence == 0.94
    assert sym.status == "SUGGESTED"

    # Coordinates must be denormalized into positive PDF points
    x0, y0, x1, y1 = sym.bounding_box_pt
    assert x0 > 0.0 and y0 > 0.0
    assert x1 > x0 and y1 > y0

    # Must generate a genuine 150 DPI exemplar crop
    assert sym.exemplar_crop_base64 != ""
    raw = base64.b64decode(sym.exemplar_crop_base64)
    assert raw.startswith(b"\x89PNG\r\n\x1a\n")


def test_live_vlm_httpx_fallback_execution():
    """When OpenAI SDK is unavailable (client.client is None), direct httpx fallback succeeds."""
    mock_vlm_json = (
        '{\n'
        '  "legend_detected": true,\n'
        '  "legend_bbox_pt": [2400.0, 200.0, 2900.0, 1800.0],\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "SD",\n'
        '      "description": "Supply Diffuser",\n'
        '      "system": "Supply Air",\n'
        '      "category": "DIFFUSER",\n'
        '      "bbox_pt": [2450.0, 300.0, 2520.0, 350.0],\n'
        '      "confidence": 0.95\n'
        '    }\n'
        '  ],\n'
        '  "abbreviations": {"CFM": "Cubic Feet per Minute"},\n'
        '  "confidence": 0.95,\n'
        '  "review_required": false\n'
        '}'
    )

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_client.client = None  # Forces httpx fallback
    mock_client.base_url = "https://api.meta.ai/v1"
    mock_client.api_key = "test_live_api_key_12345"

    fake_http_response = MagicMock(spec=httpx.Response)
    fake_http_response.raise_for_status.return_value = None
    fake_http_response.json.return_value = {
        "choices": [{"message": {"content": mock_vlm_json}}]
    }

    with patch("httpx.Client.post", return_value=fake_http_response) as mock_post:
        scanner = LegendScanner(client=mock_client)
        res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

        assert mock_post.called
        assert res.mock is False
        assert res.legend_detected is True
        assert len(res.symbols) == 1
        assert res.symbols[0].label == "SD"
        assert res.symbols[0].exemplar_crop_base64 != ""


def test_live_vlm_markdown_wrapped_response():
    """VLM responses wrapped in markdown code blocks (```json ... ```) parse cleanly."""
    markdown_wrapped = (
        "Here is the detected symbol legend:\n\n"
        "```json\n"
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "FD",\n'
        '      "description": "Fusible Link Fire Damper",\n'
        '      "system": "Fire Life Safety",\n'
        '      "category": "DAMPER",\n'
        '      "glyph_bbox": [200, 200, 300, 300],\n'
        '      "confidence": 0.96\n'
        '    }\n'
        '  ],\n'
        '  "abbreviations": {"FD": "Fire Damper"}\n'
        "}\n"
        "```\n"
        "All symbols conform to standard AEC convention."
    )

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    mock_choice = MagicMock()
    mock_choice.message.content = markdown_wrapped
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.legend_detected is True
    assert len(res.symbols) == 1
    assert res.symbols[0].label == "FD"
    assert res.abbreviations["FD"] == "Fire Damper"


def test_live_vlm_clean_negative_detection():
    """Sheets without legends are reported with clean negative detection."""
    negative_json = (
        '{"legend_detected": false, "legend_bbox": null, "symbols": [], "abbreviations": {}, "confidence": 0.0, "review_required": false}'
    )

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    mock_choice = MagicMock()
    mock_choice.message.content = negative_json
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.legend_detected is False
    assert len(res.symbols) == 0
    assert res.confidence == 0.0
    assert res.review_required is False


def test_live_vlm_low_confidence_triggers_review_required():
    """If detection confidence is < 0.85, review_required is flagged."""
    low_conf_json = (
        '{\n'
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "CO",\n'
        '      "description": "Unclear cleanout symbol",\n'
        '      "confidence": 0.65\n'
        '    }\n'
        '  ],\n'
        '  "confidence": 0.65,\n'
        '  "review_required": false\n'
        '}'
    )

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    mock_choice = MagicMock()
    mock_choice.message.content = low_conf_json
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.legend_detected is True
    assert res.review_required is True


# ---------------------------------------------------------------------------
# 4. Fail-Closed Error Handling & Guardrails
# ---------------------------------------------------------------------------


def test_fail_closed_missing_or_corrupt_files(tmp_path: Path):
    """Missing, empty, or corrupt files strictly raise ValueError."""
    with pytest.raises(ValueError, match="PDF drawing file not found"):
        scan_sheet_legend("fixtures/non_existent_random_blueprint_123.pdf")

    with pytest.raises(ValueError):
        scan_sheet_legend("")

    with pytest.raises(ValueError):
        scan_sheet_legend(tmp_path)

    zero_byte = tmp_path / "zero.pdf"
    zero_byte.write_bytes(b"")
    with pytest.raises(ValueError, match="Could not open PDF drawing"):
        scan_sheet_legend(zero_byte)

    corrupt = tmp_path / "corrupt.pdf"
    corrupt.write_text("not a pdf", encoding="utf-8")
    with pytest.raises(ValueError, match="Could not open PDF drawing"):
        scan_sheet_legend(corrupt)


def test_fail_closed_page_index_out_of_range():
    """Invalid page indices strictly raise ValueError."""
    with pytest.raises(ValueError, match="Page index -1 out of range"):
        scan_sheet_legend(FIXTURE_MECH, page_index=-1)

    with pytest.raises(ValueError, match="Page index 999 out of range"):
        scan_sheet_legend(FIXTURE_MECH, page_index=999)


def test_fail_closed_live_network_timeout():
    """Network errors during live scan fail closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai
    mock_openai.chat.completions.create.side_effect = RuntimeError("API Gateway 504 Timeout")

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert len(res.symbols) == 0


def test_fail_closed_live_openai_api_timeout():
    """openai.APITimeoutError during live scan fails closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai
    mock_openai.chat.completions.create.side_effect = openai.APITimeoutError(
        request=MagicMock()
    )

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert isinstance(res, LegendScanResult)
    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert res.symbols == []
    assert res.abbreviations == {}
    assert res.mock is False


def test_fail_closed_live_openai_api_status_error_504():
    """openai.APIStatusError (504 Gateway Timeout) during live scan fails closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai
    mock_openai.chat.completions.create.side_effect = openai.APIStatusError(
        message="504 Gateway Timeout",
        response=MagicMock(status_code=504),
        body=None,
    )

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert res.symbols == []
    assert res.abbreviations == {}


def test_fail_closed_live_openai_internal_server_error_500():
    """openai.InternalServerError (500) during live scan fails closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai
    mock_openai.chat.completions.create.side_effect = openai.InternalServerError(
        message="500 Internal Server Error",
        response=MagicMock(status_code=500),
        body=None,
    )

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert res.symbols == []
    assert res.abbreviations == {}


@pytest.mark.parametrize(
    "openai_error",
    [
        openai.APITimeoutError(request=MagicMock()),
        openai.APIConnectionError(request=MagicMock()),
        openai.InternalServerError(
            message="500 Internal Server Error",
            response=MagicMock(status_code=500),
            body=None,
        ),
        openai.APIStatusError(
            message="504 Gateway Timeout",
            response=MagicMock(status_code=504),
            body=None,
        ),
        openai.RateLimitError(
            message="429 Rate Limit Exceeded",
            response=MagicMock(status_code=429),
            body=None,
        ),
        openai.BadRequestError(
            message="400 Bad Request",
            response=MagicMock(status_code=400),
            body=None,
        ),
        openai.OpenAIError("Generic OpenAI protocol failure"),
    ],
    ids=[
        "APITimeoutError",
        "APIConnectionError",
        "InternalServerError_500",
        "APIStatusError_504",
        "RateLimitError_429",
        "BadRequestError_400",
        "OpenAIError_generic",
    ],
)
def test_fail_closed_live_openai_exceptions_matrix(openai_error: Exception):
    """Verify that all OpenAI SDK exceptions fail closed cleanly via scan_sheet_legend."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai
    mock_openai.chat.completions.create.side_effect = openai_error

    res = scan_sheet_legend(FIXTURE_MECH, page_index=0, client=mock_client)

    assert isinstance(res, LegendScanResult)
    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert res.symbols == []
    assert res.abbreviations == {}
    assert res.mock is False

    d = res.to_dict()
    assert d["review_required"] is True
    assert d["confidence"] == 0.0
    assert d["legend_detected"] is False
    assert d["symbols"] == []
    assert d["symbols_count"] == 0


def test_fail_closed_malformed_json_response():
    """Malformed or truncated JSON fails closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    mock_choice = MagicMock()
    mock_choice.message.content = "{\"legend_detected\": true, \"symbols\": [{\"truncated\": "
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert len(res.symbols) == 0


def test_fail_closed_pydantic_schema_type_mismatch():
    """Pydantic validation errors (invalid types) fail closed with review_required=True."""
    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_openai = MagicMock()
    mock_client.client = mock_openai

    # symbols is expected to be a list, pass an integer
    mock_choice = MagicMock()
    mock_choice.message.content = '{"legend_detected": true, "symbols": 12345}'
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai.chat.completions.create.return_value = mock_resp

    scanner = LegendScanner(client=mock_client)
    res = scanner.scan_sheet(FIXTURE_MECH, page_index=0)

    assert res.review_required is True
    assert res.confidence == 0.0
    assert res.legend_detected is False
    assert len(res.symbols) == 0


def test_crop_glyph_edge_cases():
    """_crop_glyph handles inverted, degenerate, and out-of-page coordinates safely."""
    import pymupdf

    doc = pymupdf.open(str(FIXTURE_MECH))
    page = doc[0]

    # Inverted coordinates: x0 > x1, y0 > y1
    b64_inv = LegendScanner._crop_glyph(page, (200.0, 200.0, 100.0, 100.0))
    assert b64_inv != ""
    assert base64.b64decode(b64_inv).startswith(b"\x89PNG\r\n\x1a\n")

    # Degenerate zero-size box: x0 == x1, y0 == y1
    b64_degen = LegendScanner._crop_glyph(page, (150.0, 150.0, 150.0, 150.0))
    assert b64_degen != ""
    assert base64.b64decode(b64_degen).startswith(b"\x89PNG\r\n\x1a\n")

    # Out of page bounds coordinates: completely outside page rect
    b64_outside = LegendScanner._crop_glyph(page, (10000.0, 10000.0, 10500.0, 10500.0))
    assert b64_outside == ""

    doc.close()


# ---------------------------------------------------------------------------
# 5. Vector-Aware Sliding Window Tiling (TASK-SYM-001) & NMS (TASK-SYM-003)
# ---------------------------------------------------------------------------


def _synthetic_center_content_page():
    """In-memory 2592 x 1728 pt page (= 5400 x 3600 px at 150 DPI).

    Content lives only near the centre; margins stay empty. No binary fixture.
    """
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page(width=2592.0, height=1728.0)
    page.insert_text((1200.0, 800.0), "SUPPLY AIR DUCT 24x12", fontsize=24)
    page.draw_line(pymupdf.Point(1100.0, 700.0), pymupdf.Point(1500.0, 700.0))
    page.draw_line(pymupdf.Point(1100.0, 720.0), pymupdf.Point(1500.0, 720.0))
    page.draw_line(pymupdf.Point(1100.0, 740.0), pymupdf.Point(1500.0, 740.0))
    page.draw_rect(pymupdf.Rect(1150.0, 780.0, 1450.0, 900.0))
    return doc, page


def test_tiling_grid_decomposition():
    """150 DPI sheet decomposes into 35 tiles; empty margins flagged EMPTY."""
    engine = SheetTilingEngine()

    # Pure-math grid: no page needed for geometry assertions.
    tiles = engine.tile_sheet()
    assert len(tiles) == 35

    cols = sorted({t.col for t in tiles})
    rows = sorted({t.row for t in tiles})
    assert cols == [0, 1, 2, 3, 4, 5, 6]
    assert rows == [0, 1, 2, 3, 4]

    x_offsets = sorted({t.x_offset_px for t in tiles})
    y_offsets = sorted({t.y_offset_px for t in tiles})
    assert x_offsets[0] == 0
    assert x_offsets[1] - x_offsets[0] == 819  # 20% overlap stride
    assert x_offsets[-1] == 5400 - 1024  # clamped final column
    assert y_offsets[-1] == 3600 - 1024  # clamped final row
    for t in tiles:
        assert (t.col, t.row, t.x_offset_px, t.y_offset_px) is not None
        assert t.width_px == 1024 and t.height_px == 1024

    # Vector prefilter on a synthetic page: margins EMPTY, centre CONTENT.
    doc, page = _synthetic_center_content_page()
    try:
        filtered = engine.tile_sheet(page)
        assert len(filtered) == 35
        by_pos = {(t.col, t.row): t for t in filtered}
        assert by_pos[(0, 0)].status == "EMPTY"  # top-left margin, no content
        assert by_pos[(6, 4)].status == "EMPTY"  # bottom-right margin
        content_tiles = [t for t in filtered if t.status == "CONTENT"]
        empty_tiles = [t for t in filtered if t.status == "EMPTY"]
        assert len(content_tiles) >= 1
        assert len(empty_tiles) >= 1
        assert any(t.word_count > 0 for t in content_tiles)
    finally:
        doc.close()

    # Mock page injectable: zero content -> every tile abstains as EMPTY.
    mock_empty = MagicMock()
    mock_empty.get_text.return_value = []
    mock_empty.get_drawings.return_value = []
    assert all(t.status == "EMPTY" for t in engine.tile_sheet(mock_empty))

    # Mock page with words -> CONTENT tiles (inference must run).
    mock_words = MagicMock()
    mock_words.get_text.return_value = [("w", 1.0, 2.0, 3.0, 4.0, "DUCT", 0, 0)]
    mock_words.get_drawings.return_value = []
    assert all(t.status == "CONTENT" for t in engine.tile_sheet(mock_words))


def test_nms_deduplication():
    """205 px-margin overlap merges same-label duplicates; conflicts flagged."""
    # Same glyph seen in adjacent overlapping tiles (stride 819, tile 1024):
    # tile 0 box u=[800..1000] and tile 1 (x_off=819) box u=[0..200]
    # map to nearly identical sheet boxes -> IoU ~ 1.0.
    low = SymbolCandidate(
        symbol_label="SD",
        tile_col=0,
        tile_row=0,
        x_offset_px=0,
        y_offset_px=0,
        tile_bbox=(800.0, 100.0, 1000.0, 300.0),
        confidence=0.82,
    )
    high = SymbolCandidate(
        symbol_label="SD",
        tile_col=1,
        tile_row=0,
        x_offset_px=819,
        y_offset_px=0,
        tile_bbox=(0.0, 100.0, 200.0, 300.0),
        confidence=0.95,
    )
    # Un-tile sanity: X_sheet = X_off + u * 1.024, x_pt = X_sheet * 0.48.
    bx = untile_candidate(high)
    assert bx[0] == pytest.approx((819 + 0.0 * 1.024) * 0.48)
    assert bx[2] == pytest.approx((819 + 200.0 * 1.024) * 0.48)

    merged = apply_box_iou_nms([low, high])
    assert len(merged) == 1
    assert merged[0].confidence == 0.95
    assert merged[0].bbox_pt is not None

    # Conflicting labels on the same overlap: both kept, both flagged.
    conflict_a = SymbolCandidate(
        symbol_label="SD",
        tile_col=0,
        tile_row=0,
        x_offset_px=0,
        y_offset_px=0,
        tile_bbox=(800.0, 100.0, 1000.0, 300.0),
        confidence=0.88,
    )
    conflict_b = SymbolCandidate(
        symbol_label="RG",
        tile_col=1,
        tile_row=0,
        x_offset_px=819,
        y_offset_px=0,
        tile_bbox=(0.0, 100.0, 200.0, 300.0),
        confidence=0.86,
    )
    flagged = apply_box_iou_nms([conflict_a, conflict_b])
    assert len(flagged) == 2
    assert all(c.review_required is True for c in flagged)

    # Distant boxes never interact.
    far = SymbolCandidate(
        symbol_label="SD",
        tile_col=6,
        tile_row=4,
        x_offset_px=4376,
        y_offset_px=2576,
        tile_bbox=(0.0, 0.0, 100.0, 100.0),
        confidence=0.91,
    )
    kept = apply_box_iou_nms([high, far])
    assert len(kept) == 2
    assert all(c.review_required is False for c in kept)


# ---------------------------------------------------------------------------
# 7. SYM-002 Parallel Tile Inference Swarm (muse-spark-1.3, offline mock)
# ---------------------------------------------------------------------------


async def test_tile_inference_swarm():
    """Offline mock returns detections across 4 parallel tiles; semaphore honored."""
    import threading
    import time

    from src.meta_services.symbol_swarm import (
        build_tile_prompt,
        parse_tile_detections,
        run_swarm,
        swarm_outcomes_to_detections,
    )
    from src.meta_services.tiling import untile_candidate

    lock = threading.Lock()
    state = {"current": 0, "max_seen": 0}

    def _tile_payload(idx: int) -> str:
        return (
            '{"detections": ['
            f'{{"symbol_label": "SD", "tile_bbox": [{10 + idx}, 20, {110 + idx}, 120], '
            '"confidence": 0.93},'
            '{"symbol_label": "RG", "tile_bbox": [300, 300, 400, 420], "confidence": 0.81}'
            "]}"
        )

    payloads = [_tile_payload(i) for i in range(4)]
    call_order = {"n": 0}

    class _OrderedMockClient:
        def _execute_governed_completion(self, **kwargs):
            with lock:
                state["current"] += 1
                state["max_seen"] = max(state["max_seen"], state["current"])
                n = call_order["n"]
                call_order["n"] += 1
            try:
                time.sleep(0.1)
            finally:
                with lock:
                    state["current"] -= 1
            return payloads[n % 4], {"mock": True}

    fake_tile_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode("ascii")
    exemplars = [
        {"label": "SD", "exemplar_crop_base64": fake_tile_png},
        {"label": "RG", "exemplar_crop_base64": fake_tile_png},
    ]

    # Prompt formatter: text + one image part per exemplar + tile image.
    messages = build_tile_prompt(fake_tile_png, exemplars)
    assert isinstance(messages, list) and len(messages) == 1
    parts = messages[0]["content"]
    assert parts[0]["type"] == "text"
    assert sum(1 for p in parts if p.get("type") == "image_url") == 3

    tiles = [
        {
            "tile_index": i,
            "col": i % 2,
            "row": i // 2,
            "x_offset_px": float((i % 2) * 819),
            "y_offset_px": float((i // 2) * 819),
            "tile_png_bytes": fake_tile_png,
            "status": "CONTENT",
        }
        for i in range(4)
    ]
    # EMPTY tiles bypass inference (SYM-001 vector pre-filter contract).
    tiles.append(
        {
            "tile_index": 4,
            "col": 0,
            "row": 2,
            "x_offset_px": 0.0,
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_tile_png,
            "status": "EMPTY",
        }
    )

    client = _OrderedMockClient()
    outcomes = await run_swarm(tiles, exemplars, client, max_concurrency=4)

    # Per-tile outcome records (fail-closed contract): 4 OK + 1 EMPTY bypass,
    # in input-tile order; the flat candidate list comes from the compat helper.
    assert len(outcomes) == 5
    assert [o["status"] for o in outcomes] == ["OK", "OK", "OK", "OK", "EMPTY"]
    assert [o["tile_index"] for o in outcomes] == [0, 1, 2, 3, 4]
    assert all(o["review_required"] is False for o in outcomes)
    candidates = swarm_outcomes_to_detections(outcomes)

    # 4 tiles x 2 detections each; EMPTY tile contributes nothing.
    assert len(candidates) == 8
    assert state["max_seen"] <= 4
    assert state["max_seen"] > 1
    assert call_order["n"] == 4
    for cand in candidates:
        assert cand["symbol_label"] in ("SD", "RG")
        assert len(cand["tile_bbox"]) == 4
        assert 0.0 <= cand["confidence"] <= 1.0
        assert cand["tile_index"] in (0, 1, 2, 3)
        assert "x_offset_px" in cand and "y_offset_px" in cand

    # Swarm output feeds the SYM-003 un-tiling contract (normalized [0, 1000]).
    first = dict(candidates[0])
    assert first["tile_bbox"][2] <= 1000.0
    pt_box = untile_candidate(
        SymbolCandidate(
            symbol_label=first["symbol_label"],
            tile_col=int(candidates[0].get("tile_col", 0)),
            tile_row=int(candidates[0].get("tile_row", 0)),
            x_offset_px=int(first["x_offset_px"]),
            y_offset_px=int(first["y_offset_px"]),
            tile_bbox=tuple(first["tile_bbox"]),
            confidence=first["confidence"],
        )
    )
    assert pt_box[2] > pt_box[0] and pt_box[3] > pt_box[1]

    # Strict parser: malformed entries rejected, never defaulted.
    assert parse_tile_detections("not json at all") == []
    assert parse_tile_detections('{"detections": "oops"}') == []
    bad = parse_tile_detections(
        '{"detections": ['
        '{"symbol_label": "", "tile_bbox": [1, 1, 5, 5], "confidence": 0.9},'
        '{"symbol_label": "XX", "tile_bbox": [500, 500, 100, 100], "confidence": 0.9},'
        '{"symbol_label": "YY", "tile_bbox": [1, 1, 5, 5], "confidence": 1.5},'
        '{"symbol_label": "ZZ", "tile_bbox": [0, 0, 500, 500]}'
        "]}"
    )
    assert bad == []


# ---------------------------------------------------------------------------
# 8. SYM-004 Two-Tier Verifier Pass (borderline adjudication)
# ---------------------------------------------------------------------------


def test_two_tier_symbol_verifier():
    """Mismatching borderline glyph demoted to 0.20 and flagged for review."""
    from src.meta_services.symbol_swarm import verify_borderline

    fake_crop_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).decode("ascii")

    def _crop_fn(candidate):
        assert candidate["symbol_label"] in ("SD", "RG", "VAV", "FD")
        return fake_crop_b64

    def _verdict_for(messages):
        text = messages[0]["content"][0]["text"]
        assert "Does this candidate match the exemplar glyph for" in text
        assert "Response JSON" in text
        if '"SD"' in text:
            return '{"match": false, "confidence": 0.25}', {"mock": True}
        return '{"match": true, "confidence": 0.88}', {"mock": True}

    class _MockVerifierClient:
        def _execute_governed_completion(self, **kwargs):
            return _verdict_for(kwargs["messages"])

    candidates = [
        {"symbol_label": "SD", "tile_bbox": [10, 20, 110, 120], "confidence": 0.82},
        {"symbol_label": "RG", "tile_bbox": [300, 300, 400, 420], "confidence": 0.75},
        {"symbol_label": "VAV", "tile_bbox": [0, 0, 50, 50], "confidence": 0.95},
        {"symbol_label": "FD", "tile_bbox": [0, 0, 50, 50], "confidence": 0.50},
    ]

    out = verify_borderline(candidates, _MockVerifierClient(), _crop_fn)

    assert len(out) == 4
    mismatch = out[0]
    assert mismatch["confidence"] == 0.20
    assert mismatch["review_required"] is True

    confirmed = out[1]
    assert confirmed["confidence"] == 0.75
    assert confirmed["review_required"] is False

    # Non-borderline candidates pass through untouched.
    assert out[2]["confidence"] == 0.95
    assert out[3]["confidence"] == 0.50
    assert "review_required" not in out[2]
    assert "review_required" not in out[3]


# ---------------------------------------------------------------------------
# 9. Failure-hunter hardening (S1#1/#2/#3, S2#4-8, SYM-005 contract)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("failure", [RuntimeError("boom"), ValueError("bad"), OSError("io")])
def test_tiling_drawings_failure_forces_content(failure):
    """S1#1: get_drawings raising forces every tile CONTENT (fail closed, never EMPTY)."""
    engine = SheetTilingEngine()
    mock_page = MagicMock()
    mock_page.get_text.return_value = []
    mock_page.get_drawings.side_effect = failure
    tiles = engine.tile_sheet(mock_page)
    assert len(tiles) == 35
    assert all(t.status == "CONTENT" for t in tiles)


async def test_swarm_infra_failure_returns_flagged_records():
    """S1#2: all-tiles-timeout surfaces INFERENCE_FAILED records, not silent []."""
    from src.meta_services.symbol_swarm import run_swarm, swarm_outcomes_to_detections

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _TimeoutClient:
        def _execute_governed_completion(self, **kwargs):
            raise TimeoutError("model call timed out")

    tiles = [
        {
            "tile_index": i,
            "col": i,
            "row": 0,
            "x_offset_px": float(i * 819),
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_png,
            "status": "CONTENT",
        }
        for i in range(3)
    ]
    outcomes = await run_swarm(tiles, exemplars, _TimeoutClient(), max_concurrency=2)
    assert len(outcomes) == 3
    assert all(o["status"] == "INFERENCE_FAILED" for o in outcomes)
    assert all(o["review_required"] is True for o in outcomes)
    assert all(o["detections"] == [] for o in outcomes)
    # The flat helper carries no detections, but the failure is NOT silent:
    # the records above say exactly what failed.
    assert swarm_outcomes_to_detections(outcomes) == []


async def test_swarm_mixed_failure_keeps_good_tiles():
    """S1#2: one failing tile is flagged without aborting its siblings."""
    from src.meta_services.symbol_swarm import run_swarm, swarm_outcomes_to_detections

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _FlakyClient:
        def __init__(self):
            self.calls = 0

        def _execute_governed_completion(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                raise ConnectionError("transport reset")
            payload = (
                '{"detections": [{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], '
                '"confidence": 0.9}]}'
            )
            return payload, {"mock": True}

    tiles = [
        {
            "tile_index": i,
            "col": i,
            "row": 0,
            "x_offset_px": float(i * 819),
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_png,
            "status": "CONTENT",
        }
        for i in range(2)
    ]
    outcomes = await run_swarm(tiles, exemplars, _FlakyClient(), max_concurrency=1)
    by_status = {o["tile_index"]: o["status"] for o in outcomes}
    assert set(by_status.values()) == {"INFERENCE_FAILED", "OK"}
    assert swarm_outcomes_to_detections(outcomes) != []


async def test_swarm_exemplar_gating():
    """S1#3: all-EMPTY tiles legitimately return []; active tiles without
    exemplars raise ValueError NO_EXEMPLARS instead of a silent []."""
    from src.meta_services.symbol_swarm import run_swarm

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")

    class _NeverCalledClient:
        def _execute_governed_completion(self, **kwargs):  # pragma: no cover
            raise AssertionError("EMPTY tiles must bypass inference")

    empty_tiles = [
        {
            "tile_index": 0,
            "col": 0,
            "row": 0,
            "x_offset_px": 0.0,
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_png,
            "status": "EMPTY",
        }
    ]
    assert await run_swarm(empty_tiles, [], _NeverCalledClient()) == []

    active_tiles = [dict(t, status="CONTENT") for t in empty_tiles]
    with pytest.raises(ValueError, match="NO_EXEMPLARS"):
        await run_swarm(active_tiles, [], _NeverCalledClient())
    with pytest.raises(ValueError, match="NO_EXEMPLARS"):
        await run_swarm(active_tiles, None, _NeverCalledClient())


def test_swarm_parse_allowlist_rejects_invented_labels():
    """S2#4: labels outside the exemplar set are rejected (dropped, not flagged)."""
    from src.meta_services.symbol_swarm import parse_tile_detections

    raw = (
        '{"detections": ['
        '{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], "confidence": 0.9},'
        '{"symbol_label": "ZZ-INVENTED", "tile_bbox": [70, 70, 120, 120], "confidence": 0.99}'
        "]}"
    )
    kept = parse_tile_detections(raw, allowed_labels={"SD", "RG"})
    assert [d["symbol_label"] for d in kept] == ["SD"]
    # No allowlist: legacy behavior preserved (parser validates shape only).
    assert len(parse_tile_detections(raw)) == 2


async def test_swarm_passes_exemplar_allowlist():
    """S2#4 end-to-end: run_swarm filters model-invented labels via exemplars."""
    from src.meta_services.symbol_swarm import run_swarm, swarm_outcomes_to_detections

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _InventiveClient:
        def _execute_governed_completion(self, **kwargs):
            payload = (
                '{"detections": ['
                '{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], "confidence": 0.9}, '
                '{"symbol_label": "ZZ", "tile_bbox": [70, 70, 120, 120], "confidence": 0.99}'
                "]}"
            )
            return payload, {"mock": True}

    tiles = [
        {
            "tile_index": 0,
            "col": 0,
            "row": 0,
            "x_offset_px": 0.0,
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_png,
            "status": "CONTENT",
        }
    ]
    outcomes = await run_swarm(tiles, exemplars, _InventiveClient())
    assert outcomes[0]["status"] == "OK"
    dets = swarm_outcomes_to_detections(outcomes)
    assert [d["symbol_label"] for d in dets] == ["SD"]


async def test_swarm_raster_and_offsets_required():
    """S2#5: missing raster -> INFERENCE_FAILED record (never silent []);
    missing offsets -> ValueError (no 0.0 default)."""
    import asyncio

    from src.meta_services.symbol_swarm import _infer_single_tile, run_swarm

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _NeverCalledClient:
        def _execute_governed_completion(self, **kwargs):  # pragma: no cover
            raise AssertionError("tile without raster must not reach the model")

    sem = asyncio.Semaphore(4)
    no_raster = {
        "tile_index": 0,
        "col": 0,
        "row": 0,
        "x_offset_px": 0.0,
        "y_offset_px": 0.0,
        "status": "CONTENT",
    }
    outcome = await _infer_single_tile(no_raster, exemplars, _NeverCalledClient(), sem)
    assert outcome["status"] == "INFERENCE_FAILED"
    assert outcome["review_required"] is True
    assert outcome["detections"] == []

    outcomes = await run_swarm([no_raster], exemplars, _NeverCalledClient())
    assert outcomes[0]["status"] == "INFERENCE_FAILED"
    assert outcomes[0]["review_required"] is True

    no_offsets = {"tile_index": 1, "col": 1, "row": 0, "tile_png_bytes": fake_png}
    with pytest.raises(ValueError, match="NO_OFFSETS"):
        await _infer_single_tile(no_offsets, exemplars, _NeverCalledClient(), sem)
    # ... and at swarm level the same tile is a flagged record, not a crash.
    outcomes = await run_swarm([no_offsets], exemplars, _NeverCalledClient())
    assert outcomes[0]["status"] == "INFERENCE_FAILED"
    assert outcomes[0]["review_required"] is True


async def test_swarm_parse_failure_flagged():
    """Unparseable model JSON -> PARSE_FAILED record; legit empty JSON -> OK."""
    from src.meta_services.symbol_swarm import run_swarm

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _GarbageClient:
        def _execute_governed_completion(self, **kwargs):
            return "this is not json {{{", {"mock": True}

    class _EmptyClient:
        def _execute_governed_completion(self, **kwargs):
            return '{"detections": []}', {"mock": True}

    def _tile(i):
        return {
            "tile_index": i,
            "col": i,
            "row": 0,
            "x_offset_px": float(i * 819),
            "y_offset_px": 0.0,
            "tile_png_bytes": fake_png,
            "status": "CONTENT",
        }

    bad = await run_swarm([_tile(0)], exemplars, _GarbageClient())
    assert bad[0]["status"] == "PARSE_FAILED"
    assert bad[0]["review_required"] is True

    legit = await run_swarm([_tile(0)], exemplars, _EmptyClient())
    assert legit[0]["status"] == "OK"
    assert legit[0]["detections"] == []
    assert legit[0]["review_required"] is False


def test_tiling_untile_strict_validation():
    """S1/S2#6: NaN / out-of-[0,1000] / zero-area boxes raise; inverted boxes
    swap but flag review_required."""
    import math

    from src.meta_services.tiling import SymbolCandidate

    def _cand(bbox):
        return SymbolCandidate(
            symbol_label="SD",
            tile_col=0,
            tile_row=0,
            x_offset_px=0,
            y_offset_px=0,
            tile_bbox=bbox,
            confidence=0.9,
        )

    with pytest.raises(ValueError, match="[Ff]inite"):
        untile_candidate(_cand((math.nan, 0.0, 10.0, 10.0)))
    with pytest.raises(ValueError, match="\\[0, 1000\\]"):
        untile_candidate(_cand((0.0, 0.0, 1200.0, 500.0)))
    with pytest.raises(ValueError, match="\\[0, 1000\\]"):
        untile_candidate(_cand((-5.0, 0.0, 100.0, 100.0)))
    with pytest.raises(ValueError, match="[Zz]ero area"):
        untile_candidate(_cand((100.0, 100.0, 100.0, 200.0)))
    with pytest.raises(ValueError, match="[Zz]ero area"):
        untile_candidate(_cand((100.0, 100.0, 200.0, 100.0)))

    # Finite, in-range, strictly inverted: usable box, but flagged for review.
    inverted = _cand((300.0, 100.0, 100.0, 300.0))
    box = untile_candidate(inverted)
    assert box[0] < box[2] and box[1] < box[3]
    assert box[0] == pytest.approx((0 + 100.0 * 1.024) * 0.48)
    assert box[2] == pytest.approx((0 + 300.0 * 1.024) * 0.48)
    assert inverted.review_required is True

    # Well-ordered boxes leave the flag untouched.
    clean = _cand((100.0, 100.0, 300.0, 300.0))
    untile_candidate(clean)
    assert clean.review_required is False


def test_verifier_escalates_only():
    """S2#7/#8: conf None -> review_required; match=True preserves flags, never clears."""
    from src.meta_services.symbol_swarm import verify_borderline

    fake_crop_b64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).decode("ascii")
    crops_used = []

    def _crop_fn(candidate):
        crops_used.append(candidate["symbol_label"])
        return fake_crop_b64

    class _AlwaysMatchClient:
        def _execute_governed_completion(self, **kwargs):
            return '{"match": true, "confidence": 0.88}', {"mock": True}

    # Missing confidence: escalated without even calling the crop/verifier.
    no_conf = [{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], "confidence": None}]
    out = verify_borderline(no_conf, _AlwaysMatchClient(), _crop_fn)
    assert out[0]["review_required"] is True
    assert crops_used == []

    # match=True on a clean candidate: stays clean (legacy default False).
    clean = [{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], "confidence": 0.8}]
    out = verify_borderline(clean, _AlwaysMatchClient(), _crop_fn)
    assert out[0].get("review_required") in (False, None)
    assert out[0]["confidence"] == 0.8

    # match=True on an already-flagged candidate: flag PRESERVED, never cleared.
    flagged = [
        {
            "symbol_label": "SD",
            "tile_bbox": [10, 10, 60, 60],
            "confidence": 0.8,
            "review_required": True,
        }
    ]
    out = verify_borderline(flagged, _AlwaysMatchClient(), _crop_fn)
    assert out[0]["review_required"] is True
    assert out[0]["confidence"] == 0.8


async def test_tiles_to_swarm_input_roundtrip():
    """SYM-005 contract: Tile grid -> swarm dicts -> OK/EMPTY/INFERENCE_FAILED outcomes."""
    from src.meta_services.symbol_swarm import run_swarm, swarm_outcomes_to_detections
    from src.meta_services.tiling import Tile, tiles_to_swarm_input

    engine = SheetTilingEngine()
    tiles = engine.tile_sheet()
    assert all(isinstance(t, Tile) for t in tiles)
    assert all(t.status == "CONTENT" for t in tiles)

    with pytest.raises(ValueError, match="CONTENT.*EMPTY"):
        Tile(col=0, row=0, x_offset_px=0, y_offset_px=0, status="BOGUS")

    fake_png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode("ascii")
    subset = tiles[:2]
    # Only the first tile gets a raster; the second must surface INFERENCE_FAILED.
    rasters = {(subset[0].col, subset[0].row): fake_png}
    adapted = tiles_to_swarm_input(subset, rasters)
    assert len(adapted) == 2
    assert adapted[0]["tile_png_bytes"] == fake_png
    assert "tile_png_bytes" not in adapted[1]
    assert adapted[0]["status"] == "CONTENT"
    assert adapted[0]["x_offset_px"] == subset[0].x_offset_px

    exemplars = [{"label": "SD", "exemplar_crop_base64": fake_png}]

    class _OkClient:
        def _execute_governed_completion(self, **kwargs):
            payload = (
                '{"detections": [{"symbol_label": "SD", "tile_bbox": [10, 10, 60, 60], '
                '"confidence": 0.9}]}'
            )
            return payload, {"mock": True}

    outcomes = await run_swarm(adapted, exemplars, _OkClient())
    assert [o["status"] for o in outcomes] == ["OK", "INFERENCE_FAILED"]
    assert outcomes[1]["review_required"] is True
    assert len(swarm_outcomes_to_detections(outcomes)) == 1
