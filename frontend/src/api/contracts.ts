/**
 * BlueTraceAI API contracts.
 *
 * Mirrors `src/models/schemas.py` plus the takeoff-store records. These are the
 * ONLY shapes the UI may use — there is no project/run/job layer.
 */

export type ScaleStatus = 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED';
export type ReviewStatus = 'SUGGESTED' | 'ACCEPTED' | 'REJECTED';
export type TakeoffCategory = 'DUCTWORK' | 'PIPING' | 'EQUIPMENT' | 'FIXTURE';
export type TakeoffSource = 'QUICKDRAW_HOVER' | 'VECTOR_ENGINE' | 'VLM_DETECTION' | 'MANUAL';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  meta_model_api_configured: boolean;
  models: Record<string, string>;
}

export interface UploadResponse {
  filename: string;
  /** Workspace-relative server path, e.g. `data/uploads/<uuid>_plan.pdf`. */
  file_path: string;
  byte_size: number;
  sha256: string;
}

export interface SheetMetadata {
  sheet_id: string;
  page_index: number;
  sheet_number: string;
  sheet_title: string;
  discipline: string;
  scale_raw?: string | null;
  scale_ratio?: number | null;
  scale_status: ScaleStatus;
  width_pt: number;
  height_pt: number;
  dpi: number;
}

export interface PageTextBlock {
  text: string;
  /** [x0, y0, x1, y1] in PDF points. */
  bbox: [number, number, number, number];
}

export interface PageTextResponse {
  pdf_path: string;
  page_index: number;
  blocks: PageTextBlock[];
}

export interface DimensionExtraction {
  width_in: number;
  height_in?: number | null;
  shape: string;
}

export interface CursorCropResponse {
  latency_ms: number;
  detected_text: string;
  parsed_dimension?: DimensionExtraction | null;
  confidence: number;
  badge_text: string;
  review_required: boolean;
}

export interface ScheduledItem {
  tag: string;
  category: string;
  description: string;
  system: string;
  cfm?: number | null;
  dimension?: string | null;
  located_on_plan: boolean;
  plan_coordinates_pt?: [number, number] | null;
}

export interface ScheduleParseResponse {
  scheduled_items_total: number;
  linked_takeoff_records: number;
  unplaced_ghost_pins: ScheduledItem[];
}

export interface TakeoffRecord {
  item_id: string;
  project_id: string;
  sheet_id: string;
  category: TakeoffCategory;
  system: string;
  dimension_label: string;
  status: ReviewStatus;
  source: TakeoffSource;
  total_length_ft: number;
  count: number;
  geometry: Record<string, unknown> | unknown[];
  confidence?: number | null;
  review_required?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SheetTakeoffOutcome {
  sheet_id: string;
  run_count: number;
  items_created: number;
  accepted_count: number;
  suggested_count: number;
}

export interface SheetScanAllResponse {
  pdf_path: string;
  project_id: string;
  total_pages: number;
  sheets: SheetMetadata[];
  takeoff: SheetTakeoffOutcome[];
  errors: string[];
}

/** Mirrors backend `IntakeJobEvent` (src/models/schemas.py). */
export type IntakeEventKind =
  | 'progress'
  | 'sheet_indexed'
  | 'thumbnail_ready'
  | 'complete'
  | 'error';

export interface IntakeJobEvent {
  job_id: string;
  event: IntakeEventKind;
  page_index?: number | null;
  sheet_id?: string | null;
  progress: number;
  message?: string | null;
}

/** Mirrors backend `IntakeJobStatus` (src/models/schemas.py). */
export interface IntakeJobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  project_id: string;
  pdf_path: string;
  total_pages: number;
  sheets_indexed: number;
  thumbnails_ready: number;
  error?: string | null;
}

export interface LedgerSummaryRow {
  category: string;
  system: string;
  dimension_label: string;
  total_length_ft: number;
  total_count: number;
  accepted_count: number;
  suggested_count: number;
  rejected_count: number;
}

export interface CopilotQueryResponse {
  answer: string;
  cited_coordinates: number[][];
  referenced_item_ids: string[];
  scale_verified: boolean;
  /** True only when muse-wonder-1.0 produced the answer. Never assume it. */
  model_used: boolean;
}

export interface SegmentResponse {
  concept?: string;
  masks: unknown[];
  polygons: number[][][];
  confidence: number;
  mock?: boolean;
}

export interface ByokResponse {
  configured: boolean;
  masked_key?: string | null;
  session_id?: string | null;
}

export type SessionToolMode = 'select' | 'pan' | 'quickdraw' | 'segment' | 'calibrate';

