import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Literal

import httpx

logger = logging.getLogger(__name__)

ReasoningEffort = Literal["minimal", "low", "medium", "high"]


@dataclass(frozen=True)
class ExecutionProfile:
    """Governed execution profile balancing token economy and task complexity.

    Hard Invariants:
    - No runaway loops: max_retries is hard-capped (<= 1).
    - Absolute upper bound: max_token_ceiling prevents infinite budget inflation.
    - Optimal token usage: reasoning_effort is dialed to point-of-need complexity.
    """

    name: str
    reasoning_effort: ReasoningEffort
    initial_max_tokens: int
    max_token_ceiling: int
    max_retries: int = 1


# Governed Token Profiles (T3A)
PROFILE_HOVER_OCR = ExecutionProfile(
    name="hover_ocr",
    reasoning_effort="minimal",  # 30-60 reasoning tokens, sub-second latency
    initial_max_tokens=500,
    max_token_ceiling=800,
    max_retries=1,
)

PROFILE_SHEET_RECON = ExecutionProfile(
    name="sheet_recon",
    reasoning_effort="low",  # ~200 reasoning tokens, title block stamps
    initial_max_tokens=1200,
    max_token_ceiling=2500,
    max_retries=1,
)

PROFILE_SCHEDULE_EXTRACTION = ExecutionProfile(
    name="schedule_extraction",
    reasoning_effort="medium",  # Multi-row schedule tables
    initial_max_tokens=2500,
    max_token_ceiling=4000,
    max_retries=1,
)

