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
import logging
import re
from pathlib import Path
from typing import Literal, cast

import pymupdf

from src.core_vector.pipeline import extract_sheet_id, infer_discipline
from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import PROFILE_SHEET_RECON, MetaModelClient
from src.models.schemas import SheetMetadata

logger = logging.getLogger(__name__)


class SheetScanner:
    def __init__(self, client: MetaModelClient | None = None):
        self.client = client or MetaModelClient()

    @staticmethod
    def _open_document(pdf_path: str | Path) -> pymupdf.Document:
        """Open a PDF, translating engine failures into ValueError (fail closed)."""
        try:
            return pymupdf.open(str(pdf_path))
        except (RuntimeError, OSError, ValueError) as exc:
            raise ValueError(f"Could not open PDF drawing: {exc}") from exc

    def get_page_count(self, pdf_path: str | Path) -> int:
        """Return the total page count of a drawing set PDF."""
        doc = self._open_document(pdf_path)
        try:
            return len(doc)
        finally:
            doc.close()

    def scan_all_pages(self, pdf_path: str | Path) -> list[SheetMetadata]:
        """Scan every page of a multi-sheet drawing set.

        Page dimensions ride on each SheetMetadata (width_pt/height_pt), so
        callers get the full sheet index plus cached geometry in one pass.
        A corrupt page fails closed with ValueError naming that page.
        """
        total = self.get_page_count(pdf_path)
        sheets: list[SheetMetadata] = []
        for page_index in range(total):
            try:
                sheets.append(self.scan_page(pdf_path, page_index=page_index))
            except (ValueError, RuntimeError, OSError) as exc:
                raise ValueError(f"Sheet scan failed on page {page_index}: {exc}") from exc
        return sheets

    def scan_page(self, pdf_path: str | Path, page_index: int = 0) -> SheetMetadata:
        """Performs document reconnaissance on a single drawing sheet."""
        doc = self._open_document(pdf_path)
        try:
            if page_index < 0 or page_index >= len(doc):
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

            # Fail-Closed (agent-os/policies/FAIL_CLOSED.md): any VLM failure
            # (pixmap/OCR/network/JSON) abstains to deterministic extraction
            # below; never fabricate sheet_number/title/scale on this path.
            _native_scale = (scale_raw, scale_ratio, scale_status)
            try:
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
                    ocr_res = self.client.parse_crop_ocr(b64_img, prompt=prompt, profile=PROFILE_SHEET_RECON)
                    # Mock/offline stub payloads are not detections: ignore entirely.
                    if not ocr_res.get("mock"):
                        raw = ocr_res.get("raw_content", "")
                        # Clean markdown codeblocks if present
                        clean_json = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                        data = json.loads(clean_json)
                        # Type-validate VLM JSON: only str values are accepted;
                        # non-strings are treated as absent (fail closed), never
                        # coerced — a truthy non-str would crash downstream.
                        _sheet_number = data.get("sheet_number", "")
                        sheet_number = _sheet_number if isinstance(_sheet_number, str) else ""
                        _sheet_title = data.get("sheet_title", "")
                        sheet_title = _sheet_title if isinstance(_sheet_title, str) else ""
                        _discipline = data.get("discipline", "")
                        raw_disc = _discipline.strip().upper() if isinstance(_discipline, str) else ""
                        if raw_disc in {"MECHANICAL", "PLUMBING", "ELECTRICAL", "ARCHITECTURAL", "GENERAL"}:
                            vlm_discipline = raw_disc
                        # Fix A: VLM scale is provenance only. It may record
                        # scale_raw, but must NEVER set scale_ratio or raise
                        # status above UNVERIFIED — only the deterministic
                        # native-text parse above may produce VERIFIED, and a
                        # VLM read must not override a native conflict.
                        _scale_string = data.get("scale_string", "")
                        if isinstance(_scale_string, str) and _scale_string and not scale_raw:
                            scale_raw = _scale_string
            except Exception as exc:  # noqa: BLE001 -- fail-closed boundary: any VLM/SDK error must abstain, not propagate
                logger.warning(
                    "VLM sheet scan failed (page_index=%s): %s: %s",
                    page_index,
                    type(exc).__name__,
                    exc,
                )
                # Bad JSON also lands here: VLM fields stay empty (fail closed),
                # and any partial VLM scale is discarded for the native parse.
                sheet_number = ""
                sheet_title = ""
                vlm_discipline = None
                scale_raw, scale_ratio, scale_status = _native_scale

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
