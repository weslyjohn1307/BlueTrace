export interface DemoProjectFixture {
  projectId: string;
  name: string;
  description: string;
  isExampleOnly: true;
}

export interface DemoSheetFixture {
  sheetId: string;
  sourceId: string;
  title: string;
  discipline: string;
  pageCount: number;
  byteSize: number;
  sha256: string;
  isExampleOnly: true;
}

export interface DemoPreflightFixture {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  candidateSheetId: string;
  sheetIdConfidence: string;
  sheetIdSource: string;
  processabilityStatus: string;
  isExampleOnly: true;
}

export interface DemoJobFixture {
  jobId: string;
  state: string;
  runId: string;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  isExampleOnly: true;
}

export const DEMO_PROJECT_FIXTURE: DemoProjectFixture = {
  projectId: 'PRJ-DEMO-SAMPLE-ONLY',
  name: 'Sample Clinic Floor Plan (Example Only)',
  description: 'Example placeholder fixture for demo UI layout validation only. Not calculated from any real construction drawing.',
  isExampleOnly: true,
};

export const DEMO_SHEET_FIXTURE: DemoSheetFixture = {
  sheetId: 'M-SAMPLE-01',
  sourceId: 'SRC-DEMO-SAMPLE-01',
  title: 'HVAC Layout Plan (Example Only)',
  discipline: 'Mechanical (Example)',
  pageCount: 1,
  byteSize: 524288,
  sha256: 'DEMO0000EXAMPLE0000SHA25600000000000000000000000000000000000000000000',
  isExampleOnly: true,
};

export const DEMO_PREFLIGHT_FIXTURE: DemoPreflightFixture = {
  pageNumber: 1,
  widthPt: 2592.0,
  heightPt: 1728.0,
  rotation: 0,
  candidateSheetId: 'M-SAMPLE-01',
  sheetIdConfidence: 'unknown',
  sheetIdSource: 'example_placeholder_title_block',
  processabilityStatus: 'PROCESSABLE',
  isExampleOnly: true,
};

export const DEMO_JOB_FIXTURE: DemoJobFixture = {
  jobId: 'JOB-DEMO-EXAMPLE-01',
  state: 'COMPLETE',
  runId: 'RUN-DEMO-EXAMPLE-ONLY',
  totalPages: 1,
  completedPages: 1,
  failedPages: 0,
  isExampleOnly: true,
};

