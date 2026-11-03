"""Tests for Native Desktop Packaging, Sidecar Supervisor, and Installer Manifests.

Covers:
- PyInstaller `--onedir` sidecar build recipe & `scripts/build_sidecar.py --dry-run`
- Tauri v2 desktop shell initialization & WebView2 configuration (`src-tauri/`)
- Windows Job Object process supervisor & ephemeral port handshake (`supervisor.rs`)
- Windows NSIS installer script, Ed25519 updater & `scripts/validate_packaging_manifest.py`
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from scripts.build_sidecar import (
    REQUIRED_EXCLUSIONS,
    REQUIRED_HIDDEN_IMPORTS,
    SPEC_PATH,
    parse_spec_metadata,
    validate_sidecar_recipe,
)
from scripts.validate_packaging_manifest import (
    CARGO_TOML_PATH,
    MAX_INSTALLED_FOOTPRINT_MB,
    NSIS_PATH,
    SUPERVISOR_RS_PATH,
    TAURI_CONF_PATH,
    UPDATER_RS_PATH,
    WEBVIEW2_CLIENT_GUID,
    validate_all_packaging_manifests,
    validate_cargo_manifest,
    validate_nsis_installer,
    validate_supervisor_source,
    validate_tauri_config,
    validate_updater_source,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_sidecar_spec_syntax_and_onedir_invariants() -> None:
    """`packaging/bluetrace-core.spec` parses cleanly and enforces --onedir --windowed."""
    meta = parse_spec_metadata(SPEC_PATH)
    assert meta["syntax_valid"] is True
    assert meta["onedir_mode"] is True
    assert meta["windowed_mode"] is True
    assert meta["exe_name"] == "bluetrace-core"
    assert meta["collect_name"] == "bluetrace-core"
    assert meta["bundles_configs"] is True

    for mod in REQUIRED_HIDDEN_IMPORTS:
        assert mod in meta["hidden_imports"], f"Missing hidden import: {mod}"

    for excl in REQUIRED_EXCLUSIONS:
        assert excl in meta["excluded_modules"], f"Missing test exclusion: {excl}"


def test_build_sidecar_dry_run_cli_and_latency() -> None:
    """`python scripts/build_sidecar.py --dry-run` succeeds in < 4.0s."""
    t0 = time.perf_counter()
    res = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "scripts" / "build_sidecar.py"), "--dry-run"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed = time.perf_counter() - t0
    assert res.returncode == 0, f"Dry-run failed: {res.stderr}\n{res.stdout}"
    assert elapsed < 4.0, f"Dry-run exceeded 4.0s budget: {elapsed:.2f}s"

    payload = json.loads(res.stdout)
    assert payload["valid"] is True
    assert payload["onedir_mode"] is True
    assert payload["windowed_mode"] is True
    assert payload["configs_bundled"] is True
    assert payload["estimated_footprint_mb"] < payload["max_budget_mb"]
    assert all(payload["hidden_imports_verified"].values())


def test_tauri_config_and_cargo_manifest() -> None:
    """`src-tauri/tauri.conf.json` and `Cargo.toml` meet workstation & WebView2 specs."""
    assert validate_tauri_config(TAURI_CONF_PATH) == []
    assert validate_cargo_manifest(CARGO_TOML_PATH) == []

    tauri_conf = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    win = tauri_conf["app"]["windows"][0]
    assert win["title"] == "BlueTrace AI - MEP Estimating Workstation"
    assert (win["width"], win["height"]) == (1440, 900)
    assert (win["minWidth"], win["minHeight"]) == (1024, 768)
    assert tauri_conf["build"]["frontendDist"] == "../frontend/dist"


def test_windows_job_object_supervisor_and_ephemeral_ipc() -> None:
    """`src-tauri/src/supervisor.rs` enforces Job Object kill-on-close & READY handshake."""
    assert validate_supervisor_source(SUPERVISOR_RS_PATH) == []

    source = SUPERVISOR_RS_PATH.read_text(encoding="utf-8")
    assert "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE" in source
    assert "CreateJobObjectW" in source
    assert "SetInformationJobObject" in source
    assert "AssignProcessToJobObject" in source
    assert "window.__BLUETRACE_CONFIG__" in source
    assert "0x0000_2000" in source


def test_nsis_installer_and_ed25519_updater() -> None:
    """`packaging/installer.nsi` and `updater.rs` enforce LZMA, WebView2, and data safety."""
    assert validate_updater_source(UPDATER_RS_PATH) == []
    assert validate_nsis_installer(NSIS_PATH) == []

    nsis_text = NSIS_PATH.read_text(encoding="utf-8")
    assert "SetCompressor /SOLID lzma" in nsis_text
    assert WEBVIEW2_CLIENT_GUID in nsis_text
    assert "$LOCALAPPDATA\\BlueTraceAI\\data" in nsis_text


def test_validate_packaging_manifest_cli_and_negative_detection(tmp_path: Path) -> None:
    """`python scripts/validate_packaging_manifest.py` runs in < 2.5s and catches tamper."""
    t0 = time.perf_counter()
    res = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "scripts" / "validate_packaging_manifest.py")],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed = time.perf_counter() - t0
    assert res.returncode == 0, f"Manifest validation failed: {res.stderr}\n{res.stdout}"
    assert elapsed < 2.5, f"Validation exceeded 2.5s budget: {elapsed:.2f}s"

    report = validate_all_packaging_manifests()
    assert report["valid"] is True
    assert report["installed_footprint_mb"] < MAX_INSTALLED_FOOTPRINT_MB
    assert report["ed25519_updater_verified"] is True
    assert report["job_object_supervisor_verified"] is True
    assert report["sidecar_recipe_valid"] is True

    # Negative check: tampered tauri.conf.json with insecure HTTP updater endpoint must fail
    bad_conf = tmp_path / "tauri.conf.json"
    bad_data = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    bad_data["plugins"]["updater"]["endpoints"] = ["http://insecure.bluetrace.ai/update.json"]
    bad_conf.write_text(json.dumps(bad_data), encoding="utf-8")
    errs = validate_tauri_config(bad_conf)
    assert any("HTTPS" in e for e in errs)

    # Negative check: spec missing required hidden import must fail
    bad_spec = tmp_path / "bad.spec"
    bad_spec.write_text("x = 1\n", encoding="utf-8")
    bad_recipe = validate_sidecar_recipe(bad_spec)
    assert bad_recipe["valid"] is False