PROFILE_COPILOT_REASONING = ExecutionProfile(
    name="copilot_reasoning",
    reasoning_effort="medium",  # Spatial multi-hop takeoff reasoning
    initial_max_tokens=2000,
    max_token_ceiling=3500,
    max_retries=1,
)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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
        
        # OpenAI SDK client if available (disable hidden SDK retries: governed circuit breaker handles retries centrally)
        if HAS_OPENAI and OpenAI is not None:
            self.client = OpenAI(
                api_key=self.api_key or "mock_key_unconfigured",
                base_url=self.base_url,
                max_retries=0,
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
                    try:
                        raw_conf = float(data.get("confidence", 0.0))
                    except (ValueError, TypeError):
                        raw_conf = 0.0
                    conf = max(0.0, min(1.0, raw_conf))
                    review_required = data.get("review_required")
                    if review_required is None:
                        # Fail-closed invariant: uncalibrated or low-confidence (<0.85) triggers human review
                        review_required = conf < 0.85
                    return {
                        "detected_text": str(dim_text or f"{int(width)}x{int(height or 0)}"),
                        "width": width,
                        "height": height,
                        "shape": shape,
                        "confidence": conf,
                        "badge_text": badge,
                        "review_required": bool(review_required),
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

    def _execute_governed_completion(
        self,
        model: str,
        messages: list[dict[str, Any]],
        profile: ExecutionProfile,
        temperature: float = 0.1,
    ) -> tuple[str, dict[str, Any]]:
        """Executes a chat completion governed by a strict ExecutionProfile.

        Enforces:
        1. Zero infinite loops: strictly at most 1 escalation retry on finish_reason='length'.
        2. Absolute token ceiling: token budget is strictly capped at profile.max_token_ceiling.
        3. Point-of-need reasoning effort: minimizes unnecessary token burn.
        4. Complete token telemetry returned with every call.
        """
        current_max_tokens = min(profile.initial_max_tokens, profile.max_token_ceiling)
        current_effort = profile.reasoning_effort
        retries_left = min(profile.max_retries, 1)  # Hard cap: never > 1
        attempt = 0
        telemetry: dict[str, Any] = {
            "profile": profile.name,
            "model": model,
            "reasoning_effort": current_effort,
            "retries": 0,
            "truncated": False,
            "prompt_tokens": 0,
            "reasoning_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

        while True:
            attempt += 1
            content = ""
            finish_reason = "stop"
            usage_data: dict[str, Any] = {}

            if self.client:
                try:
                    response = self.client.chat.completions.create(
                        model=model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=current_max_tokens,
                        reasoning_effort=current_effort,
                    )
                    choice = response.choices[0]
                    finish_reason = getattr(choice, "finish_reason", "stop") or "stop"
                    content = choice.message.content or ""
                    if getattr(response, "usage", None):
                        u = response.usage
                        rt = 0
                        if hasattr(u, "completion_tokens_details") and u.completion_tokens_details:
                            rt = getattr(u.completion_tokens_details, "reasoning_tokens", 0)
                        usage_data = {
                            "prompt_tokens": getattr(u, "prompt_tokens", 0) or 0,
                            "completion_tokens": getattr(u, "completion_tokens", 0) or 0,
                            "total_tokens": getattr(u, "total_tokens", 0) or 0,
                            "reasoning_tokens": rt or 0,
                        }
                except Exception as exc:
                    logger.warning("OpenAI SDK completion failed for %s (attempt %d): %s", profile.name, attempt, exc)
                    raise
            else:
                url = f"{self.base_url.rstrip('/')}/chat/completions"
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": current_max_tokens,
                    "reasoning_effort": current_effort,
                }
                with httpx.Client(timeout=45.0) as http_client:
                    resp = http_client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    choice = data["choices"][0]
                    finish_reason = choice.get("finish_reason") or "stop"
                    content = choice.get("message", {}).get("content") or ""
                    u = data.get("usage", {})
                    rt = u.get("completion_tokens_details", {}).get("reasoning_tokens", 0) if isinstance(u, dict) else 0
                    usage_data = {
                        "prompt_tokens": u.get("prompt_tokens", 0) if isinstance(u, dict) else 0,
                        "completion_tokens": u.get("completion_tokens", 0) if isinstance(u, dict) else 0,
                        "total_tokens": u.get("total_tokens", 0) if isinstance(u, dict) else 0,
                        "reasoning_tokens": rt,
                    }

            telemetry["prompt_tokens"] = usage_data.get("prompt_tokens", 0)
            telemetry["completion_tokens"] = usage_data.get("completion_tokens", 0)
            telemetry["total_tokens"] = usage_data.get("total_tokens", 0)
            telemetry["reasoning_tokens"] = usage_data.get("reasoning_tokens", 0)

            # Circuit Breaker & Adaptive Escalation Logic
            if finish_reason == "length" and retries_left > 0:
                next_tokens = min(current_max_tokens * 2, profile.max_token_ceiling)
                if next_tokens > current_max_tokens:
                    logger.warning(
                        "Meta API hit finish_reason='length' for %s (attempt %d). "
                        "Escalating token budget %d -> %d (ceiling: %d). Retrying once.",
                        profile.name,
                        attempt,
                        current_max_tokens,
                        next_tokens,
                        profile.max_token_ceiling,
                    )
                    current_max_tokens = next_tokens
                    retries_left = 0  # STRICT CIRCUIT BREAKER: Exactly 1 retry, NEVER loop
                    telemetry["retries"] += 1
                    continue

            # If length truncation occurred and no retries remain, record truncated status
            if finish_reason == "length":
                telemetry["truncated"] = True
                logger.warning(
                    "Meta API response truncated for %s: hard token ceiling %d reached.",
                    profile.name,
                    profile.max_token_ceiling,
                )

            break

        return content, telemetry

    def parse_crop_ocr(
        self,
        base64_image: str,
        prompt: str | None = None,
        profile: ExecutionProfile | None = None,
    ) -> dict[str, Any]:
        """Extracts text, duct dimensions, and callout labels from an image crop using muse-spark-1.3."""
        start_time = time.time()
        default_prompt = (
            "Extract any duct or pipe dimensions (e.g., '24x12', '10\" dia', '16/10') and callouts "
            "from this MEP drawing crop. Return JSON with keys: 'dimension_text', 'width', 'height', 'shape'."
        )
        user_prompt = prompt or default_prompt
        active_profile = profile or PROFILE_HOVER_OCR

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
                "telemetry": {
                    "profile": active_profile.name,
                    "retries": 0,
                    "truncated": False,
                    "mock": True,
                },
            }

        messages = [
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
        ]

        content, telemetry = self._execute_governed_completion(
            model="muse-spark-1.3",
            messages=messages,
            profile=active_profile,
            temperature=0.1,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        telemetry["latency_ms"] = latency_ms

        parsed = self._extract_crop_json(content)
        parsed["raw_content"] = content
        parsed["latency_ms"] = latency_ms
        parsed["mock"] = False
        parsed["telemetry"] = telemetry

        # Fail-closed invariant: if response was truncated, flag review required
        if telemetry.get("truncated"):
            parsed["review_required"] = True
            parsed["badge_text"] = "Review Required (Token Budget Truncated)"

        return parsed

    def query_reasoning(
        self,
        prompt: str,
        system_prompt: str | None = None,
        context: dict[str, Any] | None = None,
        profile: ExecutionProfile | None = None,
    ) -> dict[str, Any]:
        """Queries muse-wonder-1.0 for engineering reasoning and copilot assistance."""
        start_time = time.time()
        active_profile = profile or PROFILE_COPILOT_REASONING

        if not self.is_configured():
            return {
                "content": "Meta Model API is not configured (offline mode).",
                "mock": True,
                "telemetry": {
                    "profile": active_profile.name,
                    "retries": 0,
                    "truncated": False,
                    "mock": True,
                },
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

        content, telemetry = self._execute_governed_completion(
            model="muse-wonder-1.0",
            messages=messages,
            profile=active_profile,
            temperature=0.2,
        )

        latency_ms = int((time.time() - start_time) * 1000)
        telemetry["latency_ms"] = latency_ms

        return {
            "content": content,
            "mock": False,
            "telemetry": telemetry,
        }

    def chat_completion_with_tools(
        self,
        model: str = "muse-wonder-1.0",
        messages: list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.1,
    ) -> dict[str, Any]:
        """Governed chat completion supporting tool calling with muse-wonder-1.0."""
        if not self.is_configured():
            return {"content": "", "tool_calls": [], "mock": True}
        messages = messages or []
        tools = tools or []
        if self.client:
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto" if tools else None,
                    temperature=temperature,
                )
                choice = response.choices[0]
                content = getattr(choice.message, "content", "") or ""
                tool_calls: list[dict[str, Any]] = []
                raw_tool_calls = getattr(choice.message, "tool_calls", None)
                if raw_tool_calls:
                    for tc in raw_tool_calls:
                        fn = getattr(tc, "function", None)
                        tool_calls.append({
                            "id": getattr(tc, "id", f"call_{uuid.uuid4().hex[:6]}"),
                            "type": getattr(tc, "type", "function"),
                            "function": {
                                "name": getattr(fn, "name", "") if fn else "",
                                "arguments": getattr(fn, "arguments", "{}") if fn else "{}",
                            },
                        })
                return {"content": content, "tool_calls": tool_calls, "mock": False}
            except Exception as exc:  # noqa: BLE001
                logger.warning("SDK chat_completion_with_tools failed: %s", exc)
                return {"content": "", "tool_calls": [], "mock": True, "error": str(exc)}
        else:
            url = f"{self.base_url.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
            }
            if tools:
                payload["tools"] = tools
                payload["tool_choice"] = "auto"
            try:
                with httpx.Client(timeout=45.0) as http_client:
                    resp = http_client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    choice = data["choices"][0]
                    content = choice.get("message", {}).get("content") or ""
                    tool_calls = choice.get("message", {}).get("tool_calls") or []
                    return {"content": content, "tool_calls": tool_calls, "mock": False}
            except Exception as exc:  # noqa: BLE001
                logger.warning("HTTP chat_completion_with_tools failed: %s", exc)
                return {"content": "", "tool_calls": [], "mock": True, "error": str(exc)}

    def segment_concept(self, base64_image: str, concept_prompt: str = "mechanical equipment boundary") -> dict[str, Any]:
        """Synchronously invokes SAM 3.1 via the Meta Model API /v1/responses endpoint to segment objects."""
        if not self.is_configured():
            return {
                "concept": concept_prompt,
                "masks": [],
                "polygons": [],
                "confidence": 0.0,
                "mock": True,
                "review_required": True,
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
        try:
            with httpx.Client(timeout=30.0) as http_client:
                resp = http_client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("HTTP segment_concept failed: %s", exc)
            return {
                "concept": concept_prompt,
                "masks": [],
                "polygons": [],
                "confidence": 0.0,
                "mock": True,
                "review_required": True,
                "error": str(exc),
            }

    async def segment_concept_async(self, base64_image: str, concept_prompt: str = "mechanical equipment boundary") -> dict[str, Any]:
        """Invokes SAM 3.1 via the Meta Model API /v1/responses endpoint to segment objects."""
        if not self.is_configured():
            # Fail-closed offline abstention (FAIL_CLOSED.md): no invented
            # geometry. Shape-stable keys so API/frontend contracts hold;
            # frontend already guards on polygons.length > 0.
            return {
                "concept": concept_prompt,
                "masks": [],
                "polygons": [],
                "confidence": 0.0,
                "mock": True,
                "review_required": True,
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
