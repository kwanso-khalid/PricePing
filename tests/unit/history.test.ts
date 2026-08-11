import { describe, it, expect } from 'vitest';
import { computeStats, sparklinePoints } from '../../src/lib/stats.js';
import type { Observation } from '../../src/types/storage.js';

function obs(minutesSinceEpoch: number, price: number, tier: 1 | 2 | 3 | 4 = 1): Observation {
  return [minutesSinceEpoch, price, 0, 1, tier];
}

describe('computeStats', () => {
  it('returns zeros for empty observations', () => {
    const stats = computeStats([], null, null);
    expect(stats.observationCount).toBe(0);
    expect(stats.allTimeMin).toBeNull();
    expect(stats.allTimeMax).toBeNull();
  });

  it('computes all-time min and max', () => {
    const observations: Observation[] = [obs(100, 2000), obs(200, 1500), obs(300, 1800)];
    const stats = computeStats(observations, null, null);
    expect(stats.allTimeMin?.priceMinor).toBe(1500);
    expect(stats.allTimeMax?.priceMinor).toBe(2000);
  });

  it('preserves prev all-time min from trimmed history', () => {
    const observations: Observation[] = [obs(100, 2000), obs(200, 1800)];
    const prevMin = { priceMinor: 1000, observedAt: 1 };
    const stats = computeStats(observations, prevMin, null);
    expect(stats.allTimeMin?.priceMinor).toBe(1000);
  });

  it('counts changes correctly', () => {
    const observations: Observation[] = [obs(100, 1000), obs(200, 900), obs(300, 900), obs(400, 800)];
    const stats = computeStats(observations, null, null);
    expect(stats.changeCount).toBe(2); // 1000→900, 900→800
  });

  it('computes window stats', () => {
    const nowMs = Date.now();
    const nowMinutes = Math.floor(nowMs / 60_000);
    const observations: Observation[] = [
      obs(nowMinutes - 10, 1000),
      obs(nowMinutes - 5, 800),
      obs(nowMinutes - 1, 900),
    ];
    const stats = computeStats(observations, null, null, nowMs);
    expect(stats.w30).not.toBeNull();
    expect(stats.w30?.min).toBe(800);
    expect(stats.w30?.max).toBe(1000);
    expect(stats.w30?.count).toBe(3);
  });
});

describe('sparklinePoints', () => {
  it('returns last 20 price values', () => {
    const observations: Observation[] = Array.from({ length: 25 }, (_, i) => obs(i, 1000 + i));
    const points = sparklinePoints(observations);
    expect(points).toHaveLength(20);
    expect(points[0]).toBe(1005); // obs at index 5 (last 20 of 25)
    expect(points[19]).toBe(1024);
  });

  it('returns all points if fewer than 20', () => {
    const observations: Observation[] = [obs(1, 500), obs(2, 600)];
    expect(sparklinePoints(observations)).toEqual([500, 600]);
  });
});
