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

FIXTURE_MECH = Path("fixtures/mechanical/avexis_page_22.pdf")
FIXTURE_PLUMB = Path("fixtures/plumbing/p104_1_plumbing_level4.pdf")


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
