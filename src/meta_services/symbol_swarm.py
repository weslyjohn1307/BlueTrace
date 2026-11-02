"""Parallel tile inference swarm + two-tier verifier for full-sheet symbol detection.

Conforms to AGENTS.md (Hybrid Division: models interpret, deterministic code
measures) and the fail-closed invariant: unparseable model JSON never produces
invented labels or confidences -- affected tiles/candidates surface with
``review_required=True`` instead.

SYM-002 (this module, part 1):
  - :func:`build_tile_prompt` assembles a multi-image exemplar prompt
    (legend exemplar crops + one 1024px sheet tile) for ``muse-spark-1.3``.
  - :func:`run_swarm` dispatches non-empty tiles concurrently through
    :class:`~src.meta_services.client.MetaModelClient` under an
    ``asyncio.Semaphore`` (default 4) and returns one outcome record per
    tile (``tile_index``, ``detections``, ``status``, ``review_required``).
    Infrastructure failures surface as ``INFERENCE_FAILED`` /
    ``PARSE_FAILED`` records -- never as a silent ``[]``.
  - :func:`parse_tile_detections` strictly validates model JSON into
    ``{symbol_label, tile_bbox, confidence}`` dicts, rejecting malformed
    entries instead of fabricating defaults. When ``allowed_labels`` is
    given (the exemplar label set, passed by :func:`run_swarm`), labels
    outside the set are REJECTED (dropped), never kept-plus-flagged: an
    invented label is not evidence and must not reach the ledger even as
    "reviewable".

SYM-004 (this module, part 2):
  - :func:`verify_borderline` re-checks borderline candidates
    (``0.70 <= confidence < 0.90``) against their legend exemplar with a
    second ``muse-spark-1.3`` call. A disconfirmed candidate is demoted to
    ``confidence = 0.20`` with ``review_required = True``.

Tile/detection contract (shared with ``src/meta_services/tiling.py`` SYM-001
/ SYM-003):
  - Tiles: ``Tile.to_dict()`` keys (``col``, ``row``, ``x_offset_px``,
    ``y_offset_px``, ``status``) plus a ``tile_png_bytes`` (or
    ``tile_png_base64``) raster attached by the caller. ``status == "EMPTY"``
    tiles bypass model inference.
  - Detections: ``tile_bbox`` is ``[u1, v1, u2, v2]`` NORMALIZED to
    ``[0, 1000]`` relative to the 1024px tile image, matching
    ``SymbolCandidate`` / ``untile_candidate`` (``X_sheet = X_offset + u *
    1.024``). Enriched swarm outputs also carry ``tile_col``/``tile_row``
    passthrough when the input tile provides them.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import re
from typing import Any

from src.meta_services.client import PROFILE_SCHEDULE_EXTRACTION

logger = logging.getLogger(__name__)

TILE_NORM = 1000.0
BORDERLINE_LOW = 0.70
BORDERLINE_HIGH = 0.90
DEMOTED_CONFIDENCE = 0.20
VERIFIER_MODEL = "muse-spark-1.3"


def _coerce_b64_png(image: bytes | str) -> str:
    """Return a base64 PNG string for raw bytes or a pass-through base64 string."""
    if isinstance(image, (bytes, bytearray)):
        return base64.b64encode(bytes(image)).decode("ascii")
    text = str(image).strip()
    if text.startswith("data:image"):
        marker = "base64,"
        idx = text.find(marker)
        if idx != -1:
            return text[idx + len(marker):]
    return text


def _exemplar_label(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("label") or item.get("symbol_label") or "")
    return str(getattr(item, "label", "") or "")


def _exemplar_crop(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("exemplar_crop_base64", "exemplar_crop", "crop_base64"):
            val = item.get(key)
            if val:
                return _coerce_b64_png(val)
        return ""
    return _coerce_b64_png(getattr(item, "exemplar_crop_base64", "") or "")


def build_tile_prompt(
    tile_png_bytes: bytes | str,
    exemplars: list[Any],
) -> list[dict[str, Any]]:
    """Build a multi-image chat message pairing a sheet tile with legend exemplars.

    Args:
        tile_png_bytes: Raw PNG bytes (or base64 string) of the 1024px sheet tile.
        exemplars: Legend entries (``LegendSymbolEntry`` or dicts) carrying
            ``label`` and ``exemplar_crop_base64`` (150 DPI glyph rasters from
            ``legend_scanner`` -- reused, never rebuilt here).

    Returns:
        OpenAI-style ``messages`` list ready for
        ``MetaModelClient._execute_governed_completion``: one text part
        followed by one ``image_url`` part per exemplar, then the tile image.
    """
    labels = [_exemplar_label(e) for e in exemplars]
    labels = [lbl for lbl in labels if lbl]
    label_list = ", ".join(f'"{lbl}"' for lbl in labels) if labels else '"UNKNOWN"'

    prompt = (
        "You are muse-spark-1.3, an expert vision AI for MEP blueprint symbol detection. "
        "The FIRST images are legend exemplar glyphs (one per known symbol). "
        "The LAST image is a 1024x1024 px sheet tile to inspect.\n"
        f"Known symbol labels: [{label_list}].\n"
        "Locate every instance in the tile that visually matches one of the exemplar glyphs. "
        "Return a strict JSON object with this schema:\n"
        '{"detections": ['
        '{"symbol_label": "SD", "tile_bbox": [u1, v1, u2, v2], "confidence": 0.95}'
        "]}\n"
        "INVARIANTS:\n"
        "1. tile_bbox coordinates are NORMALIZED integers in [0, 1000] relative to "
        "this tile image: [u1, v1] is the top-left corner, [u2, v2] the "
        "bottom-right (u1 < u2, v1 < v2).\n"
        "2. symbol_label MUST be exactly one of the known labels above -- never invent labels.\n"
        "3. confidence is a float in [0.0, 1.0] reflecting glyph match quality.\n"
        "4. If no exemplars match anything in the tile, return {\"detections\": []}.\n"
        "5. Only return valid JSON."
    )

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for item in exemplars:
        crop_b64 = _exemplar_crop(item)
        if not crop_b64:
            continue
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{crop_b64}"},
            }
        )
    tile_b64 = _coerce_b64_png(tile_png_bytes)
    content.append(
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{tile_b64}"},
        }
    )
    return [{"role": "user", "content": content}]


def _strip_code_fences(raw: str) -> str:
    clean = raw.strip()
    if "```" in clean:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", clean, re.DOTALL)
        if match:
            return match.group(1).strip()
    if "{" in clean and "}" in clean:
        return clean[clean.find("{"): clean.rfind("}") + 1].strip()
    return clean


def parse_tile_detections(
    raw_json: str | bytes | None,
    allowed_labels: set[str] | frozenset[str] | list[str] | tuple[str, ...] | None = None,
) -> list[dict[str, Any]]:
    """Strictly parse model JSON into detection dicts.

    Returns ``[{symbol_label, tile_bbox: [u1, v1, u2, v2], confidence}]``
    with ``tile_bbox`` normalized to ``[0, 1000]`` (the ``tiling.py``
    ``SymbolCandidate`` contract). Malformed entries are rejected (never
    defaulted); unparseable top-level JSON yields ``[]`` so callers can flag
    ``review_required`` instead of inventing detections.

    Args:
        allowed_labels: Optional exemplar label allowlist. When given, any
            entry whose ``symbol_label`` is not in the set is REJECTED
            (dropped, not kept-plus-flagged): the model must never invent
            labels, and an invented label carries no measurement to review.
            ``None`` preserves the legacy behavior (no allowlist filtering).
    """
    if raw_json is None:
        return []
    if isinstance(raw_json, (bytes, bytearray)):
        try:
            raw_json = bytes(raw_json).decode("utf-8", errors="strict")
        except (UnicodeDecodeError, ValueError):
            return []
    if not isinstance(raw_json, str) or not raw_json.strip():
        return []

    allowed: set[str] | None = set(allowed_labels) if allowed_labels is not None else None

    try:
        data = json.loads(_strip_code_fences(raw_json))
    except (json.JSONDecodeError, ValueError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    raw_dets = data.get("detections")
    if not isinstance(raw_dets, list):
        return []

    parsed: list[dict[str, Any]] = []
    for entry in raw_dets:
        if not isinstance(entry, dict):
            continue
        label = entry.get("symbol_label")
        if not isinstance(label, str) or not label.strip():
            continue
        label = label.strip()
        if allowed is not None and label not in allowed:
            continue
        bbox = entry.get("tile_bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            continue
        try:
            coords = [float(v) for v in bbox]
        except (ValueError, TypeError):
            continue
        if any(not math.isfinite(v) for v in coords):
            continue
        u1, v1, u2, v2 = coords
        if not all(0.0 <= v <= TILE_NORM for v in coords):
            continue
        if not (u1 < u2 and v1 < v2):
            continue
        try:
            conf = float(entry.get("confidence"))
        except (ValueError, TypeError):
            continue
        if not math.isfinite(conf) or not 0.0 <= conf <= 1.0:
            continue
        parsed.append(
            {
                "symbol_label": label,
                "tile_bbox": [u1, v1, u2, v2],
                "confidence": conf,
            }
        )
    return parsed


def _raw_holds_detection_list(raw_content: str | None) -> bool:
    """True when ``raw_content`` decodes to a JSON object with a ``detections`` list.

    Distinguishes a legitimate model verdict of "nothing here" (``{"detections":
    []}`` -> OK, empty) from transport garbage (``PARSE_FAILED``). Only the
    top-level shape is checked; entry-level strictness stays in
    :func:`parse_tile_detections`.
    """
    if not isinstance(raw_content, str) or not raw_content.strip():
        return False
    try:
        data = json.loads(_strip_code_fences(raw_content))
    except (json.JSONDecodeError, ValueError, TypeError):
        return False
    return isinstance(data, dict) and isinstance(data.get("detections"), list)


def _require_tile_offsets(tile: dict[str, Any]) -> tuple[float, float]:
    """Return ``(x_offset_px, y_offset_px)``; raise ``ValueError`` when missing.

    Offsets have no safe default: silently defaulting to ``0.0`` would place
    every detection at the sheet origin. Callers must supply real offsets
    (``tiles_to_swarm_input`` always carries them from ``Tile``).
    """
    for key in ("x_offset_px", "y_offset_px"):
        if tile.get(key) is None:
            raise ValueError(f"NO_OFFSETS: tile {tile.get('tile_index', '?')} lacks {key!r}")
    try:
        x_off = float(tile["x_offset_px"])
        y_off = float(tile["y_offset_px"])
    except (ValueError, TypeError) as exc:
        raise ValueError(f"NO_OFFSETS: tile offsets must be numeric: {exc}") from exc
    if not math.isfinite(x_off) or not math.isfinite(y_off):
        raise ValueError(f"NO_OFFSETS: tile offsets must be finite, got {(x_off, y_off)!r}")
    return x_off, y_off


def _outcome(
    tile: dict[str, Any],
    tile_index: int,
    status: str,
    detections: list[dict[str, Any]],
    review_required: bool,
    error: str | None = None,
) -> dict[str, Any]:
    """Build one per-tile outcome record (the :func:`run_swarm` unit of return)."""
    record: dict[str, Any] = {
        "tile_index": tile_index,
        "tile_col": tile.get("col", -1),
        "tile_row": tile.get("row", -1),
        "status": status,
        "detections": detections,
        "review_required": review_required,
    }
    if tile.get("x_offset_px") is not None:
        record["x_offset_px"] = tile.get("x_offset_px")
    if tile.get("y_offset_px") is not None:
        record["y_offset_px"] = tile.get("y_offset_px")
    if error:
        record["error"] = error
    return record


async def _infer_single_tile(
    tile: dict[str, Any],
    exemplars: list[Any],
    client: Any,
    semaphore: asyncio.Semaphore,
    allowed_labels: set[str] | None = None,
) -> dict[str, Any]:
    """Infer one tile; ALWAYS return an outcome record, never raise or return bare ``[]``.

    Outcomes: ``OK`` (detections may legitimately be empty), ``INFERENCE_FAILED``
    (missing raster or model-call exception), ``PARSE_FAILED`` (unparseable model
    JSON). Failures carry ``review_required=True``. Missing offsets raise
    ``ValueError`` (no safe default exists); :func:`run_swarm` converts that --
    like any other unexpected per-tile exception -- into an ``INFERENCE_FAILED``
    record so one bad tile never kills the swarm.
    """
    tile_index = tile.get("tile_index", tile.get("row", 0) * 1000 + tile.get("col", -1))
    x_off, y_off = _require_tile_offsets(tile)
    image = tile.get("tile_png_bytes", tile.get("tile_png_base64", b""))
    if not image:
        logger.warning("Tile %s carries no raster; flagging INFERENCE_FAILED.", tile_index)
        return _outcome(
            tile, tile_index, "INFERENCE_FAILED", [], True, error="NO_RASTER: no image bytes"
        )
    messages = build_tile_prompt(image, exemplars)
    async with semaphore:
        try:
            raw_content, _telemetry = await asyncio.to_thread(
                client._execute_governed_completion,
                model=VERIFIER_MODEL,
                messages=messages,
                profile=PROFILE_SCHEDULE_EXTRACTION,
                temperature=0.0,
            )
        except Exception as exc:  # noqa: BLE001 -- fail-closed: one tile failing must not kill the swarm
            logger.warning("Tile %s inference failed (failing closed): %s", tile_index, exc)
            return _outcome(
                tile, tile_index, "INFERENCE_FAILED", [], True, error=f"{type(exc).__name__}"
            )
    raw_text = raw_content if isinstance(raw_content, str) else ""
    dets = parse_tile_detections(raw_text, allowed_labels=allowed_labels)
    if not dets and not _raw_holds_detection_list(raw_text):
        return _outcome(
            tile, tile_index, "PARSE_FAILED", [], True, error="UNPARSEABLE_MODEL_JSON"
        )
    enriched: list[dict[str, Any]] = []
    for det in dets:
        enriched.append(
            {
                **det,
                "tile_index": tile.get("tile_index", -1),
                "tile_col": tile.get("col", -1),
                "tile_row": tile.get("row", -1),
                "x_offset_px": x_off,
                "y_offset_px": y_off,
                "review_required": False,
            }
        )
    return _outcome(tile, tile_index, "OK", enriched, False)


def _exemplar_label_set(exemplars: list[Any]) -> set[str]:
    """Collect the non-empty exemplar labels forming the parser allowlist."""
    return {lbl for lbl in (_exemplar_label(e) for e in exemplars) if lbl}


async def run_swarm(
    tiles: list[dict[str, Any]],
    exemplars: list[Any],
    client: Any,
    max_concurrency: int = 4,
) -> list[dict[str, Any]]:
    """Dispatch non-empty tiles to ``muse-spark-1.3`` under bounded concurrency.

    Tiles carry the ``Tile.to_dict()`` keys (``col``, ``row``,
    ``x_offset_px``, ``y_offset_px``, ``status`` -- see
    ``tiling.tiles_to_swarm_input``) plus a ``tile_png_bytes`` (or
    ``tile_png_base64``) raster. Tiles with ``status == "EMPTY"`` bypass
    model inference and surface as ``EMPTY`` outcome records.

    Exemplars are REQUIRED whenever any tile needs inference: without a
    legend there is no label vocabulary, so ``ValueError("NO_EXEMPLARS ...")``
    is raised instead of returning ``[]`` (an empty list would be
    indistinguishable from "nothing detected"). An input with no inferable
    tiles at all (every tile ``EMPTY``) legitimately returns ``[]``.

    Returns:
        One outcome record per input tile (EMPTY tiles included when at
        least one tile needed inference)::

            {"tile_index", "tile_col", "tile_row", "status", "detections",
             "review_required", ...}

        ``status`` is ``OK`` | ``EMPTY`` | ``INFERENCE_FAILED`` |
        ``PARSE_FAILED``; failures carry ``review_required=True``. Use
        :func:`swarm_outcomes_to_detections` for the flat candidate list.
    """
    active = [t for t in tiles if t.get("status", "CONTENT") != "EMPTY"]
    if not active:
        return []
    if not exemplars:
        raise ValueError(
            f"NO_EXEMPLARS: {len(active)} tile(s) need inference but no legend exemplars "
            "were supplied; refusing to return a silent empty result."
        )
    allowed = _exemplar_label_set(exemplars)
    semaphore = asyncio.Semaphore(max(1, int(max_concurrency)))
    results = await asyncio.gather(
        *(_infer_single_tile(t, exemplars, client, semaphore, allowed) for t in active),
        return_exceptions=True,
    )
    result_by_id = {id(tile): res for tile, res in zip(active, results)}
    outcomes: list[dict[str, Any]] = []
    for tile in tiles:
        if tile.get("status", "CONTENT") == "EMPTY":
            tile_index = tile.get(
                "tile_index", tile.get("row", 0) * 1000 + tile.get("col", -1)
            )
            outcomes.append(_outcome(tile, tile_index, "EMPTY", [], False))
            continue
        res = result_by_id[id(tile)]
        if isinstance(res, BaseException):
            if isinstance(res, asyncio.CancelledError):
                raise res
            logger.warning("Tile inference raised (failing closed): %s", res)
            tile_index = tile.get(
                "tile_index", tile.get("row", 0) * 1000 + tile.get("col", -1)
            )
            outcomes.append(
                _outcome(
                    tile,
                    tile_index,
                    "INFERENCE_FAILED",
                    [],
                    True,
                    error=f"{type(res).__name__}: {res}",
                )
            )
        else:
            outcomes.append(res)
    return outcomes


def swarm_outcomes_to_detections(outcomes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten swarm outcome records to the legacy flat candidate list.

    Backward-compatibility helper: concatenates the ``detections`` of every
    ``OK`` record in order. ``EMPTY`` / failed tiles contribute nothing --
    inspect the outcome records themselves (never this flat list) to tell
    "nothing detected" apart from "inference failed".
    """
    flat: list[dict[str, Any]] = []
    for outcome in outcomes:
        if outcome.get("status") == "OK":
            flat.extend(outcome.get("detections") or [])
    return flat


