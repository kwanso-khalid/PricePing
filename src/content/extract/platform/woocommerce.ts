import type { ExtractedProduct, Money } from '../../../types/index.js';
import type { StockStateCode } from '../../../types/storage.js';
import { moneyFromMinor } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('platform:woocommerce');

interface WcProduct {
  id: number;
  name: string;
  slug: string;
  price: string;           // current price as string (no decimals for most currencies)
  regular_price: string;   // "was" price
  sale_price: string;
  stock_status: string;    // 'instock' | 'outofstock' | 'onbackorder'
  images: Array<{ src: string }>;
}

/**
 * Attempt to extract product data from the WooCommerce REST Store API.
 *
 * WooCommerce sites expose /wp-json/wc/store/v1/products?slug=<slug>
 * which returns machine-readable product data including the regular_price
 * ("was" price) and stock_status.
 *
 * Only works for same-origin WooCommerce stores. If the endpoint is
 * unavailable or the fetch fails, returns null.
 */
export async function extractFromWooCommerce(
  doc: Document,
  url: string,
): Promise<ExtractedProduct | null> {
  const parsed = new URL(url);

  // Derive product slug from the URL path. WooCommerce product pages are
  // typically at /product/<slug>/ or /?product=<slug>.
  const slug = getProductSlug(parsed);
  if (!slug) {
    logger.debug('WooCommerce: could not derive product slug from URL');
    return null;
  }

  const apiUrl = `${parsed.origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}&_fields=id,name,price,regular_price,sale_price,stock_status,images`;

  logger.debug('Fetching WooCommerce product', { apiUrl });

  let productData: WcProduct;
  try {
    const response = await fetch(apiUrl, {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      logger.debug('WooCommerce API fetch failed', { status: response.status });
      return null;
    }
    const json: unknown = await response.json();
    const arr = Array.isArray(json) ? json : null;
    if (!arr || arr.length === 0 || !isWcProduct(arr[0])) {
      logger.debug('WooCommerce API response did not match expected shape');
      return null;
    }
    productData = arr[0] as WcProduct;
  } catch (e) {
    logger.debug('WooCommerce API fetch threw', { error: String(e) });
    return null;
  }

  // Currency: WooCommerce REST API does not include currency in this endpoint;
  // derive from og:price:currency meta or WooCommerce's own data in the page.
  const currency = deriveCurrency(doc);

  const priceMinor = parsePriceCents(productData.price);
  if (priceMinor === null || priceMinor < 0) {
    logger.warn('WooCommerce: invalid price', { price: productData.price });
    return null;
  }

  const price: Money = moneyFromMinor(priceMinor, currency);

  // Advertised list price = regular_price when a sale is active
  let advertisedListPrice: Money | null = null;
  const regularMinor = parsePriceCents(productData.regular_price);
  if (regularMinor !== null && regularMinor > priceMinor) {
    advertisedListPrice = moneyFromMinor(regularMinor, currency);
  }

  const stockState: StockStateCode =
    productData.stock_status === 'instock' ? 1
    : productData.stock_status === 'outofstock' ? 2
    : productData.stock_status === 'onbackorder' ? 3
    : 0;

  const imageUrl = productData.images[0]?.src ?? null;

  return {
    title: productData.name.trim(),
    price,
    imageUrl,
    currency,
    inStock: stockState === 1,
    advertisedListPrice,
    confidence: 0.90,
    method: 'woocommerce',
    stockState,
  };
}

function getProductSlug(parsed: URL): string | null {
  // /product/<slug>/ or /shop/<slug>/
  const m = parsed.pathname.match(/\/(?:product|shop)\/([^/]+)/);
  if (m) return m[1] ?? null;

  // /?product=<slug> query param
  const qs = parsed.searchParams.get('product');
  if (qs) return qs;

  // Last path segment as fallback
  const seg = parsed.pathname.replace(/\/$/, '').split('/').pop();
  return seg && seg.length > 2 ? seg : null;
}

/** Parse a WooCommerce price string (e.g. "29.99", "2999") into minor units. */
function parsePriceCents(s: string): number | null {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return null;
  // WooCommerce price strings already include the decimal for 2-decimal currencies
  return Math.round(n * 100);
}

function deriveCurrency(doc: Document): string {
  return (
    doc.querySelector('meta[property="og:price:currency"]')?.getAttribute('content') ??
    doc.querySelector('meta[property="product:price:currency"]')?.getAttribute('content') ??
    'USD'
  ).trim().toUpperCase();
}

function isWcProduct(v: unknown): v is WcProduct {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o['name'] === 'string' && typeof o['price'] === 'string';
}
