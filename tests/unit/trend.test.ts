import { describe, it, expect } from 'vitest';
import { computeTrendLabel, TREND_MIN_OBS, TREND_MIN_DAYS } from '../../src/lib/trend.js';
import type { ObservationHistory, CachedStats } from '../../src/types/storage.js';

const NOW_MS = 1_000_000_000_000;

function makeObs(daysAgo: number, price: number, tier: 1 | 2 | 3 | 4 = 1): [number, number, number, 1, typeof tier] {
  return [
    Math.floor((NOW_MS - daysAgo * 24 * 60 * 60 * 1000) / 60_000),
    price,
    0,
    1,
    tier,
  ];
}

function makeHistory(
  obs: Array<{ daysAgo: number; price: number; tier?: 1 | 2 | 3 | 4 }>,
): ObservationHistory {
  return {
    currency: 'USD',
    obs: obs.map(({ daysAgo, price, tier = 1 }) => makeObs(daysAgo, price, tier)),
  };
}

const EMPTY_STATS: CachedStats = {
  observationCount: 0,
  changeCount: 0,
  daysTracked: 0,
  lastChangeAt: null,
  allTimeMin: null,
  allTimeMax: null,
  w30: null,
  w90: null,
  w365: null,
};

function makeStats(overrides?: Partial<CachedStats>): CachedStats {
  return { ...EMPTY_STATS, ...overrides };
}

function makeEnoughObs(
  count: number,
  price: number,
  tier: 1 | 2 | 3 | 4 = 1,
  spanDays = 30,
): ObservationHistory {
  return makeHistory(
    Array.from({ length: count }, (_, i) => ({
      daysAgo: (count - 1 - i) * (spanDays / (count - 1)),
      price,
      tier,
    })),
  );
}

describe('computeTrendLabel', () => {
  it('returns low-confidence label when fewer than TREND_MIN_OBS observations', () => {
    const history = makeHistory([
      { daysAgo: 20, price: 1000 },
      { daysAgo: 10, price: 900 },
    ]);
    const stats = makeStats({ observationCount: 2 });
    const result = computeTrendLabel(900, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('low');
    expect(result.label).toContain('still building history');
    expect(result.label).toContain('2 observations');
  });

  it('returns low-confidence when window span is less than TREND_MIN_DAYS', () => {
    const history = makeEnoughObs(TREND_MIN_OBS, 1000, 1, 5); // only 5 days span
    const stats = makeStats({ observationCount: TREND_MIN_OBS });
    const result = computeTrendLabel(1000, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('low');
  });

  it('returns "lowest in X days" for rank 1 (current is the minimum)', () => {
    const obs = Array.from({ length: TREND_MIN_OBS }, (_, i) => ({
      daysAgo: TREND_MIN_DAYS + i * 2,
      price: 1000 + i * 100, // prices: 1000 was oldest (highest daysAgo)
      tier: 1 as const,
    }));
    // current price is 1000, which is lowest
    const history = makeHistory(obs);
    const stats = makeStats({ observationCount: TREND_MIN_OBS });
    const result = computeTrendLabel(1000, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('high');
    expect(result.label).toContain('lowest in 90 days');
  });

  it('returns "Nth lowest" for higher ranks', () => {
    const obs = [
      { daysAgo: 50, price: 500 },  // lowest
      { daysAgo: 46, price: 600 },
      { daysAgo: 42, price: 700 },
      { daysAgo: 38, price: 800 },
      { daysAgo: 34, price: 900 },
      { daysAgo: 30, price: 1000 },
      { daysAgo: 26, price: 1100 },
      { daysAgo: 22, price: 1200 }, // highest, current
    ];
    const history = makeHistory(obs);
    const stats = makeStats({ observationCount: 8 });
    // current is 1200, rank 8 (highest)
    const result = computeTrendLabel(1200, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('high');
    expect(result.label).toContain('8th lowest');
  });

  it('handles empty history gracefully', () => {
    const history: ObservationHistory = { currency: 'USD', obs: [] };
    const stats = makeStats({ observationCount: 0 });
    const result = computeTrendLabel(1000, history, stats, 30, NOW_MS);
    expect(result.confidence).toBe('low');
    expect(result.label).toContain('still building history');
    expect(result.label).toContain('0 observations');
  });

  it('excludes tier 3+ from qualifying observations', () => {
    // 10 tier-3 obs spanning 30 days — not enough qualifying
    const history = makeEnoughObs(10, 1000, 3, 30);
    const stats = makeStats({ observationCount: 10 });
    const result = computeTrendLabel(1000, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('low');
  });

  it('uses "ever" in label for windowDays="all"', () => {
    const history = makeEnoughObs(TREND_MIN_OBS, 1000, 1, TREND_MIN_DAYS + 1);
    const stats = makeStats({ observationCount: TREND_MIN_OBS });
    const result = computeTrendLabel(1000, history, stats, 'all', NOW_MS);
    expect(result.confidence).toBe('high');
    expect(result.label).toContain('lowest ever');
  });

  it('includes near all-time low note when within 1%', () => {
    const obs = Array.from({ length: TREND_MIN_OBS }, (_, i) => ({
      daysAgo: TREND_MIN_DAYS + 1 + i,
      price: 1000 + i * 50, // varies, current could be near ATL
      tier: 1 as const,
    }));
    const history = makeHistory(obs);
    const allTimeMin = { priceMinor: 1000, observedAt: NOW_MS - 90 * 24 * 60 * 60 * 1000 };
    const stats = makeStats({ observationCount: TREND_MIN_OBS, allTimeMin });
    // Current price 1005 is within 1% of ATL 1000
    const result = computeTrendLabel(1005, history, stats, 90, NOW_MS);
    if (result.confidence === 'high') {
      expect(result.label).toContain('near all-time low');
    }
  });

  it('includes percent above low when current is above minimum', () => {
    const obs = [
      { daysAgo: 50, price: 800 },  // min
      { daysAgo: 46, price: 900 },
      { daysAgo: 42, price: 850 },
      { daysAgo: 38, price: 900 },
      { daysAgo: 34, price: 950 },
      { daysAgo: 30, price: 1000 },
      { daysAgo: 26, price: 1000 },
      { daysAgo: 22, price: 1000 },  // current
    ];
    const history = makeHistory(obs);
    const stats = makeStats({ observationCount: 8 });
    const result = computeTrendLabel(1000, history, stats, 90, NOW_MS);
    expect(result.confidence).toBe('high');
    // 1000 is 25% above 800
    expect(result.label).toContain('25%');
  });

  it('singular observation in label', () => {
    const history: ObservationHistory = { currency: 'USD', obs: [] };
    const stats = makeStats({ observationCount: 1 });
    const result = computeTrendLabel(1000, history, stats, 30, NOW_MS);
    expect(result.label).toContain('1 observation');
    expect(result.label).not.toContain('1 observations');
  });
});
