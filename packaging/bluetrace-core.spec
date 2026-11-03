# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller --onedir build specification for the BlueTrace-AI Python sidecar.

Compiles FastAPI backend, PyMuPDF vector engine, and SQLite WAL store into a
standalone directory (`dist/bluetrace-core/`) with < 0.5s cold start and
< 150 MB uncompressed footprint (~115 MB target).
"""

from pathlib import Path

block_cipher = None

PROJECT_ROOT = Path(SPECPATH).resolve().parent
ENTRYPOINT = str(PROJECT_ROOT / "src" / "api" / "main.py")
CONFIGS_DIR = str(PROJECT_ROOT / "configs")

HIDDEN_IMPORTS = [
    "pymupdf",
    "fitz",
    "aiosqlite",
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "pydantic",
    "networkx",
    "shapely",
    "shapely.geometry",
    "httpx",
]

EXCLUDED_MODULES = [
    "pytest",
    "_pytest",
    "mypy",
    "ruff",
    "tkinter",
    "_tkinter",
    "matplotlib",
    "scipy",
    "pandas",
    "IPython",
    "notebook",
    "doctest",
    "pdb",
]

a = Analysis(
    [ENTRYPOINT],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=[
        (CONFIGS_DIR, "configs"),
    ],
    hiddenimports=HIDDEN_IMPORTS,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDED_MODULES,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

# Configured for --onedir (exclude_binaries=True) and --windowed (console=False)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="bluetrace-core",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="x86_64",
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="bluetrace-core",
)
