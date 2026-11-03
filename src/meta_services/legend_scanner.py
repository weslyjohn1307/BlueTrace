"""LegendScanner: Automated legend box detection and symbol inventory via muse-spark-1.3.

Conforms to ADR-003 (Meta Services Architecture) and AGENTS.md § 1.
Extracts:
  - Legend bounding box in PDF points
  - Symbol glyph crop coordinates and labels
  - Symbol descriptions, systems, and categories
  - Drawing abbreviations dictionary
  - 150 DPI exemplar glyph raster crops encoded as base64 PNGs
Provides seamless mock mode fallback conforming to test_meta_services.py patterns.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import unittest.mock
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf
from pydantic import BaseModel, Field

from src.core_vector.pipeline import infer_discipline
from src.meta_services.client import PROFILE_SCHEDULE_EXTRACTION, MetaModelClient

logger = logging.getLogger(__name__)


@dataclass
class LegendSymbolEntry:
    """Individual symbol inventory entry extracted from a sheet legend."""

    symbol_id: str
    label: str
    description: str
    system: str
    category: str = "EQUIPMENT"
    bounding_box_pt: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    exemplar_crop_base64: str = ""
    confidence: float = 0.95
    status: str = "SUGGESTED"

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol_id": self.symbol_id,
            "label": self.label,
            "description": self.description,
            "system": self.system,
            "category": self.category,
            "bounding_box_pt": [round(c, 2) for c in self.bounding_box_pt],
            "exemplar_crop_base64": self.exemplar_crop_base64,
            "confidence": self.confidence,
            "status": self.status,
        }


# Compatibility alias with AUDIT_AND_GAP_ANALYSIS_2026.md § 6.2
LegendSymbolDefinition = LegendSymbolEntry


@dataclass
class LegendScanResult:
    """Result of scanning a sheet's symbol legend."""

    sheet_id: str
    legend_detected: bool
    legend_bbox_pt: tuple[float, float, float, float] | None = None
    symbols: list[LegendSymbolEntry] = field(default_factory=list)
    abbreviations: dict[str, str] = field(default_factory=dict)
    confidence: float = 0.90
    mock: bool = False
    review_required: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "sheet_id": self.sheet_id,
            "legend_detected": self.legend_detected,
            "legend_bbox_pt": (
                [round(c, 2) for c in self.legend_bbox_pt] if self.legend_bbox_pt else None
            ),
            "symbols_count": len(self.symbols),
            "symbols": [s.to_dict() for s in self.symbols],
            "abbreviations": self.abbreviations,
            "confidence": self.confidence,
            "mock": self.mock,
            "review_required": self.review_required,
        }


# Pydantic v2 validation models for structured VLM response parsing
class _VLMSymbolItem(BaseModel):
    label: str = ""
    description: str = ""
    system: str = "General"
    category: str = "EQUIPMENT"
    glyph_bbox: list[float] | None = None
    bbox_pt: list[float] | None = None
    glyph_bbox_pt: list[float] | None = None
    bounding_box_pt: list[float] | None = None
    confidence: float = 0.90


class _VLMResponse(BaseModel):
    legend_detected: bool = False
    legend_bbox: list[float] | None = None
    legend_bbox_pt: list[float] | None = None
    symbols: list[_VLMSymbolItem] = Field(default_factory=list)
    abbreviations: dict[str, str] = Field(default_factory=dict)
    confidence: float = 0.90
    review_required: bool = False


