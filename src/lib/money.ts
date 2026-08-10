import type { Money, CurrencyCode } from '../types/index.js';
import { ok, err } from './result.js';
import type { Result } from './result.js';

/**
 * Minor unit multipliers for currencies that don't use 2 decimal places.
 * Default is 100 (2 decimal places).
 */
const MINOR_UNIT_MULTIPLIERS: Record<string, number> = {
  // Zero decimal currencies
  BIF: 1,
  CLP: 1,
  DJF: 1,
  GNF: 1,
  ISK: 1,
  JPY: 1,
  KMF: 1,
  KRW: 1,
  MGA: 1,
  PYG: 1,
  RWF: 1,
  UGX: 1,
  UYI: 1,
  VND: 1,
  VUV: 1,
  XAF: 1,
  XOF: 1,
  XPF: 1,
  // Three decimal currencies
  BHD: 1000,
  IQD: 1000,
  JOD: 1000,
  KWD: 1000,
  LYD: 1000,
  OMR: 1000,
  TND: 1000,
};

export function getMinorUnitMultiplier(currency: CurrencyCode): number {
  return MINOR_UNIT_MULTIPLIERS[currency.toUpperCase()] ?? 100;
}

/**
 * Parse a price string into minor units (integer).
 *
 * Format detection rules (applied in order):
 * 1. Zero-decimal currencies: strip all separators, treat as integer
 * 2. Space thousands separator (e.g. "1 234,56"): strip spaces, convert comma→period
 * 3. Unambiguous European (period-thousands + comma-decimal): "1.234,56" → 1234.56
 * 4. Unambiguous standard (comma-thousands + period-decimal): "1,234.56" → 1234.56
 * 5. Single separator ambiguity: use position of last sep to decide
 *    - Single comma with 1-2 digits after → decimal ("1,99" → 1.99)
 *    - Single comma with 3 digits after → thousands ("1,980" → 1980)
 *    - Single period with 1-2 digits after → decimal ("49.99" → 49.99)
 *    - Single period with 3 digits after → thousands ("1.980" → 1980)
 */
export function parsePrice(
  input: string,
  currency: CurrencyCode = 'USD',
): Result<Money, string> {
  if (!input || typeof input !== 'string') {
    return err('Empty or invalid price input');
  }

  const trimmed = input.trim();

  // Extract currency from symbol if not provided explicitly
  const detectedCurrency = detectCurrencyFromSymbol(trimmed) ?? currency;
  const isZeroDecimal = getMinorUnitMultiplier(detectedCurrency) === 1;

  // Strip currency symbols and codes
  let normalized = trimmed
    .replace(/^\p{Sc}+/u, '') // Leading currency symbols (Unicode category Sc)
    .replace(/\p{Sc}+$/u, '') // Trailing currency symbols
    .replace(/^(Rs\.?|USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|HKD|SGD|NZD|MXN|SEK|NOK|DKK|PLN|HUF|CZK|RON|KRW|BRL|ZAR|TRY|RUB|THB|IDR|MYR|PHP|VND)\s*/i, '') // Leading currency codes
    .replace(/\s*(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|HKD|SGD|NZD|MXN|SEK|NOK|DKK|PLN|HUF|CZK|RON|KRW|BRL|ZAR|TRY|RUB|THB|IDR|MYR|PHP|VND)$/i, '') // Trailing currency codes
    .trim();

  // Handle negative prices
  if (normalized.startsWith('-')) {
    return err(`Cannot parse price: "${input}"`);
  }

  if (!normalized) {
    return err(`Cannot parse price: "${input}"`);
  }

  let amount: number;

  if (isZeroDecimal) {
    // Zero decimal currencies: commas and periods are always thousands separators
    const stripped = normalized.replace(/[,.\s]/g, '');
    amount = parseFloat(stripped);
  } else if (/^\d[\d\s]+[,]\d{2}$/.test(normalized)) {
    // Space-separated thousands with 2-digit comma decimal: "1 234,56"
    normalized = normalized.replace(/\s/g, '').replace(',', '.');
    amount = parseFloat(normalized);
  } else if (/^\d{1,3}(\.\d{3})+(,\d{1,3})?$/.test(normalized)) {
    // Unambiguous European: period thousands + optional comma decimal: "1.234,56" or "1.234"
    normalized = normalized.replace(/\./g, '').replace(',', '.');
    amount = parseFloat(normalized);
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    // Unambiguous standard: comma thousands + optional period decimal: "1,234.56" or "1,234"
    normalized = normalized.replace(/,/g, '');
    amount = parseFloat(normalized);
  } else {
    // Single separator or plain number
    const singleComma = /^(\d+),(\d+)$/.exec(normalized);
    const singlePeriod = /^(\d+)\.(\d+)$/.exec(normalized);

    if (singleComma) {
      const afterComma = singleComma[2] ?? '';
      if (afterComma.length === 3) {
        // "1,980" → thousands separator → 1980
        amount = parseFloat(normalized.replace(',', ''));
      } else {
        // "1,99" or "19,99" → decimal → 1.99 or 19.99
        amount = parseFloat(normalized.replace(',', '.'));
      }
    } else if (singlePeriod) {
      const afterPeriod = singlePeriod[2] ?? '';
      if (afterPeriod.length === 3) {
        // "1.980" → ambiguous - default to thousands for non-European (period=decimal is more common for prices)
        // Actually "1.980" with 3 digits after period more likely means 1980 in European context
        // But "49.999" price would be unusual. Standard case: treat 3-digit period as thousands
        amount = parseFloat(normalized.replace('.', ''));
      } else {
        // "49.99" → decimal
        amount = parseFloat(normalized);
      }
    } else {
      // Plain integer or other format
      const stripped = normalized.replace(/[^\d.,]/g, '');
      if (!stripped) {
        return err(`Cannot parse price: "${input}"`);
      }
      // Last resort: period is decimal
      amount = parseFloat(stripped.replace(/,/g, ''));
    }
  }

  if (isNaN(amount) || amount < 0) {
    return err(`Cannot parse price: "${input}"`);
  }

  const multiplier = getMinorUnitMultiplier(detectedCurrency);
  const amountMinor = Math.round(amount * multiplier);

  return ok({ amountMinor, currency: detectedCurrency });
}

