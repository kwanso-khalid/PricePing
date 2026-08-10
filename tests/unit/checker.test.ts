import { describe, it, expect, vi } from 'vitest';
import { applyCheckResult, shouldTriggerNotification } from '../../src/background/checker.js';
import type { TrackedItem, CheckResult } from '../../src/types/index.js';

function makeItem(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return {
    id: 'item-1',
    url: 'https://example.com/product',
    title: 'Test Product',
    imageUrl: null,
    hostname: 'example.com',
    currency: 'USD',
    initialPrice: { amountMinor: 2000, currency: 'USD' },
    currentPrice: { amountMinor: 2000, currency: 'USD' },
    targetPrice: null,
    history: [],
    createdAt: Date.now() - 10000,
    lastCheckedAt: null,
    lastNotifiedAt: null,
    lastNotifiedPriceMinor: null,
    consecutiveFailures: 0,
    paused: false,
    extractionMethod: 'jsonld',
    ...overrides,
  };
}

describe('applyCheckResult', () => {
  const now = Date.now();

  it('updates currentPrice on successful check', () => {
    const item = makeItem();
    const result: CheckResult = {
      status: 'ok',
      product: {
        title: 'Test',
        price: { amountMinor: 1500, currency: 'USD' },
        imageUrl: null,
        currency: 'USD',
        inStock: true,
        confidence: 0.9,
        method: 'jsonld',
      },
    };

    const updated = applyCheckResult(item, result, now);
    expect(updated.currentPrice.amountMinor).toBe(1500);
    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.lastCheckedAt).toBe(now);
  });

  it('adds to history when price changes', () => {
    const item = makeItem({ currentPrice: { amountMinor: 2000, currency: 'USD' } });
    const result: CheckResult = {
      status: 'ok',
      product: {
        title: 'Test',
        price: { amountMinor: 1500, currency: 'USD' },
        imageUrl: null,
        currency: 'USD',
        inStock: true,
        confidence: 0.9,
        method: 'jsonld',
      },
    };

    const updated = applyCheckResult(item, result, now);
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]?.price.amountMinor).toBe(1500);
  });

  it('does not add to history when price unchanged', () => {
    const item = makeItem({ currentPrice: { amountMinor: 2000, currency: 'USD' } });
    const result: CheckResult = {
      status: 'ok',
      product: {
        title: 'Test',
        price: { amountMinor: 2000, currency: 'USD' },
        imageUrl: null,
        currency: 'USD',
        inStock: true,
        confidence: 0.9,
        method: 'jsonld',
      },
    };

    const updated = applyCheckResult(item, result, now);
    expect(updated.history).toHaveLength(0);
  });

  it('increments consecutiveFailures on error', () => {
    const item = makeItem({ consecutiveFailures: 2 });
    const result: CheckResult = { status: 'error', message: 'Timeout' };
    const updated = applyCheckResult(item, result, now);
    expect(updated.consecutiveFailures).toBe(3);
  });

  it('resets consecutiveFailures on successful check', () => {
    const item = makeItem({ consecutiveFailures: 3 });
    const result: CheckResult = {
      status: 'ok',
      product: {
        title: 'Test',
        price: { amountMinor: 2000, currency: 'USD' },
        imageUrl: null,
        currency: 'USD',
        inStock: true,
        confidence: 0.9,
        method: 'jsonld',
      },
    };

    const updated = applyCheckResult(item, result, now);
    expect(updated.consecutiveFailures).toBe(0);
  });

  it('increments failures on blocked', () => {
    const item = makeItem({ consecutiveFailures: 1 });
    const result: CheckResult = { status: 'blocked' };
    const updated = applyCheckResult(item, result, now);
    expect(updated.consecutiveFailures).toBe(2);
  });
});

describe('shouldTriggerNotification', () => {
  const now = Date.now();

  it('triggers when price drops below initial (no target)', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1500, currency: 'USD' },
    });
    vi.setSystemTime(now);
    expect(shouldTriggerNotification(item)).toBe(true);
  });

  it('does not trigger when price is unchanged', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 2000, currency: 'USD' },
    });
    expect(shouldTriggerNotification(item)).toBe(false);
  });

  it('does not trigger when price rose above initial', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 2500, currency: 'USD' },
    });
    expect(shouldTriggerNotification(item)).toBe(false);
  });

  it('triggers when price drops below target price', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1400, currency: 'USD' },
      targetPrice: { amountMinor: 1500, currency: 'USD' },
    });
    vi.setSystemTime(now);
    expect(shouldTriggerNotification(item)).toBe(true);
  });

  it('does not trigger when price is above target', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1800, currency: 'USD' },
      targetPrice: { amountMinor: 1500, currency: 'USD' },
    });
    expect(shouldTriggerNotification(item)).toBe(false);
  });

  it('respects 24-hour cooldown', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1500, currency: 'USD' },
      lastNotifiedAt: now - 60 * 60 * 1000, // 1 hour ago
      lastNotifiedPriceMinor: 1500,
    });
    vi.setSystemTime(now);
    expect(shouldTriggerNotification(item)).toBe(false);
  });

  it('does not notify for same price as last notification', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1500, currency: 'USD' },
      lastNotifiedAt: now - 25 * 60 * 60 * 1000, // 25 hours ago (past cooldown)
      lastNotifiedPriceMinor: 1500, // same price
    });
    vi.setSystemTime(now);
    expect(shouldTriggerNotification(item)).toBe(false);
  });

  it('notifies when price drops further after cooldown', () => {
    const item = makeItem({
      initialPrice: { amountMinor: 2000, currency: 'USD' },
      currentPrice: { amountMinor: 1200, currency: 'USD' }, // lower than last notified
      lastNotifiedAt: now - 25 * 60 * 60 * 1000, // past cooldown
      lastNotifiedPriceMinor: 1500,
    });
    vi.setSystemTime(now);
    expect(shouldTriggerNotification(item)).toBe(true);
  });
});
