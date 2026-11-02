# Security Policy — BlueTraceAI

## 1. Supported Versions

Security updates and patches are actively provided for the following releases:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## 2. Zero Secrets Invariant

BlueTraceAI operates under a strict **Zero Secrets in Git** invariant:

- No API keys, credentials, private tokens, certificates, or `.env` configuration files may ever be committed to the repository.
- Automated commit guards and `.gitignore` directives block exposure of `.env` files and ephemeral session tokens.
- All code submissions are audited to ensure no sensitive configuration is embedded in source or documentation.

---

## 3. Bring-Your-Own-Key (BYOK) Architecture

BlueTraceAI integrates with Meta Model APIs (`https://api.meta.ai/v1`) using a privacy-first BYOK design:

1. **In-Memory Isolation**:
   - User-provided API keys submitted via the `/api/settings/byok` endpoint reside strictly in process memory and are never persisted to disk or SQLite databases.
2. **Key Masking**:
   - All diagnostic logs, health checks, and API responses strictly mask keys (e.g., `sk-meta-...4a2b`), never exposing the raw secret.
3. **Session Revocation**:
   - Users may immediately revoke active keys using `/api/settings/byok` with a null payload, purging key references from memory immediately.
4. **Environment Isolation**:
   - For CI and local developer workflows, optional environment variables (`META_API_KEY`) are read directly from local system environment variables without writing to disk.

---

## 4. Local Plan & Ledger Privacy

BlueTraceAI is architected for local engineering execution:

- Architectural drawings (PDF files) are processed locally on the workstation.
- Extracted vector linework, centerline graphs, and takeoff records remain entirely within local SQLite (`aiosqlite`) databases in WAL mode.
- External API calls to Meta Model endpoints transmit only the minimum required payloads (e.g., cropped 300x300 px raster tiles or sheet title blocks for OCR and segmentation), preserving blueprint confidentiality.

---

## 5. Reporting a Vulnerability

If you discover a security vulnerability or secret exposure in BlueTraceAI, please report it privately:

1. **Email**: Contact the security maintainers at `security@bluetrace.ai` (or via private GitHub Security Advisory).
2. **Details**: Include a description of the issue, affected files/endpoints, reproduction steps, and potential impact.
3. **Response Timeline**:
   - We will acknowledge receipt within 48 hours.
   - We will provide a status update and remediation timeline within 5 business days.
4. **Responsible Disclosure**: Please do not file public GitHub issues or disclose vulnerability details publicly until a fix has been released and confirmed.
