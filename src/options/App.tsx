import React, { useCallback, useEffect, useState } from 'react';
import type { AppSettings, TrackedItem } from '../types/index.js';
import { getAllItems, getSettings, saveSettings, saveItem } from '../lib/storage.js';
import { STRINGS } from '../lib/strings.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('options');

function isValidTrackedItem(obj: unknown): obj is TrackedItem {
  if (!obj || typeof obj !== 'object') return false;
  const item = obj as Record<string, unknown>;
  return (
    typeof item['id'] === 'string' &&
    typeof item['url'] === 'string' &&
    typeof item['title'] === 'string' &&
    typeof item['currency'] === 'string' &&
    item['initialPrice'] !== null &&
    typeof item['initialPrice'] === 'object' &&
    item['currentPrice'] !== null &&
    typeof item['currentPrice'] === 'object'
  );
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>({
    checkIntervalHours: 6,
    notificationsEnabled: true,
    mutedUntil: null,
    perSiteEnabled: {},
  });
  const [saved, setSaved] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(0);

  const loadData = useCallback(async () => {
    const [s, items] = await Promise.all([getSettings(), getAllItems()]);
    setSettings(s);
    setItemCount(Object.keys(items).length);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveSettings() {
    const result = await saveSettings(settings);
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleExport() {
    try {
      const items = await getAllItems();
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: Object.values(items),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pricewatch-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error('Export failed', e);
      setImportStatus(STRINGS.exportFailed);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;

      if (!data || typeof data !== 'object') {
        setImportStatus(STRINGS.importFailed);
        return;
      }

      const dataObj = data as Record<string, unknown>;
      const itemsArray = Array.isArray(dataObj['items']) ? dataObj['items'] : null;

      if (!itemsArray) {
        setImportStatus(STRINGS.importFailed);
        return;
      }

      let imported = 0;
      for (const rawItem of itemsArray) {
        if (isValidTrackedItem(rawItem)) {
          const result = await saveItem(rawItem);
          if (result.ok) imported++;
        }
      }

      setImportStatus(STRINGS.importSuccess(imported));
      await loadData();
    } catch (e) {
      logger.error('Import failed', e);
      setImportStatus(STRINGS.importFailed);
    }

    // Reset the input
    e.target.value = '';
  }

  const muteOptions = [
    { label: 'Unmute', value: null },
    { label: '1 hour', value: 60 * 60 * 1000 },
    { label: '8 hours', value: 8 * 60 * 60 * 1000 },
    { label: '24 hours', value: 24 * 60 * 60 * 1000 },
    { label: '1 week', value: 7 * 24 * 60 * 60 * 1000 },
  ];

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {STRINGS.optionsTitle}
      </h1>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-sm">
          {STRINGS.settingsSaved}
        </div>
      )}

      {/* Check Frequency */}
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.checkFrequency}</h2>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
          {STRINGS.checkFrequencyHint}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={24}
            value={settings.checkIntervalHours}
            onChange={(e) =>
              setSettings({ ...settings, checkIntervalHours: Number(e.target.value) })
            }
            className="flex-1"
          />
          <span className="text-sm font-medium w-16 text-right">
            {settings.checkIntervalHours}h
          </span>
        </div>
      </section>

      {/* Notifications */}
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.notificationSettings}</h2>

        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) =>
              setSettings({ ...settings, notificationsEnabled: e.target.checked })
            }
            className="rounded"
          />
          <span className="text-sm">{STRINGS.enableNotifications}</span>
        </label>

        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            {STRINGS.muteNotifications}
          </label>
          <select
            value={
              settings.mutedUntil === null
                ? 'null'
                : String(settings.mutedUntil - Date.now())
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'null') {
                setSettings({ ...settings, mutedUntil: null });
              } else {
                setSettings({ ...settings, mutedUntil: Date.now() + Number(val) });
              }
            }}
            className="text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          >
            {muteOptions.map((opt) => (
              <option key={String(opt.value)} value={opt.value === null ? 'null' : String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>

          {settings.mutedUntil !== null && settings.mutedUntil > Date.now() && (
            <p className="text-xs text-gray-400 mt-1">
              {STRINGS.mutedUntil(new Date(settings.mutedUntil).toLocaleString())}
            </p>
          )}
        </div>
      </section>

      {/* Export / Import */}
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.exportImport}</h2>
        <p className="text-sm text-gray-500 mb-3">
          {itemCount} item{itemCount !== 1 ? 's' : ''} tracked
        </p>

        {importStatus && (
          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-sm">
            {importStatus}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { void handleExport(); }}
            className="text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {STRINGS.exportButton}
          </button>

          <label className="text-sm px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer">
            {STRINGS.importButton}
            <input
              type="file"
              accept=".json"
              onChange={(e) => { void handleImport(e); }}
              className="hidden"
            />
          </label>
        </div>
      </section>

      <button
        onClick={() => { void handleSaveSettings(); }}
        className="w-full py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700"
      >
        {STRINGS.save} Settings
      </button>
    </div>
  );
}