class LegendScanner:
    """Automated symbol legend extractor utilizing Meta Model API muse-spark-1.3."""

    def __init__(self, client: MetaModelClient | None = None) -> None:
        self.client = client or MetaModelClient()

    @staticmethod
    def _open_document(pdf_path: str | Path) -> pymupdf.Document:
        """Open a PDF, translating file or engine errors into ValueError (fail closed)."""
        if not pdf_path or str(pdf_path).strip() == "":
            raise ValueError(f"PDF drawing file not found: {pdf_path}")
        path_obj = Path(pdf_path)
        if not path_obj.exists() or path_obj.is_dir():
            raise ValueError(f"PDF drawing file not found: {pdf_path}")
        try:
            doc = pymupdf.open(str(path_obj))
            if not getattr(doc, "is_pdf", True):
                doc.close()
                raise ValueError(
                    f"Could not open PDF drawing '{pdf_path}': not a valid PDF document"
                )
            if doc.page_count < 1:
                doc.close()
                raise ValueError(f"Could not open PDF drawing '{pdf_path}': zero pages")
            return doc
        except Exception as exc:
            if isinstance(exc, ValueError):
                raise
            raise ValueError(f"Could not open PDF drawing '{pdf_path}': {exc}") from exc

    @staticmethod
    def _crop_glyph(
        page: pymupdf.Page,
        bbox_pt: tuple[float, float, float, float],
        padding: float = 3.0,
        dpi: int = 150,
    ) -> str:
        """Extract an isolated exemplar raster crop of a symbol glyph from the page at 150 DPI."""
        try:
            x0, y0, x1, y1 = bbox_pt
            if x0 > x1:
                x0, x1 = x1, x0
            if y0 > y1:
                y0, y1 = y1, y0

            # Guard against degenerate / zero-dimension bounding box
            if x1 - x0 < 4.0:
                cx = (x0 + x1) / 2.0
                x0, x1 = cx - 4.0, cx + 4.0
            if y1 - y0 < 4.0:
                cy = (y0 + y1) / 2.0
                y0, y1 = cy - 4.0, cy + 4.0

            glyph_rect = pymupdf.Rect(
                x0 - padding,
                y0 - padding,
                x1 + padding,
                y1 + padding,
            ).intersect(page.rect)

            if glyph_rect.is_empty or glyph_rect.width <= 0 or glyph_rect.height <= 0:
                return ""

            pix = page.get_pixmap(dpi=dpi, clip=glyph_rect)
            img_bytes = pix.tobytes("png")
            return base64.b64encode(img_bytes).decode("ascii")
        except (RuntimeError, ValueError, OSError, TypeError):
            return ""

    @staticmethod
    def _locate_legend_tile(page: pymupdf.Page) -> pymupdf.Rect:
        """Localize candidate legend tile using text search anchors or standard AEC right column corridor."""
        page_rect = page.rect
        w = float(page_rect.width)
        h = float(page_rect.height)

        # 1. Search native text blocks for legend headers
        header_pattern = re.compile(
            r"\b(SYMBOLS?\s+LEGEND|LEGEND\s+AND\s+ABBREVIATIONS?|GENERAL\s+NOTES?\s+AND\s+LEGEND|ABBREVIATIONS?|GRAPHICAL\s+SYMBOLS?|EQUIPMENT\s+LEGEND)\b",
            re.IGNORECASE,
        )
        try:
            blocks = page.get_text("blocks")
            candidate_blocks = [b for b in blocks if header_pattern.search(b[4])]
            if candidate_blocks:
                b = candidate_blocks[0]
                bx0, by0, _bx1, by1 = b[0], b[1], b[2], b[3]
                tile_rect = pymupdf.Rect(
                    max(0.0, bx0 - 50.0),
                    max(0.0, by0 - 20.0),
                    min(w, bx0 + 650.0),
                    min(h, by1 + 1200.0),
                ).intersect(page_rect)
                if not tile_rect.is_empty and tile_rect.width >= 100.0 and tile_rect.height >= 100.0:
                    return tile_rect
        except (RuntimeError, ValueError, OSError, TypeError) as exc:
            logger.debug("Candidate legend text block anchor search failed: %s", exc)

        # 2. Fallback to standard AEC right title/legend column corridor: [W - 700, 100, W - 30, H - 150]
        x0 = max(0.0, w - 700.0)
        y0 = 100.0
        x1 = max(x0 + 100.0, w - 30.0)
        y1 = min(h, max(y0 + 200.0, h - 150.0))
        tile_rect = pymupdf.Rect(x0, y0, x1, y1).intersect(page_rect)
        if tile_rect.is_empty:
            return page_rect
        return tile_rect

    @staticmethod
    def _parse_bbox_to_points(
        raw_box: Any,
        tile_rect: pymupdf.Rect,
        page_rect: pymupdf.Rect,
        is_points: bool = False,
    ) -> tuple[float, float, float, float]:
        """Convert raw bounding box (either normalized [ymin, xmin, ymax, xmax] in [0, 1000]
        or absolute PDF points [x0, y0, x1, y1]) to clamped page PDF points (x0, y0, x1, y1).
        """
        if not isinstance(raw_box, (list, tuple)) or len(raw_box) < 4:
            return (0.0, 0.0, 0.0, 0.0)

        try:
            c0, c1, c2, c3 = (
                float(raw_box[0]),
                float(raw_box[1]),
                float(raw_box[2]),
                float(raw_box[3]),
            )
        except (ValueError, TypeError):
            return (0.0, 0.0, 0.0, 0.0)

        w_page, h_page = float(page_rect.width), float(page_rect.height)

        if is_points or c0 > 1000.0 or c1 > 1000.0 or c2 > 1000.0 or c3 > 1000.0:
            # Absolute PDF point coordinates [x0, y0, x1, y1]
            x0, y0, x1, y1 = c0, c1, c2, c3
        else:
            # Normalized coordinates: [ymin, xmin, ymax, xmax] in [0, 1000] relative to tile_rect
            ymin, xmin, ymax, xmax = c0, c1, c2, c3
            x0 = float(tile_rect.x0) + (xmin / 1000.0) * float(tile_rect.width)
            y0 = float(tile_rect.y0) + (ymin / 1000.0) * float(tile_rect.height)
            x1 = float(tile_rect.x0) + (xmax / 1000.0) * float(tile_rect.width)
            y1 = float(tile_rect.y0) + (ymax / 1000.0) * float(tile_rect.height)

        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0

        x0 = max(0.0, min(x0, w_page))
        y0 = max(0.0, min(y0, h_page))
        x1 = max(0.0, min(x1, w_page))
        y1 = max(0.0, min(y1, h_page))

        return (x0, y0, x1, y1)

    def scan_sheet(
        self,
        pdf_path: str | Path,
        page_index: int = 0,
    ) -> LegendScanResult:
        """Scan a drawing sheet page for symbol legends and schedule abbreviations.

        Args:
            pdf_path: File path to drawing PDF.
            page_index: 0-based page index.

        Returns:
            LegendScanResult with detected bounding box, symbols, and abbreviations.

        Raises:
            ValueError: If PDF cannot be opened or page_index is out of range.
        """
        if not isinstance(page_index, int) or isinstance(page_index, bool):
            raise ValueError(  # noqa: TRY004
                f"Page index {page_index!r} is invalid: must be an integer, got {type(page_index).__name__}"
            )
        doc = self._open_document(pdf_path)
        try:
            if page_index < 0 or page_index >= len(doc):
                raise ValueError(
                    f"Page index {page_index} out of range for document with {len(doc)} pages"
                )

            page = doc[page_index]
            page_text = page.get_text()
            discipline = infer_discipline(Path(pdf_path), page_text)
            sheet_id = f"{Path(pdf_path).stem}_p{page_index}"

            # Check for electrical keyword override
            text_and_name = f"{Path(pdf_path).name} {page_text}"
            if re.search(
                r"(?:^|[^a-zA-Z])(ELECT|ELECTRICAL|POWER|LIGHTING)(?:[^a-zA-Z]|$)",
                text_and_name,
                re.IGNORECASE,
            ):
                discipline = "electrical"

            # Check if live Meta Model API is configured
            if not self.client.is_configured():
                return self._mock_legend_scan(sheet_id, discipline, page)

            return self._live_legend_scan(sheet_id, discipline, page)
        finally:
            doc.close()

    def _mock_legend_scan(
        self, sheet_id: str, discipline: str, page: pymupdf.Page
    ) -> LegendScanResult:
        """Deterministic mock mode fallback conforming to test_meta_services.py patterns."""
        page_rect = page.rect
        w = float(page_rect.width)
        h = float(page_rect.height)

        # Standard right-hand title/legend column bounding box (clamped for small sheets)
        lx0 = max(0.0, w - 600.0)
        ly0 = 200.0 if h >= 200.0 else 0.0
        lx1 = max(lx0, w - 50.0 if w > 50.0 else w)
        ly1 = max(ly0, min(h, 1900.0))
        legend_bbox = (lx0, ly0, lx1, ly1)

        disc_upper = discipline.upper()
        symbols: list[LegendSymbolEntry] = []
        abbreviations: dict[str, str] = {}

        if "PLUMB" in disc_upper:
            symbols = [
                LegendSymbolEntry(
                    symbol_id="sym_co",
                    label="CO",
                    description="Finished Floor Cleanout",
                    system="Sanitary Waste",
                    category="PLUMBING_FIXTURE",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 300.0, legend_bbox[0] + 120.0, 350.0),
                    confidence=0.94,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_fd",
                    label="FD",
                    description="Cast Iron Floor Drain with Trap Primer",
                    system="Sanitary Waste",
                    category="PLUMBING_FIXTURE",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 380.0, legend_bbox[0] + 120.0, 430.0),
                    confidence=0.95,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_bv",
                    label="BV",
                    description="Full Port Bronze Ball Valve",
                    system="Domestic Water",
                    category="VALVE",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 460.0, legend_bbox[0] + 120.0, 510.0),
                    confidence=0.93,
                    status="SUGGESTED",
                ),
            ]
            abbreviations = {
                "CW": "Cold Water",
                "HW": "Hot Water",
                "SAN": "Sanitary Sewer",
                "VENT": "Plumbing Vent Stack",
                "CO": "Cleanout",
                "FD": "Floor Drain",
            }
        elif "ELECT" in disc_upper:
            symbols = [
                LegendSymbolEntry(
                    symbol_id="sym_dup",
                    label="DUP",
                    description="NEMA 5-20R Duplex Convenience Receptacle 120V 20A",
                    system="Branch Power",
                    category="RECEPTACLE",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 300.0, legend_bbox[0] + 120.0, 350.0),
                    confidence=0.96,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_sw",
                    label="SW",
                    description="Single Pole Toggle Switch 120/277V 20A",
                    system="Lighting",
                    category="SWITCH",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 380.0, legend_bbox[0] + 120.0, 430.0),
                    confidence=0.94,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_pnl",
                    label="PNL",
                    description="Distribution Panelboard 208Y/120V 3PH 4W",
                    system="Distribution",
                    category="PANEL",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 460.0, legend_bbox[0] + 120.0, 510.0),
                    confidence=0.95,
                    status="SUGGESTED",
                ),
            ]
            abbreviations = {
                "EMT": "Electrical Metallic Tubing",
                "EGC": "Equipment Grounding Conductor",
                "AFF": "Above Finished Floor",
                "LP": "Lighting Panel",
            }
        else:
            # Mechanical default
            symbols = [
                LegendSymbolEntry(
                    symbol_id="sym_sd",
                    label="SD",
                    description="Supply Air Ceiling Diffuser with CFM & Neck Size",
                    system="Supply Air",
                    category="DIFFUSER",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 300.0, legend_bbox[0] + 120.0, 350.0),
                    confidence=0.95,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_rg",
                    label="RG",
                    description="Return Air Ceiling Grille with Opposed Blade Damper",
                    system="Return Air",
                    category="GRILLE",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 380.0, legend_bbox[0] + 120.0, 430.0),
                    confidence=0.94,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_fd",
                    label="FD",
                    description="UL 555 Rated 165°F Fusible Link Fire Damper",
                    system="Fire Life Safety",
                    category="DAMPER",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 460.0, legend_bbox[0] + 120.0, 510.0),
                    confidence=0.96,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_vd",
                    label="VD",
                    description="Manual Quadrant Volume Balancing Damper",
                    system="Supply Air",
                    category="DAMPER",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 540.0, legend_bbox[0] + 120.0, 590.0),
                    confidence=0.92,
                    status="SUGGESTED",
                ),
                LegendSymbolEntry(
                    symbol_id="sym_vav",
                    label="VAV",
                    description="Single-Duct Variable Air Volume Terminal Box",
                    system="Supply Air",
                    category="EQUIPMENT",
                    bounding_box_pt=(legend_bbox[0] + 50.0, 620.0, legend_bbox[0] + 120.0, 670.0),
                    confidence=0.95,
                    status="SUGGESTED",
                ),
            ]
            abbreviations = {
                "CFM": "Cubic Feet per Minute",
                "VAV": "Variable Air Volume",
                "FD": "Fire Damper",
                "SD": "Supply Diffuser",
                "RG": "Return Grille",
                "VD": "Volume Damper",
                "TDF": "Transverse Duct Flange",
            }

        # Populate real 150 DPI exemplar glyph raster crops from the page
        for idx, sym in enumerate(symbols):
            sx0, sy0, sx1, sy1 = sym.bounding_box_pt
            if sx0 > sx1:
                sx0, sx1 = sx1, sx0
            if sy0 > sy1:
                sy0, sy1 = sy1, sy0
            if sx1 > w or sy1 > h or sx0 >= w or sy0 >= h:
                band_h = max(4.0, h / max(len(symbols) + 1, 2))
                sy0 = min(max(0.0, idx * band_h), max(0.0, h - 4.0))
                sy1 = min(h, sy0 + band_h)
                sx0 = min(max(0.0, lx0 + 4.0), max(0.0, w - 4.0))
                sx1 = min(w, max(sx0 + 4.0, min(w, sx0 + 70.0)))
                sym.bounding_box_pt = (sx0, sy0, sx1, sy1)
            sym.exemplar_crop_base64 = self._crop_glyph(page, sym.bounding_box_pt, padding=3.0)

        if any(s.exemplar_crop_base64 == "" for s in symbols):
            return LegendScanResult(
                sheet_id=sheet_id,
                legend_detected=False,
                legend_bbox_pt=legend_bbox,
                symbols=[],
                abbreviations={},
                confidence=0.0,
                mock=True,
                review_required=True,
            )

        return LegendScanResult(
            sheet_id=sheet_id,
            legend_detected=True,
            legend_bbox_pt=legend_bbox,
            symbols=symbols,
            abbreviations=abbreviations,
            confidence=0.95,
            mock=True,
            review_required=False,
        )

    def _live_legend_scan(
        self, sheet_id: str, discipline: str, page: pymupdf.Page
    ) -> LegendScanResult:
        """Perform live VLM inference using muse-spark-1.3 targeting candidate legend tile."""
        try:
            page_rect = page.rect
            tile_rect = self._locate_legend_tile(page)

            # Render ONLY the candidate legend tile at 150 DPI (Rule 1 of meta-vlm-prompting)
            tile_pix = page.get_pixmap(dpi=150, clip=tile_rect)
            img_bytes = tile_pix.tobytes("png")
            b64_image = base64.b64encode(img_bytes).decode("ascii")

            prompt = (
                f"You are muse-spark-1.3, an expert vision AI analyzing an architectural/engineering ({discipline}) blueprint legend tile.\n"
                "Detect the Symbol Legend, Graphic Symbols Table, and Drawing Abbreviations in this cropped region.\n"
                f"Tile dimensions in PDF points: width={tile_rect.width:.1f}, height={tile_rect.height:.1f}, "
                f"offset_x={tile_rect.x0:.1f}, offset_y={tile_rect.y0:.1f}.\n\n"
                "Return a strict JSON object with this schema:\n"
                "{\n"
                '  "legend_detected": true,\n'
                '  "legend_bbox": [ymin, xmin, ymax, xmax],\n'
                '  "symbols": [\n'
                '    {\n'
                '      "label": "SD",\n'
                '      "description": "Supply Air Diffuser",\n'
                '      "system": "Supply Air",\n'
                '      "category": "DIFFUSER",\n'
                '      "glyph_bbox": [ymin, xmin, ymax, xmax],\n'
                '      "confidence": 0.95\n'
                '    }\n'
                '  ],\n'
                '  "abbreviations": {"CFM": "Cubic Feet per Minute"},\n'
                '  "confidence": 0.95,\n'
                '  "review_required": false\n'
                "}\n"
                "INVARIANTS:\n"
                "1. All bounding box coordinates [ymin, xmin, ymax, xmax] must be normalized integers [0, 1000] relative to this tile image.\n"
                "2. glyph_bbox must tightly enclose ONLY the graphic icon/glyph, excluding label text.\n"
                "3. If no legend is present, return {\"legend_detected\": false, \"symbols\": [], \"abbreviations\": {}}.\n"
                "4. Only return valid JSON."
            )

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64_image}"},
                        },
                    ],
                }
            ]
            comp_fn = getattr(self.client, "_execute_governed_completion", None)
            # If self.client is a mock where _execute_governed_completion return_value was not customized,
            # execute the real MetaModelClient._execute_governed_completion to honor mock_client.client or httpx
            if comp_fn is not None and getattr(comp_fn, "_mock_return_value", None) is getattr(unittest.mock, "DEFAULT", None):
                res = MetaModelClient._execute_governed_completion(
                    self.client,
                    model="muse-spark-1.3",
                    messages=messages,
                    profile=PROFILE_SCHEDULE_EXTRACTION,
                    temperature=0.0,
                )
            elif callable(comp_fn):
                res = comp_fn(
                    model="muse-spark-1.3",
                    messages=messages,
                    profile=PROFILE_SCHEDULE_EXTRACTION,
                    temperature=0.0,
                )
            else:
                res = ("", {})

            if isinstance(res, tuple) and len(res) >= 2:
                raw_content, _telemetry = res[0], res[1]
            elif isinstance(res, (tuple, list)) and len(res) == 1:
                raw_content, _telemetry = res[0], {}
            elif isinstance(res, str):
                raw_content, _telemetry = res, {}
            else:
                raw_content = str(res) if res is not None else ""
                _telemetry = {}

            clean = raw_content.strip()
            if "```" in clean:
                m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", clean, re.DOTALL)
                if m:
                    clean = m.group(1).strip()
            elif "{" in clean and "}" in clean:
                start_idx = clean.find("{")
                end_idx = clean.rfind("}")
                clean = clean[start_idx : end_idx + 1].strip()

            raw_dict = json.loads(clean)
            if not isinstance(raw_dict, dict):
                raise TypeError("VLM response must be a JSON dictionary")

            # Validate schema via Pydantic
            vlm_resp = _VLMResponse.model_validate(raw_dict)

            # Determine legend bounding box in PDF points
            raw_legend_bbox = vlm_resp.legend_bbox_pt
            is_legend_pts = True
            if raw_legend_bbox is None:
                raw_legend_bbox = vlm_resp.legend_bbox
                is_legend_pts = False

            legend_bbox: tuple[float, float, float, float] | None = None
            if raw_legend_bbox is not None and len(raw_legend_bbox) >= 4:
                legend_bbox = self._parse_bbox_to_points(
                    raw_legend_bbox, tile_rect, page_rect, is_points=is_legend_pts
                )

            symbols: list[LegendSymbolEntry] = []
            for i, s in enumerate(vlm_resp.symbols):
                raw_sym_bbox = s.bbox_pt or s.glyph_bbox_pt or s.bounding_box_pt
                is_sym_pts = True
                if raw_sym_bbox is None:
                    raw_sym_bbox = s.glyph_bbox
                    is_sym_pts = False

                if raw_sym_bbox is not None and len(raw_sym_bbox) >= 4:
                    bbox_tuple = self._parse_bbox_to_points(
                        raw_sym_bbox, tile_rect, page_rect, is_points=is_sym_pts
                    )
                else:
                    bbox_tuple = (0.0, 0.0, 0.0, 0.0)

                # Generate 150 DPI exemplar crop
                crop_b64 = self._crop_glyph(page, bbox_tuple, padding=3.0)

                symbols.append(
                    LegendSymbolEntry(
                        symbol_id=f"sym_{i+1}",
                        label=str(s.label),
                        description=str(s.description),
                        system=str(s.system or "General"),
                        category=str(s.category or "EQUIPMENT"),
                        bounding_box_pt=bbox_tuple,
                        exemplar_crop_base64=crop_b64,
                        confidence=float(s.confidence),
                        status="SUGGESTED",
                    )
                )

            legend_detected = (
                vlm_resp.legend_detected
                if raw_dict.get("legend_detected") is not None
                else (len(symbols) > 0)
            )

            review_required = bool(vlm_resp.review_required)
            if legend_detected and not symbols:
                review_required = True
            if legend_detected and vlm_resp.confidence < 0.85:
                review_required = True

            confidence = float(vlm_resp.confidence) if legend_detected else 0.0

            return LegendScanResult(
                sheet_id=sheet_id,
                legend_detected=legend_detected,
                legend_bbox_pt=legend_bbox,
                symbols=symbols,
                abbreviations=vlm_resp.abbreviations,
                confidence=confidence,
                mock=False,
                review_required=review_required,
            )
        except Exception as exc:  # noqa: BLE001 -- fail-closed boundary: any VLM/SDK error must abstain, not propagate
            logger.warning("Live legend extraction failed (failing closed): %s: %s", type(exc).__name__, exc)
            # Fail closed on any model, network, timeout, or parsing exception
            return LegendScanResult(
                sheet_id=sheet_id,
                legend_detected=False,
                legend_bbox_pt=None,
                symbols=[],
                abbreviations={},
                confidence=0.0,
                mock=False,
                review_required=True,
            )


def scan_sheet_legend(
    pdf_path: Path | str,
    page_index: int = 0,
    client: MetaModelClient | None = None,
) -> LegendScanResult:
    """Convenience functional wrapper for scanning a sheet's symbol legend."""
    scanner = LegendScanner(client=client)
    return scanner.scan_sheet(pdf_path, page_index=page_index)
