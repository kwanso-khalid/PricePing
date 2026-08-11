import type { Observation, CachedStats, PriceMark, WindowStats } from '../types/storage.js';

const MS_30 = 30 * 24 * 60 * 60 * 1000;
const MS_90 = 90 * 24 * 60 * 60 * 1000;
const MS_365 = 365 * 24 * 60 * 60 * 1000;
const MAX_SPARKLINE_POINTS = 20;

function windowStats(obs: Observation[], nowMs: number, windowMs: number): WindowStats | null {
  const cutoffMs = nowMs - windowMs;
  const inWindow = obs.filter((o) => o[0] * 60_000 >= cutoffMs);
  if (inWindow.length === 0) return null;
  const prices = inWindow.map((o) => o[1]).sort((a, b) => a - b);
  const mid = Math.floor((prices.length - 1) / 2);
  return {
    min: prices[0] ?? 0,
    max: prices[prices.length - 1] ?? 0,
    median: prices[mid] ?? 0,
    count: inWindow.length,
  };
}

export function computeStats(
  obs: Observation[],
  prevAllTimeMin: PriceMark | null,
  prevAllTimeMax: PriceMark | null,
  nowMs: number = Date.now(),
): CachedStats {
  if (obs.length === 0) {
    return {
      observationCount: 0,
      changeCount: 0,
      daysTracked: 0,
      lastChangeAt: null,
      allTimeMin: prevAllTimeMin,
      allTimeMax: prevAllTimeMax,
      w30: null,
      w90: null,
      w365: null,
    };
  }

  let allTimeMin = prevAllTimeMin;
  let allTimeMax = prevAllTimeMax;
  let changeCount = 0;
  let lastChangeAt: number | null = null;
  let prevPrice: number | null = null;

  for (const o of obs) {
    const priceMinor = o[1];
    const observedAtMs = o[0] * 60_000;

    if (allTimeMin === null || priceMinor < allTimeMin.priceMinor) {
      allTimeMin = { priceMinor, observedAt: observedAtMs };
    }
    if (allTimeMax === null || priceMinor > allTimeMax.priceMinor) {
      allTimeMax = { priceMinor, observedAt: observedAtMs };
    }

    if (prevPrice !== null && priceMinor !== prevPrice) {
      changeCount++;
      lastChangeAt = observedAtMs;
    }
    prevPrice = priceMinor;
  }

  const firstObsMs = (obs[0]?.[0] ?? 0) * 60_000;
  const daysTracked = Math.max(0, (nowMs - firstObsMs) / (24 * 60 * 60 * 1000));

  return {
    observationCount: obs.length,
    changeCount,
    daysTracked: Math.round(daysTracked * 10) / 10,
    lastChangeAt,
    allTimeMin,
    allTimeMax,
    w30: windowStats(obs, nowMs, MS_30),
    w90: windowStats(obs, nowMs, MS_90),
    w365: windowStats(obs, nowMs, MS_365),
  };
}

export function sparklinePoints(obs: Observation[]): number[] {
  return obs.slice(-MAX_SPARKLINE_POINTS).map((o) => o[1]);
}
