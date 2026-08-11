export type CurrencyCode = string; // ISO 4217

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export type ExtractionMethod = 'jsonld' | 'opengraph' | 'microdata' | 'adapter' | 'shopify' | 'woocommerce' | 'generic' | 'manual';

// Re-export storage types needed in this file before they can be used below.
export type {
  Observation,
  StockStateCode,
  ParseTier,
  ParseStatus,
  PriceMark,
  WindowStats,
  CachedStats,
  WatchSettings,
  Product,
  ProductSummary,
  ObservationHistory,
  Settings,
  Meta,
  AlertLog,
} from './storage.js';

import type { StockStateCode, ParseTier } from './storage.js';

export interface ExtractedProduct {
  title: string;
  price: Money;
  imageUrl: string | null;
  currency: CurrencyCode;
  inStock: boolean;            // keep for backward compat, derive from stockState
  advertisedListPrice: Money | null;
  confidence: number;
  method: ExtractionMethod;
  stockState?: StockStateCode;
}

export type ParseFailureReason =
  | 'no_price_found'
  | 'parse_error'
  | 'login_required'
  | 'cart_only'
  | 'blocked'
  | 'timeout';

export type ParseResult =
  | { ok: true; product: ExtractedProduct; tier: ParseTier; confidence: number }
  | { ok: false; reason: ParseFailureReason; tier: 4 };

export type CheckResult =
  | { status: 'ok'; product: ExtractedProduct }
  | { status: 'blocked' }
  | { status: 'error'; message: string }
  | { status: 'unchanged' };
