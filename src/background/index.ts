/**
 * Service Worker entry point.
 * All state is read from chrome.storage on each entry (no module-level state that persists).
 */
import { setupAlarm, ALARM_NAME } from './scheduler.js';
import { runCheckPass } from './checker.js';
import { processNotifications, handleNotificationClick } from './notifier.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('background');

// Wire up on install/startup
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed/updated', { reason: details.reason });
  void setupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  logger.info('Browser startup');
  void setupAlarm();
});

// Alarm handler for price checks
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    logger.info('Alarm fired, running check pass');
    void runCheckPassAndNotify();
  }
});

async function runCheckPassAndNotify(): Promise<void> {
  await runCheckPass();
  await processNotifications();
}

// Notification click handler
chrome.notifications.onClicked.addListener((notificationId) => {
  handleNotificationClick(notificationId);
});

// Message handler for content script / popup communication
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    const msg = message as { type?: string; payload?: unknown };
    logger.debug('Message received', { type: msg.type });

    if (msg.type === 'PING') {
      sendResponse({ type: 'PONG' });
      return false;
    }

    if (msg.type === 'RUN_CHECK') {
      void runCheckPassAndNotify().then(() => {
        sendResponse({ type: 'CHECK_COMPLETE' });
      });
      return true; // async response
    }

    return false;
  },
);

logger.info('Service worker initialized');
