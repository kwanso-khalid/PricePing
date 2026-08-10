import type { ExtractedProduct } from '../../types/index.js';
import { parsePrice } from '../../lib/money.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('extract:opengraph');

function getMeta(doc: Document, ...properties: string[]): string | null {
  for (const property of properties) {
    const el =
      doc.querySelector(`meta[property="${property}"]`) ??
      doc.querySelector(`meta[name="${property}"]`);
    const content = el?.getAttribute('content');
    if (content) return content.trim();
  }
  return null;
}

export function extractFromOpenGraph(document: Document): ExtractedProduct | null {
  const priceStr = getMeta(
    document,
    'og:price:amount',
    'product:price:amount',
    'twitter:data1',
  );

  if (!priceStr) return null;

  const currencyRaw = getMeta(
    document,
    'og:price:currency',
    'product:price:currency',
    'og:price:currency_code',
  ) ?? 'USD';

  const result = parsePrice(priceStr, currencyRaw);
  if (!result.ok) {
    logger.warn('Failed to parse OpenGraph price', { priceStr, error: result.error });
    return null;
  }

  const title =
    getMeta(document, 'og:title') ??
    document.title ??
    null;

  if (!title) return null;

  const imageUrl = getMeta(document, 'og:image', 'og:image:url');

  const availabilityStr = getMeta(document, 'og:availability', 'product:availability') ?? '';
  const inStock =
    !availabilityStr ||
    availabilityStr.toLowerCase().includes('in stock') ||
    availabilityStr.toLowerCase().includes('instock');

  return {
    title: title.trim(),
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    confidence: 0.75,
    method: 'opengraph',
  };
}
