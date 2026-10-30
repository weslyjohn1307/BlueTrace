# RES-06: Standalone Application Packaging (DesktopT-style + AI layer)

> Researched 2026-10-30. Question: how do we ship BlueTrace as one installable
> desktop app — offline PDF engine plus Meta AI agents — that an estimator can
> download and run with no Python, no Node, no terminal?

## WHY — why a standalone app

- Estimators work on Windows laptops, often on-site with bad network. A browser
  tab plus `uvicorn` plus `vite` is a demo, not a product.
- DesktopT won this market as a fast local app. Our edge is the same local feel
  plus AI agents (SheetScan, QuickDraw, schedule linking, copilot) that work on
  the PDF in front of the user.
- Local-first also matches our architecture: vectors, scale math, and SQLite
  already run offline; only VLM calls need the network. The app stays useful
  offline and gets smarter online (BYOK key = user's own Meta API spend).

## WHAT — what the app is

One installer (`.exe` on Windows) that gives the user:

- A native window with the React canvas (150 DPI viewer, hover badges, ledger).
- A hidden local backend (FastAPI on `127.0.0.1`, frozen Python, no system
  Python needed) that owns PDF parsing, agents, and the SQLite takeoff store.
- Local data dir for projects/DB/exports (per-OS user-data folder, survives
  updates); AI features call `https://api.meta.ai/v1` with the user's key.
- Later: `.pdf` file association (double-click opens in BlueTrace), auto-update,
  crash reporting.

Non-goals for v1: Mac/Linux builds, app-store listing, on-device LLM weights,
multi-user sync.

## WHO — who it is for, who builds it

- Users: MEP estimators and preconstruction engineers on Windows 10/11 x64.
- Installers: same users (one `.exe`, Next-Next-Finish) plus hackathon judges
  (portable ZIP with zero install also works for the demo).
- Builders: this team. No new hires needed: packaging is build scripting around
  the existing Python + React code, plus one shell choice below.

## WHERE — platforms and distribution

- Build on Windows first (our users, our dev machines, our CI).
- Channels in order: (1) portable ZIP for judges/demo, (2) NSIS installer from
  GitHub Releases for pilot users, (3) signed installer + auto-update for
  production. Mac DMG only after Windows is solid — none of these tools
  cross-compile; each OS needs its own CI runner.

## WHEN — phases

| Phase | Output | Gate |
|---|---|---|
| P0 — demo portable (days) | ZIP: frozen backend + frontend `dist` + launcher script | Judge machine runs it with no installs |
| P1 — real installer (1–2 weeks) | NSIS `.exe`, Start Menu, file association | Estimator installs and takeoffs offline |
| P2 — production hardening | Code-signed, auto-update channel, crash logs | SmartScreen clean, updates without reinstall |
| P3 — later | Mac build, on-device small models, store listing | Demand-gated |

## WHICH — options compared

All serious options share one pattern (confirmed across many production apps):
**desktop shell + PyInstaller-frozen Python sidecar**. The shell owns the window
and lifecycle; the sidecar is our FastAPI backend compiled to a binary.

| | A. Electron + sidecar (RECOMMENDED) | B. Tauri + sidecar | C. pywebview single-exe |
|---|---|---|---|
| Shell | Chromium bundled (~120 MB) | OS webview, Rust core (~10 MB) | OS webview, pure Python |
| Backend | PyInstaller onedir in `extraResources`, spawned by Electron main | PyInstaller onedir as `bundle.resources`, spawned via `shell().sidecar()` | Same process: FastAPI thread + `webview.start()` |
| Typical size | ~250–400 MB installed | ~150–250 MB installed | ~120–200 MB single folder |
| New skills needed | Electron main/preload (JS we know) | Rust basics + Tauri config | None (Python only) |
| Auto-update | electron-updater (mature, NSIS delta) | Tauri updater plugin (good, younger) | Hand-rolled (download + relaunch) |
| Risk for us | Big download; two runtimes | `externalBin` fits single files only — onedir sidecars must ship as `bundle.resources` (known trap); Rust learning curve | WebView2 runtime required (Win11 has it; Win10 needs bootstrapper); silent fallback to dead IE engine if missing; weakest windowing/OS integration |
| Best for | Production Windows app, fastest path with our JS-heavy team | Smallest bundle, if we invest in Rust | Quick internal tool, not a flagship |

Rejected: browser-only/PWA (no offline engine, no file association — fails the
brief); Docker (not a desktop app); Nuitka (faster binaries, but weaker
ecosystem for data-file-heavy apps than PyInstaller).

**Recommendation: A (Electron) for P1/P2.** Reasons: team already does
TypeScript; electron-builder emits NSIS + portable ZIP + `latest.yml` from one
config; updater and signing are solved problems; Chromium removes all
"which webview is installed" support pain. Revisit Tauri only if download size
becomes a sales objection. Use C (pywebview) only as a weekend spike if the
Electron shell slips — never as the flagship.

## HOW — build plan (recommended path)

1. **Freeze the backend.** PyInstaller `--onedir` spec over a small entry point
   (`sidecar_entry.py` → uvicorn `src.api.main:app` on `127.0.0.1:<free-port>`,
   prints `READY` + port). onedir, not onefile (faster start, fewer AV false
   positives). Smoke test: frozen binary serves `/api/health` with no dev
   Python on PATH.
2. **Serve the frontend from the backend.** `vite build` → FastAPI mounts
   `dist/` (StaticFiles) with SPA fallback. One port, no CORS in production,
   no Node at runtime. Keep vite `proxy` for dev only.
3. **Electron shell.** `main.ts`: pick free localhost port, spawn sidecar from
   `extraResources`, wait for READY (timeout → error dialog), open window,
   kill sidecar on quit. No direct Node access from the renderer (context
   isolation on; all backend traffic is plain `fetch` to localhost).
4. **Data dirs.** SQLite/exports move from `data/` to the OS user-data dir
   (`%APPDATA%/BlueTraceAI` on Windows) via env override — the `BLUETRACE_DB_PATH`
   hook already exists for this. Never write inside Program Files.
5. **Packaging.** electron-builder: NSIS installer + portable ZIP, per-user
   install default (no admin needed), `.pdf` association in P1.
6. **CI.** Tag-triggered workflow on a Windows runner: build sidecar →
   `vite build` → electron-builder → attach artifacts to GitHub Release.
7. **P2 hardening.** Authenticode sign the installer (cert as CI secret; note
   OV certs still trip SmartScreen until reputation builds — EV or patience);
   enable electron-updater against Releases; add crash log file location to the
   support docs.

## HOW the AI layer lives in the app

- Agents are backend code (SheetScan, schedule parser, crop-OCR, copilot) —
  they ship inside the sidecar unchanged. No agent runs in the renderer.
- Model calls go from sidecar → Meta API with the BYOK key (already
  session-scoped, memory-only). Offline = agents that need VLM disable
  gracefully; vectors/ledger/export keep working (already the design).
- Cost control: crops are tiny by design (150 pt window); SheetScan runs once
  per sheet and caches to SQLite. Key spend stays with the user's key.
- Future: on-device small models (e.g. local symbol detector) can ship as a
  second sidecar file later. Not P1 — cloud VLM first, per ADR-003.

## HOW MUCH — size, effort, cost

- Installed size: ~250–400 MB (Electron ~120 + frozen Python/PyMuPDF/torch-free
  deps ~100–200 + frontend ~10). Portable ZIP similar. Acceptable for a CAD
  tool (DesktopT is larger).
- Effort: P0 ~2–3 days, P1 ~1–2 weeks, P2 ~1 week + cert procurement.
- Money: code-signing cert (~$100–500/yr depending on OV/EV); CI minutes
  (GitHub-hosted Windows runners); Meta API spend stays on user keys.
- New dependencies (justified, mostly build-time): `pyinstaller` (dev-only),
  Electron + electron-builder (frontend shell), nothing at runtime beyond what
  we ship.

## RISKS and open questions

1. **PyMuPDF license.** PyMuPDF is AGPL/commercial dual-licensed: shipping it
   inside a closed commercial installer likely needs a paid Artifex commercial
   license. Confirm with Artifex before any paid distribution; fallback is
   pypdf (BSD) for basic ops with reduced vector fidelity. Do not ignore this.
2. **Windows SmartScreen + AV.** Unsigned installers scare users; PyInstaller
   binaries occasionally trip heuristic AV. Mitigation: sign early (P2),
   onedir over onefile, submit to Microsoft for malware-analysis review.
3. **Sidecar lifecycle bugs.** Port conflicts, orphaned backend after crash,
   slow cold start (first launch extracts/loads ML-adjacent libs). Mitigation:
   free-port picking, READY handshake with timeout, single-instance lock,
   kill-on-quit + stale-lock cleanup.
4. **WebView2 (only if pywebview path is taken).** Must bundle the Evergreen
   bootstrapper for Win10 and hard-fail with a clear message instead of the
   silent IE fallback. Non-issue under Electron (Chromium bundled).
5. **Update-channel security.** Auto-update must verify signatures (`latest.yml`
   + signed binaries); never auto-update over plain HTTP.
6. **Open decisions:** product name on the installer (BlueTraceAI vs MEP Design
   AI remnants — clean first); per-user vs per-machine install default;
   whether judges get the portable ZIP or the installer.

## SOURCES (inspected this run)

- Tauri v2 docs — Embedding External Binaries: `bundle.externalBin`,
  `-<target-triple>` suffix rule, `shell().sidecar(name)`, capability
  permission (`https://v2.tauri.app/develop/sidecar/`).
- Production-pattern evidence (shell + PyInstaller sidecar, onedir over
  onefile, per-OS CI, Tauri `bundle.resources` trap for onedir,
  electron-builder `extraResources`/NSIS/electron-updater/`CSC_LINK` signing,
  SmartScreen OV-vs-reputation): multiple independent project docs found via
  web search (ripple/duct, codeabc, transfera, osusume, smart-data-dico,
  electron-builder skill refs).
- pywebview: WebView2 runtime requirement (Win11 preinstalled, Win10
  bootstrapper), silent MSHTML fallback trap: project docs + pywebview skill
  ref found via web search.
