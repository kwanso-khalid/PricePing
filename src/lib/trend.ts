import type { ObservationHistory, CachedStats } from '../types/storage.js';

// Named thresholds as constants
export const TREND_MIN_OBS = 8;
export const TREND_MIN_DAYS = 14;
export const TREND_MIN_TIER = 2; // tier 1 or 2 only

export interface TrendLabel {
  label: string;
  confidence: 'high' | 'low';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function computeTrendLabel(
  currentPrice: number,
  history: ObservationHistory,
  stats: CachedStats,
  windowDays: 30 | 90 | 365 | 'all',
  nowMs: number = Date.now(),
): TrendLabel {
  const windowMs =
    windowDays === 'all' ? Infinity : windowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;

  // Filter to window and tier <= TREND_MIN_TIER
  const filtered = history.obs.filter(
    (o) => (windowMs === Infinity || o[0] * 60_000 >= cutoffMs) && o[4] <= TREND_MIN_TIER,
  );

  const count = filtered.length;

  if (count < TREND_MIN_OBS) {
    return {
      label: `still building history, ${stats.observationCount} observation${stats.observationCount !== 1 ? 's' : ''}`,
      confidence: 'low',
    };
  }

  // Check window span
  const times = filtered.map((o) => o[0] * 60_000);
  const spanMs = Math.max(...times) - Math.min(...times);
  const spanDays = spanMs / (24 * 60 * 60 * 1000);

  if (spanDays < TREND_MIN_DAYS) {
    return {
      label: `still building history, ${stats.observationCount} observation${stats.observationCount !== 1 ? 's' : ''}`,
      confidence: 'low',
    };
  }

  // Compute prices sorted ascending, find rank of currentPrice
  const prices = filtered.map((o) => o[1]).sort((a, b) => a - b);
  const minPrice = prices[0] ?? currentPrice;

  // Rank: 1-based position in sorted prices (1 = lowest)
  const rank = prices.filter((p) => p < currentPrice).length + 1;

  const windowLabel =
    windowDays === 'all' ? 'ever' : `${windowDays} days`;

  let label: string;
  if (rank === 1) {
    label =
      windowDays === 'all' ? 'lowest ever' : `lowest in ${windowDays} days`;
  } else {
    label = `${ordinal(rank)} lowest in ${windowLabel}`;
  }

  // Check if near all-time low (within 1%)
  const allTimeMin = stats.allTimeMin?.priceMinor;
  if (allTimeMin !== null && allTimeMin !== undefined && windowDays !== 'all') {
    const nearAtl = currentPrice <= allTimeMin * 1.01;
    if (nearAtl) {
      label += ', near all-time low';
    }
  }

  // Compute percent above window min
  if (minPrice > 0 && currentPrice > minPrice) {
    const pct = Math.round(((currentPrice - minPrice) / minPrice) * 100);
    if (pct > 0) {
      label += `, ${pct}% above ${windowDays === 'all' ? '' : windowDays + '-day '}low`;
    }
  }

  return { label, confidence: 'high' };
}
