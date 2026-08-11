import { describe, it, expect, vi } from 'vitest';
import { shouldTriggerNotification, isAtPercentileLow } from '../../src/background/checker.js';
import type { Product, ObservationHistory, Observation } from '../../src/types/storage.js';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    retailerHost: 'example.com',
    url: 'https://example.com/p',
    canonicalKey: 'k1',
    title: 'Test Product',
    imageUrl: null,
    variantLabel: null,
    currency: 'USD',
    initialPriceMinor: 2000,
    currentPrice: 2000,
    advertisedListPrice: null,
    stockState: 1,
    lastKnownStockState: 1,
    parseStatus: 'ok',
    parseTier: 1,
    consecutiveFailures: 0,
    lastCheckedAt: null,
    lastSuccessfulParseAt: null,
    createdAt: 1000,
    notes: '',
    watch: {
      targetPrice: null,
      cooldownHours: 24,
      muted: false,
      lastAlertedPrice: null,
      lastAlertedAt: null,
      notifyOnRestock: false,
      dropThresholdPct: null,
    },
    stats: {
      observationCount: 0,
      changeCount: 0,
      daysTracked: 0,
      lastChangeAt: null,
      allTimeMin: null,
      allTimeMax: null,
      w30: null,
      w90: null,
      w365: null,
    },
    ...overrides,
  };
}

function makeObs(minuteOffset: number, price: number): Observation {
  const baseMinutes = Math.floor(Date.now() / 60_000);
  return [baseMinutes - minuteOffset, price, 0, 1, 1];
}

function makeHistory(obs: Observation[]): ObservationHistory {
  return { currency: 'USD', obs };
}

