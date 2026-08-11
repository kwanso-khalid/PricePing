import { getRawAlertLog, saveRawAlertLog } from './storage.js';

export interface AlertEntry {
  id: string;
  productId: string;
  productTitle: string;
  oldPriceMinor: number;
  newPriceMinor: number;
  currency: string;
  changePercent: number;
  trendLabel: string;
  firedAt: number; // epoch ms
  seen: boolean;
}

export interface AlertLogData {
  entries: AlertEntry[]; // newest first, capped at 200
}

const MAX_ENTRIES = 200;

function isAlertLogData(value: unknown): value is AlertLogData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    Array.isArray((value as Record<string, unknown>).entries)
  );
}

export async function getAlertLog(): Promise<AlertLogData> {
  const raw = await getRawAlertLog();
  if (isAlertLogData(raw)) return raw;
  return { entries: [] };
}

export async function appendAlertEntry(entry: AlertEntry): Promise<void> {
  const log = await getAlertLog();
  // Newest first; cap at MAX_ENTRIES
  const entries = [entry, ...log.entries].slice(0, MAX_ENTRIES);
  await saveRawAlertLog({ entries });
}

export async function markAlertsSeen(): Promise<void> {
  const log = await getAlertLog();
  const entries = log.entries.map((e) => ({ ...e, seen: true }));
  await saveRawAlertLog({ entries });
}

export function countUnseenAlerts(log: AlertLogData): number {
  return log.entries.filter((e) => !e.seen).length;
}
