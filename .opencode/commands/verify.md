---
description: Run the full verification suite (pytest, vitest, ruff, mypy, sanitize audit)
---

Run the complete 5-gate verification suite:

```powershell
# 1. Backend tests
& .\.venv\Scripts\pytest.exe tests/

# 2. Frontend tests
npm --prefix frontend run test -- --run

# 3. Backend linting
& .\.venv\Scripts\ruff.exe check src/ tests/ scripts/

# 4. Backend type checking (scope configured in pyproject.toml; do not use `mypy src/`)
& .\.venv\Scripts\mypy.exe

# 5. Anti-leak sanitization audit
& .\.venv\Scripts\python.exe scripts/sanitize_import.py --audit
```
