import type {
  Product,
  ProductSummary,
  ObservationHistory,
  Observation,
  Meta,
  Settings,
  AlertLog,
  StockStateCode,
  ParseTier,
  ParseStatus,
} from '../types/storage.js';
import { computeStats, sparklinePoints } from './stats.js';
import { canonicalKey } from './canonical.js';
import { createLogger } from './logger.js';
import { ok, err } from './result.js';
import type { Result } from './result.js';

const logger = createLogger('storage');

const KEY_META = 'meta';
const KEY_IDX = 'idx';
const KEY_ALERTS = 'alerts';
const KEY_PENDING_ALERTS = 'pending_alerts';
const KEY_ALERT_LOG = 'alertlog';
export const SCHEMA_VERSION = 3;
const MAX_OBSERVATIONS = 400;
const MAX_PRODUCTS = 100;
const ALERT_PRUNE_MS = 60 * 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS: Settings = {
  checkIntervalHours: 6,
  notificationsEnabled: true,
  mutedUntil: null,
  quietHours: null,
};

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        logger.error('get failed', { key, error: chrome.runtime.lastError.message });
        resolve(undefined);
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

function storageSet(data: Record<string, unknown>): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        resolve(err(chrome.runtime.lastError.message ?? 'write failed'));
        return;
      }
      resolve(ok(undefined));
    });
  });
}

function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });
}

export async function getMeta(): Promise<Meta> {
  const raw = await storageGet<Meta>(KEY_META);
  if (!raw || typeof raw !== 'object') {
    return { schemaVersion: SCHEMA_VERSION, productCount: 0, settings: { ...DEFAULT_SETTINGS } };
  }
  return raw;
}

async function saveMeta(meta: Meta): Promise<Result<void, string>> {
  return storageSet({ [KEY_META]: meta });
}

export async function getSettings(): Promise<Settings> {
  const meta = await getMeta();
  return { ...DEFAULT_SETTINGS, ...meta.settings };
}

export async function saveSettings(settings: Settings): Promise<Result<void, string>> {
  const meta = await getMeta();
  meta.settings = settings;
  return saveMeta(meta);
}

export async function getProductIndex(): Promise<ProductSummary[]> {
  const raw = await storageGet<ProductSummary[]>(KEY_IDX);
  if (!Array.isArray(raw)) return [];
  return raw;
}

async function saveIdx(idx: ProductSummary[]): Promise<Result<void, string>> {
  return storageSet({ [KEY_IDX]: idx });
}

function productToSummary(p: Product, obs: Observation[]): ProductSummary {
  return {
    id: p.id,
    retailerHost: p.retailerHost,
    url: p.url,
    canonicalKey: p.canonicalKey,
    title: p.title,
    imageUrl: p.imageUrl,
    variantLabel: p.variantLabel,
    currency: p.currency,
    initialPriceMinor: p.initialPriceMinor,
    currentPrice: p.currentPrice,
    advertisedListPrice: p.advertisedListPrice,
    stockState: p.stockState,
    parseStatus: p.parseStatus,
    parseTier: p.parseTier,
    lastCheckedAt: p.lastCheckedAt,
    createdAt: p.createdAt,
    watch: { targetPrice: p.watch.targetPrice, muted: p.watch.muted },
    stats: p.stats,
    sparklinePoints: sparklinePoints(obs),
  };
}

export async function getProduct(id: string): Promise<Product | null> {
  const raw = await storageGet<Product>(`p:${id}`);
  return raw ?? null;
}

export async function getHistory(id: string): Promise<ObservationHistory | null> {
  const raw = await storageGet<ObservationHistory>(`h:${id}`);
  return raw ?? null;
}

