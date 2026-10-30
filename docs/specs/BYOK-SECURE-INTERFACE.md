# BlueTraceAI: BYOK Secure Interface Spec

> Status: spec (Slice 5 implements + audits). Written 2026-10-30.
> Key rule: the Meta API key is server-side-only, always.

## 1. Key sources

- **Dev/owner**: `MODEL_API_KEY` in local `.env` (gitignored, never committed).
  Owner creates it; agents never print, log, or persist the value.
- **Judges/demo (BYOK field)**: runtime key entry in the UI for evaluators who
  bring their own key. Transported to the backend once, held in server memory
  for the session only, never written to disk/logs/DB.

## 2. Architecture (BFF — browser never holds the key)

- Browser → backend: key submitted via `POST` JSON body (never query string).
- Backend → Meta API: `Authorization: Bearer` header from server-side value only.
- Display: masked (`••••1234`) after entry; full value never returned by any API.
- Storage: env var or in-memory session value. No `localStorage`/`sessionStorage`/
  `IndexedDB`, no cookies, no JWT payload, no committed `.env`, no `VITE_*` /
  build-time bundle embedding.
- Logging: no key material in request logs, error traces, or telemetry;
  redact `Authorization` headers at the logging layer.

## 3. Banned patterns (audit must grep for these)

- `VITE_*`/`import.meta.env` secrets; hardcoded `apiKey|secret|token` in `frontend/`.
- `localStorage|sessionStorage.setItem(*token|key*)`.
- `?api_key=|?token=|?key=` in routes or client calls.
- Key in JWT payload, signed session cookie, or `public/` assets.
- `allow_origins=["*"]` combined with `allow_credentials=True` (currently in
  `src/api/main.py` — must be tightened to explicit origins before Slice 5).

Basis: `security-best-practices` skill references
(`python-fastapi-web-server-security`, `javascript-typescript-react-web-frontend-security`).

## 4. Implementation research checklist (Slice 5)

- [ ] Consult current OWASP secrets-handling / API-security cheatsheets for any
  rule newer than the skill references.
- [ ] Check 1–2 production BYOK UI templates for masked-entry + session-key UX.
- [ ] Implement server session-key holder with explicit clear-on-logout/expiry.
- [ ] Add redaction unit tests (log output, error paths, `/docs` schema examples).

## 5. Leak audit (must pass before demo/submit)

```powershell
# 1. No secret material in tracked files
Select-String -Path src, frontend\src, tests -Pattern 'sk-|apiKey\s*=|MODEL_API_KEY\s*=\s*["''][^"''your]' -Recurse
# 2. No bundle/storage/query violations
Select-String -Path frontend\src -Pattern 'VITE_.*KEY|localStorage|sessionStorage|api_key=' -Recurse
# 3. No .env tracked
git ls-files | Select-String '\.env$'
# 4. CORS + logging review of src/api/main.py by hand
```
