/**
 * BlueTraceAI — Playwright smoke & visual QA.
 *
 * Requires the backend on http://127.0.0.1:8000 and the frontend dev server.
 * Covers the single real flow: upload → scan → canvas → ledger → copilot.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve('playwright-screenshots');
const FIXTURE = path.resolve('../fixtures/mechanical/hvac_plan_level2.pdf');

async function saveScreenshot(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
}

test.describe.configure({ mode: 'serial' });

test.describe('BlueTraceAI — smoke & visual QA', () => {
  test.beforeAll(async ({ request }) => {
    expect(fs.existsSync(FIXTURE), `fixture missing: ${FIXTURE}`).toBeTruthy();
    const res = await request.get('http://127.0.0.1:8000/api/health');
    expect(res.ok()).toBeTruthy();
  });

  test('01-landing: brand, upload card, and fixtures render', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText('BlueTraceAI').first()).toBeVisible();
    await expect(page.locator('#topnav-choose-pdf-btn')).toBeVisible();
    await expect(page.getByTestId('upload-card')).toBeVisible();
    await expect(page.getByText('M-201 HVAC plan')).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('31.699');
    expect(bodyText).not.toContain('42 ducts');

    await saveScreenshot(page, '01-landing');
  });

  test('02-flow: fixture scan shows canvas, scale badge, and ledger', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByText('M-201 HVAC plan').click();

    await expect(page.getByTestId('sheet-canvas')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('ledger-panel')).toBeVisible();
    // Either a verified scale or the honest unverified warning must show.
    await expect(page.getByText(/Unverified|UNVERIFIED|1\/4"|Scale/i).first()).toBeVisible();

    await saveScreenshot(page, '02-workspace');
  });

  test('03-copilot: drawer opens and answers with provenance', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByText('M-201 HVAC plan').click();
    await expect(page.getByTestId('sheet-canvas')).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: 'Open copilot' }).click();
    await expect(page.getByTestId('copilot-drawer')).toBeVisible();
    await page.getByLabel('Copilot question').fill('How many diffusers are on this sheet?');
    await page.getByRole('button', { name: 'Send' }).click();

    // Either the model or the labelled offline template must answer.
    await expect(page.getByText(/muse-wonder-1\.0|offline template/).first()).toBeVisible({ timeout: 30000 });
    await saveScreenshot(page, '03-copilot');
  });

  test('04-demo: demo mode renders its honest banner', async ({ page }) => {
    await page.goto('/demo', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Example data only/i).first()).toBeVisible();
    await saveScreenshot(page, '04-demo');
  });

  test('05-error: non-PDF upload shows an actionable error', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'corrupted_sheet.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Non-PDF test content'),
    });

    await expect(page.getByText(/Only PDF documents/i)).toBeVisible({ timeout: 5000 });
    await saveScreenshot(page, '05-error-state');
  });
});
