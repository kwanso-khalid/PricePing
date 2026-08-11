import { setupAlarm, reconcileOnStartup, ALARM_NAME } from './scheduler.js';
import { runCheckPass, checkProductNow } from './checker.js';
import { processNotifications, handleNotificationClick } from './notifier.js';
import { runMigration } from '../lib/storage.js';
import { markAlertsSeen, getAlertLog, countUnseenAlerts } from '../lib/alertlog.js';
import { updateBadge } from '../lib/badge.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('background');

chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed/updated', { reason: details.reason });
  // Clear legacy alarm name used before the PriceWatch → PricePing rename.
  void chrome.alarms.clear('pricewatch-check').catch(() => {});
  void runMigration().then(() => setupAlarm());
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('Browser startup');
  void runMigration().then(async () => {
    await setupAlarm();
    const needsCatchUp = await reconcileOnStartup();
    if (needsCatchUp) {
      await runCheckPassAndNotify();
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    logger.info('Alarm fired');
    void runCheckPassAndNotify();
  }
});

async function runCheckPassAndNotify(): Promise<void> {
  await runCheckPass();
  await processNotifications();
}

chrome.notifications.onClicked.addListener((notificationId) => {
  handleNotificationClick(notificationId);
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    const msg = message as { type?: string };
    if (msg.type === 'PING') { sendResponse({ type: 'PONG' }); return false; }
    if (msg.type === 'RUN_CHECK') {
      void runCheckPassAndNotify().then(() => sendResponse({ type: 'CHECK_COMPLETE' }));
      return true;
    }
    if (msg.type === 'CHECK_NOW_PRODUCT') {
      const productId = (message as { type: string; productId: string }).productId;
      void checkProductNow(productId).then(async (updated) => {
        await processNotifications();
        sendResponse({ type: 'CHECK_PRODUCT_COMPLETE', product: updated });
      });
      return true;
    }
    if (msg.type === 'MARK_ALERTS_SEEN') {
      void markAlertsSeen().then(async () => {
        const log = await getAlertLog();
        updateBadge(countUnseenAlerts(log));
        sendResponse({ type: 'ALERTS_MARKED_SEEN' });
      });
      return true;
    }
    return false;
  },
);

logger.info('Service worker initialized');
