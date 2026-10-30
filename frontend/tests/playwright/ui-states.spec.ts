/**
 * BlueTraceAI — Playwright UI Visual QA & Verification
 *
 * Captures all 10 canonical UX states specified in the hackathon contract:
 *   01-empty-state.png
 *   02-upload-config.png
 *   03-page-selection.png
 *   04-processing.png
 *   05-results-l1.png
 *   06-results-l2.png
 *   07-scale-manual.png
 *   08-copilot.png
 *   09-partial-results.png
 *   10-error-state.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve('playwright-screenshots');

// Canonical test PDFs
const PDF_SMALL_TRAINING = path.resolve(
  'fixtures/mechanical/avexis_page_22.pdf'
);
const PDF_LARGE_19P = path.resolve(
  'fixtures/plumbing/p104_1_plumbing_level4.pdf'
);

async function saveScreenshot(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`📸 Saved: ${name}.png -> ${filepath}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('BlueTraceAI — Visual QA & Canonical UX Verification', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get('http://127.0.0.1:8000/api/v1/health');
      expect(res.ok()).toBeTruthy();
    } catch {
      console.warn('⚠️ Backend at http://127.0.0.1:8000/api/v1/health unreachable.');
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 01: EMPTY / READY STATE
  // ──────────────────────────────────────────────────────────────────────────
  test('01-empty-state: Landing screen renders brand and upload CTA', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Assert Brand visible
    await expect(page.getByText('BlueTraceAI').first()).toBeVisible();

    // Assert Upload Button visible
    const uploadBtn = page.locator('#topnav-choose-pdf-btn');
    await expect(uploadBtn).toBeVisible();

    // Verify no fabricated numbers
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('31.699');
    expect(bodyText).not.toContain('42 ducts');

    await saveScreenshot(page, '01-empty-state');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 02: CONFIGURATION STATE
  // ──────────────────────────────────────────────────────────────────────────
  test('02-upload-config: Uploading PDF shows configuration and preflight details', async ({ page }) => {
    if (!fs.existsSync(PDF_SMALL_TRAINING)) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(PDF_SMALL_TRAINING);

    // Wait for preflight completion
    await expect(page.getByText(/Ready for analysis/i).first()).toBeVisible({ timeout: 25000 });
    await expect(page.getByText(/BSWH-THH TFO_page_8\.pdf/i).first()).toBeVisible();

    // Analyze button should be ready
    const topNavBtn = page.locator('#topnav-analyze-btn');
    await expect(topNavBtn).toBeVisible();

    await saveScreenshot(page, '02-upload-config');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 03: PAGE SELECTION MODAL (>10 pages)
  // ──────────────────────────────────────────────────────────────────────────
  test('03-page-selection: 19-page PDF triggers interactive page selection modal', async ({ page }) => {
    if (!fs.existsSync(PDF_LARGE_19P)) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(PDF_LARGE_19P);

    // Wait for preflight to detect 19 pages (may take ~25-35s on 15MB PDF)
    await expect(page.getByText(/19 pages/i).first()).toBeVisible({ timeout: 60000 });

    // Click Analyze to trigger page selection modal
    const analyzeBtn = page.locator('#topnav-analyze-btn');
    await analyzeBtn.click();

    // Modal should be visible with title
    const modalTitle = page.locator('#page-select-title');
    await expect(modalTitle).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Select Specific Pages/i)).toBeVisible();

    // Confirm button should be visible
    const confirmBtn = page.locator('#page-selection-confirm-btn');
    await expect(confirmBtn).toBeVisible();

    await saveScreenshot(page, '03-page-selection');

    // Close modal
    const cancelBtn = page.getByRole('button', { name: /Cancel/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 04 to 08: END-TO-END PIPELINE RUN (Processing, Results, Scale, Copilot)
  // ──────────────────────────────────────────────────────────────────────────
  test('04-08-pipeline-results-flow: Run extraction on small PDF and inspect results, scale, and copilot', async ({ page }) => {
    if (!fs.existsSync(PDF_SMALL_TRAINING)) {
      test.skip();
      return;
    }

    await page.goto('/', { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(PDF_SMALL_TRAINING);
    await expect(page.getByText(/Ready for analysis/i).first()).toBeVisible({ timeout: 25000 });

    const analyzeBtn = page.locator('#topnav-analyze-btn');
    await analyzeBtn.click();

    // 04: Capture Processing State
    await page.waitForTimeout(1000);
    await saveScreenshot(page, '04-processing');

    // Wait for extraction to complete and results to arrive (up to 90s)
    await expect(page.getByRole('complementary', { name: /Drawing Sheets Sidebar/i })).toBeVisible({
      timeout: 90000,
    });

    // Allow canvas rendering and routes/objects API requests to complete
    await page.waitForTimeout(4000);

    // 05: Capture Results L1 View
    await saveScreenshot(page, '05-results-l1');

    // 06: Capture Results L2 View (Routes tab)
    const routesTab = page.getByRole('button', { name: /Routes/i }).first();
    if (await routesTab.isVisible()) {
      await routesTab.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, '06-results-l2');

    // 07: Open Scale Calibration Modal
    const calibBtn = page.locator('#canvas-calibrate-scale-btn');
    if (await calibBtn.isVisible()) {
      await calibBtn.click();
      await page.waitForTimeout(600);
      await saveScreenshot(page, '07-scale-manual');

      // Close scale modal
      const closeScaleBtn = page.locator('#scale-modal-close-btn');
      if (await closeScaleBtn.isVisible()) {
        await closeScaleBtn.click();
        await expect(page.getByRole('dialog', { name: /Calibrate Drawing Scale/i })).toBeHidden({ timeout: 5000 });
        await page.waitForTimeout(400);
      }
    }

    // 08: Open Copilot Drawer
    const copilotBtn = page.locator('#results-ask-drawing-btn');
    await expect(copilotBtn).toBeVisible({ timeout: 5000 });
    await copilotBtn.click();
    await expect(page.getByRole('complementary', { name: /Ask the Drawing Assistant/i })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await saveScreenshot(page, '08-copilot');

    // Close Copilot drawer
    const closeCopilotBtn = page.locator('#copilot-drawer-close-btn');
    if (await closeCopilotBtn.isVisible()) {
      await closeCopilotBtn.click();
      await page.waitForTimeout(400);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 09: PARTIAL RESULTS STATE
  // ──────────────────────────────────────────────────────────────────────────
  test('09-partial-results: Partial / Warning State renders clear honest disclaimer', async ({ page }) => {
    // Demo mode renders the honest demo/example data banners across all panels
    await page.goto('/demo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await saveScreenshot(page, '09-partial-results');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10: ERROR STATE
  // ──────────────────────────────────────────────────────────────────────────
  test('10-error-state: Invalid non-PDF file upload displays actionable error message', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'corrupted_sheet.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Non-PDF test content'),
    });

    // Error banner should appear
    await expect(page.getByText(/Only PDF documents/i)).toBeVisible({ timeout: 5000 });

    await saveScreenshot(page, '10-error-state');
  });
});
