import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
  }

  if (typeof window.matchMedia !== 'function') {
    const mockMatchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    window.matchMedia = mockMatchMedia;
    (globalThis as unknown as { matchMedia: typeof mockMatchMedia }).matchMedia = mockMatchMedia;
  }
}

