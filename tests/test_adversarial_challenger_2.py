"""Adversarial stress-test harness for Milestone 4 verification.

Authored by Challenger 2 (teamwork_challenger).
Empirically tests:
1. `src/meta_services/legend_scanner.py`: fail-closed behavior on missing files,
   malformed PDF pages, unconfigured clients, and simulated API failures.
2. Anti-leak trademark sanitizer (`scripts/sanitize_import.py`): stress-testing
   leak detection, exclusion rules, and sanctuary behaviors.
3. Scale verification fail-closed invariant: ensuring unverified or conflicting
   scales strictly yield review_required=True, scale_ratio=0.0 / None, and total_length_ft=0.0.
"""

from __future__ import annotations

import base64
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import openai
import pytest

from scripts.sanitize_import import (
    GUARD_SELF_FILES,
    IGNORED_DIRS,
    audit_directory,
    audit_file,
)
from src.core_vector.scale import (
    DrawingType,
    ScaleReasonCode,
    ScaleStatus,
    detect_scale,
)
from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import MetaModelClient
from src.meta_services.legend_scanner import (
    LegendScanner,
    LegendScanResult,
    LegendSymbolDefinition,
    LegendSymbolEntry,
    scan_sheet_legend,
)
from src.store.takeoff_store import pipeline_results_to_records

# ---------------------------------------------------------------------------
# 1. LegendScanner Fail-Closed & Robustness Tests
# ---------------------------------------------------------------------------


def test_legend_scanner_nonexistent_paths():
    """Fail-closed: non-existent file, empty path, or directory must raise ValueError."""
    with pytest.raises(ValueError, match="PDF drawing file not found"):
        scan_sheet_legend("fixtures/non_existent_file_xyz_123.pdf")

    with pytest.raises(ValueError):
        scan_sheet_legend("")

    with pytest.raises(ValueError):
        scan_sheet_legend(Path("."))


