"""Shared identifier validation for filesystem-backed identifiers.

``project_id`` is not just a ledger key: it becomes a directory name under
``data/cache/thumbnails``. One validator is used by both the HTTP layer and the
thumbnail writer so the two can never disagree about what is safe to join
onto a cache root.

Rejected (``ValueError``): empty/blank ids, path separators (``/`` and
``\\``), parent-directory segments (``..``), absolute paths / drive-qualified
paths, control characters, and anything outside a conservative
``[A-Za-z0-9_.- ]``-style allowlist.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath, PureWindowsPath

#: Longest accepted project id; comfortably below every filesystem name limit.
MAX_PROJECT_ID_LENGTH = 128

#: Conservative allowlist: word chars, hyphen, dot, space.
_ALLOWED_PROJECT_ID = re.compile(r"^[\w\-. ]+$")


def validate_project_id(project_id: object) -> str:
    """Return ``project_id`` unchanged when it is a safe path segment.

    Raises:
        ValueError: the value is not a string, is blank, contains a path
            separator or ``..`` segment, is absolute/drive-qualified, or
            contains characters outside the allowlist.
    """
    if not isinstance(project_id, str):
        # One failure type for the whole identifier contract: the route maps it
        # to HTTP 400 and the generator raises it directly. TypeError would
        # split the contract in two.
        raise ValueError("project_id must be a string.")  # noqa: TRY004
    candidate = project_id.strip()
    if not candidate:
        raise ValueError("project_id cannot be empty.")
    if len(candidate) > MAX_PROJECT_ID_LENGTH:
        raise ValueError(
            f"project_id is too long ({len(candidate)} > {MAX_PROJECT_ID_LENGTH} characters)."
        )
    # Separators would escape the cache root on any platform.
    if "/" in candidate or "\\" in candidate:
        raise ValueError("project_id cannot contain path separators ('/' or '\\').")
    # '..' is the traversal primitive; reject it wherever it appears.
    if ".." in candidate:
        raise ValueError("project_id cannot contain '..'.")
    # Absolute and drive-qualified paths ("/tmp/x", "C:x", "C:\\x").
    if PurePosixPath(candidate).is_absolute() or PureWindowsPath(candidate).is_absolute():
        raise ValueError("project_id cannot be an absolute path.")
    if PureWindowsPath(candidate).drive:
        raise ValueError("project_id cannot be drive-qualified.")
    if candidate in {".", ".."}:
        raise ValueError("project_id cannot be a relative directory reference.")
    if not _ALLOWED_PROJECT_ID.match(candidate):
        raise ValueError(
            "project_id may only contain letters, digits, underscores, dots, "
            "hyphens, and spaces."
        )
    return candidate
