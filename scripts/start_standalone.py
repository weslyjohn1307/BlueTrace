#!/usr/bin/env python3
"""BlueTraceAI Standalone Application Launcher.

Runs the complete full-stack application (React 19 CAD Workstation + FastAPI Backend)
on a single port (http://127.0.0.1:8000).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "frontend" / "dist"
# Running this file directly puts ``scripts/`` at sys.path[0]. Ensure imports
# such as ``src.api.main`` resolve the same way as ``python -m uvicorn`` from
# the repository root.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def ensure_frontend_built() -> None:
    """Ensures frontend production bundle exists; builds if missing."""
    if not (DIST_DIR / "index.html").exists():
        print("[*] Frontend production build not found in frontend/dist.")
        print("[*] Running 'npm --prefix frontend run build'...")
        cmd = ["npm", "--prefix", str(ROOT / "frontend"), "run", "build"]
        res = subprocess.run(cmd, check=False)
        if res.returncode != 0:
            print("[!] Warning: Frontend build failed. Serving API only.", file=sys.stderr)
        else:
            print("[+] Frontend build completed successfully.")


def main() -> None:
    ensure_frontend_built()

    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")

    print("\n" + "=" * 60)
    print("  BlueTraceAI - Precision Plan Takeoff & Drawing Review")
    print(f"  Standalone App Running at: http://{host}:{port}/")
    print(f"  Interactive API Docs:      http://{host}:{port}/docs")
    print("=" * 60 + "\n")

    uvicorn.run("src.api.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
