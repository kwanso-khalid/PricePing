import { describe, it, expect } from 'vitest';
import {
  parsePrice,
  formatMoney,
  compareMoney,
  isLessThan,
  priceDifferencePercent,
  getMinorUnitMultiplier,
  normalizeMoney,
} from '../../src/lib/money.js';

describe('parsePrice', () => {
  describe('USD formats', () => {
    it('parses basic dollar amount', () => {
      const result = parsePrice('$19.99', 'USD');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ amountMinor: 1999, currency: 'USD' });
    });

    it('parses dollar with thousands separator', () => {
      const result = parsePrice('$1,234.56', 'USD');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ amountMinor: 123456, currency: 'USD' });
    });

    it('parses dollar without cents', () => {
      const result = parsePrice('$99', 'USD');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ amountMinor: 9900, currency: 'USD' });
    });

    it('parses plain number as USD', () => {
      const result = parsePrice('29.99', 'USD');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ amountMinor: 2999, currency: 'USD' });
    });
  });

  describe('GBP formats', () => {
    it('parses pound sign', () => {
      const result = parsePrice('£99.99');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('GBP');
        expect(result.value.amountMinor).toBe(9999);
      }
    });
  });

  describe('EUR formats', () => {
    it('parses European format (comma decimal)', () => {
      const result = parsePrice('1.234,56 €');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('EUR');
        expect(result.value.amountMinor).toBe(123456);
      }
    });

    it('parses euro with leading symbol', () => {
      const result = parsePrice('€49.99');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('EUR');
        expect(result.value.amountMinor).toBe(4999);
      }
    });
  });

  describe('JPY formats', () => {
    it('parses yen (zero decimal currency)', () => {
      const result = parsePrice('¥1980');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('JPY');
        expect(result.value.amountMinor).toBe(1980);
      }
    });

    it('parses yen with thousands separator', () => {
      const result = parsePrice('¥1,980');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountMinor).toBe(1980);
      }
    });
  });

  describe('INR formats', () => {
    it('parses rupee symbol', () => {
      const result = parsePrice('₹4,999');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('INR');
        expect(result.value.amountMinor).toBe(499900);
      }
    });

    it('parses Rs prefix', () => {
      const result = parsePrice('Rs 4,999');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('INR');
        expect(result.value.amountMinor).toBe(499900);
      }
    });
  });

  describe('space-separated thousands', () => {
    it('parses space-separated format with comma decimal', () => {
      const result = parsePrice('1 234,56', 'EUR');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.amountMinor).toBe(123456);
    });
  });

  describe('error cases', () => {
    it('returns error for empty string', () => {
      const result = parsePrice('', 'USD');
      expect(result.ok).toBe(false);
    });

    it('returns error for non-numeric string', () => {
      const result = parsePrice('not a price', 'USD');
      expect(result.ok).toBe(false);
    });

    it('returns error for negative value', () => {
      const result = parsePrice('-10', 'USD');
      expect(result.ok).toBe(false);
    });
  });
});

describe('formatMoney', () => {
  it('formats USD', () => {
    const formatted = formatMoney({ amountMinor: 1999, currency: 'USD' });
    expect(formatted).toContain('19.99');
    expect(formatted).toContain('$');
  });

  it('formats JPY without decimal', () => {
    const formatted = formatMoney({ amountMinor: 1980, currency: 'JPY' });
    expect(formatted).toContain('1,980');
  });

  it('formats GBP', () => {
    const formatted = formatMoney({ amountMinor: 9999, currency: 'GBP' });
    expect(formatted).toContain('99.99');
    expect(formatted).toContain('£');
  });
});

describe('compareMoney', () => {
  it('returns negative when a < b', () => {
    const a = { amountMinor: 1000, currency: 'USD' };
    const b = { amountMinor: 2000, currency: 'USD' };
    expect(compareMoney(a, b)).toBeLessThan(0);
  });

  it('returns 0 when equal', () => {
    const a = { amountMinor: 1000, currency: 'USD' };
    const b = { amountMinor: 1000, currency: 'USD' };
    expect(compareMoney(a, b)).toBe(0);
  });

  it('throws when currencies differ', () => {
    const a = { amountMinor: 1000, currency: 'USD' };
    const b = { amountMinor: 1000, currency: 'EUR' };
    expect(() => compareMoney(a, b)).toThrow();
  });
});

describe('isLessThan', () => {
  it('returns true when a is less', () => {
    expect(
      isLessThan({ amountMinor: 500, currency: 'USD' }, { amountMinor: 1000, currency: 'USD' }),
    ).toBe(true);
  });

  it('returns false when equal', () => {
    expect(
      isLessThan(
        { amountMinor: 1000, currency: 'USD' },
        { amountMinor: 1000, currency: 'USD' },
      ),
    ).toBe(false);
  });
});

