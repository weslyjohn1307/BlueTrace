import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopilotDrawer } from '../workspace/components/CopilotDrawer';
import type { DiscrepancyItem } from '../api/contracts';

describe('CopilotDrawer & Discrepancy Navigation', () => {
  const sampleDiscrepancies: DiscrepancyItem[] = [
    {
      item_id: 'disc-1',
      tag: 'VAV-1-01',
      label: 'VAV-1-01',
      schedule_qty: 4,
      plan_qty: 3,
      variance: -1,
      status: 'UNDERCOUNT',
      severity: 'WARNING',
      discipline: 'MECHANICAL',
      system: 'Supply Air',
      notes: '1 unit missing from plan M-2.2',
      location_pt: [420.5, 310.2],
    },
    {
      item_id: 'disc-2',
      tag: 'AHU-1',
      label: 'AHU-1',
      schedule_qty: 1,
      plan_qty: 0,
      variance: -1,
      status: 'UNPLACED_GHOST',
      severity: 'CRITICAL',
      discipline: 'MECHANICAL',
      system: 'Supply Air',
      notes: 'Scheduled rooftop AHU not found on floor plan',
      location_pt: [60.0, 100.0],
    },
    {
      item_id: 'disc-3',
      tag: 'EF-1',
      label: 'EF-1',
      schedule_qty: 1,
      plan_qty: 1,
      variance: 0,
      status: 'MATCHED',
      severity: 'INFO',
      discipline: 'MECHANICAL',
      system: 'Exhaust Air',
    },
  ];

  it('renders open drawer with ARIA dialog semantics', () => {
    render(
      <CopilotDrawer
        open={true}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
      />
    );

    const dialog = screen.getByTestId('copilot-drawer');
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Ask the drawing');
  });

  it('retains drawer state while collapsing its closed viewport footprint', () => {
    const { rerender } = render(
      <CopilotDrawer
        open={true}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
      />
    );

    const dialog = screen.getByTestId('copilot-drawer');
    expect(dialog.className).toContain('max-w-lg');

    rerender(
      <CopilotDrawer
        open={false}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
      />
    );

    // Still in DOM so copilot state survives, but it no longer expands the page.
    expect(dialog).toBeInTheDocument();
    expect(dialog.className).toContain('max-w-0');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CopilotDrawer
        open={true}
        onClose={onClose}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
      />
    );

    const closeBtn = screen.getByLabelText('Close copilot');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders discrepancy records with severity badges and monospace counts', () => {
    render(
      <CopilotDrawer
        open={true}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
        discrepancies={sampleDiscrepancies}
      />
    );

    // Verify critical severity badge for ghost equipment
    expect(screen.getByText('AHU-1')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText(/UNPLACED_GHOST/i)).toBeInTheDocument();

    // Verify warning badge for undercount
    expect(screen.getByText('VAV-1-01')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();

    // Verify monospace tabular variance formatting
    expect(screen.getAllByText('Sched:').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Plan:').length).toBeGreaterThanOrEqual(1);
  });

  it('triggers onLocateItem and onEvidence when citation button is clicked', () => {
    const onEvidence = vi.fn();
    const onLocateItem = vi.fn();
    render(
      <CopilotDrawer
        open={true}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={onEvidence}
        onLocateItem={onLocateItem}
        discrepancies={sampleDiscrepancies}
      />
    );

    const citationButtons = screen.getAllByTitle('Highlight on drawing canvas');
    expect(citationButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(citationButtons[0]);
    expect(onLocateItem).toHaveBeenCalledWith([420.5, 310.2]);
    expect(onEvidence).toHaveBeenCalledWith([[420.5, 310.2]]);
  });

  it('handles discrepancy resolution actions: place, dismiss, verify', () => {
    const onPlaceGhostPin = vi.fn();
    const onDismissDiscrepancy = vi.fn();
    const onVerifyDiscrepancy = vi.fn();

    render(
      <CopilotDrawer
        open={true}
        onClose={vi.fn()}
        sheetId="sheet_m22"
        onEvidence={vi.fn()}
        discrepancies={sampleDiscrepancies}
        onPlaceGhostPin={onPlaceGhostPin}
        onDismissDiscrepancy={onDismissDiscrepancy}
        onVerifyDiscrepancy={onVerifyDiscrepancy}
      />
    );

    // Place on Canvas for ghost equipment
    const placeBtn = screen.getByText('Place on Canvas');
    fireEvent.click(placeBtn);
    expect(onPlaceGhostPin).toHaveBeenCalledWith('disc-2');

    // Mark Verified
    const verifyButtons = screen.getAllByText('Mark Verified');
    fireEvent.click(verifyButtons[0]);
    expect(onVerifyDiscrepancy).toHaveBeenCalledWith('disc-1');

    // Dismiss
    const dismissButtons = screen.getAllByLabelText('Dismiss');
    fireEvent.click(dismissButtons[0]);
    expect(onDismissDiscrepancy).toHaveBeenCalledWith('disc-1');
  });
});
