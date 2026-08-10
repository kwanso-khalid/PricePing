import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, mapResult, unwrapOr } from '../../src/lib/result.js';

describe('Result type', () => {
  describe('ok', () => {
    it('creates an ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(42);
    });
  });

  describe('err', () => {
    it('creates an error result', () => {
      const result = err('something failed');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('something failed');
    });
  });

  describe('isOk', () => {
    it('returns true for ok result', () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it('returns false for err result', () => {
      expect(isOk(err('fail'))).toBe(false);
    });
  });

  describe('isErr', () => {
    it('returns true for err result', () => {
      expect(isErr(err('fail'))).toBe(true);
    });

    it('returns false for ok result', () => {
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe('mapResult', () => {
    it('transforms ok value', () => {
      const result = mapResult(ok(2), (x) => x * 3);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(6);
    });

    it('passes through err unchanged', () => {
      const result = mapResult(err('fail'), (x: number) => x * 3);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('fail');
    });
  });

  describe('unwrapOr', () => {
    it('returns value for ok result', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns fallback for err result', () => {
      expect(unwrapOr(err('fail'), 0)).toBe(0);
    });
  });
});
