#!/usr/bin/env python3
"""PyInstaller --onedir Sidecar Build & Dry-Run Verification Script.

Validates the PyInstaller specification (`packaging/bluetrace-core.spec`),
verifies entry point and bundled configuration directories, confirms all
required hidden imports are available in the active Python environment, and
builds `dist/bluetrace-core/` when invoked without `--dry-run`.
"""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SPEC_PATH = PROJECT_ROOT / "packaging" / "bluetrace-core.spec"
ENTRYPOINT_PATH = PROJECT_ROOT / "src" / "api" / "main.py"
CONFIGS_DIR = PROJECT_ROOT / "configs"
DIST_DIR = PROJECT_ROOT / "dist" / "bluetrace-core"

REQUIRED_HIDDEN_IMPORTS: tuple[str, ...] = (
    "pymupdf",
    "aiosqlite",
    "uvicorn",
    "fastapi",
    "pydantic",
    "networkx",
    "shapely",
)

REQUIRED_EXCLUSIONS: tuple[str, ...] = (
    "pytest",
    "mypy",
    "ruff",
)

FOOTPRINT_BUDGET_MB = 150.0
ESTIMATED_ONEDIR_MB = 115.0


def parse_spec_metadata(spec_path: Path) -> dict[str, Any]:
    """Parses the PyInstaller spec file as a Python AST and extracts key constructs."""
    if not spec_path.is_file():
        raise FileNotFoundError(f"Spec file not found: {spec_path}")

    source = spec_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(spec_path))

    call_names: set[str] = set()
    hidden_imports: list[str] = []
    excluded_modules: list[str] = []
    exe_kwargs: dict[str, Any] = {}
    collect_kwargs: dict[str, Any] = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and isinstance(node.value, ast.List):
                    items = [
                        elt.value
                        for elt in node.value.elts
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                    ]
                    if target.id == "HIDDEN_IMPORTS":
                        hidden_imports = items
                    elif target.id == "EXCLUDED_MODULES":
                        excluded_modules = items

        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            func_name = node.func.id
            call_names.add(func_name)
            kwargs = {
                kw.arg: kw.value.value
                for kw in node.keywords
                if kw.arg is not None and isinstance(kw.value, ast.Constant)
            }
            if func_name == "EXE":
                exe_kwargs = kwargs
            elif func_name == "COLLECT":
                collect_kwargs = kwargs

    return {
        "syntax_valid": True,
        "calls": sorted(call_names),
        "hidden_imports": hidden_imports,
        "excluded_modules": excluded_modules,
        "onedir_mode": bool(
            "COLLECT" in call_names and exe_kwargs.get("exclude_binaries") is True
        ),
        "windowed_mode": exe_kwargs.get("console") is False,
        "exe_name": exe_kwargs.get("name"),
        "collect_name": collect_kwargs.get("name"),
        "bundles_configs": "CONFIGS_DIR" in source and '"configs"' in source,
    }


def check_importable_modules(modules: tuple[str, ...]) -> dict[str, bool]:
    """Checks whether each module can be located by Python's import machinery."""
    status: dict[str, bool] = {}
    for mod in modules:
        spec = importlib.util.find_spec(mod)
        if spec is None and mod == "pymupdf":
            spec = importlib.util.find_spec("fitz")
        status[mod] = spec is not None
    return status