def _candidate_label(candidate: dict[str, Any]) -> str:
    label = candidate.get("symbol_label", candidate.get("label", ""))
    return str(label or "").strip()


def _candidate_confidence(candidate: dict[str, Any]) -> float | None:
    try:
        conf = float(candidate.get("confidence"))
    except (ValueError, TypeError):
        return None
    if not math.isfinite(conf):
        return None
    return conf


def build_verifier_prompt(label: str) -> str:
    """Return the SYM-004 borderline adjudication prompt for a symbol label."""
    return (
        f'Does this candidate match the exemplar glyph for "{label}"? '
        'Response JSON: {"match": bool, "confidence": float}'
    )


def _parse_verdict(raw_content: str | None) -> tuple[bool | None, float | None]:
    """Parse a verifier verdict; (None, None) on any unparseable content."""
    if not isinstance(raw_content, str) or not raw_content.strip():
        return None, None
    try:
        data = json.loads(_strip_code_fences(raw_content))
    except (json.JSONDecodeError, ValueError, TypeError):
        return None, None
    if not isinstance(data, dict) or "match" not in data:
        return None, None
    match_raw = data["match"]
    if isinstance(match_raw, bool):
        match = match_raw
    elif isinstance(match_raw, (int, float)) and match_raw in (0, 1):
        match = bool(match_raw)
    elif isinstance(match_raw, str) and match_raw.strip().lower() in ("true", "false"):
        match = match_raw.strip().lower() == "true"
    else:
        return None, None
    conf: float | None = None
    if data.get("confidence") is not None:
        try:
            conf = float(data["confidence"])
        except (ValueError, TypeError):
            conf = None
        if conf is not None and (not math.isfinite(conf) or not 0.0 <= conf <= 1.0):
            conf = None
    return match, conf


