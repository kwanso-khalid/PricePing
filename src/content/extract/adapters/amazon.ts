import type { ExtractedProduct } from '../../../types/index.js';
import { parsePrice } from '../../../lib/money.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('adapter:amazon');

export function extractFromAmazon(document: Document): ExtractedProduct | null {
  // Title
  const titleEl = document.querySelector('#productTitle, #title');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  // Price - Amazon uses various selectors depending on item type
  const priceSelectors = [
    '.priceToPay .a-offscreen',
    '.priceToPay',
    '#corePrice_feature_div .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '.apexPriceToPay .a-offscreen',
    '#price_inside_buybox',
    '.a-price .a-offscreen',
  ];

  let priceStr: string | null = null;
  for (const selector of priceSelectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim() ?? el?.getAttribute('content');
    if (text && text.length > 0) {
      priceStr = text;
      break;
    }
  }

  if (!priceStr) {
    logger.debug('Amazon: could not find price element');
    return null;
  }

  // Detect currency from page locale
  const htmlLang = document.documentElement.getAttribute('lang') ?? 'en-US';
  let defaultCurrency = 'USD';
  if (htmlLang.startsWith('en-GB') || document.location?.hostname?.endsWith('.co.uk')) {
    defaultCurrency = 'GBP';
  } else if (htmlLang.startsWith('de') || document.location?.hostname?.endsWith('.de')) {
    defaultCurrency = 'EUR';
  } else if (htmlLang.startsWith('ja') || document.location?.hostname?.endsWith('.co.jp')) {
    defaultCurrency = 'JPY';
  } else if (document.location?.hostname?.endsWith('.in')) {
    defaultCurrency = 'INR';
  } else if (document.location?.hostname?.endsWith('.ca')) {
    defaultCurrency = 'CAD';
  }

  const result = parsePrice(priceStr, defaultCurrency);
  if (!result.ok) {
    logger.warn('Amazon: failed to parse price', { priceStr, error: result.error });
    return null;
  }

  // Image
  const imgEl = document.querySelector(
    '#landingImage, #imgTagWrapperId img, #main-image-container img',
  );
  const imageUrl =
    imgEl?.getAttribute('data-old-hires') ??
    imgEl?.getAttribute('data-a-dynamic-image')
      ? null // dynamic-image is JSON, skip
      : imgEl?.getAttribute('src') ?? null;

  // Availability
  const availabilityEl = document.querySelector('#availability span');
  const availabilityText = availabilityEl?.textContent?.trim()?.toLowerCase() ?? '';
  const inStock =
    !availabilityText ||
    availabilityText.includes('in stock') ||
    availabilityText.includes('in stock soon');

  return {
    title,
    price: result.value,
    imageUrl,
    currency: result.value.currency,
    inStock,
    confidence: 0.95,
    method: 'adapter',
  };
}
