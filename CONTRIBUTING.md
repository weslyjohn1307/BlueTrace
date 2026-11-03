# Contributing to BlueTraceAI

Thanks for taking an interest in BlueTraceAI. The project is an active prototype for MEP drawing review. Contributions that improve accuracy, traceability, accessibility, or reliability are welcome.

## Engineering principles

- Models can help interpret drawing content. Physical measurements must come from local geometry and a verified scale.
- If scale is missing or unclear, keep the quantity in review. Do not guess a length.
- Keep model output separate from deterministic geometry and calculation.
- Keep dependencies small. Explain why a new dependency is needed.
- Keep API keys, private drawings, and other sensitive data out of commits and test fixtures.

## Before opening a pull request

Describe the change, the reason for it, and how you checked it. For interface changes, include a screenshot or a short recording. For changes that affect engineering quantities, include the evidence and tests that support them.

Run the checks for the area you changed.

### Backend

```powershell
ruff check src/ tests/ scripts/
mypy
pytest tests/ -q
```

### Frontend

```powershell
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test -- --run
npm --prefix frontend run build
```

The GitHub Actions workflows run these checks on pushes and pull requests. The backend is checked on Python 3.10 through 3.13.

## Changes and commits

Keep pull requests focused and use clear commit messages. Conventional Commit prefixes are helpful: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.

Do not include generated build output, local databases, `.env` files, API keys, or real project drawings. Use synthetic fixtures for tests unless a drawing has been explicitly cleared for public use.

For security reports, follow [SECURITY.md](SECURITY.md).
