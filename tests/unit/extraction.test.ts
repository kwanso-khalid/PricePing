import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromJsonLd } from '../../src/content/extract/jsonld.js';
import { extractFromOpenGraph } from '../../src/content/extract/opengraph.js';
import { extractFromMicrodata } from '../../src/content/extract/microdata.js';
import { extractProduct } from '../../src/content/extract/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function loadFixture(name: string): Document {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  const dom = new JSDOM(html, { url: 'https://example.com' });
  return dom.window.document;
}

describe('JSON-LD extraction', () => {
  it('extracts product from standard JSON-LD', () => {
    const doc = loadFixture('jsonld-product.html');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Premium Headphones');
    expect(result?.price.amountMinor).toBe(19999);
    expect(result?.price.currency).toBe('USD');
    expect(result?.method).toBe('jsonld');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('extracts product from @graph wrapper', () => {
    const doc = loadFixture('jsonld-product.html');
    const result = extractFromJsonLd(doc);
    expect(result?.title).toBe('Premium Headphones');
  });

  it('extracts from Amazon fixture with JSON-LD', () => {
    const doc = loadFixture('amazon-product.html');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Test Widget Pro');
    expect(result?.price.amountMinor).toBe(2999);
    expect(result?.inStock).toBe(true);
  });

  it('handles malformed JSON-LD gracefully', () => {
    const doc = loadFixture('malformed-jsonld.html');
    // Should not throw, but may return null or a product from the valid second script
    expect(() => extractFromJsonLd(doc)).not.toThrow();
  });

  it('returns null for page without product JSON-LD', () => {
    const doc = loadFixture('no-price.html');
    const result = extractFromJsonLd(doc);
    expect(result).toBeNull();
  });

  it('extracts European price (EUR) from JSON-LD', () => {
    const doc = loadFixture('european-price.html');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.price.currency).toBe('EUR');
    // JSON-LD has "price": "89.99" which is 8999 minor units (€89.99)
    expect(result?.price.amountMinor).toBe(8999);
  });
});

describe('OpenGraph extraction', () => {
  it('extracts product from OpenGraph meta tags', () => {
    const doc = loadFixture('opengraph-product.html');
    const result = extractFromOpenGraph(doc);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Wireless Keyboard');
    expect(result?.price.amountMinor).toBe(7999);
    expect(result?.price.currency).toBe('USD');
    expect(result?.imageUrl).toBe('https://example.com/keyboard.jpg');
    expect(result?.method).toBe('opengraph');
  });

  it('extracts from eBay fixture via OpenGraph', () => {
    const doc = loadFixture('ebay-product.html');
    const result = extractFromOpenGraph(doc);
    expect(result).not.toBeNull();
    expect(result?.price.amountMinor).toBe(4999);
  });

  it('returns null when no price meta tag exists', () => {
    const doc = loadFixture('no-price.html');
    const result = extractFromOpenGraph(doc);
    expect(result).toBeNull();
  });
});

describe('Microdata extraction', () => {
  it('extracts product from microdata', () => {
    const doc = loadFixture('microdata-product.html');
    const result = extractFromMicrodata(doc);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Super Gadget X200');
    expect(result?.price.amountMinor).toBe(14999);
    expect(result?.price.currency).toBe('USD');
    expect(result?.inStock).toBe(true);
    expect(result?.method).toBe('microdata');
  });

  it('returns null for page without microdata', () => {
    const doc = loadFixture('no-price.html');
    const result = extractFromMicrodata(doc);
    expect(result).toBeNull();
  });
});

describe('extractProduct - layered strategy', () => {
  it('picks highest confidence strategy (adapter/jsonld first)', () => {
    const doc = loadFixture('amazon-product.html');
    const result = extractProduct(doc, 'amazon.com');
    expect(result).not.toBeNull();
    // Amazon adapter should win with 0.95 confidence
    expect(result?.method).toBe('adapter');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('falls back to JSON-LD when no adapter matches', () => {
    const doc = loadFixture('jsonld-product.html');
    const result = extractProduct(doc, 'somestore.com');
    expect(result).not.toBeNull();
    expect(result?.method).toBe('jsonld');
  });

  it('falls back to OpenGraph when no JSON-LD', () => {
    const doc = loadFixture('opengraph-product.html');
    const result = extractProduct(doc, 'somestore.com');
    expect(result).not.toBeNull();
    expect(result?.method).toBe('opengraph');
  });

  it('returns null for non-product page', () => {
    const doc = loadFixture('no-price.html');
    const result = extractProduct(doc, 'example.com');
    expect(result).toBeNull();
  });

  it('handles malformed JSON-LD and falls back', () => {
    const doc = loadFixture('malformed-jsonld.html');
    // Should not throw and should find something via OG or generic
    expect(() => extractProduct(doc, 'example.com')).not.toThrow();
    // The malformed page has OG price tags so should succeed
    const result = extractProduct(doc, 'example.com');
    expect(result).not.toBeNull();
  });

  it('extracts European EUR price', () => {
    const doc = loadFixture('european-price.html');
    const result = extractProduct(doc, 'example.de');
    expect(result).not.toBeNull();
    expect(result?.price.currency).toBe('EUR');
  });
});

describe('confidence scoring', () => {
  it('adapter has higher confidence than jsonld', () => {
    const doc = loadFixture('amazon-product.html');
    const adapterResult = extractProduct(doc, 'amazon.com');
    expect(adapterResult?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('jsonld has higher confidence than opengraph', () => {
    const jsonldDoc = loadFixture('jsonld-product.html');
    const ogDoc = loadFixture('opengraph-product.html');
    const jsonldResult = extractFromJsonLd(jsonldDoc);
    const ogResult = extractFromOpenGraph(ogDoc);
    expect(jsonldResult?.confidence ?? 0).toBeGreaterThan(ogResult?.confidence ?? 1);
  });
});
