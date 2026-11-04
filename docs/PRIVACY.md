# BlueTraceAI — Privacy Policy

> **Effective Date:** November 4, 2026  
> **Last Updated:** November 4, 2026  
> **Project:** BlueTraceAI (Open-Source MEP Takeoff Platform)  
> **Maintainer:** Wesly John & BlueTraceAI Contributors  
> **Contact:** [weslyjohn1307@gmail.com](mailto:weslyjohn1307@gmail.com) / [GitHub Issues](https://github.com/weslyjohn1307/BlueTrace/issues)

---

## 1. Overview & Core Privacy Commitment

BlueTraceAI is designed from the ground up as a **local-first engineering tool** for mechanical, electrical, and plumbing (MEP) contractors and estimators. 

We recognize that commercial construction drawings, mechanical schematics, project specifications, and bidding ledgers contain highly sensitive trade secrets, proprietary engineering designs, and confidential client data. Our architectural philosophy is simple:

> **Your blueprints, your coordinates, and your bids remain on your machine.**

BlueTraceAI does not operate a centralized multi-tenant database of your drawings, does not track your cursor across the web, does not sell your information to advertisers, and does not train artificial intelligence models on your proprietary drawings by default.

---

## 2. Information We Collect and Process

### 2.1 Local-First Data (Stored Exclusively on Your Device)
When you run BlueTraceAI locally or via the desktop application:
- **Blueprints & Vector PDFs:** Uploaded drawings (`.pdf`) and generated raster thumbnails are stored directly on your local filesystem under `data/` (which is strictly git-ignored).
- **Extracted Linework & Geometries:** Vector paths, medial-axis centerlines, duct corridors, and junction graphs are calculated in-memory and cached locally using cryptographic SHA-256 hashes of the source files.
- **Takeoff Ledger & Review History:** Takeoff items, system classifications (HVAC, Electrical, Plumbing), user review decisions (`ACCEPT`, `REJECT`, `CORRECT`), override reason codes, and QA annotations are persisted in a local SQLite database (`data/bluetrace.db`).
- **Configuration & Calibration:** Sheet scales, two-point manual calibrations, and UI theme preferences are stored strictly in your local database and browser local storage.

### 2.2 Cloud Model API Transmission (Meta Model API)
BlueTraceAI features optional AI perception and reasoning powered by the **Meta Model API** (`https://api.meta.ai/v1`). These capabilities are strictly **opt-in** and require an explicit user-supplied API key (`MODEL_API_KEY`):

- **Point-of-Need Crops Only:** When you hover over or select a drawing feature with QuickDraw active, BlueTraceAI transmits **only a localized 150 DPI bounding box crop** ($300 \times 300\text{ px}$) to Meta's `muse-spark-1.3` endpoint. **We never upload the entire large-format blueprint PDF to the cloud vision model.**
- **Legend & Schedule Crops:** When running symbol or schedule reconnaissance, only the designated legend or schedule table image region is transmitted.
- **Copilot Queries:** When you submit a question in the Copilot drawer, the prompt and retrieved SQLite evidence rows are transmitted to Meta's `muse-wonder-1.0` model to synthesize a natural-language response.
- **BYOK (Bring Your Own Key):** You supply your own Meta API credentials via `.env` or the in-app BYOK modal (`POST /api/auth/byok`). BlueTraceAI does not broker, intercept, or log your API keys to any external telemetry server.
- **Zero Training by Default:** Engineer feedback and correction crops recorded via `POST /api/feedback/events` default strictly to `training_eligible = 0`. Your proprietary drawings are not used to fine-tune shared foundation models without explicit organizational agreement.

### 2.3 Offline Mode & Abstention
If no API key is supplied, BlueTraceAI operates 100% offline. Local deterministic Python linework, scale calibration, canvas pan/zoom, ledger editing, and CSV/JSON exports function completely without internet access. Model-backed endpoints abstain fail-closed and transmit zero network packets.

---

## 3. How We Use Information

We process drawing data and metadata strictly for:
1. Extracting vector geometry and computing physical linear footages based on your verified drawing scale.
2. Recognizing text callouts (dimensions, airflow tags, equipment labels) via point-of-need vision.
3. Maintaining an immutable audit log of estimator approvals and overrides in your local SQLite WAL store.
4. Exporting verified estimating schedules to CSV and JSON formats for your commercial estimating software.

---

## 4. Third-Party Services & Model Providers

When cloud AI features are enabled, data is processed in accordance with the following third-party provider terms:

| Service Provider | Role | Data Transmitted | Privacy Policy |
|---|---|---|---|
| **Meta Platforms, Inc.** (Meta Model API) | Vision (`muse-spark-1.3`), Segmentation (`sam-3.1`), Reasoning (`muse-wonder-1.0`) | High-resolution cropped image snippets ($300 \times 300\text{ px}$), table regions, and natural language copilot prompts | [Meta Privacy Policy](https://www.meta.com/legal/privacy-policy/) |

We do not integrate third-party advertising SDKs, cross-site behavioral tracking cookies, or commercial data broker pixels.

---

## 5. Compliance with Global Data Protection Laws

### 5.1 European Union & UK General Data Protection Regulation (GDPR / UK GDPR)
For users located in the European Economic Area (EEA) and the United Kingdom:
- **Data Controller:** You (or your employing contractor) act as the Data Controller for drawings and personal information uploaded into BlueTraceAI. BlueTraceAI provides the local processing software.
- **Legal Basis:** Processing of drawing data is performed on the basis of contract performance (providing estimating functionality) and legitimate interest (bidding accuracy).
- **Your Rights:**
  - **Right of Access & Portability:** You can export your entire takeoff ledger, project records, and review history at any time via the one-click CSV and JSON export endpoints (`GET /api/takeoff/export/csv`, `GET /api/takeoff/export/json`).
  - **Right to Erasure ("Right to be Forgotten"):** Because data is stored locally, deleting the project from the application or deleting `data/bluetrace.db` permanently erases all associated records.
  - **Right to Rectification:** Estimators have full granular editing rights to correct or reclassify any automated proposal prior to export.

### 5.2 California Consumer Privacy Act (CCPA / CPRA)
For California residents:
- We do **not** sell personal information.
- We do **not** share personal information for cross-context behavioral advertising.
- We collect only the minimum necessary technical information required to run the local application.

### 5.3 Digital Personal Data Protection Act (DPDP Act, India)
For users in India:
- Personal and business data is processed with purpose limitation and strict data minimization.
- Users retain the right to withdraw consent, erase stored local records, and obtain grievance redressal by contacting the maintainers.

### 5.4 Children’s Privacy (COPPA Compliance)
BlueTraceAI is professional engineering software intended exclusively for commercial contractors, estimators, and engineers. It is not directed to, and we do not knowingly collect personal information from, children under the age of 18 (or under 13 under US COPPA).

---

## 6. Data Security & Storage Hygiene

We enforce strict data security disciplines across the codebase:
- **Zero Secrets in Git:** API keys and credentials are never stored in source files, git commits, or frontend bundles. All client authentication uses environment variables or memory-only session tokens.
- **SQLite WAL Concurrency:** Local database transactions use Write-Ahead Logging (WAL) and foreign-key constraints to prevent database corruption during sudden machine shutdowns or restarts.
- **Fail-Closed Permissions:** The application runs locally with non-root privileges and isolates background Python processes.
- **Input Sanitization & Delimiters:** User prompts and crop data are bounded by strict length limits and delimiter guards to defend against indirect prompt injection.

---

## 7. Data Retention & Deletion

- **Local Projects:** Retained on your device until you explicitly remove them or delete the `data/` directory.
- **Session Keys:** BYOK keys entered via the web interface are held in ephemeral memory and discarded upon session termination or browser reload.
- **Cached Vector Geometry:** Can be cleared at any time by deleting the cache files in `data/` or running the provided cleanup script (`python scripts/clear_cache.py`).

---

## 8. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our software, legal requirements, or model integrations. All updates will be published directly in the repository with a revised "Last Updated" timestamp.

---

## 9. Contact & Redressal

If you have questions, concerns, or requests regarding this Privacy Policy or your data rights, please open an issue on the GitHub repository or contact:

**Wesly John**  
Project Maintainer, BlueTraceAI  
Repository: [https://github.com/weslyjohn1307/BlueTrace](https://github.com/weslyjohn1307/BlueTrace)  
Email: [weslyjohn1307@gmail.com](mailto:weslyjohn1307@gmail.com)
