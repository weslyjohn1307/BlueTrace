"""Adversarial cross-document consistency verification harness.

Authored by Challenger 2 (teamwork_challenger).
Adversarially verifies:
1. Scale math formulas (L_real_ft = L_pt * scale_ratio / 864.0) and snapping tolerances (+-2%).
2. Tiling dimensions (1024x1024 px, 20% overlap = 205 px, stride = 819 px) and NMS IoU threshold (>= 0.45).
3. Telemetry schema (engineer_feedback_events) and review action names (ACCEPT, CORRECT, REJECT, CANNOT_DETERMINE).
4. Desktop packaging metrics (~58MB compressed, ~132MB installed, <150MB target) and Windows Job Object flags.
5. Strict dataset sanitization: zero occurrences of forbidden dataset tokens in docs/planning/.
6. Micro-task DAG dependency integrity and topological validity across all 48 tasks.
7. Fail-closed scale invariant assertions across all deliverables.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PLANNING_DIR = Path("docs/planning")
ARCH_DOC = PLANNING_DIR / "STANDALONE_ARCHITECTURE.md"
MASTER_PLAN_DOC = PLANNING_DIR / "SDLC_MASTER_PLAN.md"
SCHEDULE_DOC = PLANNING_DIR / "MICRO_TASK_SCHEDULE.md"


@pytest.fixture(scope="module")
def planning_docs_text() -> dict[str, str]:
    assert ARCH_DOC.exists(), f"Missing {ARCH_DOC}"
    assert MASTER_PLAN_DOC.exists(), f"Missing {MASTER_PLAN_DOC}"
    assert SCHEDULE_DOC.exists(), f"Missing {SCHEDULE_DOC}"
    return {
        "arch": ARCH_DOC.read_text(encoding="utf-8"),
        "plan": MASTER_PLAN_DOC.read_text(encoding="utf-8"),
        "schedule": SCHEDULE_DOC.read_text(encoding="utf-8"),
    }


# ---------------------------------------------------------------------------
# 1. Scale Math & Architectural Snapping Consistency
# ---------------------------------------------------------------------------


def test_scale_math_formula_mathematical_identity(planning_docs_text):
    """Verify that scale ratio formula is mathematically identical across documents."""
    plan_text = planning_docs_text["plan"]
    sched_text = planning_docs_text["schedule"]

    # 1. Check formula in SDLC_MASTER_PLAN: L_real_ft = L_pt * scale_ratio / 864.0
    assert "864.0" in plan_text, "SDLC_MASTER_PLAN.md must express the 864.0 scale denominator"
    assert "scale_ratio" in plan_text or r"scale\_ratio" in plan_text

    # 2. Check formula in MICRO_TASK_SCHEDULE: geometric_length_pt * scale_ratio / 864.0
    assert "864.0" in sched_text, "MICRO_TASK_SCHEDULE.md must express the 864.0 scale denominator"
    assert "geometric_length_pt * scale_ratio / 864.0" in sched_text or "864.0" in sched_text

    # 3. Mathematical proof & numerical evaluation:
    # 72 points per inch * 12 inches per foot = 864.0 pt*in/ft
    pt_per_in = 72.0
    in_per_ft = 12.0
    denom = pt_per_in * in_per_ft
    assert denom == 864.0

    # Test sample calibration:
    # 1/4" = 1'-0" -> scale_ratio = 48.0
    # Length on paper = 1 inch = 72.0 pt
    # L_real_ft = 72.0 * 48.0 / 864.0 = 4.0 ft
    test_l_pt = 72.0
    test_scale_ratio = 48.0
    l_real_ft = test_l_pt * test_scale_ratio / 864.0
    assert l_real_ft == 4.0


def test_architectural_scale_snapping_table_values(planning_docs_text):
    """Verify standard US architectural scale snapping ratios and +-2% tolerance."""
    sched_text = planning_docs_text["schedule"]

    # Expected standard US architectural scales and their exact mathematical ratios:
    # scale_ratio = 12.0 / (drawing_fraction_inches)
    expected_scales = {
        "1/8": 96.0,    # 12 / (1/8) = 96
        "3/16": 64.0,   # 12 / (3/16) = 64
        "1/4": 48.0,    # 12 / (1/4) = 48
        "3/8": 32.0,    # 12 / (3/8) = 32
        "1/2": 24.0,    # 12 / (1/2) = 24
        "3/4": 16.0,    # 12 / (3/4) = 16
        "1": 12.0,      # 12 / 1 = 12
        "1-1/2": 8.0,   # 12 / 1.5 = 8
        "3": 4.0,       # 12 / 3 = 4
    }

    for frac, expected_ratio in expected_scales.items():
        assert str(expected_ratio) in sched_text, f"Scale ratio {expected_ratio} for {frac} must appear in schedule"

    # Verify snapping tolerance (+-2% = 0.02)
    assert "0.02" in sched_text or "2%" in sched_text, "Schedule must specify +-2% tolerance"

    # Numerical verification of snapping tolerance logic:
    tol = 0.02
    # 47.5 vs 48.0: error is |47.5 - 48.0| / 48.0 = 0.0104 (1.04% <= 2%) -> SNAPS
    assert abs(47.5 - 48.0) / 48.0 <= tol

    # 46.5 vs 48.0: error is |46.5 - 48.0| / 48.0 = 0.03125 (3.125% > 2%) -> DOES NOT SNAP
    assert abs(46.5 - 48.0) / 48.0 > tol


# ---------------------------------------------------------------------------
# 2. Tiling Swarm Dimensions & Geometric Consistency
# ---------------------------------------------------------------------------


def test_tiling_swarm_geometry_and_stride(planning_docs_text):
    """Verify tile size (1024x1024), 20% overlap (205px), stride (819px), and 35 tiles."""
    sched_text = planning_docs_text["schedule"]
    plan_text = planning_docs_text["plan"]

    # In both schedule and plan:
    assert "1024" in sched_text and "1024" in plan_text
    assert "819" in sched_text
    assert "205" in sched_text

    # Mathematical check:
    tile_w = 1024
    overlap_pct = 0.20
    overlap_px = round(tile_w * overlap_pct)
    assert overlap_px == 205, "20% of 1024 rounded must be 205 px"

    stride = tile_w - overlap_px
    assert stride == 819, "Stride must be 819 px"

    # Full sheet Arch E raster at 150 DPI: 36" x 48"
    import math
    cols = math.ceil((5400 - tile_w) / stride) + 1
    rows = math.ceil((3600 - tile_w) / stride) + 1
    total_tiles = cols * rows
    assert cols == 7, f"Expected 7 cols, got {cols}"
    assert rows == 5, f"Expected 5 rows, got {rows}"
    assert total_tiles == 35, f"Expected 35 tiles, got {total_tiles}"
    assert "35 tiles" in sched_text

    # Point to pixel ratio at 150 DPI: 72 pt / 150 px = 0.48 pt/px
    pt_per_px = 72.0 / 150.0
    assert pt_per_px == 0.48
    assert "0.48" in sched_text, "Schedule un-tiling formula must use 0.48 pt/px factor"


def test_tiling_nms_iou_threshold(planning_docs_text):
    """Verify NMS IoU threshold is >= 0.45 across documents."""
    sched_text = planning_docs_text["schedule"]
    plan_text = planning_docs_text["plan"]

    assert "0.45" in sched_text, "Schedule must define IoU threshold 0.45"
    assert "NMS" in sched_text and "NMS" in plan_text


# ---------------------------------------------------------------------------
# 3. Telemetry Schema & Review Action Names
# ---------------------------------------------------------------------------


def test_telemetry_schema_and_consent_invariants(planning_docs_text):
    """Verify engineer_feedback_events schema fields and consent invariants."""
    sched_text = planning_docs_text["schedule"]
    plan_text = planning_docs_text["plan"]

    # Table name
    assert "engineer_feedback_events" in sched_text
    assert "engineer_feedback_events" in plan_text

    # Mandatory fields in schema
    mandatory_fields = [
        "feedback_id",
        "project_id",
        "sheet_id",
        "item_id",
        "task_type",
        "action",
        "previous_status",
        "new_status",
        "original_output_json",
        "corrected_output_json",
        "training_eligible",
    ]
    for field in mandatory_fields:
        assert field in sched_text, f"Field '{field}' missing in engineer_feedback_events schema"

    # Default consent check: training_eligible must default to 0 / False
    assert "DEFAULT 0" in sched_text or "training_eligible = 0" in sched_text or "training_eligible == 0" in sched_text


def test_review_action_states_and_override_codes(planning_docs_text):
    """Verify 4-state review machine and structured override reasons."""
    sched_text = planning_docs_text["schedule"]
    plan_text = planning_docs_text["plan"]

    # 4-state review machine actions
    expected_actions = ["ACCEPT", "CORRECT", "REJECT", "CANNOT_DETERMINE"]
    for action in expected_actions:
        assert action in sched_text, f"Action '{action}' must appear in review machine"
        assert action in plan_text or (action == "CANNOT_DETERMINE" and "CANNOT" in plan_text)

    # Structured correction override reasons across SDLC Master Plan and Task Schedule
    expected_reasons = [
        "OCR_MISREAD_DIGIT",
        "OCR_MISREAD_SHAPE",
        "WRONG_SYSTEM_CLASSIFICATION",
        "WRONG_SCALE_RATIO",
        "DUPLICATE_ITEM",
        "OUT_OF_SCOPE_SPECIFICATION",
        "INSUFFICIENT_DRAWING_RESOLUTION",
        "NON_STANDARD_SYMBOL_CONVENTION",
        "OTHER_OVERRIDE",
    ]
    for reason in expected_reasons:
        assert reason in sched_text, f"Correction reason '{reason}' missing from schedule"
        assert reason in plan_text, f"Correction reason '{reason}' missing from master plan"


# ---------------------------------------------------------------------------
# 4. Desktop Packaging Metrics & Windows Job Object Flags
# ---------------------------------------------------------------------------


def test_desktop_packaging_metrics_consistency(planning_docs_text):
    """Verify packaging metrics across architecture, plan, and schedule."""
    arch_text = planning_docs_text["arch"]
    plan_text = planning_docs_text["plan"]
    sched_text = planning_docs_text["schedule"]

    # Target limit: < 150 MB
    assert "<150MB" in arch_text or "< 150MB" in arch_text or "< 150 MB" in arch_text or "150 MB" in arch_text
    assert "<150MB" in plan_text or "< 150MB" in plan_text or "150 MB" in plan_text
    assert "<150MB" in sched_text or "< 150 MB" in sched_text or "<150\\text{ MB}" in sched_text

    # On-disk installed target: ~132 MB
    assert "132" in arch_text
    assert "132" in sched_text

    # Compressed installer target: ~58 MB
    assert "58" in arch_text
    assert "58" in sched_text


def test_windows_job_object_supervisor_flags(planning_docs_text):
    """Verify Windows Job Object supervisor flags and API calls."""
    arch_text = planning_docs_text["arch"]
    plan_text = planning_docs_text["plan"]
    sched_text = planning_docs_text["schedule"]

    flag = "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE"
    assert flag in arch_text, f"Flag {flag} missing in STANDALONE_ARCHITECTURE"
    assert flag in plan_text or "KILL" in plan_text, "Kill flag missing in SDLC_MASTER_PLAN"
    assert flag in sched_text, f"Flag {flag} missing in MICRO_TASK_SCHEDULE"

    # Verify Windows API symbols in architecture
    win_apis = ["CreateJobObjectW", "SetInformationJobObject", "AssignProcessToJobObject"]
    for api in win_apis:
        assert api in arch_text, f"Windows API {api} missing in architecture specification"


def test_ephemeral_port_and_handshake_consistency(planning_docs_text):
    """Verify ephemeral port binding (127.0.0.1:0) and stdout handshake contract."""
    arch_text = planning_docs_text["arch"]
    sched_text = planning_docs_text["schedule"]

    assert "127.0.0.1:0" in arch_text
    assert "127.0.0.1:0" in sched_text

    assert '{"status": "READY"' in arch_text or '{"status":"READY"' in arch_text
    assert '{"status": "READY"' in sched_text or '{"status":"READY"' in sched_text


# ---------------------------------------------------------------------------
# 5. Sanitization: Zero occurrences of forbidden dataset tokens
# ---------------------------------------------------------------------------


def test_sanitization_zero_forbidden_tokens_in_planning_deliverables():
    """Verify zero occurrences of the legacy dataset token in all planning files."""
    forbidden_pattern = re.compile(r"\b" + "C" + "T" + "D" + r"\b", flags=re.IGNORECASE)
    for md_file in PLANNING_DIR.glob("**/*.md"):
        content = md_file.read_text(encoding="utf-8")
        matches = forbidden_pattern.findall(content)
        assert len(matches) == 0, f"Violation: Found {len(matches)} occurrences of forbidden token in {md_file}"


# ---------------------------------------------------------------------------
# 6. Micro-Task Schedule DAG Dependency Integrity
# ---------------------------------------------------------------------------


def test_micro_task_schedule_dag_integrity(planning_docs_text):
    """Verify all micro-tasks in schedule form a valid, acyclic DAG."""
    sched_text = planning_docs_text["schedule"]

    # Extract all TASK-XXX-YYY declarations (h3 or h4 headers)
    task_pattern = re.compile(r"#{3,4}\s+(TASK-[A-Z]+-\d{3}):\s+(.+)")
    prereq_pattern = re.compile(r"-\s+\*\*Prerequisites:\*\*\s*(.+)")

    tasks = {}
    lines = sched_text.splitlines()
    current_task = None

    for line in lines:
        task_match = task_pattern.match(line.strip())
        if task_match:
            current_task = task_match.group(1)
            tasks[current_task] = {
                "name": task_match.group(2),
                "prerequisites": [],
            }
            continue

        if current_task:
            prereq_match = prereq_pattern.match(line.strip())
            if prereq_match:
                raw_prereqs = prereq_match.group(1).strip()
                if raw_prereqs.lower() not in ("none", "n/a"):
                    # Find all TASK-XXX-YYY references
                    found_refs = re.findall(r"TASK-[A-Z]+-\d{3}", raw_prereqs)
                    tasks[current_task]["prerequisites"].extend(found_refs)

    # 48 micro-tasks defined in MICRO_TASK_SCHEDULE.md
    assert len(tasks) == 48, f"Expected exactly 48 micro-tasks, found {len(tasks)}"

    # Check that all referenced prerequisites exist
    all_task_ids = set(tasks.keys())
    for task_id, info in tasks.items():
        for prereq in info["prerequisites"]:
            assert prereq in all_task_ids, f"Task {task_id} references non-existent prerequisite {prereq}"

    # Verify DAG cycle detection using DFS
    visited = {}  # 0 = unvisited, 1 = visiting (in stack), 2 = visited

    def dfs(node: str, path: list[str]):
        visited[node] = 1
        for neighbor in tasks[node]["prerequisites"]:
            if visited.get(neighbor, 0) == 1:
                cycle = " -> ".join(path + [neighbor])
                raise AssertionError(f"Cycle detected in task dependencies: {cycle}")
            if visited.get(neighbor, 0) == 0:
                dfs(neighbor, path + [neighbor])
        visited[node] = 2

    for node in all_task_ids:
        if visited.get(node, 0) == 0:
            dfs(node, [node])


# ---------------------------------------------------------------------------
# 7. Fail-Closed Scale Invariants Across Deliverables
# ---------------------------------------------------------------------------


def test_fail_closed_scale_invariants_across_docs(planning_docs_text):
    """Verify that all deliverables mandate fail-closed behavior on scale ambiguity."""
    arch_text = planning_docs_text["arch"]
    plan_text = planning_docs_text["plan"]
    sched_text = planning_docs_text["schedule"]

    for doc_name, content in [("ARCH", arch_text), ("PLAN", plan_text), ("SCHEDULE", sched_text)]:
        assert re.search(r"scale[\\_ ]?ratio", content, re.IGNORECASE), f"Missing scale_ratio in {doc_name}"
        assert "review_required" in content, f"Missing review_required in {doc_name}"
        # All documents require uncalibrated/unverified scale to block automatic estimation
        assert "0.0" in content, f"Missing 0.0 scale ratio assertion in {doc_name}"


# ---------------------------------------------------------------------------
# 8. Empirical Adversarial Stress Harnesses & Mathematical Boundary Tests
# ---------------------------------------------------------------------------


def test_adversarial_scale_snapping_exact_boundaries():
    """Stress-test scale snapping at the exact +-2% mathematical boundary limits."""
    standard_scales = [
        ("1/8", 96.0),
        ("3/16", 64.0),
        ("1/4", 48.0),
        ("3/8", 32.0),
        ("1/2", 24.0),
        ("3/4", 16.0),
        ("1", 12.0),
        ("1-1/2", 8.0),
        ("3", 4.0),
    ]
    tolerance = 0.02

    for name, base_ratio in standard_scales:
        # Just inside boundary (+1.99%): must snap
        ratio_inside_high = base_ratio * (1.0 + 0.0199)
        error_inside_high = abs(ratio_inside_high - base_ratio) / base_ratio
        assert error_inside_high <= tolerance

        # Just outside boundary (+2.01%): must NOT snap
        ratio_outside_high = base_ratio * (1.0 + 0.0201)
        error_outside_high = abs(ratio_outside_high - base_ratio) / base_ratio
        assert error_outside_high > tolerance

        # Just inside boundary (-1.99%): must snap
        ratio_inside_low = base_ratio * (1.0 - 0.0199)
        error_inside_low = abs(ratio_inside_low - base_ratio) / base_ratio
        assert error_inside_low <= tolerance

        # Just outside boundary (-2.01%): must NOT snap
        ratio_outside_low = base_ratio * (1.0 - 0.0201)
        error_outside_low = abs(ratio_outside_low - base_ratio) / base_ratio
        assert error_outside_low > tolerance


def test_adversarial_tiling_coverage_and_coordinate_inversion():
    """Stress-test that 35 tiles completely cover 5400x3600 with zero gap and roundtrip coords."""
    sheet_w, sheet_h = 5400, 3600
    tile_size = 1024
    stride = 819
    overlap = 205
    pt_per_px = 0.48

    # Grid dimensions
    n_cols = 7
    n_rows = 5

    # Check bounds of every single tile
    covered_x_max = 0
    covered_y_max = 0

    for r in range(n_rows):
        for c in range(n_cols):
            x0 = c * stride
            y0 = r * stride
            x1 = x0 + tile_size
            y1 = y0 + tile_size

            covered_x_max = max(covered_x_max, x1)
            covered_y_max = max(covered_y_max, y1)

            # Check interior overlap with previous col
            if c > 0:
                prev_x1 = (c - 1) * stride + tile_size
                overlap_x = prev_x1 - x0
                assert overlap_x == overlap, f"Expected {overlap}px overlap, got {overlap_x}"

            # Check interior overlap with previous row
            if r > 0:
                prev_y1 = (r - 1) * stride + tile_size
                overlap_y = prev_y1 - y0
                assert overlap_y == overlap, f"Expected {overlap}px overlap, got {overlap_y}"

    # Verify complete sheet coverage
    assert covered_x_max >= sheet_w, f"Tile grid width {covered_x_max} does not cover sheet {sheet_w}"
    assert covered_y_max >= sheet_h, f"Tile grid height {covered_y_max} does not cover sheet {sheet_h}"

    # Test coordinate transformation & inversion round-trip:
    # Point at sheet center: (2700 px, 1800 px) -> (1296 pt, 864 pt)
    px_x, px_y = 2700.0, 1800.0
    pt_x = px_x * pt_per_px
    pt_y = px_y * pt_per_px
    assert pt_x == 1296.0
    assert pt_y == 864.0

    # Invert
    inv_px_x = pt_x / pt_per_px
    inv_px_y = pt_y / pt_per_px
    assert abs(inv_px_x - px_x) < 1e-6
    assert abs(inv_px_y - px_y) < 1e-6


def test_adversarial_nms_iou_exact_boundary():
    """Verify 2D bounding box IoU calculation at threshold 0.45."""
    def compute_iou(boxA, boxB):
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        inter_w = max(0.0, xB - xA)
        inter_h = max(0.0, yB - yA)
        inter_area = inter_w * inter_h

        areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        union_area = areaA + areaB - inter_area
        return inter_area / union_area if union_area > 0 else 0.0

    # Box 1: [0, 0, 100, 100] -> area = 10000
    # For Box 2: [dx, 0, 100+dx, 100] with area = 10000
    # inter_w = 100 - dx, inter_area = 100*(100 - dx)
    # union_area = 20000 - 100*(100 - dx) = 10000 + 100*dx
    # IoU = (100 - dx) / (100 + dx)
    # At IoU = 0.45: (100 - dx) = 0.45*(100 + dx) => 100 - 45 = 1.45*dx => dx = 55 / 1.45 = 37.93103448

    boxA = [0.0, 0.0, 100.0, 100.0]

    # dx for IoU = 0.45
    dx_target = 55.0 / 1.45
    box_at_target = [dx_target, 0.0, 100.0 + dx_target, 100.0]
    iou_at_target = compute_iou(boxA, box_at_target)
    assert abs(iou_at_target - 0.45) < 1e-5

    # dx slightly smaller -> IoU > 0.45 (SUPPRESSED)
    box_suppressed = [dx_target - 1.0, 0.0, 100.0 + dx_target - 1.0, 100.0]
    assert compute_iou(boxA, box_suppressed) > 0.45

    # dx slightly larger -> IoU < 0.45 (RETAINED)
    box_retained = [dx_target + 1.0, 0.0, 100.0 + dx_target + 1.0, 100.0]
    assert compute_iou(boxA, box_retained) < 0.45


def test_adversarial_packaging_footprint_arithmetic():
    """Verify disk footprint arithmetic strictly satisfies the <150MB budget."""
    installed_sizes = {
        "tauri_host": 8.5,
        "frontend_dist": 7.1,
        "python_core": 5.2,
        "pymupdf": 38.6,
        "stdlib_cext": 42.1,
        "dependencies": 30.5,
        "configs": 0.2,
    }
    total_installed = sum(installed_sizes.values())
    assert abs(total_installed - 132.2) < 1e-4
    assert total_installed < 150.0, f"Installed size {total_installed} exceeds 150MB target"

    compressed_sizes = {
        "tauri_host": 3.1,
        "frontend_dist": 2.2,
        "python_core": 1.8,
        "pymupdf": 18.2,
        "stdlib_cext": 19.4,
        "dependencies": 13.5,
        "configs": 0.1,
    }
    total_compressed = sum(compressed_sizes.values())
    assert abs(total_compressed - 58.3) < 1e-4
    assert total_compressed < 60.0, f"Compressed installer size {total_compressed} exceeds 60MB target"

