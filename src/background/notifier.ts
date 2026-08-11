import type { Product } from '../types/storage.js';
import {
  getProductIndex, getProduct, getHistory, updateProduct, getSettings,
  getAlerts, saveAlerts, pruneAlerts,
  getPendingAlerts, savePendingAlerts, clearPendingAlerts,
} from '../lib/storage.js';
import { formatMoney } from '../lib/money.js';
import { shouldTriggerNotification } from './checker.js';
import { createLogger } from '../lib/logger.js';
import { STRINGS } from '../lib/strings.js';
import { isQuietTime } from '../lib/quiethours.js';
import { appendAlertEntry, getAlertLog, countUnseenAlerts } from '../lib/alertlog.js';
import { updateBadge } from '../lib/badge.js';
import { computeTrendLabel } from '../lib/trend.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('notifier');
const BATCH_THRESHOLD = 3;
const BATCH_NOTIFICATION_ID = 'priceping-batch';

export async function processNotifications(): Promise<void> {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  if (settings.mutedUntil !== null && Date.now() < settings.mutedUntil) return;

  const now = Date.now();
  const quiet = isQuietTime(now, settings.quietHours ?? null);

  // --- Handle pending alerts from a previous quiet window ---
  const pendingIds = await getPendingAlerts();
  if (!quiet && pendingIds.length > 0) {
    await handlePendingDigest(pendingIds);
    await clearPendingAlerts();
  }

  const allSummaries = await getProductIndex();
  const alerts = pruneAlerts(await getAlerts(), now);

  const toNotify: Product[] = [];
  for (const summary of allSummaries) {
    const product = await getProduct(summary.id);
    if (!product) continue;
    const history = await getHistory(product.id);
    if (!shouldTriggerNotification(product, history ?? undefined)) continue;
    const dayBucket = Math.floor(now / 86_400_000);
    const key = `${product.id}:${product.currentPrice}:${dayBucket}`;
    if (!alerts.keys[key]) {
      alerts.keys[key] = now;
      toNotify.push(product);
    }
  }

  if (toNotify.length === 0) return;
  await saveAlerts(alerts);

  if (quiet) {
    // Hold alerts — write product IDs to pending_alerts, do not send now
    const existingPending = await getPendingAlerts();
    const merged = Array.from(new Set([...existingPending, ...toNotify.map((p) => p.id)]));
    await savePendingAlerts(merged);
    logger.info('Quiet hours: holding alerts', { count: toNotify.length });
    return;
  }

  // Send notifications
  if (toNotify.length >= BATCH_THRESHOLD) {
    await sendBatchNotification(toNotify);
  } else {
    for (const product of toNotify) {
      const history = await getHistory(product.id);
      await sendItemNotification(product, history ?? undefined);
    }
  }

  // Update watch state, alert log, and badge
  for (const product of toNotify) {
    await updateProduct({
      ...product,
      watch: { ...product.watch, lastAlertedPrice: product.currentPrice, lastAlertedAt: now },
    });
  }

  // Append to alert log and refresh badge
  for (const product of toNotify) {
    const history = await getHistory(product.id);
    const oldPrice = product.watch.lastAlertedPrice ?? product.initialPriceMinor;
    const changePercent = oldPrice > 0
      ? ((product.currentPrice - oldPrice) / oldPrice) * 100
      : 0;
    const trendLabel = history
      ? computeTrendLabel(product.currentPrice, history, product.stats, 90).label
      : '';
    await appendAlertEntry({
      id: uuidv4(),
      productId: product.id,
      productTitle: product.title,
      oldPriceMinor: oldPrice,
      newPriceMinor: product.currentPrice,
      currency: product.currency,
      changePercent,
      trendLabel,
      firedAt: now,
      seen: false,
    });
  }

  const alertLog = await getAlertLog();
  updateBadge(countUnseenAlerts(alertLog));
}

async function sendItemNotification(product: Product, history: import('../types/storage.js').ObservationHistory | undefined): Promise<void> {
  const currency = product.currency;
  const newPrice = product.currentPrice;
  const oldPrice = product.watch.lastAlertedPrice ?? product.initialPriceMinor;
  const pctChange = oldPrice > 0
    ? ((newPrice - oldPrice) / oldPrice * 100).toFixed(1)
    : '0.0';
  const trendStr = history
    ? computeTrendLabel(newPrice, history, product.stats, 90).label
    : '';
  const newPriceStr = formatMoney({ amountMinor: newPrice, currency });
  const oldPriceStr = formatMoney({ amountMinor: oldPrice, currency });
  const message = trendStr
    ? `${oldPriceStr} → ${newPriceStr} (${pctChange}%) · ${trendStr}`
    : `${oldPriceStr} → ${newPriceStr} (${pctChange}%)`;

  return new Promise((resolve) => {
    chrome.notifications.create(
      `priceping-item-${product.id}`,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `${STRINGS.priceDrop} ${product.title}`,
        message,
        requireInteraction: false,
      },
      (id) => { if (chrome.runtime.lastError) logger.error('Notification failed', { id }); resolve(); },
    );
  });
}

async function sendBatchNotification(products: Product[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.notifications.create(
      BATCH_NOTIFICATION_ID,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: STRINGS.priceDrop,
        message: STRINGS.multipleDrops(products.length),
        requireInteraction: false,
      },
      (id) => { if (chrome.runtime.lastError) logger.error('Batch failed', { id }); resolve(); },
    );
  });
}

async function handlePendingDigest(pendingIds: string[]): Promise<void> {
  // Coalesce into a single digest notification
  if (pendingIds.length === 0) return;
  if (pendingIds.length === 1) {
    const product = await getProduct(pendingIds[0] ?? '');
    if (product) {
      const history = await getHistory(product.id);
      await sendItemNotification(product, history ?? undefined);
    }
  } else {
    return new Promise((resolve) => {
      chrome.notifications.create(
        BATCH_NOTIFICATION_ID,
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: STRINGS.priceDrop,
          message: STRINGS.quietHoursHeld(pendingIds.length),
          requireInteraction: false,
        },
        (id) => { if (chrome.runtime.lastError) logger.error('Digest failed', { id }); resolve(); },
      );
    });
  }
}

export async function sendRestockNotification(product: Product): Promise<void> {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  if (settings.mutedUntil !== null && Date.now() < settings.mutedUntil) return;
  if (product.watch.muted) return;

  const priceStr = formatMoney({ amountMinor: product.currentPrice, currency: product.currency });
  return new Promise((resolve) => {
    chrome.notifications.create(
      `priceping-restock-${product.id}`,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `Back in stock: ${product.title}`,
        message: `Now available at ${priceStr}`,
        requireInteraction: false,
      },
      (id) => { if (chrome.runtime.lastError) logger.error('Restock notification failed', { id }); resolve(); },
    );
  });
}

export function handleNotificationClick(notificationId: string): void {
  if (notificationId === BATCH_NOTIFICATION_ID) {
    void chrome.action.openPopup().catch(() => {});
    return;
  }
  if (notificationId.startsWith('priceping-item-')) {
    const itemId = notificationId.replace('priceping-item-', '');
    void getProduct(itemId).then((p) => { if (p) void chrome.tabs.create({ url: p.url }); });
  }
  void chrome.notifications.clear(notificationId);
}
