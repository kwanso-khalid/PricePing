import { describe, it, expect } from 'vitest';
import { addPricePoint, downsampleHistory } from '../../src/lib/history.js';
import type { PricePoint } from '../../src/types/index.js';

function makePoint(amountMinor: number, daysAgo: number): PricePoint {
  return {
    price: { amountMinor, currency: 'USD' },
    observedAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
    inStock: true,
  };
}

describe('addPricePoint', () => {
  it('adds a point to history', () => {
    const history: PricePoint[] = [];
    const point = makePoint(1000, 0);
    const result = addPricePoint(history, point);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(point);
  });

  it('preserves existing points', () => {
    const history = [makePoint(1000, 5), makePoint(900, 2)];
    const newPoint = makePoint(800, 0);
    const result = addPricePoint(history, newPoint);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual(newPoint);
  });
});

describe('downsampleHistory', () => {
  it('does not modify history under limit', () => {
    const history = Array.from({ length: 100 }, (_, i) => makePoint(1000 + i, i));
    const result = downsampleHistory(history);
    expect(result).toHaveLength(100);
  });

  it('caps history at 200 points', () => {
    // All recent points (within 90 days) - downsampling won't help old ones
    const history = Array.from({ length: 250 }, (_, i) => makePoint(1000 + i, i));
    const result = downsampleHistory(history);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('downsamples old points to 1 per day', () => {
    // Create 250 points: 200 all from 100+ days ago (5 distinct days) + 50 recent
    // This forces downsampling of old entries to be exercised
    const oldPoints = Array.from({ length: 200 }, (_, i) =>
      makePoint(1000 + i, 100 + (i % 5)), // 5 different old days
    );
    const recentPoints = Array.from({ length: 50 }, (_, i) =>
      makePoint(2000 + i, i),
    );
    const combined = [...oldPoints, ...recentPoints];
    const result = downsampleHistory(combined);
    // Old entries should be downsampled to 5 (one per day), recent kept = 55 total
    const oldInResult = result.filter(
      (p) => p.observedAt < Date.now() - 90 * 24 * 60 * 60 * 1000,
    );
    expect(oldInResult.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('keeps all recent points and downsamples old ones', () => {
    const recentPoints = Array.from({ length: 50 }, (_, i) => makePoint(1000 + i, i));
    const oldPoints = Array.from({ length: 200 }, (_, i) =>
      makePoint(2000 + i, 91 + (i % 10)),
    ); // 10 different old days

    const history = [...oldPoints, ...recentPoints];
    const result = downsampleHistory(history);

    // Recent points should all be kept
    const recentInResult = result.filter(
      (p) => p.observedAt >= Date.now() - 90 * 24 * 60 * 60 * 1000,
    );
    expect(recentInResult.length).toBe(50);

    // Old points should be downsampled to ~10 (one per day)
    const oldInResult = result.filter(
      (p) => p.observedAt < Date.now() - 90 * 24 * 60 * 60 * 1000,
    );
    expect(oldInResult.length).toBeLessThanOrEqual(10);
  });
});