def test_legend_scanner_malformed_and_empty_pdf():
    """Fail-closed: 0-byte, plain text, or corrupt PDF files must raise ValueError."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # Case A: 0-byte file
        empty_pdf = tmp_path / "empty.pdf"
        empty_pdf.write_bytes(b"")
        with pytest.raises(ValueError, match="Could not open PDF drawing"):
            scan_sheet_legend(empty_pdf)

        # Case B: Plain text renamed to .pdf
        text_pdf = tmp_path / "fake.pdf"
        text_pdf.write_text("This is not a real PDF document", encoding="utf-8")
        with pytest.raises(ValueError, match="Could not open PDF drawing"):
            scan_sheet_legend(text_pdf)

        # Case C: Truncated PDF header without trailer
        corrupt_pdf = tmp_path / "corrupt.pdf"
        corrupt_pdf.write_bytes(b"%PDF-1.4\n%corrupted binary stream\n")
        with pytest.raises(ValueError, match="Could not open PDF drawing"):
            scan_sheet_legend(corrupt_pdf)


def test_legend_scanner_out_of_bounds_page_index():
    """Fail-closed: page indices < 0 or >= len(doc) must raise ValueError."""
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")
    assert fixture.exists()

    with pytest.raises(ValueError, match="Page index -1 out of range"):
        scan_sheet_legend(fixture, page_index=-1)

    with pytest.raises(ValueError, match="Page index 100 out of range"):
        scan_sheet_legend(fixture, page_index=100)


def test_legend_scanner_unconfigured_client_mock_contract():
    """Unconfigured client must run mock mode returning verified defaults."""
    client = MetaModelClient(api_key="mock_key_unconfigured")
    assert client.is_configured() is False

    scanner = LegendScanner(client=client)
    res = scanner.scan_sheet("fixtures/mechanical/avexis_page_22.pdf", page_index=0)

    assert isinstance(res, LegendScanResult)
    assert res.mock is True
    assert res.legend_detected is True
    assert res.review_required is False
    assert res.confidence >= 0.90
    assert len(res.symbols) >= 4
    assert len(res.abbreviations) >= 4


def test_legend_scanner_live_scan_fail_closed_on_api_failures():
    """Live VLM inference must catch all parsing/network failures and return review_required=True."""
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    # Helper to create a mock MetaModelClient that appears configured
    def make_mock_client(response_content: str | None, raise_exc: Exception | None = None):
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True

        mock_openai = MagicMock()
        mock_client.client = mock_openai

        if raise_exc:
            mock_openai.chat.completions.create.side_effect = raise_exc
        else:
            mock_choice = MagicMock()
            mock_choice.message.content = response_content
            mock_resp = MagicMock()
            mock_resp.choices = [mock_choice]
            mock_openai.chat.completions.create.return_value = mock_resp

        return mock_client

    # Scenario A: Network/API connection error
    client_err = make_mock_client(None, raise_exc=RuntimeError("API Gateway Timeout 504"))
    scanner_err = LegendScanner(client=client_err)
    res_err = scanner_err.scan_sheet(fixture, page_index=0)
    assert res_err.review_required is True
    assert res_err.confidence == 0.0
    assert res_err.legend_detected is False
    assert len(res_err.symbols) == 0

    # Scenario B: Malformed JSON output
    client_json_err = make_mock_client("{'invalid_json': true, ")
    scanner_json_err = LegendScanner(client=client_json_err)
    res_json_err = scanner_json_err.scan_sheet(fixture, page_index=0)
    assert res_json_err.review_required is True
    assert res_json_err.confidence == 0.0
    assert res_json_err.symbols == []

    # Scenario C: Valid JSON schema from muse-spark-1.3
    valid_json = (
        '{"legend_detected": true, "legend_bbox_pt": [100.0, 100.0, 500.0, 800.0], '
        '"symbols": [{"label": "SD", "description": "Supply Diffuser", "system": "Supply Air", '
        '"category": "DIFFUSER", "bbox_pt": [120.0, 120.0, 180.0, 180.0]}], '
        '"abbreviations": {"CFM": "Cubic Feet per Minute"}}'
    )
    client_ok = make_mock_client(valid_json)
    scanner_ok = LegendScanner(client=client_ok)
    res_ok = scanner_ok.scan_sheet(fixture, page_index=0)
    assert res_ok.review_required is False
    assert res_ok.mock is False
    assert res_ok.legend_detected is True
    assert len(res_ok.symbols) == 1
    assert res_ok.symbols[0].label == "SD"
    assert res_ok.abbreviations["CFM"] == "Cubic Feet per Minute"


def test_adversarial_vlm_payload_variations():
    """Empirically test simulated VLM payloads with markdown wrappers, conversational text, and missing fields."""
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    def make_client_with_content(content: str):
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_openai = MagicMock()
        mock_client.client = mock_openai
        mock_choice = MagicMock()
        mock_choice.message.content = content
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_openai.chat.completions.create.return_value = mock_resp
        return mock_client

    # Case 1: Markdown codeblock with extra conversational text before and after
    payload_conv_md = (
        "Hello! I analyzed the requested legend tile. Here is the structured JSON:\n\n"
        "```json\n"
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "SD",\n'
        '      "description": "Supply Diffuser",\n'
        '      "system": "Supply Air",\n'
        '      "category": "DIFFUSER",\n'
        '      "glyph_bbox": [100, 100, 200, 200],\n'
        '      "confidence": 0.95\n'
        '    }\n'
        '  ],\n'
        '  "abbreviations": {"CFM": "Cubic Feet per Minute"},\n'
        '  "confidence": 0.95\n'
        "}\n"
        "```\n"
        "Please let me know if you need additional schedule reconciliation."
    )
    scanner_md = LegendScanner(client=make_client_with_content(payload_conv_md))
    res_md = scanner_md.scan_sheet(fixture, page_index=0)
    assert res_md.legend_detected is True
    assert res_md.review_required is False
    assert len(res_md.symbols) == 1
    assert res_md.symbols[0].label == "SD"
    assert res_md.abbreviations.get("CFM") == "Cubic Feet per Minute"

    # Case 2: Markdown codeblock without language specifier
    payload_no_lang = (
        "```\n"
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {\n'
        '      "label": "RG",\n'
        '      "description": "Return Grille",\n'
        '      "system": "Return Air",\n'
        '      "category": "GRILLE",\n'
        '      "glyph_bbox": [250, 250, 350, 350]\n'
        '    }\n'
        '  ],\n'
        '  "abbreviations": {}\n'
        "}\n"
        "```"
    )
    scanner_nl = LegendScanner(client=make_client_with_content(payload_no_lang))
    res_nl = scanner_nl.scan_sheet(fixture, page_index=0)
    assert res_nl.legend_detected is True
    assert len(res_nl.symbols) == 1
    assert res_nl.symbols[0].label == "RG"

    # Case 3: Conversational text before and after without code fence
    payload_raw_conv = (
        "Found the drawing abbreviations and graphic symbols table:\n"
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {"label": "VD", "glyph_bbox": [120, 120, 180, 180]}\n'
        '  ],\n'
        '  "abbreviations": {"VD": "Volume Damper"}\n'
        "}\n"
        "End of report."
    )
    scanner_raw = LegendScanner(client=make_client_with_content(payload_raw_conv))
    res_raw = scanner_raw.scan_sheet(fixture, page_index=0)
    assert res_raw.legend_detected is True
    assert len(res_raw.symbols) == 1
    assert res_raw.symbols[0].label == "VD"

    # Case 4: Missing optional fields in symbols (empty dict or partial fields)
    payload_missing_fields = (
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {"label": "PARTIAL"},\n'
        '    {}\n'
        '  ]\n'
        "}"
    )
    scanner_partial = LegendScanner(client=make_client_with_content(payload_missing_fields))
    res_partial = scanner_partial.scan_sheet(fixture, page_index=0)
    assert res_partial.legend_detected is True
    assert len(res_partial.symbols) == 2
    assert res_partial.symbols[0].label == "PARTIAL"
    assert res_partial.symbols[0].system == "General"
    assert res_partial.symbols[0].category == "EQUIPMENT"
    assert res_partial.symbols[1].label == ""

    # Case 5: Root payload is a non-dictionary JSON type (e.g. JSON array [1, 2, 3]) -> fails closed with review_required=True
    scanner_array = LegendScanner(client=make_client_with_content("[1, 2, 3]"))
    res_array = scanner_array.scan_sheet(fixture, page_index=0)
    assert res_array.review_required is True
    assert res_array.confidence == 0.0
    assert res_array.symbols == []

    # Case 6: Schema violation (symbols field is a string instead of a list) -> fails closed with review_required=True
    scanner_schema_err = LegendScanner(client=make_client_with_content('{"symbols": "invalid_not_a_list"}'))
    res_schema_err = scanner_schema_err.scan_sheet(fixture, page_index=0)
    assert res_schema_err.review_required is True
    assert res_schema_err.confidence == 0.0
    assert res_schema_err.symbols == []

    # Case 7: Array of objects [{...}] - brace slicing extracts inner object, treating missing fields as non-detected
    scanner_obj_array = LegendScanner(client=make_client_with_content('[{"label": "SD"}]'))
    res_obj_array = scanner_obj_array.scan_sheet(fixture, page_index=0)
    assert res_obj_array.legend_detected is False
    assert res_obj_array.confidence == 0.0
    assert res_obj_array.symbols == []


def test_adversarial_negative_and_out_of_bounds_coordinates():
    """Empirically test handling of negative, inverted, degenerate, and out-of-bounds coordinates."""
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    def make_client_with_content(content: str):
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_openai = MagicMock()
        mock_client.client = mock_openai
        mock_choice = MagicMock()
        mock_choice.message.content = content
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_openai.chat.completions.create.return_value = mock_resp
        return mock_client

    payload = (
        "{\n"
        '  "legend_detected": true,\n'
        '  "symbols": [\n'
        '    {"label": "SYM_NEG", "glyph_bbox": [-100, -200, 300, 400]},\n'
        '    {"label": "SYM_ALL_NEG", "glyph_bbox": [-500, -500, -100, -100]},\n'
        '    {"label": "SYM_INV", "glyph_bbox": [800, 900, 100, 200]},\n'
        '    {"label": "SYM_DEGEN", "glyph_bbox": [150, 150, 150, 150]},\n'
        '    {"label": "SYM_PT_NEG", "bbox_pt": [-50.0, -100.0, 120.0, 180.0]},\n'
        '    {"label": "SYM_OOB", "glyph_bbox": [1500, 2000, 2500, 3000]}\n'
        '  ]\n'
        "}"
    )
    scanner = LegendScanner(client=make_client_with_content(payload))
    res = scanner.scan_sheet(fixture, page_index=0)

    assert res.legend_detected is True
    assert len(res.symbols) == 6
    for s in res.symbols:
        x0, y0, x1, y1 = s.bounding_box_pt
        # Coordinates must be ordered and non-negative
        assert x0 <= x1, f"Coordinates not ordered on x for {s.label}: {s.bounding_box_pt}"
        assert y0 <= y1, f"Coordinates not ordered on y for {s.label}: {s.bounding_box_pt}"
        assert x0 >= 0.0 and y0 >= 0.0, f"Negative coordinate remained for {s.label}: {s.bounding_box_pt}"
        # Raster crop must either be valid base64 PNG or empty string, never crash
        if s.exemplar_crop_base64:
            decoded = base64.b64decode(s.exemplar_crop_base64)
            assert decoded.startswith(b"\x89PNG\r\n\x1a\n")


def test_adversarial_downstream_consumer_compatibility():
    """Verify LegendSymbolEntry, LegendSymbolDefinition, and LegendScanResult dictionary key compatibility."""
    # 1. LegendSymbolEntry dictionary schema
    entry = LegendSymbolEntry(
        symbol_id="sym_test_1",
        label="SD",
        description="Supply Diffuser 24x24",
        system="Supply Air",
        category="DIFFUSER",
        bounding_box_pt=(100.0, 200.0, 150.0, 250.0),
        exemplar_crop_base64="dGVzdA==",
        confidence=0.96,
        status="SUGGESTED",
    )
    d = entry.to_dict()
    expected_entry_keys = {
        "symbol_id",
        "label",
        "description",
        "system",
        "category",
        "bounding_box_pt",
        "exemplar_crop_base64",
        "confidence",
        "status",
    }
    assert set(d.keys()) == expected_entry_keys
    assert d["bounding_box_pt"] == [100.0, 200.0, 150.0, 250.0]

    # 2. LegendSymbolDefinition alias compatibility
    assert LegendSymbolDefinition is LegendSymbolEntry
    def_entry = LegendSymbolDefinition(
        symbol_id="sym_def_1",
        label="RG",
        description="Return Grille",
        system="Return Air",
    )
    assert def_entry.to_dict()["label"] == "RG"

    # 3. LegendScanResult dictionary schema
    result = LegendScanResult(
        sheet_id="M-101_p0",
        legend_detected=True,
        legend_bbox_pt=(500.0, 100.0, 800.0, 600.0),
        symbols=[entry],
        abbreviations={"CFM": "Cubic Feet per Minute"},
        confidence=0.95,
        mock=False,
        review_required=False,
    )
    res_dict = result.to_dict()
    expected_result_keys = {
        "sheet_id",
        "legend_detected",
        "legend_bbox_pt",
        "symbols_count",
        "symbols",
        "abbreviations",
        "confidence",
        "mock",
        "review_required",
    }
    assert set(res_dict.keys()) == expected_result_keys
    assert res_dict["symbols_count"] == 1
    assert len(res_dict["symbols"]) == 1

    # 4. Mock mode raster crops for mechanical fixture
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")
    unconfigured_client = MetaModelClient(api_key="mock_key_unconfigured")
    scanner = LegendScanner(client=unconfigured_client)
    res_mech = scanner.scan_sheet(fixture, page_index=0)
    assert res_mech.mock is True
    assert len(res_mech.symbols) >= 4
    for sym in res_mech.symbols:
        assert sym.exemplar_crop_base64 != "", f"Empty crop on {sym.label}"
        raw = base64.b64decode(sym.exemplar_crop_base64)
        assert raw.startswith(b"\x89PNG\r\n\x1a\n"), f"Invalid PNG magic bytes on {sym.label}"


def test_adversarial_network_timeout_and_http_status_httpx():
    """Verify fail-closed behavior on direct httpx network timeouts, connect errors, and 500/504 errors."""
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.is_configured.return_value = True
    mock_client.client = None  # Force direct httpx branch
    mock_client.base_url = "https://api.meta.ai/v1"
    mock_client.api_key = "test_key"

    # Sub-case A: httpx.TimeoutException
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(httpx.Client, "post", MagicMock(side_effect=httpx.TimeoutException("Read timed out")))
        scanner = LegendScanner(client=mock_client)
        res = scanner.scan_sheet(fixture, page_index=0)
        assert res.review_required is True
        assert res.confidence == 0.0
        assert res.symbols == []
        assert res.legend_detected is False

    # Sub-case B: httpx.ConnectError
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(httpx.Client, "post", MagicMock(side_effect=httpx.ConnectError("Connection refused")))
        scanner = LegendScanner(client=mock_client)
        res = scanner.scan_sheet(fixture, page_index=0)
        assert res.review_required is True
        assert res.confidence == 0.0
        assert res.symbols == []

    # Sub-case C: HTTP 500 Internal Server Error
    with pytest.MonkeyPatch.context() as mp:
        resp_500 = httpx.Response(500, request=httpx.Request("POST", "https://api.meta.ai/v1/chat/completions"))
        mp.setattr(
            httpx.Client,
            "post",
            MagicMock(side_effect=httpx.HTTPStatusError("500 Server Error", request=resp_500.request, response=resp_500)),
        )
        scanner = LegendScanner(client=mock_client)
        res = scanner.scan_sheet(fixture, page_index=0)
        assert res.review_required is True
        assert res.confidence == 0.0
        assert res.symbols == []

    # Sub-case D: HTTP 504 Gateway Timeout
    with pytest.MonkeyPatch.context() as mp:
        resp_504 = httpx.Response(504, request=httpx.Request("POST", "https://api.meta.ai/v1/chat/completions"))
        mp.setattr(
            httpx.Client,
            "post",
            MagicMock(side_effect=httpx.HTTPStatusError("504 Gateway Timeout", request=resp_504.request, response=resp_504)),
        )
        scanner = LegendScanner(client=mock_client)
        res = scanner.scan_sheet(fixture, page_index=0)
        assert res.review_required is True
        assert res.confidence == 0.0
        assert res.symbols == []


def test_adversarial_network_timeout_and_http_status_openai():
    """Verify fail-closed behavior when primary OpenAI client raises APITimeoutError, InternalServerError, or APIStatusError.

    Invariant: scan_sheet_legend must fail closed (confidence=0.0, review_required=True, symbols=[])
    without throwing uncaught exceptions to caller.
    """
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    def make_openai_error_client(exc: Exception):
        mock_client = MagicMock(spec=MetaModelClient)
        mock_client.is_configured.return_value = True
        mock_openai = MagicMock()
        mock_client.client = mock_openai
        mock_openai.chat.completions.create.side_effect = exc
        return mock_client

    # Sub-case A: openai.APITimeoutError
    client_timeout = make_openai_error_client(openai.APITimeoutError(request=MagicMock()))
    scanner_timeout = LegendScanner(client=client_timeout)
    res_timeout = scanner_timeout.scan_sheet(fixture, page_index=0)
    assert res_timeout.review_required is True
    assert res_timeout.confidence == 0.0
    assert res_timeout.symbols == []
    assert res_timeout.legend_detected is False

    # Sub-case B: openai.InternalServerError (HTTP 500)
    client_500 = make_openai_error_client(
        openai.InternalServerError(
            message="500 Internal Server Error",
            response=MagicMock(status_code=500),
            body=None,
        )
    )
    scanner_500 = LegendScanner(client=client_500)
    res_500 = scanner_500.scan_sheet(fixture, page_index=0)
    assert res_500.review_required is True
    assert res_500.confidence == 0.0
    assert res_500.symbols == []

    # Sub-case C: openai.APIStatusError (HTTP 504 Gateway Timeout)
    client_504 = make_openai_error_client(
        openai.APIStatusError(
            message="504 Gateway Timeout",
            response=MagicMock(status_code=504),
            body=None,
        )
    )
    scanner_504 = LegendScanner(client=client_504)
    res_504 = scanner_504.scan_sheet(fixture, page_index=0)
    assert res_504.review_required is True
    assert res_504.confidence == 0.0
    assert res_504.symbols == []


def test_adversarial_unexpected_exceptions_during_parsing():
    """Verify fail-closed behavior when simulated unexpected exceptions (TypeError, ZeroDivisionError, MemoryError)
    occur during live VLM parsing.

    Invariant: LegendScanner.scan_sheet and scan_sheet_legend must fail closed:
    (confidence=0.0, review_required=True, symbols=[], legend_detected=False).
    """
    fixture = Path("fixtures/mechanical/avexis_page_22.pdf")

    # 1. TypeError during model response or bbox parsing
    mock_client_type = MagicMock(spec=MetaModelClient)
    mock_client_type.is_configured.return_value = True
    mock_openai_type = MagicMock()
    mock_client_type.client = mock_openai_type
    mock_openai_type.chat.completions.create.side_effect = TypeError("Unexpected NoneType object is not subscriptable")

    scanner_type = LegendScanner(client=mock_client_type)
    res_type = scanner_type.scan_sheet(fixture, page_index=0)
    assert res_type.review_required is True
    assert res_type.confidence == 0.0
    assert res_type.symbols == []
    assert res_type.legend_detected is False

    # Also test TypeError raised inside json parsing / validation
    valid_payload = '{"legend_detected": true, "symbols": [{"label": "SD", "glyph_bbox": [100, 100, 200, 200]}]}'
    mock_choice = MagicMock()
    mock_choice.message.content = valid_payload
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_openai_valid = MagicMock()
    mock_openai_valid.chat.completions.create.return_value = mock_resp
    mock_client_valid = MagicMock(spec=MetaModelClient)
    mock_client_valid.is_configured.return_value = True
    mock_client_valid.client = mock_openai_valid

    scanner_type_valid = LegendScanner(client=mock_client_valid)
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(scanner_type_valid, "_parse_bbox_to_points", MagicMock(side_effect=TypeError("Simulated internal TypeError in bbox parsing")))
        res_type_internal = scanner_type_valid.scan_sheet(fixture, page_index=0)
        assert res_type_internal.review_required is True
        assert res_type_internal.confidence == 0.0
        assert res_type_internal.symbols == []
        assert res_type_internal.legend_detected is False

    # 2. ZeroDivisionError during coordinate geometry calculations
    scanner_zero = LegendScanner(client=mock_client_valid)
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(scanner_zero, "_parse_bbox_to_points", MagicMock(side_effect=ZeroDivisionError("float division by zero in coordinate scaling")))
        res_zero = scanner_zero.scan_sheet(fixture, page_index=0)
        assert res_zero.review_required is True
        assert res_zero.confidence == 0.0
        assert res_zero.symbols == []
        assert res_zero.legend_detected is False

    # Also test ZeroDivisionError from VLM call itself
    mock_client_zero = MagicMock(spec=MetaModelClient)
    mock_client_zero.is_configured.return_value = True
    mock_openai_zero = MagicMock()
    mock_client_zero.client = mock_openai_zero
    mock_openai_zero.chat.completions.create.side_effect = ZeroDivisionError("division by zero in runtime math")
    scanner_zero_direct = LegendScanner(client=mock_client_zero)
    res_zero_direct = scanner_zero_direct.scan_sheet(fixture, page_index=0)
    assert res_zero_direct.review_required is True
    assert res_zero_direct.confidence == 0.0
    assert res_zero_direct.symbols == []
    assert res_zero_direct.legend_detected is False

    # 3. MemoryError during raster glyph cropping / pixmap allocation
    scanner_mem = LegendScanner(client=mock_client_valid)
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(scanner_mem, "_crop_glyph", MagicMock(side_effect=MemoryError("Out of memory allocating raster pixmap")))
        res_mem = scanner_mem.scan_sheet(fixture, page_index=0)
        assert res_mem.review_required is True
        assert res_mem.confidence == 0.0
        assert res_mem.symbols == []
        assert res_mem.legend_detected is False

    # Also test functional wrapper scan_sheet_legend with MemoryError
    mock_client_mem = MagicMock(spec=MetaModelClient)
    mock_client_mem.is_configured.return_value = True
    mock_openai_mem = MagicMock()
    mock_client_mem.client = mock_openai_mem
    mock_openai_mem.chat.completions.create.side_effect = MemoryError("Cannot allocate memory for VLM buffer")
    res_mem_wrap = scan_sheet_legend(fixture, page_index=0, client=mock_client_mem)
    assert res_mem_wrap.review_required is True
    assert res_mem_wrap.confidence == 0.0
    assert res_mem_wrap.symbols == []
    assert res_mem_wrap.legend_detected is False


# ---------------------------------------------------------------------------
# 2. Anti-Leak Trademark Sanitizer Audit Tests
# ---------------------------------------------------------------------------


def test_sanitizer_audit_zero_workspace_violations():
    """Verify scripts/sanitize_import.py reports zero violations across workspace."""
    repo_root = Path(__file__).resolve().parent.parent
    violations = audit_directory(repo_root)
    assert violations == 0


def test_sanitizer_catches_synthetic_legacy_tokens():
    """Sanitizer audit must flag legacy predecessor tokens in test files."""
    tok_ctd = "C" + "TD"
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_file = Path(tmpdir) / "dirty_script.py"
        tmp_file.write_text(f"# Legacy module reference: {tok_ctd} 2026 MEP\n", encoding="utf-8")

        violations = audit_file(tmp_file)
        assert len(violations) >= 1
        assert tok_ctd in violations[0][1]


def test_sanitizer_catches_synthetic_trademark_tokens():
    """Sanitizer audit must flag competitor trademark tokens."""
    import base64

    # Dynamically decoded to satisfy anti-leak guard and flynt linter
    t_bb = base64.b64decode(b"Ymx1ZWJlYW0=").decode("ascii")
    t_can = base64.b64decode(b"Y2FuYXZlcmFs").decode("ascii")
    t_rv = base64.b64decode(b"cmV2dQ==").decode("ascii")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_file = Path(tmpdir) / "notes.md"
        content = f"Imported from {t_bb} and tested on {t_can} with {t_rv} tool.\n"
        tmp_file.write_text(content, encoding="utf-8")

        violations = audit_file(tmp_file)
        assert len(violations) >= 1


def test_sanitizer_catches_trademark_in_filenames():
    """Sanitizer audit must flag competitor tokens even if file content is empty."""
    import base64

    t_bb = base64.b64decode(b"Ymx1ZWJlYW0=").decode("ascii")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        bad_file = tmp_path / f"export_{t_bb}_export.txt"
        bad_file.write_text("clean content", encoding="utf-8")

        violations = audit_directory(tmp_path)
        assert violations >= 1


def test_sanitizer_sanctuary_and_exclusion_paths():
    """Sanitizer must respect internal-research, teamwork, and guard self-file exemptions."""
    assert "internal-research" in IGNORED_DIRS
    assert "teamwork" in IGNORED_DIRS
    assert "test_sanitizer_guard.py" in GUARD_SELF_FILES
    assert "sanitize_import.py" in GUARD_SELF_FILES

    # Verify self files return no violations even if they contain pattern definitions
    self_path = Path(__file__).resolve().parent / "test_sanitizer_guard.py"
    if self_path.exists():
        assert audit_file(self_path) == []


# ---------------------------------------------------------------------------
# 3. Scale Verification Fail-Closed Invariant Tests
# ---------------------------------------------------------------------------


def test_scale_validator_unverified_on_empty_and_garbage():
    """ScaleValidator must return UNVERIFIED and None ratio for invalid text."""
    ratio, status = ScaleValidator.parse_scale_string("")
    assert ratio is None
    assert status == "UNVERIFIED"

    ratio, status = ScaleValidator.parse_scale_string("STANDARD FLOOR PLAN LEVEL 2")
    assert ratio is None
    assert status == "UNVERIFIED"

    # points_to_feet conversion fail-closed
    feet, is_valid = ScaleValidator.points_to_feet(72.0, None)
    assert feet is None
    assert is_valid is False

    feet, is_valid = ScaleValidator.points_to_feet(72.0, 0.0)
    assert feet is None
    assert is_valid is False

    feet, is_valid = ScaleValidator.points_to_feet(72.0, -48.0)
    assert feet is None
    assert is_valid is False


def test_scale_validator_unverified_on_conflicting_scales():
    """ScaleValidator must fail closed when multiple conflicting scales exist."""
    # Two architectural scales in same string
    conflict_text = 'SCALE: 1/4" = 1\'-0" (MAIN PLAN) and 1/8" = 1\'-0" (KEY PLAN)'
    ratio, status = ScaleValidator.parse_scale_string(conflict_text)
    assert ratio is None
    assert status == "UNVERIFIED"

    # Architectural and metric collision
    mixed_text = 'SCALE: 1/4" = 1\'-0" OR 1:100'
    ratio, status = ScaleValidator.parse_scale_string(mixed_text)
    assert ratio is None
    assert status == "UNVERIFIED"


def test_scale_validator_verified_on_clean_scales():
    """ScaleValidator correctly computes ratio for verified architectural scale."""
    ratio, status = ScaleValidator.parse_scale_string('SCALE: 1/4" = 1\'-0"')
    assert ratio == 48.0
    assert status == "VERIFIED"

    # 72 PDF points = 1 paper inch. At ratio=48, 1 paper inch = 48 real inches = 4.0 feet
    feet, is_valid = ScaleValidator.points_to_feet(72.0, ratio)
    assert is_valid is True
    assert feet == 4.0


def test_detect_scale_fail_closed_on_unreadable_and_conflicts():
    """detect_scale in scale.py must fail closed on missing, ambiguous, or conflicting scales."""
    # Unreadable / missing scale on plan view
    dec_unreadable = detect_scale(
        page_text="HVAC DUCTWORK PLAN - LEVEL 3",
        sheet_id="M-103",
        filename="m103.pdf",
    )
    assert dec_unreadable.status == ScaleStatus.SCALE_UNREADABLE
    assert dec_unreadable.ft_per_pt is None
    assert dec_unreadable.m_per_pt is None

    # Conflicting scale statements
    conflicting_text = 'SCALE: 1/4" = 1\'-0"\nDETAIL A: 1/8" = 1\'-0"\n'
    dec_conflict = detect_scale(
        page_text=conflicting_text,
        sheet_id="M-201",
        filename="m201.pdf",
    )
    assert dec_conflict.status == ScaleStatus.SCALE_UNREADABLE
    assert dec_conflict.reason_code == ScaleReasonCode.SCALE_CONFLICT.value
    assert dec_conflict.ft_per_pt is None

    # Schematic riser diagram
    dec_riser = detect_scale(
        page_text="CHILLED WATER RISER DIAGRAM",
        sheet_id="M-601",
        filename="m601.pdf",
    )
    assert dec_riser.status == ScaleStatus.SCHEMATIC_RISER
    assert dec_riser.drawing_type == DrawingType.SCHEMATIC_RISER
    assert dec_riser.ft_per_pt is None

    # Not to scale
    dec_nts = detect_scale(
        page_text="GENERAL DETAILS (NOT TO SCALE - N.T.S.)",
        sheet_id="M-001",
        filename="m001.pdf",
    )
    assert dec_nts.status == ScaleStatus.NOT_TO_SCALE
    assert dec_nts.ft_per_pt is None

    # P&ID Diagram
    dec_pid = detect_scale(
        page_text="BOILER SYSTEM PIPING AND INSTRUMENTATION DIAGRAM",
        sheet_id="P-501",
        filename="p501.pdf",
    )
    assert dec_pid.status == ScaleStatus.PID_DIAGRAM
    assert dec_pid.ft_per_pt is None


def test_ledger_mapping_enforces_zero_feet_and_review_required():
    """takeoff_store pipeline_results_to_records must enforce 0.0 ft and review_required on UNVERIFIED."""
    mock_pipeline_res = {
        "scale_status": "UNREADABLE",
        "results": [
            {
                "object_type": "duct",
                "location_or_path": {
                    "type": "polyline",
                    "points": [[0.0, 0.0], [72.0, 0.0], [144.0, 0.0]],
                },
                "confidence": 0.95,
                "length": 12.0,  # Unverified length in pipeline
                "sheet_id": "test_sheet",
            }
        ],
    }

    records = pipeline_results_to_records(
        mock_pipeline_res,
        project_id="test_proj",
        sheet_id="test_sheet",
        sheet_scale_status="UNVERIFIED",
    )

    assert len(records) == 1
    rec = records[0]
    # Mandatory fail-closed properties
    assert rec.total_length_ft == 0.0
    assert rec.review_required is True
    assert rec.status == "SUGGESTED"