describe('shouldTriggerNotification — table-driven suppression rules', () => {
  it('1. Price below initial → triggers', () => {
    const p = makeProduct({ currentPrice: 1500 });
    expect(shouldTriggerNotification(p)).toBe(true);
  });

  it('2. Muted → suppressed', () => {
    const p = makeProduct({
      currentPrice: 1500,
      watch: { targetPrice: null, cooldownHours: 24, muted: true, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('3. Tier 3 → suppressed', () => {
    const p = makeProduct({ currentPrice: 1500, parseTier: 3 });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('4. Out of stock (stockState=2) → suppressed', () => {
    const p = makeProduct({ currentPrice: 1500, stockState: 2 });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('5. Within cooldown → suppressed', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const p = makeProduct({
      currentPrice: 1500,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: 2000,
        lastAlertedAt: now - 1 * 60 * 60 * 1000, // 1h ago, need 24h
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
    vi.useRealTimers();
  });

  it('6. Same price as last alerted → suppressed (0% delta < 3% MIN_DELTA)', () => {
    const p = makeProduct({
      currentPrice: 2000,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: 2000,
        lastAlertedAt: Date.now() - 30 * 60 * 60 * 1000, // 30h ago
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('7. Only 1.5% cheaper than last alerted (< 3% MIN_DELTA) → suppressed', () => {
    const lastAlerted = 2000;
    const current = Math.round(lastAlerted * (1 - 0.015)); // ~1.5% drop
    const p = makeProduct({
      currentPrice: current,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: lastAlerted,
        lastAlertedAt: Date.now() - 30 * 60 * 60 * 1000,
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('8. Target price met → triggers', () => {
    const p = makeProduct({
      currentPrice: 1400,
      watch: {
        targetPrice: 1500,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: null,
        lastAlertedAt: null,
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(true);
  });

  it('9. Target price not met → suppressed', () => {
    const p = makeProduct({
      currentPrice: 1800,
      watch: {
        targetPrice: 1500,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: null,
        lastAlertedAt: null,
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('10. Price at 90th-percentile low (cheapest 10%) → triggers', () => {
    // Build a history where most prices are high but a few are low
    // 10% of observations: index 0 and 1 (out of 20) are the cheapest
    // currentPrice = 900 which should land in the cheapest 10%
    const obs: Observation[] = [];
    // 18 high-price observations
    for (let i = 0; i < 18; i++) {
      obs.push(makeObs(10000 - i * 100, 2000));
    }
    // 2 low-price observations (the bottom 10%)
    obs.push(makeObs(500, 900));
    obs.push(makeObs(400, 950));

    const history = makeHistory(obs);
    // currentPrice equals the lowest observation — should be at or below p10
    const p = makeProduct({ currentPrice: 900, initialPriceMinor: 2000 });
    expect(shouldTriggerNotification(p, history)).toBe(true);
  });

  it('10b. Price well above 90th percentile low → not triggered by percentile alone', () => {
    const obs: Observation[] = [];
    // 20 observations with prices ranging from 1000 to 2900
    for (let i = 0; i < 20; i++) {
      obs.push(makeObs(10000 - i * 100, 1000 + i * 100));
    }
    const history = makeHistory(obs);
    // Sorted prices: [1000, 1100, ..., 2900]
    // p10 index = floor(0.10 * 20) = 2 → price at index 2 = 1200
    // currentPrice = 2000 > 1200 → not at percentile low, and 2000 == initialPriceMinor → no trigger
    const p = makeProduct({ currentPrice: 2000, initialPriceMinor: 2000 });
    expect(shouldTriggerNotification(p, history)).toBe(false);
  });

  it('Tier 4 (fail-closed) → suppressed', () => {
    const p = makeProduct({ currentPrice: 1500, parseTier: 4 });
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('Cooldown boundary: exactly at cooldown edge → suppressed', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const p = makeProduct({
      currentPrice: 1500,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: 2000,
        lastAlertedAt: now - 24 * 60 * 60 * 1000 + 1, // 1ms before cooldown expires
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(false);
    vi.useRealTimers();
  });

  it('Cooldown boundary: just past cooldown → triggers', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const p = makeProduct({
      currentPrice: 1450,
      initialPriceMinor: 2000,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: 1500,
        lastAlertedAt: now - 24 * 60 * 60 * 1000 - 1, // 1ms past cooldown
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(true);
    vi.useRealTimers();
  });

  it('Exactly 3% below last alerted (MIN_DELTA boundary) → suppressed', () => {
    // price >= lastAlertedPrice * 0.97 → suppressed
    // price = lastAlertedPrice * 0.97 exactly → suppressed (>=)
    const lastAlerted = 2000;
    const current = Math.round(lastAlerted * 0.97); // exactly 3% drop
    const p = makeProduct({
      currentPrice: current,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: lastAlerted,
        lastAlertedAt: Date.now() - 30 * 60 * 60 * 1000,
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    // current >= lastAlerted * 0.97 → false
    expect(shouldTriggerNotification(p)).toBe(false);
  });

  it('More than 3% below last alerted → triggers', () => {
    const lastAlerted = 2000;
    const current = Math.round(lastAlerted * 0.96); // 4% drop
    const p = makeProduct({
      currentPrice: current,
      initialPriceMinor: 2000,
      watch: {
        targetPrice: null,
        cooldownHours: 24,
        muted: false,
        lastAlertedPrice: lastAlerted,
        lastAlertedAt: Date.now() - 30 * 60 * 60 * 1000,
      
        notifyOnRestock: false,
        dropThresholdPct: null,
      },
    });
    expect(shouldTriggerNotification(p)).toBe(true);
  });
});

describe('isAtPercentileLow', () => {
  it('returns false for empty history', () => {
    expect(isAtPercentileLow(1000, makeHistory([]))).toBe(false);
  });

  it('returns true when price is the single observation', () => {
    const obs: Observation[] = [makeObs(100, 1000)];
    expect(isAtPercentileLow(1000, makeHistory(obs))).toBe(true);
  });

  it('returns false for prices outside the 365-day window', () => {
    // Create an observation more than 365 days old
    const oldMinutes = Math.floor(Date.now() / 60_000) - 366 * 24 * 60; // 366 days ago
    const obs: Observation[] = [[oldMinutes, 500, 0, 1, 1]];
    // No valid observations in window → false
    expect(isAtPercentileLow(500, makeHistory(obs))).toBe(false);
  });

  it('returns true when price is in cheapest 10% of 10 observations', () => {
    // 10 observations: prices [1000, 1100, 1200, ..., 1900]
    const obs: Observation[] = [];
    for (let i = 0; i < 10; i++) {
      obs.push(makeObs(1000 - i * 10, 1000 + i * 100));
    }
    // p10 index = floor(0.10 * 10) = 1 → price at index 1 in sorted array = 1100
    // currentPrice = 1000 (the actual minimum) → 1000 <= 1100 → true
    expect(isAtPercentileLow(1000, makeHistory(obs))).toBe(true);
  });

  it('returns false when price is above the 90th-percentile low', () => {
    const obs: Observation[] = [];
    for (let i = 0; i < 10; i++) {
      obs.push(makeObs(1000 - i * 10, 1000 + i * 100));
    }
    // p10 index = 1 → 1100; currentPrice = 1500 > 1100 → false
    expect(isAtPercentileLow(1500, makeHistory(obs))).toBe(false);
  });
});
