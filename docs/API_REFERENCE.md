# BlueTraceAI — REST & SSE API Reference

**Generated**: `2026-11-03T14:51:14Z`  
**OpenAPI Version**: `3.1.0`  
**Service Title**: `BlueTraceAI API` (`v1.0.0`)  
**Source of Truth**: `src/api/main.py` & `src/api/routes.py`

---

## 1. Endpoint Summary Table

| Method | Path | Summary | Operation ID |
|---|---|---|---|
| `POST` | `/api/agents/orchestrate` | Run Agent Orchestration | `run_agent_orchestration_api_agents_orchestrate_post` |
| `POST` | `/api/agents/reconcile` | Run Schedule Reconciler | `run_schedule_reconciler_api_agents_reconcile_post` |
| `POST` | `/api/agents/watchdog` | Run Watchdog Qa | `run_watchdog_qa_api_agents_watchdog_post` |
| `DELETE` | `/api/auth/byok` | Clear Byok | `clear_byok_api_auth_byok_delete` |
| `POST` | `/api/auth/byok` | Configure Byok | `configure_byok_api_auth_byok_post` |
| `POST` | `/api/copilot` | Query Copilot | `query_copilot_api_copilot_post` |
| `POST` | `/api/copilot/stream` | Stream Copilot | `stream_copilot_api_copilot_stream_post` |
| `POST` | `/api/crop-ocr` | Extract Cursor Crop | `extract_cursor_crop_api_crop_ocr_post` |
| `POST` | `/api/feedback/events` | Record Feedback Event Route | `record_feedback_event_route_api_feedback_events_post` |
| `POST` | `/api/files/upload` | Upload To Meta Files | `upload_to_meta_files_api_files_upload_post` |
| `GET` | `/api/health` | Health Check | `health_check_api_health_get` |
| `POST` | `/api/intake/batch` | Start Intake Batch | `start_intake_batch_api_intake_batch_post` |
| `GET` | `/api/intake/jobs/{job_id}/events` | Stream Intake Events | `stream_intake_events_api_intake_jobs__job_id__events_get` |
| `GET` | `/api/page-image` | Render Page Image | `render_page_image_api_page_image_get` |
| `GET` | `/api/page-text` | Extract Page Text | `extract_page_text_api_page_text_get` |
| `GET` | `/api/projects` | List Projects | `list_projects_api_projects_get` |
| `GET` | `/api/projects/{project_id}/session` | Get Project Session | `get_project_session_api_projects__project_id__session_get` |
| `PUT` | `/api/projects/{project_id}/session` | Save Project Session | `save_project_session_api_projects__project_id__session_put` |
| `GET` | `/api/qa/annotations` | List Qa Annotations | `list_qa_annotations_api_qa_annotations_get` |
| `PATCH` | `/api/qa/annotations/{annotation_id}` | Resolve Qa Annotation | `resolve_qa_annotation_api_qa_annotations__annotation_id__patch` |
| `POST` | `/api/schedule/parse` | Parse Schedule | `parse_schedule_api_schedule_parse_post` |
| `POST` | `/api/segment` | Segment Concept | `segment_concept_api_segment_post` |
| `POST` | `/api/sheet-scan` | Scan Drawing Sheet | `scan_drawing_sheet_api_sheet_scan_post` |
| `POST` | `/api/sheets/scan-all` | Scan All Sheets | `scan_all_sheets_api_sheets_scan_all_post` |
| `PATCH` | `/api/sheets/{sheet_id}/calibration` | Calibrate Sheet Scale | `calibrate_sheet_scale_api_sheets__sheet_id__calibration_patch` |
| `POST` | `/api/sheets/{sheet_id}/legend` | Scan Sheet Legend | `scan_sheet_legend_api_sheets__sheet_id__legend_post` |
| `GET` | `/api/sheets/{sheet_id}/linework` | Get Sheet Linework | `get_sheet_linework_api_sheets__sheet_id__linework_get` |
| `GET` | `/api/takeoff/export/csv` | Export Takeoff Csv | `export_takeoff_csv_api_takeoff_export_csv_get` |
| `GET` | `/api/takeoff/export/json` | Export Takeoff Json | `export_takeoff_json_api_takeoff_export_json_get` |
| `GET` | `/api/takeoff/items` | List Takeoff Items | `list_takeoff_items_api_takeoff_items_get` |
| `POST` | `/api/takeoff/items` | Create Takeoff Item | `create_takeoff_item_api_takeoff_items_post` |
| `GET` | `/api/takeoff/items/{item_id}/history` | Get Takeoff Item History | `get_takeoff_item_history_api_takeoff_items__item_id__history_get` |
| `PATCH` | `/api/takeoff/items/{item_id}/status` | Update Takeoff Status | `update_takeoff_status_api_takeoff_items__item_id__status_patch` |
| `POST` | `/api/takeoff/reconcile` | Reconcile Takeoff Route | `reconcile_takeoff_route_api_takeoff_reconcile_post` |
| `GET` | `/api/takeoff/summary` | Get Takeoff Summary | `get_takeoff_summary_api_takeoff_summary_get` |
| `GET` | `/api/thumbnails/{project_id}/p{page_index}.webp` | Get Sheet Thumbnail | `get_sheet_thumbnail_api_thumbnails__project_id__p_page_index__webp_get` |
| `POST` | `/api/upload` | Upload Drawing | `upload_drawing_api_upload_post` |
| `GET` | `/{full_path}` | Serve Spa | `serve_spa__full_path__get` |

