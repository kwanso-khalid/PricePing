import { describe, it, expect } from 'vitest';
import { computeStats } from '../../src/lib/stats.js';
import type { Observation } from '../../src/types/storage.js';

function obs(minutesAgo: number, price: number): Observation {
  const nowMinutes = Math.floor(Date.now() / 60_000);
  return [nowMinutes - minutesAgo, price, 0, 1, 1];
}

describe('computeStats window stats', () => {
  it('returns null w30 when no observations within 30 days', () => {
    // obs from 35 days ago
    const observations: Observation[] = [obs(35 * 24 * 60, 1000)];
    const stats = computeStats(observations, null, null);
    expect(stats.w30).toBeNull();
    expect(stats.w90).not.toBeNull();
  });

  it('computes correct median for odd count', () => {
    // 3 prices: 100, 200, 300 → median = 200
    const observations: Observation[] = [obs(10, 100), obs(5, 300), obs(1, 200)];
    const stats = computeStats(observations, null, null);
    expect(stats.w365?.median).toBe(200);
  });

  it('computes lower-middle median for even count', () => {
    // 4 prices: 100, 200, 300, 400 → sorted: [100, 200, 300, 400] → mid=1 → 200
    const observations: Observation[] = [obs(10, 400), obs(8, 100), obs(4, 300), obs(1, 200)];
    const stats = computeStats(observations, null, null);
    expect(stats.w365?.median).toBe(200);
  });
});
