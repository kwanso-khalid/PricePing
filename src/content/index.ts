/**
 * Content script - injected on demand via chrome.scripting.executeScript.
 * Runs extraction and sends result back.
 */
import { extractProduct } from './extract/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('content');

function getHostname(): string {
  return window.location.hostname.replace(/^www\./, '');
}

function runExtraction(): unknown {
  const hostname = getHostname();
  logger.info('Running extraction', { url: window.location.href, hostname });

  const result = extractProduct(document, hostname);

  if (!result) {
    logger.info('No product found on this page');
    return { success: false, product: null };
  }

  logger.info('Product extracted', { title: result.title, confidence: result.confidence });
  return { success: true, product: result };
}

// Store result in the extension's isolated-world window so the popup
// can retrieve it with a second executeScript({ func }) call.
// We cannot rely on executeScript({ files }) returning the value because
// Rollup's IIFE wrapper makes the script's completion value undefined.
(window as unknown as Record<string, unknown>)['__pricewatch_result__'] =
  runExtraction();
