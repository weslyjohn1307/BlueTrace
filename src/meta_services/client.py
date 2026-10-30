import json
import os
import re
import time
from typing import Any

import httpx

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    OpenAI = None  # type: ignore[assignment, misc]


class MetaModelClient:
    """Client for Meta Model API (https://api.meta.ai/v1).
    
    Provides unified access to:
    - muse-spark-1.3 (Vision, OCR, Table Parsing)
    - sam-3.1 (Concept & Coordinate Segmentation via /v1/responses)
    - muse-wonder-1.0 (Reasoning Copilot & Structured Tool Calling)
    - Files API (/v1/files for blueprint document caching)
    """

    client: Any

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

    @staticmethod
    def _extract_crop_json(content: str) -> dict[str, Any]:
        """Parses JSON from VLM response or returns fail-closed review_required dict."""
        clean = content.strip()
        if "```" in clean:
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", clean, re.DOTALL)
            if match:
                clean = match.group(1)
        try:
            data = json.loads(clean)
            if isinstance(data, dict):
                dim_text = data.get("dimension_text") or data.get("text")
                width = float(data["width"]) if data.get("width") is not None else None
                height = float(data["height"]) if data.get("height") is not None else None
                shape = str(data.get("shape", "RECTANGULAR")).upper()
                if width and width > 0:
                    badge = f"{int(width)}x{int(height)} Rectangular Duct" if height else f'{int(width)}" Round Duct'
                    return {
                        "detected_text": str(dim_text or f"{int(width)}x{int(height or 0)}"),
                        "width": width,
                        "height": height,
                        "shape": shape,
                        "confidence": 0.92,
                        "badge_text": badge,
                        "review_required": False,
                    }
        except (json.JSONDecodeError, ValueError, KeyError, TypeError):
            pass

        return {
            "detected_text": "",
            "width": None,
            "height": None,
            "shape": "UNKNOWN",
            "confidence": 0.0,
            "badge_text": "Review Required (Unparsed Dimension)",
            "review_required": True,
        }

    def parse_crop_ocr(self, base64_image: str, prompt: str | None = None) -> dict[str, Any]:
        """Extracts text, duct dimensions, and callout labels from a 300x300 px crop using muse-spark-1.3."""
        start_time = time.time()
        default_prompt = (
            "Extract any duct or pipe dimensions (e.g., '24x12', '10\" dia', '16/10') and callouts "
            "from this MEP drawing crop. Return JSON with keys: 'dimension_text', 'width', 'height', 'shape'."
        )
        user_prompt = prompt or default_prompt

        if not self.is_configured():
            # Offline stub: shape-stable for UI tests, but never claims verification.
            latency_ms = int((time.time() - start_time) * 1000)
            return {
                "detected_text": "24x12",
                "width": 24.0,
                "height": 12.0,
                "shape": "RECTANGULAR",
                "confidence": 0.0,
                "badge_text": "24x12 Rectangular Duct (offline stub — unverified)",
                "latency_ms": latency_ms,
                "mock": True,
                "review_required": True,
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
        parsed = self._extract_crop_json(content)
        parsed["raw_content"] = content
        parsed["latency_ms"] = latency_ms
        parsed["mock"] = False
        return parsed

    def query_reasoning(
        self,
        prompt: str,
        system_prompt: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Queries muse-wonder-1.0 for engineering reasoning and copilot assistance."""
        if not self.is_configured():
            return {
                "content": "Meta Model API is not configured (offline mode).",
                "mock": True,
            }

        sys_msg = (
            system_prompt
            or "You are BlueTraceAI Copilot, an expert MEP engineering takeoff assistant. "
            "INVARIANT: Never hallucinate dimensions, counts, or scale ratios. "
            "If a scale is unverified or unknown, explicitly state that calibration is required."
        )
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": sys_msg},
        ]
        if context:
            messages.append({
                "role": "user",
                "content": f"Context data:\n{json.dumps(context, indent=2)}\n\nUser Question:\n{prompt}",
            })
        else:
            messages.append({"role": "user", "content": prompt})

        if self.client:
            response = self.client.chat.completions.create(
                model="muse-wonder-1.0",
                messages=messages,
                temperature=0.2,
                max_tokens=600,
            )
            content = response.choices[0].message.content or ""
        else:
            url = f"{self.base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "muse-wonder-1.0",
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 600,
            }
            with httpx.Client(timeout=30.0) as http_client:
                resp = http_client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]

        return {
            "content": content,
            "mock": False,
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
