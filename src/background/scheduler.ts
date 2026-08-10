import { createLogger } from '../lib/logger.js';

const logger = createLogger('scheduler');

export const ALARM_NAME = 'pricewatch-check';
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
