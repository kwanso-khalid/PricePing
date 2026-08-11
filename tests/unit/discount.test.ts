import { describe, it, expect } from 'vitest';
import { computeDiscountVerdict } from '../../src/lib/discount.js';
import type { ObservationHistory } from '../../src/types/storage.js';

const NOW_MS = 1_000_000_000_000; // fixed reference time

function makeHistory(obs: Array<{ daysAgo: number; price: number; tier?: 1 | 2 | 3 | 4 }>): ObservationHistory {
  return {
    currency: 'USD',
    obs: obs.map(({ daysAgo, price, tier = 1 }) => [
      Math.floor((NOW_MS - daysAgo * 24 * 60 * 60 * 1000) / 60_000),
      price,
      0,
      1,
      tier,
    ]),
  };
}

function makeEnoughObs(
  count: number,
  price: number,
  tier: 1 | 2 | 3 | 4 = 1,
  spanDays = 30,
): ObservationHistory {
  const obs = Array.from({ length: count }, (_, i) => ({
    daysAgo: ((count - 1 - i) / (count - 1)) * spanDays,
    price,
    tier,
  }));
  return makeHistory(obs);
}

describe('computeDiscountVerdict', () => {
  it('returns insufficient_data when advertisedListPrice is null', () => {
    const history = makeEnoughObs(10, 1000);
    const v = computeDiscountVerdict(null, history, 180, NOW_MS);
    expect(v.verdict).toBe('insufficient_data');
    expect(v.advertisedList).toBeNull();
  });

  it('returns insufficient_data when fewer than 8 qualifying observations', () => {
    const history = makeHistory([
      { daysAgo: 20, price: 800 },
      { daysAgo: 15, price: 800 },
      { daysAgo: 10, price: 800 },
    ]);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('insufficient_data');
    expect(v.observationCount).toBe(3);
  });

  it('returns insufficient_data when window span is less than 14 days', () => {
    // 8 observations all within the last 5 days
    const history = makeEnoughObs(8, 800, 1, 5);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('insufficient_data');
  });

  it('returns genuine when price was observed at or near list price', () => {
    // 8 observations spanning 30 days; some at 990 (within 3% of 1000)
    const obs = Array.from({ length: 8 }, (_, i) => ({
      daysAgo: 30 - i * 4,
      price: i < 2 ? 990 : 800, // 990 is within 3% of 1000
      tier: 1 as const,
    }));
    const history = makeHistory(obs);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('genuine');
    expect(v.observationsAtOrNearList).toBeGreaterThan(0);
  });

  it('returns inflated when never observed near list price', () => {
    // 8 observations spanning 30 days; all at 600 (well below list of 1000)
    const history = makeEnoughObs(8, 600, 1, 30);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('inflated');
    expect(v.observationsAtOrNearList).toBe(0);
    expect(v.observedMaxInWindow).toBe(600);
  });

  it('tier 3 observations are excluded from verdict computation', () => {
    // 10 tier-3 observations spanning 30 days at 600 — should NOT count
    const history = makeEnoughObs(10, 600, 3, 30);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    // With no tier 1/2 obs, it's insufficient_data
    expect(v.verdict).toBe('insufficient_data');
    expect(v.observationCount).toBe(0);
  });

  it('tier 4 observations are excluded from verdict computation', () => {
    const history = makeEnoughObs(10, 600, 4, 30);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('insufficient_data');
  });

  it('mixes tier 1/2 and tier 3 — only tier 1/2 count toward verdict', () => {
    // 5 tier-1 obs at 990 (near list), 10 tier-3 obs at 200 (not near list)
    // With 5 tier-1 obs spanning 20 days, should be insufficient (< 8 qualifying)
    const tier1Obs = Array.from({ length: 5 }, (_, i) => ({
      daysAgo: 20 - i * 4,
      price: 990,
      tier: 1 as const,
    }));
    const tier3Obs = Array.from({ length: 10 }, (_, i) => ({
      daysAgo: 30 - i * 3,
      price: 200,
      tier: 3 as const,
    }));
    const history: ObservationHistory = {
      currency: 'USD',
      obs: [...tier1Obs, ...tier3Obs].map(({ daysAgo, price, tier }) => [
        Math.floor((NOW_MS - daysAgo * 24 * 60 * 60 * 1000) / 60_000),
        price,
        0,
        1,
        tier,
      ]),
    };
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('insufficient_data');
    expect(v.observationCount).toBe(5); // only tier-1 obs counted
  });

  it('returns correct tierFloor', () => {
    // 8 obs spanning 30 days, mix of tier 1 and tier 2
    const obs = Array.from({ length: 8 }, (_, i) => ({
      daysAgo: 30 - i * 4,
      price: 800,
      tier: (i % 2 === 0 ? 1 : 2) as 1 | 2,
    }));
    const history = makeHistory(obs);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.tierFloor).toBe(1);
  });

  it('observedMaxInWindow is correct for inflated verdict', () => {
    const obs = Array.from({ length: 8 }, (_, i) => ({
      daysAgo: 30 - i * 4,
      price: 500 + i * 50, // prices: 500, 550, 600, 650, 700, 750, 800, 850
      tier: 1 as const,
    }));
    const history = makeHistory(obs);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('inflated');
    expect(v.observedMaxInWindow).toBe(850);
  });

  it('near boundary: price at exactly 97% of list price counts as at or near', () => {
    // 970 >= 1000 * 0.97 = 970 → true
    const obs = Array.from({ length: 8 }, (_, i) => ({
      daysAgo: 30 - i * 4,
      price: i === 0 ? 970 : 500, // one obs exactly at threshold
      tier: 1 as const,
    }));
    const history = makeHistory(obs);
    const v = computeDiscountVerdict(1000, history, 180, NOW_MS);
    expect(v.verdict).toBe('genuine');
    expect(v.observationsAtOrNearList).toBe(1);
  });
});
