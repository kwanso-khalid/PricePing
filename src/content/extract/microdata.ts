import type { ExtractedProduct } from '../../types/index.js';
import { parsePrice } from '../../lib/money.js';
import { createLogger } from '../../lib/logger.js';

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

  const inStock =
    !availabilityStr ||
    availabilityStr.includes('InStock') ||
    availabilityStr.includes('in stock');

  return {
    title: titleStr,
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    confidence: 0.8,
    method: 'microdata',
  };
}
