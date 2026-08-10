import type { ExtractedProduct } from '../../../types/index.js';
import { parsePrice } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('adapter:generic');

// Selectors likely to contain price info (in priority order)
const PRICE_SELECTORS = [
  '[class*="price"]:not([class*="was"]):not([class*="old"]):not([class*="original"]):not([class*="compare"]):not([class*="strike"])',
  '[id*="price"]:not([id*="was"]):not([id*="old"])',
  '[data-testid*="price"]',
  '[data-automation*="price"]',
  '[data-price]',
  '.price',
  '#price',
];

const TITLE_SELECTORS = [
  'h1[class*="title"]',
  'h1[class*="name"]',
  'h1[class*="product"]',
  'h1',
  '[class*="product-title"]',
  '[class*="product-name"]',
  '[itemprop="name"]',
];

const PRICE_PATTERN = /[$£€¥₹]?\s*[\d,.]+(?:\.\d{2})?(?:\s*[A-Z]{3})?/;
const EXCLUDE_CLASSES = /\b(was|old|original|compare|strike|crossed|through|save|saved|discount)\b/i;

function isLikelyPrice(text: string): boolean {
  if (!text) return false;
  return PRICE_PATTERN.test(text) && text.length < 30;
}

function getElementText(el: Element): string {
  return el.getAttribute('content') ?? el.textContent?.trim() ?? '';
}

export function extractGeneric(document: Document): ExtractedProduct | null {
  // Try to find title
  let title: string | null = null;
  for (const selector of TITLE_SELECTORS) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && text.length > 2) {
      title = text;
      break;
    }
  }

  if (!title) {
    title = document.title || null;
  }

  if (!title) return null;

  // Try to find price
  let priceStr: string | null = null;
  for (const selector of PRICE_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const className = el.className;
      if (typeof className === 'string' && EXCLUDE_CLASSES.test(className)) continue;

      const text = getElementText(el);
      if (isLikelyPrice(text)) {
        priceStr = text;
        break;
      }
    }
    if (priceStr) break;
  }

  // Also check data-price attribute
  if (!priceStr) {
    const withDataPrice = document.querySelector('[data-price]');
    if (withDataPrice) {
      const val = withDataPrice.getAttribute('data-price');
      if (val && isLikelyPrice(val)) {
        priceStr = val;
      }
    }
  }

  if (!priceStr) {
    logger.debug('Generic: could not find price element');
    return null;
  }

  const result = parsePrice(priceStr, 'USD');
  if (!result.ok) {
    logger.warn('Generic: failed to parse price', { priceStr, error: result.error });
    return null;
  }

  // Image - try og:image first, then main product image
  const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  const mainImg = document.querySelector(
    'img[class*="product"], img[id*="product"], img[class*="main"]',
  );
  const imageUrl = ogImg ?? mainImg?.getAttribute('src') ?? null;

  return {
    title: title.substring(0, 200),
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock: true, // generic can't reliably detect this
    confidence: 0.4, // Low confidence - user should confirm
    method: 'adapter',
  };
}
