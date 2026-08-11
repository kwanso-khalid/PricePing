import type { ObservationHistory } from '../types/storage.js';

const NEAR_PCT = 0.03; // within 3% counts as "at or near"
const MIN_OBS = 8;
const MIN_DAYS = 14;
const MIN_TIER = 2; // tier 1 or 2 only

export interface DiscountVerdict {
  verdict: 'genuine' | 'inflated' | 'insufficient_data';
  advertisedList: number | null;
  observedMaxInWindow: number | null;
  windowDays: number;
  observationsAtOrNearList: number;
  observationCount: number;
  tierFloor: number;
}

export function computeDiscountVerdict(
  advertisedListPrice: number | null,
  history: ObservationHistory,
  windowDays: number = 180,
  nowMs: number = Date.now(),
): DiscountVerdict {
  const base: Omit<DiscountVerdict, 'verdict' | 'observedMaxInWindow' | 'observationsAtOrNearList' | 'observationCount' | 'tierFloor'> = {
    advertisedList: advertisedListPrice,
    windowDays,
  };

  if (advertisedListPrice === null) {
    return {
      ...base,
      verdict: 'insufficient_data',
      observedMaxInWindow: null,
      observationsAtOrNearList: 0,
      observationCount: 0,
      tierFloor: 4,
    };
  }

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;

  // Filter to within window and tier <= MIN_TIER
  const filtered = history.obs.filter(
    (o) => o[0] * 60_000 >= cutoffMs && o[4] <= MIN_TIER,
  );

  const observationCount = filtered.length;

  if (observationCount === 0) {
    return {
      ...base,
      verdict: 'insufficient_data',
      observedMaxInWindow: null,
      observationsAtOrNearList: 0,
      observationCount,
      tierFloor: 4,
    };
  }

  // Compute actual window span in days
  const times = filtered.map((o) => o[0] * 60_000);
  const windowSpanMs = Math.max(...times) - Math.min(...times);
  const windowSpanDays = windowSpanMs / (24 * 60 * 60 * 1000);

  const tierFloor = Math.min(...filtered.map((o) => o[4])) as 1 | 2 | 3 | 4;

  if (observationCount < MIN_OBS || windowSpanDays < MIN_DAYS) {
    return {
      ...base,
      verdict: 'insufficient_data',
      observedMaxInWindow: null,
      observationsAtOrNearList: 0,
      observationCount,
      tierFloor,
    };
  }

  const threshold = advertisedListPrice * (1 - NEAR_PCT);
  const observationsAtOrNearList = filtered.filter((o) => o[1] >= threshold).length;
  const observedMaxInWindow = Math.max(...filtered.map((o) => o[1]));

  if (observationsAtOrNearList > 0) {
    return {
      ...base,
      verdict: 'genuine',
      observedMaxInWindow,
      observationsAtOrNearList,
      observationCount,
      tierFloor,
    };
  }

  return {
    ...base,
    verdict: 'inflated',
    observedMaxInWindow,
    observationsAtOrNearList,
    observationCount,
    tierFloor,
  };
}
