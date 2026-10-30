# BlueTraceAI: Research & Operational Findings (findings.md)

## 1. Hackathon Parameters (Meta Global AI Developer Hackathon)
- **Host**: Meta & Cerebral Valley (`https://cerebralvalley.ai/e/meta-ai-developer-hackathon`)
- **Total Prize Pool**: $1,000,000 USD (Indie Track: $400k, Startup Track: $550k, Bonus: $50k)
- **Submission Portal**: `https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit`
- **Official Judging Rubric**:
  - Impact (30%): Real-world domain problem solving
  - Use of Meta AI Tooling (25%): Creative & deep integration of Meta models
  - Technical Depth & Execution (20%): Engineering soundness, deterministic precision
  - Demo (25%): Working live product & video walkthrough quality

## 2. Meta Model API Specifications
- **Base URL**: `https://api.meta.ai/v1`
- **Auth**: `Authorization: Bearer $MODEL_API_KEY`
- **Endpoints**:
  - `POST /v1/chat/completions`: Used for `muse-spark-1.3` (vision/table parsing) and `muse-wonder-1.0` (reasoning/copilot)
  - `POST /v1/responses`: Used for `sam-3.1` promptable segmentation (`Accept: text/event-stream` or JSON)
  - `POST /v1/files`, `GET /v1/files/{file_id}`: PDF drawing caching
- **Context Window**: 1,048,576 tokens (1M tokens) on Muse models

## 3. Academic & Benchmark Context (ParseBench arXiv:2604.08538)
- Focuses on 5 core dimensions: Visual Grounding, Tables/Schedules, Content Faithfulness, Semantic Formatting, Charts/Legends.
- Principle: *"Read cheaply first, reason visually selectively."*
- Bounded 4-Agent Architecture:
  1. Document Reconnaissance (Page/Text/Vector scan)
  2. Sheet & Legend Interpreter (Targeted crops of tables/legends)
  3. Task Router (Dispatches user queries to detection/vector engines)
  4. Evidence Verifier (Validates scale, binds coordinates, flags review)

## 4. Engineering Standards from Master Checklist (October 2026 Edition)
- Strict Hybrid Division: Local Python algorithms (PyMuPDF, NetworkX, Shapely) for linework/math; Meta models for perception/reasoning.
- Point-of-need hover interactions operate on 300x300 px crops for sub-second latency (< 500ms).
- Fail-closed scale rule: unverified scales flag footages as `"review_required"`.
- 10-Point Anti-Slop Ban List applied to frontend styling.
- 5 Mandatory Screen States handled: Loading, Empty, Error, Success, Offline.
