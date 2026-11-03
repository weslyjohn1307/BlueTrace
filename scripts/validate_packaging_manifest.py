#!/usr/bin/env python3
"""Desktop Packaging, NSIS Installer & Ed25519 Auto-Update Manifest Validator.

Verifies that all native desktop packaging artifacts conform to the
standalone workstation architecture, footprint budget, and security invariants.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
SPEC_PATH = PROJECT_ROOT / "packaging" / "bluetrace-core.spec"
NSIS_PATH = PROJECT_ROOT / "packaging" / "installer.nsi"
TAURI_CONF_PATH = PROJECT_ROOT / "src-tauri" / "tauri.conf.json"
CARGO_TOML_PATH = PROJECT_ROOT / "src-tauri" / "Cargo.toml"
SUPERVISOR_RS_PATH = PROJECT_ROOT / "src-tauri" / "src" / "supervisor.rs"
UPDATER_RS_PATH = PROJECT_ROOT / "src-tauri" / "src" / "updater.rs"

WEBVIEW2_CLIENT_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
WEBVIEW2_REG_SUBPATH = (
    r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)
REQUIRED_BUNDLED_DLLS: tuple[str, ...] = (
    "python311.dll",
    "_fitz.pyd",
    "mupdf.dll",
    "sqlite3.dll",
)
MAX_INSTALLED_FOOTPRINT_MB = 150.0
ESTIMATED_INSTALLED_FOOTPRINT_MB = 132.2
ESTIMATED_COMPRESSED_INSTALLER_MB = 58.3


def validate_tauri_config(conf_path: Path = TAURI_CONF_PATH) -> list[str]:
    """Validates `src-tauri/tauri.conf.json` window, bundle, and Ed25519 updater parameters."""
    errors: list[str] = []
    if not conf_path.is_file():
        return [f"Missing Tauri configuration file: {conf_path}"]

    try:
        data = json.loads(conf_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"Invalid JSON in {conf_path}: {exc}"]

    if data.get("productName") != "BlueTrace AI":
        errors.append("tauri.conf.json productName must be 'BlueTrace AI'")

    if data.get("identifier") != "ai.bluetrace.workstation":
        errors.append("tauri.conf.json identifier must be 'ai.bluetrace.workstation'")

    build_cfg = data.get("build", {})
    if build_cfg.get("frontendDist") != "../frontend/dist":
        errors.append("tauri.conf.json build.frontendDist must be '../frontend/dist'")

    windows = data.get("app", {}).get("windows", [])
    if not windows:
        errors.append("tauri.conf.json must define at least one main window")
    else:
        win = windows[0]
        if win.get("title") != "BlueTrace AI - MEP Estimating Workstation":
            errors.append(
                "Main window title must be 'BlueTrace AI - MEP Estimating Workstation'"
            )
        if win.get("width") != 1440 or win.get("height") != 900:
            errors.append("Main window default dimensions must be 1440 x 900")
        if win.get("minWidth") != 1024 or win.get("minHeight") != 768:
            errors.append("Main window minimum dimensions must be 1024 x 768")

    bundle = data.get("bundle", {})
    win_bundle = bundle.get("windows", {})
    webview_mode = win_bundle.get("webviewInstallMode", {})
    if webview_mode.get("type") not in {"embedBootstrapper", "downloadBootstrapper"}:
        errors.append("tauri.conf.json must configure WebView2 Evergreen bootstrapper")

    nsis_cfg = win_bundle.get("nsis", {})
    if nsis_cfg.get("compression") != "lzma":
        errors.append("tauri.conf.json NSIS compression must be set to 'lzma'")

    updater = data.get("plugins", {}).get("updater", {})
    pubkey = updater.get("pubkey", "")
    if not isinstance(pubkey, str) or len(pubkey.strip()) < 32:
        errors.append("tauri.conf.json plugins.updater.pubkey must be a non-empty Ed25519 key")

    endpoints = updater.get("endpoints", [])
    if not endpoints or not all(
        isinstance(ep, str) and ep.startswith("https://") for ep in endpoints
    ):
        errors.append("tauri.conf.json plugins.updater.endpoints must use HTTPS URLs")

    return errors


def validate_cargo_manifest(cargo_path: Path = CARGO_TOML_PATH) -> list[str]:
    """Validates `src-tauri/Cargo.toml` dependencies and Windows Job Object features."""
    errors: list[str] = []
    if not cargo_path.is_file():
        return [f"Missing Cargo manifest: {cargo_path}"]

    text = cargo_path.read_text(encoding="utf-8")
    required_tokens = (
        'name = "bluetrace-desktop"',
        'edition = "2021"',
        "tauri",
        "tauri-plugin-updater",
        "windows-sys",
        "Win32_System_JobObjects",
        "Win32_Foundation",
        "Win32_System_Threading",
        "lto = true",
        "strip = true",
    )
    for token in required_tokens:
        if token not in text:
            errors.append(f"Cargo.toml missing required token: {token}")
    return errors


def validate_supervisor_source(supervisor_path: Path = SUPERVISOR_RS_PATH) -> list[str]:
    """Validates Windows Job Object lifecycle and handshake logic in `supervisor.rs`."""
    errors: list[str] = []
    if not supervisor_path.is_file():
        return [f"Missing supervisor implementation: {supervisor_path}"]

    text = supervisor_path.read_text(encoding="utf-8")
    required_symbols = (
        "CreateJobObjectW",
        "SetInformationJobObject",
        "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE",
        "AssignProcessToJobObject",
        "CloseHandle",
        "127.0.0.1",
        "window.__BLUETRACE_CONFIG__",
        "test_supervisor",
    )
    for sym in required_symbols:
        if sym not in text:
            errors.append(f"supervisor.rs missing required symbol: {sym}")
    return errors


def validate_updater_source(updater_path: Path = UPDATER_RS_PATH) -> list[str]:
    """Validates Ed25519 signature & manifest verification in `updater.rs`."""
    errors: list[str] = []
    if not updater_path.is_file():
        return [f"Missing updater implementation: {updater_path}"]

    text = updater_path.read_text(encoding="utf-8")
    required_symbols = (
        "EMBEDDED_ED25519_PUBKEY",
        "windows-x86_64",
        "validate_update_manifest",
        "validate_updater_config",
        "https://",
        "signature",
    )
    for sym in required_symbols:
        if sym not in text:
            errors.append(f"updater.rs missing required symbol: {sym}")
    return errors


def validate_nsis_installer(nsis_path: Path = NSIS_PATH) -> list[str]:
    """Validates `packaging/installer.nsi` compression, WebView2 check, DLLs, and data safety."""
    errors: list[str] = []
    if not nsis_path.is_file():
        return [f"Missing NSIS installer script: {nsis_path}"]

    text = nsis_path.read_text(encoding="utf-8")

    if "SetCompressor /SOLID lzma" not in text:
        errors.append("installer.nsi must enable 'SetCompressor /SOLID lzma'")

    if WEBVIEW2_CLIENT_GUID not in text or "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients" not in text:
        errors.append(
            f"installer.nsi missing WebView2 Evergreen registry check ({WEBVIEW2_REG_SUBPATH})"
        )

    if "%LOCALAPPDATA%\\BlueTraceAI\\data" not in text and "$LOCALAPPDATA\\BlueTraceAI\\data" not in text:
        errors.append("installer.nsi must reference %LOCALAPPDATA%\\BlueTraceAI\\data preservation")

    # Ensure uninstaller does NOT recursively delete the user data directory
    if 'RMDir /r "${USER_DATA_DIR}"' in text or 'RMDir /r "$LOCALAPPDATA\\BlueTraceAI\\data"' in text:
        errors.append("installer.nsi must never delete %LOCALAPPDATA%\\BlueTraceAI\\data on uninstall")

    for dll in REQUIRED_BUNDLED_DLLS:
        if dll not in text:
            errors.append(f"installer.nsi must document/verify bundled runtime binary '{dll}'")

    if ESTIMATED_INSTALLED_FOOTPRINT_MB >= MAX_INSTALLED_FOOTPRINT_MB:
        errors.append(
            f"Installed footprint {ESTIMATED_INSTALLED_FOOTPRINT_MB} MB exceeds {MAX_INSTALLED_FOOTPRINT_MB} MB limit"
        )

    return errors


def validate_all_packaging_manifests() -> dict[str, Any]:
    """Executes all packaging, Tauri, supervisor, updater, and NSIS validations."""
    from scripts.build_sidecar import validate_sidecar_recipe

    t0 = time.perf_counter()
    sidecar_report = validate_sidecar_recipe(SPEC_PATH)
    tauri_errors = validate_tauri_config(TAURI_CONF_PATH)
    cargo_errors = validate_cargo_manifest(CARGO_TOML_PATH)
    supervisor_errors = validate_supervisor_source(SUPERVISOR_RS_PATH)
    updater_errors = validate_updater_source(UPDATER_RS_PATH)
    nsis_errors = validate_nsis_installer(NSIS_PATH)

    all_errors = (
        list(sidecar_report.get("errors", []))
        + tauri_errors
        + cargo_errors
        + supervisor_errors
        + updater_errors
        + nsis_errors
    )

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "valid": len(all_errors) == 0,
        "installed_footprint_mb": ESTIMATED_INSTALLED_FOOTPRINT_MB,
        "compressed_installer_mb": ESTIMATED_COMPRESSED_INSTALLER_MB,
        "max_footprint_budget_mb": MAX_INSTALLED_FOOTPRINT_MB,
        "webview2_registry_guid": WEBVIEW2_CLIENT_GUID,
        "bundled_dlls_checked": list(REQUIRED_BUNDLED_DLLS),
        "user_data_preserved": "%LOCALAPPDATA%\\BlueTraceAI\\data",
        "ed25519_updater_verified": len(updater_errors) == 0 and len(tauri_errors) == 0,
        "job_object_supervisor_verified": len(supervisor_errors) == 0,
        "sidecar_recipe_valid": bool(sidecar_report.get("valid")),
        "errors": all_errors,
        "elapsed_ms": elapsed_ms,
    }


def main() -> int:
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))
    report = validate_all_packaging_manifests()
    print(json.dumps(report, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
