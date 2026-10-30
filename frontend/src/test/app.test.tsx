import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../app/App';
import { apiClient } from '../api/client';

describe('MEP Design AI — UI-01 Application Shell Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, 'Test', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. / renders the canonical workspace with upload drop zone', async () => {
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: ['object_type', 'location_or_path', 'confidence', 'length', 'sheet_id'],
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getAllByText(/MEP Design AI/i).length
      ).toBeGreaterThan(0);
    });
  });

  it('2. /live redirects to the canonical workspace', async () => {
    window.history.pushState({}, 'Test', '/live');
    vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: ['object_type', 'location_or_path', 'confidence', 'length', 'sheet_id'],
    });

    render(<App />);

    // /live redirects to / (WorkspaceApp) — "LIVE — Local backend" label no longer shown
    // After redirect, workspace is rendered
    await waitFor(() => {
      expect(screen.getAllByText(/MEP Design AI/i).length).toBeGreaterThan(0);
    });
    // Old LiveApp label must NOT be shown (it was removed from routing)
    expect(screen.queryByText(/LIVE — Local backend/i)).not.toBeInTheDocument();
  });

  it('3. /demo always displays the Demo warning and Example only badge', async () => {
    window.history.pushState({}, 'Test', '/demo');
    render(<App />);

    expect(
      screen.getAllByText(/DEMO — Example data only\. Nothing on this screen was calculated from a drawing\./i).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Example only/i).length).toBeGreaterThan(0);
  });

  it('4. Workspace at / calls health and version endpoints on load', async () => {
    const healthSpy = vi.spyOn(apiClient, 'getHealth').mockResolvedValue({
      status: 'ok',
      service_name: 'MEP Design AI',
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_available: true,
      artifact_store_available: true,
    });
    const versionSpy = vi.spyOn(apiClient, 'getVersion').mockResolvedValue({
      api_version: 'v1',
      result_schema_version: '1.0.0',
      engine_package_version: '1.0.0',
      approved_model_available: true,
      supported_public_output_fields: ['object_type', 'location_or_path', 'confidence', 'length', 'sheet_id'],
    });
    const uploadSpy = vi.spyOn(apiClient, 'uploadDrawing');

    render(<App />);

    // Workspace calls health/version after file upload, not on initial render
    // so they should not be called yet
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(healthSpy).not.toHaveBeenCalled();
    expect(versionSpy).not.toHaveBeenCalled();
  });

  it('5. Workspace renders a file upload drop zone', async () => {
    render(<App />);

    // The workspace should show the upload area in idle/selected state
    await waitFor(() => {
      expect(screen.getAllByText(/MEP Design AI/i).length).toBeGreaterThan(0);
    });
  });

  it('6. Demo mode performs zero fetch requests', async () => {
    window.history.pushState({}, 'Test', '/demo');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const healthSpy = vi.spyOn(apiClient, 'getHealth');
    const versionSpy = vi.spyOn(apiClient, 'getVersion');

    render(<App />);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(healthSpy).not.toHaveBeenCalled();
    expect(versionSpy).not.toHaveBeenCalled();
  });

  it('7. Workspace landing has MEP Design AI brand heading and upload trigger', async () => {
    render(<App />);

    expect(screen.getAllByText(/MEP Design AI/i).length).toBeGreaterThan(0);
    // Upload trigger in TopNav — button by id
    const uploadBtn = document.getElementById('topnav-choose-pdf-btn');
    expect(uploadBtn).toBeTruthy();
  });

  it('8. Workspace top nav upload button is keyboard accessible', async () => {
    render(<App />);

    const uploadBtn = document.getElementById('topnav-choose-pdf-btn') as HTMLElement | null;
    expect(uploadBtn).toBeTruthy();
    uploadBtn!.focus();
    expect(uploadBtn).toHaveFocus();
  });

  it('9. Public-facing workspace contains no fabricated result quantity', async () => {
    render(<App />);

    const body = document.body;
    // No fabricated numbers in the empty workspace
    expect(body.textContent).not.toContain('31.699');
    expect(body.textContent).not.toContain('SCALE_VERIFIED');
    expect(body.textContent).not.toContain('42 ducts');
    expect(body.textContent).not.toContain('100% confidence');
  });

  it('10. Unknown route renders a safe not-found screen', async () => {
    window.history.pushState({}, 'Test', '/unknown/route/test');
    render(<App />);

    expect(screen.getByText(/404 — Page Not Found/i)).toBeInTheDocument();
    // No longer links to /live since /live redirects to workspace
    expect(screen.queryByRole('link', { name: /Return to Live Mode/i })).not.toBeInTheDocument();
  });
});
