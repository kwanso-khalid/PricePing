/**
 * Content script - injected on demand via chrome.scripting.executeScript.
 * Runs extraction and sends result back.
 *
 * Returns a Promise stored in window.__priceping_result__.
 * Chrome 105+ executeScript auto-awaits a returned Promise, so the popup's
 * second executeScript({ func: () => window.__priceping_result__ }) correctly
 * resolves to the final extracted value.
 */
import { extractProduct, extractProductAsync } from './extract/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('content');

function getHostname(): string {
  return window.location.hostname.replace(/^www\./, '');
}

/**
 * Wait for client-rendered prices to appear in the DOM.
 *
 * If quick sync extraction already has confidence >= 0.6, returns immediately.
 * Otherwise, sets up a MutationObserver with a hard 3s timeout. On each DOM
 * mutation batch (debounced 300ms), re-runs sync extraction. Resolves with the
 * best result seen, or null on timeout.
 */
async function waitForPriceWithObserver(
  hostname: string,
  maxWaitMs: number,
): Promise<unknown> {
  const quick = extractProduct(document, hostname);
  if (quick && quick.confidence >= 0.6) {
    return { success: true, product: quick };
  }

  return new Promise<unknown>((resolve) => {
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const timeout = setTimeout(() => {
      observer.disconnect();
      const result = extractProduct(document, hostname);
      resolve(
        result
          ? { success: true, product: result }
          : { success: false, product: null },
      );
    }, maxWaitMs);

    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const result = extractProduct(document, hostname);
        if (result && result.confidence >= 0.6) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve({ success: true, product: result });
        }
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

async function runExtraction(): Promise<unknown> {
  const hostname = getHostname();
  const url = window.location.href;
  logger.info('Running extraction', { url, hostname });

  // 1. Try async pipeline (sync tiers + platform endpoint)
  const asyncResult = await extractProductAsync(document, hostname, url);

  if (asyncResult && asyncResult.confidence >= 0.6) {
    logger.info('Product extracted (async pipeline)', {
      title: asyncResult.title,
      confidence: asyncResult.confidence,
    });
    return { success: true, product: asyncResult };
  }

  // 2. If low confidence or no result, wait for DOM mutations (SPA support)
  logger.info('Low confidence or no result, waiting for DOM mutations');
  const observerResult = await waitForPriceWithObserver(hostname, 3000);

  if (
    observerResult &&
    typeof observerResult === 'object' &&
    (observerResult as Record<string, unknown>)['success'] === true
  ) {
    const product = (observerResult as Record<string, unknown>)['product'];
    logger.info('Product extracted via MutationObserver', {
      title: (product as Record<string, unknown> | null)?.['title'],
    });
  } else {
    logger.info('No product found on this page after observer wait');
  }

  return observerResult ?? { success: false, product: null };
}

// Store a Promise in window.__priceping_result__.
// executeScript in Chrome 105+ auto-awaits a returned Promise, so the popup's
// retrieval of window.__priceping_result__ will receive the resolved value.
(window as unknown as Record<string, unknown>)['__priceping_result__'] =
  runExtraction();
