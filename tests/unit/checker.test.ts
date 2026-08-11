import { describe, it, expect, vi } from 'vitest';
import { shouldTriggerNotification } from '../../src/background/checker.js';
import type { Product } from '../../src/types/storage.js';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', retailerHost: 'example.com', url: 'https://example.com/p',
    canonicalKey: 'k1', title: 'Test', imageUrl: null, variantLabel: null,
    currency: 'USD', initialPriceMinor: 2000, currentPrice: 2000,
    advertisedListPrice: null, stockState: 1, lastKnownStockState: 1, parseStatus: 'ok', parseTier: 1,
    consecutiveFailures: 0, lastCheckedAt: null, lastSuccessfulParseAt: null,
    createdAt: 1000, notes: '',
    watch: { targetPrice: null, cooldownHours: 24, muted: false, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null },
    stats: { observationCount: 0, changeCount: 0, daysTracked: 0, lastChangeAt: null, allTimeMin: null, allTimeMax: null, w30: null, w90: null, w365: null },
    ...overrides,
  };
}

describe('shouldTriggerNotification', () => {
  it('triggers when price drops below initial', () => {
    const p = makeProduct({ currentPrice: 1500 });
    expect(shouldTriggerNotification(p)).toBe(true);
  });

  it('does not trigger when price unchanged', () => {
    expect(shouldTriggerNotification(makeProduct())).toBe(false);
  });

  it('does not trigger when muted', () => {
    const p = makeProduct({ currentPrice: 1500, watch: { targetPrice: null, cooldownHours: 24, muted: true, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null } });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('does not trigger for Tier 3 observations', () => {
    const p = makeProduct({ currentPrice: 1500, parseTier: 3 });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('does not trigger when out of stock', () => {
    const p = makeProduct({ currentPrice: 1500, stockState: 2 });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('respects cooldown', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const p = makeProduct({
      currentPrice: 1500,
      watch: { targetPrice: null, cooldownHours: 24, muted: false, lastAlertedPrice: 1500, lastAlertedAt: now - 1 * 60 * 60 * 1000, notifyOnRestock: false, dropThresholdPct: null },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
    vi.useRealTimers();
  });

  it('respects MIN_DELTA_PCT (3%)', () => {
    const p = makeProduct({
      currentPrice: 1480, // only 1.3% below 1500 — not enough
      watch: { targetPrice: null, cooldownHours: 24, muted: false, lastAlertedPrice: 1500, lastAlertedAt: Date.now() - 30 * 60 * 60 * 1000, notifyOnRestock: false, dropThresholdPct: null },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('triggers when target price is met', () => {
    const p = makeProduct({ currentPrice: 1400, watch: { targetPrice: 1500, cooldownHours: 24, muted: false, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null } });
    expect(shouldTriggerNotification(p)).toBe(true);
  });

  it('does not trigger when above target', () => {
    const p = makeProduct({ currentPrice: 1800, watch: { targetPrice: 1500, cooldownHours: 24, muted: false, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null } });
    expect(shouldTriggerNotification(p)).toBe(false);
  });
});
