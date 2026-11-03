#!/usr/bin/env python3
"""
BlueTraceAI - Irregular Commit Pacer (Deadline: 3:00 PM Today)

Gradually pushes pending local commits to origin/master with natural, irregular
human-like intervals such that all commits land before 3:00 PM (15:00 local time).

Features:
- Dynamically inventories all unpushed commits ahead of origin/master.
- Computes time remaining between now and 3:00 PM today (with safety margin).
- Generates natural, irregular intervals (human-like jitter) fitting the window.
- Runs pre-push safety gates (anti-leak sanitizer + fast regression tests).
- Pushes commit-by-commit: `git push origin <hash>:master`.
- Logs every event to console and data/push_until_3pm.log.

Usage:
    uv run python scripts/push_until_3pm.py --status
    uv run python scripts/push_until_3pm.py --plan
    uv run python scripts/push_until_3pm.py --daemon [--target 15:00] [--push-first]
    uv run python scripts/push_until_3pm.py --next
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
LOG_FILE = ROOT / "data" / "push_until_3pm.log"


def log(msg: str) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted, flush=True)
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


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
    """Verifies anti-leak sanitizer and regression checks before pushing."""
    log("Running pre-push safety gates...")
    py_bin = get_python_executable()

    # 1. Anti-leak & copyright sanitizer
    sanitizer_script = ROOT / "scripts" / "sanitize_import.py"
    if sanitizer_script.exists():
        code, out = run_cmd([py_bin, str(sanitizer_script), "--audit"])
        if code != 0 or "[FAIL]" in out:
            log(f"GATE FAILED: Sanitizer audit violation:\n{out}")
            return False

    # 2. Fast regression tests
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


def parse_deadline(target_str: str) -> datetime.datetime:
    """Parses target string like '15:00' into today's datetime."""
    now = datetime.datetime.now()
    parts = target_str.strip().split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    second = int(parts[2]) if len(parts) > 2 else 0
    deadline = now.replace(hour=hour, minute=minute, second=second, microsecond=0)
    return deadline


def compute_schedule(
    commits: list[tuple[str, str]],
    deadline: datetime.datetime,
    push_first_immediately: bool = False,
    buffer_seconds: int = 300,
) -> list[tuple[datetime.datetime, str, str]]:
    """
    Computes an irregular, human-like schedule for pushing commits before deadline.
    Returns list of (scheduled_time, commit_hash, subject).
    """
    now = datetime.datetime.now()
    total_seconds_left = (deadline - now).total_seconds()
    if total_seconds_left <= 0:
        return [(now, h, s) for h, s in commits]

    # Effective target finishes buffer_seconds (e.g. 5 mins) before deadline
    effective_window = max(60.0, total_seconds_left - buffer_seconds)
    n = len(commits)
    if n == 0:
        return []
    if n == 1:
        return [(now + datetime.timedelta(seconds=min(30.0, effective_window / 2)), commits[0][0], commits[0][1])]

    schedule: list[tuple[datetime.datetime, str, str]] = []

    if push_first_immediately:
        # Commit 0 right away
        schedule.append((now, commits[0][0], commits[0][1]))
        remaining_commits = commits[1:]
        m = len(remaining_commits)
        if m == 0:
            return schedule

        # Distribute remaining window with random weights (Dirichlet-like)
        raw_weights = [random.uniform(0.7, 1.3) for _ in range(m)]
        total_w = sum(raw_weights)
        norm_intervals = [(w / total_w) * effective_window for w in raw_weights]

        accum_time = now
        for i, (h, s) in enumerate(remaining_commits):
            accum_time += datetime.timedelta(seconds=norm_intervals[i])
            schedule.append((accum_time, h, s))
    else:
        # Distribute n intervals with human variance
        raw_weights = [random.uniform(0.65, 1.35) for _ in range(n)]
        total_w = sum(raw_weights)
        norm_intervals = [(w / total_w) * effective_window for w in raw_weights]

        accum_time = now
        for i, (h, s) in enumerate(commits):
            accum_time += datetime.timedelta(seconds=norm_intervals[i])
            schedule.append((accum_time, h, s))

    return schedule


