"""Equipment Schedule Parsing & Floor Plan Spatial Entity Linking.

Parses schedule tables via muse-spark-1.3, extracts scheduled equipment items,
and cross-references tags against floor plan vector text blocks to establish
grounded spatial entity links and 'Ghost Pin' predictions for unplaced items.
"""

from __future__ import annotations

import json
import re
from typing import Literal

from pydantic import BaseModel, Field

from src.meta_services.client import PROFILE_SCHEDULE_EXTRACTION, MetaModelClient
from src.store.takeoff_store import TakeoffRecord


class ScheduledItem(BaseModel):
    tag: str
    category: str = "EQUIPMENT"
    description: str
    system: str = "General"
    cfm: float | None = None
    dimension: str | None = None
    located_on_plan: bool = False
    plan_coordinates_pt: list[float] | None = None  # [x, y] in PDF points


class ScheduleExtractionResult(BaseModel):
    schedule_title: str
    items: list[ScheduledItem] = Field(default_factory=list)
    placed_count: int = 0
    unplaced_ghost_count: int = 0


class ScheduleParser:
    def __init__(self, client: MetaModelClient | None = None):
        self.client = client or MetaModelClient()

    def parse_schedule_crop(
        self,
        base64_crop: str,
        schedule_title: str = "MEP Equipment Schedule",
    ) -> list[ScheduledItem]:
        """Extracts rows from a schedule crop using muse-spark-1.3."""
        if not self.client.is_configured():
            # Mock schedule records for testing and offline development
            return [
                ScheduledItem(
                    tag="VAV-01",
                    category="EQUIPMENT",
                    description="Variable Air Volume Terminal Box",
                    system="Supply Air",
                    cfm=450.0,
                    dimension='10" Inlet',
                ),
                ScheduledItem(
                    tag="VAV-02",
                    category="EQUIPMENT",
                    description="Variable Air Volume Terminal Box",
                    system="Supply Air",
                    cfm=650.0,
                    dimension='12" Inlet',
                ),
                ScheduledItem(
                    tag="EF-1",
                    category="EQUIPMENT",
                    description="Exhaust Fan - Roof Mounted",
                    system="Exhaust Air",
                    cfm=1200.0,
                    dimension='16" Duct',
                ),
                ScheduledItem(
                    tag="S1",
                    category="FIXTURE",
                    description="Supply Diffuser 24x24",
                    system="Supply Air",
                    cfm=175.0,
                    dimension="24x24",
                ),
            ]

        prompt = (
            f"You are parsing an engineering equipment schedule titled '{schedule_title}'. "
            "Extract every scheduled piece of equipment into a JSON array of objects with keys: "
            "'tag' (e.g. 'VAV-1', 'EF-2', 'AHU-1', 'S1'), 'description', 'system' (e.g. 'Supply Air', 'Exhaust', 'Hydronic'), "
            "'cfm' (number or null), 'dimension' (string or null). "
            "Return ONLY a JSON array."
        )

        res = self.client.parse_crop_ocr(base64_crop, prompt=prompt, profile=PROFILE_SCHEDULE_EXTRACTION)
        raw = res.get("raw_content", "")
        try:
            clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            records = json.loads(clean)
            return [
                ScheduledItem(
                    tag=r.get("tag", "UNKNOWN"),
                    category="EQUIPMENT",
                    description=r.get("description", ""),
                    system=r.get("system", "General"),
                    cfm=float(r["cfm"]) if r.get("cfm") is not None else None,
                    dimension=r.get("dimension"),
                )
                for r in records
                if r.get("tag")
            ]
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return []

    def link_schedule_to_plan(
        self,
        scheduled_items: list[ScheduledItem],
        page_text_blocks: list[tuple[str, list[float]]],
        project_id: str,
        sheet_id: str,
    ) -> tuple[list[TakeoffRecord], list[ScheduledItem]]:
        """Cross-references scheduled tags against page text blocks to generate linked takeoff records.
        
        Returns:
            (takeoff_records, unplaced_ghost_items)
        """
        takeoff_records: list[TakeoffRecord] = []
        unplaced_items: list[ScheduledItem] = []

        for item in scheduled_items:
            tag_regex = re.compile(rf"\b{re.escape(item.tag)}\b", re.IGNORECASE)
            matched_coords: list[list[float]] = []

            for text, bbox in page_text_blocks:
                if tag_regex.search(text):
                    # Center of bbox in PDF points
                    cx = round((bbox[0] + bbox[2]) / 2.0, 2)
                    cy = round((bbox[1] + bbox[3]) / 2.0, 2)
                    matched_coords.append([cx, cy])

            if matched_coords:
                item.located_on_plan = True
                item.plan_coordinates_pt = matched_coords[0]
                category_val: Literal["DUCTWORK", "PIPING", "EQUIPMENT", "FIXTURE"] = (
                    "FIXTURE" if item.category == "FIXTURE" else "EQUIPMENT"
                )
                for coord in matched_coords:
                    rec = TakeoffRecord(
                        project_id=project_id,
                        sheet_id=sheet_id,
                        category=category_val,
                        system=item.system,
                        dimension_label=f"{item.tag} ({item.dimension or item.description})",
                        status="SUGGESTED",
                        source="VLM_DETECTION",
                        total_length_ft=0.0,
                        count=1,
                        geometry={"type": "point", "coordinates": coord, "tag": item.tag},
                        confidence=0.95,
                    )
                    takeoff_records.append(rec)
            else:
                item.located_on_plan = False
                unplaced_items.append(item)

        return takeoff_records, unplaced_items
