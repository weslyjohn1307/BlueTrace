import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;
}