---

## 2. Detailed Endpoint Specifications

### `POST /api/agents/orchestrate`

- **Summary**: Run Agent Orchestration
- **Description**: Runs the full agent pipeline (recon -> route -> perceive -> persist) on one PDF.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `OrchestrateRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/agents/reconcile`

- **Summary**: Run Schedule Reconciler
- **Description**: Runs Agent 04 schedule reconciliation on one indexed (or standalone) schedule sheet.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `ReconcileAgentRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/agents/watchdog`

- **Summary**: Run Watchdog Qa
- **Description**: Runs Agent 05 watchdog QA (RULES_ONLY) over a project's ledger.
- **Request Body** (`application/json`): `WatchdogRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `DELETE /api/auth/byok`

- **Summary**: Clear Byok
- **Description**: Clears runtime API key for this session only.

The opt-out is scoped to the calling session: other sessions keep their
keys, and a session that never opted out still resolves normally.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/auth/byok`

- **Summary**: Configure Byok
- **Description**: Configures evaluation API key in server memory only (never written to disk or logs).
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `ByokRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/copilot`

- **Summary**: Query Copilot
- **Description**: Natural language drawing query grounded in project database and active sheet.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `CopilotQueryRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/copilot/stream`

- **Summary**: Stream Copilot
- **Description**: Streams natural language drawing copilot responses using Server-Sent Events (SSE).
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `CopilotQueryRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/crop-ocr`

- **Summary**: Extract Cursor Crop
- **Description**: Sub-second point-of-need hover dimension extraction from a 300x300 px crop.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `CursorCropRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/feedback/events`

- **Summary**: Record Feedback Event Route
- **Description**: Persist one engineer review interaction for the learning backlog.

Fail-closed training gate: the store always writes
``training_eligible = 0``; this endpoint never accepts an eligibility
flag, so no client can self-certify a record as training data. Unknown
projects yield HTTP 404 and persist nothing; the context crop is
best-effort and never fails the event (unknown sheet, unresolvable PDF,
or crop error all persist the event with a NULL relpath).
- **Request Body** (`application/json`): `FeedbackEventRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/files/upload`

- **Summary**: Upload To Meta Files
- **Description**: Uploads local blueprint PDF to Meta Files API cache.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `MetaFileUploadRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/health`

- **Summary**: Health Check
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/intake/batch`

- **Summary**: Start Intake Batch
- **Description**: Fast batch intake: reconnaissance index + thumbnails, replayed over SSE.

Runs the native-text reconnaissance scan (no VLM, no raster beyond
low-DPI thumbnails), persists every sheet, renders thumbnails, and
records a per-page event log (``progress`` / ``sheet_indexed`` /
``thumbnail_ready`` / ``complete`` / ``error``) under a job id that
``GET /api/intake/jobs/{job_id}/events`` replays as SSE.

``project_id`` is user input that becomes a cache directory name, so it is
validated before any filesystem work (400, never a traversal).
- **Request Body** (`application/json`): `IntakeBatchRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/intake/jobs/{job_id}/events`

- **Summary**: Stream Intake Events
- **Description**: Replay a batch intake job's event log as Server-Sent Events.

The replayed stream always ends with a terminal ``complete`` or ``error``
frame: when the stored log has no terminal event yet (e.g. the job is
still running), a closing frame is synthesised so clients never wait on a
stream that will never finish.
- **Parameters**:
  - `job_id` (path, `string`, required)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/page-image`

