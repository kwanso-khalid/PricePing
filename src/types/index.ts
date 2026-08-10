export type CurrencyCode = string; // ISO 4217

export interface Money {
  amountMinor: number; // integer, e.g. 1999 for $19.99
  currency: CurrencyCode;
}

export interface PricePoint {
  price: Money;
  observedAt: number; // epoch ms
  inStock: boolean;
}

export type ExtractionMethod = 'jsonld' | 'opengraph' | 'microdata' | 'adapter' | 'manual';

export interface TrackedItem {
  id: string; // uuid
  url: string; // canonical, tracking params stripped
  title: string;
  imageUrl: string | null;
  hostname: string;
  currency: CurrencyCode;
  initialPrice: Money;
  currentPrice: Money;
  targetPrice: Money | null;
  history: PricePoint[]; // capped at 200, downsample >90 days to 1/day
  createdAt: number;
  lastCheckedAt: number | null;
  lastNotifiedAt: number | null;
  lastNotifiedPriceMinor: number | null;
  consecutiveFailures: number;
  paused: boolean;
  extractionMethod: ExtractionMethod;
}

export interface ExtractedProduct {
  title: string;
  price: Money;
  imageUrl: string | null;
  currency: CurrencyCode;
  inStock: boolean;
  confidence: number; // 0.0 to 1.0
  method: ExtractionMethod;
}

export interface StorageSchema {
  schemaVersion: number;
  items: Record<string, TrackedItem>;
  settings: AppSettings;
  notifications: NotificationState;
}

export interface AppSettings {
  checkIntervalHours: number; // 1-24, default 6
  notificationsEnabled: boolean;
  mutedUntil: number | null; // epoch ms
  perSiteEnabled: Record<string, boolean>;
}

export interface NotificationState {
  lastBatchNotificationAt: number | null;
  recentlyNotifiedItemIds: string[];
}

export type CheckResult =
  | { status: 'ok'; product: ExtractedProduct }
  | { status: 'blocked' }
  | { status: 'error'; message: string }
  | { status: 'unchanged' };
