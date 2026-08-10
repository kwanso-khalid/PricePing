import type { ExtractedProduct } from '../../../types/index.js';
import { parsePrice } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('adapter:ebay');

export function extractFromEbay(document: Document): ExtractedProduct | null {
  // Title
  const titleEl = document.querySelector(
    'h1.x-item-title__mainTitle span, h1[class*="it-ttl"], #itemTitle',
  );
  const title = titleEl?.textContent?.trim()?.replace(/^Details about\s*/i, '');
  if (!title) return null;

  // Price
  const priceSelectors = [
    '.x-price-primary .ux-textspans',
    '.x-price-primary',
    '#prcIsum',
    '#mm-saleDscPrc',
    '[itemprop="price"]',
  ];

  let priceStr: string | null = null;
  for (const selector of priceSelectors) {
    const el = document.querySelector(selector);
    const text = el?.getAttribute('content') ?? el?.textContent?.trim();
    if (text) {
      priceStr = text;
      break;
    }
  }

  if (!priceStr) {
    logger.debug('eBay: could not find price element');
    return null;
  }

  const result = parsePrice(priceStr, 'USD');
  if (!result.ok) {
    logger.warn('eBay: failed to parse price', { priceStr, error: result.error });
    return null;
  }

  // Image
  const imgEl = document.querySelector(
    '#icImg, .ux-image-carousel-item.active img, img#icImg',
  );
  const imageUrl = imgEl?.getAttribute('src') ?? null;

  // Availability
  const quantityEl = document.querySelector(
    '#qtySubTxt, .x-quantity__availability',
  );
  const quantityText = quantityEl?.textContent?.trim()?.toLowerCase() ?? '';
  const inStock = !quantityText.includes('sold') && !quantityText.includes('unavailable');

  return {
    title,
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    confidence: 0.92,
    method: 'adapter',
  };
}
