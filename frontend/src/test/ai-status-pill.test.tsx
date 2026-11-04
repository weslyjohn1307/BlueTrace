import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiStatusPill, resolveAiAvailability } from '../components/AiStatusPill';

describe('AI status readiness', () => {
  it('stays in checking until the first health probe returns', () => {
    expect(resolveAiAvailability(null, false)).toBe('checking');
    expect(resolveAiAvailability(null, true)).toBe('checking');
  });

  it('reports a connection issue only when the backend probe fails', () => {
    expect(resolveAiAvailability(false, false)).toBe('offline');
  });

  it('separates local-only work from a configured Meta connection', () => {
    expect(resolveAiAvailability(true, false)).toBe('local');
    expect(resolveAiAvailability(true, true)).toBe('available');
  });

  it('names each state in visible text, not colour alone', () => {
    const { rerender } = render(<AiStatusPill availability="checking" />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking connection');

    rerender(<AiStatusPill availability="local" />);
    expect(screen.getByRole('status')).toHaveTextContent('Local mode');

    rerender(<AiStatusPill availability="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Server offline');

    const onOpenSettings = vi.fn();
    rerender(<AiStatusPill availability="available" onOpenSettings={onOpenSettings} />);
    expect(screen.getByRole('button', { name: /AI status: Meta connected/i })).toHaveTextContent(
      'Meta connected'
    );
  });
});
