# Contributing to BlueTraceAI

Thank you for your interest in contributing to BlueTraceAI. BlueTraceAI is an AI-assisted mechanical, electrical, and plumbing (MEP) takeoff workstation running on Windows engineering environments.

We maintain high architectural, engineering, and ethical standards across our codebase. Please review this guide before submitting issues or pull requests.

---

## 1. Architectural Invariants

All contributions must respect our foundational architectural principles (codified in `AGENTS.md` and `.agents/rules/`):

1. **Strict Hybrid Division of Labor**:
   - **Meta Model APIs (`https://api.meta.ai/v1`)**: High-density vision and OCR (`muse-spark-1.3`), segmentation (`sam-3.1`), and structured copilot reasoning (`muse-wonder-1.0`).
   - **Local Deterministic Python Algorithms**: Sub-pixel native vector extraction (`PyMuPDF`), topological network graphs (`NetworkX`), planar geometry (`Shapely`), and local transactional SQLite (`aiosqlite`) in WAL mode.
2. **Fail-Closed Scale Invariant (Rule 01)**:
   - Never hallucinate dimensions. All measurements must trace directly to physical vector paths and a validated scale ratio.
   - Ambiguous or conflicting scales must set `review_required = True`, `scale_ratio = 0.0`, and alert the human estimator.
3. **Dependency Lockdown & Minimalism (Rule 02)**:
   - Do not add, upgrade, or remove dependencies in `pyproject.toml`, `requirements.txt`, or `frontend/package.json` without explicit approval.
   - Leverage standard libraries and pre-installed packages first.
4. **Anti-Slop UI & CAD Matrix (Rule 03)**:
   - Instant Doherty feedback under 400ms for all canvas interactions.
   - 2D affine matrix math for screen-to-drawing coordinate translations.
   - Monospace font for numerical quantities, dimensions, and CFM airflow. High contrast ratios ($\ge 4.5:1$).
5. **Knowledge-First & Epistemic Grounding (Rule 04 & Rule 06)**:
   - Domain logic and engineering formulas must cite knowledge packs in `docs/knowledge/INDEX.md` or standards (SMACNA, ASHRAE, NEC, CSI MasterFormat).
   - Claims must be supported by reproducible test execution and code references.

---

## 2. Strict Trademark & Copyright Sanitizer Rules (Rule 05)

To protect intellectual property and open-source integrity:
- **Never commit third-party product names**, proprietary takeoff/CAD software product names, URLs, logos, or vendor materials in code, docs, commit messages, or PR text.
- Competitive analysis and external research must remain strictly in `internal-research/` (gitignored). Only scrubbed, generic engineering synthesis belongs in the repository.
- Every commit is audited by our deterministic sanitizer guard:
  ```powershell
  python scripts/sanitize_import.py --audit
  ```
- Pull requests triggering sanitizer violations will be rejected immediately.

---

## 3. Development Workflow & Quality Gates

Before submitting changes, all local quality gates must pass:

### Backend Quality Gates
```powershell
# 1. Lint and style check
.venv\Scripts\ruff check src/ tests/ scripts/

# 2. Scoped static type analysis
.venv\Scripts\mypy

# 3. Unit, contract, and integration tests
.venv\Scripts\pytest tests/
```

### Frontend Quality Gates
```powershell
# 1. ESLint check
npm --prefix frontend run lint

# 2. TypeScript compilation check
npm --prefix frontend run typecheck

# 3. Vitest test suite
npm --prefix frontend run test -- --run

# 4. Production build
npm --prefix frontend run build
```

### Pre-Publish Sanitization Check
```powershell
# Verify no trademark leaks or forbidden tokens
python scripts/sanitize_import.py --audit
```

---

## 4. Conventional Commits

Commit messages must adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` — New user-facing capability or API feature
- `fix:` — Bug fix or error resolution
- `refactor:` — Code restructuring without behavior changes
- `test:` — Adding or improving tests
- `docs:` — Documentation and specification updates
- `chore:` — Repository maintenance, manifest updates, or tooling configuration

Example:
```git
feat(vector): add corner ray intersection extender for duct elbows
fix(canvas): correct polygon area scale factor in SheetCanvas
test(api): add contract test for multi-sheet upload endpoint
```

---

## 5. Security & BYOK Secrets

- **Zero Secrets in Git**: Never commit `.env` files, API keys, private tokens, or credentials.
- All Meta Model API access uses Bring-Your-Own-Key (BYOK) memory isolation. API keys reside strictly in transient memory or secure environment variables (`META_API_KEY`).
- For vulnerability disclosures, review `SECURITY.md`.
