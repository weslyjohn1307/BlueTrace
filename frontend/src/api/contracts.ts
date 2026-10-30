export type ApiStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthResponse {
  status: ApiStatus;
  service_name: string;
  api_version: string;
  result_schema_version: string;
  engine_available: boolean;
  artifact_store_available: boolean;
  model_available?: boolean;
}

export interface VersionResponse {
  api_version: string;
  result_schema_version: string;
  engine_package_version: string;
  approved_model_available: boolean;
  supported_public_output_fields: string[];
}

export interface ApiClientError {
  status: number;
  message: string;
  details?: unknown;
}

export interface ProjectResponse {
  project_id: string;
  name: string;
  description?: string | null;
  created_at: string;
  drawing_count: number;
}

export interface ProjectListResponse {
  items: ProjectResponse[];
  total: number;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
}

export interface DrawingResponse {
  project_id: string;
  source_id: string;
  document_id: string;
  filename: string;
  sha256: string;
  byte_size: number;
  page_count: number;
  content_type: string;
  imported_at: string;
  import_state: string;
}

export interface DrawingListResponse {
  items: DrawingResponse[];
  total: number;
}

export interface PagePreflightSummary {
  page_id: string;
  page_number: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
  media_box: number[];
  crop_box: number[];
  user_unit?: number;
  candidate_sheet_id: string;
  sheet_id_confidence: string;
  sheet_id_source: string;
  page_role_hint: string;
  modality_hint: string;
  processability_status: string;
  warnings?: string[];
}

export interface DrawingPreflightResponse {
  project_id: string;
  source_id: string;
  document_id: string;
  page_count: number;
  overall_status: string;
  pages: PagePreflightSummary[];
}

export type JobState =
  | 'QUEUED'
  | 'PREFLIGHT'
  | 'PROCESSING'
  | 'PERSISTING'
  | 'COMPLETE'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'INTERRUPTED';

export interface JobProgress {
  total_pages: number;
  completed_pages: number;
  failed_pages: number;
  current_page?: number | null;
  percent?: number | null;
}

