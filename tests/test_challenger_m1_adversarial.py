"""Adversarial Verification Suite for Gate 1 Remediation (Milestone 1).

Author: challenger_m1_r_1 (Adversarial Code-Executing Verifier)

Verification Targets:
1. Isolated Subprocess Imports across all 12 modules in `src.agents` and `src.meta_services`.
   - Clean Python processes completely isolated from pytest and tests/conftest.py.
   - Permutation and cross-order import isolation.
2. Adversarial Stress of `ToolRegistry.list_items`:
   - Argument delegation spy: Strict guarantee that TakeoffStore.list_items is never passed 'system' or invalid kwargs.
   - Extreme 'system' parameter variations: None, "", "supply", "Supply", "  SUPPLY  ", "UNKNOWN_SYSTEM", numeric/invalid types.
   - Extreme 'limit' parameter variations: 0, -5, -999, 999, float, string, None.
   - Non-existent and malformed sheet_id.
   - Contract parity between call_tool, execute, and direct method invocation.
   - 1D linear and degenerate geometry preservation under _clamp_to_sheet.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from src.agents.tools import ToolRegistry
from src.store.takeoff_store import TakeoffRecord, TakeoffStore


# ===========================================================================
# Helper Fixtures & Setup
# ===========================================================================
async def _init_seeded_store(tmp_path: Path) -> TakeoffStore:
    """Creates a temporary sqlite store seeded with a variety of takeoff items."""
    db_file = tmp_path / "test_adversarial_m1.sqlite3"
    store = TakeoffStore(db_path=db_file)
    await store.initialize()

    # Seed Sheet Metadata
    await store.insert_sheet(
        sheet_id="sheet_seed_01",
        project_id="proj_adv_01",
        page_index=0,
        sheet_number="M-101",
        sheet_title="HVAC Plan",
        discipline="Mechanical",
        scale_raw='1/4" = 1\'-0"',
        scale_ratio=48.0,
        scale_status="VERIFIED",
        width_pt=1000.0,
        height_pt=800.0,
    )

    # Seed Takeoff Items
    test_items = [
        # Supply Air Ducts
        TakeoffRecord(
            item_id="item-sup-01",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="DUCTWORK",
            system="Supply Air",
            dimension_label='12"x10"',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=25.5,
            count=1,
            geometry={"type": "line", "coordinates": [[100.0, 100.0], [200.0, 100.0]]},  # horizontal 1D
            confidence=0.98,
            review_required=False,
        ),
        TakeoffRecord(
            item_id="item-sup-02",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="DUCTWORK",
            system="Supply",
            dimension_label='14"x12"',
            status="SUGGESTED",
            source="VECTOR_ENGINE",
            total_length_ft=15.0,
            count=1,
            geometry={"type": "line", "coordinates": [[150.0, 100.0], [150.0, 300.0]]},  # vertical 1D
            confidence=0.92,
            review_required=False,
        ),
        # Return Air Ducts
        TakeoffRecord(
            item_id="item-ret-01",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="DUCTWORK",
            system="Return",
            dimension_label='16"x12"',
            status="ACCEPTED",
            source="VECTOR_ENGINE",
            total_length_ft=30.0,
            count=1,
            geometry={"type": "polygon", "coordinates": [[300.0, 200.0], [350.0, 200.0], [350.0, 250.0], [300.0, 250.0]]},
            confidence=0.95,
            review_required=False,
        ),
        # Exhaust Air Equipment
        TakeoffRecord(
            item_id="item-exh-01",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="EQUIPMENT",
            system="Exhaust",
            dimension_label="EF-1",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [400.0, 400.0]},
            confidence=0.88,
            review_required=True,
        ),
        # Equipment item with General system
        TakeoffRecord(
            item_id="item-gen-sys",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="EQUIPMENT",
            system="General",
            dimension_label="Damper",
            status="SUGGESTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [450.0, 450.0]},
            confidence=0.80,
            review_required=True,
        ),
        # Fixture with Empty string system
        TakeoffRecord(
            item_id="item-empty-sys",
            project_id="proj_adv_01",
            sheet_id="sheet_seed_01",
            category="FIXTURE",
            system="",
            dimension_label="Access Door",
            status="ACCEPTED",
            source="VLM_DETECTION",
            total_length_ft=0.0,
            count=1,
            geometry={"type": "point", "coordinates": [500.0, 500.0]},
            confidence=0.85,
            review_required=False,
        ),
    ]

    for item in test_items:
        await store.add_takeoff_item(item)

    return store


# ===========================================================================
# 1. ISOLATED SUBPROCESS IMPORT TESTS (ALL 12 MODULES)
# ===========================================================================
_MODULES_TO_TEST: tuple[str, ...] = (
    "src.agents",
    "src.agents.base",
    "src.agents.tools",
    "src.agents.copilot_judge",
    "src.agents.orchestrator",
    "src.agents.recon",
    "src.meta_services",
    "src.meta_services.client",
    "src.meta_services.copilot",
    "src.meta_services.sheet_scanner",
    "src.meta_services.schedule_parser",
    "src.api.routes",
)


class TestIsolatedProcessImports:
    """Stress tests module importability in pure, isolated Python subprocesses."""

    @pytest.mark.parametrize("module_name", _MODULES_TO_TEST)
    def test_single_module_isolated_process_import(self, module_name: str) -> None:
        """Each module must import cleanly with exit code 0 in a fresh python interpreter."""
        cmd = [
            sys.executable,
            "-c",
            f"import sys; sys.path.insert(0, '.'); import {module_name}; print('OK_{module_name}')",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        assert res.returncode == 0, (
            f"Module {module_name} failed isolated import!\n"
            f"STDOUT: {res.stdout}\n"
            f"STDERR: {res.stderr}"
        )
        assert f"OK_{module_name}" in res.stdout
        assert "ImportError" not in res.stderr
        assert "circular import" not in res.stderr.lower()

    def test_cross_order_circular_import_stress(self) -> None:
        """Verify that loading modules in arbitrary orders does not trigger circular initialization locks."""
        orders = [
            # copilot first, then copilot_judge
            "import src.meta_services.copilot; import src.agents.copilot_judge",
            # copilot_judge first, then copilot
            "import src.agents.copilot_judge; import src.meta_services.copilot",
            # agents package first, then meta_services package
            "import src.agents; import src.meta_services",
            # meta_services package first, then agents package
            "import src.meta_services; import src.agents",
            # tools first, then orchestrator, then copilot
            "import src.agents.tools; import src.agents.orchestrator; import src.meta_services.copilot",
        ]

        for order_snippet in orders:
            cmd = [
                sys.executable,
                "-c",
                f"import sys; sys.path.insert(0, '.'); {order_snippet}; print('ORDER_OK')",
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=False)
            assert res.returncode == 0, (
                f"Cross-order import failed for snippet: '{order_snippet}'\n"
                f"STDOUT: {res.stdout}\n"
                f"STDERR: {res.stderr}"
            )
            assert "ORDER_OK" in res.stdout


# ===========================================================================
# 2. ADVERSARIAL STRESS OF ToolRegistry.list_items
# ===========================================================================
class TestToolRegistryListItemsAdversarial:
    """Stress tests ToolRegistry.list_items under boundary, malformed, and adversarial inputs."""

    @pytest.fixture
    async def tool_reg(self, tmp_path: Path) -> ToolRegistry:
        store = await _init_seeded_store(tmp_path)
        return ToolRegistry(store=store)

    # -----------------------------------------------------------------------
    # A. Argument Delegation Spy: Verify TakeoffStore Never Receives 'system'
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_takeoff_store_list_items_never_passed_system_or_invalid_kwargs(
        self, tool_reg: ToolRegistry
    ) -> None:
        """Strict verification: Inspect the exact kwargs passed to store.list_items.

        TakeoffStore.list_items(project_id, sheet_id, status, category) must never
        receive 'system' or other invalid parameters.
        """
        original_list_items = tool_reg.store.list_items

        with patch.object(
            tool_reg.store, "list_items", side_effect=original_list_items
        ) as spy_list_items:
            # 1. Direct call with system="Supply"
            res1 = await tool_reg.list_items(sheet_id="sheet_seed_01", system="Supply")
            assert res1["count"] == 1
            spy_list_items.assert_called_once()
            _, kwargs1 = spy_list_items.call_args
            assert "system" not in kwargs1, "CRITICAL: 'system' kwarg was passed to TakeoffStore.list_items!"
            assert kwargs1.get("sheet_id") == "sheet_seed_01"

            spy_list_items.reset_mock()

            # 2. Via call_tool dispatcher
            res2 = await tool_reg.call_tool(
                "list_items",
                {"sheet_id": "sheet_seed_01", "system": "Return", "limit": 10},
            )
            assert res2["count"] == 1
            spy_list_items.assert_called_once()
            _, kwargs2 = spy_list_items.call_args
            assert "system" not in kwargs2, "CRITICAL: 'system' kwarg was passed via call_tool dispatch!"

            spy_list_items.reset_mock()

            # 3. Via execute dispatcher with invalid/extra parameters
            res3 = await tool_reg.execute(
                "list_items",
                {"sheet_id": "sheet_seed_01", "system": "Exhaust", "status": "SUGGESTED"},
            )
            assert res3["count"] == 1
            spy_list_items.assert_called_once()
            _, kwargs3 = spy_list_items.call_args
            assert "system" not in kwargs3
            assert kwargs3.get("status") == "SUGGESTED"

    # -----------------------------------------------------------------------
    # B. System Parameter Edge Cases
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("system_val", "expected_count"),
        [
            (None, 6),                     # No filter: returns all 6 items
            ("", 6),                       # Empty string: falsy, no filter, returns all 6 items
            ("supply", 1),                 # Lowercase exact match
            ("Supply", 1),                 # Exact match with DB value 'Supply'
            ("Supply Air", 1),             # Multi-word exact match
            ("supply air", 1),             # Multi-word lowercase match
            ("  Supply  ", 1),             # Surrounding whitespace stripped
            ("  RETURN  ", 1),             # Mixed case and whitespace
            ("Exhaust", 1),                # Exact match
            ("UNKNOWN_SYSTEM", 0),         # Non-existent system: returns 0 matches gracefully
            ("Plumbing", 0),               # Non-existent system: returns 0 matches gracefully
            ("!@#$%^&*()", 0),             # Special character injection: safe 0 matches
        ],
    )
    async def test_system_parameter_variations(
        self, tool_reg: ToolRegistry, system_val: str | None, expected_count: int
    ) -> None:
        """Empirically tests that system filtering handles None, empty, whitespace, and unknown values."""
        res = await tool_reg.list_items(sheet_id="sheet_seed_01", system=system_val)
        assert res["sheet_id"] == "sheet_seed_01"
        assert res["total_matched"] == expected_count
        assert res["count"] == expected_count
        assert len(res["items"]) == expected_count

        if expected_count > 0 and system_val and system_val.strip():
            target_sys = system_val.strip().lower()
            for it in res["items"]:
                assert it["system"] is not None
                assert (it["system"] == system_val) or (it["system"].strip().lower() == target_sys)

    # -----------------------------------------------------------------------
    # C. Limit Parameter Edge Cases
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("limit_input", "expected_count", "expected_total"),
        [
            (0, 6, 6),       # limit=0 is non-positive -> fallback to default 50 (returns all 6)
            (-1, 6, 6),      # negative limit -> fallback to default 50
            (-5, 6, 6),      # negative limit -> fallback to default 50
            (-999, 6, 6),    # extreme negative -> fallback to default 50
            (1, 1, 6),       # limit=1 -> returns 1 item, total_matched remains 6
            (2, 2, 6),       # limit=2 -> returns 2 items, total_matched remains 6
            (6, 6, 6),       # limit equal to total -> returns 6 items
            (10, 6, 6),      # limit greater than total -> returns 6 items
            (999, 6, 6),     # limit=999 -> returns 6 items, no out-of-range errors
            ("invalid", 6, 6),  # non-int limit -> fallback to default 50
            (None, 6, 6),    # None limit -> fallback to default 50
        ],
    )
    async def test_limit_parameter_edge_cases(
        self, tool_reg: ToolRegistry, limit_input: Any, expected_count: int, expected_total: int
    ) -> None:
        """Empirically verifies pagination limits: non-positive, out-of-bounds, or invalid limits."""
        res = await tool_reg.list_items(sheet_id="sheet_seed_01", limit=limit_input)
        assert res["total_matched"] == expected_total
        assert res["count"] == expected_count
        assert len(res["items"]) == expected_count

    # -----------------------------------------------------------------------
    # D. Non-existent and Boundary Sheet IDs
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_non_existent_sheet_id(self, tool_reg: ToolRegistry) -> None:
        """Querying a non-existent sheet_id returns 0 items without exceptions."""
        res = await tool_reg.list_items(sheet_id="non_existent_sheet_id_xyz_9999")
        assert res["sheet_id"] == "non_existent_sheet_id_xyz_9999"
        assert res["count"] == 0
        assert res["total_matched"] == 0
        assert res["items"] == []

    @pytest.mark.asyncio
    async def test_empty_string_sheet_id(self, tool_reg: ToolRegistry) -> None:
        """When sheet_id is empty string, TakeoffStore treats it as falsy (unfiltered),

        returning all sheet items rather than filtering for literal sheet_id=="".
        """
        res = await tool_reg.list_items(sheet_id="")
        assert res["sheet_id"] == ""
        assert res["total_matched"] == 6
        assert res["count"] == 6

    # -----------------------------------------------------------------------
    # E. Dispatch Parity: call_tool vs execute vs direct invocation
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_dispatch_parity_call_tool_vs_execute_vs_direct(
        self, tool_reg: ToolRegistry
    ) -> None:
        """Verify 100% schema and payload parity across direct call, execute(), and call_tool()."""
        args = {
            "sheet_id": "sheet_seed_01",
            "system": "Supply Air",
            "limit": 10,
        }

        direct_res = await tool_reg.list_items(**args)
        exec_res = await tool_reg.execute("list_items", args)
        call_tool_res = await tool_reg.call_tool("list_items", args)

        assert direct_res == exec_res, "execute() result diverged from direct list_items()!"
        assert exec_res == call_tool_res, "call_tool() result diverged from execute()!"

        # Assert schema fields
        expected_keys = {"sheet_id", "count", "total_matched", "items"}
        assert set(direct_res.keys()) == expected_keys

        item = direct_res["items"][0]
        expected_item_keys = {
            "item_id",
            "category",
            "system",
            "dimension_label",
            "status",
            "total_length_ft",
            "count",
            "bbox_pdf_pt",
            "review_required",
        }
        assert set(item.keys()) == expected_item_keys
        assert item["item_id"] == "item-sup-01"
        assert item["total_length_ft"] == 25.5
        assert item["status"] == "ACCEPTED"
        assert item["bbox_pdf_pt"] == [100.0, 100.0, 200.0, 100.0]

    # -----------------------------------------------------------------------
    # F. 1D Linear Geometry Preservation under _clamp_to_sheet
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_1d_linear_geometry_clamping_preservation(self, tool_reg: ToolRegistry) -> None:
        """Verify that horizontal and vertical 1D linework (where x1==x2 or y1==y2)

        is preserved and NOT discarded as invalid bounding box.
        """
        res = await tool_reg.list_items(sheet_id="sheet_seed_01", system="Supply")
        items = res["items"]
        assert len(items) == 1
        vert_item = items[0]
        assert vert_item["item_id"] == "item-sup-02"
        # Bbox of [[150.0, 100.0], [150.0, 300.0]] has x1==x2==150.0
        assert vert_item["bbox_pdf_pt"] == [150.0, 100.0, 150.0, 300.0]

    # -----------------------------------------------------------------------
    # G. Combined Multi-Filter Stress (category + status + system)
    # -----------------------------------------------------------------------
    @pytest.mark.asyncio
    async def test_combined_multi_filter_stress(self, tool_reg: ToolRegistry) -> None:
        """Verify simultaneous filtering across category, status, and system."""
        # 1. Matching combination: DUCTWORK + ACCEPTED + Supply Air
        res1 = await tool_reg.list_items(
            sheet_id="sheet_seed_01",
            category="DUCTWORK",
            status="ACCEPTED",
            system="Supply Air",
        )
        assert res1["count"] == 1
        assert res1["items"][0]["item_id"] == "item-sup-01"

        # 2. Conflicting combination: DUCTWORK + SUGGESTED + Supply Air
        # item-sup-01 is ACCEPTED, item-sup-02 is SUGGESTED but system="Supply"
        res2 = await tool_reg.list_items(
            sheet_id="sheet_seed_01",
            category="DUCTWORK",
            status="SUGGESTED",
            system="Supply Air",
        )
        assert res2["count"] == 0

        # 3. Matching combination: EQUIPMENT + SUGGESTED + Exhaust
        res3 = await tool_reg.list_items(
            sheet_id="sheet_seed_01",
            category="EQUIPMENT",
            status="SUGGESTED",
            system="Exhaust",
        )
        assert res3["count"] == 1
        assert res3["items"][0]["item_id"] == "item-exh-01"

        # 4. Filter on General system item: category="EQUIPMENT", system="General"
        res4 = await tool_reg.list_items(
            sheet_id="sheet_seed_01",
            category="EQUIPMENT",
            status="SUGGESTED",
            system="General",
        )
        assert res4["count"] == 1
        assert res4["items"][0]["item_id"] == "item-gen-sys"