export interface ProjectSessionState {
  session_id: string;
  project_id: string;
  active_sheet_id?: string | null;
  viewport_scale: number;
  viewport_tx: number;
  viewport_ty: number;
  selected_pin_id?: string | null;
  active_tool_mode: SessionToolMode;
  discipline_filter: string;
  search_query: string;
  updated_at: string;
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  created_at: string;
  sheet_count: number;
  item_count: number;
  updated_at?: string | null;
}

export interface ProjectSessionResponse {
  session: ProjectSessionState;
  sheets: SheetMetadata[];
  summary: LedgerSummaryRow[];
}

export type DiscrepancyStatus =
  | 'MATCHED'
  | 'UNDERCOUNT'
  | 'OVERCOUNT'
  | 'UNSCHEDULED'
  | 'UNPLACED_GHOST';

export type DiscrepancySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DiscrepancyItem {
  item_id: string;
  tag: string;
  label?: string;
  schedule_qty: number;
  plan_qty: number;
  variance: number;
  status: DiscrepancyStatus;
  severity: DiscrepancySeverity;
  suggested_action?: string;
  discipline?: string;
  system?: string;
  notes?: string;
  schedule_sheet?: string;
  plan_sheets?: string[];
  location_pt?: [number, number] | null;
  matched_symbol_ids?: string[];
  equipment_type?: string;
  cfm?: number | null;
}

/** Mirrors backend `ScheduledEquipmentItem` (src/store/reconciler.py). */
export interface ReconcileScheduledItem {
  tag: string;
  description?: string;
  schedule_sheet: string;
  row_data?: Record<string, unknown>;
  quantity?: number;
  discipline?: string | null;
  system?: string;
  cfm?: number | null;
  dimension?: string | null;
  entry_id?: string;
}

/** Mirrors backend `PlanSymbolInstance` (src/store/reconciler.py). */
export interface ReconcilePlanSymbol {
  symbol_id?: string;
  label: string;
  description?: string;
  sheet_id: string;
  location_pt: [number, number];
  confidence?: number;
  status?: 'DETECTED' | 'VERIFIED' | 'SUGGESTED' | 'ACCEPTED' | 'REJECTED';
  bounding_box_pt?: [number, number, number, number] | number[] | null;
  system?: string;
  discipline?: string | null;
  category?: string;
  source?: 'VLM_DETECTION' | 'VECTOR_ENGINE' | 'MANUAL' | 'QUICKDRAW_HOVER';
}

/** POST /api/takeoff/reconcile — mirrors backend `TakeoffReconcileRequest`. */
export interface ReconcileRequest {
  project_id?: string | null;
  sheet_id?: string | null;
  scheduled_items: ReconcileScheduledItem[];
  plan_symbols?: ReconcilePlanSymbol[] | null;
  symbol_counts?: Record<string, number> | null;
}

/** Mirrors backend `GhostPin` (src/store/reconciler.py). */
export interface ReconcileGhostPin {
  ghost_id: string;
  tag: string;
  description: string;
  status: 'UNPLACED' | 'PLACED' | 'IGNORED' | string;
  location_pt: [number, number] | number[] | null;
  schedule_ref: string;
  suggested_discipline?: string;
  suggested_system?: string;
  quantity?: number;
  schedule_row_data?: Record<string, unknown>;
  created_at?: string;
  placed_sheet_id?: string | null;
}

/** Mirrors backend `ReconciliationReport` (src/store/reconciler.py). */
export interface ReconciliationReport {
  reconciliation_id: string;
  project_id: string;
  timestamp: string;
  total_scheduled: number;
  total_counted: number;
  total_matched: number;
  total_undercounts: number;
  total_overcounts: number;
  total_unscheduled: number;
  total_ghosts: number;
  match_rate: number;
  discrepancies: DiscrepancyItem[];
  ghost_pins: ReconcileGhostPin[];
  summary_by_discipline: Record<string, unknown>;
  review_required: boolean;
}

export type ReconcileResponse = ReconciliationReport;

/** POST/PATCH /api/sheets/{sheet_id}/calibration — mirrors backend `SheetCalibrationRequest`. */
export interface SheetCalibrationRequest {
  p1: [number, number];
  p2: [number, number];
  real_ft: number;
  real_in?: number;
}

/** Mirrors backend `SheetCalibrationResponse`. */
export interface SheetCalibrationResponse {
  sheet_id: string;
  scale_ratio: number;
  scale_raw: string;
  scale_status: 'CALIBRATED';
  updated_items: number;
  skipped_items: number;
}

