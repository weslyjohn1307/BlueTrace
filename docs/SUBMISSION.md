# Meta Global AI Developer Hackathon — BlueTraceAI Submission Guide

> **Project Name:** BlueTraceAI  
> **Tagline:** AI-Native Interactive Drawing Intelligence & MEP Takeoff Platform  
> **Hackathon Page:** https://cerebralvalley.ai/e/meta-ai-developer-hackathon  
> **Track:** Indie Developer & Startup Track

---

## 1. Executive Summary

BlueTraceAI bridges the gap between probabilistic generative vision models and deterministic construction engineering. Using Meta's foundation models (`muse-spark-1.3` for visual OCR, `sam-3.1` for concept segmentation, and `muse-wonder-1.0` for reasoning) combined with local geometric vector algorithms, BlueTraceAI eliminates hundreds of hours of manual blueprint measuring for mechanical, electrical, and plumbing (MEP) contractors.

Unlike black-box LLM estimators that hallucinate measurements, BlueTraceAI enforces a strict **fail-closed architectural invariant**: every dimension and linear footage quantity must mathematically trace to physical vector coordinates in the PDF and validated architectural scales.

---

## 2. Pre-Submission Git Remote Setup (Action Required)

When ready to publish to your remote GitHub repository, run the following commands:

```bash
# 1. Add your remote repository origin
git remote add origin https://github.com/<your-username>/bluetrace-ai.git

# 2. Ensure default branch is master
git branch -M master

# 3. Push code, tests, and documentation
git push -u origin master
```

---

## 3. Quickstart & Verification Commands

### 3.1 Backend Setup & Verification
```bash
# Activate virtual environment
.venv\Scripts\activate   # Windows
# or source .venv/bin/activate on Unix

# Run all 35 verified backend tests
pytest tests/

# Run static analysis and linting
ruff check src/ tests/ scripts/
mypy
python scripts/sanitize_import.py --audit
```

### 3.2 Frontend Setup & Verification
```bash
cd frontend

# Run 84 Vitest unit & component tests
npm test -- --run

# Build production bundle
npm run build

# Run linter
npm run lint
```

### 3.3 Running the Live Development Stack
```bash
# Terminal 1 — Backend API Server (Port 8000)
uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend Canvas UI (Port 5173)
cd frontend
npm run dev
```

---

## 4. Canonical Judge Demo Walkthrough

1. **Upload Drawing (`POST /api/upload`):** Drop a sample engineering drawing (e.g. `fixtures/mechanical/avexis_page_22.pdf`) into the workspace.
2. **Automated SheetScan Reconnaissance (`POST /api/sheet-scan`):** `muse-spark-1.3` automatically extracts the title block, parses sheet number `M-2.2`, verifies scale ratio `1/4" = 1'-0"`, and classifies discipline as `MECHANICAL`.
3. **Interactive 150 DPI Vector Canvas:** The drawing renders with crisp physical vector coordinates, allowing infinite hardware-accelerated pan and zoom.
4. **Point-of-Need QuickDraw Hover (`POST /api/crop-ocr`):** Hovering the cursor over duct lines crops a 150 pt bounding box; `muse-spark-1.3` extracts the dimension text in $<350$ ms and surfaces a floating badge (`24x12 Rectangular Duct`).
5. **Human-in-the-Loop Takeoff Ledger:** All detected items populate the takeoff ledger with status `SUGGESTED`. Estimators click `Accept` or `Reject` with one keystroke; every decision is immutably logged in SQLite.
6. **Live Reasoning Copilot (`POST /api/copilot` & `/copilot/stream`):** Estimators ask natural language questions (e.g. *"What is the total footage of 24x12 ductwork?"*). `muse-wonder-1.0` synthesizes the response, citing verified coordinates and bounding boxes.
7. **Estimating Export (`GET /api/takeoff/export/csv`):** One click exports a clean estimating CSV containing category, system, dimension, linear length, count, and vector geometry coordinates.
