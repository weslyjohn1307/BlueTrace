import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalibrationModal, snapScaleString } from '../workspace/components/CalibrationModal';

describe('CalibrationModal', () => {
  const base = {
    p1: [0, 0] as [number, number],
    p2: [18, 0] as [number, number],
    lengthPt: 18,
  };

  it('shows a live preview that snaps 1 ft over 18 pt to 1/4" scale', () => {
    render(
      <CalibrationModal open {...base} defaultFeet={1} defaultInches={0} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('calibration-modal')).toBeInTheDocument();
    // (1*12+0)*72/18 = 48 -> 1/4" = 1'-0"
    expect(screen.getByTestId('cal-preview')).toHaveTextContent('48.00');
    expect(screen.getByTestId('cal-preview')).toHaveTextContent('1/4');
    expect(screen.getByTestId('cal-confirm')).not.toBeDisabled();
  });

  it('recognizes 1/16-inch scale in the calibration preview', () => {
    expect(snapScaleString(192)).toBe('1/16" = 1\'-0"');
  });

  it('updates the live preview when the inputs change', () => {
    render(
      <CalibrationModal open {...base} defaultFeet={1} defaultInches={0} onConfirm={() => {}} onCancel={() => {}} />
    );
    fireEvent.change(screen.getByTestId('cal-feet-input'), { target: { value: '10' } });
    // (10*12)*72/18 = 480 -> Custom
    expect(screen.getByTestId('cal-preview')).toHaveTextContent('480.00');
    expect(screen.getByTestId('cal-preview')).toHaveTextContent('Custom');
  });

  it('shows an error and disables confirm when the distance is zero or negative', () => {
    render(
      <CalibrationModal open {...base} defaultFeet={0} defaultInches={0} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('cal-error')).toHaveTextContent('greater than 0');
    expect(screen.getByTestId('cal-confirm')).toBeDisabled();
  });

  it('rejects a paper line shorter than 5 pt', () => {
    render(
      <CalibrationModal
        open
        p1={[0, 0]}
        p2={[2, 0]}
        lengthPt={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId('cal-error')).toHaveTextContent('too short');
    expect(screen.getByTestId('cal-confirm')).toBeDisabled();
  });

  it('confirms with parsed feet/inches and cancels cleanly', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <CalibrationModal open {...base} defaultFeet={10} defaultInches={6} onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('cal-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ realFt: 10, realIn: 6 });
    fireEvent.click(screen.getByTestId('cal-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('is labelled as an accessible dialog', () => {
    render(
      <CalibrationModal open {...base} onConfirm={() => {}} onCancel={() => {}} />
    );
    const dialog = screen.getByTestId('calibration-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/feet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inches/i)).toBeInTheDocument();
  });

  it('formats non-snapped ratios as Custom (1" = X\'-Y")', () => {
    expect(snapScaleString(50)).toBe('Custom (1" = 4\'-2.0")');
    expect(snapScaleString(57.6)).toBe('Custom (1" = 4\'-9.6")');
    // Snapped values keep the canonical architectural strings.
    expect(snapScaleString(48)).toBe('1/4" = 1\'-0"');
  });
});
