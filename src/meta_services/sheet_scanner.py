"""SheetScan: Automated title block reconnaissance and sheet indexing via muse-spark-1.3.

Extracts:
  - Sheet number (e.g. 'M-2.2', 'P104.1')
  - Sheet title (e.g. 'HVAC DUCTWORK PLAN')
  - Discipline (MECHANICAL, PLUMBING, ELECTRICAL, etc.)
  - Scale string & validated scale ratio (fail-closed)
  - Drawing dimensions in PDF points and pixels
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Literal, cast

import pymupdf

from src.core_vector.pipeline import extract_sheet_id, infer_discipline
from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import MetaModelClient
from src.models.schemas import SheetMetadata


class SheetScanner:
    def __init__(self, client: MetaModelClient | None = None):
        self.client = client or MetaModelClient()

    def scan_page(self, pdf_path: str | Path, page_index: int = 0) -> SheetMetadata:
        """Performs document reconnaissance on a single drawing sheet."""
        doc = pymupdf.open(str(pdf_path))
        try:
            if page_index >= len(doc):
                raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")
            page = doc[page_index]
            rect = page.rect
            width_pt = rect.width
            height_pt = rect.height

            # Native text extraction from bottom-right quadrant (standard AEC title block location)
            title_block_clip = pymupdf.Rect(width_pt * 0.65, height_pt * 0.65, width_pt, height_pt)
            tb_text = page.get_text("text", clip=title_block_clip) or page.get_text("text")

            # Extract scale candidates from page text
            scale_ratio, scale_status = ScaleValidator.parse_scale_string(tb_text)
            scale_raw = None
            if scale_ratio:
                for pattern, _ in ScaleValidator.SCALE_PATTERNS:
                    m = re.search(pattern, tb_text, re.IGNORECASE)
                    if m:
                        scale_raw = m.group(0).strip()
                        break

            # If client is configured, call muse-spark-1.3 on title block raster crop
            sheet_number = ""
            sheet_title = ""
            vlm_discipline: str | None = None

            if self.client.is_configured():
                pix = page.get_pixmap(dpi=150, clip=title_block_clip)
                img_bytes = pix.tobytes("png")
                b64_img = base64.b64encode(img_bytes).decode("ascii")

                prompt = (
                    "You are inspecting an architectural/engineering title block. "
                    "Extract: sheet_number (e.g. 'M-2.2', 'P101'), sheet_title, discipline (MECHANICAL, PLUMBING, ELECTRICAL, ARCHITECTURAL, GENERAL), "
                    "and scale_string. Respond ONLY with valid JSON: "
                    '{"sheet_number": str, "sheet_title": str, "discipline": str, "scale_string": str}'
                )
                ocr_res = self.client.parse_crop_ocr(b64_img, prompt=prompt)
                raw = ocr_res.get("raw_content", "")
                try:
                    # Clean markdown codeblocks if present
                    clean_json = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                    data = json.loads(clean_json)
                    sheet_number = data.get("sheet_number", "")
                    sheet_title = data.get("sheet_title", "")
                    raw_disc = str(data.get("discipline", "")).strip().upper()
                    if raw_disc in {"MECHANICAL", "PLUMBING", "ELECTRICAL", "ARCHITECTURAL", "GENERAL"}:
                        vlm_discipline = raw_disc
                    if data.get("scale_string") and not scale_raw:
                        scale_raw = data.get("scale_string")
                        scale_ratio, scale_status = ScaleValidator.parse_scale_string(scale_raw)
                except (json.JSONDecodeError, KeyError, ValueError, TypeError):
                    sheet_number = ""

            # Fallback to deterministic extraction if VLM unconfigured or incomplete
            page_full_text = page.get_text("text")
            if not sheet_number:
                sheet_number = extract_sheet_id(tb_text or page_full_text, Path(pdf_path).stem, page_index)

            if not sheet_title:
                lines = [line.strip() for line in (tb_text or page_full_text).splitlines() if line.strip()]
                for line in lines:
                    if any(k in line.upper() for k in ["PLAN", "FLOOR", "DUCTWORK", "PIPING", "HVAC", "LEVEL"]):
                        sheet_title = line
                        break
                if not sheet_title:
                    sheet_title = Path(pdf_path).stem.replace("_", " ").title()

            # Discipline determination: keep validated VLM discipline if recognized, otherwise deterministic core classifier
            if vlm_discipline:
                raw_disc = vlm_discipline
            else:
                inferred_disc = infer_discipline(Path(pdf_path), page_full_text, sheet_id=sheet_number)
                raw_disc = inferred_disc.upper()

            disc_literal = cast(
                Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"],
                raw_disc if raw_disc in {"MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"} else "GENERAL",
            )

            sheet_id = f"{sheet_number.lower().replace(' ', '_').replace('.', '_')}_p{page_index}"

            return SheetMetadata(
                sheet_id=sheet_id,
                page_index=page_index,
                sheet_number=sheet_number,
                sheet_title=sheet_title,
                discipline=disc_literal,
                scale_raw=scale_raw,
                scale_ratio=scale_ratio,
                scale_status=scale_status,
                width_pt=round(width_pt, 2),
                height_pt=round(height_pt, 2),
                dpi=150,
            )
        finally:
            doc.close()
