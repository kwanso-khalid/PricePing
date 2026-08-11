import { createLogger } from './logger.js';

const logger = createLogger('hostbackoff');

export interface HostBackoffState {
  failures: Record<string, number>;      // hostname → consecutive failure count
  pausedUntil: Record<string, number>;   // hostname → epoch ms when pause ends
}

const HOST_BACKOFF_KEY = 'hostbackoff';
const MAX_HOST_FAILURES = 5;
const HOST_PAUSE_MS = 24 * 60 * 60 * 1000; // 24h

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve((result as Record<string, T | undefined>)[key]);
    });
  });
}

function storageSet(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve());
  });
}

export async function getHostBackoff(): Promise<HostBackoffState> {
  const raw = await storageGet<HostBackoffState>(HOST_BACKOFF_KEY);
  if (
    raw &&
    typeof raw === 'object' &&
    'failures' in raw &&
    'pausedUntil' in raw
  ) {
    return raw;
  }
  return { failures: {}, pausedUntil: {} };
}

export async function recordHostSuccess(hostname: string): Promise<void> {
  const state = await getHostBackoff();
  if ((state.failures[hostname] ?? 0) === 0) return; // nothing to reset
  state.failures[hostname] = 0;
  await storageSet({ [HOST_BACKOFF_KEY]: state });
}

export async function recordHostFailure(hostname: string): Promise<void> {
  const state = await getHostBackoff();
  const prev = state.failures[hostname] ?? 0;
  const next = prev + 1;
  state.failures[hostname] = next;
  if (next >= MAX_HOST_FAILURES) {
    const pauseUntil = Date.now() + HOST_PAUSE_MS;
    state.pausedUntil[hostname] = pauseUntil;
    logger.warn('Host paused after repeated failures', { hostname, failures: next, pauseUntil });
  }
  await storageSet({ [HOST_BACKOFF_KEY]: state });
}

export function isHostPaused(
  state: HostBackoffState,
  hostname: string,
  nowMs: number = Date.now(),
): boolean {
  const pausedUntil = state.pausedUntil[hostname];
  if (pausedUntil === undefined) return false;
  if (nowMs >= pausedUntil) {
    // Pause has expired — do not mutate here (caller can clean up via success record)
    return false;
  }
  return true;
}
