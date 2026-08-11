import React, { useState } from 'react';
import type { ProductSummary, StockStateCode } from '../../types/storage.js';
import { formatMoney, parsePrice, priceDifferencePercent } from '../../lib/money.js';
import { SparklineChart } from './SparklineChart.js';
import { STRINGS } from '../../lib/strings.js';

interface TrackedItemCardProps {
  item: ProductSummary;
  onDelete: (id: string) => void;
  onTogglePause: (id: string) => void;
  onSetTargetPrice: (id: string, price: number | null) => void;
  onCheckNow: (id: string) => void;
}

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function StockBadge({ state }: { state: StockStateCode }) {
  if (state === 2) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {STRINGS.stockOutOfStock}
      </span>
    );
  }
  if (state === 3) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        {STRINGS.stockPreorder}
      </span>
    );
  }
  if (state === 4) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        {STRINGS.stockLimited}
      </span>
    );
  }
  return null; // in_stock (1) or unknown (0) — no badge needed
}

export function TrackedItemCard({ item, onDelete, onTogglePause, onSetTargetPrice, onCheckNow }: TrackedItemCardProps) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [checkingNow, setCheckingNow] = useState(false);

  const currentMoney = { amountMinor: item.currentPrice, currency: item.currency };
  const initialMoney = { amountMinor: item.initialPriceMinor, currency: item.currency };
  const priceChange = priceDifferencePercent(initialMoney, currentMoney);
  const priceDropped = priceChange < 0;
  const priceRose = priceChange > 0;
  const isPaused = item.parseStatus !== 'ok';
  const needsAttention = item.parseStatus === 'paused';
  const lastChecked = item.lastCheckedAt ? timeAgo(item.lastCheckedAt) : STRINGS.neverChecked;

  function handleSaveTarget() {
    if (!targetInput.trim()) { onSetTargetPrice(item.id, null); setEditingTarget(false); return; }
    const result = parsePrice(targetInput, item.currency);
    if (result.ok) { onSetTargetPrice(item.id, result.value.amountMinor); setEditingTarget(false); setTargetInput(''); }
  }

  async function handleCheckNow() {
    setCheckingNow(true);
    onCheckNow(item.id);
    // Visual feedback — the parent reloads data when done
    setTimeout(() => setCheckingNow(false), 8000);
  }

  return (
    <div className={`border rounded-lg p-3 mb-2 bg-white dark:bg-gray-800 ${isPaused ? 'opacity-60' : ''} ${needsAttention ? 'border-red-300' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex gap-2">
        {item.imageUrl && (
          <img src={item.imageUrl} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="flex-1 min-w-0">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 line-clamp-2" title={item.title}>
            {item.title}
          </a>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-base font-bold text-gray-900 dark:text-white">{formatMoney(currentMoney)}</span>
            {priceDropped && <span className="text-xs font-medium text-green-600 dark:text-green-400">{priceChange.toFixed(1)}%</span>}
            {priceRose && <span className="text-xs font-medium text-red-500 dark:text-red-400">+{priceChange.toFixed(1)}%</span>}
            <StockBadge state={item.stockState} />
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {STRINGS.originalPrice}: {formatMoney(initialMoney)}
            {item.watch.targetPrice !== null && (
              <> · {STRINGS.targetPrice}: {formatMoney({ amountMinor: item.watch.targetPrice, currency: item.currency })}</>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <SparklineChart points={item.sparklinePoints} width={60} height={28} color={priceDropped ? '#16a34a' : '#3b82f6'} />
        </div>
      </div>
      {needsAttention && <div className="mt-2 text-xs text-red-600 dark:text-red-400">⚠ {STRINGS.needsAttention}</div>}
      {isPaused && !needsAttention && <div className="mt-1 text-xs text-gray-400">{STRINGS.paused}</div>}
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {STRINGS.lastChecked}: {lastChecked}
      </div>
      {editingTarget && (
        <div className="mt-2 flex gap-1">
          <input type="text" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}
            placeholder={STRINGS.targetPricePlaceholder}
            className="text-xs border rounded px-2 py-1 flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTarget(); if (e.key === 'Escape') setEditingTarget(false); }}
            autoFocus />
          <button onClick={handleSaveTarget} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">{STRINGS.save}</button>
          <button onClick={() => setEditingTarget(false)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">{STRINGS.cancel}</button>
        </div>
      )}
      <div className="flex gap-1 mt-2">
        <button onClick={() => { void handleCheckNow(); }} disabled={checkingNow}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 disabled:opacity-50"
          title={STRINGS.checkNow}>
          {checkingNow ? STRINGS.checking : '↻'}
        </button>
        <button onClick={() => onTogglePause(item.id)}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          title={isPaused ? STRINGS.resumeTracking : STRINGS.pauseTracking}>
          {isPaused ? '▶' : '⏸'}
        </button>
        <button onClick={() => { setEditingTarget(true); setTargetInput(''); }}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          title={STRINGS.editTargetPrice}>🎯</button>
        <button onClick={() => onDelete(item.id)}
          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
          title={STRINGS.deleteItem}>🗑</button>
      </div>
    </div>
  );
}