def validate_sidecar_recipe(spec_path: Path = SPEC_PATH) -> dict[str, Any]:
    """Runs complete dry-run validation of the PyInstaller sidecar recipe."""
    t0 = time.perf_counter()
    errors: list[str] = []

    try:
        spec_meta = parse_spec_metadata(spec_path)
    except (FileNotFoundError, SyntaxError) as exc:
        return {
            "valid": False,
            "errors": [str(exc)],
            "elapsed_ms": round((time.perf_counter() - t0) * 1000.0, 2),
        }

    required_calls = {"Analysis", "PYZ", "EXE", "COLLECT"}
    missing_calls = required_calls - set(spec_meta["calls"])
    if missing_calls:
        errors.append(f"Spec missing PyInstaller blocks: {sorted(missing_calls)}")

    if not spec_meta["onedir_mode"]:
        errors.append("Spec must configure --onedir mode (COLLECT + exclude_binaries=True)")

    if not spec_meta["windowed_mode"]:
        errors.append("Spec must configure --windowed mode (console=False)")

    if spec_meta["exe_name"] != "bluetrace-core" or spec_meta["collect_name"] != "bluetrace-core":
        errors.append("Spec must emit target name 'bluetrace-core'")

    if not spec_meta["bundles_configs"]:
        errors.append("Spec must bundle 'configs/' directory into datas")

    missing_hidden = [
        mod for mod in REQUIRED_HIDDEN_IMPORTS if mod not in spec_meta["hidden_imports"]
    ]
    if missing_hidden:
        errors.append(f"Spec missing required hidden imports: {missing_hidden}")

    missing_excludes = [
        mod for mod in REQUIRED_EXCLUSIONS if mod not in spec_meta["excluded_modules"]
    ]
    if missing_excludes:
        errors.append(f"Spec missing required test framework exclusions: {missing_excludes}")

    entrypoint_exists = ENTRYPOINT_PATH.is_file()
    if not entrypoint_exists:
        errors.append(f"Entry point missing: {ENTRYPOINT_PATH}")

    configs_exists = CONFIGS_DIR.is_dir() and any(CONFIGS_DIR.iterdir())
    if not configs_exists:
        errors.append(f"Configs directory missing or empty: {CONFIGS_DIR}")

    import_checks = check_importable_modules(REQUIRED_HIDDEN_IMPORTS)
    unimportable = [mod for mod, ok in import_checks.items() if not ok]
    if unimportable:
        errors.append(f"Required hidden imports not installed in environment: {unimportable}")

    rel_spec = (
        str(spec_path.relative_to(PROJECT_ROOT))
        if spec_path.is_relative_to(PROJECT_ROOT)
        else str(spec_path)
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    return {
        "valid": len(errors) == 0,
        "spec_path": rel_spec,
        "entrypoint": str(ENTRYPOINT_PATH.relative_to(PROJECT_ROOT)),
        "entrypoint_exists": entrypoint_exists,
        "configs_dir": str(CONFIGS_DIR.relative_to(PROJECT_ROOT)),
        "configs_bundled": spec_meta["bundles_configs"] and configs_exists,
        "onedir_mode": spec_meta["onedir_mode"],
        "windowed_mode": spec_meta["windowed_mode"],
        "target_output": "dist/bluetrace-core/",
        "estimated_footprint_mb": ESTIMATED_ONEDIR_MB,
        "max_budget_mb": FOOTPRINT_BUDGET_MB,
        "hidden_imports_verified": import_checks,
        "excluded_modules": spec_meta["excluded_modules"],
        "errors": errors,
        "elapsed_ms": elapsed_ms,
    }


def run_build(spec_path: Path = SPEC_PATH) -> int:
    """Executes PyInstaller with the validated spec file."""
    report = validate_sidecar_recipe(spec_path)
    if not report["valid"]:
        print(json.dumps(report, indent=2), file=sys.stderr)
        return 1

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        str(spec_path),
    ]
    proc = subprocess.run(cmd, cwd=str(PROJECT_ROOT), check=False)
    return proc.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build or validate the BlueTrace-AI PyInstaller --onedir sidecar."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate spec syntax, entry points, configs, and hidden imports without freezing.",
    )
    parser.add_argument(
        "--spec",
        type=Path,
        default=SPEC_PATH,
        help="Path to the PyInstaller .spec file.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        report = validate_sidecar_recipe(args.spec.resolve())
        print(json.dumps(report, indent=2))
        return 0 if report["valid"] else 1

    return run_build(args.spec.resolve())


if __name__ == "__main__":
    sys.exit(main())
