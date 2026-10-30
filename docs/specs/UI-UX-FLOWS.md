# BlueTraceAI: Real UI/UX Flows (as built)

> The single honest flow after the R-1 migration. Every screen below calls a
> real backend endpoint; nothing here is mock or aspirational. Future items are
> marked FUTURE.

## The loop (60 seconds)

```
Upload PDF ──► SheetScan ──► Canvas ──► Hover badge ──► Ledger ──► Export
                  │              │           │             │
                  │              │           └──► Copilot ─┘
                  │              └──► Schedule ghost pins ─┘
                  └──► Sheet tree (multi-sheet)
```

## Flow 1 — Open a drawing

1. Landing shows `UploadCard`: drop zone, file picker, three fixture buttons.
2. Drop/click a PDF → `POST /api/upload?filename=<name>` with raw PDF bytes (no multipart — backend has no `python-multipart` by design; JSON `{filename, file_base64}` also accepted; ≤150 MB, `%PDF-` magic-byte checked) → server path `data/uploads/<uuid>_<name>.pdf`.
3. Auto `POST /api/sheet-scan {pdf_path, page_index: 0}` → `SheetMetadata` (number, title, discipline, scale + status, size in pt).
4. Workspace opens: sheet tree (left), canvas (center), ledger/schedule tabs (right).
5. Fixture buttons skip upload and scan `fixtures/…` directly (judge path).
- Failure: non-PDF rejected client-side; backend errors render as an alert card with the server message. No silent anything.

## Flow 2 — Read the sheet (canvas)

- `SheetCanvas` renders `GET /api/page-image?file=&page=&dpi=150` (PyMuPDF raster, contained to `fixtures/` + `data/`).
- Pan: left-drag. Zoom: wheel around cursor. Readout shows PDF-point cursor + zoom %.
- Header shows the sheet number/title plus the scale badge: green when `VERIFIED`/`CALIBRATED`, amber `Scale unverified — measurements need review` otherwise. Fail-closed: nothing claims precision the validator did not grant.
- Multi-sheet: each scan appends to the session list; `SheetTree` switches the active sheet (canvas + ledger follow).

## Flow 3 — QuickDraw dimensioning (the thesis interaction)

1. Hover still ~400 ms (or press `Q`) over a duct run → canvas captures a 150 pt window centered on the cursor, rendered to a 312×312 crop.
2. `POST /api/crop-ocr {sheet_id, cursor_pt, crop_size_pt: 150, image_base64}` → `{detected_text, parsed_dimension, confidence, review_required, latency_ms}`.
3. `HoverBadge` floats at the cursor: dimension text, confidence, latency. Amber `Review` state when the model is unsure — Accept is hidden then (no approving guesses).
4. Accept → `POST /api/takeoff/items` (`QUICKDRAW_HOVER`, `ACCEPTED`, cursor-point geometry, dimension label) → ledger refreshes. Reject/✕ dismisses.
5. Mock mode (no key): badge shows `review_required=True`, confidence 0 — visibly not a measurement.

## Flow 4 — Ledger review and export

- `LedgerPanel` lists `GET /api/takeoff/items?sheet_id=…` split into Needs review (`SUGGESTED`, amber, Accept/Reject buttons) and Accepted (green, footage).
- Every accept/reject is `PATCH /api/takeoff/items/{id}/status` + a `review_events` audit row (who/what/when).
- Footer shows accepted count, suggested count, verified footage from `GET /api/takeoff/summary`.
- Export buttons download server-built files: `GET /api/takeoff/export/csv|json` (CSV now includes item rows with coordinates).

## Flow 5 — Schedule linking

1. `SchedulePanel`: name the schedule, choose a schedule-crop image.
2. Client fetches `GET /api/page-text` (native text blocks + bboxes) and posts both to `POST /api/schedule/parse`.
3. Response: parsed rows auto-create `SUGGESTED` takeoff records; matched tags become amber ghost pins on the canvas (`VAV-1`, `S1`…); unmatched stay listed for manual placement.
4. Estimator reviews ghosts on canvas, accepts in the ledger. Nothing self-approves.

## Flow 6 — Copilot

- Floating `Ask the drawing` button or top-nav Copilot opens `CopilotDrawer`.
- Streams `POST /api/copilot/stream` (SSE) with fallback to one-shot `POST /api/copilot`.
- Every answer carries provenance: `muse-wonder-1.0` badge when the model answered, `offline template` otherwise, plus a scale-unverified warning when applicable.
- Cited coordinates become cyan evidence pins on the canvas.

## Flow 7 — API key (BYOK)

- Top-nav `AI key`/`AI on` opens `ByokDialog`: paste key → `POST /api/auth/byok` (body, never query) → masked `••••1234` confirm; clear → `DELETE /api/auth/byok` (this session only).
- Key lives in server memory with 4-hour expiry and per-session opt-out. Without a key, VLM features visibly degrade; vectors, ledger, and export keep working.

## Screen states (User_flows.md contract)

| State | Where it shows |
|---|---|
| Loading | Upload ("Working…"), canvas ("Rendering sheet…"), ledger ("Loading ledger…"), copilot (`…` streaming) |
| Empty | Ledger `EmptyPanel` ("No takeoff items yet"); copilot hint; upload card is the idle state |
| Error | Alert cards with server messages; canvas render-failure message; copilot error row |
| Success | Scale badge, badge accept, ledger rows, export downloads, masked-key confirm |
| Offline | Backend dot in top nav (`Offline`); VLM calls fail with messages, local features unaffected |

## Wiring map (component → endpoint)

| Component | Endpoints |
|---|---|
| `UploadCard` + `useTakeoffSession` | `POST /api/upload`, `POST /api/sheet-scan`, `GET /api/health` |
| `SheetCanvas` | `GET /api/page-image`, `POST /api/crop-ocr` |
| `SheetTree` | session list (no calls; parent rescans) |
| `LedgerPanel` | `GET /api/takeoff/items`, `GET /api/takeoff/summary`, `PATCH …/status`, `GET /api/takeoff/export/*` |
| `SchedulePanel` | `GET /api/page-text`, `POST /api/schedule/parse` |
| `CopilotPanel` | `POST /api/copilot/stream`, `POST /api/copilot` |
| `ByokDialog` | `POST/DELETE /api/auth/byok` |
| Nothing yet (FUTURE) | `POST /api/segment`, `POST /api/files/upload` |

## Deliberately removed (R-1)

Projects, runs, jobs, preflight, viewports-as-a-service, and the `/api/v1/*` client (28 methods, ~50 files, 59 obsolete tests). They called a backend that does not exist. Deleted, not deprecated — the contract test forbids their return.
