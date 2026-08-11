import type { ExtractedProduct } from '../../../types/index.js';
import { parsePrice } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';
import { parseStockState, stockStateToInStock } from '../stockstate.js';

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
  const quantityText = quantityEl?.textContent?.trim() ?? '';
  const stockState = parseStockState(
    quantityText.includes('sold') || quantityText.includes('unavailable')
      ? 'out of stock'
      : quantityText || 'in stock',
  );
  const inStock = stockStateToInStock(stockState);

  // Advertised list price ("was" / original price)
  // eBay shows struck-through original price in .ORIGINAL_PRICE or x-price-primary--strikethrough
  let advertisedListPrice = null;
  const listPriceSelectors = [
    '.ORIGINAL_PRICE',
    '[data-testid="x-price-primary--strikethrough"]',
    '.x-price-was .ux-textspans',
    '.x-price-original',
    '.vi-price-np .notranslate',
  ];

  for (const selector of listPriceSelectors) {
    const el = document.querySelector(selector);
    const text = el?.getAttribute('content') ?? el?.textContent?.trim();
    if (text) {
      const listResult = parsePrice(text, result.value.currency);
      if (listResult.ok && listResult.value.amountMinor > result.value.amountMinor) {
        advertisedListPrice = listResult.value;
        break;
      }
    }
  }

  return {
    title,
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    advertisedListPrice,
    confidence: 0.92,
    method: 'adapter',
    stockState,
  };
}
