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

# Patterns that strictly trigger an audit violation (whole workspace).
FORBIDDEN_PATTERNS = [
    re.compile(r'\bCTD\b', re.IGNORECASE),
    re.compile(r'ctd[-_]', re.IGNORECASE),
]

# Third-party product/trademark patterns (copyright guard): forbidden in every
# tracked file — docs, code, filenames — without exception. Competitor research
# belongs in internal-research/ (gitignored, never committed); only scrubbed,
# generic derivatives may enter the repo. Guard definition files are exempt by
# name (GUARD_SELF_FILES) because they must spell the patterns to enforce them.
TRADEMARK_FORBIDDEN_PATTERNS = [
    re.compile(r'canaveral', re.IGNORECASE),
    re.compile(r'bluebeam', re.IGNORECASE),
    re.compile(r'\brevu\b', re.IGNORECASE),
]
TRADEMARK_FILENAME_TOKENS = ('canaveral', 'bluebeam', 'revu')

# Files that define the guard itself and therefore legitimately contain the
# forbidden literals as patterns/test data.
GUARD_SELF_FILES = {'sanitize_import.py', 'test_sanitizer_guard.py'}

# Product-surface patterns: forbidden in shipped UI code (docs may discuss history).
UI_FORBIDDEN_PATTERNS = [
    re.compile(r'\bImagineers\b', re.IGNORECASE),
    re.compile(r'MEP Design AI'),
]

# Code-only patterns: legacy detector/package/fixture tokens. Applied to code
# files (never docs/*.md, which legitimately record the migration history, and
# never *.test.* files, which assert the absence of these very tokens).
CODE_FORBIDDEN_PATTERNS = [
    re.compile(r'\bFIX-TRN\b'),
    re.compile(r'\bYOLO\w*\b', re.IGNORECASE),
    re.compile(r'\bultralytics\b', re.IGNORECASE),
    re.compile(r'\brtdetr\b', re.IGNORECASE),
    re.compile(r'\bmep_ai\b'),
]

CODE_DIRS = ('src/', 'frontend/src/', 'frontend/tests/', 'configs/', 'tests/', 'scripts/')

IGNORED_DIRS = {
    '.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.pytest_cache',
    'meta_api', 'meta-model-cookbook', 'meta-oss-cookbook', 'ECC', 'docs/meta_api', 'docs/research/ECC',
    # Internal-only research sanctuary: may discuss third-party products, is
    # gitignored, and must never be committed (see internal-research/README.md).
    'internal-research', '.scrape-cache',
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
    if file_path.name in GUARD_SELF_FILES:
        return []
    violations = []
    try:
        posix = str(file_path).replace("\\", "/")
        is_ui_file = "frontend/src/" in posix or "frontend/tests/" in posix
        is_test_file = ".test." in posix
        is_code_file = (
            posix.endswith(('.py', '.ts', '.tsx', '.js', '.jsx', '.yaml', '.yml', '.toml'))
            and any(d in posix for d in CODE_DIRS)
            and not is_test_file
        )
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for idx, line in enumerate(f, 1):
                # Trademark guard applies to every file, every scope, no exemptions.
                patterns = list(FORBIDDEN_PATTERNS) + list(TRADEMARK_FORBIDDEN_PATTERNS)
                if is_ui_file and not is_test_file:
                    patterns += UI_FORBIDDEN_PATTERNS
                if is_code_file:
                    patterns += CODE_FORBIDDEN_PATTERNS
                for pattern in patterns:
                    if pattern.search(line):
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
        # Filename guard: a forbidden token in a path is a violation even if
        # the file's contents are clean (e.g. renamed-but-unscrubbed docs).
        if path.is_file() and any(tok in path.name.lower() for tok in TRADEMARK_FILENAME_TOKENS):
            print(f"\n[VIOLATION] in {path.relative_to(root_dir)}: forbidden token in filename")
            total_violations += 1
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
        # RETIRED: blind in-place rewriting corrupted real dataset paths in repo
        # docs (see audit H2). Bulk replacement is only safe for fresh vendor
        # copies via --import-file. Fall through to audit instead.
        print("NOTE: --sanitize-all is retired; running audit instead.")

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
