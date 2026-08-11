import type { Observation } from '../types/storage.js';

const MIN_OBS_FOR_GUARD = 3;
const LOWER_BOUND_FACTOR = 0.20;
const UPPER_BOUND_FACTOR = 5.0;
const TRAILING_WINDOW = 10;

export function sanityCheckObservation(
  newPriceMinor: number,
  recentObs: Observation[],
): boolean {
  if (recentObs.length < MIN_OBS_FOR_GUARD) return true;

  const last = recentObs.slice(-TRAILING_WINDOW);
  const prices = last.map((o) => o[1]).sort((a, b) => a - b);
  const mid = Math.floor((prices.length - 1) / 2);
  const trailingMedian = prices[mid] ?? 0;

  if (trailingMedian === 0) return true;
  if (newPriceMinor < trailingMedian * LOWER_BOUND_FACTOR) return false;
  if (newPriceMinor > trailingMedian * UPPER_BOUND_FACTOR) return false;
  return true;
}
