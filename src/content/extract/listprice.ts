import type { Money } from '../../types/index.js';
import { normalizeMoney } from '../../lib/money.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('extract:listprice');

/**
 * Keywords whose presence in a class/id/data attribute strongly suggest an
 * advertised "was" / strikethrough / list price element.
 */
const LIST_PRICE_KEYWORDS = /\b(was|original|compare|regular|list|before|rrp|msrp|retail|crossed|strike|through|old)\b/i;

/**
 * Selectors for elements likely containing the advertised list price.
 * Ordered from most specific to least specific.
 */
const LIST_PRICE_SELECTORS = [
  '[class*="was-price"]',
  '[class*="original-price"]',
  '[class*="compare-price"]',
  '[class*="regular-price"]',
  '[class*="list-price"]',
  '[class*="rrp"]',
  '[class*="msrp"]',
  '[class*="retail-price"]',
  '[class*="crossed"]',
  '[class*="strikethrough"]',
  '[class*="strike"]',
  's[class*="price"]',
  'del[class*="price"]',
  's',
  'del',
  '[data-price-type="oldPrice"]',
  '[data-price-was]',
];

/**
 * Attempt to extract the advertised list ("was") price from the DOM.
 *
 * Rules:
 *  - The candidate element must match a list-price keyword in its class/id/data attributes.
 *  - Its parsed price must be strictly greater than currentPriceMinor (discount implies list > current).
 *  - Same currency as current price.
 *  - Never returns a value if currentPriceMinor === 0.
 */
export function extractListPrice(
  doc: Document,
  currentPriceMinor: number,
  currency: string,
): Money | null {
  if (currentPriceMinor <= 0) return null;

  const candidates: Element[] = [];

  for (const selector of LIST_PRICE_SELECTORS) {
    try {
      const els = doc.querySelectorAll(selector);
      for (const el of els) {
        candidates.push(el);
      }
    } catch {
      // Bad selector on unusual pages — skip
    }
  }

  // De-duplicate while preserving order
  const seen = new Set<Element>();
  const unique: Element[] = [];
  for (const el of candidates) {
    if (!seen.has(el)) {
      seen.add(el);
      unique.push(el);
    }
  }

  for (const el of unique) {
    // Require list-price keyword in class, id, or data attributes
    const className = el.className ?? '';
    const id = el.id ?? '';
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}=${a.value}`)
      .join(' ');

    const hasKeyword =
      LIST_PRICE_KEYWORDS.test(typeof className === 'string' ? className : '') ||
      LIST_PRICE_KEYWORDS.test(id) ||
      LIST_PRICE_KEYWORDS.test(attrs) ||
      el.tagName === 'S' ||
      el.tagName === 'DEL';

    if (!hasKeyword) continue;

    const text =
      el.getAttribute('content') ??
      el.getAttribute('data-price-was') ??
      el.textContent?.trim() ??
      '';

    if (!text) continue;

    const money = normalizeMoney(text, currency);
    if (!money) continue;
    if (money.currency !== currency) continue;
    if (money.amountMinor <= currentPriceMinor) continue;

    logger.debug('Found list price', { text, amountMinor: money.amountMinor });
    return money;
  }

  return null;
}
