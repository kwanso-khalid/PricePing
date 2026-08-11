import { describe, it, expect } from 'vitest';
import { sanityCheckObservation } from '../../src/lib/sanity.js';
import type { Observation } from '../../src/types/storage.js';

function obs(price: number): Observation { return [0, price, 0, 1, 1]; }

describe('sanityCheckObservation', () => {
  it('passes with fewer than 3 observations', () => {
    expect(sanityCheckObservation(1, [])).toBe(true);
    expect(sanityCheckObservation(1, [obs(100), obs(200)])).toBe(true);
  });

  it('passes a normal price change', () => {
    const history = [obs(1000), obs(1000), obs(1000), obs(1000), obs(1000)];
    expect(sanityCheckObservation(900, history)).toBe(true);
    expect(sanityCheckObservation(1100, history)).toBe(true);
  });

  it('rejects price below 20% of median', () => {
    const history = [obs(1000), obs(1000), obs(1000)];
    expect(sanityCheckObservation(199, history)).toBe(false); // < 20% of 1000
  });

  it('rejects price above 5× median', () => {
    const history = [obs(1000), obs(1000), obs(1000)];
    expect(sanityCheckObservation(5001, history)).toBe(false); // > 5× 1000
  });

  it('passes price at exactly the boundaries', () => {
    const history = [obs(1000), obs(1000), obs(1000)];
    expect(sanityCheckObservation(200, history)).toBe(true);  // exactly 20%
    expect(sanityCheckObservation(5000, history)).toBe(true); // exactly 5×
  });

  it('handles zero median without crashing', () => {
    const history = [obs(0), obs(0), obs(0)];
    expect(sanityCheckObservation(100, history)).toBe(true);
  });
});
