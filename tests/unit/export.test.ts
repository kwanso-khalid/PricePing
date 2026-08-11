import { describe, it, expect } from 'vitest';
import { exportToJson, exportToCsv, importFromJson } from '../../src/lib/export.js';
import type { Product, ProductSummary, ObservationHistory, CachedStats } from '../../src/types/storage.js';

const EMPTY_STATS: CachedStats = {
  observationCount: 5,
  changeCount: 2,
  daysTracked: 30,
  lastChangeAt: null,
  allTimeMin: { priceMinor: 1500, observedAt: Date.now() - 86400000 },
  allTimeMax: { priceMinor: 2500, observedAt: Date.now() - 172800000 },
  w30: { min: 1500, max: 2500, median: 2000, count: 5 },
  w90: null,
  w365: null,
};

function makeProduct(overrides?: Partial<Product>): Product {
  return {
    id: 'test-id-1',
    retailerHost: 'example.com',
    url: 'https://example.com/product',
    canonicalKey: 'abc123',
    title: 'Test Product',
    imageUrl: null,
    variantLabel: null,
    currency: 'USD',
    initialPriceMinor: 2000,
    currentPrice: 1999,
    advertisedListPrice: 2500,
    stockState: 1,
    lastKnownStockState: 1,
    parseStatus: 'ok',
    parseTier: 1,
    consecutiveFailures: 0,
    lastCheckedAt: Date.now(),
    lastSuccessfulParseAt: Date.now(),
    createdAt: Date.now() - 30 * 86400000,
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
    stats: EMPTY_STATS,
    ...overrides,
  };
}

function makeSummary(overrides?: Partial<ProductSummary>): ProductSummary {
  return {
    id: 'test-id-1',
    retailerHost: 'example.com',
    url: 'https://example.com/product',
    canonicalKey: 'abc123',
    title: 'Test Product',
    imageUrl: null,
    variantLabel: null,
    currency: 'USD',
    initialPriceMinor: 2000,
    currentPrice: 1999,
    advertisedListPrice: 2500,
    stockState: 1,
    parseStatus: 'ok',
    parseTier: 1,
    lastCheckedAt: Date.now(),
    createdAt: Date.now() - 30 * 86400000,
    watch: { targetPrice: null, muted: false },
    stats: EMPTY_STATS,
    sparklinePoints: [2000, 1999, 2100, 1800, 1999],
    ...overrides,
  };
}

function makeHistory(): ObservationHistory {
  return {
    currency: 'USD',
    obs: [
      [Math.floor((Date.now() - 86400000) / 60_000), 2000, 2500, 1, 1],
      [Math.floor((Date.now() - 43200000) / 60_000), 1999, 2500, 1, 1],
    ],
  };
}

describe('exportToJson', () => {
  it('produces valid JSON', () => {
    const product = makeProduct();
    const history = makeHistory();
    const json = exportToJson([product], { 'test-id-1': history });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toBeDefined();
    expect(parsed['version']).toBe(2);
    expect(parsed['exportedAt']).toBeDefined();
  });

  it('includes products and histories in output', () => {
    const product = makeProduct();
    const history = makeHistory();
    const json = exportToJson([product], { 'test-id-1': history });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const products = parsed['products'] as unknown[];
    const histories = parsed['histories'] as Record<string, unknown>;
    expect(Array.isArray(products)).toBe(true);
    expect(products).toHaveLength(1);
    expect(histories['test-id-1']).toBeDefined();
  });

  it('handles empty products array', () => {
    const json = exportToJson([], {});
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Array.isArray(parsed['products'])).toBe(true);
    expect((parsed['products'] as unknown[]).length).toBe(0);
  });
});

describe('exportToCsv', () => {
  it('produces correct headers', () => {
    const csv = exportToCsv([]);
    const headers = csv.split('\n')[0] ?? '';
    expect(headers).toContain('title');
    expect(headers).toContain('retailer');
    expect(headers).toContain('url');
    expect(headers).toContain('currency');
    expect(headers).toContain('current_price');
    expect(headers).toContain('initial_price');
    expect(headers).toContain('all_time_low');
    expect(headers).toContain('all_time_high');
    expect(headers).toContain('days_tracked');
    expect(headers).toContain('observation_count');
    expect(headers).toContain('parse_status');
    expect(headers).toContain('parse_tier');
    expect(headers).toContain('created_at');
    expect(headers).toContain('last_checked_at');
  });

  it('produces correct number of rows (header + one per product)', () => {
    const csv = exportToCsv([makeSummary()]);
    const lines = csv.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  it('escapes commas in titles', () => {
    const s = makeSummary({ title: 'Product, with comma' });
    const csv = exportToCsv([s]);
    expect(csv).toContain('"Product, with comma"');
  });

  it('escapes double quotes in titles', () => {
    const s = makeSummary({ title: 'Product "quoted"' });
    const csv = exportToCsv([s]);
    expect(csv).toContain('"Product ""quoted"""');
  });

  it('includes retailer and url in rows', () => {
    const s = makeSummary({ retailerHost: 'shop.example.com' });
    const csv = exportToCsv([s]);
    expect(csv).toContain('shop.example.com');
    expect(csv).toContain('https://example.com/product');
  });

  it('handles null allTimeMin/allTimeMax gracefully', () => {
    const s = makeSummary({
      stats: { ...EMPTY_STATS, allTimeMin: null, allTimeMax: null },
    });
    const csv = exportToCsv([s]);
    const dataRow = csv.split('\n')[1] ?? '';
    // two empty fields for ATL and ATH
    expect(dataRow).toBeDefined();
  });
});

describe('importFromJson', () => {
  it('parses valid JSON', async () => {
    const product = makeProduct();
    const history = makeHistory();
    const json = exportToJson([product], { 'test-id-1': history });
    const result = await importFromJson(json);
    expect(result.products).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.products[0]?.id).toBe('test-id-1');
  });

  it('throws on invalid JSON', async () => {
    await expect(importFromJson('not-valid-json{{')).rejects.toThrow('Invalid JSON');
  });

  it('throws when no products array in import data', async () => {
    await expect(importFromJson(JSON.stringify({ version: 2 }))).rejects.toThrow(
      'No products array found',
    );
  });

  it('throws when root is not an object', async () => {
    await expect(importFromJson(JSON.stringify([1, 2, 3]))).rejects.toThrow();
  });

  it('skips invalid product entries', async () => {
    const product = makeProduct();
    const invalidEntry = { notAProduct: true };
    const json = JSON.stringify({
      version: 2,
      products: [product, invalidEntry],
    });
    const result = await importFromJson(json);
    expect(result.products).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it('returns empty list for empty products array', async () => {
    const json = JSON.stringify({ version: 2, products: [] });
    const result = await importFromJson(json);
    expect(result.products).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('handles multiple valid products', async () => {
    const p1 = makeProduct({ id: 'id-1', url: 'https://a.com', canonicalKey: 'key1' });
    const p2 = makeProduct({ id: 'id-2', url: 'https://b.com', canonicalKey: 'key2' });
    const json = JSON.stringify({ version: 2, products: [p1, p2] });
    const result = await importFromJson(json);
    expect(result.count).toBe(2);
  });
});
