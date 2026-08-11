import React, { useCallback, useEffect, useState } from 'react';
import type { ProductSummary, Product, Observation, StockStateCode, ParseTier } from '../types/storage.js';
import type { ExtractedProduct } from '../types/index.js';
import { getProductIndex, addProduct, removeProduct, getProduct, updateProduct } from '../lib/storage.js';
import { canonicalKey } from '../lib/canonical.js';
import { canonicalizeUrl, getHostname } from '../lib/url.js';
import { priceDifferencePercent } from '../lib/money.js';
import { STRINGS } from '../lib/strings.js';
import { TrackedItemCard } from './components/TrackedItemCard.js';
import { SaveProductPanel } from './components/SaveProductPanel.js';
import { v4 as uuidv4 } from 'uuid';

type SortKey = 'recent' | 'drop' | 'name' | 'added';
type View = 'list' | 'save';
interface PageInfo { url: string; title: string; tabId: number; }

function methodToTier(method: ExtractedProduct['method']): ParseTier {
  if (method === 'adapter' || method === 'shopify' || method === 'woocommerce') return 2;
  if (method === 'generic') return 3;
  return 1;
}

const EMPTY_STATS = {
  observationCount: 0, changeCount: 0, daysTracked: 0, lastChangeAt: null,
  allTimeMin: null, allTimeMax: null, w30: null, w90: null, w365: null,
};

