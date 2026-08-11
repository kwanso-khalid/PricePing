import type { Product, ProductSummary, ObservationHistory } from '../types/storage.js';
import { formatMoney } from './money.js';

export interface ExportBundle {
  version: number;
  exportedAt: string;
  products: Product[];
  histories: Record<string, ObservationHistory>;
}

export function exportToJson(
  products: Product[],
  histories: Record<string, ObservationHistory>,
): string {
  const bundle: ExportBundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    products,
    histories,
  };
  return JSON.stringify(bundle, null, 2);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADERS = [
  'title',
  'retailer',
  'url',
  'currency',
  'current_price',
  'initial_price',
  'all_time_low',
  'all_time_high',
  'days_tracked',
  'observation_count',
  'parse_status',
  'parse_tier',
  'created_at',
  'last_checked_at',
] as const;

export function exportToCsv(summaries: ProductSummary[]): string {
  const rows: string[] = [CSV_HEADERS.join(',')];

  for (const s of summaries) {
    const currency = s.currency;
    const fmt = (minor: number) =>
      formatMoney({ amountMinor: minor, currency });
    const fmtNull = (minor: number | null) =>
      minor !== null ? fmt(minor) : '';

    const row = [
      csvEscape(s.title),
      csvEscape(s.retailerHost),
      csvEscape(s.url),
      s.currency,
      fmt(s.currentPrice),
      fmt(s.initialPriceMinor),
      fmtNull(s.stats.allTimeMin?.priceMinor ?? null),
      fmtNull(s.stats.allTimeMax?.priceMinor ?? null),
      String(Math.round(s.stats.daysTracked)),
      String(s.stats.observationCount),
      s.parseStatus,
      String(s.parseTier),
      new Date(s.createdAt).toISOString().split('T')[0] ?? '',
      s.lastCheckedAt
        ? (new Date(s.lastCheckedAt).toISOString().split('T')[0] ?? '')
        : '',
    ].join(',');

    rows.push(row);
  }

  return rows.join('\n');
}

export interface ImportResult {
  products: Product[];
  count: number;
}

function isProduct(obj: unknown): obj is Product {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' &&
    typeof p['url'] === 'string' &&
    typeof p['title'] === 'string' &&
    typeof p['currency'] === 'string' &&
    typeof p['currentPrice'] === 'number' &&
    typeof p['initialPriceMinor'] === 'number' &&
    typeof p['createdAt'] === 'number'
  );
}

export function importFromJson(text: string): Promise<ImportResult> {
  try {
    const result = parseImportData(text);
    return Promise.resolve(result);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

function parseImportData(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Import data must be an object');
  }

  const data = parsed as Record<string, unknown>;
  const productsRaw = data['products'];

  if (!Array.isArray(productsRaw)) {
    throw new Error('No products array found in import data');
  }

  const products: Product[] = [];
  for (const raw of productsRaw) {
    if (isProduct(raw)) {
      products.push(raw);
    }
  }

  return { products, count: products.length };
}
