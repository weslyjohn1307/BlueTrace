# RES-01: Meta Model API Interface Specifications

## 1. Overview
BlueTraceAI connects to the hosted Meta Model API via the standard `openai` Python SDK.

* **Base URL**: `https://api.meta.ai/v1`
* **Authentication**: `Bearer $MODEL_API_KEY`

---

## 2. Models & Protocol Assignment

### 2.1 `muse-spark-1.3` (Multimodal Vision & Table Extraction)
Used for SheetScan title block parsing, schedule extraction, and cursor crop OCR.

* **Endpoint**: `POST /v1/chat/completions`
* **Input Payload**: Text prompt + Base64 inline image URL.
* **Payload Structure**:
```python
response = client.chat.completions.create(
    model="muse-spark-1.3",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Extract all duct dimensions from this crop."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,<BASE64_STRING>"}
                }
            ]
        }
    ],
    temperature=0.1,
    max_tokens=500
)
```

### 2.2 `sam-3.1` (Interactive Zero-Shot Segmentation)
Used for point-and-click polygon and mask extraction of room footprints and equipment.

* **Endpoint**: `POST /v1/responses`
* **Input Payload**: Concept text prompt / point coordinates + Base64 image.
* **Payload Structure**:
```python
response = client.responses.create(
    model="sam-3.1",
    input=[
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "mechanical equipment boundary"},
                {"type": "input_image", "image_url": "data:image/png;base64,<BASE64_STRING>"}
            ]
        }
    ]
)
```

### 2.3 `muse-wonder` (Reasoning & Copilot Engine)
Used for natural language takeoff queries and calculation over the structured database.

* **Endpoint**: `POST /v1/chat/completions`
* **Features**: Parallel tool calling, system instruction conditioning, structured JSON output.
