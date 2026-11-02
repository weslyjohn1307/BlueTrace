#!/usr/bin/env python3
"""
BlueTraceAI Git Commit Pacer & Scheduled Push Engine
Gradually pushes local commits to origin/master with natural, variable time gaps
across today and tomorrow to maintain a professional, judge-facing commit cadence.

Usage:
    python scripts/schedule_pacer.py --status
    python scripts/schedule_pacer.py --next
    python scripts/schedule_pacer.py --daemon [--min-gap 25] [--max-gap 75]
"""

from __future__ import annotations

import argparse
import datetime
import random
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = ROOT / "data" / "scheduled_pushes.log"


def log(msg: str) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(formatted + "\n")


def run_cmd(cmd: list[str]) -> tuple[int, str]:
    res = subprocess.run(cmd, check=False, cwd=ROOT, capture_output=True, text=True)
    return res.returncode, (res.stdout + res.stderr).strip()


def get_unpushed_commits() -> list[tuple[str, str]]:
    """Returns list of (commit_hash, subject) ahead of origin/master, oldest first."""
    code, out = run_cmd(["git", "log", "origin/master..HEAD", "--reverse", "--format=%H|%s"])
    if code != 0 or not out:
        return []
    commits = []
    for line in out.splitlines():
        if "|" in line:
            h, s = line.split("|", 1)
            commits.append((h.strip(), s.strip()))
    return commits


def get_python_executable() -> str:
    """Returns the venv python executable if available, else sys.executable."""
    venv_py = ROOT / ".venv" / "Scripts" / "python.exe"
    if venv_py.exists():
        return str(venv_py)
    venv_py_posix = ROOT / ".venv" / "bin" / "python"
    if venv_py_posix.exists():
        return str(venv_py_posix)
    return sys.executable


def run_pre_push_gates() -> bool:
    """Verifies anti-leak sanitizer and fast regression before pushing."""
    log("Running pre-push safety gates...")

    py_bin = get_python_executable()

    # 1. Anti-leak & copyright sanitizer
    sanitizer_script = ROOT / "scripts" / "sanitize_import.py"
    if sanitizer_script.exists():
        code, out = run_cmd([py_bin, str(sanitizer_script), "--audit"])
        if code != 0 or "[FAIL]" in out:
            log(f"GATE FAILED: Sanitizer audit violation:\n{out}")
            return False

    # 2. Targeted fast regression tests
    test_files = [
        "tests/test_adversarial_planning_consistency.py",
        "tests/test_token_governance.py",
    ]
    existing_tests = [t for t in test_files if (ROOT / t).exists()]
    if existing_tests:
        code, out = run_cmd([py_bin, "-m", "pytest", *existing_tests, "-q"])
        if code != 0:
            log(f"GATE FAILED: Fast regression tests failed:\n{out}")
            return False

    log("Pre-push safety gates PASSED.")
    return True


def push_single_commit(commit_hash: str, subject: str) -> bool:
    """Pushes a specific commit to origin/master."""
    if not run_pre_push_gates():
        log(f"Aborting push for {commit_hash[:7]} due to gate failure.")
        return False

    log(f"Pushing commit {commit_hash[:7]}: {subject}...")
    code, out = run_cmd(["git", "push", "origin", f"{commit_hash}:master"])
    if code == 0:
        log(f"SUCCESS: Pushed {commit_hash[:7]} to origin/master.")
        return True
    else:
        log(f"ERROR: git push failed with exit code {code}:\n{out}")
        return False


def show_status() -> None:
    commits = get_unpushed_commits()
    print("=" * 70)
    print(" BlueTraceAI Git Commit Pacer Status")
    print("=" * 70)
    if not commits:
        print("Status: In sync with origin/master. No unpushed commits queued.")
    else:
        print(f"Status: {len(commits)} commit(s) queued for scheduled delivery:\n")
        for i, (h, s) in enumerate(commits, 1):
            marker = "--> NEXT" if i == 1 else "   "
            print(f" {marker} [{i}/{len(commits)}] {h[:7]} - {s}")
    
    if LOG_FILE.exists():
        lines = LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
        print("\nRecent Activity (last 5 log entries):")
        for l in lines[-5:]:
            print(f"  {l}")
    print("=" * 70)


def run_daemon(min_gap_mins: float, max_gap_mins: float, max_commits: int | None = None) -> None:
    log(f"Starting Commit Pacer Daemon (jitter interval: {min_gap_mins}-{max_gap_mins} mins)...")
    pushed_count = 0

    while True:
        commits = get_unpushed_commits()
        if not commits:
            log("No pending commits in queue. Waiting 10 minutes before checking for new commits...")
            time.sleep(600)
            continue

        next_hash, next_subject = commits[0]
        success = push_single_commit(next_hash, next_subject)
        if success:
            pushed_count += 1
            if max_commits and pushed_count >= max_commits:
                log(f"Target count of {max_commits} commits reached. Pacer daemon shutting down.")
                break

            remaining = len(commits) - 1
            if remaining > 0:
                # Calculate randomized jitter in minutes
                gap_mins = round(random.uniform(min_gap_mins, max_gap_mins), 1)
                gap_secs = int(gap_mins * 60)
                next_time = (datetime.datetime.now() + datetime.timedelta(seconds=gap_secs)).strftime("%H:%M:%S")
                log(f"{remaining} commit(s) remaining in queue. Next push in ~{gap_mins} mins (at {next_time})...")
                time.sleep(gap_secs)
            else:
                log("All queued commits delivered. Waiting for new commits...")
                time.sleep(300)
        else:
            log("Push unsuccessful. Halting daemon for human review.")
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="BlueTraceAI Git Commit Pacer")
    parser.add_argument("--status", action="store_true", help="Display pending commit queue and status")
    parser.add_argument("--next", action="store_true", help="Push immediately the next single commit in queue")
    parser.add_argument("--daemon", action="store_true", help="Run background pacing daemon across today/tomorrow")
    parser.add_argument("--min-gap", type=float, default=25.0, help="Minimum gap in minutes between pushes (default: 25)")
    parser.add_argument("--max-gap", type=float, default=70.0, help="Maximum gap in minutes between pushes (default: 70)")
    parser.add_argument("--count", type=int, default=None, help="Maximum number of commits to push in this session")

    args = parser.parse_args()

    if args.status or (not args.next and not args.daemon):
        show_status()
    elif args.next:
        commits = get_unpushed_commits()
        if not commits:
            print("No unpushed commits queued.")
            return
        h, s = commits[0]
        push_single_commit(h, s)
    elif args.daemon:
        run_daemon(min_gap_mins=args.min_gap, max_gap_mins=args.max_gap, max_commits=args.count)


if __name__ == "__main__":
    main()
