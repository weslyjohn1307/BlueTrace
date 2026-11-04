import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QAPanel } from '../workspace/components/QAPanel';
import type { QAAnnotation, QAChecklist } from '../api/contracts';

function annotation(overrides: Partial<QAAnnotation> = {}): QAAnnotation {
  return {
    annotation_id: 'ann-1',
    annotation_type: 'FLAG',
    reason_code: 'ORPHAN_RUN',
    severity: 'WARNING',
    message: 'Run orphan1 (DUCTWORK) has no system label.',
    sheet_id: 'm_101',
    geometry: null,
    evidence_ids: ['orphan1'],
    source_agent: 'agent_05_watchdog',
    status: 'OPEN',
    ...overrides,
  };
}

const checklist: QAChecklist[] = [
  {
    sheet_id: 'm_101',
    scale_status: 'UNVERIFIED',
    items_total: 4,
    measured_count: 2,
    open_flags: 1,
    open_conflicts: 0,
    notes: 0,
    verdict: 'NEEDS_REVIEW',
  },
];

describe('QAPanel', () => {
  it('renders annotations with severity badges and reasons', () => {
    render(
      <QAPanel
        annotations={[annotation(), annotation({ annotation_id: 'ann-2', severity: 'HIGH', reason_code: 'SCALE_UNVERIFIED_MEASURED' })]}
        checklist={checklist}
        loading={false}
        error={null}
        onResolve={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(screen.getByText('QA Review (2)')).toBeTruthy();
    expect(screen.getByText('ORPHAN_RUN')).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Open QA annotations' })).getByText('HIGH')
    ).toBeTruthy();
    expect(screen.getByText('m_101: NEEDS_REVIEW')).toBeTruthy();
  });

  it('shows an empty state when nothing is open', () => {
    render(
      <QAPanel annotations={[]} checklist={[]} loading={false} error={null} onResolve={() => {}} onRefresh={() => {}} />
    );
    expect(screen.getByText('No open QA tasks')).toBeTruthy();
  });

  it('confirms directly via onResolve', () => {
    const onResolve = vi.fn();
    render(
      <QAPanel
        annotations={[annotation()]}
        checklist={[]}
        loading={false}
        error={null}
        onResolve={onResolve}
        onRefresh={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ORPHAN_RUN' }));
    expect(onResolve).toHaveBeenCalledWith('ann-1', 'CONFIRMED');
  });

  it('requires a reason to dismiss', () => {
    const onResolve = vi.fn();
    render(
      <QAPanel
        annotations={[annotation()]}
        checklist={[]}
        loading={false}
        error={null}
        onResolve={onResolve}
        onRefresh={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss ORPHAN_RUN' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit dismissal' }));
    expect(screen.getByText('A reason is required to dismiss.')).toBeTruthy();
    expect(onResolve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Dismiss reason (required)'), {
      target: { value: 'duplicate' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit dismissal' }));
    expect(onResolve).toHaveBeenCalledWith('ann-1', 'DISMISSED', 'duplicate');
  });

  it('paginates large annotation lists and keeps long identifiers within the card', () => {
    const annotations = Array.from({ length: 23 }, (_, index) =>
      annotation({
        annotation_id: `ann-${index + 1}`,
        reason_code: `ORPHAN_RUN_${index + 1}`,
      })
    );
    render(
      <QAPanel
        annotations={annotations}
        checklist={[]}
        loading={false}
        error={null}
        onResolve={() => {}}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm ORPHAN_RUN_20' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm ORPHAN_RUN_21' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm ORPHAN_RUN_21' })).toBeTruthy();
  });
});
