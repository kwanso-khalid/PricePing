import type { ExtractedProduct, Money } from '../../../types/index.js';
import type { StockStateCode } from '../../../types/storage.js';
import { moneyFromMinor } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('platform:shopify');

interface ShopifyVariant {
  price: number;
  compare_at_price: number | null;
  available: boolean;
}

interface ShopifyProductJson {
  title: string;
  featured_image: string | null;
  available: boolean;
  variants: ShopifyVariant[];
}

/**
 * Attempt to extract product data from the Shopify product JSON endpoint.
 *
 * Shopify exposes `{path}.js` which returns machine-readable product data
 * including the compare_at_price (advertised "was" price).
 *
 * Same-origin only: we only fetch relative URLs derived from the current page path.
 * If the product JSON is unavailable or the fetch fails, returns null.
 */
export async function extractFromShopify(
  doc: Document,
  url: string,
): Promise<ExtractedProduct | null> {
  const parsed = new URL(url);
  const pathname = parsed.pathname;

  // Shopify product JSON endpoints are at /products/<handle>.js
  // If we're not on a /products/ path, try appending .js to current path.
  // Only attempt if path looks like a product page.
  let jsonPath: string;
  if (pathname.endsWith('.js')) {
    jsonPath = pathname;
  } else {
    jsonPath = pathname.replace(/\/$/, '') + '.js';
  }

  const jsonUrl = `${parsed.origin}${jsonPath}`;

  logger.debug('Fetching Shopify product JSON', { jsonUrl });

  let productData: ShopifyProductJson;
  try {
    const response = await fetch(jsonUrl, {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      logger.debug('Shopify JSON fetch failed', { status: response.status });
      return null;
    }
    const json: unknown = await response.json();
    if (!isShopifyProductJson(json)) {
      logger.debug('Shopify JSON does not match expected shape');
      return null;
    }
    productData = json;
  } catch (e) {
    logger.debug('Shopify JSON fetch threw', { error: String(e) });
    return null;
  }

  const variant = productData.variants[0];
  if (!variant) {
    logger.debug('Shopify product has no variants');
    return null;
  }

  // Shopify prices are in the store's currency, in cents (minor units for 2-decimal currencies).
  // The currency is not in the .js response — derive from og:price:currency or default USD.
  const ogCurrency =
    doc.querySelector('meta[property="og:price:currency"]')?.getAttribute('content') ??
    doc.querySelector('meta[property="product:price:currency"]')?.getAttribute('content') ??
    'USD';

  const currency = ogCurrency.trim().toUpperCase();

  const priceMinor = variant.price; // already in minor units
  if (typeof priceMinor !== 'number' || isNaN(priceMinor) || priceMinor < 0) {
    logger.warn('Shopify: invalid price value', { price: variant.price });
    return null;
  }

  const price: Money = moneyFromMinor(priceMinor, currency);

  let advertisedListPrice: Money | null = null;
  if (typeof variant.compare_at_price === 'number' && variant.compare_at_price > priceMinor) {
    advertisedListPrice = moneyFromMinor(variant.compare_at_price, currency);
  }

  // Stock state
  const stockState: StockStateCode = productData.available ? 1 : 2;

  // Image: featured_image may be protocol-relative
  let imageUrl: string | null = null;
  if (productData.featured_image) {
    const img = productData.featured_image;
    imageUrl = img.startsWith('//') ? `https:${img}` : img;
  }

  return {
    title: productData.title.trim(),
    price,
    imageUrl,
    currency,
    inStock: productData.available,
    advertisedListPrice,
    confidence: 0.92,
    method: 'shopify',
    stockState,
  };
}

function isShopifyProductJson(v: unknown): v is ShopifyProductJson {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj['title'] !== 'string') return false;
  if (!Array.isArray(obj['variants'])) return false;
  return true;
}
