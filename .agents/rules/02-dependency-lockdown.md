---
trigger: always_on
description: "Dependency minimalism and lockdown protocol"
---

# Rule: Dependency Lockdown & Minimalism

1. **Explicit Permission Required**: Never add, update, or remove packages in `pyproject.toml`, `requirements.txt`, or `frontend/package.json` without explicit user permission.
2. **Leverage Standard Library First**: Always prefer Python 3.10+ standard libraries (`base64`, `json`, `pathlib`, `sqlite3`, `dataclasses`) before requesting external dependencies.
3. **No Redundant UI Libraries**: Reuse existing Tailwind CSS, Lucide icons, and Radix primitives already installed in `frontend/package.json`.
