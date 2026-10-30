# RES-08: Production BYOK Web Application Architecture & Templates

## 1. Executive Summary
This document establishes the architecture for the **Bring Your Own Key (BYOK)** pattern implemented in BlueTraceAI.
The BYOK pattern allows users to provide their Meta Model API key (`https://api.meta.ai/v1`) directly from the browser UI, enabling full AI functionality without requiring developer-subsidized API accounts, while strictly preventing secret leakage or process-global contamination.

---

## 2. Industry Threat Model & Security Invariants

### 2.1 Threat Vectors Evaluated
1. **Accidental Log Spillage**: Raw API keys printed to stdout, stderr, or application log files during debugging or error traces.
2. **Database Leakage**: Plaintext secrets stored in SQLite or application state files.
3. **Cross-Tenant Pollution**: One user's key being reused by another user's session, or one user's logout invalidating another user's session.
4. **Browser Theft / XSS**: Persistent keys stored across domain restarts without user knowledge.

### 2.2 Security Invariants Enforced
- **Ephemeral Client-Side Storage**: The user's key is stored in browser `sessionStorage` or React memory state. It is never persisted in cookies or permanent local storage.
- **In-Flight Header Transmission**: Every API request that requires model inference transmits the key via standard authorization header (`Authorization: Bearer <token>`) or custom header (`X-BYOK-API-Key`).
- **Session-Scoped Memory Registry**: The backend maintains an in-memory session mapping `_session_keys: dict[str, str]` keyed by a cryptographically random `X-Session-ID`.
- **Zero Disk Persistence**: Neither the database, nor JSON config files, nor loggers ever write or serialize the key.
- **Log Sanitization Filter**: A custom logging filter redacts any string matching `Bearer [a-zA-Z0-9_\-\.]{15,}` or header `X-BYOK-API-Key`.

---

## 3. Reference Architecture (FastAPI + React 19)

### 3.1 Frontend Protocol (`ByokDialog.tsx` + `useTakeoffSession.ts`)
```text
┌─────────────────────────────────────────────────────────────────┐
│ Browser (React 19)                                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. User opens BYOK Dialog, enters Meta API Key                  │
│ 2. Frontend validates format (`len >= 20`, prefix check)        │
│ 3. Key stored in React state & sessionStorage                   │
│ 4. `POST /api/byok/validate` verifies key against live API      │
│ 5. Subsequent requests pass `X-BYOK-API-Key` & `X-Session-ID`   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS / TLS
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend (FastAPI)                                               │
├─────────────────────────────────────────────────────────────────┤
│ 1. Dependency `get_meta_client` extracts header                 │
│ 2. Scoped `MetaModelClient` instantiated per request            │
│ 3. `DELETE /api/byok` removes only the caller's session ID      │
│ 4. Zero disk I/O, zero database storage                         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Backend FastAPI Dependency Injection
```python
from fastapi import Header, HTTPException, status
from src.meta_services.client import MetaModelClient

_disabled_sessions: set[str] = set()
_session_keys: dict[str, str] = {}

def get_session_meta_client(
    x_byok_api_key: str | None = Header(None, alias="X-BYOK-API-Key"),
    x_session_id: str | None = Header(None, alias="X-Session-ID"),
) -> MetaModelClient:
    session_id = x_session_id or "default"
    
    if session_id in _disabled_sessions and not x_byok_api_key:
        return MetaModelClient(api_key=None)
        
    effective_key = x_byok_api_key or _session_keys.get(session_id)
    return MetaModelClient(api_key=effective_key)
```

---

## 4. Open-Source Templates & Prior Art Reviewed
1. **Taskade & TypingMind BYOK Patterns**: Client-side encrypted key persistence with optional user-supplied passphrase.
2. **FastAPI Security Dependency Injection**: Standard pattern for token extraction without global mutable state.
3. **IronCore Labs & AWS KMS Envelope Patterns**: Used for enterprise database encryption at rest (referenced for enterprise deployment tier).