function detectCurrencyFromSymbol(input: string): CurrencyCode | null {
  const symbolMap: Array<[RegExp, CurrencyCode]> = [
    [/^HK\$/, 'HKD'],
    [/^S\$/, 'SGD'],
    [/^A\$/, 'AUD'],
    [/^C\$/, 'CAD'],
    [/^\$/, 'USD'],
    [/^£/, 'GBP'],
    [/^€/, 'EUR'],
    [/€$/, 'EUR'],
    [/^¥/, 'JPY'],
    [/^₹/, 'INR'],
    [/^Rs\.?\s*/i, 'INR'],
  ];

  for (const [pattern, code] of symbolMap) {
    if (pattern.test(input)) {
      return code;
    }
  }
  return null;
}

export function formatMoney(money: Money): string {
  const multiplier = getMinorUnitMultiplier(money.currency);
  const amount = money.amountMinor / multiplier;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: money.currency,
      minimumFractionDigits: multiplier === 1 ? 0 : 2,
      maximumFractionDigits: multiplier === 1 ? 0 : multiplier === 1000 ? 3 : 2,
    }).format(amount);
  } catch {
    // Fallback for unknown currency codes
    return `${money.currency} ${amount.toFixed(2)}`;
  }
}

export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot compare prices in different currencies: ${a.currency} vs ${b.currency}`,
    );
  }
  return a.amountMinor - b.amountMinor;
}

export function isLessThan(a: Money, b: Money): boolean {
  return compareMoney(a, b) < 0;
}

export function isLessThanOrEqual(a: Money, b: Money): boolean {
  return compareMoney(a, b) <= 0;
}

export function sameCurrency(a: Money, b: Money): boolean {
  return a.currency === b.currency;
}

export function priceDifferencePercent(from: Money, to: Money): number {
  if (!sameCurrency(from, to)) {
    throw new Error('Cannot compute difference across currencies');
  }
  if (from.amountMinor === 0) return 0;
  return ((to.amountMinor - from.amountMinor) / from.amountMinor) * 100;
}

export function moneyFromMinor(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor, currency };
}
