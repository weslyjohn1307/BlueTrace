"""Pipeline Geometry & Hover Crop OCR Caching Test Suite.

Covers:
1. Standalone routing boundaries (API isolation, SPA fallback, edge cases).
2. Geometry linework SHA-256 LRU cache latency (<2ms warm hit) across fixtures and synthetic plans, thread concurrency stress, and cache isolation.
3. Hover crop OCR SHA-256 LRU cache latency (<1ms warm hit), threadpool worker offloading, and LRU eviction policy.
"""

import asyncio
import base64
import concurrent.futures
import hashlib
import threading
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pymupdf
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.routes import (
    _CROP_OCR_CACHE_MAXSIZE,
    _crop_ocr_cache,
    clear_crop_ocr_cache,
    extract_cursor_crop,
)
from src.core_vector.pipeline import (
    _L2_PIPELINE_CACHE,
    clear_l2_cache,
    run_l2_pipeline,
)
from src.meta_services.client import MetaModelClient
from src.models.schemas import CursorCropRequest


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# ============================================================================
# 1. STANDALONE ROUTING VERIFICATION & EDGE CASES
# ============================================================================

def test_routing_root_serves_spa_html(client: TestClient) -> None:
    """GET / serves HTML SPA."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "").lower()
    assert "<!doctype html>" in resp.text.lower() or "<html" in resp.text.lower()


def test_routing_api_health_returns_json(client: TestClient) -> None:
    """GET /api/health returns JSON status payload."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert "application/json" in resp.headers.get("content-type", "").lower()
    data = resp.json()
    assert data.get("status") in ("online", "healthy")
    assert "service" in data
    assert "models" in data


def test_routing_api_nonexistent_returns_json_404_never_html(client: TestClient) -> None:
    """GET /api/nonexistent returns JSON 404 (NEVER falls back to HTML)."""
    resp = client.get("/api/nonexistent")
    assert resp.status_code == 404
    assert "application/json" in resp.headers.get("content-type", "").lower()
    assert "<!doctype html>" not in resp.text.lower()
    assert resp.json().get("detail") == "Not Found"


def test_routing_api_deep_nonexistent_returns_json_404(client: TestClient) -> None:
    """GET /api/v1/nested/endpoint returns JSON 404."""
    resp = client.get("/api/v1/nested/endpoint")
    assert resp.status_code == 404
    assert "application/json" in resp.headers.get("content-type", "").lower()
    assert "<!doctype html>" not in resp.text.lower()
    assert resp.json().get("detail") == "Not Found"


def test_routing_workspace_deep_path_serves_spa_html(client: TestClient) -> None:
    """GET /workspace/any/deep/path returns HTML SPA index."""
    paths = [
        "/workspace/sheet-1",
        "/workspace/project-abc/sheet-xyz",
        "/workspace/any/deep/path/to/canvas",
    ]
    for p in paths:
        resp = client.get(p)
        assert resp.status_code == 200, f"Path {p} failed with {resp.status_code}"
        assert "text/html" in resp.headers.get("content-type", "").lower()
        assert "<!doctype html>" in resp.text.lower() or "<html" in resp.text.lower()


def test_routing_docs_serves_swagger_ui(client: TestClient) -> None:
    """GET /docs serves Swagger UI."""
    resp = client.get("/docs")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "").lower()
    assert "swagger" in resp.text.lower()


def test_routing_openapi_serves_json_spec(client: TestClient) -> None:
    """GET /openapi.json serves OpenAPI JSON spec."""
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "application/json" in resp.headers.get("content-type", "").lower()
    assert "openapi" in resp.json()


def test_routing_edge_case_api_no_trailing_slash(client: TestClient) -> None:
    """Edge case: GET /api without trailing slash should return 404 JSON or redirect, NOT HTML."""
    resp = client.get("/api")
    print(f"\n[EDGE CASE] GET /api: status={resp.status_code}, content-type={resp.headers.get('content-type')}")
    assert resp.status_code == 404
    assert "application/json" in resp.headers.get("content-type", "").lower()
    assert "<!doctype html>" not in resp.text.lower()



# ============================================================================
# 2. TASK-OPT-001: GEOMETRY LINEWORK CACHE LATENCY & CONCURRENCY
# ============================================================================

def _generate_synthetic_drawing(tmp_path: Path, filename: str = "test_drawing.pdf") -> Path:
    pdf_path = tmp_path / filename
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((50, 50), 'M-101 MECHANICAL PLAN\nSCALE: 1/8" = 1\'-0"', fontsize=10)

    # Add parallel line pairs (representing ducts)
    for i in range(10):
        y0 = 100.0 + i * 20.0
        shape = page.new_shape()
        shape.draw_line((50.0, y0), (250.0, y0))
        shape.finish(color=(0, 0, 0), width=1.5)
        shape.commit()

        shape2 = page.new_shape()
        shape2.draw_line((50.0, y0 + 8.0), (250.0, y0 + 8.0))
        shape2.finish(color=(0, 0, 0), width=1.5)
        shape2.commit()

    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


