import React, { useState } from 'react';
import { DEMO_PROJECT_FIXTURE, DEMO_SHEET_FIXTURE } from './demoFixtures';
import type { DemoProjectFixture, DemoSheetFixture } from './demoFixtures';
import { DemoDataContext } from './demoContext';

export const DemoDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project] = useState<DemoProjectFixture>(DEMO_PROJECT_FIXTURE);
  const [sheet] = useState<DemoSheetFixture>(DEMO_SHEET_FIXTURE);

  return (
    <DemoDataContext.Provider
      value={{
        isExampleOnly: true,
        project,
        sheet,
      }}
    >
      {children}
    </DemoDataContext.Provider>
  );
};
