import type { TrackedItem, AppSettings, NotificationState, StorageSchema } from '../types/index.js';
import { createLogger } from './logger.js';
import { ok, err } from './result.js';
import type { Result } from './result.js';

const logger = createLogger('storage');

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'pricewatch_data';
const QUOTA_BYTES_ESTIMATE = 5 * 1024 * 1024; // 5MB safety limit

const DEFAULT_SETTINGS: AppSettings = {
  checkIntervalHours: 6,
  notificationsEnabled: true,
  mutedUntil: null,
  perSiteEnabled: {},
};

const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  lastBatchNotificationAt: null,
  recentlyNotifiedItemIds: [],
};

function defaultSchema(): StorageSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    items: {},
    settings: { ...DEFAULT_SETTINGS },
    notifications: { ...DEFAULT_NOTIFICATION_STATE },
  };
}

// Migration functions: migrate from version N to N+1
type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // v0 -> v1: add consecutiveFailures, paused fields if missing
  0: (data: Record<string, unknown>) => {
    const items = (data['items'] as Record<string, Record<string, unknown>>) ?? {};
    for (const item of Object.values(items)) {
      if (!('consecutiveFailures' in item)) {
        item['consecutiveFailures'] = 0;
      }
      if (!('paused' in item)) {
        item['paused'] = false;
      }
      if (!('lastNotifiedAt' in item)) {
        item['lastNotifiedAt'] = null;
      }
      if (!('lastNotifiedPriceMinor' in item)) {
        item['lastNotifiedPriceMinor'] = null;
      }
    }
    data['schemaVersion'] = 1;
    return data;
  },
};

function runMigrations(raw: Record<string, unknown>): StorageSchema {
  let version = (raw['schemaVersion'] as number | undefined) ?? 0;

  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    raw = migration(raw);
    version++;
    logger.info(`Migrated storage from v${version - 1} to v${version}`);
  }

  return raw as unknown as StorageSchema;
}

async function loadSchema(): Promise<StorageSchema> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        logger.error('Failed to load storage', chrome.runtime.lastError.message);
        resolve(defaultSchema());
        return;
      }

      const raw = result[STORAGE_KEY] as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== 'object') {
        resolve(defaultSchema());
        return;
      }

      try {
        const migrated = runMigrations(raw);
        // Ensure required keys exist
        migrated.items = migrated.items ?? {};
        migrated.settings = { ...DEFAULT_SETTINGS, ...migrated.settings };
        migrated.notifications = {
          ...DEFAULT_NOTIFICATION_STATE,
          ...migrated.notifications,
        };
        resolve(migrated);
      } catch (e) {
        logger.error('Failed to parse storage data, resetting', e);
        resolve(defaultSchema());
      }
    });
  });
}

async function saveSchema(schema: StorageSchema): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    const serialized = JSON.stringify(schema);
    const byteSize = new Blob([serialized]).size;

    if (byteSize > QUOTA_BYTES_ESTIMATE) {
      const msg = `Storage quota would be exceeded: ${byteSize} bytes`;
      logger.error(msg);
      resolve(err(msg));
      return;
    }

    chrome.storage.local.set({ [STORAGE_KEY]: schema }, () => {
      if (chrome.runtime.lastError) {
        const msg = `Storage write failed: ${chrome.runtime.lastError.message ?? 'unknown'}`;
        logger.error(msg);
        resolve(err(msg));
        return;
      }
      resolve(ok(undefined));
    });
  });
}

// Public API

export async function getAllItems(): Promise<Record<string, TrackedItem>> {
  const schema = await loadSchema();
  return schema.items;
}

export async function getItem(id: string): Promise<TrackedItem | null> {
  const schema = await loadSchema();
  return schema.items[id] ?? null;
}

export async function saveItem(item: TrackedItem): Promise<Result<void, string>> {
  const schema = await loadSchema();
  schema.items[item.id] = item;
  return saveSchema(schema);
}

export async function deleteItem(id: string): Promise<Result<void, string>> {
  const schema = await loadSchema();
  if (!(id in schema.items)) {
    return ok(undefined);
  }
  delete schema.items[id];
  return saveSchema(schema);
}

export async function getSettings(): Promise<AppSettings> {
  const schema = await loadSchema();
  return schema.settings;
}

export async function saveSettings(settings: AppSettings): Promise<Result<void, string>> {
  const schema = await loadSchema();
  schema.settings = settings;
  return saveSchema(schema);
}

export async function getNotificationState(): Promise<NotificationState> {
  const schema = await loadSchema();
  return schema.notifications;
}

export async function saveNotificationState(
  state: NotificationState,
): Promise<Result<void, string>> {
  const schema = await loadSchema();
  schema.notifications = state;
  return saveSchema(schema);
}

export async function getSchemaVersion(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(0);
        return;
      }
      const raw = result[STORAGE_KEY] as Record<string, unknown> | undefined;
      resolve((raw?.['schemaVersion'] as number | undefined) ?? 0);
    });
  });
}

export async function clearAll(): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY, () => {
      if (chrome.runtime.lastError) {
        resolve(err(chrome.runtime.lastError.message ?? 'unknown'));
        return;
      }
      resolve(ok(undefined));
    });
  });
}

export { SCHEMA_VERSION };
