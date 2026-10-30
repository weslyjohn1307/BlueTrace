# RES-01: Meta Model API Interface Specifications

## 1. Overview
BlueTraceAI connects to the hosted Meta Model API via the standard `openai` Python SDK (or HTTP/SSE clients).

* **Base URL**: `https://api.meta.ai/v1`
* **Authentication**: `Bearer $MODEL_API_KEY` (or `$META_API_KEY`)
* **Context Window**: 1,048,576 tokens (1M tokens)

---

## 2. Models & Protocol Assignment

### 2.1 `muse-spark-1.3` (Multimodal Vision & Table Extraction)
Used for SheetScan title block parsing, schedule extraction, and cursor crop OCR.

* **Endpoint**: `POST /v1/chat/completions`
* **Input Payload**: Text prompt + Base64 inline image URL or uploaded file reference.
* **Payload Structure**:
```python
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ.get("MODEL_API_KEY"),
    base_url="https://api.meta.ai/v1"
)

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
* **Input Payload**: Message array containing `input_text` concept prompt and/or coordinate points + `input_image`.
* **Payload Structure**:
```python
import httpx
import os

url = "https://api.meta.ai/v1/responses"
headers = {
    "Authorization": f"Bearer {os.environ.get('MODEL_API_KEY')}",
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
}
payload = {
    "model": "sam-3.1",
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": "mechanical equipment boundary"},
                {"type": "input_image", "image_url": f"data:image/png;base64,{base64_image}"}
            ]
        }
    ],
    "stream": False
}
response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
masks_and_boxes = response.json()
```

### 2.3 `muse-wonder-1.0` (Reasoning & Copilot Engine)
Used for natural language takeoff queries and calculation over the structured database.

* **Endpoint**: `POST /v1/chat/completions` (or `POST /v1/responses`)
* **Features**: Parallel tool calling, system instruction conditioning, structured JSON output, long-horizon reasoning.

### 2.4 Files API (`POST /v1/files`, `GET /v1/files/{file_id}`)
Used to upload multi-page blueprint PDFs once to avoid re-transmitting large drawings across multiple reconnaissance and crop queries.

```python
# Upload PDF drawing once
with open("sheet_set.pdf", "rb") as f:
    file_obj = client.files.create(file=f, purpose="assistants")
file_id = file_obj.id
# Reference file_id directly in subsequent requests
```
