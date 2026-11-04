"""Product Agent 01: Sheet Reconnaissance.

Wraps SheetScanner and ScaleValidator into an asynchronous product agent conforming to BaseAgent.
Executes native title block parsing first, invokes muse-spark-1.3 crop OCR for missed fields,
cross-checks VLM scale vs native scale for fail-closed conflict adjudication, and deterministically
classifies drawing sheet types (plan|schedule|legend|detail|riser|other).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import re
from pathlib import Path
from typing import Any, Literal, cast

import pymupdf
from pydantic import BaseModel, ConfigDict, Field

from src.agents.base import (
    AgentContext,
    AgentEvent,
    AgentEventType,
    AgentID,
    AgentResult,
    BaseAgent,
    EvidenceIDGenerator,
    ScaleStatus,
    SheetType,
)
from src.core_vector.pipeline import extract_sheet_id, infer_discipline
from src.core_vector.scale import (
    _NTS_KEYWORDS,
    _PID_KEYWORDS,
    _RISER_SHEET_ID_PATTERN,
    _SCHEMATIC_RISER_KEYWORDS,
)
from src.core_vector.scale_validator import ScaleValidator
from src.meta_services.client import PROFILE_SHEET_RECON, MetaModelClient
from src.meta_services.sheet_scanner import (
    _FAST_DISCIPLINE_BY_PREFIX,
    _FAST_SHEET_NUMBER_RE,
    SheetScanner,
)
from src.models.schemas import SheetMetadata

logger = logging.getLogger(__name__)

# Heuristic keywords for sheet type classification
_DETAIL_KEYWORDS = re.compile(
    r"\b(DETAILS?|TYPICAL\s+DETAILS?|SECTIONS?|MOUNTING|ELEVATIONS?)\b", re.IGNORECASE
)
_DETAIL_SHEET_ID_PATTERN = re.compile(r"^[A-Z]{1,3}5\d{2}$", re.IGNORECASE)

_SCHEDULE_KEYWORDS = re.compile(
    r"\b(SCHEDULES?|EQUIPMENT\s+SCHEDULE|AIR\s+BALANCE|DIFFUSER\s+SCHEDULE|PANEL\s+SCHEDULE)\b",
    re.IGNORECASE,
)

_LEGEND_KEYWORDS = re.compile(
    r"\b(SYMBOLS?\s+LEGEND|LEGEND\s+AND\s+ABBREVIATIONS?|GENERAL\s+NOTES?\s+AND\s+LEGEND|ABBREVIATIONS?|"
    r"(?:MECHANICAL|PLUMBING|ELECTRICAL|DUCT|PIPING|PIPE)(?:\s+(?:DUCT|PIPE|PIPING))?\s+SYMBOLS?)\b",
    re.IGNORECASE,
)
_LEGEND_SHEET_ID_PATTERN = re.compile(r"^[A-Z]{1,3}-?00\d?$|^[A-Z]{1,3}-?01$", re.IGNORECASE)

_PLAN_KEYWORDS = re.compile(
    r"\b(PLAN|FLOOR\s+PLAN|CONSTRUCTION\s+PLAN|DUCTWORK|PIPING\s+PLAN|LIGHTING|POWER|LAYOUT|LEVEL\s+\d+|FIRST\s+FLOOR|SECOND\s+FLOOR|ROOF\s+PLAN|BASEMENT)\b",
    re.IGNORECASE,
)

_OTHER_KEYWORDS = re.compile(
    r"\b(COVER\s+SHEET|TITLE\s+SHEET|DRAWING\s+INDEX|SHEET\s+INDEX|CODE\s+COMPLIANCE|"
    r"PLAN\s+REVIEW|ACCEPTANCE|PERMIT\s+REVIEW)\b",
    re.IGNORECASE,
)

_NUMBERED_DETAIL_HEADING = re.compile(
    r"\b(?:SP|SU|P|M|E|H|FP)\s*\d{1,3}\b[^\n]{0,100}\bDETAIL\b",
    re.IGNORECASE,
)


class ScaleCandidate(BaseModel):
    """A detected or proposed scale annotation from native text or VLM."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    raw_string: str
    scale_ratio: float | None = None
    source: Literal["native_titleblock", "native_page", "vlm_crop", "manual_calibration"]
    evidence_id: str
    bbox: list[float] | None = None
    is_valid: bool = False


