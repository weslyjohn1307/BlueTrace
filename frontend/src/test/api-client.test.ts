import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient, ApiError } from '../api/client';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls absolute /api endpoints and sends the session header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'online' }));
    const client = createApiClient({ baseUrl: '/api' });
    await client.getHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/health');
    expect((init.headers as Record<string, string>)['X-Session-ID']).toBe(client.sessionId);
  });

  it('never routes through the dead /api/v1 namespace', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'online' }));
    const client = createApiClient();
    await client.getHealth();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('/api/v1');
  });

  it('posts JSON bodies for sheet scan', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sheet_id: 's1' }));
    const client = createApiClient();
    await client.scanSheet('fixtures/mechanical/avexis_page_22.pdf', 0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sheet-scan');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      pdf_path: 'fixtures/mechanical/avexis_page_22.pdf',
      page_index: 0,
    });
  });

  it('uploads drawings as raw PDF bytes with filename query param', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ file_path: 'data/uploads/x.pdf' }));
    const client = createApiClient();
    const file = new File(['%PDF-1.4'], 'plan.pdf', { type: 'application/pdf' });
    await client.uploadDrawing(file);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/upload?filename=plan.pdf');
    // Backend rejects multipart (no python-multipart by design); body must be the file itself.
    expect(init.body).toBe(file);
    expect(init.body).not.toBeInstanceOf(FormData);
  });

  it('builds page-image URLs with query params', () => {
    const client = createApiClient();
    const url = client.getPageImageUrl('fixtures/mechanical/avexis_page_22.pdf', 2, 150);
    expect(url.startsWith('/api/page-image?')).toBe(true);
    expect(url).toContain('page_index=2');
    expect(url).toContain('dpi=150');
  });

  it('surfaces backend detail messages as ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Access denied' }, 403));
    const client = createApiClient();
    const err = await client.getHealth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).toContain('Access denied');
  });
});
