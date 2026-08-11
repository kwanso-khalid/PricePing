import React, { useRef, useState } from 'react';
import type { ProductSummary, Product, ObservationHistory } from '../../types/storage.js';
import { getProduct, getHistory, addProduct } from '../../lib/storage.js';
import { exportToJson, exportToCsv, importFromJson } from '../../lib/export.js';
import { canonicalKey } from '../../lib/canonical.js';
import { STRINGS } from '../../lib/strings.js';
import type { Observation } from '../../types/storage.js';

interface ExportPanelProps {
  summaries: ProductSummary[];
  onImportComplete: () => void;
}

export function ExportPanel({ summaries, onImportComplete }: ExportPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExportJson() {
    try {
      const products: Product[] = [];
      const histories: Record<string, ObservationHistory> = {};

      for (const s of summaries) {
        const [p, h] = await Promise.all([getProduct(s.id), getHistory(s.id)]);
        if (p) {
          products.push(p);
          if (h) histories[s.id] = h;
        }
      }

      const json = exportToJson(products, histories);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `priceping-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatus(STRINGS.exportFailed);
    }
  }

  function handleExportCsv() {
    try {
      const csv = exportToCsv(summaries);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `priceping-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatus(STRINGS.exportFailed);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { products } = await importFromJson(text);
      let imported = 0;
      for (const p of products) {
        const cKey = await canonicalKey(p.url);
        const updated = { ...p, canonicalKey: cKey };
        const seedObs: Observation = [
          Math.floor((p.createdAt ?? Date.now()) / 60_000),
          p.currentPrice,
          p.advertisedListPrice ?? 0,
          p.stockState ?? 1,
          p.parseTier ?? 1,
        ];
        const result = await addProduct(updated, seedObs);
        if (result.ok) imported++;
      }
      setStatus(STRINGS.importSuccess(imported));
      onImportComplete();
    } catch {
      setStatus(STRINGS.importFailed);
    }
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      {status && (
        <p className="text-sm text-blue-600 dark:text-blue-400">{status}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { void handleExportJson(); }}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {STRINGS.exportJson}
        </button>
        <button
          onClick={handleExportCsv}
          className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          {STRINGS.exportCsv}
        </button>
        <label className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer">
          {STRINGS.importJson}
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={(e) => { void handleImport(e); }}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
