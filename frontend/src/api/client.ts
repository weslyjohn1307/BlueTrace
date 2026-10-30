import type {
  CopilotQueryResponse,
  CursorCropResponse,
  HealthResponse,
  LedgerSummaryRow,
  PageTextResponse,
  ScheduleParseResponse,
  SegmentResponse,
  SheetMetadata,
  TakeoffRecord,
  UploadResponse,
} from './contracts';

export class ApiError extends Error {
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

function newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to Math.random */
  }
  return `sess-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function createApiClient(config: ApiClientConfig = {}) {
  // Every endpoint below is an absolute `/api/...` path served by FastAPI.
  // baseUrl exists only to point at a non-default origin in dev/test.
  const baseUrl = (config.baseUrl || import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
  const defaultTimeoutMs = config.timeoutMs ?? 30000;
  const sessionId = newSessionId();

  async function request<T>(
    endpoint: string,
    options?: {
      method?: string;
      body?: unknown;
      rawBody?: BodyInit;
      signal?: AbortSignal;
    }
  ): Promise<T> {
    const url = endpoint.startsWith('/') ? endpoint : `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;
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
        'X-Session-ID': sessionId,
      };
      let bodyContent: string | BodyInit | undefined;
      if (options?.rawBody !== undefined) {
        bodyContent = options.rawBody;
      } else if (options?.body !== undefined) {
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
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(0, `Request to ${url} timed out after ${defaultTimeoutMs}ms`);
      }
      throw err;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  }

  async function requestBlob(endpoint: string, accept: string, signal?: AbortSignal): Promise<Blob> {
    const url = endpoint.startsWith('/') ? endpoint : `${baseUrl}/${endpoint.replace(/^\/+/, '')}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: accept, 'X-Session-ID': sessionId },
      signal,
    });
    if (!res.ok) {
      throw new ApiError(res.status, `Download failed: ${res.statusText}`);
    }
    return res.blob();
  }

  return {
    sessionId,

    async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
      return request<HealthResponse>('/api/health', { signal });
    },

    async uploadDrawing(file: File, signal?: AbortSignal): Promise<UploadResponse> {
      // Backend accepts raw PDF bytes (no python-multipart dependency by design);
      // filename travels as a query param. See src/api/routes.py:upload_drawing.
      const endpoint = `/api/upload?filename=${encodeURIComponent(file.name)}`;
      return request<UploadResponse>(endpoint, { method: 'POST', rawBody: file, signal });
    },

    async scanSheet(pdfPath: string, pageIndex = 0, signal?: AbortSignal): Promise<SheetMetadata> {
      return request<SheetMetadata>('/api/sheet-scan', {
        method: 'POST',
        body: { pdf_path: pdfPath, page_index: pageIndex },
        signal,
      });
    },

    getPageImageUrl(pdfPath: string, pageIndex = 0, dpi = 150): string {
      const sp = new URLSearchParams({
        pdf_path: pdfPath,
        page_index: String(pageIndex),
        dpi: String(dpi),
      });
      return `/api/page-image?${sp.toString()}`;
    },

    async getPageText(pdfPath: string, pageIndex = 0, signal?: AbortSignal): Promise<PageTextResponse> {
      const sp = new URLSearchParams({ pdf_path: pdfPath, page_index: String(pageIndex) });
      return request<PageTextResponse>(`/api/page-text?${sp.toString()}`, { signal });
    },

    async extractCropOcr(
      payload: {
        sheet_id: string;
        cursor_pt: [number, number];
        crop_size_pt?: number;
        image_base64: string;
      },
      signal?: AbortSignal
    ): Promise<CursorCropResponse> {
      return request<CursorCropResponse>('/api/crop-ocr', {
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
    ): Promise<ScheduleParseResponse> {
      return request<ScheduleParseResponse>('/api/schedule/parse', {
        method: 'POST',
        body: payload,
        signal,
      });
    },

    async segmentConcept(
      imageBase64: string,
      conceptPrompt = 'mechanical equipment boundary',
      signal?: AbortSignal
    ): Promise<SegmentResponse> {
      return request<SegmentResponse>('/api/segment', {
        method: 'POST',
        body: { image_base64: imageBase64, concept_prompt: conceptPrompt },
        signal,
      });
    },

    async queryCopilot(
      query: string,
      sheetId?: string | null,
      selectionBbox?: number[] | null,
      signal?: AbortSignal
    ): Promise<CopilotQueryResponse> {
      return request<CopilotQueryResponse>('/api/copilot', {
        method: 'POST',
        body: { query, sheet_id: sheetId ?? undefined, selection_bbox: selectionBbox ?? undefined },
        signal,
      });
    },

    async streamCopilot(
      query: string,
      sheetId: string | null | undefined,
      onChunk: (text: string, done: boolean) => void,
      signal?: AbortSignal
    ): Promise<CopilotQueryResponse> {
      const res = await fetch('/api/copilot/stream', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({ query, sheet_id: sheetId ?? undefined }),
        signal,
      });
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, `Copilot stream failed: ${res.statusText}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let terminal: CopilotQueryResponse | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            try {
              const payload = JSON.parse(trimmed.slice(5).trim()) as {
                chunk?: string;
                done?: boolean;
                answer?: string;
                cited_coordinates?: number[][];
                referenced_item_ids?: string[];
                scale_verified?: boolean;
                model_used?: boolean;
              };
              if (payload.chunk) {
                full += payload.chunk;
                onChunk(full, false);
              }
              if (payload.done) {
                terminal = {
                  answer: payload.answer ?? full,
                  cited_coordinates: payload.cited_coordinates ?? [],
                  referenced_item_ids: payload.referenced_item_ids ?? [],
                  scale_verified: payload.scale_verified ?? false,
                  model_used: payload.model_used ?? false,
                };
                onChunk(terminal.answer, true);
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
      }
      if (!terminal) {
        throw new ApiError(0, 'Copilot stream ended without a terminal event');
      }
      return terminal;
    },

    async listTakeoffItems(
      params?: { project_id?: string; sheet_id?: string; status?: string },
      signal?: AbortSignal
    ): Promise<TakeoffRecord[]> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      if (params?.status) sp.set('status', params.status);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<TakeoffRecord[]>(`/api/takeoff/items${qs}`, { signal });
    },

    async createTakeoffItem(
      item: {
        project_id: string;
        sheet_id: string;
        category: string;
        system?: string;
        dimension_label?: string;
        status?: string;
        source?: string;
        total_length_ft?: number;
        count?: number;
        geometry?: Record<string, unknown> | unknown[];
        confidence?: number | null;
      },
      signal?: AbortSignal
    ): Promise<TakeoffRecord> {
      return request<TakeoffRecord>('/api/takeoff/items', {
        method: 'POST',
        body: item,
        signal,
      });
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
    ): Promise<LedgerSummaryRow[]> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<LedgerSummaryRow[]>(`/api/takeoff/summary${qs}`, { signal });
    },

    async exportTakeoffCsv(params?: { project_id?: string; sheet_id?: string }): Promise<Blob> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return requestBlob(`/api/takeoff/export/csv${qs}`, 'text/csv');
    },

    async exportTakeoffJson(params?: { project_id?: string; sheet_id?: string }): Promise<Blob> {
      const sp = new URLSearchParams();
      if (params?.project_id) sp.set('project_id', params.project_id);
      if (params?.sheet_id) sp.set('sheet_id', params.sheet_id);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return requestBlob(`/api/takeoff/export/json${qs}`, 'application/json');
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
export type ApiClient = ReturnType<typeof createApiClient>;
