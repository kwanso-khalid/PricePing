import React, { useCallback, useEffect, useState } from 'react';
import type { ProductSummary, Product } from '../types/storage.js';
import { getProductIndex, getProduct } from '../lib/storage.js';
import { getAlertLog } from '../lib/alertlog.js';
import type { AlertLogData, AlertEntry } from '../lib/alertlog.js';
import { STRINGS } from '../lib/strings.js';
import { DashboardList } from './components/DashboardList.js';
import { ProductDetail } from './components/ProductDetail.js';
import { ExportPanel } from './components/ExportPanel.js';
import { formatMoney } from '../lib/money.js';

type Tab = 'products' | 'alerts';

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return `${days}d ago`;
}

function AlertLogView({ entries }: { entries: AlertEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">{STRINGS.noAlerts}</div>
    );
  }
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {entries.map((entry) => {
        const oldStr = formatMoney({ amountMinor: entry.oldPriceMinor, currency: entry.currency });
        const newStr = formatMoney({ amountMinor: entry.newPriceMinor, currency: entry.currency });
        const pct = entry.changePercent.toFixed(1);
        const sign = entry.changePercent > 0 ? '+' : '';
        return (
          <div
            key={entry.id}
            className={`px-4 py-3 flex items-start gap-3 ${entry.seen ? '' : 'bg-blue-50 dark:bg-blue-900/20'}`}
          >
            {!entry.seen && (
              <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="unseen" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {entry.productTitle}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {oldStr} → {newStr}{' '}
                <span className={entry.changePercent <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  ({sign}{pct}%)
                </span>
              </p>
              {entry.trendLabel && (
                <p className="text-xs text-gray-400 mt-0.5">{entry.trendLabel}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(entry.firedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [summaries, setSummaries] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [alertLog, setAlertLog] = useState<AlertLogData>({ entries: [] });

  const loadSummaries = useCallback(async () => {
    try {
      const idx = await getProductIndex();
      setSummaries(idx);
    } catch {
      setError(STRINGS.error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlertLog = useCallback(async () => {
    const log = await getAlertLog();
    setAlertLog(log);
  }, []);

  useEffect(() => {
    void loadSummaries();
    void loadAlertLog();
  }, [loadSummaries, loadAlertLog]);

  // On mount, tell the background to mark all alerts seen and clear the badge
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'MARK_ALERTS_SEEN' }, () => {
      // Ignore errors (e.g. if SW is not running yet)
      void chrome.runtime.lastError;
    });
  }, []);

  async function handleSelect(id: string) {
    const product = await getProduct(id);
    if (product) setSelectedProduct(product);
  }

  function handleBack() {
    setSelectedProduct(null);
  }

  function handleDelete(id: string) {
    setSummaries((prev) => prev.filter((s) => s.id !== id));
    setSelectedProduct(null);
  }

  function handleProductUpdate(updated: Product) {
    setSelectedProduct(updated);
    setSummaries((prev) =>
      prev.map((s) =>
        s.id === updated.id
          ? {
              ...s,
              watch: { targetPrice: updated.watch.targetPrice, muted: updated.watch.muted },
            }
          : s,
      ),
    );
  }

  async function handleMarkAllSeen() {
    const { markAlertsSeen } = await import('../lib/alertlog.js');
    await markAlertsSeen();
    await loadAlertLog();
    chrome.runtime.sendMessage({ type: 'MARK_ALERTS_SEEN' }, () => {
      void chrome.runtime.lastError;
    });
  }

  const unseenCount = alertLog.entries.filter((e) => !e.seen).length;

  // Breadcrumb / top-bar title
  const topBarTitle =
    activeTab === 'alerts'
      ? STRINGS.alertsTab
      : selectedProduct
        ? selectedProduct.title
        : STRINGS.listTab;

  return (
    <div className="flex h-screen text-gray-900 dark:text-gray-100">
      {/* Left sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-2">
          {/* Inline price tag SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5 text-blue-600"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17.707 9.293a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-7-7A.997.997 0 0 1 2 10V5a3 3 0 0 1 3-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-base font-bold text-blue-600 dark:text-blue-400 tracking-tight">
            PricePing
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 flex flex-col gap-1">
          <button
            onClick={() => { setActiveTab('products'); setSelectedProduct(null); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'products'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span>{STRINGS.listTab}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
              {summaries.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('alerts'); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'alerts'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span>{STRINGS.alertsTab}</span>
            {unseenCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {unseenCount > 99 ? '99+' : unseenCount}
              </span>
            )}
          </button>
        </nav>

        {/* Export panel at bottom */}
        <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800">
          <ExportPanel
            summaries={summaries}
            onImportComplete={() => { void loadSummaries(); }}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 z-10 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {selectedProduct && activeTab === 'products' && (
              <button
                onClick={handleBack}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
              >
                {STRINGS.backToList}
              </button>
            )}
            {selectedProduct && activeTab === 'products' && (
              <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">/</span>
            )}
            <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
              {topBarTitle}
            </h1>
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
            {summaries.length} product{summaries.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-gray-950">
          {/* Error */}
          {error && (
            <div className="p-4 text-center text-red-600 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && !error && (
            <div className="p-4 text-center text-gray-400 text-sm" role="status">
              {STRINGS.loading}
            </div>
          )}

          {/* Content */}
          {!loading && !error && (
            <>
              {activeTab === 'alerts' ? (
                <div className="max-w-3xl mx-auto px-6 py-6">
                  {unseenCount > 0 && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => { void handleMarkAllSeen(); }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {STRINGS.markAllSeen}
                      </button>
                    </div>
                  )}
                  <AlertLogView entries={alertLog.entries} />
                </div>
              ) : selectedProduct ? (
                <div className="px-6 py-6">
                  <ProductDetail
                    product={selectedProduct}
                    onBack={handleBack}
                    onDelete={handleDelete}
                    onProductUpdate={handleProductUpdate}
                    alertEntries={alertLog.entries.filter((e) => e.productId === selectedProduct.id)}
                  />
                </div>
              ) : (
                <div className="px-6 py-6">
                  <DashboardList
                    summaries={summaries}
                    onSelect={(id) => { void handleSelect(id); }}
                    onSummariesChange={() => { void loadSummaries(); }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

App.displayName = 'App';
