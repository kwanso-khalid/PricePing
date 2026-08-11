import { getProductIndex, getSettings } from '../lib/storage.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('scheduler');

export const ALARM_NAME = 'priceping-check';
export const ALARM_PERIOD_MINUTES = 30;

/**
 * Set up the periodic alarm for price checking.
 * Idempotent - safe to call on every service worker startup.
 */
export async function setupAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    void chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: ALARM_PERIOD_MINUTES,
    });
    logger.info('Alarm created', { name: ALARM_NAME, periodMinutes: ALARM_PERIOD_MINUTES });
  } else {
    logger.debug('Alarm already exists', { name: ALARM_NAME });
  }
}

/**
 * Remove the alarm (for testing or uninstall cleanup).
 */
export async function clearAlarm(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  logger.info('Alarm cleared', { name: ALARM_NAME });
}

/**
 * On browser startup, check whether any items missed a check while the browser
 * was closed and, if so, trigger an immediate check pass.
 *
 * Returns true if a catch-up pass is needed (caller should invoke runCheckPass).
 */
export async function reconcileOnStartup(): Promise<boolean> {
  const settings = await getSettings();
  const summaries = await getProductIndex();
  const now = Date.now();
  const intervalMs = settings.checkIntervalHours * 60 * 60 * 1000;

  const overdue = summaries.filter(
    (s) =>
      s.parseStatus !== 'paused' &&
      (s.lastCheckedAt === null || now - s.lastCheckedAt > intervalMs * 2),
  );

  if (overdue.length > 0) {
    logger.info('Reconcile: found overdue items', { count: overdue.length });
    return true;
  }

  logger.debug('Reconcile: no overdue items');
  return false;
}
