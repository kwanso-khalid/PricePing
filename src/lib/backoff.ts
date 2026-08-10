/**
 * Exponential backoff configuration and calculation.
 * For the price checker: min(baseHours * 2^failures, maxHours)
 */
export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  jitterMs?: number;
}

const DEFAULT_JITTER_MS = 0;

export function calculateBackoffMs(
  failures: number,
  config: BackoffConfig,
): number {
  const jitter = config.jitterMs ?? DEFAULT_JITTER_MS;
  const base = config.baseMs * Math.pow(2, failures);
  const capped = Math.min(base, config.maxMs);
  const jitterAmount = jitter > 0 ? Math.random() * jitter : 0;
  return Math.floor(capped + jitterAmount);
}

/**
 * Price checker backoff: starts at 6h, doubles per failure, caps at 72h.
 */
export const CHECKER_BACKOFF: BackoffConfig = {
  baseMs: 6 * 60 * 60 * 1000,
  maxMs: 72 * 60 * 60 * 1000,
};

export function checkerBackoffMs(consecutiveFailures: number): number {
  return calculateBackoffMs(consecutiveFailures, CHECKER_BACKOFF);
}

/**
 * Returns true if an item is due for checking given its last check time and failure count.
 */
export function isDueForCheck(
  lastCheckedAt: number | null,
  consecutiveFailures: number,
  checkIntervalMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (lastCheckedAt === null) return true;

  let intervalMs: number;
  if (consecutiveFailures > 0) {
    // Use backoff interval
    intervalMs = checkerBackoffMs(consecutiveFailures - 1);
  } else {
    intervalMs = checkIntervalMs;
  }

  return nowMs - lastCheckedAt >= intervalMs;
}

/**
 * Stagger delay for sequential requests. Random jitter between min and max seconds.
 */
export function staggerDelayMs(minSeconds: number = 2, maxSeconds: number = 8): number {
  return Math.floor((minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000);
}