/** POST /api/feedback/events — mirrors backend `FeedbackEventRequest`. */
export interface FeedbackEventPayload {
  project_id: string;
  sheet_id: string;
  item_id?: string | null;
  task_type: string;
  action: 'ACCEPT' | 'CORRECT' | 'REJECT' | 'CANNOT_DETERMINE';
  previous_status: string;
  new_status: string;
  original_output?: Record<string, unknown> | null;
  corrected_output?: Record<string, unknown> | null;
  correction_reason?: string | null;
  /** [x0, y0, x1, y1] in PDF points. */
  bounding_box_pt?: [number, number, number, number] | null;
  /** Page inside the sheet PDF the bbox refers to. */
  page_index?: number | null;
  model_version?: string | null;
  prompt_version?: string | null;
  reviewer_session_id?: string | null;
}

/** Mirrors backend `FeedbackEventResponse`. */
export interface FeedbackEventResponse {
  feedback_id: string;
  training_eligible: boolean;
}

/** Mirrors backend `LegendSymbolEntry` (src/meta_services/legend_scanner.py). */
export interface LegendSymbolEntry {
  symbol_id: string;
  label: string;
  description: string;
  system: string;
  category: string;
  bounding_box_pt: [number, number, number, number] | number[];
  exemplar_crop_base64?: string;
  confidence: number;
  status: string;
}

/** Mirrors backend `LegendScanResult.to_dict()` (src/meta_services/legend_scanner.py). */
export interface LegendScanResult {
  sheet_id: string;
  legend_detected: boolean;
  legend_bbox_pt: [number, number, number, number] | number[] | null;
  symbols_count?: number;
  symbols: LegendSymbolEntry[];
  abbreviations: Record<string, string>;
  confidence: number;
  mock: boolean;
  review_required: boolean;
}

/**
 * REV-002/REV-003 correction reason taxonomy.
 *
 * Backend `CorrectionReasonEnum` (src/models/schemas.py) is the authority and
 * lands via the p2a track; this string union mirrors it so the UI compiles
 * against both the current backend and the extended enum without duplicating
 * authority. `reasonOptions` props accept plain strings for the same reason.
 */
export type CorrectionReason =
  | 'OCR_MISREAD_DIGIT'
  | 'OCR_MISREAD_SHAPE'
  | 'WRONG_SYSTEM_CLASSIFICATION'
  | 'WRONG_SCALE_RATIO'
  | 'DUPLICATE_ITEM'
  | 'OUT_OF_SCOPE_SPECIFICATION'
  | 'INSUFFICIENT_DRAWING_RESOLUTION'
  | 'NON_STANDARD_SYMBOL_CONVENTION'
  | 'OTHER_OVERRIDE';

export const CORRECTION_REASONS: readonly CorrectionReason[] = [
  'OCR_MISREAD_DIGIT',
  'OCR_MISREAD_SHAPE',
  'WRONG_SYSTEM_CLASSIFICATION',
  'WRONG_SCALE_RATIO',
  'DUPLICATE_ITEM',
  'OUT_OF_SCOPE_SPECIFICATION',
  'INSUFFICIENT_DRAWING_RESOLUTION',
  'NON_STANDARD_SYMBOL_CONVENTION',
  'OTHER_OVERRIDE',
];

/** System selector options for the REV-002 correction form. */
export const CORRECTION_SYSTEMS: readonly string[] = [
  'Supply',
  'Return',
  'Exhaust',
  'Fire Life Safety',
];

/** Category selector options for the REV-002 correction form. */
export const CORRECTION_CATEGORIES: readonly string[] = ['Ductwork', 'Equipment', 'Piping'];

/** Field-level takeoff values carried in a correction payload. */
export interface CorrectionFieldValues {
  dimensionLabel: string;
  cfm?: number | null;
  system: string;
  category: string;
}

/**
 * Body for `submitItemCorrection`.
 *
 * Reuses the existing `PATCH /api/takeoff/items/{item_id}/status` route
 * (`status` stays within the backend 3-state literal; `action: 'CORRECT'`
 * marks the human correction) and carries both the original proposal and the
 * corrected values so the audit trail (REV-004) never loses the estimate
 * the reviewer overrode. Backend `StatusUpdateRequest` ignores the extra
 * keys today; the p2a 4-state/reason-enum extension reads them.
 */
export interface ItemCorrectionRequest {
  /** Review status after correction; kept as string for 3-state/4-state compat. */
  status?: string;
  reason: string;
  originalProposal: CorrectionFieldValues;
  correctedValues: CorrectionFieldValues;
}

export interface ItemCorrectionResponse {
  item_id: string;
  status: string;
  updated: boolean;
}