- **Summary**: Render Page Image
- **Description**: Renders one drawing sheet page to PNG for the canvas viewer.
- **Parameters**:
  - `pdf_path` (query, `string`, required)
  - `page_index` (query, `integer`, optional)
  - `dpi` (query, `integer`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/page-text`

- **Summary**: Extract Page Text
- **Description**: Extracts native text blocks with bounding boxes for schedule-to-plan linking.
- **Parameters**:
  - `pdf_path` (query, `string`, required)
  - `page_index` (query, `integer`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/projects`

- **Summary**: List Projects
- **Description**: List all projects with sheet/item counts and last session timestamp.
- **Responses**: `200` (Successful Response)

### `GET /api/projects/{project_id}/session`

- **Summary**: Get Project Session
- **Description**: Return consolidated rehydration payload (session, sheets, summary).

Fail-closed: unknown projects yield HTTP 404 and never auto-create rows
through this read path beyond the session default row for known projects.
- **Parameters**:
  - `project_id` (path, `string`, required)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `PUT /api/projects/{project_id}/session`

- **Summary**: Save Project Session
- **Description**: Persist viewport coordinates and tool state for a project session.

Fail-closed: unknown projects yield HTTP 404; invalid payloads are
rejected by schema validation (422) before anything is persisted.
- **Parameters**:
  - `project_id` (path, `string`, required)
- **Request Body** (`application/json`): `SessionStatePayload`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/qa/annotations`

- **Summary**: List Qa Annotations
- **Description**: Lists watchdog QA annotation tasks (the human review queue).
- **Parameters**:
  - `project_id` (query, `string`, required)
  - `sheet_id` (query, `string`, optional)
  - `status` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `PATCH /api/qa/annotations/{annotation_id}`

- **Summary**: Resolve Qa Annotation
- **Description**: Confirms or dismisses one QA annotation (the human gate).
- **Parameters**:
  - `annotation_id` (path, `string`, required)
- **Request Body** (`application/json`): `QAResolveRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/schedule/parse`

- **Summary**: Parse Schedule
- **Description**: Extracts schedule table rows via muse-spark-1.3 and links to floor plan.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `ScheduleParseRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/segment`

- **Summary**: Segment Concept
- **Description**: Invokes SAM 3.1 (/v1/responses) to segment visual concepts.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `SegmentConceptRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/sheet-scan`

- **Summary**: Scan Drawing Sheet
- **Description**: Automated SheetScan title block reconnaissance via muse-spark-1.3.

Scanning persists the sheet and, unless disabled, automatically runs
vector extraction into the takeoff ledger for that sheet.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `SheetScanRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/sheets/scan-all`

- **Summary**: Scan All Sheets
- **Description**: Scan every page of a drawing set and auto-populate the takeoff ledger.

Total pages come from the PDF itself; each page yields sheet metadata
with cached dimensions, and each sheet's vector runs land in the ledger
under the fail-closed scale rule.
- **Parameters**:
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `SheetScanAllRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `PATCH /api/sheets/{sheet_id}/calibration`

- **Summary**: Calibrate Sheet Scale
- **Description**: Two-point manual scale calibration for a sheet.

Derives the denominator ratio from the paper distance between p1/p2 and
the stated real-world feet/inches, snaps a canonical scale string, marks
the sheet CALIBRATED, and recomputes VECTOR_ENGINE footage atomically.
A paper line shorter than 5 pt is a 400 (never a silent scale).
- **Parameters**:
  - `sheet_id` (path, `string`, required)
- **Request Body** (`application/json`): `SheetCalibrationRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/sheets/{sheet_id}/legend`

- **Summary**: Scan Sheet Legend
- **Description**: Extract a sheet's legend symbol dictionary via muse-spark-1.3.

Fail-closed: an unconfigured Meta client must not reach the scanner's
mock path (which fabricates symbols), so the route returns an explicit
review-required result with no symbols instead.
- **Parameters**:
  - `sheet_id` (path, `string`, required)
  - `X-Session-ID` (header, `string`, optional)
- **Request Body** (`application/json`): `LegendScanRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/sheets/{sheet_id}/linework`

- **Summary**: Get Sheet Linework
- **Description**: Lazy vector extraction for one sheet, cached in the takeoff ledger.

Warms the 150 DPI pixmap LRU, then returns existing ``VECTOR_ENGINE``
rows when the sheet was already measured. Only when no vector rows
exist does it run ``run_l2_pipeline`` in a worker thread and persist
the records — repeat views never re-run the engine. Non-MEP
disciplines return an empty result (the engine only measures MEP
linework; never relabel other disciplines as ductwork).
- **Parameters**:
  - `sheet_id` (path, `string`, required)
  - `pdf_path` (query, `string`, required)
  - `page_index` (query, `string`, optional)
  - `discipline` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/takeoff/export/csv`

- **Summary**: Export Takeoff Csv
- **Description**: Export standard Estimating compatible CSV takeoff file.

Item rows (with physical coordinates and footage) are included by
default so an export always carries auditable geometry.
- **Parameters**:
  - `project_id` (query, `string`, optional)
  - `sheet_id` (query, `string`, optional)
  - `include_items` (query, `boolean`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/takeoff/export/json`

- **Summary**: Export Takeoff Json
- **Description**: Export complete structured takeoff dataset with summary and line items.
- **Parameters**:
  - `project_id` (query, `string`, optional)
  - `sheet_id` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/takeoff/items`

- **Summary**: List Takeoff Items
- **Description**: Retrieve takeoff line items with optional project, sheet, or status filters.
- **Parameters**:
  - `project_id` (query, `string`, optional)
  - `sheet_id` (query, `string`, optional)
  - `status` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/takeoff/items`

- **Summary**: Create Takeoff Item
- **Description**: Add a new takeoff item to the ledger.
- **Request Body** (`application/json`): `TakeoffRecord`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/takeoff/items/{item_id}/history`

- **Summary**: Get Takeoff Item History
- **Description**: Chronological append-only audit trail for one takeoff item.
- **Parameters**:
  - `item_id` (path, `string`, required)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `PATCH /api/takeoff/items/{item_id}/status`

- **Summary**: Update Takeoff Status
- **Description**: One-click Accept, Correct, Reject, or Cannot-Determine human decision.

Fail-closed: unknown items are 404, illegal transitions are 400,
acceptance on an UNVERIFIED-scale sheet is 409, and missing/invalid
override reasons are 422 (enforced by schema validation above and by
the store as defense in depth).
- **Parameters**:
  - `item_id` (path, `string`, required)
- **Request Body** (`application/json`): `StatusUpdateRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/takeoff/reconcile`

- **Summary**: Reconcile Takeoff Route
- **Description**: Reconcile scheduled equipment against plan symbols (deterministic, offline).

Only ``reconcile_takeoff`` is called: the dict/store convenience wrappers
fabricate confidence/coordinate defaults and are forbidden here.
Ghost-pin ``location_pt`` values in the report are dock/suggested
placement coordinates, never measured equipment locations.
- **Request Body** (`application/json`): `TakeoffReconcileRequest`
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/takeoff/summary`

- **Summary**: Get Takeoff Summary
- **Description**: Aggregated ledger summary grouped by category, system, and dimension label.
- **Parameters**:
  - `project_id` (query, `string`, optional)
  - `sheet_id` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /api/thumbnails/{project_id}/p{page_index}.webp`

- **Summary**: Get Sheet Thumbnail
- **Description**: Serve one cached sheet thumbnail rendered by the intake pipeline.

``project_id`` carries the same validator as the thumbnail writer
(400 on traversal/separators, never a write or read outside the cache
root); unknown pages are 404. When this build wrote a PNG fallback
instead of WebP, the ``.webp`` URL still resolves to the ``.png`` file.
- **Parameters**:
  - `project_id` (path, `string`, required)
  - `page_index` (path, `integer`, required)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `POST /api/upload`

- **Summary**: Upload Drawing
- **Description**: Accepts blueprint drawing PDF via raw binary stream or JSON base64.
- **Parameters**:
  - `filename` (query, `string`, optional)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

### `GET /{full_path}`

- **Summary**: Serve Spa
- **Parameters**:
  - `full_path` (path, `string`, required)
- **Responses**: `200` (Successful Response), `422` (Validation Error)

---

## 3. Core Component Schemas

| Schema Name | Properties | Required Fields |
|---|---|---|
| `ByokRequest` | `api_key` | `api_key` |
| `ByokResponse` | `configured`, `masked_key`, `session_id` | `configured` |
| `CopilotQueryRequest` | `sheet_id`, `query`, `selection_bbox` | `query` |
| `CopilotQueryResponse` | `answer`, `cited_coordinates`, `referenced_item_ids`, `scale_verified`, `model_used` | `answer`, `scale_verified` |
| `CursorCropRequest` | `sheet_id`, `cursor_pt`, `crop_size_pt`, `image_base64` | `sheet_id`, `cursor_pt`, `image_base64` |
| `CursorCropResponse` | `latency_ms`, `detected_text`, `parsed_dimension`, `confidence`, `badge_text`, `review_required` | `latency_ms`, `detected_text`, `confidence`, `badge_text` |
| `DimensionExtraction` | `width_in`, `height_in`, `shape` | `width_in` |
| `DiscrepancyItem` | `item_id`, `tag`, `label`, `schedule_qty`, `plan_qty`, `variance`, `status`, `notes`, `severity`, `suggested_action`, … (+6 more) | `tag`, `label`, `variance`, `status` |
| `FeedbackEventRequest` | `project_id`, `sheet_id`, `item_id`, `task_type`, `action`, `previous_status`, `new_status`, `original_output`, `corrected_output`, `correction_reason`, … (+5 more) | `project_id`, `sheet_id`, `task_type`, `action`, `previous_status`, `new_status` |
| `FeedbackEventResponse` | `feedback_id`, `training_eligible` | `feedback_id` |
| `GhostPin` | `ghost_id`, `tag`, `description`, `schedule_ref`, `suggested_discipline`, `status`, `location_pt`, `suggested_system`, `quantity`, `schedule_row_data`, … (+2 more) | `tag`, `schedule_ref` |
| `HTTPValidationError` | `detail` | — |
| `IntakeBatchRequest` | `pdf_path`, `project_id` | `pdf_path` |
| `IntakeJobStatus` | `job_id`, `status`, `project_id`, `pdf_path`, `total_pages`, `sheets_indexed`, `thumbnails_ready`, `error` | `job_id`, `status`, `project_id`, `pdf_path` |
| `LedgerSummaryRow` | `category`, `system`, `dimension_label`, `total_length_ft`, `total_count`, `accepted_count`, `suggested_count`, `rejected_count` | `category`, `system`, `dimension_label`, `total_length_ft`, `total_count`, `accepted_count`, `suggested_count`, `rejected_count` |
| `LegendScanRequest` | `pdf_path`, `page_index` | `pdf_path` |
| `LineworkResponse` | `sheet_id`, `cached`, `run_count`, `items_created`, `items` | `sheet_id`, `cached`, `run_count`, `items_created`, `items` |
| `MetaFileUploadRequest` | `file_path` | `file_path` |
| `MetaFileUploadResponse` | `file_id`, `filename`, `status` | `file_id`, `filename` |
| `OrchestrateRequest` | `file_path`, `project_id`, `job_id` | `file_path` |
| `OrchestrateResponse` | `job_id`, `project_id`, `document_map`, `routes`, `flags`, `sheets_processed` | `job_id`, `project_id`, `document_map`, `routes`, `flags`, `sheets_processed` |
| `PlanSymbolInstance` | `symbol_id`, `label`, `description`, `sheet_id`, `location_pt`, `confidence`, `status`, `bounding_box_pt`, `system`, `discipline`, … (+2 more) | `label`, `sheet_id`, `location_pt` |
| `ProjectSummaryResponse` | `project_id`, `name`, `created_at`, `sheet_count`, `item_count`, `updated_at` | `project_id`, `name`, `created_at` |
| `QAAnnotationResponse` | `annotation_id`, `project_id`, `sheet_id`, `annotation_type`, `reason_code`, `severity`, `message`, `geometry`, `evidence_ids`, `source_agent`, … (+4 more) | `annotation_id`, `project_id`, `annotation_type`, `reason_code`, `severity`, `status`, `created_at`, `updated_at` |
| `QAResolveRequest` | `status`, `resolution_reason` | `status` |
| `ReconcileAgentRequest` | `project_id`, `file_path`, `page_index`, `schedule_title`, `plan_sheet_ids`, `job_id` | `project_id`, `file_path` |
| `ReconcileAgentResponse` | `job_id`, `project_id`, `schedule_sheet_id`, `indexed`, `rows`, `links`, `family_counts`, `report`, `flags`, `mock_rows`, … (+1 more) | `job_id`, `project_id`, `schedule_sheet_id`, `indexed`, `rows`, `links`, `family_counts`, `report`, `flags`, `mock_rows`, `review_required` |
| `ReconciliationReport` | `reconciliation_id`, `project_id`, `timestamp`, `total_scheduled`, `total_counted`, `total_matched`, `total_undercounts`, `total_overcounts`, `total_unscheduled`, `total_ghosts`, … (+5 more) | — |
| `ReviewEventResponse` | `event_id`, `item_id`, `action`, `previous_status`, `new_status`, `reason`, `timestamp` | `event_id`, `item_id`, `action`, `previous_status`, `new_status`, `timestamp` |
| `ScheduleParseRequest` | `image_base64`, `schedule_title`, `project_id`, `sheet_id`, `page_text_blocks` | `image_base64` |
| `ScheduledEquipmentItem` | `tag`, `description`, `schedule_sheet`, `row_data`, `quantity`, `discipline`, `system`, `cfm`, `dimension`, `entry_id` | `tag`, `schedule_sheet` |
| `SegmentConceptRequest` | `image_base64`, `concept_prompt` | `image_base64` |
| `SessionStatePayload` | `project_id`, `active_sheet_id`, `viewport_scale`, `viewport_tx`, `viewport_ty`, `selected_pin_id`, `active_tool_mode`, `discipline_filter`, `search_query` | `project_id` |
| `SheetCalibrationRequest` | `p1`, `p2`, `real_ft`, `real_in` | `p1`, `p2`, `real_ft` |
| `SheetCalibrationResponse` | `sheet_id`, `scale_ratio`, `scale_raw`, `scale_status`, `updated_items`, `skipped_items` | `sheet_id`, `scale_ratio`, `scale_raw`, `updated_items` |
| `SheetMetadata` | `sheet_id`, `page_index`, `sheet_number`, `sheet_title`, `discipline`, `scale_raw`, `scale_ratio`, `scale_status`, `width_pt`, `height_pt`, … (+1 more) | `sheet_id`, `page_index`, `sheet_number`, `sheet_title`, `discipline`, `width_pt`, `height_pt` |
| `SheetScanAllRequest` | `pdf_path`, `project_id`, `auto_takeoff` | `pdf_path` |
| `SheetScanAllResponse` | `pdf_path`, `project_id`, `total_pages`, `sheets`, `takeoff`, `errors` | `pdf_path`, `project_id`, `total_pages`, `sheets`, `takeoff` |
| `SheetScanRequest` | `pdf_path`, `page_index`, `project_id`, `auto_takeoff` | `pdf_path` |
| `SheetTakeoffOutcome` | `sheet_id`, `run_count`, `items_created`, `accepted_count`, `suggested_count` | `sheet_id`, `run_count`, `items_created`, `accepted_count`, `suggested_count` |
| `StatusUpdateRequest` | `status`, `action`, `reason` | `status` |
| `TakeoffReconcileRequest` | `project_id`, `sheet_id`, `scheduled_items`, `plan_symbols`, `symbol_counts` | `scheduled_items` |
| `TakeoffRecord` | `item_id`, `project_id`, `sheet_id`, `category`, `system`, `dimension_label`, `status`, `source`, `total_length_ft`, `count`, … (+12 more) | `project_id`, `sheet_id`, `category` |
| `UploadResponse` | `filename`, `file_path`, `byte_size`, `sha256` | `filename`, `file_path`, `byte_size`, `sha256` |
| `ValidationError` | `loc`, `msg`, `type`, `input`, `ctx` | `loc`, `msg`, `type` |
| `WatchdogRequest` | `project_id`, `job_id`, `sheet_ids`, `reconcile_flags` | `project_id` |
| `WatchdogResponse` | `job_id`, `project_id`, `annotations`, `checklist`, `checks_run`, `rules_only`, `persisted`, `review_required` | `job_id`, `project_id`, `annotations`, `checklist`, `checks_run`, `rules_only`, `persisted`, `review_required` |

---

## 4. Constitutional API Invariants

1. **Fail-Closed Scale Conflict (`HTTP 409 Conflict`)**: Calling `PATCH /api/takeoff/{item_id}` with `status="ACCEPTED"` on a sheet where `scale_calibrated == False` or `scale_ratio <= 0.0` is strictly rejected with `HTTP 409 Conflict`.
2. **Reason Code Governance (`HTTP 422 Unprocessable Entity` / `HTTP 400 Bad Request`)**: Overriding (`CORRECTED`), rejecting (`REJECTED`), or dismissing a QA annotation (`DISMISSED`) without a valid reason code is rejected at the API boundary.
3. **Standalone SPA vs API Isolation (`HTTP 404 Not Found`)**: In standalone single-port mode (`src/api/main.py`), any unmatched `/api` or `/api/*` request returns a JSON `HTTP 404` payload and never falls back to the HTML SPA bundle.
