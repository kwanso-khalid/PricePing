import { vi, beforeEach } from 'vitest';

// Mock chrome APIs for unit tests
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      getBytesInUse: vi.fn(),
    },
  },
  runtime: {
    lastError: null as { message?: string } | null,
    getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  action: {
    openPopup: vi.fn(),
  },
};

// Set up global chrome mock
(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  chromeMock.runtime.lastError = null;

  // Default storage.local.get returns empty
  chromeMock.storage.local.get.mockImplementation(
    (_keys: unknown, callback: (result: Record<string, unknown>) => void) => {
      callback({});
    },
  );

  // Default storage.local.set succeeds
  chromeMock.storage.local.set.mockImplementation(
    (_data: unknown, callback: () => void) => {
      if (callback) callback();
    },
  );

  // Default storage.local.remove succeeds
  chromeMock.storage.local.remove.mockImplementation(
    (_keys: unknown, callback: () => void) => {
      if (callback) callback();
    },
  );
});
