import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../app/ThemeContext';

function Probe() {
  const { preference, theme, setPreference } = useTheme();
  return <><span>{`${preference}:${theme}`}</span><button onClick={() => setPreference('dark')}>Dark mode</button></>;
}

describe('theme preference', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('persists a selected theme and applies it to the document root', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(screen.getByText('dark:dark')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('bluetrace-theme')).toBe('dark');
  });
});