def test_geometry_cache_synthetic_plan_latency(tmp_path: Path) -> None:
    """TASK-OPT-001: Measure geometry cache latency on synthetic plan (<2ms, <50ms threshold)."""
    pdf_path = _generate_synthetic_drawing(tmp_path, "synthetic_m101.pdf")
    clear_l2_cache()

    # Cold pipeline run
    t0 = time.perf_counter()
    cold_result = run_l2_pipeline(str(pdf_path), page_num=0, discipline="mechanical")
    t1 = time.perf_counter()
    cold_ms = (t1 - t0) * 1000.0

    # Warm cache hits (100 iterations)
    warm_latencies: list[float] = []
    for _ in range(100):
        tw0 = time.perf_counter()
        warm_result = run_l2_pipeline(str(pdf_path), page_num=0, discipline="mechanical")
        tw1 = time.perf_counter()
        warm_latencies.append((tw1 - tw0) * 1000.0)

    avg_warm_ms = sum(warm_latencies) / len(warm_latencies)
    min_warm_ms = min(warm_latencies)
    p95_warm_ms = sorted(warm_latencies)[int(len(warm_latencies) * 0.95)]

    print(f"\n[TASK-OPT-001 Synthetic] Cold={cold_ms:.2f}ms | Warm: avg={avg_warm_ms:.4f}ms, min={min_warm_ms:.4f}ms, p95={p95_warm_ms:.4f}ms")

    assert cold_result == warm_result
    # Verification assertions:
    assert avg_warm_ms < 2.0, f"Geometry cache hit took {avg_warm_ms:.4f}ms (threshold: <2ms)"
    assert avg_warm_ms < 50.0, f"Geometry cache hit exceeded 50ms project limit: {avg_warm_ms:.4f}ms"


def test_geometry_cache_real_fixture_latency() -> None:
    """TASK-OPT-001: Measure geometry cache latency on actual real-world fixtures (avexis 120KB & pfmcc 627KB)."""
    fixture_paths = [
        Path("fixtures/mechanical/avexis_page_22.pdf"),
        Path("fixtures/mechanical/pfmcc_page_118.pdf"),
    ]

    for fpath in fixture_paths:
        if not fpath.exists():
            continue

        clear_l2_cache()
        # Cold
        t0 = time.perf_counter()
        cold_res = run_l2_pipeline(str(fpath), page_num=0, discipline="mechanical")
        t1 = time.perf_counter()
        cold_ms = (t1 - t0) * 1000.0

        # Warm hits (50 iterations)
        warm_times: list[float] = []
        for _ in range(50):
            tw0 = time.perf_counter()
            warm_res = run_l2_pipeline(str(fpath), page_num=0, discipline="mechanical")
            tw1 = time.perf_counter()
            warm_times.append((tw1 - tw0) * 1000.0)

        avg_warm = sum(warm_times) / len(warm_times)
        min_warm = min(warm_times)
        p95_warm = sorted(warm_times)[int(len(warm_times) * 0.95)]

        print(f"\n[TASK-OPT-001 Real Fixture: {fpath.name}] Size={fpath.stat().st_size // 1024}KB | Cold={cold_ms:.2f}ms | Warm avg={avg_warm:.4f}ms, min={min_warm:.4f}ms, p95={p95_warm:.4f}ms")

        assert cold_res == warm_res
        assert avg_warm < 2.0, f"{fpath.name} warm cache hit took {avg_warm:.4f}ms (threshold: <2ms)"
        assert avg_warm < 50.0, f"{fpath.name} warm cache hit exceeded 50ms: {avg_warm:.4f}ms"


def test_geometry_cache_key_isolation(tmp_path: Path) -> None:
    """Verify that different parameters produce cache misses and do not cross-pollinate."""
    pdf_path = _generate_synthetic_drawing(tmp_path, "isolation_test.pdf")
    clear_l2_cache()

    res_mech = run_l2_pipeline(str(pdf_path), page_num=0, discipline="mechanical")
    res_plumb = run_l2_pipeline(str(pdf_path), page_num=0, discipline="plumbing")

    # They should have distinct cache entries
    assert res_mech is not None and res_plumb is not None
    assert _L2_PIPELINE_CACHE._cache is not None
    assert len(_L2_PIPELINE_CACHE._cache) >= 2


