import type { ExtractedProduct } from '../../types/index.js';
import { extractFromJsonLd } from './jsonld.js';
import { extractFromOpenGraph } from './opengraph.js';
import { extractFromMicrodata } from './microdata.js';
import { extractWithAdapter } from './adapters/index.js';
import { extractGeneric } from './adapters/generic.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('extract');

export const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Run all extraction strategies and return the best result.
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

export { extractFromJsonLd, extractFromOpenGraph, extractFromMicrodata, extractWithAdapter };
