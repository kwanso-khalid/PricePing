import type { ExtractedProduct } from '../../../types/index.js';
import { extractFromAmazon } from './amazon.js';
import { extractFromEbay } from './ebay.js';

type AdapterFn = (document: Document) => ExtractedProduct | null;

interface AdapterEntry {
  hostnames: string[];
  extract: AdapterFn;
}

const ADAPTERS: AdapterEntry[] = [
  {
    hostnames: [
      'amazon.com',
      'amazon.co.uk',
      'amazon.de',
      'amazon.ca',
      'amazon.co.jp',
      'amazon.in',
      'amazon.fr',
      'amazon.es',
      'amazon.it',
      'amazon.com.au',
    ],
    extract: extractFromAmazon,
  },
  {
    hostnames: ['ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.com.au', 'ebay.ca'],
    extract: extractFromEbay,
  },
];

export function getAdapterForHostname(hostname: string): AdapterFn | null {
  // Normalize: strip www. prefix
  const normalized = hostname.replace(/^www\./, '');

  for (const adapter of ADAPTERS) {
    if (adapter.hostnames.some((h) => normalized === h || normalized.endsWith(`.${h}`))) {
      return adapter.extract;
    }
  }

  return null;
}

export function extractWithAdapter(
  document: Document,
  hostname: string,
): ExtractedProduct | null {
  const adapter = getAdapterForHostname(hostname);
  if (!adapter) return null;
  return adapter(document);
}
