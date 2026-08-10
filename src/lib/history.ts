import type { PricePoint } from '../types/index.js';

const MAX_HISTORY_POINTS = 200;
const DOWNSAMPLE_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Add a new price point to history and apply caps/downsampling.
 */
export function addPricePoint(history: PricePoint[], newPoint: PricePoint): PricePoint[] {
  const updated = [...history, newPoint];
  return downsampleHistory(updated);
}

/**
 * Cap to MAX_HISTORY_POINTS, downsampling old entries to 1/day.
 */
export function downsampleHistory(history: PricePoint[]): PricePoint[] {
  if (history.length <= MAX_HISTORY_POINTS) {
    return history;
  }

  const now = Date.now();
  const cutoff = now - DOWNSAMPLE_AGE_MS;

  const recent = history.filter((p) => p.observedAt >= cutoff);
  const old = history.filter((p) => p.observedAt < cutoff);

  // Downsample old entries: keep 1 per calendar day
  const dayMap = new Map<string, PricePoint>();
  for (const point of old) {
    const day = new Date(point.observedAt).toISOString().split('T')[0] ?? '';
    const existing = dayMap.get(day);
    // Keep the latest point for each day
    if (!existing || point.observedAt > existing.observedAt) {
      dayMap.set(day, point);
    }
  }

  const downsampled = Array.from(dayMap.values()).sort((a, b) => a.observedAt - b.observedAt);
  const combined = [...downsampled, ...recent];

  // If still over limit after downsampling, trim oldest
  if (combined.length > MAX_HISTORY_POINTS) {
    return combined.slice(combined.length - MAX_HISTORY_POINTS);
  }

  return combined;
}
