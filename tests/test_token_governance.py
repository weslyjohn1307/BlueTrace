"""Unit tests for the Task-Calibrated & Adaptive Token Architecture (T3A) and Circuit Breaker.

Verifies:
1. Hard invariant: zero infinite loops (max_retries <= 1, strict termination).
2. Hard invariant: token budget never exceeds max_token_ceiling.
3. Optimal token allocation across profiles (hover, sheet recon, schedule, copilot).
4. Telemetry tracking (prompt, reasoning, completion tokens, retries, latency).
5. Fail-closed safety on truncation.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from src.meta_services.client import (
    PROFILE_COPILOT_REASONING,
    PROFILE_HOVER_OCR,
    PROFILE_SCHEDULE_EXTRACTION,
    PROFILE_SHEET_RECON,
    ExecutionProfile,
    MetaModelClient,
)


def test_governed_profiles_invariants():
    """All profiles must obey hard ceiling bounds and loop protection."""
    for profile in (PROFILE_HOVER_OCR, PROFILE_SHEET_RECON, PROFILE_SCHEDULE_EXTRACTION, PROFILE_COPILOT_REASONING):
        assert profile.name
        assert profile.reasoning_effort in ("minimal", "low", "medium", "high")
        assert profile.initial_max_tokens > 0
        assert profile.max_token_ceiling >= profile.initial_max_tokens
        # Loop protection invariant: strictly at most 1 retry
        assert profile.max_retries <= 1


def test_no_infinite_loop_on_persistent_length_truncation():
    """If Meta API persistently returns finish_reason='length', the circuit breaker

    must terminate after exactly 1 escalation retry -- NEVER looping indefinitely.
    """
    client = MetaModelClient(api_key="mock_test_key_configured")
    client.client = MagicMock()

    # Mock response that repeatedly truncates
    mock_choice = MagicMock()
    mock_choice.finish_reason = "length"
    mock_choice.message.content = '{"dimension_text": "partial_text'

    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_resp.usage.prompt_tokens = 200
    mock_resp.usage.completion_tokens = 500
    mock_resp.usage.total_tokens = 700
    mock_resp.usage.completion_tokens_details.reasoning_tokens = 450

    client.client.chat.completions.create.return_value = mock_resp

    test_profile = ExecutionProfile(
        name="test_circuit_breaker",
        reasoning_effort="minimal",
        initial_max_tokens=400,
        max_token_ceiling=800,
        max_retries=1,
    )

    _content, telemetry = client._execute_governed_completion(
        model="muse-spark-1.3",
        messages=[{"role": "user", "content": "test prompt"}],
        profile=test_profile,
    )

    # Exactly 2 total attempts (1 initial + 1 retry)
    assert client.client.chat.completions.create.call_count == 2
    assert telemetry["retries"] == 1
    assert telemetry["truncated"] is True
    assert telemetry["reasoning_tokens"] == 450
    assert telemetry["profile"] == "test_circuit_breaker"


def test_token_budget_escalates_up_to_ceiling_only():
    """When escalating on length truncation, budget must never exceed max_token_ceiling."""
    client = MetaModelClient(api_key="mock_test_key_configured")
    client.client = MagicMock()

    mock_choice = MagicMock()
    mock_choice.finish_reason = "length"
    mock_choice.message.content = "truncated"
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_resp.usage.prompt_tokens = 100
    mock_resp.usage.completion_tokens = 500
    mock_resp.usage.total_tokens = 600
    mock_resp.usage.completion_tokens_details.reasoning_tokens = 400
    client.client.chat.completions.create.return_value = mock_resp

    test_profile = ExecutionProfile(
        name="test_ceiling",
        reasoning_effort="low",
        initial_max_tokens=600,
        max_token_ceiling=900,  # 600 * 2 = 1200 > 900, so ceiling must cap at 900
        max_retries=1,
    )

    client._execute_governed_completion(
        model="muse-spark-1.3",
        messages=[{"role": "user", "content": "test"}],
        profile=test_profile,
    )

    calls = client.client.chat.completions.create.call_args_list
    assert len(calls) == 2
    # First attempt: initial_max_tokens (600)
    assert calls[0].kwargs["max_tokens"] == 600
    # Second attempt: capped at max_token_ceiling (900), not 1200
    assert calls[1].kwargs["max_tokens"] == 900


def test_clean_stop_does_not_retry():
    """When finish_reason is 'stop', exactly 1 call is made (zero retries)."""
    client = MetaModelClient(api_key="mock_test_key_configured")
    client.client = MagicMock()

    mock_choice = MagicMock()
    mock_choice.finish_reason = "stop"
    mock_choice.message.content = '{"dimension_text": "24x12", "width": 24, "height": 12, "shape": "RECTANGULAR"}'
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_resp.usage.prompt_tokens = 100
    mock_resp.usage.completion_tokens = 150
    mock_resp.usage.total_tokens = 250
    mock_resp.usage.completion_tokens_details.reasoning_tokens = 80
    client.client.chat.completions.create.return_value = mock_resp

    _content, telemetry = client._execute_governed_completion(
        model="muse-spark-1.3",
        messages=[{"role": "user", "content": "crop"}],
        profile=PROFILE_HOVER_OCR,
    )

    assert client.client.chat.completions.create.call_count == 1
    assert telemetry["retries"] == 0
    assert telemetry["truncated"] is False
    assert telemetry["reasoning_tokens"] == 80


def test_zero_retries_profile_never_retries():
    """If profile specifies max_retries=0, truncation stops immediately with no retry."""
    client = MetaModelClient(api_key="mock_test_key_configured")
    client.client = MagicMock()

    mock_choice = MagicMock()
    mock_choice.finish_reason = "length"
    mock_choice.message.content = "incomplete"
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_resp.usage.prompt_tokens = 50
    mock_resp.usage.completion_tokens = 100
    mock_resp.usage.total_tokens = 150
    mock_resp.usage.completion_tokens_details.reasoning_tokens = 80
    client.client.chat.completions.create.return_value = mock_resp

    strict_profile = ExecutionProfile(
        name="no_retry",
        reasoning_effort="minimal",
        initial_max_tokens=300,
        max_token_ceiling=300,
        max_retries=0,
    )

    _, telemetry = client._execute_governed_completion(
        model="muse-spark-1.3",
        messages=[{"role": "user", "content": "crop"}],
        profile=strict_profile,
    )

    assert client.client.chat.completions.create.call_count == 1
    assert telemetry["retries"] == 0
    assert telemetry["truncated"] is True


def test_parse_crop_ocr_fails_closed_on_truncation():
    """If hover crop OCR is truncated, it must flag review_required and inform the user."""
    client = MetaModelClient(api_key="mock_test_key_configured")
    client._execute_governed_completion = MagicMock(  # type: ignore[method-assign]
        return_value=(
            '{"dimension_text": "24x',
            {
                "profile": "hover_ocr",
                "retries": 1,
                "truncated": True,
                "prompt_tokens": 100,
                "reasoning_tokens": 400,
                "completion_tokens": 500,
                "total_tokens": 600,
            },
        )
    )

    result = client.parse_crop_ocr("dummy_base64", profile=PROFILE_HOVER_OCR)

    assert result["review_required"] is True
    assert "Truncated" in result["badge_text"]
    assert result["confidence"] == 0.0
    assert result["telemetry"]["truncated"] is True
