import type { ExtractedProduct } from '../../types/index.js';
import { parsePrice } from '../../lib/money.js';
import { createLogger } from '../../lib/logger.js';
import { parseStockState, stockStateToInStock } from './stockstate.js';
import { extractListPrice } from './listprice.js';

const logger = createLogger('extract:microdata');

function getItemprop(scope: Element | Document, name: string): Element | null {
  return scope.querySelector(`[itemprop="${name}"]`);
}

function getItempropContent(scope: Element | Document, name: string): string | null {
  const el = getItemprop(scope, name);
  if (!el) return null;
  return el.getAttribute('content') ?? el.textContent?.trim() ?? null;
}

export function extractFromMicrodata(document: Document): ExtractedProduct | null {
  // Find Product scope
  const productScope = document.querySelector(
    '[itemtype*="schema.org/Product"], [itemtype*="schema.org/IndividualProduct"]',
  );

  let scope: Element | Document = document;
  if (productScope) {
    scope = productScope;
  }

  // Try to find offers scope within product
  const offersScope = scope === document
    ? document.querySelector('[itemtype*="schema.org/Offer"]')
    : scope.querySelector('[itemtype*="schema.org/Offer"]');

  const priceEl = offersScope
    ? getItemprop(offersScope, 'price')
    : getItemprop(scope, 'price');

  if (!priceEl) return null;

  const priceStr =
    priceEl.getAttribute('content') ??
    priceEl.getAttribute('data-price') ??
    priceEl.textContent?.trim() ??
    null;

  if (!priceStr) return null;

  const currencyEl = offersScope
    ? getItemprop(offersScope, 'priceCurrency')
    : getItemprop(scope, 'priceCurrency');

  const currencyRaw =
    currencyEl?.getAttribute('content') ??
    currencyEl?.textContent?.trim() ??
    'USD';

  const result = parsePrice(priceStr, currencyRaw);
  if (!result.ok) {
    logger.warn('Failed to parse microdata price', { priceStr, error: result.error });
    return null;
  }

  const titleStr = getItempropContent(scope, 'name');
  if (!titleStr) return null;

  const imageEl = getItemprop(scope, 'image');
  const imageUrl =
    imageEl?.getAttribute('src') ??
    imageEl?.getAttribute('content') ??
    imageEl?.getAttribute('href') ??
    null;

  const availabilityEl = offersScope
    ? getItemprop(offersScope, 'availability')
    : getItemprop(scope, 'availability');

  const availabilityStr =
    availabilityEl?.getAttribute('content') ??
    availabilityEl?.getAttribute('href') ??
    availabilityEl?.textContent?.trim() ??
    '';

  const stockState = parseStockState(availabilityStr);
  const inStock = stockStateToInStock(stockState);

  // Advertised list price: check highPrice itemprop (AggregateOffer), then DOM fallback
  let advertisedListPrice = null;
  const highPriceEl = offersScope
    ? getItemprop(offersScope, 'highPrice')
    : getItemprop(scope, 'highPrice');

  if (highPriceEl) {
    const highPriceStr =
      highPriceEl.getAttribute('content') ?? highPriceEl.textContent?.trim() ?? '';
    if (highPriceStr) {
      const highResult = parsePrice(highPriceStr, result.value.currency);
      if (highResult.ok && highResult.value.amountMinor > result.value.amountMinor) {
        advertisedListPrice = highResult.value;
      }
    }
  }

  // DOM fallback for list price
  if (!advertisedListPrice) {
    advertisedListPrice = extractListPrice(document, result.value.amountMinor, result.value.currency);
  }

  return {
    title: titleStr,
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    advertisedListPrice,
    confidence: 0.8,
    method: 'microdata',
    stockState,
  };
}
