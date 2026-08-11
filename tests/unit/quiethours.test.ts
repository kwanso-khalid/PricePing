import { describe, it, expect } from 'vitest';
import { isQuietTime, msUntilQuietEnd } from '../../src/lib/quiethours.js';
import type { QuietHoursConfig } from '../../src/lib/quiethours.js';

// Default midnight-spanning config: 22:00–08:00
const NIGHT: QuietHoursConfig = { startHour: 22, endHour: 8 };

// Same-day window config: 10:00–14:00
const DAY_WINDOW: QuietHoursConfig = { startHour: 10, endHour: 14 };

function makeMs(hour: number, minute: number = 0): number {
  // Build a date in local time at the given hour/minute today
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

describe('isQuietTime', () => {
  it('returns false when config is null', () => {
    expect(isQuietTime(makeMs(23), null)).toBe(false);
    expect(isQuietTime(makeMs(2), null)).toBe(false);
  });

  describe('midnight-spanning window (22:00–08:00)', () => {
    it('is quiet at 23:00', () => {
      expect(isQuietTime(makeMs(23), NIGHT)).toBe(true);
    });

    it('is quiet at 00:00 (midnight)', () => {
      expect(isQuietTime(makeMs(0), NIGHT)).toBe(true);
    });

    it('is quiet at 07:00', () => {
      expect(isQuietTime(makeMs(7), NIGHT)).toBe(true);
    });

    it('is quiet at 07:59', () => {
      expect(isQuietTime(makeMs(7, 59), NIGHT)).toBe(true);
    });

    it('is NOT quiet at 08:00 (end boundary is exclusive)', () => {
      expect(isQuietTime(makeMs(8), NIGHT)).toBe(false);
    });

    it('is NOT quiet at 12:00', () => {
      expect(isQuietTime(makeMs(12), NIGHT)).toBe(false);
    });

    it('is NOT quiet at 21:59', () => {
      expect(isQuietTime(makeMs(21, 59), NIGHT)).toBe(false);
    });

    it('is quiet at 22:00 (start boundary)', () => {
      expect(isQuietTime(makeMs(22), NIGHT)).toBe(true);
    });
  });

  describe('same-day window (10:00–14:00)', () => {
    it('is NOT quiet at 09:59', () => {
      expect(isQuietTime(makeMs(9, 59), DAY_WINDOW)).toBe(false);
    });

    it('is quiet at 10:00 (start boundary)', () => {
      expect(isQuietTime(makeMs(10), DAY_WINDOW)).toBe(true);
    });

    it('is quiet at 12:00', () => {
      expect(isQuietTime(makeMs(12), DAY_WINDOW)).toBe(true);
    });

    it('is quiet at 13:59', () => {
      expect(isQuietTime(makeMs(13, 59), DAY_WINDOW)).toBe(true);
    });

    it('is NOT quiet at 14:00 (end boundary is exclusive)', () => {
      expect(isQuietTime(makeMs(14), DAY_WINDOW)).toBe(false);
    });

    it('is NOT quiet at 20:00', () => {
      expect(isQuietTime(makeMs(20), DAY_WINDOW)).toBe(false);
    });
  });
});

describe('msUntilQuietEnd', () => {
  it('returns 0 when config is null', () => {
    expect(msUntilQuietEnd(makeMs(2), null)).toBe(0);
  });

  it('returns 0 when not in quiet hours', () => {
    expect(msUntilQuietEnd(makeMs(12), NIGHT)).toBe(0);
  });

  it('returns positive ms when in quiet hours (23:00, end=08:00 next day)', () => {
    const nowMs = makeMs(23, 0);
    const result = msUntilQuietEnd(nowMs, NIGHT);
    expect(result).toBeGreaterThan(0);
    // Should be roughly 9 hours until 08:00
    const nineHoursMs = 9 * 60 * 60 * 1000;
    expect(result).toBeGreaterThanOrEqual(nineHoursMs - 60_000);
    expect(result).toBeLessThanOrEqual(nineHoursMs + 60_000);
  });

  it('returns positive ms when in quiet hours (01:00, end=08:00 same day)', () => {
    const nowMs = makeMs(1, 0);
    const result = msUntilQuietEnd(nowMs, NIGHT);
    expect(result).toBeGreaterThan(0);
    // Should be roughly 7 hours until 08:00
    const sevenHoursMs = 7 * 60 * 60 * 1000;
    expect(result).toBeGreaterThanOrEqual(sevenHoursMs - 60_000);
    expect(result).toBeLessThanOrEqual(sevenHoursMs + 60_000);
  });
});
