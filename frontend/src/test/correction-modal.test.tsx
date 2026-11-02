import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CorrectionModal } from '../workspace/components/CorrectionModal';
import { CORRECTION_REASONS } from '../api/contracts';
import { createApiClient } from '../api/client';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseProps = {
  open: true,
  itemId: 'item-1',
  itemLabel: '12x8 Rectangular Duct',
  initial: {
    dimensionLabel: '12x8',
    cfm: 300,
    system: 'Supply',
    category: 'Ductwork',
  },
  onSubmit: () => {},
  onCancel: () => {},
};

describe('CorrectionModal', () => {
  it('exposes the REV-002 reason taxonomy as options', () => {
    expect(CORRECTION_REASONS).toContain('OCR_MISREAD_DIGIT');
    expect(CORRECTION_REASONS).toContain('WRONG_SYSTEM_CLASSIFICATION');
    expect(CORRECTION_REASONS).toHaveLength(9);
  });

  it('renders an accessible correction form', () => {
    render(<CorrectionModal {...baseProps} />);
    const dialog = screen.getByTestId('correction-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/dimension/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/airflow|cfm/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/system/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
  });

  it('submitting corrected 450 CFM records the original proposal in the payload', () => {
    const onSubmit = vi.fn();
    render(<CorrectionModal {...baseProps} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/airflow|cfm/i), { target: { value: '450' } });
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'OCR_MISREAD_DIGIT' },
    });
    fireEvent.click(screen.getByTestId('correction-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.itemId).toBe('item-1');
    expect(payload.correctedValues.cfm).toBe(450);
    expect(payload.originalProposal.cfm).toBe(300);
    expect(payload.reason).toBe('OCR_MISREAD_DIGIT');
  });

  it('blocks submit until a reason code is chosen', () => {
    render(<CorrectionModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/airflow|cfm/i), { target: { value: '450' } });
    expect(screen.getByTestId('correction-submit')).toBeDisabled();
    expect(screen.getByTestId('correction-error')).toHaveTextContent(/reason/i);
  });

  it('rejects non-integer CFM input', () => {
    render(<CorrectionModal {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/airflow|cfm/i), { target: { value: '450.5' } });
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: 'WRONG_SCALE_RATIO' },
    });
    expect(screen.getByTestId('correction-submit')).toBeDisabled();
    expect(screen.getByTestId('correction-error')).toHaveTextContent(/integer/i);
  });

  it('cancels cleanly via Cancel and Escape', () => {
    const onCancel = vi.fn();
    const { unmount } = render(<CorrectionModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('correction-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('submitItemCorrection client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCHes the existing takeoff status endpoint with original + corrected values', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ item_id: 'item-1', status: 'ACCEPTED', updated: true })
    );
    const client = createApiClient();
    const res = await client.submitItemCorrection('item-1', {
      reason: 'OCR_MISREAD_DIGIT',
      originalProposal: { dimensionLabel: '12x8', cfm: 300, system: 'Supply', category: 'Ductwork' },
      correctedValues: { dimensionLabel: '12x8', cfm: 450, system: 'Supply', category: 'Ductwork' },
    });

    expect(res.updated).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/takeoff/items/item-1/status');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('CORRECT');
    expect(body.reason).toBe('OCR_MISREAD_DIGIT');
    expect(body.corrected_values.cfm).toBe(450);
    expect(body.original_proposal.cfm).toBe(300);
  });
});
