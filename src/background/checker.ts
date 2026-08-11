import type { Product, Observation, ObservationHistory, StockStateCode, ParseTier, ParseStatus } from '../types/storage.js';
import type { ExtractedProduct, CheckResult } from '../types/index.js';
import {
  getProductIndex, getProduct, getHistory, getSettings,
  appendObservation, updateProduct,
} from '../lib/storage.js';
import { sameCurrency } from '../lib/money.js';
import { isDueForCheck, staggerDelayMs } from '../lib/backoff.js';
import { sanityCheckObservation } from '../lib/sanity.js';
import { extractProductAsync } from '../content/extract/index.js';
import { createLogger } from '../lib/logger.js';
import { getHostBackoff, recordHostSuccess, recordHostFailure, isHostPaused } from '../lib/hostbackoff.js';
import { sendRestockNotification } from './notifier.js';

const logger = createLogger('checker');
const MAX_ITEMS_PER_PASS = 10;
const FETCH_TIMEOUT_MS = 15000;
const MAX_CONSECUTIVE_FAILURES = 5;

function methodToTier(method: ExtractedProduct['method']): ParseTier {
  if (method === 'adapter' || method === 'shopify' || method === 'woocommerce') return 2;
  if (method === 'generic') return 3;
  return 1;
}

function toStockState(product: ExtractedProduct): StockStateCode {
  if (product.stockState !== undefined) return product.stockState;
  return product.inStock ? 1 : 2;
}

async function fetchAndParse(url: string): Promise<Document> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      credentials: 'omit',
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function isBlockedResponse(doc: Document, extracted: ExtractedProduct | null): boolean {
  if (extracted) return false;
  const body = doc.body?.textContent?.toLowerCase() ?? '';
  return body.includes('access denied') || body.includes('robot') || body.includes('captcha') ||
    body.includes('blocked') || doc.title.toLowerCase().includes('access denied');
}