def test_geometry_cache_thread_safety_and_concurrency(tmp_path: Path) -> None:
    """TASK-OPT-001: 10 concurrent threads querying cached geometry concurrently."""
    pdf_path = _generate_synthetic_drawing(tmp_path, "concurrency_test.pdf")
    clear_l2_cache()

    # Pre-populate cache
    run_l2_pipeline(str(pdf_path), page_num=0, discipline="mechanical")

    def worker_fn():
        latencies = []
        for _ in range(30):
            t0 = time.perf_counter()
            res = run_l2_pipeline(str(pdf_path), page_num=0, discipline="mechanical")
            t1 = time.perf_counter()
            latencies.append((t1 - t0) * 1000.0)
            assert "results" in res and res.get("sheet_id") == "M-101"
        return latencies

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(worker_fn) for _ in range(10)]
        all_times: list[float] = []
        for f in concurrent.futures.as_completed(futures):
            all_times.extend(f.result())

    avg_concurrent_ms = sum(all_times) / len(all_times)
    p95_concurrent_ms = sorted(all_times)[int(len(all_times) * 0.95)]
    print(f"\n[TASK-OPT-001 Concurrency] 10 threads, 300 ops: avg={avg_concurrent_ms:.4f}ms, p95={p95_concurrent_ms:.4f}ms")

    assert avg_concurrent_ms < 5.0, f"Thread contention exceeded 5ms: {avg_concurrent_ms:.4f}ms"


def test_geometry_cache_bottleneck_profiling() -> None:
    """Empirical breakdown of geometry cache latency bottleneck on real blueprint fixture."""
    import copy

    fpath = Path("fixtures/mechanical/avexis_page_22.pdf")
    if not fpath.exists():
        pytest.skip("Fixture not found")

    # 1. Profile SHA-256 calculation
    t0 = time.perf_counter()
    for _ in range(50):
        from src.core_vector.pipeline import _compute_file_sha256
        _compute_file_sha256(fpath)
    t1 = time.perf_counter()
    sha256_ms = (t1 - t0) / 50 * 1000.0

    # Ensure cached
    res = run_l2_pipeline(str(fpath), page_num=0, discipline="mechanical")

    # 2. Profile copy.deepcopy
    t0 = time.perf_counter()
    for _ in range(50):
        _ = copy.deepcopy(res)
    t1 = time.perf_counter()
    deepcopy_ms = (t1 - t0) / 50 * 1000.0

    # 3. Profile raw dict access without deepcopy
    _ = hashlib.sha256(fpath.read_bytes()).hexdigest()
    # Cache key tuple
    raw_dict = _L2_PIPELINE_CACHE._cache
    t0 = time.perf_counter()
    for _ in range(100):
        with _L2_PIPELINE_CACHE._lock:
            # simple lookup
            _ = next(iter(raw_dict.values()))
    t1 = time.perf_counter()
    raw_lookup_ms = (t1 - t0) / 100 * 1000.0

    print("\n[TASK-OPT-001 Bottleneck Breakdown]")
    print(f"  SHA-256 calculation (117KB): {sha256_ms:.4f} ms")
    print(f"  copy.deepcopy(res) ({len(res.get('results', []))} results): {deepcopy_ms:.4f} ms")
    print(f"  raw dictionary lookup: {raw_lookup_ms:.6f} ms")



# ============================================================================
# 3. TASK-OPT-002: HOVER CROP OCR CACHE LATENCY & THREADPOOL CONCURRENCY
# ============================================================================

