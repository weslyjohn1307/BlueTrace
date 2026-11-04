/** Hide generated pipeline identifiers from engineer-facing sheet labels. */
export function displaySheetNumber(sheetNumber: string, pageIndex: number): string {
  const value = sheetNumber.trim();
  const generatedPageKey = /^(?:[a-f\d]{8,}_.+_p\d+|.+_page_\d+_detected(?:_[a-z]+)?)$/i.test(value);
  return generatedPageKey ? `Page ${Math.max(0, pageIndex) + 1}` : value || `Page ${Math.max(0, pageIndex) + 1}`;
}