async function checkProduct(product: Product): Promise<CheckResult> {
  let doc: Document;
  try {
    doc = await fetchAndParse(product.url);
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  const extracted = await extractProductAsync(doc, product.retailerHost, product.url);
  if (isBlockedResponse(doc, extracted)) return { status: 'blocked' };
  if (!extracted) return { status: 'error', message: 'Could not extract price' };
  if (!sameCurrency(extracted.price, { amountMinor: product.currentPrice, currency: product.currency })) {
    return { status: 'error', message: `Currency changed: ${extracted.price.currency}` };
  }
  return { status: 'ok', product: extracted };
}

export async function runCheckPass(): Promise<void> {
  // Skip entire pass if offline
  if (!(navigator as Navigator & { onLine: boolean }).onLine) {
    logger.info('Skipping check pass: offline');
    return;
  }

  logger.info('Starting check pass');
  const settings = await getSettings();
  const allSummaries = await getProductIndex();
  const checkIntervalMs = settings.checkIntervalHours * 60 * 60 * 1000;
  const now = Date.now();

  const due = allSummaries
    .filter((s) => s.parseStatus !== 'paused' && isDueForCheck(s.lastCheckedAt, 0, checkIntervalMs, now))
    .slice(0, MAX_ITEMS_PER_PASS);

  if (due.length === 0) { logger.info('No items due'); return; }

  const hostBackoffState = await getHostBackoff();

  for (let i = 0; i < due.length; i++) {
    if (i > 0) await new Promise<void>((resolve) => setTimeout(resolve, staggerDelayMs()));
    const summary = due[i];
    if (!summary) continue;

    // Per-host backoff check
    let hostname: string;
    try {
      hostname = new URL(summary.url).hostname;
    } catch {
      hostname = summary.retailerHost;
    }

    if (isHostPaused(hostBackoffState, hostname)) {
      logger.info('Skipping product: host paused', { id: summary.id, hostname });
      continue;
    }

    const product = await getProduct(summary.id);
    if (!product) continue;
    const result = await checkProduct(product);
    const nowMs = Date.now();

    // Track per-host failures
    if (result.status === 'blocked' || result.status === 'error') {
      await recordHostFailure(hostname);
      // Refresh state for subsequent iterations in this pass
      const refreshed = await getHostBackoff();
      hostBackoffState.failures = refreshed.failures;
      hostBackoffState.pausedUntil = refreshed.pausedUntil;
    } else if (result.status === 'ok') {
      await recordHostSuccess(hostname);
    }

    switch (result.status) {
      case 'ok': {
        const newPriceMinor = result.product.price.amountMinor;
        const tier = methodToTier(result.product.method);
        const stockState = toStockState(result.product);
        const priceChanged = newPriceMinor !== product.currentPrice;
        const restocked = product.stockState !== 1 && stockState === 1;

        const base: Product = {
          ...product,
          currentPrice: newPriceMinor,
          lastKnownStockState: product.stockState,  // snapshot before update
          stockState,
          parseTier: tier,
          parseStatus: 'ok',
          consecutiveFailures: 0,
          lastCheckedAt: nowMs,
          lastSuccessfulParseAt: nowMs,
        };

        if (priceChanged) {
          const history = await getHistory(product.id);
          if (!sanityCheckObservation(newPriceMinor, history?.obs ?? [])) {
            logger.warn('Sanity check failed', { id: product.id, price: newPriceMinor });
            await updateProduct(base);
            break;
          }
          const obs: Observation = [
            Math.floor(nowMs / 60_000), newPriceMinor,
            result.product.advertisedListPrice?.amountMinor ?? 0,
            stockState, tier,
          ];
          await appendObservation(product.id, obs);
        } else {
          await updateProduct(base);
        }

        // Restock notification: item just came back in stock and user opted in
        if (restocked && base.watch.notifyOnRestock) {
          logger.info('Restock detected', { id: base.id, title: base.title });
          await sendRestockNotification(base);
        }
        break;
      }
      case 'blocked': {
        const failures = product.consecutiveFailures + 1;
        const parseStatus: ParseStatus = failures >= MAX_CONSECUTIVE_FAILURES ? 'paused' : 'blocked';
        await updateProduct({ ...product, parseStatus, consecutiveFailures: failures, lastCheckedAt: nowMs });
        break;
      }
      case 'error': {
        const failures = product.consecutiveFailures + 1;
        const parseStatus: ParseStatus = failures >= MAX_CONSECUTIVE_FAILURES ? 'paused' : product.parseStatus;
        logger.warn('Check error', { id: product.id, error: result.message, failures });
        await updateProduct({ ...product, parseStatus, consecutiveFailures: failures, lastCheckedAt: nowMs });
        break;
      }
      case 'unchanged':
        break;
    }
  }
  logger.info('Check pass done', { checked: due.length });
}

/**
 * Force-check a single product by ID, bypassing the "due for check" filter.
 * Used by the "Refresh" button in the UI.
 */
export async function checkProductNow(productId: string): Promise<Product | null> {
  const product = await getProduct(productId);
  if (!product) return null;

  let hostname: string;
  try { hostname = new URL(product.url).hostname; } catch { hostname = product.retailerHost; }

  const result = await checkProduct(product);
  const nowMs = Date.now();

  if (result.status === 'blocked' || result.status === 'error') {
    await recordHostFailure(hostname);
  } else if (result.status === 'ok') {
    await recordHostSuccess(hostname);
  }

  switch (result.status) {
    case 'ok': {
      const newPriceMinor = result.product.price.amountMinor;
      const tier = methodToTier(result.product.method);
      const stockState = toStockState(result.product);
      const priceChanged = newPriceMinor !== product.currentPrice;
      const restocked = product.stockState !== 1 && stockState === 1;

      const base: Product = {
        ...product,
        currentPrice: newPriceMinor,
        lastKnownStockState: product.stockState,
        stockState,
        parseTier: tier,
        parseStatus: 'ok',
        consecutiveFailures: 0,
        lastCheckedAt: nowMs,
        lastSuccessfulParseAt: nowMs,
      };

      if (priceChanged) {
        const history = await getHistory(product.id);
        if (sanityCheckObservation(newPriceMinor, history?.obs ?? [])) {
          const obs: Observation = [
            Math.floor(nowMs / 60_000), newPriceMinor,
            result.product.advertisedListPrice?.amountMinor ?? 0,
            stockState, tier,
          ];
          await appendObservation(product.id, obs);
        } else {
          await updateProduct(base);
        }
      } else {
        await updateProduct(base);
      }

      if (restocked && base.watch.notifyOnRestock) {
        await sendRestockNotification(base);
      }

      return await getProduct(productId);
    }
    case 'blocked': {
      const failures = product.consecutiveFailures + 1;
      const parseStatus: ParseStatus = failures >= MAX_CONSECUTIVE_FAILURES ? 'paused' : 'blocked';
      await updateProduct({ ...product, parseStatus, consecutiveFailures: failures, lastCheckedAt: nowMs });
      return await getProduct(productId);
    }
    case 'error': {
      const failures = product.consecutiveFailures + 1;
      const parseStatus: ParseStatus = failures >= MAX_CONSECUTIVE_FAILURES ? 'paused' : product.parseStatus;
      logger.warn('Check error (now)', { id: product.id, error: result.message });
      await updateProduct({ ...product, parseStatus, consecutiveFailures: failures, lastCheckedAt: nowMs });
      return await getProduct(productId);
    }
    default:
      return product;
  }
}

/**
 * Compute whether price is at or below the 90th-percentile low
 * (i.e., in the cheapest 10% of observations) within the last 365 days.
 */
export function isAtPercentileLow(currentPrice: number, history: ObservationHistory): boolean {
  const cutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const prices = history.obs
    .filter((o) => o[0] * 60_000 >= cutoffMs)
    .map((o) => o[1])
    .sort((a, b) => a - b);
  // Need at least 10 observations for the 10th-percentile to be meaningful.
  // With fewer points the math degenerates: 1 observation always returns true
  // because the single price IS the p10, causing false notifications on new products.
  if (prices.length < 10) return false;
  const idx = Math.floor(0.10 * prices.length);
  const p10 = prices[idx] ?? prices[0];
  return currentPrice <= (p10 ?? Infinity);
}

export function shouldTriggerNotification(
  product: Product,
  history?: ObservationHistory,
): boolean {
  const { watch } = product;
  if (watch.muted) return false;
  if (product.parseTier >= 3) return false;
  if (product.stockState === 2) return false;
  if (watch.lastAlertedAt !== null) {
    if (Date.now() - watch.lastAlertedAt < watch.cooldownHours * 60 * 60 * 1000) return false;
  }
  if (watch.lastAlertedPrice !== null) {
    if (product.currentPrice >= watch.lastAlertedPrice * 0.97) return false;
  }
  if (watch.targetPrice !== null) return product.currentPrice <= watch.targetPrice;

  // Drop threshold: trigger only when price drops by at least dropThresholdPct% from initial
  if (watch.dropThresholdPct !== null) {
    const threshold = product.initialPriceMinor * (1 - watch.dropThresholdPct / 100);
    return product.currentPrice <= threshold;
  }

  // No target or threshold: trigger if below initial price OR at 90th-percentile low
  if (product.currentPrice < product.initialPriceMinor) return true;
  if (history !== undefined && isAtPercentileLow(product.currentPrice, history)) return true;
  return false;
}