export async function addProduct(
  product: Product,
  firstObs: Observation,
): Promise<Result<void, string>> {
  const meta = await getMeta();
  if (meta.productCount >= MAX_PRODUCTS) {
    return err(`Limit of ${MAX_PRODUCTS} products reached. Remove a product to add another.`);
  }

  const idx = await getProductIndex();
  if (idx.some((s) => s.canonicalKey === product.canonicalKey)) {
    return err('Already tracking a product at this URL.');
  }

  const history: ObservationHistory = { currency: product.currency, obs: [firstObs] };
  const stats = computeStats(history.obs, null, null);
  const productWithStats: Product = { ...product, stats };

  idx.push(productToSummary(productWithStats, history.obs));

  const writeResult = await storageSet({
    [`p:${product.id}`]: productWithStats,
    [`h:${product.id}`]: history,
    [KEY_IDX]: idx,
  });
  if (!writeResult.ok) return writeResult;

  meta.productCount = idx.length;
  return saveMeta(meta);
}

export async function updateProduct(product: Product): Promise<Result<void, string>> {
  const history = await getHistory(product.id);
  const obs = history?.obs ?? [];
  const idx = await getProductIndex();
  const i = idx.findIndex((s) => s.id === product.id);
  const summary = productToSummary(product, obs);
  if (i >= 0) {
    idx[i] = summary;
  } else {
    idx.push(summary);
  }
  return storageSet({ [`p:${product.id}`]: product, [KEY_IDX]: idx });
}

export async function appendObservation(
  productId: string,
  obs: Observation,
): Promise<Result<void, string>> {
  const [product, history] = await Promise.all([getProduct(productId), getHistory(productId)]);
  if (!product || !history) return err(`Product ${productId} not found`);

  let updatedObs = [...history.obs, obs];
  if (updatedObs.length > MAX_OBSERVATIONS) {
    const minMinor = product.stats.allTimeMin?.priceMinor ?? null;
    const maxMinor = product.stats.allTimeMax?.priceMinor ?? null;
    updatedObs = trimObservations(updatedObs, minMinor, maxMinor);
  }

  const stats = computeStats(updatedObs, product.stats.allTimeMin, product.stats.allTimeMax);
  const updatedHistory: ObservationHistory = { currency: history.currency, obs: updatedObs };
  const updatedProduct: Product = {
    ...product,
    stats,
    currentPrice: obs[1],
    stockState: obs[3],
    parseTier: obs[4],
  };

  const idx = await getProductIndex();
  const i = idx.findIndex((s) => s.id === productId);
  if (i >= 0) idx[i] = productToSummary(updatedProduct, updatedObs);

  return storageSet({
    [`p:${productId}`]: updatedProduct,
    [`h:${productId}`]: updatedHistory,
    [KEY_IDX]: idx,
  });
}

export async function removeProduct(id: string): Promise<Result<void, string>> {
  const idx = await getProductIndex();
  const filtered = idx.filter((s) => s.id !== id);
  await storageRemove([`p:${id}`, `h:${id}`]);
  const writeResult = await saveIdx(filtered);
  if (!writeResult.ok) return writeResult;
  const meta = await getMeta();
  meta.productCount = filtered.length;
  return saveMeta(meta);
}

export async function getAlerts(): Promise<AlertLog> {
  const raw = await storageGet<AlertLog>(KEY_ALERTS);
  if (!raw || typeof raw !== 'object' || !raw.keys) return { keys: {} };
  return raw;
}

export async function saveAlerts(alerts: AlertLog): Promise<Result<void, string>> {
  return storageSet({ [KEY_ALERTS]: alerts });
}

export function pruneAlerts(alerts: AlertLog, nowMs: number = Date.now()): AlertLog {
  const pruned: Record<string, number> = {};
  for (const [key, createdAt] of Object.entries(alerts.keys)) {
    if (nowMs - createdAt < ALERT_PRUNE_MS) pruned[key] = createdAt;
  }
  return { keys: pruned };
}

export async function getPendingAlerts(): Promise<string[]> {
  const raw = await storageGet<string[]>(KEY_PENDING_ALERTS);
  if (!Array.isArray(raw)) return [];
  return raw;
}

export async function savePendingAlerts(ids: string[]): Promise<Result<void, string>> {
  return storageSet({ [KEY_PENDING_ALERTS]: ids });
}

