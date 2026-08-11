import { describe, it, expect, vi } from 'vitest';
import { getProductIndex, addProduct, removeProduct, getProduct, getHistory, appendObservation, updateProduct, getSettings, saveSettings, runMigration, SCHEMA_VERSION } from '../../src/lib/storage.js';
import type { Product, Observation, Settings } from '../../src/types/storage.js';

type ChromeMock = {
  storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn>; getBytesInUse: ReturnType<typeof vi.fn> } };
  runtime: { lastError: { message?: string } | null };
};
function getChrome(): ChromeMock { return (globalThis as unknown as { chrome: ChromeMock }).chrome; }

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1', retailerHost: 'example.com', url: 'https://example.com/p/1',
    canonicalKey: 'abc123', title: 'Test', imageUrl: null, variantLabel: null,
    currency: 'USD', initialPriceMinor: 1999, currentPrice: 1999,
    advertisedListPrice: null, stockState: 1, lastKnownStockState: 1, parseStatus: 'ok', parseTier: 1,
    consecutiveFailures: 0, lastCheckedAt: null, lastSuccessfulParseAt: null,
    createdAt: 1000, notes: '',
    watch: { targetPrice: null, cooldownHours: 24, muted: false, lastAlertedPrice: null, lastAlertedAt: null, notifyOnRestock: false, dropThresholdPct: null },
    stats: { observationCount: 0, changeCount: 0, daysTracked: 0, lastChangeAt: null, allTimeMin: null, allTimeMax: null, w30: null, w90: null, w365: null },
    ...overrides,
  };
}

const firstObs: Observation = [Math.floor(1000 / 60_000), 1999, 0, 1, 1];

describe('storage', () => {
  it('returns empty index when no data', async () => {
    expect(await getProductIndex()).toEqual([]);
  });

  it('adds a product and retrieves it', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => { cb({ [key]: stored[key] }); });

    const result = await addProduct(makeProduct(), firstObs);
    expect(result.ok).toBe(true);

    const idx = await getProductIndex();
    expect(idx).toHaveLength(1);
    expect(idx[0]?.id).toBe('p1');
  });

  it('enforces 100-product cap', async () => {
    // Simulate meta with productCount already at 100
    const c = getChrome();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      if (key === 'meta') cb({ meta: { schemaVersion: 2, productCount: 100, settings: {} } });
      else cb({});
    });
    const result = await addProduct(makeProduct({ id: 'new' }), firstObs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('100');
  });

  it('removes a product', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => { cb({ [key]: stored[key] }); });
    c.storage.local.remove.mockImplementation((_keys: unknown, cb: () => void) => { cb(); });

    await addProduct(makeProduct(), firstObs);
    const removeResult = await removeProduct('p1');
    expect(removeResult.ok).toBe(true);

    const idx = await getProductIndex();
    expect(idx.find((s) => s.id === 'p1')).toBeUndefined();
  });

  it('appends observation and updates stats', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => { cb({ [key]: stored[key] }); });

    await addProduct(makeProduct(), firstObs);
    const newObs: Observation = [Math.floor(Date.now() / 60_000), 1799, 0, 1, 1];
    const result = await appendObservation('p1', newObs);
    expect(result.ok).toBe(true);

    const history = await getHistory('p1');
    expect(history?.obs).toHaveLength(2);
    expect(history?.obs[1]?.[1]).toBe(1799);

    const product = await getProduct('p1');
    expect(product?.currentPrice).toBe(1799);
    expect(product?.stats.observationCount).toBe(2);
  });

  it('returns default settings', async () => {
    const settings = await getSettings();
    expect(settings.checkIntervalHours).toBe(6);
    expect(settings.notificationsEnabled).toBe(true);
    expect(settings.mutedUntil).toBeNull();
  });

  it('saves and retrieves settings', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => { cb({ [key]: stored[key] }); });

    const newSettings: Settings = { checkIntervalHours: 12, notificationsEnabled: false, mutedUntil: null, quietHours: null };
    await saveSettings(newSettings);
    const retrieved = await getSettings();
    expect(retrieved.checkIntervalHours).toBe(12);
    expect(retrieved.notificationsEnabled).toBe(false);
  });

  it('migrates from v1 to v2', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      if (key === 'meta') cb({});  // no meta → migration needed
      else if (key === 'pricewatch_data') cb({
        pricewatch_data: {
          schemaVersion: 1,
          items: {
            'old-1': {
              id: 'old-1', url: 'https://example.com/product', title: 'Old Product',
              imageUrl: null, hostname: 'example.com', currency: 'USD',
              initialPrice: { amountMinor: 2000, currency: 'USD' },
              currentPrice: { amountMinor: 1800, currency: 'USD' },
              targetPrice: null,
              history: [{ price: { amountMinor: 2000, currency: 'USD' }, observedAt: 1000, inStock: true }],
              createdAt: 1000, lastCheckedAt: null, lastNotifiedAt: null,
              lastNotifiedPriceMinor: null, consecutiveFailures: 0, paused: false,
              extractionMethod: 'jsonld',
            },
          },
          settings: { checkIntervalHours: 6, notificationsEnabled: true, mutedUntil: null },
        },
      });
      else cb({ [key]: stored[key] });
    });
    c.storage.local.remove.mockImplementation((_: unknown, cb: () => void) => cb());

    await runMigration();

    // After migration, the product should exist under p:old-1
    expect(stored['p:old-1']).toBeDefined();
    expect(stored['h:old-1']).toBeDefined();
    const p = stored['p:old-1'] as Product;
    expect(p.title).toBe('Old Product');
    expect(p.currentPrice).toBe(1800);
    expect(p.parseStatus).toBe('ok');
    const meta = stored['meta'] as { schemaVersion: number };
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('skips migration when already at SCHEMA_VERSION', async () => {
    const c = getChrome();
    const setCalled = vi.fn();
    c.storage.local.set.mockImplementation((_: unknown, cb: () => void) => { setCalled(); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      if (key === 'meta') cb({ meta: { schemaVersion: SCHEMA_VERSION, productCount: 0, settings: {} } });
      else cb({});
    });
    await runMigration();
    expect(setCalled).not.toHaveBeenCalled();
  });

  it('runs v2→v3 migration when on schema v2', async () => {
    const stored: Record<string, unknown> = {
      meta: { schemaVersion: 2, productCount: 0, settings: {} },
      idx: [],
    };
    const c = getChrome();
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => { Object.assign(stored, data); cb(); });
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => { cb({ [key]: stored[key] }); });
    await runMigration();
    const meta = stored['meta'] as { schemaVersion: number };
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('handles storage write failure', async () => {
    const c = getChrome();
    c.storage.local.set.mockImplementation((_: unknown, cb: () => void) => {
      c.runtime.lastError = { message: 'QuotaExceededError' };
      cb();
      c.runtime.lastError = null;
    });
    const result = await addProduct(makeProduct(), firstObs);
    expect(result.ok).toBe(false);
  });
});
