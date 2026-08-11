export const DEFAULT_QUIET_START = 22;
export const DEFAULT_QUIET_END = 8;

export interface QuietHoursConfig {
  startHour: number; // 0–23
  endHour: number;   // 0–23
}

/**
 * Returns true if the given time (ms) falls within quiet hours.
 * Supports midnight-spanning windows (e.g. 22:00–08:00).
 */
export function isQuietTime(
  nowMs: number,
  config: QuietHoursConfig | null,
): boolean {
  if (config === null) return false;
  const hour = new Date(nowMs).getHours();
  const { startHour, endHour } = config;
  if (startHour > endHour) {
    // Midnight-spanning: quiet if hour >= startHour OR hour < endHour
    return hour >= startHour || hour < endHour;
  }
  // Same-day window: quiet if startHour <= hour < endHour
  return hour >= startHour && hour < endHour;
}

/**
 * Returns ms until quiet hours end (0 if not in quiet hours).
 */
export function msUntilQuietEnd(
  nowMs: number,
  config: QuietHoursConfig | null,
): number {
  if (config === null || !isQuietTime(nowMs, config)) return 0;
  const now = new Date(nowMs);

  // Build a Date for endHour today
  const endToday = new Date(now);
  endToday.setHours(config.endHour, 0, 0, 0);

  // If endHour has already passed today (midnight-spanning case where we're past midnight),
  // the end time is today at endHour; if it's before now we need tomorrow
  if (endToday.getTime() <= nowMs) {
    // endHour is tomorrow
    endToday.setDate(endToday.getDate() + 1);
  }

  return endToday.getTime() - nowMs;
}