export async function clearPendingAlerts(): Promise<Result<void, string>> {
  return storageSet({ [KEY_PENDING_ALERTS]: [] });
}

export async function getRawAlertLog(): Promise<unknown> {
  return storageGet<unknown>(KEY_ALERT_LOG);
}

export async function saveRawAlertLog(data: unknown): Promise<Result<void, string>> {
  return storageSet({ [KEY_ALERT_LOG]: data });
}

export async function clearAll(): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        resolve(err(chrome.runtime.lastError.message ?? 'clear failed'));
        return;
      }
      resolve(ok(undefined));
    });
  });
}

export async function getBytesInUse(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes));
  });
}

function trimObservations(
  obs: Observation[],
  allTimeMinMinor: number | null,
  allTimeMaxMinor: number | null,
): Observation[] {
  const toRemove = obs.length - MAX_OBSERVATIONS;
  if (toRemove <= 0) return obs;
  const result: Observation[] = [];
  let removed = 0;
  let minKept = false;
  let maxKept = false;
  for (const o of obs) {
    const isMin = allTimeMinMinor !== null && o[1] === allTimeMinMinor;
    const isMax = allTimeMaxMinor !== null && o[1] === allTimeMaxMinor;
    const mustKeep = (isMin && !minKept) || (isMax && !maxKept);
    if (removed < toRemove && !mustKeep) { removed++; continue; }
    if (isMin) minKept = true;
    if (isMax) maxKept = true;
    result.push(o);
  }
  return result;
}

// ---- Migration v1 → v2 ----

const LEGACY_KEY = 'pricewatch_data';

type ExtractionMethodLegacy = 'jsonld' | 'opengraph' | 'microdata' | 'adapter' | 'manual';

function legacyMethodToTier(m: ExtractionMethodLegacy): ParseTier {
  if (m === 'adapter') return 2;
  return 1;
}

function legacyParseStatus(paused: boolean, failures: number): ParseStatus {
  if (paused || failures >= 5) return 'paused';
  return 'ok';
}

interface LegacyPP { price: { amountMinor: number }; observedAt: number; inStock: boolean; }
interface LegacyItem {
  id: string; url: string; title: string; imageUrl: string | null;
  hostname: string; currency: string;
  initialPrice: { amountMinor: number }; currentPrice: { amountMinor: number };
  targetPrice: { amountMinor: number } | null;
  history: LegacyPP[];
  createdAt: number; lastCheckedAt: number | null;
  lastNotifiedAt: number | null; lastNotifiedPriceMinor: number | null;
  consecutiveFailures: number; paused: boolean;
  extractionMethod: ExtractionMethodLegacy;
}
interface LegacySchema {
  schemaVersion?: number;
  items?: Record<string, LegacyItem>;
  settings?: { checkIntervalHours?: number; notificationsEnabled?: boolean; mutedUntil?: number | null };
}

async function migrateV2toV3(): Promise<void> {
  logger.info('Migrating v2→v3: adding notifyOnRestock, dropThresholdPct, lastKnownStockState, notes');
  const idx = await getProductIndex();
  const writes: Record<string, unknown> = {};

  for (const summary of idx) {
    const raw = await storageGet<Record<string, unknown>>(`p:${summary.id}`);
    if (!raw) continue;
    const watch = (typeof raw['watch'] === 'object' && raw['watch'] !== null
      ? raw['watch']
      : {}) as Record<string, unknown>;
    if (!('notifyOnRestock' in watch)) watch['notifyOnRestock'] = false;
    if (!('dropThresholdPct' in watch)) watch['dropThresholdPct'] = null;
    raw['watch'] = watch;
    if (!('lastKnownStockState' in raw)) raw['lastKnownStockState'] = raw['stockState'] ?? 0;
    if (!('notes' in raw)) raw['notes'] = '';
    writes[`p:${summary.id}`] = raw;
  }

  if (Object.keys(writes).length > 0) {
    await storageSet(writes);
  }

  const meta = await getMeta();
  await storageSet({ [KEY_META]: { ...meta, schemaVersion: 3 } });
  logger.info('Migration v2→v3 complete', { products: idx.length });
}