def show_plan(deadline_str: str = "15:00", push_first: bool = False) -> None:
    deadline = parse_deadline(deadline_str)
    now = datetime.datetime.now()
    commits = get_unpushed_commits()

    print("=" * 76)
    print(f" BlueTraceAI Human-Paced Push Plan (Target Deadline: {deadline.strftime('%I:%M %p')})")
    print("=" * 76)
    print(f" Current Local Time:  {now.strftime('%I:%M:%S %p')} ({now.strftime('%Y-%m-%d')})")
    print(f" Target Deadline:     {deadline.strftime('%I:%M:%S %p')}")

    time_left = deadline - now
    if time_left.total_seconds() <= 0:
        print(f" [WARNING] The target deadline ({deadline.strftime('%I:%M %p')}) has already passed today.")
        print("=" * 76)
        return

    mins_left = int(time_left.total_seconds() // 60)
    secs_left = int(time_left.total_seconds() % 60)
    print(f" Time Remaining:      {mins_left}m {secs_left}s (~{time_left.total_seconds()/3600:.1f} hours)")
    print(f" Unpushed Commits:    {len(commits)}")
    print("-" * 76)

    if not commits:
        print(" Status: Repository is up-to-date with origin/master. Nothing to push.")
        print("=" * 76)
        return

    schedule = compute_schedule(commits, deadline, push_first_immediately=push_first)

    print(f" {'#':<3} {'Target Time':<12} {'Interval':<10} {'Commit':<9} {'Subject'}")
    print(f" {'-':<3} {'-----------':<12} {'--------':<10} {'-------':<9} {'-------------------------------------'}")

    prev_time = now
    for idx, (sched_time, h, s) in enumerate(schedule, 1):
        delta = int((sched_time - prev_time).total_seconds())
        delta_str = f"+{delta//60}m {delta%60:02d}s" if delta > 0 else "immediate"
        print(f" {idx:<3} {sched_time.strftime('%I:%M:%S %p'):<12} {delta_str:<10} {h[:7]:<9} {s[:42]}")
        prev_time = sched_time

    print("=" * 76)
    print(" Run with --daemon to execute this schedule, or --push-first --daemon to start now.")
    print("=" * 76)


def show_status(deadline_str: str = "15:00") -> None:
    deadline = parse_deadline(deadline_str)
    now = datetime.datetime.now()
    commits = get_unpushed_commits()

    print("=" * 70)
    print(" BlueTraceAI Push Pacer Status")
    print("=" * 70)
    print(f" Current Time:     {now.strftime('%I:%M:%S %p')}")
    print(f" Target Deadline:  {deadline.strftime('%I:%M:%S %p')}")
    time_left = deadline - now
    if time_left.total_seconds() > 0:
        print(f" Time Remaining:   {int(time_left.total_seconds()//60)}m {int(time_left.total_seconds()%60)}s")
    else:
        print(" Time Remaining:   Deadline has passed.")
    print(f" Queued Commits:   {len(commits)}\n")

    for i, (h, s) in enumerate(commits, 1):
        marker = "--> NEXT" if i == 1 else "   "
        print(f" {marker} [{i}/{len(commits)}] {h[:7]} - {s}")

    if LOG_FILE.exists():
        lines = LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
        print("\nRecent Activity (last 5 log entries):")
        for l in lines[-5:]:
            print(f"  {l}")
    print("=" * 70)


def run_irregular_daemon(deadline_str: str = "15:00", push_first: bool = False) -> None:
    deadline = parse_deadline(deadline_str)
    now = datetime.datetime.now()
    commits = get_unpushed_commits()

    if not commits:
        log("All commits are already pushed to origin/master. Nothing to do.")
        return

    time_left = (deadline - now).total_seconds()
    if time_left <= 0:
        log(f"WARNING: Deadline {deadline.strftime('%I:%M %p')} has passed. Pushing commits sequentially...")
        for h, s in commits:
            push_single_commit(h, s)
        return

    log(f"Starting Irregular Push Daemon (Target Deadline: {deadline.strftime('%I:%M %p')})")
    log(f"Queued Commits: {len(commits)} commits across ~{int(time_left // 60)} minutes.")

    schedule = compute_schedule(commits, deadline, push_first_immediately=push_first)

    for idx, (sched_time, h, s) in enumerate(schedule, 1):
        current_now = datetime.datetime.now()
        wait_seconds = (sched_time - current_now).total_seconds()

        if wait_seconds > 0:
            log(f"[{idx}/{len(schedule)}] Next commit {h[:7]} scheduled at {sched_time.strftime('%I:%M:%S %p')} (in {int(wait_seconds//60)}m {int(wait_seconds%60)}s)...")
            time.sleep(wait_seconds)

        log(f"[{idx}/{len(schedule)}] Executing scheduled push for {h[:7]}...")
        success = push_single_commit(h, s)
        if not success:
            log("Push encountered an error. Pausing daemon for human investigation.")
            break

    remaining = get_unpushed_commits()
    if not remaining:
        log("ALL COMMITS SUCCESSFULLY DELIVERED TO ORIGIN/MASTER!")
    else:
        log(f"{len(remaining)} commit(s) still remaining.")


def main() -> None:
    parser = argparse.ArgumentParser(description="BlueTraceAI Irregular Commit Pacer (Deadline: 3 PM)")
    parser.add_argument("--status", action="store_true", help="Show current queue and time remaining")
    parser.add_argument("--plan", "--dry-run", action="store_true", help="Display randomized timetable without pushing")
    parser.add_argument("--daemon", action="store_true", help="Run daemon loop pushing until 3 PM")
    parser.add_argument("--next", action="store_true", help="Push immediately the single next commit in queue")
    parser.add_argument("--target", type=str, default="15:00", help="Target deadline in HH:MM format (default: 15:00)")
    parser.add_argument("--push-first", action="store_true", help="Push the first commit immediately then pace remaining")

    args = parser.parse_args()

    if args.plan:
        show_plan(deadline_str=args.target, push_first=args.push_first)
    elif args.next:
        commits = get_unpushed_commits()
        if not commits:
            print("No unpushed commits in queue.")
            return
        h, s = commits[0]
        push_single_commit(h, s)
    elif args.daemon:
        run_irregular_daemon(deadline_str=args.target, push_first=args.push_first)
    else:
        show_status(deadline_str=args.target)


if __name__ == "__main__":
    main()
