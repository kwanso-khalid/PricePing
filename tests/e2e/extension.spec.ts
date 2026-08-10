import { test, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '../../dist');

test.describe('PriceWatch Extension', () => {
  test('extension loads and popup has correct title', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    // Get the service worker
    let background = context.serviceWorkers()[0];
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    // Get the extension ID from the service worker URL
    const swUrl = background.url();
    const extensionId = swUrl.split('/')[2];
    expect(extensionId).toBeTruthy();

    // Open the popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // Wait for React to render
    await popupPage.waitForSelector('h1', { timeout: 10000 });

    // Check the title element exists
    const title = popupPage.locator('h1');
    await expect(title).toContainText('PriceWatch');

    await context.close();
  });

  test('popup shows empty state when no items tracked', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    let background = context.serviceWorkers()[0];
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForSelector('h1', { timeout: 10000 });

    // Check empty state is shown
    const emptyState = popupPage.locator('text=No tracked items yet');
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test('options page loads with correct sections', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    let background = context.serviceWorkers()[0];
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await optionsPage.waitForLoadState('domcontentloaded');
    await optionsPage.waitForSelector('h1', { timeout: 10000 });

    const title = optionsPage.locator('h1');
    await expect(title).toContainText('PriceWatch Options');

    // Check settings sections exist
    await expect(optionsPage.locator('text=Check Frequency')).toBeVisible({ timeout: 5000 });
    await expect(optionsPage.locator('text=Notification Settings')).toBeVisible({ timeout: 5000 });
    await expect(optionsPage.locator('text=Export / Import')).toBeVisible({ timeout: 5000 });

    await context.close();
  });
});
