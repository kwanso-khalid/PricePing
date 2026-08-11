import type { ExtractedProduct, Money } from '../../types/index.js';
import type { StockStateCode } from '../../types/storage.js';
import { parsePrice } from '../../lib/money.js';
import { createLogger } from '../../lib/logger.js';
import { parseStockState, stockStateToInStock } from './stockstate.js';

const logger = createLogger('extract:jsonld');

interface PriceSpecification {
  '@type'?: string;
  priceType?: string;
  price?: number | string;
  priceCurrency?: string;
}

interface JsonLdOffer {
  '@type'?: string;
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
  lowPrice?: string | number;
  highPrice?: string | number;
  offers?: JsonLdOffer | JsonLdOffer[];
  priceSpecification?: PriceSpecification | PriceSpecification[];
}

interface JsonLdProduct {
  '@type'?: string | string[];
  name?: string;
  description?: string;
  image?: string | string[] | { url?: string };
  offers?: JsonLdOffer | JsonLdOffer[];
  price?: string | number;
  priceCurrency?: string;
}

interface JsonLdGraph {
  '@graph'?: JsonLdProduct[];
}

function isProduct(node: JsonLdProduct): boolean {
  const type = node['@type'];
  if (Array.isArray(type)) {
    return type.some((t) => t === 'Product' || t === 'IndividualProduct' || t === 'ProductModel');
  }
  return (
    type === 'Product' || type === 'IndividualProduct' || type === 'ProductModel'
  );
}

function resolveOffer(offers: JsonLdOffer | JsonLdOffer[] | undefined): JsonLdOffer | null {
  if (!offers) return null;
  if (Array.isArray(offers)) {
    // Pick the first offer that has a price
    return offers.find((o) => o.price !== undefined || o.lowPrice !== undefined) ?? null;
  }
  return offers;
}

function extractImage(image: JsonLdProduct['image']): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return image[0] ?? null;
  if (typeof image === 'object' && image.url) return image.url;
  return null;
}

/**
 * Extract advertised list price from priceSpecification array/object.
 * Looks for an entry with priceType containing "List" or "MSRP".
 */
function extractListPriceFromSpec(
  spec: PriceSpecification | PriceSpecification[] | undefined,
  currency: string,
): Money | null {
  if (!spec) return null;
  const specs = Array.isArray(spec) ? spec : [spec];
  for (const s of specs) {
    const type = (s.priceType ?? '').toLowerCase();
    if (type.includes('list') || type.includes('msrp') || type.includes('rrp')) {
      const raw = s.price;
      if (raw === undefined || raw === null) continue;
      const priceStr = String(raw);
      const cur = s.priceCurrency ?? currency;
      const result = parsePrice(priceStr, cur);
      if (result.ok) return result.value;
    }
  }
  return null;
}

function parseJsonLdNode(node: JsonLdProduct): ExtractedProduct | null {
  if (!isProduct(node)) return null;

  const title = node.name;
  if (!title) return null;

  const offer = resolveOffer(node.offers);
  const priceRaw = offer?.price ?? offer?.lowPrice ?? node.price;
  const currencyRaw = offer?.priceCurrency ?? node.priceCurrency ?? 'USD';

  if (priceRaw === undefined || priceRaw === null) return null;

  const priceStr = String(priceRaw);
  const result = parsePrice(priceStr, currencyRaw);
  if (!result.ok) {
    logger.warn('Failed to parse JSON-LD price', { priceStr, error: result.error });
    return null;
  }

  const availability = offer?.availability ?? '';
  const stockState: StockStateCode = parseStockState(availability);
  const inStock = stockStateToInStock(stockState);

  const imageUrl = extractImage(node.image);

  // --- Advertised list price ---
  let advertisedListPrice: Money | null = null;

  // 1. priceSpecification with priceType=ListPrice
  if (!advertisedListPrice && offer?.priceSpecification) {
    advertisedListPrice = extractListPriceFromSpec(offer.priceSpecification, result.value.currency);
  }

  // 2. AggregateOffer: if offer has lowPrice and highPrice, highPrice might be list price
  //    but this is ambiguous — only use if the offer type is explicitly AggregateOffer
  //    and we haven't found a list price yet. Skip: too unreliable.

  return {
    title: String(title),
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    advertisedListPrice,
    confidence: 0.9,
    method: 'jsonld',
    stockState,
  };
}

export function extractFromJsonLd(document: Document): ExtractedProduct | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    const content = script.textContent;
    if (!content) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      logger.debug('Failed to parse JSON-LD script', { error: String(e) });
      continue;
    }

    // Handle @graph wrapper
    const withGraph = parsed as JsonLdGraph;
    const graph = withGraph['@graph'];
    if (graph && Array.isArray(graph)) {
      for (const node of graph) {
        const result = parseJsonLdNode(node);
        if (result) return result;
      }
    }

    // Handle array at root
    if (Array.isArray(parsed)) {
      const nodes = parsed as JsonLdProduct[];
      for (const node of nodes) {
        const result = parseJsonLdNode(node);
        if (result) return result;
      }
    }

    // Handle single object
    if (typeof parsed === 'object' && parsed !== null) {
      const result = parseJsonLdNode(parsed);
      if (result) return result;
    }
  }

  return null;
}
