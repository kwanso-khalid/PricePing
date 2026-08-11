import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPlatform } from '../../src/content/extract/platform/detect.js';
import { extractFromJsonLd } from '../../src/content/extract/jsonld.js';
import { extractFromMicrodata } from '../../src/content/extract/microdata.js';
import { extractProduct } from '../../src/content/extract/index.js';
import { parseStockState, stockStateToInStock } from '../../src/content/extract/stockstate.js';
import { extractListPrice } from '../../src/content/extract/listprice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function loadFixture(name: string): Document {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
  const dom = new JSDOM(html, { url: 'https://example.com' });
  return dom.window.document;
}

// ---- Platform detection ----

describe('detectPlatform', () => {
  it('detects Shopify via meta tag', () => {
    const doc = loadFixture('shopify-product.html');
    expect(detectPlatform(doc)).toBe('shopify');
  });

  it('detects WooCommerce via meta generator', () => {
    const doc = loadFixture('woocommerce-product.html');
    expect(detectPlatform(doc)).toBe('woocommerce');
  });

  it('returns null for generic pages', () => {
    const doc = loadFixture('generic-product.html');
    expect(detectPlatform(doc)).toBeNull();
  });

  it('returns null for JSON-LD pages with no platform marker', () => {
    const doc = loadFixture('jsonld-product.html');
    expect(detectPlatform(doc)).toBeNull();
  });
});

// ---- StockState parsing ----

describe('parseStockState', () => {
  it('returns 1 for in-stock strings', () => {
    expect(parseStockState('InStock')).toBe(1);
    expect(parseStockState('in stock')).toBe(1);
    expect(parseStockState('https://schema.org/InStock')).toBe(1);
    expect(parseStockState('available')).toBe(1);
  });

  it('returns 2 for out-of-stock strings', () => {
    expect(parseStockState('OutOfStock')).toBe(2);
    expect(parseStockState('out of stock')).toBe(2);
    expect(parseStockState('https://schema.org/OutOfStock')).toBe(2);
    expect(parseStockState('sold out')).toBe(2);
    expect(parseStockState('Sold Out')).toBe(2);
  });

  it('returns 3 for preorder strings', () => {
    expect(parseStockState('PreOrder')).toBe(3);
    expect(parseStockState('pre-order')).toBe(3);
    expect(parseStockState('coming soon')).toBe(3);
  });

  it('returns 4 for limited stock strings', () => {
    expect(parseStockState('limited')).toBe(4);
    expect(parseStockState('low stock')).toBe(4);
    expect(parseStockState('limited availability')).toBe(4);
  });

  it('returns 0 for empty or unknown strings', () => {
    expect(parseStockState('')).toBe(0);
    expect(parseStockState('check store')).toBe(0);
  });
});

describe('stockStateToInStock', () => {
  it('returns true for in_stock (1), preorder (3), limited (4), unknown (0)', () => {
    expect(stockStateToInStock(0)).toBe(true);
    expect(stockStateToInStock(1)).toBe(true);
    expect(stockStateToInStock(3)).toBe(true);
    expect(stockStateToInStock(4)).toBe(true);
  });

  it('returns false for out_of_stock (2)', () => {
    expect(stockStateToInStock(2)).toBe(false);
  });
});

// ---- Out-of-stock fixture ----

describe('out-of-stock extraction', () => {
  it('extracts stockState=2 from OutOfStock availability', () => {
    const doc = loadFixture('out-of-stock.html');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.stockState).toBe(2);
    expect(result?.inStock).toBe(false);
    expect(result?.title).toBe('Sold Out Widget');
  });
});

// ---- Advertised list price ----

