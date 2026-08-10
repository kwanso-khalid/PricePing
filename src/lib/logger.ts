type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production builds, only warn/error; in dev, all levels
const MIN_LEVEL: LogLevel =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toISOString();
  const data = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
  return `[PriceWatch:${entry.context}] ${time} ${entry.level.toUpperCase()}: ${entry.message}${data}`;
}

function createLogger(context: string) {
  return {
    debug(message: string, data?: unknown): void {
      if (!shouldLog('debug')) return;
      const entry: LogEntry = { level: 'debug', context, message, data, timestamp: Date.now() };
      // eslint-disable-next-line no-restricted-syntax
      (globalThis as { console?: { debug(...args: unknown[]): void } }).console?.debug(
        formatEntry(entry),
      );
    },
    info(message: string, data?: unknown): void {
      if (!shouldLog('info')) return;
      const entry: LogEntry = { level: 'info', context, message, data, timestamp: Date.now() };
      // eslint-disable-next-line no-restricted-syntax
      (globalThis as { console?: { info(...args: unknown[]): void } }).console?.info(
        formatEntry(entry),
      );
    },
    warn(message: string, data?: unknown): void {
      if (!shouldLog('warn')) return;
      const entry: LogEntry = { level: 'warn', context, message, data, timestamp: Date.now() };
      // eslint-disable-next-line no-restricted-syntax
      (globalThis as { console?: { warn(...args: unknown[]): void } }).console?.warn(
        formatEntry(entry),
      );
    },
    error(message: string, data?: unknown): void {
      if (!shouldLog('error')) return;
      const entry: LogEntry = { level: 'error', context, message, data, timestamp: Date.now() };
      // eslint-disable-next-line no-restricted-syntax
      (globalThis as { console?: { error(...args: unknown[]): void } }).console?.error(
        formatEntry(entry),
      );
    },
  };
}

export { createLogger };
export type { LogLevel };
