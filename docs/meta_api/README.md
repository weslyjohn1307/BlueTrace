# Meta Model API & Frontier Multi-Agent Intelligence Index

> Reference hub for Meta Model API (`https://api.meta.ai/v1`) integrations across BlueTraceAI.

---

## 1. Active Models in BlueTraceAI

| Model Name | Endpoint | Modality / Purpose | Latency Target | BlueTraceAI Integration |
|---|---|---|---|---|
| **`muse-spark-1.3`** | `/chat/completions` | Multimodal Vision, OCR & Table Extraction | < 500 ms (crops) / < 2.5 s (sheets) | Title Block SheetScan (`SheetScanner`), Point-of-need QuickDraw hover (`CursorCropResponse`), Equipment Schedule table extraction (`ScheduleParser`). |
| **`sam-3.1`** | `/responses` | Concept & Coordinate Promptable Segmentation | 1.0 – 2.0 s | Zero-shot spatial boundaries for rooms, duct runs, equipment footprints (`segment_concept_async`). |
| **`muse-wonder-1.0`** | `/chat/completions` | Complex Engineering Reasoning & Tool Calling | < 1.0 s | Conversational estimating copilot grounded in SQLite TakeoffStore (`TakeoffCopilot`). |
| **Files API** | `/files` | Document Caching (`purpose="assistants"`) | Async pre-upload | Blueprint caching for sub-second reference across multi-agent sessions. |

---

## 2. API Architecture & Request Protocols

### 2.1 Base URL & Authentication
- **Base URL**: `https://api.meta.ai/v1`
- **Header**: `Authorization: Bearer <MODEL_API_KEY>`
- **Security Invariant**: Never store keys in git, disk, cookies, or browser storage. All evaluation keys are session-scoped in memory only (`src/api/routes.py`).

### 2.2 Muse Spark 1.3 Vision Call Pattern
```python
client = OpenAI(base_url="https://api.meta.ai/v1", api_key=api_key)
response = client.chat.completions.create(
    model="muse-spark-1.3",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Extract duct dimensions and shape into JSON."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_crop}"}}
            ]
        }
    ],
    temperature=0.1,
    max_tokens=300
)
```

### 2.3 SAM 3.1 Responses API Call Pattern
```python
# POST https://api.meta.ai/v1/responses
payload = {
    "model": "sam-3.1",
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": "mechanical equipment boundary"},
                {"type": "input_image", "image_url": f"data:image/png;base64,{base64_crop}"}
            ]
        }
    ],
    "stream": False
}
```

---

## 3. Local Mirrors & Cookbook References

- **`meta-model-cookbook/`**: Mirrored locally in `docs/meta_api/meta-model-cookbook`.
  - `01_api_fundamentals/`: Direct API request construction and token budgeting.
  - `04_muse_code/`: Code execution, tool schemas, and agentic loop patterns.
- **`meta-oss-cookbook/`**: Mirrored locally in `docs/meta_api/meta-oss-cookbook`.
  - Fine-tuning, quantization, and offline benchmarking recipes.

---

## 4. Key Takeaways from Hackathon Briefings

1. **The Drawing Sheet is the Interface**:
   Avoid full-page black-box LLM processing. Use 300x300 px point-of-need crops for sub-second cursor interactions and native PyMuPDF vector linework for scale mathematics.
2. **Fail-Closed Scale Verification**:
   If an architectural scale is ambiguous, conflicting, or uncalibrated, never guess. Return `scale_verified=False` to prevent erroneous bids.
3. **Human-in-the-Loop Supremacy**:
   All model suggestions default to `SUGGESTED` status with 1-click accept/reject. Zero automated `ACCEPTED` commits.
