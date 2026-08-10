import { describe, it, expect } from 'vitest';
import {
  getAllItems,
  saveItem,
  deleteItem,
  getSettings,
  saveSettings,
} from '../../src/lib/storage.js';
import type { TrackedItem, AppSettings } from '../../src/types/index.js';

// Access the mock chrome object set up in setup.ts
type ChromeMock = {
  storage: {
    local: {
      get: ReturnType<typeof import('vitest').vi.fn>;
      set: ReturnType<typeof import('vitest').vi.fn>;
      remove: ReturnType<typeof import('vitest').vi.fn>;
    };
  };
  runtime: {
    lastError: { message?: string } | null;
  };
};

function getChromeMock(): ChromeMock {
  return (globalThis as unknown as { chrome: ChromeMock }).chrome;
}

const sampleItem: TrackedItem = {
  id: 'test-id-1',
  url: 'https://example.com/product/1',
  title: 'Test Product',
  imageUrl: null,
  hostname: 'example.com',
  currency: 'USD',
  initialPrice: { amountMinor: 1999, currency: 'USD' },
  currentPrice: { amountMinor: 1999, currency: 'USD' },
  targetPrice: null,
  history: [],
  createdAt: 1000,
  lastCheckedAt: null,
  lastNotifiedAt: null,
  lastNotifiedPriceMinor: null,
  consecutiveFailures: 0,
  paused: false,
  extractionMethod: 'jsonld',
};

describe('storage', () => {
  it('returns empty items when storage is empty', async () => {
    const items = await getAllItems();
    expect(items).toEqual({});
  });

  it('saves and retrieves an item', async () => {
    const stored: Record<string, unknown> = {};
    const chromeMock = getChromeMock();

    chromeMock.storage.local.set.mockImplementation(
      (data: Record<string, unknown>, callback: () => void) => {
        Object.assign(stored, data);
        callback();
      },
    );
    chromeMock.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback(stored);
      },
    );

    await saveItem(sampleItem);
    const items = await getAllItems();
    expect(items['test-id-1']).toBeDefined();
    expect(items['test-id-1']?.title).toBe('Test Product');
  });

  it('deletes an item', async () => {
    const stored: Record<string, unknown> = {};
    const chromeMock = getChromeMock();

    chromeMock.storage.local.set.mockImplementation(
      (data: Record<string, unknown>, callback: () => void) => {
        Object.assign(stored, data);
        callback();
      },
    );
    chromeMock.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback(stored);
      },
    );

    await saveItem(sampleItem);
    await deleteItem('test-id-1');
    const items = await getAllItems();
    expect(items['test-id-1']).toBeUndefined();
  });

  it('returns default settings when none saved', async () => {
    const settings = await getSettings();
    expect(settings.checkIntervalHours).toBe(6);
    expect(settings.notificationsEnabled).toBe(true);
    expect(settings.mutedUntil).toBeNull();
  });

  it('saves and retrieves settings', async () => {
    const stored: Record<string, unknown> = {};
    const chromeMock = getChromeMock();

    chromeMock.storage.local.set.mockImplementation(
      (data: Record<string, unknown>, callback: () => void) => {
        Object.assign(stored, data);
        callback();
      },
    );
    chromeMock.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback(stored);
      },
    );

    const newSettings: AppSettings = {
      checkIntervalHours: 12,
      notificationsEnabled: false,
      mutedUntil: null,
      perSiteEnabled: {},
    };

    await saveSettings(newSettings);
    const retrieved = await getSettings();
    expect(retrieved.checkIntervalHours).toBe(12);
    expect(retrieved.notificationsEnabled).toBe(false);
  });

  it('handles storage write failure gracefully', async () => {
    const chromeMock = getChromeMock();

    chromeMock.storage.local.set.mockImplementation(
      (_data: unknown, callback: () => void) => {
        chromeMock.runtime.lastError = { message: 'QuotaExceededError' };
        callback();
        chromeMock.runtime.lastError = null;
      },
    );

    const result = await saveItem(sampleItem);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Storage write failed');
    }
  });

  it('handles corrupt storage data gracefully', async () => {
    const chromeMock = getChromeMock();

    chromeMock.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({ pricewatch_data: 'not-an-object' });
      },
    );

    const items = await getAllItems();
    expect(items).toEqual({});
  });

  it('runs migrations from v0 to v1', async () => {
    const stored: Record<string, unknown> = {};
    const chromeMock = getChromeMock();

    chromeMock.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
        callback({
          pricewatch_data: {
            schemaVersion: 0,
            items: {
              'old-item': {
                id: 'old-item',
                url: 'https://example.com',
                title: 'Old Item',
                // missing consecutiveFailures, paused, etc.
              },
            },
            settings: {},
            notifications: {},
          },
        });
      },
    );

    chromeMock.storage.local.set.mockImplementation(
      (data: Record<string, unknown>, callback: () => void) => {
        Object.assign(stored, data);
        callback();
      },
    );

    const items = await getAllItems();
    expect(items['old-item']?.consecutiveFailures).toBe(0);
    expect(items['old-item']?.paused).toBe(false);
  });

  it('deleting non-existent item is a no-op', async () => {
    const result = await deleteItem('does-not-exist');
    expect(result.ok).toBe(true);
  });
});
