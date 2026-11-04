import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
type ThemeContextValue = { preference: ThemePreference; theme: 'light' | 'dark'; setPreference: (value: ThemePreference) => void };
const THEME_STORAGE_SLOT = 'bluetrace-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

const defaultThemeContext: ThemeContextValue = {
  preference: 'system',
  theme: 'light',
  setPreference: () => {},
};

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_SLOT);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch { /* storage can be disabled */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    theme,
    setPreference(next) {
      setPreferenceState(next);
      try { localStorage.setItem(THEME_STORAGE_SLOT, next); } catch { /* preference remains active for this session */ }
    },
  }), [preference, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// The hook is intentionally colocated with its provider to keep the preference contract private.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeContext;
}