@pytest.mark.asyncio
async def test_crop_ocr_cache_hit_latency_microbenchmark() -> None:
    """TASK-OPT-002: Hover crop OCR cache hit latency must be <1ms (far exceeding <50ms threshold)."""
    clear_crop_ocr_cache()

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.parse_crop_ocr.return_value = {
        "detected_text": '14"x10"',
        "badge_text": '14"x10" Supply Duct',
        "width": 14.0,
        "height": 10.0,
        "review_required": False,
    }

    dummy_b64 = base64.b64encode(b"crop_pixels_benchmark_stream").decode("ascii")
    req = CursorCropRequest(
        image_base64=dummy_b64,
        sheet_id="benchmark_sheet_m101",
        cursor_pt=[250.0, 350.0],
    )

    # 1. Cold execution
    t_cold_0 = time.perf_counter()
    cold_resp = await extract_cursor_crop(request=req, client=mock_client)
    t_cold_1 = time.perf_counter()
    cold_ms = (t_cold_1 - t_cold_0) * 1000.0

    assert mock_client.parse_crop_ocr.call_count == 1
    assert cold_resp.detected_text == '14"x10"'
    assert cold_resp.badge_text == '14"x10" Supply Duct'

    # 2. Warm cache execution (100 iterations)
    warm_latencies_ms: list[float] = []
    for _ in range(100):
        tw0 = time.perf_counter()
        _ = await extract_cursor_crop(request=req, client=mock_client)
        tw1 = time.perf_counter()
        warm_latencies_ms.append((tw1 - tw0) * 1000.0)

    # Assert client was NOT invoked during warm calls
    assert mock_client.parse_crop_ocr.call_count == 1, "Cache hit must bypass client.parse_crop_ocr call"

    avg_warm_ms = sum(warm_latencies_ms) / len(warm_latencies_ms)
    min_warm_ms = min(warm_latencies_ms)
    p95_warm_ms = sorted(warm_latencies_ms)[int(len(warm_latencies_ms) * 0.95)]

    print(f"\n[TASK-OPT-002] Cold={cold_ms:.3f}ms | Warm (100 hits): avg={avg_warm_ms:.4f}ms, min={min_warm_ms:.4f}ms, p95={p95_warm_ms:.4f}ms")

    # Threshold checks
    assert avg_warm_ms < 1.0, f"Expected warm cache hit < 1.0ms, got {avg_warm_ms:.4f}ms"
    assert avg_warm_ms < 50.0, f"Exceeded 50ms project threshold: {avg_warm_ms:.4f}ms"


@pytest.mark.asyncio
async def test_crop_ocr_threadpool_execution_does_not_block_event_loop() -> None:
    """TASK-OPT-002: Verify run_in_threadpool offloads to worker thread and leaves asyncio loop free."""
    clear_crop_ocr_cache()

    main_thread_ident = threading.get_ident()
    executed_thread_ident = None

    def slow_blocking_ocr(image_b64: str) -> dict[str, Any]:
        nonlocal executed_thread_ident
        executed_thread_ident = threading.get_ident()
        # Simulate blocking network / VLM call
        time.sleep(0.06)
        return {
            "detected_text": '24"x12"',
            "badge_text": '24"x12" Return Duct',
            "width": 24.0,
            "review_required": False,
        }

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.parse_crop_ocr.side_effect = slow_blocking_ocr

    req = CursorCropRequest(
        image_base64=base64.b64encode(b"threadpool_nonblock_crop").decode("ascii"),
        sheet_id="sheet_threadpool",
        cursor_pt=[10.0, 20.0],
    )

    # Concurrently run async timer tasks to verify event loop responsiveness
    ticks = 0

    async def async_timer():
        nonlocal ticks
        for _ in range(6):
            await asyncio.sleep(0.01)
            ticks += 1

    timer_future = asyncio.create_task(async_timer())
    crop_future = asyncio.create_task(extract_cursor_crop(request=req, client=mock_client))

    await asyncio.gather(timer_future, crop_future)

    # 1. Assert worker thread was separate from event loop thread
    assert executed_thread_ident is not None
    assert executed_thread_ident != main_thread_ident, (
        f"Threadpool violation: task ran on main loop thread {main_thread_ident}"
    )

    # 2. Assert async timer progressed without starvation
    assert ticks >= 4, f"Event loop starvation: async timer only ticked {ticks} times"
    print(f"\n[TASK-OPT-002 Threadpool] Worker thread={executed_thread_ident} != Main thread={main_thread_ident}, ticks={ticks}")


@pytest.mark.asyncio
async def test_crop_ocr_lru_eviction_policy() -> None:
    """TASK-OPT-002: Verify LRU eviction when cache exceeds _CROP_OCR_CACHE_MAXSIZE (256 items)."""
    clear_crop_ocr_cache()

    mock_client = MagicMock(spec=MetaModelClient)
    mock_client.parse_crop_ocr.side_effect = lambda b64: {
        "detected_text": f"text_{b64[:8]}",
        "badge_text": "Duct",
        "width": 10.0,
        "review_required": False,
    }

    # Insert 260 distinct crops
    for i in range(260):
        crop_bytes = f"unique_crop_payload_{i}".encode("ascii")
        req = CursorCropRequest(
            image_base64=base64.b64encode(crop_bytes).decode("ascii"),
            sheet_id="eviction_test",
            cursor_pt=[float(i), float(i)],
        )
        await extract_cursor_crop(request=req, client=mock_client)

    # Assert cache size capped at MAXSIZE
    assert len(_crop_ocr_cache) == _CROP_OCR_CACHE_MAXSIZE
    print(f"\n[TASK-OPT-002 LRU] Cache capped at maxsize {len(_crop_ocr_cache)}/{_CROP_OCR_CACHE_MAXSIZE}")
