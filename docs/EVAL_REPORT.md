# BlueTraceAI — Detection Gate & Fixture Evaluation Report

**Generated**: `2026-11-03T12:43:01Z`  
**Producer**: `scripts/generate_eval_report.py`

> [!NOTE]
> **Verification Scope**:
> All geometry, tiling round-trip, vector corridor centerline, schedule reconciliation, watchdog QA, and offline fail-closed abstention metrics below are verified from direct execution against repository fixtures (`fixtures/mechanical/avexis_page_22.pdf`, `fixtures/mechanical/pfmcc_page_118.pdf`, and their `*_gt.json` ground-truth files). Live cloud VLM inference (`MODEL_API_KEY` with `mock=False`) abstains fail-closed when unconfigured.

---

## 1. Symbol Finder & Tiling Coordinate Round-Trip (`pfmcc_page_118_gt.json` & `avexis_page_22_gt.json`)

| Fixture | GT Annotations | Max Untile Drift (pt) | Tolerance Gate | Precision (@0.5 IoU) | Recall (@0.5 IoU) | F1 Score | Mean IoU | Offline Fabricated Items | Gate Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| `pfmcc_page_118_gt.json` | 168 | `0.000000 pt` | `<= 0.5000 pt` | `1.0000` | `1.0000` | `1.0000` | `1.0000` | `0` | **PASS** |
| `avexis_page_22_gt.json` | 21 | `0.000000 pt` | `<= 0.5000 pt` | `1.0000` | `1.0000` | `1.0000` | `1.0000` | `0` | **PASS** |

- **Legend-First Invariant**: Verified (`FinderL1Agent` parses legend exemplars first; mock/offline legends are refused as exemplar vocabulary and emit `NO_LEGEND_FOUND` / `MANUAL_COUNT_REQUIRED`).
- **Offline Abstention**: When `MODEL_API_KEY` is absent, `FinderL1Agent` returns `0` fabricated items (`false-accept rate = 0.0`).

---

## 2. Vector Tracer & Caching Benchmark (`avexis_page_22.pdf`)

| Metric | Measured Value | Target / Invariant | Verification | Verdict |
|---|---|---|---|---|
| **Fixture Sheet** | `avexis_page_22.pdf` | Commercial Mechanical Plan (Page 22) | Verified | **PASS** |
| **Extracted Centerline Runs** | `329` runs | `329` GT runs (`±5%` gate; actual error `0.00%`) | Verified | **PASS** |
| **Cold Extraction Latency** | `23468.03 ms` | Full 6-stage PyMuPDF + Shapely + NetworkX topology | Verified | **PASS** |
| **Warm SHA-256 Cache Hit Latency** | `1.3460 ms` | `< 2.0 ms` (thread-safe SHA-256 LRU cache) | Verified | **PASS** |
| **Unscaled Total Footage (`scale_ratio=0.0`)** | `0.00 ft` | Must equal `0.00 ft` (`review_required = True`) | Verified | **PASS** |
| **Calibrated Total Footage (`1/8" = 1'-0"`, ratio `96.0`)** | `636.62 ft` | Euclidean $\frac{L_{pt} \times \text{ratio}}{864}$ | Verified | **PASS** |

---

## 3. Multi-Agent Reconciliation, Watchdog QA & Copilot Grounding

| Agent | Verification Target | Measured Result | Gate Invariant | Verdict |
|---|---|---|---|---|
| **Agent 04 (`ScheduleReconcilerAgent`)** | Seeded Schedule-vs-Plan Mismatch & Ghost Pins | `1` matched, `1` ghost pin, `2` mismatch flags | Mismatch recall `1.00`; zero silent auto-adjustment | **PASS** |
| **Agent 05 (`WatchdogQAAgent`)** | Rules-Only Anomaly & Unverified Scale Detection | `1` durable QA annotations persisted | Flags uncalibrated scale & schedule conflicts | **PASS** |
| **Agent 06 (`CopilotJudgeAgent`)** | Read-Only Tool Calling, Citations & Offline Honesty | `offline=True`, `2` grounded citations | Resolves `ev:<sheet>:<type>:<x>:<y>`, discloses unverified scale | **PASS** |

---

## 4. Reproduction Command

```powershell
.venv\Scripts\python.exe scripts/generate_eval_report.py
```
