"""Evidence-grounding tests for TakeoffCopilot (TASK-002).

Covers the brief's acceptance criteria:
  - answer_query queries TakeoffStore for items, summary, and sheet scale
  - citations are physical PDF-point bboxes [x1, y1, x2, y2] from stored
    geometry (point, bbox, and polyline shapes), clamped to sheet bounds
  - fail-closed scale warnings whenever the scale is unverified or the
    calibrated ratio is missing, on every query intent
  - deterministic OFFLINE_TEMPLATE fallback with no fabricated values
  - live muse-wonder-1.0 path grounded in store records (mocked transport);
    citations never come from substring-matching model prose
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from src.meta_services.client import MetaModelClient
from src.meta_services.copilot import TakeoffCopilot, bbox_from_geometry
from src.models.schemas import CopilotQueryRequest
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


class OfflineClient:
    """Unconfigured Meta client stub: forces the deterministic fallback."""

    def is_configured(self) -> bool:
        return False

    def query_reasoning(self, prompt: str, context: Any = None) -> dict[str, Any]:
        raise AssertionError("offline path must not call the model")


class StubWonderClient:
    """Configured wonder stub returning canned prose (or raising)."""

    def __init__(self, content: str = "", *, mock: bool = False, raises: bool = False):
        self.content = content
        self.mock = mock
        self.raises = raises
        self.last_context: dict[str, Any] | None = None

    def is_configured(self) -> bool:
        return True

    def query_reasoning(self, prompt: str, context: Any = None) -> dict[str, Any]:
        if self.raises:
            raise RuntimeError("simulated transport failure")
        self.last_context = context
        return {"content": self.content, "mock": self.mock}


async def _make_store(tmp_path: Path) -> TakeoffStore:
    store = TakeoffStore(db_path=tmp_path / "copilot_grounding.sqlite3")
    await store.initialize()
    return store


async def _add_sheet(
    store: TakeoffStore,
    *,
    scale_status: str = "VERIFIED",
    scale_ratio: float | None = 48.0,
    scale_raw: str | None = '1/4" = 1\'-0"',
) -> None:
    await store.insert_sheet(
        sheet_id="s1",
        project_id="p1",
        page_index=0,
        sheet_number="M-201",
        sheet_title="HVAC Floor Plan",
        discipline="MECHANICAL",
        scale_raw=scale_raw,
        scale_ratio=scale_ratio,
        scale_status=scale_status,
        width_pt=3024.0,
        height_pt=2160.0,
    )


async def _add_item(
    store: TakeoffStore,
    *,
    item_id: str,
    category: str = "EQUIPMENT",
    dimension_label: str = "VAV-01 (Terminal Box)",
    geometry: Any = None,
    status: str = "ACCEPTED",
    total_length_ft: float = 0.0,
) -> None:
    await store.add_takeoff_item(
        TakeoffRecord(
            item_id=item_id,
            project_id="p1",
            sheet_id="s1",
            category=category,  # type: ignore[arg-type]
            system="Supply Air",
            dimension_label=dimension_label,
            status=status,  # type: ignore[arg-type]
            geometry=geometry if geometry is not None else {},
            total_length_ft=total_length_ft,
            count=1,
        )
    )


# ---------------------------------------------------------------------------
# Geometry -> physical bbox citations
# ---------------------------------------------------------------------------


def test_bbox_from_geometry_shapes():
    assert bbox_from_geometry({"type": "point", "coordinates": [480.0, 350.0]}) == [
        460.0,
        330.0,
        500.0,
        370.0,
    ]
    assert bbox_from_geometry({"bbox": [620.0, 420.0, 500.0, 400.0]}) == [
        500.0,
        400.0,
        620.0,
        420.0,
    ]
    assert bbox_from_geometry({"type": "polyline", "points": [[100.0, 100.0], [300.0, 250.0]]}) == [
        100.0,
        100.0,
        300.0,
        250.0,
    ]
    # Malformed / non-finite geometry abstains instead of inventing a box.
    assert bbox_from_geometry({"type": "point", "coordinates": ["north", None]}) is None
    assert bbox_from_geometry({"type": "point", "coordinates": [float("nan"), 10.0]}) is None
    assert bbox_from_geometry({}) is None
    assert bbox_from_geometry(None) is None


@pytest.mark.asyncio
async def test_offline_equipment_query_cites_exact_bbox_for_point_geometry(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(
        store, item_id="item-vav-1", geometry={"type": "point", "coordinates": [480.0, 350.0]}
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))

    assert "Found 1" in res.answer
    assert res.cited_coordinates == [[460.0, 330.0, 500.0, 370.0]]
    assert res.referenced_item_ids == ["item-vav-1"]
    assert res.model_used is False
    assert "OFFLINE_TEMPLATE" in res.answer


@pytest.mark.asyncio
async def test_bbox_geometry_is_cited_verbatim_not_shrunk_to_point(tmp_path: Path):
    """Schedule-linked items store a 4-number bbox in ``coordinates``; the
    citation must be that exact physical box, not a point expansion."""
    store = await _make_store(tmp_path)
    await _add_item(
        store,
        item_id="item-vav-2",
        geometry={"type": "point", "coordinates": [500.0, 400.0, 620.0, 420.0]},
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Show me the diffusers"))

    assert res.cited_coordinates == [[500.0, 400.0, 620.0, 420.0]]
    assert res.referenced_item_ids == ["item-vav-2"]


@pytest.mark.asyncio
async def test_polyline_geometry_cites_envelope_and_accepted_footage(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_sheet(store)
    await _add_item(
        store,
        item_id="item-duct-1",
        category="DUCTWORK",
        dimension_label="24x12 Supply",
        geometry={"type": "polyline", "points": [[100.0, 100.0], [300.0, 100.0], [300.0, 250.0]]},
        total_length_ft=25.0,
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(
        CopilotQueryRequest(sheet_id="s1", query="How much duct footage is on this sheet?")
    )

    assert res.cited_coordinates == [[100.0, 100.0, 300.0, 250.0]]
    assert res.referenced_item_ids == ["item-duct-1"]
    assert "25.0 accepted linear feet" in res.answer
    assert res.scale_verified is True


@pytest.mark.asyncio
async def test_citation_is_clamped_to_sheet_bounds(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_sheet(store)
    await _add_item(
        store, item_id="item-edge", geometry={"type": "point", "coordinates": [3020.0, 100.0]}
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where is the equipment?"))

    assert res.cited_coordinates == [[3000.0, 80.0, 3024.0, 120.0]]


@pytest.mark.asyncio
async def test_selection_bbox_limits_citations(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(store, item_id="item-near", geometry={"type": "point", "coordinates": [100.0, 100.0]})
    await _add_item(
        store,
        item_id="item-far",
        dimension_label="VAV-02 (Terminal Box)",
        geometry={"type": "point", "coordinates": [900.0, 800.0]},
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(
        CopilotQueryRequest(
            sheet_id="s1", query="What equipment is here?", selection_bbox=[0.0, 0.0, 400.0, 400.0]
        )
    )

    assert res.referenced_item_ids == ["item-near"]
    assert res.cited_coordinates == [[80.0, 80.0, 120.0, 120.0]]


@pytest.mark.asyncio
async def test_invalid_geometry_produces_no_citation(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(store, item_id="item-bad", geometry={"type": "point", "coordinates": ["north", None]})
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))

    assert "Found 1" in res.answer  # the ledger record honestly exists
    assert res.cited_coordinates == []  # but no location is invented for it
    assert res.referenced_item_ids == []


# ---------------------------------------------------------------------------
# Fail-closed scale grounding
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unverified_scale_warns_on_equipment_and_summary_queries(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(
        store, item_id="item-vav-1", geometry={"type": "point", "coordinates": [480.0, 350.0]}
    )
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    for query in ("Where are the VAV boxes?", "Summarize this drawing"):
        res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query=query))
        assert res.scale_verified is False
        assert "scale_status: UNVERIFIED" in res.answer


@pytest.mark.asyncio
async def test_unknown_sheet_is_unverified_and_offline(tmp_path: Path):
    store = await _make_store(tmp_path)
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="ghost", query="What is the sheet scale?"))

    assert res.scale_verified is False
    assert "UNVERIFIED" in res.answer
    assert res.model_used is False
    assert res.cited_coordinates == []


@pytest.mark.asyncio
async def test_verified_status_without_ratio_is_still_unverified(tmp_path: Path):
    """Fail-closed: a VERIFIED label with no calibrated ratio proves nothing."""
    store = await _make_store(tmp_path)
    await _add_sheet(store, scale_status="VERIFIED", scale_ratio=None)
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="What is the sheet scale?"))

    assert res.scale_verified is False
    assert "scale_status: UNVERIFIED" in res.answer


@pytest.mark.asyncio
async def test_verified_sheet_reports_true_scale(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_sheet(store, scale_status="CALIBRATED", scale_ratio=48.0)
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="What is the sheet scale?"))

    assert res.scale_verified is True
    assert '1/4" = 1\'-0"' in res.answer
    assert "scale_status: VERIFIED" in res.answer


# ---------------------------------------------------------------------------
# Offline fallback: deterministic, labelled, never fabricated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_offline_fallback_empty_ledger_never_fabricates(tmp_path: Path):
    store = await _make_store(tmp_path)
    copilot = TakeoffCopilot(client=OfflineClient(), store=store)  # type: ignore[arg-type]

    first = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Summarize this drawing"))
    second = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Summarize this drawing"))

    assert first.model_used is False
    assert "OFFLINE_TEMPLATE" in first.answer
    assert "across 0 item(s)" in first.answer
    assert "0.0 accepted linear feet" in first.answer
    assert first.cited_coordinates == []
    assert first.referenced_item_ids == []
    assert first.answer == second.answer  # deterministic template


# ---------------------------------------------------------------------------
# Live muse-wonder-1.0 path: grounded in the store, mocked transport
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_live_path_citations_come_from_store_not_model_prose(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(
        store, item_id="item-vav-1", geometry={"type": "point", "coordinates": [480.0, 350.0]}
    )
    # The model hallucinates an item ID that does not exist in the ledger.
    client = StubWonderClient(content="The VAV ghost-999 sits near the core at [1, 2, 3, 4].")
    copilot = TakeoffCopilot(client=client, store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))

    assert res.model_used is True
    # Citations resolve to real stored geometry only -- never the ghost.
    assert res.referenced_item_ids == ["item-vav-1"]
    assert res.cited_coordinates == [[460.0, 330.0, 500.0, 370.0]]
    # The model was handed the grounded store context, scale badge included.
    assert client.last_context is not None
    assert client.last_context["scale_status"] == "UNVERIFIED"
    assert client.last_context["items"][0]["bbox_pdf_pt"] == [460.0, 330.0, 500.0, 370.0]
    # Fail-closed warning is appended deterministically even though the
    # model prose omitted it.
    assert res.scale_verified is False
    assert "scale_status: UNVERIFIED" in res.answer


@pytest.mark.asyncio
async def test_live_path_uses_real_client_with_mocked_transport(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_sheet(store)
    await _add_item(
        store, item_id="item-vav-1", geometry={"type": "point", "coordinates": [480.0, 350.0]}
    )

    client = MetaModelClient(api_key="sk-test-live-key")
    assert client.is_configured() is True

    def _create(**_kwargs: Any) -> Any:
        message = SimpleNamespace(content="Sheet M-201 holds VAV-01 on the supply branch.")
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    client.client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )
    copilot = TakeoffCopilot(client=client, store=store)

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))

    assert res.model_used is True
    assert res.scale_verified is True
    assert res.referenced_item_ids == ["item-vav-1"]
    assert res.cited_coordinates == [[460.0, 330.0, 500.0, 370.0]]
    assert "UNVERIFIED" not in res.answer


@pytest.mark.asyncio
async def test_live_failure_falls_back_to_offline_template(tmp_path: Path):
    store = await _make_store(tmp_path)
    await _add_item(
        store, item_id="item-vav-1", geometry={"type": "point", "coordinates": [480.0, 350.0]}
    )
    copilot = TakeoffCopilot(client=StubWonderClient(raises=True), store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Where are the VAV boxes?"))

    assert res.model_used is False
    assert "OFFLINE_TEMPLATE" in res.answer
    assert "Found 1" in res.answer
    assert res.cited_coordinates == [[460.0, 330.0, 500.0, 370.0]]


@pytest.mark.asyncio
async def test_mocked_live_response_falls_back_to_offline_template(tmp_path: Path):
    store = await _make_store(tmp_path)
    client = StubWonderClient(content="Meta Model API is not configured (offline mode).", mock=True)
    copilot = TakeoffCopilot(client=client, store=store)  # type: ignore[arg-type]

    res = await copilot.answer_query(CopilotQueryRequest(sheet_id="s1", query="Summarize this drawing"))

    assert res.model_used is False
    assert "OFFLINE_TEMPLATE" in res.answer
