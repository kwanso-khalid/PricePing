import { describe, it, expect } from 'vitest';
import {
  calculateBackoffMs,
  checkerBackoffMs,
  isDueForCheck,
  staggerDelayMs,
  CHECKER_BACKOFF,
} from '../../src/lib/backoff.js';

describe('calculateBackoffMs', () => {
  it('returns base * 2^0 = base for 0 failures', () => {
    const config = { baseMs: 1000, maxMs: 100000 };
    expect(calculateBackoffMs(0, config)).toBe(1000);
  });

  it('doubles for each failure', () => {
    const config = { baseMs: 1000, maxMs: 100000 };
    expect(calculateBackoffMs(1, config)).toBe(2000);
    expect(calculateBackoffMs(2, config)).toBe(4000);
    expect(calculateBackoffMs(3, config)).toBe(8000);
  });

  it('caps at maxMs', () => {
    const config = { baseMs: 1000, maxMs: 5000 };
    expect(calculateBackoffMs(10, config)).toBe(5000);
  });
});

describe('checkerBackoffMs', () => {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

  it('starts at 6 hours for 0 failures', () => {
    expect(checkerBackoffMs(0)).toBe(SIX_HOURS_MS);
  });

  it('doubles to 12 hours for 1 failure', () => {
    expect(checkerBackoffMs(1)).toBe(SIX_HOURS_MS * 2);
  });

  it('caps at 72 hours', () => {
    expect(checkerBackoffMs(100)).toBe(SEVENTY_TWO_HOURS_MS);
  });
});

describe('isDueForCheck', () => {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const NOW = 1000000000000;

  it('returns true when never checked', () => {
    expect(isDueForCheck(null, 0, INTERVAL_MS, NOW)).toBe(true);
  });

  it('returns true when interval has elapsed', () => {
    const lastCheckedAt = NOW - INTERVAL_MS - 1;
    expect(isDueForCheck(lastCheckedAt, 0, INTERVAL_MS, NOW)).toBe(true);
  });

  it('returns false when interval has not elapsed', () => {
    const lastCheckedAt = NOW - INTERVAL_MS / 2;
    expect(isDueForCheck(lastCheckedAt, 0, INTERVAL_MS, NOW)).toBe(false);
  });

  it('uses backoff interval when there are failures', () => {
    // With 1 failure, backoff is 6h * 2^0 = 6h (since failures-1 = 0)
    const lastCheckedAt = NOW - INTERVAL_MS - 1;
    expect(isDueForCheck(lastCheckedAt, 1, INTERVAL_MS, NOW)).toBe(true);
  });

  it('uses longer backoff for more failures', () => {
    // With 2 failures, backoff is 6h * 2^1 = 12h
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const lastCheckedAt = NOW - INTERVAL_MS; // Only 6h ago
    // Should not be due (backoff is 12h)
    expect(isDueForCheck(lastCheckedAt, 2, INTERVAL_MS, NOW)).toBe(false);

    const olderCheck = NOW - twelveHoursMs - 1;
    expect(isDueForCheck(olderCheck, 2, INTERVAL_MS, NOW)).toBe(true);
  });
});

describe('staggerDelayMs', () => {
  it('returns delay within specified range', () => {
    for (let i = 0; i < 20; i++) {
      const delay = staggerDelayMs(2, 8);
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(8000);
    }
  });

  it('defaults to 2-8 seconds', () => {
    const delay = staggerDelayMs();
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(8000);
  });
});