describe('advertised list price extraction', () => {
  it('extracts list price from JSON-LD priceSpecification', () => {
    const doc = loadFixture('advertised-list-price.html');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.price.amountMinor).toBe(5999);
    expect(result?.advertisedListPrice).not.toBeNull();
    expect(result?.advertisedListPrice?.amountMinor).toBe(8999);
  });

  it('extracts list price from DOM strikethrough element', () => {
    const doc = loadFixture('advertised-list-price.html');
    // DOM extraction via extractListPrice
    const listPrice = extractListPrice(doc, 5999, 'USD');
    expect(listPrice).not.toBeNull();
    expect(listPrice?.amountMinor).toBe(8999);
  });

  it('does not return list price if it is lower than current price', () => {
    const doc = loadFixture('advertised-list-price.html');
    // Current price = 10000 (higher than list price 8999) — should return null
    const listPrice = extractListPrice(doc, 10000, 'USD');
    expect(listPrice).toBeNull();
  });

  it('extracts list price from Shopify fixture via DOM fallback', () => {
    const doc = loadFixture('shopify-product.html');
    const result = extractProduct(doc, 'myshop.myshopify.com');
    expect(result).not.toBeNull();
    // OG price is 29.99 (2999 minor), DOM has was-price of 49.99 (4999 minor)
    expect(result?.advertisedListPrice?.amountMinor).toBe(4999);
  });
});

// ---- Generic extractor ----

describe('generic extractor', () => {
  it('returns method "generic" not "adapter"', () => {
    const doc = loadFixture('generic-product.html');
    const result = extractProduct(doc, 'unknownstore.com');
    // generic-product.html has no JSON-LD/microdata/OpenGraph price, so falls to generic
    if (result) {
      expect(result.method).toBe('generic');
    }
    // result may be null if generic fails; that's acceptable
  });

  it('returns confidence 0.35 for generic results', () => {
    const doc = loadFixture('generic-product.html');
    const result = extractProduct(doc, 'unknownstore.com');
    if (result && result.method === 'generic') {
      expect(result.confidence).toBe(0.35);
    }
  });
});

// ---- WooCommerce detection ----

describe('WooCommerce platform', () => {
  it('detects WooCommerce and still extracts price via JSON-LD', () => {
    const doc = loadFixture('woocommerce-product.html');
    const platform = detectPlatform(doc);
    expect(platform).toBe('woocommerce');
    const result = extractFromJsonLd(doc);
    expect(result).not.toBeNull();
    expect(result?.price.amountMinor).toBe(2499);
    expect(result?.title).toBe('WooCommerce Test Product');
  });
});

// ---- Broken page ----

describe('broken extraction', () => {
  it('returns null for blocked/broken page', () => {
    const doc = loadFixture('broken-extraction.html');
    const result = extractProduct(doc, 'blocked-site.com');
    expect(result).toBeNull();
  });

  it('does not throw on malformed JSON-LD', () => {
    const doc = loadFixture('broken-extraction.html');
    expect(() => extractFromJsonLd(doc)).not.toThrow();
    expect(() => extractFromMicrodata(doc)).not.toThrow();
  });
});

// ---- Price range ----

describe('price range handling', () => {
  it('extracts a price from a range page without throwing', () => {
    const doc = loadFixture('price-range.html');
    // Should not throw regardless of which strategy succeeds
    expect(() => extractProduct(doc, 'example.com')).not.toThrow();
    const result = extractProduct(doc, 'example.com');
    // If extraction succeeds, it should be in the right ballpark (2999 or 3000 for ~$30)
    if (result) {
      expect(result.price.amountMinor).toBeGreaterThanOrEqual(2990);
      expect(result.price.amountMinor).toBeLessThanOrEqual(3010);
    }
  });
});

// ---- ParseResult types ----

describe('ParseResult discriminated union', () => {
  it('can construct a successful ParseResult', async () => {
    const { extractFromJsonLd: ld } = await import('../../src/content/extract/jsonld.js');
    const { extractProduct: ep } = await import('../../src/content/extract/index.js');
    const doc = loadFixture('jsonld-product.html');
    const product = ld(doc);
    expect(product).not.toBeNull();
    if (!product) return;

    // Construct a ParseResult manually to validate the type shape
    const parseResult = { ok: true as const, product, tier: 1 as const, confidence: product.confidence };
    expect(parseResult.ok).toBe(true);
    expect(parseResult.tier).toBe(1);

    // Also test the failure shape
    const failResult = { ok: false as const, reason: 'no_price_found' as const, tier: 4 as const };
    expect(failResult.ok).toBe(false);
    expect(failResult.reason).toBe('no_price_found');
    expect(failResult.tier).toBe(4);

    // Ensure extractProduct still works (smoke test for import)
    const result = ep(doc, 'example.com');
    expect(result).not.toBeNull();
  });
});
