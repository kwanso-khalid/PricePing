import React, { useCallback, useEffect, useState } from 'react';
import type { Settings, Product, Observation } from '../types/storage.js';
import { getProductIndex, getProduct, addProduct, getSettings, saveSettings } from '../lib/storage.js';
import { canonicalKey } from '../lib/canonical.js';
import { STRINGS } from '../lib/strings.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('options');

function isValidProductExport(obj: unknown): obj is Product {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' && typeof p['url'] === 'string' &&
    typeof p['title'] === 'string' && typeof p['currency'] === 'string' &&
    typeof p['currentPrice'] === 'number'
  );
}

const DEFAULT_SETTINGS: Settings = { checkIntervalHours: 6, notificationsEnabled: true, mutedUntil: null, quietHours: null };

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(0);

  const loadData = useCallback(async () => {
    const [s, idx] = await Promise.all([getSettings(), getProductIndex()]);
    setSettings(s);
    setItemCount(idx.length);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function handleSaveSettings() {
    const result = await saveSettings(settings);
    if (result.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  async function handleExport() {
    try {
      const idx = await getProductIndex();
      const products: Product[] = [];
      for (const s of idx) { const p = await getProduct(s.id); if (p) products.push(p); }
      const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), products }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `priceping-export-${new Date().toISOString().split('T')[0]}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { logger.error('Export failed', e); setImportStatus(STRINGS.exportFailed); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as unknown;
      if (!data || typeof data !== 'object') { setImportStatus(STRINGS.importFailed); return; }
      const products = (data as Record<string, unknown>)['products'];
      if (!Array.isArray(products)) { setImportStatus(STRINGS.importFailed); return; }
      let imported = 0;
      for (const raw of products) {
        if (isValidProductExport(raw)) {
          const cKey = await canonicalKey(raw.url);
          const p: Product = { ...raw, canonicalKey: cKey };
          const seedObs: Observation = [Math.floor((raw.createdAt ?? Date.now()) / 60_000), raw.currentPrice, raw.advertisedListPrice ?? 0, raw.stockState ?? 1, raw.parseTier ?? 1];
          const result = await addProduct(p, seedObs);
          if (result.ok) imported++;
        }
      }
      setImportStatus(STRINGS.importSuccess(imported));
      await loadData();
    } catch (e) { logger.error('Import failed', e); setImportStatus(STRINGS.importFailed); }
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
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">{STRINGS.optionsTitle}</h1>
      {saved && <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-sm">{STRINGS.settingsSaved}</div>}
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.checkFrequency}</h2>
        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{STRINGS.checkFrequencyHint}</label>
        <div className="flex items-center gap-3">
          <input type="range" min={1} max={24} value={settings.checkIntervalHours}
            onChange={(e) => setSettings({ ...settings, checkIntervalHours: Number(e.target.value) })} className="flex-1" />
          <span className="text-sm font-medium w-16 text-right">{settings.checkIntervalHours}h</span>
        </div>
      </section>
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.notificationSettings}</h2>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input type="checkbox" checked={settings.notificationsEnabled}
            onChange={(e) => setSettings({ ...settings, notificationsEnabled: e.target.checked })} className="rounded" />
          <span className="text-sm">{STRINGS.enableNotifications}</span>
        </label>
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{STRINGS.muteNotifications}</label>
          <select value={settings.mutedUntil === null ? 'null' : String(settings.mutedUntil - Date.now())}
            onChange={(e) => setSettings({ ...settings, mutedUntil: e.target.value === 'null' ? null : Date.now() + Number(e.target.value) })}
            className="text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
            {muteOptions.map((opt) => (
              <option key={String(opt.value)} value={opt.value === null ? 'null' : String(opt.value)}>{opt.label}</option>
            ))}
          </select>
          {settings.mutedUntil !== null && settings.mutedUntil > Date.now() && (
            <p className="text-xs text-gray-400 mt-1">{STRINGS.mutedUntil(new Date(settings.mutedUntil).toLocaleString())}</p>
          )}
        </div>
      </section>
      <section className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-base font-semibold mb-3">{STRINGS.exportImport}</h2>
        <p className="text-sm text-gray-500 mb-3">{itemCount} item{itemCount !== 1 ? 's' : ''} tracked</p>
        {importStatus && <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-sm">{importStatus}</div>}
        <div className="flex gap-2">
          <button onClick={() => { void handleExport(); }} className="text-sm px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{STRINGS.exportButton}</button>
          <label className="text-sm px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer">
            {STRINGS.importButton}
            <input type="file" accept=".json" onChange={(e) => { void handleImport(e); }} className="hidden" />
          </label>
        </div>
      </section>
      <button onClick={() => { void handleSaveSettings(); }} className="w-full py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700">{STRINGS.save} Settings</button>
    </div>
  );
}
