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
