import type { TrackedItem } from '../types/index.js';
import { getAllItems, saveItem, getSettings, getNotificationState, saveNotificationState } from '../lib/storage.js';
import { formatMoney } from '../lib/money.js';
import { shouldTriggerNotification } from './checker.js';
import { createLogger } from '../lib/logger.js';
import { STRINGS } from '../lib/strings.js';

const logger = createLogger('notifier');

const BATCH_THRESHOLD = 3;
const BATCH_NOTIFICATION_ID = 'pricewatch-batch';

/**
 * Check all items and fire notifications for price drops.
 * Called after a check pass completes.
 */
export async function processNotifications(): Promise<void> {
  const settings = await getSettings();

  if (!settings.notificationsEnabled) {
    logger.debug('Notifications disabled');
    return;
  }

  if (settings.mutedUntil !== null && Date.now() < settings.mutedUntil) {
    logger.debug('Notifications muted');
    return;
  }

  const allItems = await getAllItems();
  const notificationState = await getNotificationState();

  const triggeredItems = Object.values(allItems).filter((item) =>
    shouldTriggerNotification(item),
  );

  if (triggeredItems.length === 0) {
    logger.debug('No notifications to fire');
    return;
  }

  const now = Date.now();

  if (triggeredItems.length >= BATCH_THRESHOLD) {
    await sendBatchNotification(triggeredItems, now);
  } else {
    for (const item of triggeredItems) {
      await sendItemNotification(item, now);
    }
  }

  // Mark items as notified
  for (const item of triggeredItems) {
    const updated: TrackedItem = {
      ...item,
      lastNotifiedAt: now,
      lastNotifiedPriceMinor: item.currentPrice.amountMinor,
    };
    const result = await saveItem(updated);
    if (!result.ok) {
      logger.error('Failed to save notification state for item', { id: item.id });
    }
  }

  // Update global notification state
  notificationState.lastBatchNotificationAt = now;
  notificationState.recentlyNotifiedItemIds = [
    ...notificationState.recentlyNotifiedItemIds,
    ...triggeredItems.map((i) => i.id),
  ].slice(-50); // keep last 50

  const stateResult = await saveNotificationState(notificationState);
  if (!stateResult.ok) {
    logger.error('Failed to save notification state');
  }
}

async function sendItemNotification(item: TrackedItem, _now: number): Promise<void> {
  const priceStr = formatMoney(item.currentPrice);
  const title = STRINGS.priceDrop;
  const message = STRINGS.priceDropMessage(item.title, priceStr);
  const notificationId = `pricewatch-item-${item.id}`;

  return new Promise((resolve) => {
    chrome.notifications.create(
      notificationId,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title,
        message,
        requireInteraction: false,
      },
      (id) => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to create notification', {
            error: chrome.runtime.lastError.message,
            id,
          });
        } else {
          logger.info('Notification sent', { notificationId });
        }
        resolve();
      },
    );
  });
}

async function sendBatchNotification(items: TrackedItem[], _now: number): Promise<void> {
  const message = STRINGS.multipleDrops(items.length);

  return new Promise((resolve) => {
    chrome.notifications.create(
      BATCH_NOTIFICATION_ID,
      {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: STRINGS.priceDrop,
        message,
        buttons: [{ title: STRINGS.viewDrops }],
        requireInteraction: false,
      },
      (id) => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to create batch notification', {
            error: chrome.runtime.lastError.message,
            id,
          });
        } else {
          logger.info('Batch notification sent', { count: items.length });
        }
        resolve();
      },
    );
  });
}

/**
 * Handle notification click - open product page or popup.
 */
export function handleNotificationClick(notificationId: string): void {
  if (notificationId === BATCH_NOTIFICATION_ID) {
    // Open popup by focusing the extension
    void chrome.action.openPopup().catch(() => {
      // openPopup may fail if not user-gesture triggered; ignore
    });
    return;
  }

  if (notificationId.startsWith('pricewatch-item-')) {
    const itemId = notificationId.replace('pricewatch-item-', '');
    void getAllItems().then((items) => {
      const item = items[itemId];
      if (item) {
        void chrome.tabs.create({ url: item.url });
      }
    });
  }

  void chrome.notifications.clear(notificationId);
}
