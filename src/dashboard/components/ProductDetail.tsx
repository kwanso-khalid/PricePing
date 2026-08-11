import React, { useCallback, useEffect, useState } from 'react';
import type { Product, ObservationHistory } from '../../types/storage.js';
import type { AlertEntry } from '../../lib/alertlog.js';
import { getHistory, updateProduct, removeProduct } from '../../lib/storage.js';
import { formatMoney } from '../../lib/money.js';
import { computeDiscountVerdict } from '../../lib/discount.js';
import { computeTrendLabel } from '../../lib/trend.js';
import { STRINGS } from '../../lib/strings.js';
import { PriceChart } from './PriceChart.js';
import { MetricsGrid } from './MetricsGrid.js';
import { DiscountBadge } from './DiscountBadge.js';

type RangeDays = 30 | 90 | 365 | null;

const RANGE_OPTIONS: Array<{ label: string; value: RangeDays }> = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '365d', value: 365 },
  { label: 'All', value: null },
];

interface ProductDetailProps {
  product: Product;
  onBack: () => void;
  onDelete: (id: string) => void;
  onProductUpdate: (product: Product) => void;
  alertEntries?: AlertEntry[];
}

export function ProductDetail({
  product,
  onBack: _onBack,
  onDelete,
  onProductUpdate,
  alertEntries = [],
}: ProductDetailProps) {
  const [history, setHistory] = useState<ObservationHistory | null>(null);
  const [rangeDays, setRangeDays] = useState<RangeDays>(90);
  const [targetPriceInput, setTargetPriceInput] = useState(
    product.watch.targetPrice !== null
      ? String(product.watch.targetPrice / 100)
      : '',
  );
  const [cooldownInput, setCooldownInput] = useState(
    String(product.watch.cooldownHours),
  );
  const [dropThresholdInput, setDropThresholdInput] = useState(
    product.watch.dropThresholdPct !== null
      ? String(product.watch.dropThresholdPct)
      : '',
  );
  const [notesInput, setNotesInput] = useState(product.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [checkingNow, setCheckingNow] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const h = await getHistory(product.id);
    setHistory(h);
  }, [product.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const verdict =
    history !== null
      ? computeDiscountVerdict(product.advertisedListPrice, history)
      : null;

  const trendLabel =
    history !== null
      ? computeTrendLabel(
          product.currentPrice,
          history,
          product.stats,
          rangeDays === null ? 'all' : rangeDays,
        )
      : null;

  async function handleSaveSettings() {
    setSaving(true);
    const targetPriceMinor =
      targetPriceInput.trim() !== ''
        ? Math.round(parseFloat(targetPriceInput) * 100)
        : null;
    const cooldownHours = Math.max(
      1,
      parseInt(cooldownInput, 10) || product.watch.cooldownHours,
    );
    const dropThresholdPct =
      dropThresholdInput.trim() !== ''
        ? Math.max(1, Math.min(99, parseFloat(dropThresholdInput)))
        : null;
    const updated: Product = {
      ...product,
      notes: notesInput,
      watch: {
        ...product.watch,
        targetPrice:
          !isNaN(targetPriceMinor ?? NaN) && targetPriceMinor !== null
            ? targetPriceMinor
            : null,
        cooldownHours,
        dropThresholdPct: !isNaN(dropThresholdPct ?? NaN) ? dropThresholdPct : null,
      },
    };
    const result = await updateProduct(updated);
    if (result.ok) {
      onProductUpdate(updated);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    }
    setSaving(false);
  }

  async function handleToggleMute() {
    const updated: Product = {
      ...product,
      watch: { ...product.watch, muted: !product.watch.muted },
    };
    await updateProduct(updated);
    onProductUpdate(updated);
  }

  async function handleToggleRestock() {
    const updated: Product = {
      ...product,
      watch: { ...product.watch, notifyOnRestock: !product.watch.notifyOnRestock },
    };
    await updateProduct(updated);
    onProductUpdate(updated);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await removeProduct(product.id);
    onDelete(product.id);
  }

  function handleCheckNow() {
    setCheckingNow(true);
    setCheckMsg(null);
    chrome.runtime.sendMessage({ type: 'CHECK_NOW_PRODUCT', productId: product.id }, (resp) => {
      void chrome.runtime.lastError;
      setCheckingNow(false);
      if (resp?.product) {
        onProductUpdate(resp.product as Product);
        void loadHistory();
        setCheckMsg(STRINGS.checkDone);
        setTimeout(() => setCheckMsg(null), 3000);
      }
    });
  }

  const fmt = (minor: number) =>
    formatMoney({ amountMinor: minor, currency: product.currency });

  const discountPct =
    product.advertisedListPrice !== null &&
    product.advertisedListPrice > 0 &&
    product.currentPrice < product.advertisedListPrice
      ? Math.round((1 - product.currentPrice / product.advertisedListPrice) * 100)
      : null;

  const stockLabel: Record<number, string> = {
    0: STRINGS.stockUnknown,
    1: STRINGS.stockInStock,
    2: STRINGS.stockOutOfStock,
    3: STRINGS.stockPreorder,
    4: STRINGS.stockLimited,
  };
  const stockColors: Record<number, string> = {
    1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    2: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    3: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    4: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Hero card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 flex gap-4">
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt=""
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border border-gray-100 dark:border-gray-700"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h2
                className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2"
                title={product.title}
              >
                {product.title}
              </h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                {checkMsg && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">{checkMsg}</span>
                )}
                <button
                  onClick={handleCheckNow}
                  disabled={checkingNow}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {checkingNow ? STRINGS.checking : STRINGS.checkNow}
                </button>
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Open ↗
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{product.retailerHost}</p>
            <div className="mt-3 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {fmt(product.currentPrice)}
              </span>
              {product.advertisedListPrice !== null && (
                <span className="text-sm text-gray-400 line-through">
                  {fmt(product.advertisedListPrice)}
                </span>
              )}
              {discountPct !== null && (
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {discountPct}% off
                </span>
              )}
              {product.stockState > 0 && stockLabel[product.stockState] && (
                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${stockColors[product.stockState] ?? ''}`}>
                  {stockLabel[product.stockState]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="border-t border-gray-100 dark:border-gray-700 grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700">
          <div className="px-4 py-3">
            <div className="text-xs text-gray-400 mb-0.5">All-time low</div>
            <div className="text-sm font-semibold text-green-600 dark:text-green-400">
              {product.stats.allTimeMin ? fmt(product.stats.allTimeMin.priceMinor) : '—'}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-400 mb-0.5">All-time high</div>
            <div className="text-sm font-semibold text-red-600 dark:text-red-400">
              {product.stats.allTimeMax ? fmt(product.stats.allTimeMax.priceMinor) : '—'}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-400 mb-0.5">Days tracked</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {Math.round(product.stats.daysTracked)}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs text-gray-400 mb-0.5">Observations</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {product.stats.observationCount}
            </div>
          </div>
        </div>
      </div>

      {/* Price history card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Price History</span>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setRangeDays(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  rangeDays === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pt-4 pb-5">
          {history === null ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              {STRINGS.loading}
            </div>
          ) : (
            <PriceChart
              history={history}
              currency={product.currency}
              rangeDays={rangeDays}
              advertisedListPrice={product.advertisedListPrice}
              targetPrice={product.watch.targetPrice}
              alertEntries={alertEntries}
              height={220}
            />
          )}
          {alertEntries.length > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              <span className="inline-block w-3 h-0.5 bg-purple-500 mr-1 align-middle" style={{ display: 'inline-block' }} />
              Purple markers show when you were notified
            </p>
          )}
          {trendLabel && (
            <div
              className={`mt-3 text-sm px-3 py-2 rounded-lg ${
                trendLabel.confidence === 'high'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'
              }`}
            >
              {trendLabel.label}
              {trendLabel.confidence === 'low' && (
                <span className="text-xs ml-2 opacity-60">(building history)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metrics card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{STRINGS.metricsTitle}</span>
        </div>
        <div className="p-5">
          <MetricsGrid
            stats={product.stats}
            currency={product.currency}
            parseStatus={product.parseStatus}
            parseTier={product.parseTier}
          />
        </div>
      </div>

      {/* Discount analysis */}
      {product.advertisedListPrice !== null && verdict !== null && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{STRINGS.discountSectionTitle}</span>
          </div>
          <div className="p-5">
            <DiscountBadge
              advertisedListPrice={product.advertisedListPrice}
              currentPrice={product.currentPrice}
              currency={product.currency}
              verdict={verdict}
            />
          </div>
        </div>
      )}

      {/* Alert settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{STRINGS.controlsTitle}</span>
        </div>
        <div className="p-5 space-y-4">

          {/* Price alert inputs */}
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {STRINGS.targetPriceLabel} ({product.currency})
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetPriceInput}
                onChange={(e) => setTargetPriceInput(e.target.value)}
                placeholder="e.g. 29.99"
                className="mt-1.5 w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {STRINGS.dropThresholdLabel}
              </span>
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                value={dropThresholdInput}
                onChange={(e) => setDropThresholdInput(e.target.value)}
                placeholder={STRINGS.dropThresholdPlaceholder}
                className="mt-1.5 w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {STRINGS.cooldownLabel}
              </span>
              <input
                type="number"
                min="1"
                max="720"
                value={cooldownInput}
                onChange={(e) => setCooldownInput(e.target.value)}
                className="mt-1.5 w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={product.watch.muted}
                onChange={() => { void handleToggleMute(); }}
                className="rounded"
              />
              {STRINGS.muteLabel}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={product.watch.notifyOnRestock}
                onChange={() => { void handleToggleRestock(); }}
                className="rounded"
              />
              {STRINGS.notifyOnRestockLabel}
            </label>
          </div>

          {/* Notes */}
          <label className="block">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {STRINGS.notesLabel}
            </span>
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder={STRINGS.notesPlaceholder}
              rows={2}
              className="mt-1.5 w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </label>

          <div className="flex items-center gap-4">
            <div className="flex-1" />
            {saveMsg && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400">{saveMsg}</span>
            )}
            <button
              onClick={() => { void handleSaveSettings(); }}
              disabled={saving}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
            >
              {STRINGS.save}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <button
              onClick={() => { void handleDelete(); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : STRINGS.delete}
            </button>
            {confirmDelete && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {STRINGS.cancel}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
