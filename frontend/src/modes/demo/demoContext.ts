import { createContext, useContext } from 'react';
import type { DemoProjectFixture, DemoSheetFixture } from './demoFixtures';

export interface DemoDataContextValue {
  isExampleOnly: true;
  project: DemoProjectFixture;
  sheet: DemoSheetFixture;
}

export const DemoDataContext = createContext<DemoDataContextValue | null>(null);

export function useDemoData(): DemoDataContextValue {
  const ctx = useContext(DemoDataContext);
  if (!ctx) {
    throw new Error('useDemoData must be used within a DemoDataProvider');
  }
  return ctx;
}