describe('priceDifferencePercent', () => {
  it('calculates 50% drop', () => {
    const from = { amountMinor: 2000, currency: 'USD' };
    const to = { amountMinor: 1000, currency: 'USD' };
    expect(priceDifferencePercent(from, to)).toBeCloseTo(-50);
  });

  it('calculates 100% increase', () => {
    const from = { amountMinor: 1000, currency: 'USD' };
    const to = { amountMinor: 2000, currency: 'USD' };
    expect(priceDifferencePercent(from, to)).toBeCloseTo(100);
  });

  it('returns 0 for zero initial price', () => {
    const from = { amountMinor: 0, currency: 'USD' };
    const to = { amountMinor: 1000, currency: 'USD' };
    expect(priceDifferencePercent(from, to)).toBe(0);
  });

  it('throws for different currencies', () => {
    expect(() =>
      priceDifferencePercent({ amountMinor: 1000, currency: 'USD' }, { amountMinor: 1000, currency: 'EUR' }),
    ).toThrow();
  });
});

describe('getMinorUnitMultiplier', () => {
  it('returns 1 for JPY', () => {
    expect(getMinorUnitMultiplier('JPY')).toBe(1);
  });

  it('returns 100 for USD', () => {
    expect(getMinorUnitMultiplier('USD')).toBe(100);
  });

  it('returns 1000 for KWD', () => {
    expect(getMinorUnitMultiplier('KWD')).toBe(1000);
  });
});

describe('normalizeMoney', () => {
  it('normalizes $1,299.00', () => {
    const result = normalizeMoney('$1,299.00', 'USD');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(129900);
    expect(result?.currency).toBe('USD');
  });

  it('normalizes 1.299,00 EUR', () => {
    const result = normalizeMoney('1.299,00 EUR', 'EUR');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(129900);
    expect(result?.currency).toBe('EUR');
  });

  it('normalizes $19.99', () => {
    const result = normalizeMoney('$19.99', 'USD');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(1999);
    expect(result?.currency).toBe('USD');
  });

  it('normalizes €49,99', () => {
    const result = normalizeMoney('€49,99', 'EUR');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(4999);
    expect(result?.currency).toBe('EUR');
  });

  it('normalizes £99.99', () => {
    const result = normalizeMoney('£99.99', 'GBP');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(9999);
    expect(result?.currency).toBe('GBP');
  });

  it('normalizes ¥1,980', () => {
    const result = normalizeMoney('¥1,980', 'JPY');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(1980);
    expect(result?.currency).toBe('JPY');
  });

  it('normalizes ₹4,999', () => {
    const result = normalizeMoney('₹4,999', 'INR');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(499900);
    expect(result?.currency).toBe('INR');
  });

  it('normalizes 0', () => {
    const result = normalizeMoney('0', 'USD');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(0);
  });

  it('normalizes $0.00', () => {
    const result = normalizeMoney('$0.00', 'USD');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(0);
  });

  it('takes lower end of price range $10.99 - $15.99', () => {
    const result = normalizeMoney('$10.99 - $15.99', 'USD');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(1099);
    expect(result?.currency).toBe('USD');
  });

  it('returns null for Free', () => {
    expect(normalizeMoney('Free', 'USD')).toBeNull();
  });

  it('returns null for free (lowercase)', () => {
    expect(normalizeMoney('free', 'USD')).toBeNull();
  });

  it('returns null for FREE (uppercase)', () => {
    expect(normalizeMoney('FREE', 'USD')).toBeNull();
  });

  it('returns null for See price in cart', () => {
    expect(normalizeMoney('See price in cart', 'USD')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeMoney('', 'USD')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeMoney(null, 'USD')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeMoney(undefined, 'USD')).toBeNull();
  });

  it('returns null for numeric input', () => {
    expect(normalizeMoney(42, 'USD')).toBeNull();
  });

  it('returns null for Sign in to see price', () => {
    expect(normalizeMoney('Sign in to see price', 'USD')).toBeNull();
  });

  it('returns null for Unavailable', () => {
    expect(normalizeMoney('Unavailable', 'USD')).toBeNull();
  });

  it('normalizes 1 234,56 with EUR context', () => {
    const result = normalizeMoney('1 234,56', 'EUR');
    expect(result).not.toBeNull();
    expect(result?.amountMinor).toBe(123456);
    expect(result?.currency).toBe('EUR');
  });
});
