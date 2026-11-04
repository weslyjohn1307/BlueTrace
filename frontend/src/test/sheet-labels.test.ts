import { describe, expect, it } from 'vitest';
import { displaySheetNumber } from '../workspace/utils/sheetLabels';

describe('engineer-facing sheet labels', () => {
  it('keeps drawing sheet numbers and replaces generated pipeline IDs with page numbers', () => {
    expect(displaySheetNumber('P1', 2)).toBe('P1');
    expect(displaySheetNumber('b432d3a05a4f_plumbing_test_set_p3', 2)).toBe('Page 3');
    expect(displaySheetNumber('Phase 1 Combine Document_page_402_detected_hvac', 401)).toBe('Page 402');
    expect(displaySheetNumber('', 0)).toBe('Page 1');
  });
});
