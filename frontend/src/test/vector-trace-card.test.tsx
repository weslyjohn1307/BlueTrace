import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VectorTraceCard } from '../workspace/components/VectorTraceCard';

describe('VectorTraceCard scale status', () => {
  it('keeps its metrics collapsed over the drawing until requested', () => {
    render(<VectorTraceCard totalRuns={2251} totalLengthFt={10698} />);

    expect(screen.queryByText('Segment Density')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show vector trace details' }));
    expect(screen.getByText('Segment Density')).toBeInTheDocument();
  });

  it('distinguishes printed-scale verification from manual calibration', () => {
    const { rerender } = render(
      <VectorTraceCard scaleVerified scaleRatio={96} scaleStatus="VERIFIED" />,
    );

    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.queryByText('CALIBRATED')).not.toBeInTheDocument();

    rerender(
      <VectorTraceCard scaleVerified scaleRatio={96} scaleStatus="CALIBRATED" />,
    );

    expect(screen.getByText('CALIBRATED')).toBeInTheDocument();
  });
  it('shows unscored when no calibrated confidence is available', () => {
    render(<VectorTraceCard totalRuns={12} totalLengthFt={500} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show vector trace details' }));
    expect(screen.queryByText('99.8%')).not.toBeInTheDocument();
    expect(screen.getByText('Unscored')).toBeInTheDocument();
  });
});