def verify_borderline(
    candidates: list[dict[str, Any]],
    client: Any,
    crop_fn: Any,
) -> list[dict[str, Any]]:
    """Adjudicate borderline candidates against their legend exemplar.

    Only candidates with ``0.70 <= confidence < 0.90`` are re-checked:
    ``crop_fn(candidate)`` must return the 300x300 px candidate crop (PNG
    bytes or base64). The crop plus the prompt from
    :func:`build_verifier_prompt` go to ``muse-spark-1.3``.

    Outcomes (fail-closed, escalate-only -- this pass may SET
    ``review_required`` but never CLEAR it):
      - Verdict ``match=true``: candidate kept (original confidence retained),
        pre-existing ``review_required`` PRESERVED (never cleared).
      - Verdict ``match=false``: demoted to ``confidence=0.20``,
        ``review_required=True``.
      - Missing/unparseable confidence, missing crop, client error, or
        unparseable verdict JSON: ``review_required=True``, confidence left
        untouched (never fabricated).

    Non-borderline candidates pass through unchanged. Returns a new list.
    """
    adjudicated: list[dict[str, Any]] = []
    for candidate in candidates:
        updated = dict(candidate)
        conf = _candidate_confidence(candidate)
        label = _candidate_label(candidate)
        if conf is None:
            # No measurable confidence: escalate, never pass through silently.
            updated["review_required"] = True
            adjudicated.append(updated)
            continue
        if not (BORDERLINE_LOW <= conf < BORDERLINE_HIGH) or not label:
            adjudicated.append(updated)
            continue

        try:
            crop = crop_fn(candidate)
        except Exception as exc:  # noqa: BLE001 -- fail-closed boundary
            logger.warning("Crop extraction failed for %s (failing closed): %s", label, exc)
            crop = None
        crop_b64 = _coerce_b64_png(crop) if crop else ""
        if not crop_b64:
            updated["review_required"] = True
            adjudicated.append(updated)
            continue

        exemplar_b64 = ""
        for key in ("exemplar_crop_base64", "exemplar_crop", "exemplar"):
            if candidate.get(key):
                exemplar_b64 = _coerce_b64_png(candidate[key])
                break

        content: list[dict[str, Any]] = [
            {"type": "text", "text": build_verifier_prompt(label)}
        ]
        if exemplar_b64:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{exemplar_b64}"},
                }
            )
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{crop_b64}"},
            }
        )
        messages = [{"role": "user", "content": content}]

        try:
            raw_content, _telemetry = client._execute_governed_completion(
                model=VERIFIER_MODEL,
                messages=messages,
                profile=PROFILE_SCHEDULE_EXTRACTION,
                temperature=0.0,
            )
        except Exception as exc:  # noqa: BLE001 -- fail-closed boundary
            logger.warning("Verifier call failed for %s (failing closed): %s", label, exc)
            updated["review_required"] = True
            adjudicated.append(updated)
            continue

        match, _verdict_conf = _parse_verdict(raw_content)
        if match is None:
            updated["review_required"] = True
        elif match is False:
            updated["confidence"] = DEMOTED_CONFIDENCE
            updated["review_required"] = True
        else:
            # match=True: PRESERVE the pre-existing flag (escalate-only: this
            # pass must never clear a review_required set upstream). Default
            # to False only when no flag was present.
            updated["review_required"] = bool(updated.get("review_required", False))
        adjudicated.append(updated)
    return adjudicated
