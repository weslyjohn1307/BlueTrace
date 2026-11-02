"""Active-learning dataset curation with drawing-package holdout splits (TASK-FDBK-004).

Builds versioned JSONL training datasets from ``engineer_feedback_events``
with strict consent and leakage gates:

- Quality gate: only rows with ``training_eligible == 1`` are candidates.
  Phase 2 always writes ``0`` (``record_feedback_event`` hard-codes it
  until a permission/quality adjudication slice exists), so live exports
  are empty by design -- export ``manifest.json`` still records the run.
- Exclusions: demo projects (``demo`` in the project id or name,
  case-insensitive) and ``action == 'CANNOT_DETERMINE'`` rows never ship.
- Drawing-package holdout: entire projects (drawing packages) are assigned
  to either ``train.jsonl`` or ``eval.jsonl`` -- never split across both --
  so adjacent tiles of one package cannot leak between sets (zero bleed).
- Records carry relative image paths only (``crop_relpath``); absolute
  paths or ``..`` segments raise instead of shipping.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import random
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CURATOR_VERSION = "fdbk-004-v1"
TRAIN_FILENAME = "train.jsonl"
EVAL_FILENAME = "eval.jsonl"
MANIFEST_FILENAME = "manifest.json"


def _is_demo_project(project_id: str, project_name: str | None) -> bool:
    """True when the id or display name marks a demo/playground project."""
    return "demo" in str(project_id or "").lower() or (
        project_name is not None and "demo" in str(project_name).lower()
    )


def _require_relpath(value: object, *, field: str) -> str | None:
    """Return a safe relative path string, or None when absent.

    Raises ``ValueError`` when a present path is absolute or escapes its
    directory -- a training record must never point outside the workspace.
    """
    if value is None:
        return None
    text = str(value).strip().replace("\\", "/")
    if not text:
        return None
    candidate = Path(text)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError(f"Refusing non-relative image path in {field}: {text!r}")
    return text


def _parse_json_object(raw: object) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return dict(raw)
    try:
        data = json.loads(str(raw))
    except (ValueError, TypeError):
        return None
    return data if isinstance(data, dict) else None


def _parse_bbox(raw: object) -> list[float] | None:
    if raw is None:
        return None
    try:
        values = [float(v) for v in json.loads(str(raw))]
    except (ValueError, TypeError):
        return None
    if len(values) != 4 or any(not math.isfinite(v) for v in values):
        return None
    return values


class DatasetCurator:
    """Export consented feedback tuples to package-holdout JSONL splits."""

    def __init__(self, *, version: str = CURATOR_VERSION) -> None:
        self.version = version

    def _package_holdout_split(
        self,
        package_ids: list[str],
        *,
        eval_fraction: float,
        seed: int,
    ) -> tuple[set[str], set[str]]:
        """Assign whole packages to train/eval (deterministic, zero bleed)."""
        ordered = sorted(set(package_ids))
        if len(ordered) < 2:
            return set(ordered), set()
        if not 0.0 < eval_fraction < 1.0:
            raise ValueError(f"eval_fraction must lie in (0, 1), got {eval_fraction!r}")
        rng = random.Random(seed)
        shuffled = list(ordered)
        rng.shuffle(shuffled)
        n_eval = min(len(ordered) - 1, max(1, round(len(ordered) * eval_fraction)))
        eval_set = set(shuffled[:n_eval])
        return set(ordered) - eval_set, eval_set

    async def export_dataset(
        self,
        store: Any,
        *,
        out_dir: str | Path,
        eval_fraction: float = 0.2,
        seed: int = 42,
    ) -> dict[str, Any]:
        """Curate eligible feedback rows into train/eval JSONL + manifest.

        Returns a summary dict with split counts and exclusion counters
        (``ineligible_excluded``, ``undetermined_excluded``,
        ``demo_excluded``). Writes ``train.jsonl``, ``eval.jsonl``, and
        ``manifest.json`` into ``out_dir`` (created as needed).
        """
        target = Path(out_dir)
        target.mkdir(parents=True, exist_ok=True)

        projects = {p["project_id"]: p.get("name") for p in await store.list_projects()}
        candidates = await store.list_feedback_events(training_eligible=1)

        kept: list[dict[str, Any]] = []
        undetermined_excluded = 0
        demo_excluded = 0
        for row in candidates:
            action = str(row.get("action", "")).strip().upper()
            if action == "CANNOT_DETERMINE":
                undetermined_excluded += 1
                continue
            project_id = str(row.get("project_id", ""))
            if _is_demo_project(project_id, projects.get(project_id)):
                demo_excluded += 1
                continue
            kept.append(row)

        ineligible_total = len(await store.list_feedback_events()) - len(candidates)

        train_packages, eval_packages = self._package_holdout_split(
            [str(row.get("project_id", "")) for row in kept],
            eval_fraction=eval_fraction,
            seed=seed,
        )

        train_rows: list[dict[str, Any]] = []
        eval_rows: list[dict[str, Any]] = []
        for row in sorted(kept, key=lambda r: str(r.get("feedback_id", ""))):
            record = {
                "feedback_id": row.get("feedback_id"),
                "project_id": row.get("project_id"),
                "sheet_id": row.get("sheet_id"),
                "task_type": row.get("task_type"),
                "action": row.get("action"),
                "previous_status": row.get("previous_status"),
                "new_status": row.get("new_status"),
                "original_output": _parse_json_object(row.get("original_output_json")),
                "corrected_output": _parse_json_object(row.get("corrected_output_json")),
                "correction_reason": row.get("correction_reason"),
                "bbox_pt": _parse_bbox(row.get("bounding_box_pt_json")),
                "crop_relpath": _require_relpath(
                    row.get("crop_storage_relpath"), field="crop_storage_relpath"
                ),
                "model_version": row.get("model_version"),
                "prompt_version": row.get("prompt_version"),
                "training_eligible": 1,
                "curator_version": self.version,
            }
            if str(row.get("project_id", "")) in eval_packages:
                eval_rows.append(record)
            else:
                train_rows.append(record)

        train_path = target / TRAIN_FILENAME
        eval_path = target / EVAL_FILENAME
        train_path.write_text(
            "".join(json.dumps(row) + "\n" for row in train_rows), encoding="utf-8"
        )
        eval_path.write_text(
            "".join(json.dumps(row) + "\n" for row in eval_rows), encoding="utf-8"
        )
        package_assignment = {
            pid: ("eval" if pid in eval_packages else "train")
            for pid in sorted(train_packages | eval_packages)
        }
        fingerprint = hashlib.sha256(
            "".join(
                str(row.get("feedback_id", "")) for row in sorted(
                    kept, key=lambda r: str(r.get("feedback_id", ""))
                )
            ).encode("utf-8")
        ).hexdigest()[:16]
        manifest = {
            "curator_version": self.version,
            "seed": seed,
            "eval_fraction": eval_fraction,
            "train_count": len(train_rows),
            "eval_count": len(eval_rows),
            "eligible_total": len(candidates),
            "ineligible_excluded": ineligible_total,
            "undetermined_excluded": undetermined_excluded,
            "demo_excluded": demo_excluded,
            "package_assignment": package_assignment,
            "dataset_fingerprint": fingerprint,
        }
        (target / MANIFEST_FILENAME).write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
        logger.info(
            "Curated %d train / %d eval rows (%d excluded).",
            len(train_rows),
            len(eval_rows),
            ineligible_total + undetermined_excluded + demo_excluded,
        )
        return manifest
