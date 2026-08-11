import { describe, it, expect, vi } from 'vitest';
import {
  getHostBackoff,
  recordHostSuccess,
  recordHostFailure,
  isHostPaused,
} from '../../src/lib/hostbackoff.js';
import type { HostBackoffState } from '../../src/lib/hostbackoff.js';

type ChromeMock = {
  storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  runtime: { lastError: { message?: string } | null };
};
function getChrome(): ChromeMock {
  return (globalThis as unknown as { chrome: ChromeMock }).chrome;
}

const HOST_PAUSE_MS = 24 * 60 * 60 * 1000;
const MAX_HOST_FAILURES = 5;

describe('isHostPaused', () => {
  it('returns false when host has no pause entry', () => {
    const state: HostBackoffState = { failures: {}, pausedUntil: {} };
    expect(isHostPaused(state, 'example.com')).toBe(false);
  });

  it('returns true when host is paused and time has not expired', () => {
    const now = Date.now();
    const state: HostBackoffState = {
      failures: { 'example.com': 5 },
      pausedUntil: { 'example.com': now + HOST_PAUSE_MS },
    };
    expect(isHostPaused(state, 'example.com', now)).toBe(true);
  });

  it('returns false when pause has expired', () => {
    const now = Date.now();
    const state: HostBackoffState = {
      failures: { 'example.com': 5 },
      pausedUntil: { 'example.com': now - 1000 }, // 1 second in the past
    };
    expect(isHostPaused(state, 'example.com', now)).toBe(false);
  });
});

describe('recordHostSuccess', () => {
  it('resets failure count for host', async () => {
    const stored: Record<string, unknown> = {
      hostbackoff: { failures: { 'example.com': 3 }, pausedUntil: {} },
    };
    const c = getChrome();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      cb({ [key]: stored[key] });
    });
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => {
      Object.assign(stored, data);
      cb();
    });

    await recordHostSuccess('example.com');

    const state = stored['hostbackoff'] as HostBackoffState;
    expect(state.failures['example.com']).toBe(0);
  });

  it('does nothing when failure count is already 0', async () => {
    const stored: Record<string, unknown> = {
      hostbackoff: { failures: { 'example.com': 0 }, pausedUntil: {} },
    };
    const c = getChrome();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      cb({ [key]: stored[key] });
    });
    const setCalledWith: unknown[] = [];
    c.storage.local.set.mockImplementation((data: unknown, cb: () => void) => {
      setCalledWith.push(data);
      cb();
    });

    await recordHostSuccess('example.com');
    // Should not have called set (no change needed)
    expect(setCalledWith).toHaveLength(0);
  });
});

describe('recordHostFailure', () => {
  it('increments failure count', async () => {
    const stored: Record<string, unknown> = {
      hostbackoff: { failures: { 'example.com': 2 }, pausedUntil: {} },
    };
    const c = getChrome();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      cb({ [key]: stored[key] });
    });
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => {
      Object.assign(stored, data);
      cb();
    });

    await recordHostFailure('example.com');
    const state = stored['hostbackoff'] as HostBackoffState;
    expect(state.failures['example.com']).toBe(3);
  });

  it(`pauses host after ${MAX_HOST_FAILURES} consecutive failures`, async () => {
    const stored: Record<string, unknown> = {
      hostbackoff: { failures: { 'example.com': MAX_HOST_FAILURES - 1 }, pausedUntil: {} },
    };
    const c = getChrome();
    const now = Date.now();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      cb({ [key]: stored[key] });
    });
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => {
      Object.assign(stored, data);
      cb();
    });

    await recordHostFailure('example.com');
    const state = stored['hostbackoff'] as HostBackoffState;
    expect(state.failures['example.com']).toBe(MAX_HOST_FAILURES);
    expect(state.pausedUntil['example.com']).toBeGreaterThanOrEqual(now + HOST_PAUSE_MS - 1000);
  });

  it('handles fresh state (no prior entry)', async () => {
    const stored: Record<string, unknown> = {};
    const c = getChrome();
    c.storage.local.get.mockImplementation((key: string, cb: (r: Record<string, unknown>) => void) => {
      cb({ [key]: stored[key] });
    });
    c.storage.local.set.mockImplementation((data: Record<string, unknown>, cb: () => void) => {
      Object.assign(stored, data);
      cb();
    });

    await recordHostFailure('newhost.com');
    const state = stored['hostbackoff'] as HostBackoffState;
    expect(state.failures['newhost.com']).toBe(1);
  });
});

describe('getHostBackoff', () => {
  it('returns empty state when no data stored', async () => {
    const state = await getHostBackoff();
    expect(state.failures).toEqual({});
    expect(state.pausedUntil).toEqual({});
  });
});
