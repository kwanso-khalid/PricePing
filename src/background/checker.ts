import type { TrackedItem, ExtractedProduct, CheckResult } from '../types/index.js';
import { getAllItems, saveItem, getSettings } from '../lib/storage.js';
import { addPricePoint } from '../lib/history.js';
import { isLessThan, sameCurrency } from '../lib/money.js';
import { isDueForCheck, staggerDelayMs } from '../lib/backoff.js';
import { extractProduct } from '../content/extract/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('checker');

const MAX_ITEMS_PER_PASS = 10;
const FETCH_TIMEOUT_MS = 15000;
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Fetch a URL with timeout and parse with DOMParser.
 */
async function fetchAndParse(url: string): Promise<Document> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      credentials: 'omit',
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/**
 * Check if a response looks blocked (200 but no useful content).
 */
function isBlockedResponse(doc: Document, extracted: ExtractedProduct | null): boolean {
  if (!extracted) {
    // Check for bot detection pages
    const bodyText = doc.body?.textContent?.toLowerCase() ?? '';
    return (
      bodyText.includes('access denied') ||
      bodyText.includes('robot') ||
      bodyText.includes('captcha') ||
      bodyText.includes('blocked') ||
      doc.title.toLowerCase().includes('access denied') ||
      doc.title.toLowerCase().includes('robot check')
    );
  }
  return false;
}

/**
 * Run a single check on a tracked item.
 */
async function checkItem(item: TrackedItem): Promise<CheckResult> {
  let doc: Document;

  try {
    doc = await fetchAndParse(item.url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn('Fetch failed', { url: item.url, error: message });
    return { status: 'error', message };
  }

  const extracted = extractProduct(doc, item.hostname);

  if (isBlockedResponse(doc, extracted)) {
    logger.warn('Site appears to be blocking requests', { hostname: item.hostname });
    return { status: 'blocked' };
  }

  if (!extracted) {
    return { status: 'error', message: 'Could not extract price from page' };
  }

  // Currency mismatch check
  if (!sameCurrency(extracted.price, item.currentPrice)) {
    logger.warn('Currency mismatch detected', {
      expected: item.currency,
      got: extracted.price.currency,
    });
    return { status: 'error', message: `Currency changed: ${extracted.price.currency}` };
  }

  return { status: 'ok', product: extracted };
}

/**
 * Run a price check pass over due items.
 * At most MAX_ITEMS_PER_PASS items, staggered by hostname.
 */
export async function runCheckPass(): Promise<void> {
  logger.info('Starting check pass');

  const settings = await getSettings();
  const allItems = await getAllItems();
  const checkIntervalMs = settings.checkIntervalHours * 60 * 60 * 1000;
  const now = Date.now();

  // Filter items due for checking
  const dueItems = Object.values(allItems)
    .filter(
      (item) =>
        !item.paused &&
        isDueForCheck(item.lastCheckedAt, item.consecutiveFailures, checkIntervalMs, now),
    )
    .slice(0, MAX_ITEMS_PER_PASS);

  if (dueItems.length === 0) {
    logger.info('No items due for checking');
    return;
  }

  logger.info(`Checking ${dueItems.length} items`);

  // Group by hostname to avoid parallel requests to same host
  const byHostname = new Map<string, TrackedItem[]>();
  for (const item of dueItems) {
    const group = byHostname.get(item.hostname) ?? [];
    group.push(item);
    byHostname.set(item.hostname, group);
  }

  // Process sequentially with stagger
  const processedItemIds: string[] = [];

  for (const [hostname, items] of byHostname) {
    for (const item of items) {
      if (processedItemIds.length > 0) {
        // Stagger delay between requests
        const delay = staggerDelayMs();
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }

      logger.debug('Checking item', { id: item.id, url: item.url });

      const result = await checkItem(item);
      const updatedItem = applyCheckResult(item, result, now);

      const saveResult = await saveItem(updatedItem);
      if (!saveResult.ok) {
        logger.error('Failed to save item after check', { id: item.id, error: saveResult.error });
      }

      processedItemIds.push(item.id);
    }

    void hostname; // used in map key
  }

  logger.info('Check pass complete', { processed: processedItemIds.length });
}

/**
 * Apply a check result to an item and return the updated item.
 */
export function applyCheckResult(
  item: TrackedItem,
  result: CheckResult,
  now: number = Date.now(),
): TrackedItem {
  const updated: TrackedItem = { ...item, lastCheckedAt: now };

  switch (result.status) {
    case 'ok': {
      const newPrice = result.product.price;
      const priceChanged = newPrice.amountMinor !== item.currentPrice.amountMinor;

      updated.currentPrice = newPrice;
      updated.consecutiveFailures = 0;

      if (priceChanged) {
        updated.history = addPricePoint(item.history, {
          price: newPrice,
          observedAt: now,
          inStock: result.product.inStock,
        });
      }

      // Check if we should notify
      const shouldNotify = shouldTriggerNotification(updated);
      if (shouldNotify) {
        logger.info('Price drop detected', {
          id: item.id,
          from: item.currentPrice.amountMinor,
          to: newPrice.amountMinor,
        });
      }

      break;
    }

    case 'error': {
      updated.consecutiveFailures = item.consecutiveFailures + 1;
      logger.warn('Check error', { id: item.id, failures: updated.consecutiveFailures });

      if (updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error('Item needs attention', { id: item.id });
      }
      break;
    }

    case 'blocked': {
      updated.consecutiveFailures = item.consecutiveFailures + 1;
      break;
    }

    case 'unchanged': {
      updated.consecutiveFailures = 0;
      break;
    }
  }

  return updated;
}

/**
 * Determine if a notification should be triggered for an item.
 */
export function shouldTriggerNotification(item: TrackedItem): boolean {
  const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours

  // Check cooldown
  if (item.lastNotifiedAt !== null && Date.now() - item.lastNotifiedAt < cooldownMs) {
    return false;
  }

  // Dedup: don't notify for same or higher price as last notification
  if (
    item.lastNotifiedPriceMinor !== null &&
    item.currentPrice.amountMinor >= item.lastNotifiedPriceMinor
  ) {
    return false;
  }

  // Check trigger condition
  if (item.targetPrice !== null) {
    return (
      sameCurrency(item.currentPrice, item.targetPrice) &&
      isLessThan(item.currentPrice, item.targetPrice)
    );
  }

  // Default: any drop below initial price
  return (
    sameCurrency(item.currentPrice, item.initialPrice) &&
    isLessThan(item.currentPrice, item.initialPrice)
  );
}