class SheetReconResult(BaseModel):
    """Comprehensive reconnaissance result for a single drawing sheet."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    sheet_id: str
    page_index: int
    sheet_number: str
    sheet_title: str
    discipline: Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"]
    sheet_type: SheetType
    scale_candidates: list[ScaleCandidate] = Field(default_factory=list)
    scale_status: ScaleStatus
    scale_ratio: float | None = None
    scale_raw: str | None = None
    is_measurable: bool
    review_required: bool
    width_pt: float
    height_pt: float
    dpi: int = 150
    evidence_ids: list[str] = Field(default_factory=list)
    vlm_called: bool = False
    vlm_fields_filled: list[str] = Field(default_factory=list)
    classification_reasons: list[str] = Field(default_factory=list)

    def to_metadata(self) -> SheetMetadata:
        """Export to backwards-compatible SheetMetadata for existing consumers."""
        meta_status: Literal["VERIFIED", "UNVERIFIED", "CALIBRATED", "CONFLICT"]
        if self.scale_status == ScaleStatus.VERIFIED:
            meta_status = "VERIFIED"
        elif self.scale_status == ScaleStatus.CALIBRATED:
            meta_status = "CALIBRATED"
        elif self.scale_status == ScaleStatus.CONFLICT:
            meta_status = "CONFLICT"
        else:
            meta_status = "UNVERIFIED"

        return SheetMetadata(
            sheet_id=self.sheet_id,
            page_index=self.page_index,
            sheet_number=self.sheet_number,
            sheet_title=self.sheet_title,
            discipline=self.discipline,
            scale_raw=self.scale_raw,
            scale_ratio=self.scale_ratio,
            scale_status=meta_status,
            width_pt=round(self.width_pt, 2),
            height_pt=round(self.height_pt, 2),
            dpi=self.dpi,
        )


class ReconAgent(BaseAgent):
    """Product Agent 01: Sheet Reconnaissance.

    Conforms to BaseAgent. Wraps SheetScanner and ScaleValidator with:
    1. Deterministic sheet type classification (plan|schedule|legend|detail|riser|other).
    2. Native title-block parse first; conditional muse-spark-1.3 crop OCR for missed fields.
    3. Cross-check VLM scale vs native scale: disagreement -> CONFLICT, never a winner pick.
    4. Fail-closed scale gating: non-plan sheets, NTS, or unverified scales lock footages to 0.0.
    5. Systematic Evidence ID minting and event broadcasting.
    """

    agent_id: str = AgentID.AGENT_01_RECON.value
    agent_name: str = "Sheet Recon"
    agent_version: str = "1.0.0"
    is_llm_agent: bool = True

    def __init__(
        self,
        client: MetaModelClient | None = None,
        scanner: SheetScanner | None = None,
    ) -> None:
        self.client = client or MetaModelClient()
        self.scanner = scanner or SheetScanner(client=self.client)

    @staticmethod
    def classify_sheet_type(
        title: str,
        sheet_number: str,
        text: str = "",
    ) -> tuple[SheetType, list[str]]:
        """Deterministically classify sheet into one of 6 roles (or unreadable)."""
        # The title block and sheet number identify the sheet's role. Full-page
        # notes often mention "fire risers" on ordinary floor plans; they must
        # not override explicit title-block evidence.
        role_text = f"{sheet_number} {title}".strip()
        reasons: list[str] = []

        if not role_text and not text.strip():
            return SheetType.UNREADABLE, ["Empty page content"]

        # Explicit role in the sheet number/title outranks incidental page notes.
        if _RISER_SHEET_ID_PATTERN.match(sheet_number):
            reasons.append("Matched 600-series schematic sheet ID")
            return SheetType.RISER, reasons
        if _SCHEMATIC_RISER_KEYWORDS.search(role_text):
            reasons.append("Matched riser keyword in sheet number/title")
            return SheetType.RISER, reasons
        if _PID_KEYWORDS.search(role_text):
            reasons.append("Matched P&ID keyword")
            return SheetType.RISER, reasons

        # 2. Legend / Abbreviation
        first_page_heading = " ".join(text.splitlines()[:12])
        has_legend_role = bool(
            _LEGEND_KEYWORDS.search(title)
            or _LEGEND_KEYWORDS.search(first_page_heading)
            or (
                _LEGEND_KEYWORDS.search(text)
                and not _PLAN_KEYWORDS.search(title)
            )
            or (_LEGEND_SHEET_ID_PATTERN.match(sheet_number) and "LEGEND" in role_text.upper())
        )
        if has_legend_role:
            reasons.append("Matched legend title or sheet ID")
            return SheetType.LEGEND, reasons

        # 3. Schedule
        if _SCHEDULE_KEYWORDS.search(title) and not _PLAN_KEYWORDS.search(title):
            reasons.append("Matched schedule keyword in title without plan keywords")
            return SheetType.SCHEDULE, reasons

        # 4. Details / Sections
        detail_headings = _NUMBERED_DETAIL_HEADING.findall(text)
        if (
            _DETAIL_KEYWORDS.search(title)
            or _DETAIL_SHEET_ID_PATTERN.match(sheet_number)
            or (len(detail_headings) >= 2 and not _PLAN_KEYWORDS.search(title))
        ):
            reasons.append("Matched detail keyword or 500-series sheet ID")
            return SheetType.DETAIL, reasons

        # Information and approval pages can mention "plan" in their title.
        if _OTHER_KEYWORDS.search(title):
            reasons.append("Matched title/cover/index keyword")
            return SheetType.OTHER, reasons

        # 5. Plan
        if _PLAN_KEYWORDS.search(title):
            reasons.append("Matched plan keyword in sheet title")
            return SheetType.PLAN, reasons

        # Missing title evidence is not enough to send a page through plan
        # takeoff. Keep it browsable and let an engineer classify it.
        reasons.append("No explicit plan or information-sheet role found; retained without specialist routing")
        return SheetType.OTHER, reasons

    @staticmethod
    def evaluate_scales(
        native_candidates: list[ScaleCandidate],
        vlm_candidate: ScaleCandidate | None,
        is_nts: bool,
        sheet_type: SheetType,
    ) -> tuple[ScaleStatus, float | None, str | None, bool, bool, list[str]]:
        """Adjudicate scale candidates under the Fail-Closed Scale Rule.

        Returns:
            (scale_status, scale_ratio, scale_raw, review_required, is_measurable, notes)
        """
        notes: list[str] = []

        # Gate 1: NTS / Not To Scale
        if is_nts:
            notes.append("Sheet marked Not To Scale (NTS).")
            return ScaleStatus.UNVERIFIED, None, "NOT TO SCALE", True, False, notes

        # Gate 2: Native scale conflicts
        native_valid = [c for c in native_candidates if c.is_valid and c.scale_ratio is not None]
        unique_native_ratios: set[float] = {
            c.scale_ratio for c in native_valid if c.scale_ratio is not None
        }

        if len(unique_native_ratios) > 1:
            raw_strs = ", ".join(c.raw_string for c in native_valid)
            notes.append(f"Multiple conflicting native scales detected: {raw_strs}")
            return ScaleStatus.CONFLICT, None, f"CONFLICT: Multiple native ({raw_strs})", True, False, notes

        # Gate 3: Native vs VLM cross-check
        if len(unique_native_ratios) == 1 and vlm_candidate and vlm_candidate.scale_ratio is not None:
            native_ratio = next(iter(unique_native_ratios))
            vlm_ratio = vlm_candidate.scale_ratio
            if native_ratio is not None and math.isclose(native_ratio, vlm_ratio, rel_tol=0.01):
                notes.append("Native scale confirmed by VLM crop recognition.")
                is_measurable = sheet_type == SheetType.PLAN
                review_required = not is_measurable
                return (
                    ScaleStatus.VERIFIED,
                    native_ratio,
                    native_valid[0].raw_string,
                    review_required,
                    is_measurable,
                    notes,
                )
            else:
                notes.append(
                    f"Scale conflict: Native ({native_valid[0].raw_string}, ratio={native_ratio}) "
                    f"vs VLM ({vlm_candidate.raw_string}, ratio={vlm_ratio})"
                )
                raw_conflict = f"CONFLICT: Native ({native_valid[0].raw_string}) vs VLM ({vlm_candidate.raw_string})"
                return ScaleStatus.CONFLICT, None, raw_conflict, True, False, notes

        # Gate 4: Deterministic native scale only
        if len(unique_native_ratios) == 1:
            native_ratio = next(iter(unique_native_ratios))
            notes.append("Scale verified via deterministic native title block parsing.")
            is_measurable = sheet_type == SheetType.PLAN
            review_required = not is_measurable
            return (
                ScaleStatus.VERIFIED,
                native_ratio,
                native_valid[0].raw_string,
                review_required,
                is_measurable,
                notes,
            )

        # Gate 5: VLM scale only (native missed scale) -> VLM cannot self-certify!
        if vlm_candidate and vlm_candidate.scale_ratio is not None:
            notes.append("Scale recognized by VLM crop but unverified by native text. Human review required.")
            return ScaleStatus.UNVERIFIED, None, vlm_candidate.raw_string, True, False, notes

        # Gate 6: No scale found
        notes.append("No readable scale annotation found on sheet.")
        return ScaleStatus.UNVERIFIED, None, None, True, False, notes

    def _recon_sheet_sync(
        self,
        pdf_path: str | Path,
        page_index: int,
        project_id: str,
        job_id: str,
        ev_gen: EvidenceIDGenerator,
    ) -> SheetReconResult:
        """Synchronous core engine executing native parse and conditional VLM call."""
        clean_path = Path(pdf_path)
        if not clean_path.is_file():
            raise ValueError(f"Could not open PDF drawing: file not found {clean_path}")

        try:
            doc = pymupdf.open(str(clean_path))
        except Exception as exc:
            raise ValueError(f"Could not open PDF drawing {clean_path}: {exc}") from exc

        try:
            if page_index < 0 or page_index >= len(doc):
                raise ValueError(f"Page index {page_index} out of range ({len(doc)} pages)")

            page = doc[page_index]
            rect = page.rect
            width_pt = rect.width
            height_pt = rect.height

            stem = clean_path.stem
            tb_clip = pymupdf.Rect(width_pt * 0.65, height_pt * 0.65, width_pt, height_pt)
            tb_text = page.get_text("text", clip=tb_clip) or ""
            full_text = page.get_text("text") or ""
            combined_text = tb_text + " " + full_text

            # 1. Native Sheet Number
            sheet_number = ""
            match_num = _FAST_SHEET_NUMBER_RE.search(tb_text)
            if match_num:
                sheet_number = f"{match_num.group(1).upper()}-{match_num.group(2)}"
            else:
                sheet_number = extract_sheet_id(tb_text or full_text, stem, page_index)

            # 2. Native Sheet Title
            sheet_title = ""
            lines = [line.strip() for line in (tb_text or full_text).splitlines() if line.strip()]
            for line in lines:
                if any(
                    k in line.upper()
                    for k in [
                        "PLAN",
                        "FLOOR",
                        "DUCTWORK",
                        "PIPING",
                        "HVAC",
                        "LEVEL",
                        "SCHEDULE",
                        "LEGEND",
                        "DETAILS",
                        "RISER",
                    ]
                ):
                    sheet_title = line
                    break

            # 3. Native Discipline
            is_valid_aec_num = bool(_FAST_SHEET_NUMBER_RE.match(sheet_number)) if sheet_number else False
            prefix = sheet_number[0].upper() if (sheet_number and is_valid_aec_num) else ""
            inferred_disc = _FAST_DISCIPLINE_BY_PREFIX.get(prefix)
            if not inferred_disc:
                raw_disc = infer_discipline(clean_path, full_text, sheet_id=sheet_number)
                inferred_disc = (
                    raw_disc.upper()
                    if raw_disc.upper() in {"MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL"}
                    else "GENERAL"
                )

            # 4. Native Scale Candidates
            scale_candidates: list[ScaleCandidate] = []
            is_nts = bool(_NTS_KEYWORDS.search(combined_text))

            # Prefer a scale in the title block, but real drawings often place
            # the printed scale beside the view title at the lower left. When
            # the title block has no recognized scale, scan the native page
            # text as well; a VLM-only candidate still cannot self-certify.
            cand_idx = 0
            titleblock_has_scale = any(
                re.search(pattern, tb_text, re.IGNORECASE)
                for pattern, _ in ScaleValidator.SCALE_PATTERNS
            )
            text_to_scan = tb_text if titleblock_has_scale else full_text
            scale_source: Literal["native_titleblock", "native_page", "vlm_crop", "manual_calibration"] = (
                "native_titleblock" if titleblock_has_scale else "native_page"
            )
            scale_bbox = (
                [float(tb_clip.x0), float(tb_clip.y0), float(tb_clip.x1), float(tb_clip.y1)]
                if titleblock_has_scale
                else [0.0, 0.0, float(width_pt), float(height_pt)]
            )
            for pattern, ratio in ScaleValidator.SCALE_PATTERNS:
                m = re.search(pattern, text_to_scan, re.IGNORECASE)
                if m:
                    cand_str = m.group(0).strip()
                    cand_ev = ev_gen.mint_scale_evidence(sheet_number or f"p{page_index}", cand_idx)
                    scale_candidates.append(
                        ScaleCandidate(
                            raw_string=cand_str,
                            scale_ratio=ratio,
                            source=scale_source,
                            evidence_id=cand_ev,
                            bbox=scale_bbox,
                            is_valid=True,
                        )
                    )
                    cand_idx += 1

            # 5. Conditional muse-spark-1.3 VLM Crop Call
            vlm_called = False
            vlm_fields_filled: list[str] = []
            vlm_scale_cand: ScaleCandidate | None = None

            needs_vlm = not sheet_number or not sheet_title or inferred_disc == "GENERAL" or not scale_candidates

            if needs_vlm and self.client.is_configured():
                try:
                    pix = page.get_pixmap(dpi=150, clip=tb_clip)
                    img_bytes = pix.tobytes("png")
                    b64_img = base64.b64encode(img_bytes).decode("ascii")

                    prompt = (
                        "You are inspecting an architectural/engineering title block. "
                        "Extract: sheet_number (e.g. 'M-2.2', 'P101'), sheet_title, "
                        "discipline (MECHANICAL, PLUMBING, ELECTRICAL, ARCHITECTURAL, GENERAL), "
                        "and scale_string. Respond ONLY with valid JSON: "
                        '{"sheet_number": str, "sheet_title": str, "discipline": str, "scale_string": str}'
                    )
                    vlm_res = self.client.parse_crop_ocr(b64_img, prompt=prompt, profile=PROFILE_SHEET_RECON)
                    if not vlm_res.get("mock"):
                        raw = vlm_res.get("raw_content", "")
                        clean_json = (
                            raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                        )
                        data = json.loads(clean_json)

                        vlm_num = data.get("sheet_number")
                        if isinstance(vlm_num, str) and vlm_num.strip() and not sheet_number:
                            sheet_number = vlm_num.strip()
                            vlm_fields_filled.append("sheet_number")

                        vlm_title = data.get("sheet_title")
                        if isinstance(vlm_title, str) and vlm_title.strip() and not sheet_title:
                            sheet_title = vlm_title.strip()
                            vlm_fields_filled.append("sheet_title")

                        vlm_disc = data.get("discipline")
                        if (
                            isinstance(vlm_disc, str)
                            and vlm_disc.strip().upper() in {"MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL"}
                            and inferred_disc == "GENERAL"
                        ):
                            inferred_disc = vlm_disc.strip().upper()
                            vlm_fields_filled.append("discipline")

                        vlm_scale_str = data.get("scale_string")
                        if isinstance(vlm_scale_str, str) and vlm_scale_str.strip():
                            vlm_clean_scale = vlm_scale_str.strip()
                            vlm_ratio, vlm_status = ScaleValidator.parse_scale_string(vlm_clean_scale)
                            vlm_ev = ev_gen.mint("scale_vlm", sheet_number or f"p{page_index}", suffix="spark")
                            vlm_scale_cand = ScaleCandidate(
                                raw_string=vlm_clean_scale,
                                scale_ratio=vlm_ratio,
                                source="vlm_crop",
                                evidence_id=vlm_ev,
                                bbox=[float(tb_clip.x0), float(tb_clip.y0), float(tb_clip.x1), float(tb_clip.y1)],
                                is_valid=(vlm_status == "VERIFIED"),
                            )
                            scale_candidates.append(vlm_scale_cand)
                            vlm_fields_filled.append("scale_string")
                    vlm_called = True
                except Exception as exc:  # noqa: BLE001
                    logger.warning("VLM crop recognition failed (page %s): %s", page_index, exc)
                    vlm_called = False

            # Final fallbacks for metadata
            if not sheet_number:
                sheet_number = f"{stem}_p{page_index}"
            if not sheet_title:
                sheet_title = stem.replace("_", " ").title()
            disc_literal = cast(
                Literal["MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"],
                inferred_disc
                if inferred_disc in {"MECHANICAL", "ELECTRICAL", "PLUMBING", "ARCHITECTURAL", "GENERAL"}
                else "GENERAL",
            )
            sheet_id = f"{sheet_number.lower().replace(' ', '_').replace('.', '_')}_p{page_index}"

            # 6. Sheet Type Classification
            sheet_type, class_reasons = self.classify_sheet_type(sheet_title, sheet_number, full_text)

            # 7. Scale Adjudication
            scale_status, scale_ratio, scale_raw, review_required, is_measurable, scale_notes = (
                self.evaluate_scales(
                    native_candidates=scale_candidates,
                    vlm_candidate=vlm_scale_cand,
                    is_nts=is_nts,
                    sheet_type=sheet_type,
                )
            )

            # 8. Mint and Collect Evidence IDs
            sheet_ev_id = ev_gen.mint_sheet_evidence(sheet_id)
            tb_ev_id = ev_gen.mint_title_block_evidence(sheet_id)
            all_evidence_ids = [sheet_ev_id, tb_ev_id] + [c.evidence_id for c in scale_candidates]

            return SheetReconResult(
                sheet_id=sheet_id,
                page_index=page_index,
                sheet_number=sheet_number,
                sheet_title=sheet_title,
                discipline=disc_literal,
                sheet_type=sheet_type,
                scale_candidates=scale_candidates,
                scale_status=scale_status,
                scale_ratio=scale_ratio,
                scale_raw=scale_raw,
                is_measurable=is_measurable,
                review_required=review_required,
                width_pt=round(width_pt, 2),
                height_pt=round(height_pt, 2),
                dpi=150,
                evidence_ids=all_evidence_ids,
                vlm_called=vlm_called,
                vlm_fields_filled=vlm_fields_filled,
                classification_reasons=class_reasons + scale_notes,
            )
        finally:
            doc.close()

    async def recon_sheet(
        self,
        pdf_path: str | Path,
        page_index: int = 0,
        project_id: str = "default_project",
        job_id: str = "job_default",
        evidence_generator: EvidenceIDGenerator | None = None,
    ) -> SheetReconResult:
        """Asynchronously analyze one sheet in threadpool without blocking event loop."""
        ev_gen = evidence_generator or EvidenceIDGenerator(project_id=project_id)
        # asyncio.to_thread (stdlib): starlette's run_in_threadpool requires an
        # anyio/sniffio async context and raises NoEventLoopError under plain
        # asyncio (pytest-asyncio, asyncio.run), failing all recon_sheet calls.
        return await asyncio.to_thread(
            self._recon_sheet_sync,
            pdf_path,
            page_index,
            project_id,
            job_id,
            ev_gen,
        )

    async def recon_all_sheets(
        self,
        pdf_path: str | Path,
        project_id: str = "default_project",
        job_id: str = "job_default",
        evidence_generator: EvidenceIDGenerator | None = None,
    ) -> list[SheetReconResult]:
        """Analyze all sheets in drawing package."""
        clean_path = Path(pdf_path)
        doc = pymupdf.open(str(clean_path))
        total_pages = len(doc)
        doc.close()

        ev_gen = evidence_generator or EvidenceIDGenerator(project_id=project_id)
        results: list[SheetReconResult] = []
        for idx in range(total_pages):
            res = await self.recon_sheet(
                clean_path,
                page_index=idx,
                project_id=project_id,
                job_id=job_id,
                evidence_generator=ev_gen,
            )
            results.append(res)
        return results

    async def run(self, context: AgentContext, page_index: int = 0, **kwargs: Any) -> AgentResult:
        """BaseAgent execution interface."""
        events: list[AgentEvent] = []
        sheet_id = f"page_{page_index}"
        job_id = context.job_id

        events.append(
            AgentEvent(
                job_id=job_id,
                agent_id=self.agent_id,
                event_type=AgentEventType.STARTED,
                page_index=page_index,
                message=f"Starting reconnaissance on sheet page {page_index}",
            )
        )

        try:
            if context.pdf_path is None:
                raise ValueError("AgentContext.pdf_path is required for ReconAgent")
            recon_res = await self.recon_sheet(
                context.pdf_path,
                page_index=page_index,
                project_id=context.project_id,
                job_id=job_id,
                evidence_generator=context.evidence_generator,
            )
            sheet_id = recon_res.sheet_id

            events.append(
                AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.SHEET_CLASSIFIED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=0.5,
                    message=f"Sheet classified as {recon_res.sheet_type.value} ({recon_res.sheet_number}: {recon_res.sheet_title})",
                    payload={"sheet_type": recon_res.sheet_type.value, "discipline": recon_res.discipline},
                )
            )

            events.append(
                AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.SCALE_EVALUATED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=1.0,
                    message=f"Scale evaluated: {recon_res.scale_status.value} (raw: {recon_res.scale_raw})",
                    payload={
                        "scale_status": recon_res.scale_status.value,
                        "scale_ratio": recon_res.scale_ratio,
                        "is_measurable": recon_res.is_measurable,
                        "review_required": recon_res.review_required,
                    },
                )
            )

            return AgentResult(
                agent_id=self.agent_id,
                job_id=job_id,
                success=True,
                sheet_id=sheet_id,
                sheet_type=recon_res.sheet_type,
                scale_status=recon_res.scale_status,
                scale_ratio=recon_res.scale_ratio,
                review_required=recon_res.review_required,
                evidence_ids=recon_res.evidence_ids,
                events=events,
                metrics={
                    "vlm_called": recon_res.vlm_called,
                    "vlm_fields_filled": recon_res.vlm_fields_filled,
                    "is_measurable": recon_res.is_measurable,
                    "width_pt": recon_res.width_pt,
                    "height_pt": recon_res.height_pt,
                },
            )
        except Exception as exc:
            logger.exception("Sheet recon failed on page %s", page_index)
            events.append(
                AgentEvent(
                    job_id=job_id,
                    agent_id=self.agent_id,
                    event_type=AgentEventType.FAILED,
                    sheet_id=sheet_id,
                    page_index=page_index,
                    progress=1.0,
                    message=f"Sheet recon failed: {exc}",
                    payload={"error": str(exc)},
                )
            )
            return AgentResult(
                agent_id=self.agent_id,
                job_id=job_id,
                success=False,
                sheet_id=sheet_id,
                sheet_type=SheetType.UNREADABLE,
                scale_status=ScaleStatus.UNVERIFIED,
                scale_ratio=None,
                review_required=True,
                error=str(exc),
                events=events,
            )
