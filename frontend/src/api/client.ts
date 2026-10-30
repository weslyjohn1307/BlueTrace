import type {
  HealthResponse,
  VersionResponse,
  ApiClientError,
  ProjectResponse,
  ProjectListResponse,
  ProjectCreateRequest,
  DrawingResponse,
  DrawingListResponse,
  DrawingPreflightResponse,
  JobResponse,
  JobListResponse,
  JobSubmitRequest,
  RunSummaryItem,
  RunListResponse,
  SheetListResponse,
  ViewDetailResponse,
  ImageBlobResult,
  PackageSummaryResponse,
  RouteListResponse,
  RouteQueryParams,
  ObjectListResponse,
  ObjectQueryParams,
  ReviewEventListResponse,
  ReviewEventQueryParams,
  ReviewEventCreateRequest,
  ReviewEventResponse,
  ExportResponse,
  ExportListResponse,
  CopilotQueryRequest,
  CopilotQueryResponse,
} from './contracts';

export class ApiError extends Error implements ApiClientError {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export function createApiClient(config: ApiClientConfig = {}) {
  const baseUrl = config.baseUrl || import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const defaultTimeoutMs = config.timeoutMs ?? 10000;

  async function request<T>(
    endpoint: string,
    options?: {
      method?: string;
      body?: unknown;
      signal?: AbortSignal;
    }
  ): Promise<T> {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = cleanEndpoint.startsWith('api/')
      ? `/${cleanEndpoint}`
      : `${baseUrl.replace(/\/+$/, '')}/${cleanEndpoint}`;
    const method = options?.method ?? 'GET';
    const signal = options?.signal;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let effectiveSignal = signal;

    if (!signal) {
      const controller = new AbortController();
      timerId = setTimeout(() => controller.abort(), defaultTimeoutMs);
      effectiveSignal = controller.signal;
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      let bodyContent: string | undefined;
      if (options?.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        bodyContent = JSON.stringify(options.body);
      }

      const res = await fetch(url, {
        method,
        headers,
        body: bodyContent,
        signal: effectiveSignal,
      });

      if (!res.ok) {
        let errDetails: unknown;
        try {
          errDetails = await res.json();
        } catch {
          // ignore non-json error payloads
        }
        const errorMsg =
          errDetails && typeof errDetails === 'object' && 'detail' in errDetails
            ? typeof (errDetails as { detail: unknown }).detail === 'string'
              ? (errDetails as { detail: string }).detail
              : JSON.stringify((errDetails as { detail: unknown }).detail)
            : `HTTP error ${res.status}: ${res.statusText}`;
        throw new ApiError(res.status, errorMsg, errDetails);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out or was aborted');
      }
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(0, message);
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  async function uploadDrawing(
    projectId: string,
    file: File,
    onProgress?: (loaded: number, total: number | null) => void,
    signal?: AbortSignal
  ): Promise<DrawingResponse> {
    const url = `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/drawings`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      if (signal?.aborted) {
        return reject(new ApiError(408, 'Upload was aborted'));
      }

      const onAbort = () => {
        xhr.abort();
        reject(new ApiError(408, 'Upload was aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          onProgress(event.loaded, event.lengthComputable ? event.total : null);
        };
      }

      xhr.onload = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        let responseData: unknown;
        try {
          responseData = JSON.parse(xhr.responseText);
        } catch {
          // non-json response
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseData as DrawingResponse);
        } else {
          const detail =
            responseData && typeof responseData === 'object' && 'detail' in responseData
              ? typeof (responseData as { detail: unknown }).detail === 'string'
                ? (responseData as { detail: string }).detail
                : JSON.stringify((responseData as { detail: unknown }).detail)
              : `Upload failed with status ${xhr.status}: ${xhr.statusText || 'Error'}`;
          reject(new ApiError(xhr.status, detail, responseData));
        }
      };

      xhr.onerror = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        reject(new ApiError(0, 'Network error during file upload'));
      };

      xhr.open('POST', url);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(formData);
    });
  }

  async function fetchBlob(
    endpoint: string,
    signal?: AbortSignal
  ): Promise<ImageBlobResult> {
    const url = `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let effectiveSignal = signal;

    if (!signal) {
      const controller = new AbortController();
      timerId = setTimeout(() => controller.abort(), defaultTimeoutMs);
      effectiveSignal = controller.signal;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'image/png' },
        signal: effectiveSignal,
      });

      if (!res.ok) {
        let errDetails: unknown;
        try {
          errDetails = await res.json();
        } catch {
          // ignore non-json error payloads
        }
        const errorMsg =
          errDetails && typeof errDetails === 'object' && 'detail' in errDetails
            ? typeof (errDetails as { detail: unknown }).detail === 'string'
              ? (errDetails as { detail: string }).detail
              : JSON.stringify((errDetails as { detail: unknown }).detail)
            : `HTTP error ${res.status}: ${res.statusText}`;
        throw new ApiError(res.status, errorMsg, errDetails);
      }

      const widthHeader = res.headers.get('X-Image-Width');
      const heightHeader = res.headers.get('X-Image-Height');
      const width = widthHeader ? parseInt(widthHeader, 10) : undefined;
      const height = heightHeader ? parseInt(heightHeader, 10) : undefined;
      const blob = await res.blob();

      return {
        blob,
        width: typeof width === 'number' && !Number.isNaN(width) ? width : undefined,
        height: typeof height === 'number' && !Number.isNaN(height) ? height : undefined,
      };
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out or was aborted');
      }
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(0, message);
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  return {
    async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
      return request<HealthResponse>('/health', { signal });
    },
    async getVersion(signal?: AbortSignal): Promise<VersionResponse> {
      return request<VersionResponse>('/version', { signal });
    },
    async listProjects(signal?: AbortSignal): Promise<ProjectListResponse> {
      return request<ProjectListResponse>('/projects', { signal });
    },
    async createProject(data: ProjectCreateRequest, signal?: AbortSignal): Promise<ProjectResponse> {
      return request<ProjectResponse>('/projects', { method: 'POST', body: data, signal });
    },
    async getProject(projectId: string, signal?: AbortSignal): Promise<ProjectResponse> {
      return request<ProjectResponse>(`/projects/${encodeURIComponent(projectId)}`, { signal });
    },
    async listDrawings(projectId: string, signal?: AbortSignal): Promise<DrawingListResponse> {
      return request<DrawingListResponse>(`/projects/${encodeURIComponent(projectId)}/drawings`, { signal });
    },
    uploadDrawing,
    async getDrawing(projectId: string, sourceId: string, signal?: AbortSignal): Promise<DrawingResponse> {
      return request<DrawingResponse>(
        `/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(sourceId)}`,
        { signal }
      );
    },
    async getDrawingPreflight(projectId: string, sourceId: string, signal?: AbortSignal): Promise<DrawingPreflightResponse> {
      return request<DrawingPreflightResponse>(
        `/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(sourceId)}/preflight`,
        { signal }
      );
    },
    getPageThumbnailUrl(projectId: string, sourceId: string, pageNumber: number): string {
      return `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(sourceId)}/pages/${pageNumber}/thumbnail`;
    },
    async submitJob(projectId: string, data: JobSubmitRequest, signal?: AbortSignal): Promise<JobResponse> {
      return request<JobResponse>(`/projects/${encodeURIComponent(projectId)}/jobs`, {
        method: 'POST',
        body: data,
        signal,
      });
    },
    async listJobs(projectId: string, signal?: AbortSignal): Promise<JobListResponse> {
      return request<JobListResponse>(`/projects/${encodeURIComponent(projectId)}/jobs`, { signal });
    },
    async getJob(projectId: string, jobId: string, signal?: AbortSignal): Promise<JobResponse> {
      return request<JobResponse>(
        `/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`,
        { signal }
      );
    },
    async listAllRuns(limit?: number, signal?: AbortSignal): Promise<RunListResponse> {
      const endpoint = limit ? `/runs?limit=${limit}` : '/runs';
      return request<RunListResponse>(endpoint, { signal });
    },
    async getRunById(runId: string, signal?: AbortSignal): Promise<RunSummaryItem> {
      return request<RunSummaryItem>(`/runs/${encodeURIComponent(runId)}`, { signal });
    },
    async getRun(projectId: string, runId: string, signal?: AbortSignal): Promise<RunSummaryItem> {
      return request<RunSummaryItem>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
        { signal }
      );
    },
    async listSheets(projectId: string, runId: string, signal?: AbortSignal): Promise<SheetListResponse> {
      return request<SheetListResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/sheets`,
        { signal }
      );
    },
    async getView(projectId: string, runId: string, viewId: string, signal?: AbortSignal): Promise<ViewDetailResponse> {
      return request<ViewDetailResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/views/${encodeURIComponent(viewId)}`,
        { signal }
      );
    },
    async getPageImageBlob(projectId: string, runId: string, pageId: string, signal?: AbortSignal): Promise<ImageBlobResult> {
      return fetchBlob(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/pages/${encodeURIComponent(pageId)}/image`,
        signal
      );
    },
    async getPageThumbnailBlob(projectId: string, runId: string, pageId: string, signal?: AbortSignal): Promise<ImageBlobResult> {
      return fetchBlob(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/pages/${encodeURIComponent(pageId)}/thumbnail`,
        signal
      );
    },
    getSourcePdfUrl(projectId: string, sourceId: string): string {
      return `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/drawings/${encodeURIComponent(sourceId)}/source`;
    },
    async getRunSummary(projectId: string, runId: string, signal?: AbortSignal): Promise<PackageSummaryResponse> {
      return request<PackageSummaryResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/summary`,
        { signal }
      );
    },
    async getRoutes(projectId: string, runId: string, params?: RouteQueryParams, signal?: AbortSignal): Promise<RouteListResponse> {
      const searchParams = new URLSearchParams();
      if (params?.sheet_id) searchParams.set('sheet_id', params.sheet_id);
      if (params?.view_id) searchParams.set('view_id', params.view_id);
      if (params?.object_type) searchParams.set('object_type', params.object_type);
      if (params?.continuity_status) searchParams.set('continuity_status', params.continuity_status);
      if (params?.representation_state) searchParams.set('representation_state', params.representation_state);
      if (params?.review_status) searchParams.set('review_status', params.review_status);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
      const qs = searchParams.toString();
      const endpoint = `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/routes${qs ? `?${qs}` : ''}`;
      return request<RouteListResponse>(endpoint, { signal });
    },
    async getObjects(projectId: string, runId: string, params?: ObjectQueryParams, signal?: AbortSignal): Promise<ObjectListResponse> {
      const searchParams = new URLSearchParams();
      if (params?.sheet_id) searchParams.set('sheet_id', params.sheet_id);
      if (params?.view_id) searchParams.set('view_id', params.view_id);
      if (params?.object_type) searchParams.set('object_type', params.object_type);
      if (params?.representation_state) searchParams.set('representation_state', params.representation_state);
      if (params?.review_status) searchParams.set('review_status', params.review_status);
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
      if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
      const qs = searchParams.toString();
      const endpoint = `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/objects${qs ? `?${qs}` : ''}`;
      return request<ObjectListResponse>(endpoint, { signal });
    },
    async getReviewEvents(projectId: string, runId: string, params?: ReviewEventQueryParams, signal?: AbortSignal): Promise<ReviewEventListResponse> {
      const searchParams = new URLSearchParams();
      if (params?.target_type) searchParams.set('target_type', params.target_type);
      if (params?.target_id) searchParams.set('target_id', params.target_id);
      const qs = searchParams.toString();
      const endpoint = `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/review-events${qs ? `?${qs}` : ''}`;
      return request<ReviewEventListResponse>(endpoint, { signal });
    },
    async appendReviewEvent(projectId: string, runId: string, data: ReviewEventCreateRequest, signal?: AbortSignal): Promise<ReviewEventResponse> {
      return request<ReviewEventResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/review-events`,
        {
          method: 'POST',
          body: data,
          signal,
        }
      );
    },
    async getPageOverlaySvg(projectId: string, runId: string, pageId: string, signal?: AbortSignal): Promise<string> {
      const url = `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/pages/${encodeURIComponent(pageId)}/overlay`;
      const res = await fetch(url, {
        headers: { Accept: 'image/svg+xml' },
        signal,
      });
      if (!res.ok) {
        throw new ApiError(res.status, `Failed to fetch overlay: ${res.statusText}`);
      }
      return res.text();
    },
    async createExport(projectId: string, runId: string, signal?: AbortSignal): Promise<ExportResponse> {
      return request<ExportResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/exports`,
        {
          method: 'POST',
          signal,
        }
      );
    },
    async listExports(projectId: string, runId: string, signal?: AbortSignal): Promise<ExportListResponse> {
      return request<ExportListResponse>(
        `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/exports`,
        { signal }
      );
    },
    async downloadExport(
      projectId: string,
      runId: string,
      exportId: string,
      signal?: AbortSignal
    ): Promise<Blob> {
      const url = `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/exports/${encodeURIComponent(exportId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/zip' },
        signal,
      });
      if (!res.ok) {
        throw new ApiError(res.status, `Failed to download export bundle: ${res.statusText}`);
      }
      return res.blob();
    },
    async queryCopilot(
      projectId: string,
      runId: string,
      payload: CopilotQueryRequest,
      signal?: AbortSignal
    ): Promise<CopilotQueryResponse> {
      try {
        const live = await request<{
          answer: string;
          cited_coordinates: number[][];
          referenced_item_ids: string[];
          scale_verified: boolean;
        }>('/api/copilot', {
          method: 'POST',
          body: {
            sheet_id: payload.sheet_id,
            query: payload.query,
          },
          signal,
        });
        return {
          request_id: `copilot-${Date.now()}`,
          mode: 'local',
          mode_label: 'BlueTraceAI Live Reasoning Copilot',
          external_model_used: true,
          project_id: projectId,
          run_id: runId,
          sheet_id: payload.sheet_id,
          view_id: payload.view_id,
          target_id: payload.target_id,
          deterministic_intent: 'engineering_query',
          response_status: 'complete',
          answer: live.answer,
          numerical_value: null,
          unit: null,
          canonical_result_ids: live.referenced_item_ids || [],
          canonical_result_count: live.referenced_item_ids?.length || 0,
          highlight_result_ids: live.referenced_item_ids || [],
          safe_evidence_references: (live.cited_coordinates || []).map((coords, i) => ({
            artifact_type: 'drawing_coordinate',
            locator: coords.join(','),
            page_number: 1,
            rule_id: `evidence_${i + 1}`,
          })),
          bounded_tool_call_trace: [
            {
              tool_name: 'TakeoffStore.query',
              purpose: 'Inspect active takeoff ledger & linework',
              duration_ms: 12,
              evidence_count: live.cited_coordinates?.length || 0,
            },
          ],
        };
      } catch {
        return request<CopilotQueryResponse>(
          `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/copilot/query`,
          {
            method: 'POST',
            body: payload,
            signal,
          }
        );
      }
    },

    // -------------------------------------------------------------
    // BlueTraceAI Live Point-of-Need & Meta Model API Endpoints
    // -------------------------------------------------------------
    async getMetaHealth(signal?: AbortSignal): Promise<{
      status: string;
      service: string;
      version: string;
      meta_model_api_configured: boolean;
      models: Record<string, string>;
    }> {
      return request('/api/health', { signal });
    },

    async scanSheet(
      pdfPath: string,
      pageIndex = 0,
      signal?: AbortSignal
    ): Promise<{
      sheet_id: string;
      page_index: number;
      sheet_number: string;
      sheet_title: string;
      discipline: string;
      scale_raw?: string | null;
      scale_ratio?: number | null;
      scale_status: 'VERIFIED' | 'UNVERIFIED' | 'CALIBRATED';
      width_pt: number;
      height_pt: number;
      dpi: number;
    }> {
      return request('/api/sheet-scan', {
        method: 'POST',
        body: { pdf_path: pdfPath, page_index: pageIndex },
        signal,
      });
    },

    async extractCropOcr(
      payload: {
        sheet_id: string;
        cursor_pt: [number, number];
        crop_size_pt?: number;
        image_base64: string;
      },
      signal?: AbortSignal
    ): Promise<{
      latency_ms: number;
      detected_text: string;
      parsed_dimension?: {
        width_in: number;
        height_in?: number | null;
        shape: string;
      } | null;
      confidence: number;
      badge_text: string;
      review_required: boolean;
    }> {
      return request('/api/crop-ocr', {
        method: 'POST',
        body: payload,
        signal,
      });
    },

    async parseSchedule(
      payload: {
        image_base64: string;
        schedule_title?: string;
        project_id?: string;
        sheet_id?: string;
        page_text_blocks?: [string, number[]][];
      },
      signal?: AbortSignal
    ): Promise<{
      scheduled_items_total: number;
      linked_takeoff_records: number;
      unplaced_ghost_pins: unknown[];
    }> {
      return request('/api/schedule/parse', {
        method: 'POST',
        body: payload,
        signal,
      });
    },

    async segmentConcept(
      imageBase64: string,
      conceptPrompt = 'mechanical equipment boundary',
      signal?: AbortSignal
    ): Promise<{
      concept: string;
      masks: unknown[];
      polygons: number[][][];
      confidence: number;
      mock?: boolean;
    }> {
      return request('/api/segment', {
        method: 'POST',
        body: { image_base64: imageBase64, concept_prompt: conceptPrompt },
        signal,
      });
    },

    async queryLiveCopilot(
      query: string,
      sheetId?: string | null,
      selectionBbox?: number[] | null,
      signal?: AbortSignal
    ): Promise<{
      answer: string;
      cited_coordinates: number[][];
      referenced_item_ids: string[];
      scale_verified: boolean;
    }> {
      return request('/api/copilot', {
        method: 'POST',
        body: { query, sheet_id: sheetId, selection_bbox: selectionBbox },
        signal,
      });
    },

    async listTakeoffItems(
      params?: { project_id?: string; sheet_id?: string; status?: string },
      signal?: AbortSignal
    ): Promise<unknown[]> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      if (params?.status) sp.set('status', params.status);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request(`/api/takeoff/items${qs}`, { signal });
    },

    async updateTakeoffStatus(
      itemId: string,
      status: 'SUGGESTED' | 'ACCEPTED' | 'REJECTED',
      action = 'USER_REVIEW',
      signal?: AbortSignal
    ): Promise<{ item_id: string; status: string; updated: boolean }> {
      return request(`/api/takeoff/items/${encodeURIComponent(itemId)}/status`, {
        method: 'PATCH',
        body: { status, action },
        signal,
      });
    },

    async getTakeoffSummary(
      params?: { project_id?: string; sheet_id?: string },
      signal?: AbortSignal
    ): Promise<unknown[]> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request(`/api/takeoff/summary${qs}`, { signal });
    },

    async configureByok(
      apiKey: string,
      signal?: AbortSignal
    ): Promise<{ configured: boolean; masked_key?: string | null; session_id?: string | null }> {
      return request('/api/auth/byok', {
        method: 'POST',
        body: { api_key: apiKey },
        signal,
      });
    },

    async clearByok(signal?: AbortSignal): Promise<{ configured: boolean; cleared: boolean }> {
      return request('/api/auth/byok', {
        method: 'DELETE',
        signal,
      });
    },
  };
}

export const apiClient = createApiClient();

