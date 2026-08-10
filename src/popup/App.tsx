import React, { useCallback, useEffect, useState } from 'react';
import type { ExtractedProduct, TrackedItem } from '../types/index.js';
import { getAllItems, saveItem, deleteItem, getItem } from '../lib/storage.js';
import { canonicalizeUrl, getHostname } from '../lib/url.js';
import { priceDifferencePercent } from '../lib/money.js';
import { STRINGS } from '../lib/strings.js';
import { TrackedItemCard } from './components/TrackedItemCard.js';
import { SaveProductPanel } from './components/SaveProductPanel.js';
import { v4 as uuidv4 } from 'uuid';

type SortKey = 'recent' | 'drop' | 'name' | 'added';
type View = 'list' | 'save';

interface PageInfo {
  url: string;
  title: string;
  tabId: number;
}

export default function App() {
  const [items, setItems] = useState<TrackedItem[]>([]);
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
      const all = await getAllItems();
      setItems(Object.values(all));
    } catch {
      setError(STRINGS.storageError);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  useEffect(() => {
    void loadItems();

    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url && tab.id !== undefined) {
        const canonUrl = canonicalizeUrl(tab.url);
        setPageInfo({ url: canonUrl, title: tab.title ?? '', tabId: tab.id });
      }
    });
  }, [loadItems]);

  // Check if current page is already tracked
  const alreadyTracked = Boolean(
    pageInfo && items.some((i) => i.url === pageInfo.url),
  );

  async function detectProduct() {
    if (!pageInfo) return;
    setDetecting(true);
    setView('save');

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: pageInfo.tabId },
        files: ['src/content/index.js'],
      });

      const result = results[0]?.result as { success: boolean; product: ExtractedProduct | null } | undefined;
      if (result?.success && result.product) {
        setDetectedProduct(result.product);
      } else {
        setDetectedProduct(null);
      }
    } catch {
      setDetectedProduct(null);
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave(targetPriceMinor: number | null) {
    if (!pageInfo || !detectedProduct) return;

    const now = Date.now();
    const newItem: TrackedItem = {
      id: uuidv4(),
      url: pageInfo.url,
      title: detectedProduct.title,
      imageUrl: detectedProduct.imageUrl,
      hostname: getHostname(pageInfo.url),
      currency: detectedProduct.currency,
      initialPrice: detectedProduct.price,
      currentPrice: detectedProduct.price,
      targetPrice:
        targetPriceMinor !== null
          ? { amountMinor: targetPriceMinor, currency: detectedProduct.currency }
          : null,
      history: [
        {
          price: detectedProduct.price,
          observedAt: now,
          inStock: detectedProduct.inStock,
        },
      ],
      createdAt: now,
      lastCheckedAt: null,
      lastNotifiedAt: null,
      lastNotifiedPriceMinor: null,
      consecutiveFailures: 0,
      paused: false,
      extractionMethod: detectedProduct.method,
    };

    const result = await saveItem(newItem);
    if (result.ok) {
      setSaveStatus(STRINGS.priceSaved);
      await loadItems();
      setTimeout(() => {
        setView('list');
        setSaveStatus(null);
      }, 1500);
    } else {
      setSaveStatus(STRINGS.saveFailed);
    }
  }

  async function handleManualPrice(priceStr: string) {
    // For now, create a partial product with manual price
    const { parsePrice } = await import('../lib/money.js');
    const result = parsePrice(priceStr);
    if (result.ok && pageInfo) {
      setDetectedProduct({
        title: pageInfo.title || 'Product',
        price: result.value,
        imageUrl: null,
        currency: result.value.currency,
        inStock: true,
        confidence: 1.0,
        method: 'manual',
      });
    }
  }

  async function handleDelete(id: string) {
    await deleteItem(id);
    await loadItems();
  }

  async function handleTogglePause(id: string) {
    const item = await getItem(id);
    if (!item) return;
    const updated = { ...item, paused: !item.paused };
    await saveItem(updated);
    await loadItems();
  }

  async function handleSetTargetPrice(id: string, priceMinor: number | null) {
    const item = await getItem(id);
    if (!item) return;
    const updated = {
      ...item,
      targetPrice:
        priceMinor !== null ? { amountMinor: priceMinor, currency: item.currency } : null,
    };
    await saveItem(updated);
    await loadItems();
  }

  const sortedItems = [...items].sort((a, b) => {
    switch (sortKey) {
      case 'recent': {
        const aChange = a.lastCheckedAt ?? a.createdAt;
        const bChange = b.lastCheckedAt ?? b.createdAt;
        return bChange - aChange;
      }
      case 'drop': {
        const aDrop = priceDifferencePercent(a.initialPrice, a.currentPrice);
        const bDrop = priceDifferencePercent(b.initialPrice, b.currentPrice);
        return aDrop - bDrop; // most negative first
      }
      case 'name':
        return a.title.localeCompare(b.title);
      case 'added':
        return b.createdAt - a.createdAt;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-base font-bold text-blue-600 dark:text-blue-400">
          {STRINGS.appName}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              void detectProduct();
            }}
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={!pageInfo}
          >
            + {STRINGS.save}
          </button>
          <a
            href={chrome.runtime.getURL('src/options/index.html')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title={STRINGS.viewOptions}
          >
            ⚙
          </a>
        </div>
      </div>

      {/* Save status */}
      {saveStatus && (
        <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm text-center">
          {saveStatus}
        </div>
      )}

      {/* Save panel */}
      {view === 'save' && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">{STRINGS.saveForTracking}</span>
            <button
              onClick={() => { setView('list'); setDetectedProduct(null); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {STRINGS.close}
            </button>
          </div>
          <SaveProductPanel
            product={detectedProduct}
            loading={detecting}
            alreadyTracked={alreadyTracked}
            onSave={(target) => { void handleSave(target); }}
            onManualPrice={(price) => { void handleManualPrice(price); }}
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 text-center text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="p-4 text-center text-gray-400 text-sm" role="status">
          {STRINGS.loading}
        </div>
      )}

      {/* Item list */}
      {!loading && !error && view === 'list' && (
        <div className="p-3">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">{STRINGS.noTrackedItems}</p>
              <p className="text-gray-300 text-xs mt-1">{STRINGS.noTrackedItemsHint}</p>
            </div>
          ) : (
            <>
              {/* Sort controls */}
              <div className="flex gap-1 mb-3 overflow-x-auto">
                {(['recent', 'drop', 'name', 'added'] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSortKey(key)}
                    className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
                      sortKey === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {
                      {
                        recent: STRINGS.sortByRecent,
                        drop: STRINGS.sortByDrop,
                        name: STRINGS.sortByName,
                        added: STRINGS.sortByAdded,
                      }[key]
                    }
                  </button>
                ))}
              </div>

              {sortedItems.map((item) => (
                <TrackedItemCard
                  key={item.id}
                  item={item}
                  onDelete={(id) => { void handleDelete(id); }}
                  onTogglePause={(id) => { void handleTogglePause(id); }}
                  onSetTargetPrice={(id, price) => { void handleSetTargetPrice(id, price); }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Make sure items load correctly
App.displayName = 'App';
