import os
import time
from typing import Any

import httpx

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    OpenAI = None


class MetaModelClient:
    """Client for Meta Model API (https://api.meta.ai/v1).
    
    Provides unified access to:
    - muse-spark-1.3 (Vision, OCR, Table Parsing)
    - sam-3.1 (Concept & Coordinate Segmentation via /v1/responses)
    - muse-wonder-1.0 (Reasoning Copilot & Structured Tool Calling)
    - Files API (/v1/files for blueprint document caching)
    """

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.environ.get("MODEL_API_KEY", "")
        self.base_url = base_url or os.environ.get("META_API_BASE_URL", "https://api.meta.ai/v1")
        
        # OpenAI SDK client if available
        if HAS_OPENAI and OpenAI is not None:
            self.client = OpenAI(
                api_key=self.api_key or "mock_key_unconfigured",
                base_url=self.base_url,
            )
        else:
            self.client = None

    def is_configured(self) -> bool:
        """Returns True if a real API key has been provided."""
        return bool(self.api_key and self.api_key != "mock_key_unconfigured" and not self.api_key.startswith("your_"))

    def parse_crop_ocr(self, base64_image: str, prompt: str | None = None) -> dict[str, Any]:
        """Extracts text, duct dimensions, and callout labels from a 300x300 px crop using muse-spark-1.3."""
        start_time = time.time()
        default_prompt = (
            "Extract any duct or pipe dimensions (e.g., '24x12', '10\" dia', '16/10') and callouts "
            "from this MEP drawing crop. Return JSON with keys: 'dimension_text', 'width', 'height', 'shape'."
        )
        user_prompt = prompt or default_prompt

        if not self.is_configured():
            # Graceful mock response for unconfigured test runs
            latency_ms = int((time.time() - start_time) * 1000)
            return {
                "detected_text": "24x12",
                "width": 24.0,
                "height": 12.0,
                "shape": "RECTANGULAR",
                "confidence": 0.95,
                "badge_text": "24x12 Rectangular Duct (Mock)",
                "latency_ms": latency_ms,
                "mock": True
            }

        # Live request using either OpenAI SDK or httpx
        if self.client:
            response = self.client.chat.completions.create(
                model="muse-spark-1.3",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                            }
                        ]
                    }
                ],
                temperature=0.1,
                max_tokens=300
            )
            content = response.choices[0].message.content or ""
        else:
            # Fallback to direct httpx POST to /v1/chat/completions
            url = f"{self.base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "muse-spark-1.3",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                            }
                        ]
                    }
                ],
                "temperature": 0.1,
                "max_tokens": 300
            }
            with httpx.Client(timeout=30.0) as http_client:
                resp = http_client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]

        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "raw_content": content,
            "latency_ms": latency_ms,
            "mock": False
        }

    async def segment_concept_async(self, base64_image: str, concept_prompt: str = "mechanical equipment boundary") -> dict[str, Any]:
        """Invokes SAM 3.1 via the Meta Model API /v1/responses endpoint to segment objects."""
        if not self.is_configured():
            return {
                "concept": concept_prompt,
                "masks": [],
                "polygons": [[[100.0, 100.0], [200.0, 100.0], [200.0, 200.0], [100.0, 200.0]]],
                "confidence": 0.92,
                "mock": True
            }

        url = f"{self.base_url.rstrip('/')}/responses"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "sam-3.1",
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": concept_prompt},
                        {"type": "input_image", "image_url": f"data:image/png;base64,{base64_image}"}
                    ]
                }
            ],
            "stream": False
        }
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    def upload_blueprint_file(self, file_path: str) -> str:
        """Uploads blueprint PDF to Meta Files API to obtain a cached file_id."""
        if not self.is_configured():
            return "mock_file_id_blueprint_cache"

        url = f"{self.base_url.rstrip('/')}/files"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        with open(file_path, "rb") as f:
            files = {"file": f}
            data = {"purpose": "assistants"}
            with httpx.Client(timeout=60.0) as http_client:
                resp = http_client.post(url, headers=headers, files=files, data=data)
                resp.raise_for_status()
                return resp.json()["id"]
