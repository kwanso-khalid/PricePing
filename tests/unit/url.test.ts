import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, getHostname, isSameProduct } from '../../src/lib/url.js';

describe('canonicalizeUrl', () => {
  it('strips UTM parameters', () => {
    const url = 'https://example.com/product?utm_source=google&utm_campaign=sale&id=123';
    const result = canonicalizeUrl(url);
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_campaign');
    expect(result).toContain('id=123');
  });

  it('strips Amazon tracking params', () => {
    const url = 'https://amazon.com/dp/B001/ref=sr_1_1?qid=12345&sr=8-1&keywords=widget';
    const result = canonicalizeUrl(url);
    expect(result).not.toContain('qid=');
    expect(result).not.toContain('sr=');
    expect(result).not.toContain('ref=');
    expect(result).not.toContain('keywords=');
  });

  it('strips fbclid', () => {
    const url = 'https://shop.com/item?fbclid=abc123&color=blue';
    const result = canonicalizeUrl(url);
    expect(result).not.toContain('fbclid');
    expect(result).toContain('color=blue');
  });

  it('removes fragment', () => {
    const url = 'https://example.com/product#reviews';
    const result = canonicalizeUrl(url);
    expect(result).not.toContain('#reviews');
  });

  it('normalizes to https', () => {
    const url = 'http://example.com/product';
    const result = canonicalizeUrl(url);
    expect(result.startsWith('https://')).toBe(true);
  });

  it('lowercases hostname', () => {
    const url = 'https://AMAZON.COM/dp/B001';
    const result = canonicalizeUrl(url);
    expect(result).toContain('amazon.com');
  });

  it('sorts remaining params for stability', () => {
    const url1 = 'https://example.com/p?b=2&a=1';
    const url2 = 'https://example.com/p?a=1&b=2';
    expect(canonicalizeUrl(url1)).toBe(canonicalizeUrl(url2));
  });

  it('handles invalid URL gracefully', () => {
    const result = canonicalizeUrl('not-a-url');
    expect(result).toBe('not-a-url');
  });
});

describe('getHostname', () => {
  it('returns hostname without www', () => {
    expect(getHostname('https://www.amazon.com/dp/B001')).toBe('amazon.com');
  });

  it('returns hostname for subdomains', () => {
    expect(getHostname('https://store.example.com/product')).toBe('store.example.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(getHostname('not-a-url')).toBe('');
  });
});

describe('isSameProduct', () => {
  it('returns true for same URL with different tracking params', () => {
    const url1 = 'https://example.com/product/123?utm_source=google';
    const url2 = 'https://example.com/product/123?utm_source=facebook';
    expect(isSameProduct(url1, url2)).toBe(true);
  });

  it('returns false for different products', () => {
    const url1 = 'https://example.com/product/123';
    const url2 = 'https://example.com/product/456';
    expect(isSameProduct(url1, url2)).toBe(false);
  });
});
