import type { ExtractedProduct } from '../../types/index.js';
import { extractFromJsonLd } from './jsonld.js';
import { extractFromOpenGraph } from './opengraph.js';
import { extractFromMicrodata } from './microdata.js';
import { extractWithAdapter } from './adapters/index.js';
import { extractGeneric } from './adapters/generic.js';
import { detectPlatform } from './platform/detect.js';
import { extractFromShopify } from './platform/shopify.js';
import { extractFromWooCommerce } from './platform/woocommerce.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('extract');

export const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Run all synchronous extraction strategies and return the best result.
 * Order: adapter > jsonld > microdata > opengraph > generic
 */
export function extractProduct(document: Document, hostname: string): ExtractedProduct | null {
  const strategies: Array<{ name: string; fn: () => ExtractedProduct | null }> = [
    { name: 'adapter', fn: () => extractWithAdapter(document, hostname) },
    { name: 'jsonld', fn: () => extractFromJsonLd(document) },
    { name: 'microdata', fn: () => extractFromMicrodata(document) },
    { name: 'opengraph', fn: () => extractFromOpenGraph(document) },
    { name: 'generic', fn: () => extractGeneric(document) },
  ];

  let bestResult: ExtractedProduct | null = null;

  for (const { name, fn } of strategies) {
    try {
      const result = fn();
      if (result) {
        logger.debug(`Strategy "${name}" succeeded`, { confidence: result.confidence });
        if (!bestResult || result.confidence > bestResult.confidence) {
          bestResult = result;
        }
        // If we have high confidence, stop early
        if (result.confidence >= 0.9) {
          break;
        }
      }
    } catch (e) {
      logger.warn(`Strategy "${name}" threw`, { error: String(e) });
    }
  }

  if (bestResult) {
    logger.info('Extraction complete', {
      method: bestResult.method,
      confidence: bestResult.confidence,
      title: bestResult.title.substring(0, 50),
    });
  } else {
    logger.info('No extraction strategy succeeded');
  }

  return bestResult;
}

/**
 * Async extraction pipeline: runs sync tiers first, then attempts Tier 2
 * platform endpoint fetches if confidence is below 0.9.
 *
 * Returns a Promise so the content script can await it and the popup's
 * executeScript call (which auto-awaits a returned Promise in Chrome 105+)
 * gets the final result.
 */
export async function extractProductAsync(
  document: Document,
  hostname: string,
  url: string,
): Promise<ExtractedProduct | null> {
  // Run sync tiers first
  const syncResult = extractProduct(document, hostname);

  // If sync result has high confidence, no need for platform fetch
  if (syncResult && syncResult.confidence >= 0.9) {
    return syncResult;
  }

  // Tier 2: platform endpoint detection
  const platform = detectPlatform(document);
  logger.debug('Platform detected', { platform });

  if (platform === 'shopify') {
    try {
      const shopifyResult = await extractFromShopify(document, url);
      if (shopifyResult) {
        // Shopify data is authoritative — return it if it's better than sync result
        if (!syncResult || shopifyResult.confidence > syncResult.confidence) {
          logger.info('Shopify platform extraction succeeded', {
            confidence: shopifyResult.confidence,
            title: shopifyResult.title.substring(0, 50),
          });
          return shopifyResult;
        }
      }
    } catch (e) {
      logger.warn('Shopify extraction threw', { error: String(e) });
    }
  }

  if (platform === 'woocommerce') {
    try {
      const wcResult = await extractFromWooCommerce(document, url);
      if (wcResult) {
        if (!syncResult || wcResult.confidence > syncResult.confidence) {
          logger.info('WooCommerce platform extraction succeeded', {
            confidence: wcResult.confidence,
            title: wcResult.title.substring(0, 50),
          });
          return wcResult;
        }
      }
    } catch (e) {
      logger.warn('WooCommerce extraction threw', { error: String(e) });
    }
  }

  // Magento, BigCommerce, Wix: detection only

  return syncResult;
}

export { extractFromJsonLd, extractFromOpenGraph, extractFromMicrodata, extractWithAdapter };
