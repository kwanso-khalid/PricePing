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

// Run and return result (for executeScript's return value)
runExtraction();