export default function App() {
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [view, setView] = useState<View>('list');
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [detectedProduct, setDetectedProduct] = useState<ExtractedProduct | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setItems(await getProductIndex());
    } catch {
      setError(STRINGS.storageError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url && tab.id !== undefined) {
        setPageInfo({ url: canonicalizeUrl(tab.url), title: tab.title ?? '', tabId: tab.id });
      }
    });
  }, [loadItems]);

  const alreadyTracked = Boolean(pageInfo && items.some((i) => i.url === pageInfo.url));

  async function detectProduct() {
    if (!pageInfo) return;
    setDetecting(true);
    setView('save');
    try {
      // Always re-inject to get a fresh extraction for the current page.
      // A guard that skips injection when __priceping_result__ exists causes
      // stale results to persist on SPAs where the window is never reset between navigations.
      await chrome.scripting.executeScript({ target: { tabId: pageInfo.tabId }, files: ['src/content/index.js'] });
      const retrieval = await chrome.scripting.executeScript({
        target: { tabId: pageInfo.tabId },
        func: () => (window as unknown as Record<string, unknown>)['__priceping_result__'] as { success: boolean; product: unknown } | undefined,
      });
      const result = retrieval[0]?.result as { success: boolean; product: ExtractedProduct | null } | undefined;
      setDetectedProduct(result?.success && result.product ? result.product : null);
    } catch {
      setDetectedProduct(null);
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave(targetPriceMinor: number | null) {
    if (!pageInfo || !detectedProduct) return;
    try {
      const now = Date.now();
      const id = uuidv4();
      const cKey = await canonicalKey(pageInfo.url);
      const tier = methodToTier(detectedProduct.method);
      const stockState: StockStateCode = detectedProduct.inStock ? 1 : 2;
      const firstObs: Observation = [
        Math.floor(now / 60_000),
        detectedProduct.price.amountMinor,
        detectedProduct.advertisedListPrice?.amountMinor ?? 0,
        stockState,
        tier,
      ];
      const product: Product = {
        id, retailerHost: getHostname(pageInfo.url), url: pageInfo.url, canonicalKey: cKey,
        title: detectedProduct.title, imageUrl: detectedProduct.imageUrl, variantLabel: null,
        currency: detectedProduct.currency,
        initialPriceMinor: detectedProduct.price.amountMinor,
        currentPrice: detectedProduct.price.amountMinor,
        advertisedListPrice: detectedProduct.advertisedListPrice?.amountMinor ?? null,
        stockState, lastKnownStockState: stockState,
        parseStatus: 'ok', parseTier: tier, consecutiveFailures: 0,
        lastCheckedAt: null, lastSuccessfulParseAt: now, createdAt: now,
        notes: '',
        watch: {
          targetPrice: targetPriceMinor, cooldownHours: 24, muted: false,
          lastAlertedPrice: null, lastAlertedAt: null,
          notifyOnRestock: false, dropThresholdPct: null,
        },
        stats: { ...EMPTY_STATS },
      };
      const result = await addProduct(product, firstObs);
      if (result.ok) {
        setSaveStatus(STRINGS.priceSaved);
        await loadItems();
        setTimeout(() => { setView('list'); setSaveStatus(null); }, 1500);
      } else {
        setSaveStatus(result.error);
      }
    } catch (e) {
      setSaveStatus(e instanceof Error ? e.message : STRINGS.saveFailed);
    }
  }

  async function handleManualPrice(priceStr: string) {
    const { parsePrice } = await import('../lib/money.js');
    const result = parsePrice(priceStr);
    if (result.ok && pageInfo) {
      setDetectedProduct({
        title: pageInfo.title || 'Product', price: result.value, imageUrl: null,
        currency: result.value.currency, advertisedListPrice: null,
        inStock: true, confidence: 1.0, method: 'manual',
      });
    }
  }

  async function handleDelete(id: string) {
    await removeProduct(id);
    await loadItems();
  }

  async function handleTogglePause(id: string) {
    const product = await getProduct(id);
    if (!product) return;
    await updateProduct({ ...product, parseStatus: product.parseStatus !== 'ok' ? 'ok' : 'paused' });
    await loadItems();
  }

  async function handleSetTargetPrice(id: string, priceMinor: number | null) {
    const product = await getProduct(id);
    if (!product) return;
    await updateProduct({ ...product, watch: { ...product.watch, targetPrice: priceMinor } });
    await loadItems();
  }

  function handleCheckNow(id: string) {
    chrome.runtime.sendMessage({ type: 'CHECK_NOW_PRODUCT', productId: id }, () => {
      void chrome.runtime.lastError; // ignore SW-not-running errors
      void loadItems();
    });
  }

  const sortedItems = [...items].sort((a, b) => {
    switch (sortKey) {
      case 'recent': return (b.lastCheckedAt ?? b.createdAt) - (a.lastCheckedAt ?? a.createdAt);
      case 'drop':
        return priceDifferencePercent({ amountMinor: a.initialPriceMinor, currency: a.currency }, { amountMinor: a.currentPrice, currency: a.currency }) -
               priceDifferencePercent({ amountMinor: b.initialPriceMinor, currency: b.currency }, { amountMinor: b.currentPrice, currency: b.currency });
      case 'name': return a.title.localeCompare(b.title);
      case 'added': return b.createdAt - a.createdAt;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-base font-bold text-blue-600 dark:text-blue-400">{STRINGS.appName}</h1>
        <div className="flex gap-2">
          <button onClick={() => { void detectProduct(); }} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={!pageInfo}>
            + {STRINGS.save}
          </button>
          <button
            onClick={() => { void chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') }); }}
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title={STRINGS.openDashboard}
          >
            {STRINGS.openDashboard}
          </button>
          <a href={chrome.runtime.getURL('src/options/index.html')} target="_blank" rel="noopener noreferrer"
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" title={STRINGS.viewOptions}>⚙</a>
        </div>
      </div>
      {saveStatus && <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm text-center">{saveStatus}</div>}
      {view === 'save' && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">{STRINGS.saveForTracking}</span>
            <button onClick={() => { setView('list'); setDetectedProduct(null); }} className="text-xs text-gray-400 hover:text-gray-600">{STRINGS.close}</button>
          </div>
          <SaveProductPanel product={detectedProduct} loading={detecting} alreadyTracked={alreadyTracked}
            onSave={(t) => { void handleSave(t); }} onManualPrice={(p) => { void handleManualPrice(p); }} />
        </div>
      )}
      {error && <div className="p-4 text-center text-red-600 text-sm" role="alert">{error}</div>}
      {loading && !error && <div className="p-4 text-center text-gray-400 text-sm" role="status">{STRINGS.loading}</div>}
      {!loading && !error && view === 'list' && (
        <div className="p-3">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">{STRINGS.noTrackedItems}</p>
              <p className="text-gray-300 text-xs mt-1">{STRINGS.noTrackedItemsHint}</p>
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-3 overflow-x-auto">
                {(['recent', 'drop', 'name', 'added'] as SortKey[]).map((key) => (
                  <button key={key} onClick={() => setSortKey(key)}
                    className={`text-xs px-2 py-1 rounded whitespace-nowrap ${sortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {{ recent: STRINGS.sortByRecent, drop: STRINGS.sortByDrop, name: STRINGS.sortByName, added: STRINGS.sortByAdded }[key]}
                  </button>
                ))}
              </div>
              {sortedItems.map((item) => (
                <TrackedItemCard key={item.id} item={item}
                  onDelete={(id) => { void handleDelete(id); }}
                  onTogglePause={(id) => { void handleTogglePause(id); }}
                  onSetTargetPrice={(id, p) => { void handleSetTargetPrice(id, p); }}
                  onCheckNow={(id) => handleCheckNow(id)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

App.displayName = 'App';
