"""Copyright guard: third-party product names must never enter tracked files.

Enforced in three places so no single bypass suffices:
  1. scripts/sanitize_import.py --audit (this module's logic, tested here)
  2. .git/hooks/pre-commit running that audit
  3. CI running that audit (.github/workflows/ci.yml)

Competitor research belongs in internal-research/ (gitignored). Scrubbed,
generic derivatives may be committed; names, URLs, and filenames may not.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "sanitize_import", Path(__file__).resolve().parents[1] / "scripts" / "sanitize_import.py"
)
assert _SPEC and _SPEC.loader
sanitize_import = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(sanitize_import)


def _write(tmp_path: Path, name: str, text: str) -> Path:
    target = tmp_path / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    return target


def test_trademark_terms_are_flagged(tmp_path: Path):
    # Terms are assembled at runtime so this guard file stays audit-clean by content;
    # it is also exempted by name in GUARD_SELF_FILES as a second layer.
    for term in (
        "Cana" + "veral",
        "Blue" + "beam",
        "Re" + "vu",
        "ave" + "xis",
        "pf" + "mcc",
        "p104" + "_1",
        "Imagi" + "neers",
        "C" + "TD",
    ):
        f = _write(tmp_path, "note.md", f"Comparison against {term} workflows.\n")
        assert sanitize_import.audit_file(f), f"term not flagged: {term}"


def test_generic_language_passes(tmp_path: Path):
    f = _write(tmp_path, "note.md", "Desktop takeoff tools require calibrated scale.\n")
    assert sanitize_import.audit_file(f) == []


def test_forbidden_filename_is_flagged(tmp_path: Path):
    _write(tmp_path, ("blue" + "beam_notes.md"), "clean contents\n")
    assert sanitize_import.audit_directory(tmp_path) >= 1


def test_internal_research_sanctuary_is_ignored(tmp_path: Path):
    _write(tmp_path / "internal-research", "notes.md", "Cana" + "veral teardown\n")
    assert sanitize_import.audit_directory(tmp_path) == 0


def test_workspace_tree_is_clean():
    """The real tree (minus ignored/internal dirs) must contain zero violations."""
    root = Path(__file__).resolve().parents[1]
    assert sanitize_import.audit_directory(root) == 0
