import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShowcasePage } from '../modes/showcase/ShowcasePage';

describe('ShowcasePage', () => {
  it('renders the official brand logo and creator name Wesly John', () => {
    render(<ShowcasePage />);

    // Brand title in wordmark
    expect(screen.getByLabelText(/BlueTraceAI, back to top/i)).toBeInTheDocument();

    // Creator name in footer
    expect(screen.getByRole('heading', { level: 2, name: /Wesly John/i })).toBeInTheDocument();

    // Chapter indices
    expect(screen.getByText('Why this project')).toBeInTheDocument();
    expect(screen.getByText('Product demo')).toBeInTheDocument();
    expect(screen.getByText('The trust boundary')).toBeInTheDocument();
  });
});
