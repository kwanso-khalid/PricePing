// Positional observation tuple stored without property names for space efficiency
// [minutesSinceEpoch, priceMinorUnits, listMinorUnits, stockState, tier]
export type Observation = [number, number, number, StockStateCode, ParseTier];

export type StockStateCode = 0 | 1 | 2 | 3 | 4;
// 0=unknown 1=in_stock 2=out_of_stock 3=preorder 4=limited

export type ParseTier = 1 | 2 | 3 | 4;
// 1=structured (JSON-LD/microdata/OpenGraph)  2=platform endpoint  3=generic DOM  4=fail closed

export type ParseStatus = 'ok' | 'paused' | 'blocked';

export interface PriceMark {
  priceMinor: number;
  observedAt: number; // epoch ms
}

export interface WindowStats {
  min: number;
  max: number;
  median: number;
  count: number;
}

export interface CachedStats {
  observationCount: number;
  changeCount: number;
  daysTracked: number;
  lastChangeAt: number | null;
  allTimeMin: PriceMark | null;
  allTimeMax: PriceMark | null;
  w30: WindowStats | null;
  w90: WindowStats | null;
  w365: WindowStats | null;
}

export interface WatchSettings {
  targetPrice: number | null;        // minor units
  cooldownHours: number;             // default 24
  muted: boolean;
  lastAlertedPrice: number | null;   // minor units
  lastAlertedAt: number | null;      // epoch ms
  notifyOnRestock: boolean;          // fire alert when item comes back in stock
  dropThresholdPct: number | null;   // trigger only when price drops >= X% from initial (null = any drop)
}

export interface Product {
  id: string;
  retailerHost: string;
  url: string;
  canonicalKey: string;
  title: string;
  imageUrl: string | null;
  variantLabel: string | null;
  currency: string;
  initialPriceMinor: number;
  currentPrice: number;              // minor units
  advertisedListPrice: number | null;
  stockState: StockStateCode;
  lastKnownStockState: StockStateCode; // previous check's stock state, for restock detection
  parseStatus: ParseStatus;
  parseTier: ParseTier;
  consecutiveFailures: number;
  lastCheckedAt: number | null;
  lastSuccessfulParseAt: number | null;
  createdAt: number;
  notes: string;                     // user-visible free-text annotation
  watch: WatchSettings;
  stats: CachedStats;
}

export interface ProductSummary {
  id: string;
  retailerHost: string;
  url: string;
  canonicalKey: string;
  title: string;
  imageUrl: string | null;
  variantLabel: string | null;
  currency: string;
  initialPriceMinor: number;
  currentPrice: number;
  advertisedListPrice: number | null;
  stockState: StockStateCode;
  parseStatus: ParseStatus;
  parseTier: ParseTier;
  lastCheckedAt: number | null;
  createdAt: number;
  watch: {
    targetPrice: number | null;
    muted: boolean;
  };
  stats: CachedStats;
  sparklinePoints: number[];  // last ≤20 priceMinorUnits, time-ordered
}

export interface ObservationHistory {
  currency: string;
  obs: Observation[];
}

export interface Settings {
  checkIntervalHours: number;
  notificationsEnabled: boolean;
  mutedUntil: number | null;
  quietHours: { startHour: number; endHour: number } | null;
}

export interface Meta {
  schemaVersion: number;
  productCount: number;
  settings: Settings;
}

export interface AlertLog {
  keys: Record<string, number>;  // idempotencyKey → createdAt epoch ms
}
