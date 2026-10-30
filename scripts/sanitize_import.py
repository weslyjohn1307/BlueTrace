#!/usr/bin/env python3
"""
BlueTraceAI Sanitization & Anti-Leak Guardian
Strictly detects, strips, and prevents any mentions of legacy naming (e.g. 'CTD',
'CTD Dataset', 'ctd-fire-damper') when importing files from predecessor projects
or writing to frontend/backend.
"""

import argparse
import re
import sys
from pathlib import Path

# Exact replacement mappings (ordered by specificity)
REPLACEMENTS = [
    (re.compile(r'\bCTD\s+2026\s+MEP\s+Design\s+AI\b', re.IGNORECASE), 'BlueTraceAI MEP Design'),
    (re.compile(r'\bCTD\s+Dataset\b', re.IGNORECASE), 'mep_dataset'),
    (re.compile(r'\bctd-fire-damper-v1\b', re.IGNORECASE), 'mep-fire-damper-v1'),
    (re.compile(r'\bctd-fire-damper\b', re.IGNORECASE), 'mep-fire-damper'),
    (re.compile(r'\bCTD\s+2026\b', re.IGNORECASE), 'BlueTraceAI'),
    (re.compile(r'\bCTD\s+AI\s+Hackathon\b', re.IGNORECASE), 'AI Hackathon'),
    (re.compile(r'\bCTD\b', re.IGNORECASE), 'MEP'),
]

# Patterns that strictly trigger an audit violation
FORBIDDEN_PATTERNS = [
    re.compile(r'\bCTD\b', re.IGNORECASE),
    re.compile(r'ctd[-_]', re.IGNORECASE),
]

UI_FORBIDDEN_PATTERNS = [
    re.compile(r'\bImagineers\b', re.IGNORECASE),
]

IGNORED_DIRS = {
    '.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.pytest_cache',
    'meta_api', 'meta-model-cookbook', 'meta-oss-cookbook', 'ECC', 'docs/meta_api', 'docs/research/ECC'
}
IGNORED_FILES = {
    'AUDIT-2026-10-30-antigravity-slices-0-5.md',
    'AUDIT-2026-10-30-prompt-compliance.md',
}
SCANNABLE_EXTS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.toml', '.yaml', '.yml'}


def sanitize_text(text: str) -> tuple[str, int]:
    """Replaces all forbidden legacy strings with clean BlueTrace equivalents."""
    modified_text = text
    replacement_count = 0
    for pattern, replacement in REPLACEMENTS:
        matches = len(pattern.findall(modified_text))
        if matches > 0:
            modified_text = pattern.sub(replacement, modified_text)
            replacement_count += matches
    return modified_text, replacement_count


def audit_file(file_path: Path) -> list[tuple[int, str]]:
    """Checks a file for any forbidden tokens and returns list of (line_num, line)."""
    violations = []
    try:
        is_ui_file = "frontend/src" in str(file_path).replace("\\", "/")
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for idx, line in enumerate(f, 1):
                patterns = FORBIDDEN_PATTERNS + (UI_FORBIDDEN_PATTERNS if is_ui_file else [])
                for pattern in patterns:
                    if pattern.search(line):
                        # Exclude this sanitizer script itself from self-flagging
                        if "sanitize_import.py" in str(file_path):
                            continue
                        violations.append((idx, line.strip()))
                        break
    except (OSError, UnicodeDecodeError) as e:
        print(f"Warning: Failed to read {file_path}: {e}")
    return violations


def audit_directory(root_dir: Path) -> int:
    """Scans directory and returns total violations count."""
    total_violations = 0
    for path in root_dir.rglob('*'):
        if any(ignored in path.parts for ignored in IGNORED_DIRS) or path.name in IGNORED_FILES:
            continue
        if path.is_file() and path.suffix in SCANNABLE_EXTS:
            violations = audit_file(path)
            if violations:
                print(f"\n[VIOLATION] in {path.relative_to(root_dir)}:")
                for line_num, line in violations[:5]:
                    safe_line = line.encode('ascii', errors='replace').decode('ascii')
                    print(f"   L{line_num}: {safe_line}")
                total_violations += len(violations)
    return total_violations


def sanitize_and_copy(src_path: Path, dest_path: Path):
    """Sanitizes text file contents and filename before writing to destination."""
    clean_name, _ = sanitize_text(src_path.name)
    if dest_path.suffix:
        target_dest = dest_path
    else:
        target_dest = dest_path / clean_name
    target_dest.parent.mkdir(parents=True, exist_ok=True)

    if src_path.suffix in SCANNABLE_EXTS:
        with open(src_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        sanitized_content, count = sanitize_text(content)
        with open(target_dest, 'w', encoding='utf-8') as f:
            f.write(sanitized_content)
        print(f"Sanitized & copied: {src_path.name} -> {target_dest} ({count} replacements)")
    else:
        # Binary copy (e.g. weights, images)
        import shutil
        shutil.copy2(src_path, target_dest)
        print(f"Copied binary: {src_path.name} -> {target_dest}")


def main():
    parser = argparse.ArgumentParser(description="BlueTraceAI Sanitization & Anti-Leak Guardian")
    parser.add_argument("--audit", action="store_true", help="Audit workspace for forbidden legacy tokens")
    parser.add_argument("--sanitize-all", action="store_true", help="In-place sanitize all workspace files")
    parser.add_argument("--import-file", nargs=2, metavar=('SRC', 'DEST'), help="Sanitize and copy file from source to dest")
    args = parser.parse_args()

    workspace_dir = Path(__file__).resolve().parent.parent

    if args.import_file:
        src = Path(args.import_file[0])
        dest = Path(args.import_file[1])
        sanitize_and_copy(src, dest)
        return

    if args.sanitize_all:
        print(f"Running in-place sanitization on {workspace_dir}...")
        total_replaced = 0
        for path in workspace_dir.rglob('*'):
            if any(ignored in path.parts for ignored in IGNORED_DIRS) or "sanitize_import.py" in str(path):
                continue
            if path.is_file() and path.suffix in SCANNABLE_EXTS:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                sanitized, count = sanitize_text(content)
                if count > 0:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(sanitized)
                    print(f"Sanitized {path.relative_to(workspace_dir)} ({count} changes)")
                    total_replaced += count
        print(f"Sanitization complete. Total tokens replaced: {total_replaced}")

    # Default or explicit audit
    print(f"\nRunning Anti-Leak Audit on {workspace_dir}...")
    violations = audit_directory(workspace_dir)
    if violations > 0:
        print(f"\n[FAIL] AUDIT FAILED: Found {violations} legacy naming violations. Clean them before committing.")
        sys.exit(1)
    else:
        print("\n[PASS] AUDIT PASSED: Zero legacy naming tokens found in workspace.")
        sys.exit(0)


if __name__ == '__main__':
    main()