export interface JobResponse {
  job_id: string;
  project_id: string;
  state: JobState;
  source_ids: string[];
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  run_id?: string | null;
  progress: JobProgress;
  error_code?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface JobListResponse {
  items: JobResponse[];
  total: number;
}

export type ReferenceMode = 'same_pdf' | 'separate_pdf' | 'none';

export interface ComponentReference {
  reference_mode: ReferenceMode;
  reference_source_id?: string | null;
  reference_pages: number[];
}

export interface ExtractionCapabilities {
  fire_dampers: boolean;
  wshp: boolean;
  linear_grilles: boolean;
  duct_pipe_routes: boolean;
}

export interface JobSubmitRequest {
  source_ids: string[];
  component_reference?: ComponentReference | null;
  selected_pages?: number[] | null;
  capabilities?: ExtractionCapabilities | null;
}

export interface RunSummaryItem {
  run_id: string;
  project_id: string;
  job_id?: string | null;
  manifest_sha256: string;
  schema_version: string;
  readiness_state?: string | null;
  approved_demo_run: boolean;
  extraction_accuracy_claim_allowed: boolean;
  g3_status?: string | null;
  total_pages: number;
  completed_page_count: number;
  failed_page_count: number;
  total_objects: number;
  total_routes: number;
  total_length?: number | null;
  created_at?: string | null;
  indexed_at: string;
}

export interface RunListResponse {
  items: RunSummaryItem[];
  total: number;
}

export interface SheetItem {
  sheet_id: string;
  run_id: string;
  project_id: string;
  document_id?: string | null;
  page_id: string;
  page_index: number;
  source_id?: string | null;
  object_count: number;
  route_count: number;
}

export interface SheetListResponse {
  items: SheetItem[];
  total: number;
}

export interface TransformProvenance {
  coordinate_space?: string;
  matrix?: number[];
  notes?: string;
}

export interface ViewDetailResponse {
  view_id: string;
  run_id: string;
  project_id: string;
  page_id: string;
  sheet_id?: string | null;
  role?: string | null;
  coordinate_space?: string | null;
  bounds?: unknown;
  transform_provenance?: TransformProvenance | null;
}

export interface ImageBlobResult {
  blob: Blob;
  width?: number;
  height?: number;
}

export interface RoutePhysicalLength {
  value?: number | null;
  status: string;
  scale_status: string;
  unit?: string | null;
}

export type ReviewedStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface ReviewProjection {
  reviewed_status: ReviewedStatus;
  last_action?: string | null;
  last_action_at?: string | null;
  event_count: number;
  has_notes: boolean;
}

export interface GeometryLocationOrPath {
  type: 'polyline' | 'bbox';
  points?: [number, number][];
  xyxy?: [number, number, number, number] | null;
}

export interface CanonicalGeometry {
  coordinate_space?: string;
  location_or_path: GeometryLocationOrPath;
  transform_provenance?: TransformProvenance | null;
}

export interface RouteItem {
  route_id: string;
  run_id: string;
  project_id: string;
  page_id: string;
  sheet_id?: string | null;
  view_id?: string | null;
  object_type: string;
  confidence?: number | null;
  continuity_status?: string | null;
  representation_state?: string | null;
  physical_length?: RoutePhysicalLength | null;
  physical_length_m?: number | null;
  physical_length_status?: string | null;
  scale_status?: string | null;
  geometry?: CanonicalGeometry | null;
  source_lineage?: Record<string, unknown> | null;
  source_native_id?: string | null;
  review_required?: boolean | number;
  uncertainty_codes?: string[];
  review_projection?: ReviewProjection | null;
}

export interface RouteListResponse {
  items: RouteItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ObjectItem {
  object_id: string;
  run_id: string;
  project_id: string;
  page_id: string;
  sheet_id?: string | null;
  view_id?: string | null;
  object_type: string;
  confidence?: number | null;
  representation_state?: string | null;
  geometry?: CanonicalGeometry | null;
  source_lineage?: Record<string, unknown> | null;
  review_required?: boolean | number;
  uncertainty_codes?: string[];
  review_projection?: ReviewProjection | null;
}

export interface ObjectListResponse {
  items: ObjectItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface PackageSummaryResponse {
  project_id: string;
  run_id: string;
  total_pages: number;
  total_sheets: number;
  total_views: number;
  total_objects: number;
  total_routes: number;
  measured_route_count: number;
  unavailable_length_count: number;
  total_physical_length_m?: number | null;
  g3_status?: string | null;
  approved_demo_run: boolean;
  extraction_accuracy_claim_allowed: boolean;
  continuity_state_counts?: Record<string, number>;
  representation_state_counts?: Record<string, number>;
  review_status_counts?: Record<string, number>;
  review_required_count: number;
}

export type ReviewAction = 'ACCEPT' | 'REJECT' | 'NEEDS_REVIEW' | 'COMMENT' | 'CORRECTION_NOTE';
export type ReviewTargetType = 'OBJECT' | 'ROUTE' | 'SHEET' | 'VIEW';

export interface ReviewEventCreateRequest {
  target_type: ReviewTargetType;
  target_id: string;
  action: ReviewAction;
  comment?: string | null;
}

export interface ReviewEventResponse {
  event_id: string;
  run_id: string;
  project_id: string;
  target_type: string;
  target_id: string;
  action: string;
  comment?: string | null;
  sequence: number;
  created_at: string;
}

export interface ReviewEventListResponse {
  items: ReviewEventResponse[];
  total: number;
}

export interface RouteQueryParams {
  sheet_id?: string;
  view_id?: string;
  object_type?: string;
  continuity_status?: string;
  representation_state?: string;
  review_status?: string;
  limit?: number;
  offset?: number;
}

export interface ObjectQueryParams {
  sheet_id?: string;
  view_id?: string;
  object_type?: string;
  representation_state?: string;
  review_status?: string;
  limit?: number;
  offset?: number;
}

export interface ReviewEventQueryParams {
  target_type?: string;
  target_id?: string;
}

export interface ExportFileItem {
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
}

export interface ExportResponse {
  export_id: string;
  project_id: string;
  run_id: string;
  state: 'CREATED' | 'ALREADY_EXPORTED';
  export_schema_version: string;
  manifest_sha256: string;
  bundle_sha256: string;
  bundle_size_bytes: number;
  files: ExportFileItem[];
  created_at: string;
}

export interface ExportSummaryItem {
  export_id: string;
  project_id: string;
  run_id: string;
  export_schema_version: string;
  manifest_sha256: string;
  bundle_sha256: string;
  bundle_size_bytes: number;
  created_at: string;
}

export interface ExportListResponse {
  items: ExportSummaryItem[];
  total: number;
}

export interface CopilotQueryRequest {
  mode?: 'local';
  query: string;
  sheet_id?: string | null;
  view_id?: string | null;
  target_id?: string | null;
}

export interface CopilotEvidenceReference {
  artifact_type: string;
  locator: string;
  sha256?: string | null;
  page_number?: number | null;
  rule_id?: string | null;
}

export interface CopilotToolTraceItem {
  tool_name: string;
  purpose: string;
  duration_ms: number;
  evidence_count: number;
}

export interface CopilotQueryResponse {
  request_id: string;
  mode: 'local';
  mode_label: string;
  external_model_used: boolean;
  project_id: string;
  run_id: string;
  sheet_id?: string | null;
  view_id?: string | null;
  target_id?: string | null;
  deterministic_intent: string;
  response_status: string;
  answer: string;
  numerical_value?: number | null;
  unit?: string | null;
  canonical_result_ids: string[];
  canonical_result_count?: number | null;
  highlight_result_ids: string[];
  safe_evidence_references: CopilotEvidenceReference[];
  bounded_tool_call_trace: CopilotToolTraceItem[];
}

