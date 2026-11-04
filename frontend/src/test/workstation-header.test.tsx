import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkstationHeader } from '../workspace/components/layout/WorkstationHeader';

describe('WorkstationHeader honest scale semantics', () => {
  const baseProps = {
    sheetNumber: 'M-101',
    sheetTitle: 'Second Floor HVAC Plan',
    discipline: 'MECHANICAL',
    scaleOk: false,
    leftSidebarOpen: true,
    onToggleLeftSidebar: vi.fn(),
    rightSidebarOpen: true,
    onToggleRightSidebar: vi.fn(),
    disciplineFilter: 'ALL' as const,
    onDisciplineFilterChange: vi.fn(),
    statusFilter: 'ALL' as const,
    onStatusFilterChange: vi.fn(),
  };

  it('shows Scale unverified for plan sheets with unverified scale', () => {
    render(<WorkstationHeader {...baseProps} sheetType="plan" />);
    expect(screen.getByText('Scale unverified')).toBeInTheDocument();
    expect(screen.queryByText('Scale not needed')).not.toBeInTheDocument();
  });

  it('shows Scale not needed for legend, schedule and detail sheets', () => {
    const { rerender } = render(
      <WorkstationHeader
        {...baseProps}
        sheetNumber="M-001"
        sheetTitle="Legend and Abbreviations"
        sheetType="legend"
      />
    );
    expect(screen.getByText('Scale not needed')).toBeInTheDocument();
    expect(screen.queryByText('Scale unverified')).not.toBeInTheDocument();

    rerender(
      <WorkstationHeader
        {...baseProps}
        sheetNumber="M-601"
        sheetTitle="Mechanical Equipment Schedule"
        sheetType="schedule"
      />
    );
    expect(screen.getByText('Scale not needed')).toBeInTheDocument();
  });

  it('shows verified scale raw text when scaleOk is true', () => {
    render(
      <WorkstationHeader
        {...baseProps}
        scaleOk
        scaleRaw={'1/4" = 1\'-0"'}
        sheetType="plan"
      />
    );
    expect(screen.getByText('Scale 1/4" = 1\'-0"')).toBeInTheDocument();
  });
});