export async function runMigration(): Promise<void> {
  const existing = await storageGet<{ schemaVersion?: number }>(KEY_META);
  if (existing?.schemaVersion === SCHEMA_VERSION) return;

  const legacy = await storageGet<LegacySchema>(LEGACY_KEY);
  if (!legacy || typeof legacy !== 'object') {
    if (existing?.schemaVersion === 2) {
      // Existing v2 install — only run v2→v3
      await migrateV2toV3();
      return;
    }
    // Fresh install
    const freshMeta: Meta = { schemaVersion: SCHEMA_VERSION, productCount: 0, settings: { ...DEFAULT_SETTINGS } };
    await storageSet({ [KEY_META]: freshMeta, [KEY_IDX]: [], [KEY_ALERTS]: { keys: {} } });
    return;
  }

  logger.info('Migrating v1→v2');
  const ls = legacy.settings ?? {};
  const settings: Settings = { checkIntervalHours: ls.checkIntervalHours ?? 6, notificationsEnabled: ls.notificationsEnabled ?? true, mutedUntil: ls.mutedUntil ?? null, quietHours: null };
  const items = legacy.items ?? {};
  const idx: ProductSummary[] = [];
  const writes: Record<string, unknown> = {};

  for (const li of Object.values(items)) {
    let cKey: string;
    try { cKey = await canonicalKey(li.url); } catch { cKey = li.id; }

    const tier = legacyMethodToTier(li.extractionMethod);
    const parseStatus = legacyParseStatus(li.paused, li.consecutiveFailures);
    const obs: Observation[] = li.history.map((p): Observation => [
      Math.floor(p.observedAt / 60_000), p.price.amountMinor, 0, p.inStock ? 1 : 2, tier,
    ]);
    if (obs.length === 0) {
      obs.push([Math.floor(li.createdAt / 60_000), li.initialPrice.amountMinor, 0, 1, tier]);
    }
    const trimmedObs = obs.length > MAX_OBSERVATIONS ? obs.slice(-MAX_OBSERVATIONS) : obs;
    const stats = computeStats(trimmedObs, null, null);
    const lastHistoryEntry = li.history[li.history.length - 1];
    const lastStockState: StockStateCode = lastHistoryEntry ? (lastHistoryEntry.inStock ? 1 : 2) : 1;

    const product: Product = {
      id: li.id, retailerHost: li.hostname, url: li.url, canonicalKey: cKey,
      title: li.title, imageUrl: li.imageUrl, variantLabel: null, currency: li.currency,
      initialPriceMinor: li.initialPrice.amountMinor, currentPrice: li.currentPrice.amountMinor,
      advertisedListPrice: null, stockState: lastStockState, lastKnownStockState: lastStockState,
      parseStatus, parseTier: tier,
      consecutiveFailures: li.consecutiveFailures,
      lastCheckedAt: li.lastCheckedAt, lastSuccessfulParseAt: li.lastCheckedAt, createdAt: li.createdAt,
      notes: '',
      watch: {
        targetPrice: li.targetPrice?.amountMinor ?? null, cooldownHours: 24, muted: false,
        lastAlertedPrice: li.lastNotifiedPriceMinor, lastAlertedAt: li.lastNotifiedAt,
        notifyOnRestock: false, dropThresholdPct: null,
      },
      stats,
    };
    const history: ObservationHistory = { currency: li.currency, obs: trimmedObs };
    writes[`p:${product.id}`] = product;
    writes[`h:${product.id}`] = history;
    idx.push(productToSummary(product, trimmedObs));
  }

  writes[KEY_IDX] = idx;
  writes[KEY_ALERTS] = { keys: {} };
  await storageSet(writes);

  const meta: Meta = { schemaVersion: SCHEMA_VERSION, productCount: idx.length, settings };
  await saveMeta(meta);
  await storageRemove(LEGACY_KEY);
  logger.info('Migration complete', { products: idx.length });
}
