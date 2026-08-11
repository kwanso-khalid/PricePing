import React from 'react';
import type { ProductSummary, StockStateCode } from '../../types/storage.js';
import { formatMoney, priceDifferencePercent } from '../../lib/money.js';
import { STRINGS } from '../../lib/strings.js';
import { SparklineChart } from '../../popup/components/SparklineChart.js';
import { DiscountBadge } from './DiscountBadge.js';
import { getProduct, updateProduct, removeProduct } from '../../lib/storage.js';

type SortKey =
  | 'title'
  | 'price'
  | 'change'
  | 'atl'
  | 'aboveLow'
  | 'days'
  | 'obs';

interface DashboardListProps {
  summaries: ProductSummary[];
  onSelect: (id: string) => void;
  onSummariesChange?: () => void;
}

interface Filters {
  retailer: string | null;
  droppedOnly: boolean;
  pausedOnly: boolean;
  discountOnly: boolean;
  outOfStockOnly: boolean;
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1 text-blue-500">
          {dir === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </th>
  );
}

function StatusPill({ status }: { status: ProductSummary['parseStatus'] }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Active
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      Blocked
    </span>
  );
}

function StockPill({ state }: { state: StockStateCode }) {
  if (state === 2) return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
      Out
    </span>
  );
  if (state === 3) return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
      Pre
    </span>
  );
  if (state === 4) return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      Ltd
    </span>
  );
  return null;
}

function PctChange({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.01) return <span className="text-gray-400">—</span>;
  const cls =
    pct < 0
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';
  return (
    <span className={cls}>
      {pct > 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'px-3 py-1.5 text-xs font-medium rounded-full bg-blue-600 text-white'
          : 'px-3 py-1.5 text-xs font-medium rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
      }
    >
      {label}
    </button>
  );
}

export function DashboardList({ summaries, onSelect, onSummariesChange }: DashboardListProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>('days');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filters, setFilters] = React.useState<Filters>({
    retailer: null,
    droppedOnly: false,
    pausedOnly: false,
    discountOnly: false,
    outOfStockOnly: false,
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = React.useState(false);

  const retailers = Array.from(new Set(summaries.map((s) => s.retailerHost))).sort();

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set(); // deselect all
      return new Set(ids);
    });
  }

  async function handleBulkMute(mute: boolean) {
    setBulkWorking(true);
    for (const id of selected) {
      const p = await getProduct(id);
      if (p) await updateProduct({ ...p, watch: { ...p.watch, muted: mute } });
    }
    setSelected(new Set());
    setBulkWorking(false);
    onSummariesChange?.();
  }

  async function handleBulkDelete() {
    setBulkWorking(true);
    for (const id of selected) {
      await removeProduct(id);
    }
    setSelected(new Set());
    setBulkWorking(false);
    onSummariesChange?.();
  }

  const filtered = summaries
    .filter(
      (s) =>
        !searchQuery ||
        s.title.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((s) => !filters.retailer || s.retailerHost === filters.retailer)
    .filter(
      (s) => !filters.droppedOnly || s.currentPrice < s.initialPriceMinor,
    )
    .filter(
      (s) =>
        !filters.pausedOnly || s.parseStatus !== 'ok',
    )
    .filter(
      (s) =>
        !filters.discountOnly ||
        (s.advertisedListPrice !== null && s.advertisedListPrice > s.currentPrice),
    )
    .filter(
      (s) => !filters.outOfStockOnly || s.stockState === 2,
    );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'price':
        cmp = a.currentPrice - b.currentPrice;
        break;
      case 'change':
        cmp =
          priceDifferencePercent(
            { amountMinor: a.initialPriceMinor, currency: a.currency },
            { amountMinor: a.currentPrice, currency: a.currency },
          ) -
          priceDifferencePercent(
            { amountMinor: b.initialPriceMinor, currency: b.currency },
            { amountMinor: b.currentPrice, currency: b.currency },
          );
        break;
      case 'atl':
        cmp =
          (a.stats.allTimeMin?.priceMinor ?? 0) -
          (b.stats.allTimeMin?.priceMinor ?? 0);
        break;
      case 'aboveLow': {
        const atlA = a.stats.allTimeMin?.priceMinor ?? a.currentPrice;
        const atlB = b.stats.allTimeMin?.priceMinor ?? b.currentPrice;
        cmp =
          (a.currentPrice - atlA) / atlA - (b.currentPrice - atlB) / atlB;
        break;
      }
      case 'days':
        cmp = a.stats.daysTracked - b.stats.daysTracked;
        break;
      case 'obs':
        cmp = a.stats.observationCount - b.stats.observationCount;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const sortedIds = sorted.map((s) => s.id);
  const allSelected = sortedIds.length > 0 && sortedIds.every((id) => selected.has(id));

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={STRINGS.searchPlaceholder}
          className="flex-1 min-w-40 h-9 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm text-sm px-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <select
          value={filters.retailer ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              retailer: e.target.value || null,
            }))
          }
          className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="">All retailers</option>
          {retailers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <FilterChip
          label={STRINGS.filterDropped}
          active={filters.droppedOnly}
          onClick={() => setFilters((f) => ({ ...f, droppedOnly: !f.droppedOnly }))}
        />
        <FilterChip
          label={STRINGS.filterPaused}
          active={filters.pausedOnly}
          onClick={() => setFilters((f) => ({ ...f, pausedOnly: !f.pausedOnly }))}
        />
        <FilterChip
          label={STRINGS.filterDiscount}
          active={filters.discountOnly}
          onClick={() => setFilters((f) => ({ ...f, discountOnly: !f.discountOnly }))}
        />
        <FilterChip
          label="Out of stock"
          active={filters.outOfStockOnly}
          onClick={() => setFilters((f) => ({ ...f, outOfStockOnly: !f.outOfStockOnly }))}
        />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            {STRINGS.bulkSelected(selected.size)}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => { void handleBulkMute(true); }}
            disabled={bulkWorking}
            className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 disabled:opacity-50"
          >
            {STRINGS.bulkMute}
          </button>
          <button
            onClick={() => { void handleBulkMute(false); }}
            disabled={bulkWorking}
            className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 disabled:opacity-50"
          >
            {STRINGS.bulkUnmute}
          </button>
          <button
            onClick={() => { void handleBulkDelete(); }}
            disabled={bulkWorking}
            className="text-xs px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"
          >
            {STRINGS.bulkDelete}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="py-24 flex flex-col items-center gap-2">
          <p className="text-gray-400 text-sm font-medium">
            {STRINGS.noProducts}
          </p>
          <p className="text-gray-300 text-xs">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {/* Checkbox */}
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => toggleSelectAll(sortedIds)}
                    className="rounded"
                  />
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-10">
                  {/* image */}
                </th>
                <SortHeader
                  label={STRINGS.columnTitle}
                  sortKey="title"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnPrice}
                  sortKey="price"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnChange}
                  sortKey="change"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnAllTimeLow}
                  sortKey="atl"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnAboveLow}
                  sortKey="aboveLow"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnDays}
                  sortKey="days"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={STRINGS.columnObs}
                  sortKey="obs"
                  currentSort={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  {STRINGS.columnSpark}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  Stock
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  {STRINGS.columnDiscount}
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  {STRINGS.columnStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const atl = s.stats.allTimeMin?.priceMinor ?? s.currentPrice;
                const aboveLow =
                  atl > 0
                    ? ((s.currentPrice - atl) / atl) * 100
                    : 0;
                const changePct = priceDifferencePercent(
                  { amountMinor: s.initialPriceMinor, currency: s.currency },
                  { amountMinor: s.currentPrice, currency: s.currency },
                );
                const isSelected = selected.has(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors ${isSelected ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(s.id)}
                        className="rounded"
                      />
                    </td>
                    {/* Thumbnail */}
                    <td className="px-2 py-2 cursor-pointer" onClick={() => onSelect(s.id)}>
                      {s.imageUrl ? (
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="w-8 h-8 object-cover rounded"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-gray-300 text-xs">
                          ?
                        </div>
                      )}
                    </td>
                    {/* Title + retailer */}
                    <td className="px-2 py-2 max-w-xs cursor-pointer" onClick={() => onSelect(s.id)}>
                      <div
                        className="font-medium text-gray-900 dark:text-gray-100 truncate"
                        title={s.title}
                      >
                        {s.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {s.retailerHost}
                      </div>
                    </td>
                    {/* Current price */}
                    <td className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap cursor-pointer" onClick={() => onSelect(s.id)}>
                      {formatMoney({
                        amountMinor: s.currentPrice,
                        currency: s.currency,
                      })}
                    </td>
                    {/* Change since added */}
                    <td className="px-2 py-2 whitespace-nowrap cursor-pointer" onClick={() => onSelect(s.id)}>
                      <PctChange pct={changePct} />
                    </td>
                    {/* All-time low */}
                    <td className="px-2 py-2 whitespace-nowrap text-green-600 dark:text-green-400 cursor-pointer" onClick={() => onSelect(s.id)}>
                      {s.stats.allTimeMin
                        ? formatMoney({
                            amountMinor: s.stats.allTimeMin.priceMinor,
                            currency: s.currency,
                          })
                        : '—'}
                    </td>
                    {/* % above ATL */}
                    <td className="px-2 py-2 whitespace-nowrap cursor-pointer" onClick={() => onSelect(s.id)}>
                      {aboveLow > 0.5 ? (
                        <span className="text-orange-600 dark:text-orange-400">
                          +{aboveLow.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">
                          ATL
                        </span>
                      )}
                    </td>
                    {/* Days tracked */}
                    <td className="px-2 py-2 text-gray-500 dark:text-gray-400 cursor-pointer" onClick={() => onSelect(s.id)}>
                      {Math.round(s.stats.daysTracked)}
                    </td>
                    {/* Observations */}
                    <td className="px-2 py-2 text-gray-500 dark:text-gray-400 cursor-pointer" onClick={() => onSelect(s.id)}>
                      {s.stats.observationCount}
                    </td>
                    {/* Sparkline */}
                    <td className="px-2 py-2 cursor-pointer" onClick={() => onSelect(s.id)}>
                      <SparklineChart points={s.sparklinePoints} />
                    </td>
                    {/* Stock state */}
                    <td className="px-2 py-2 cursor-pointer" onClick={() => onSelect(s.id)}>
                      <StockPill state={s.stockState} />
                    </td>
                    {/* Discount badge */}
                    <td className="px-2 py-2 cursor-pointer" onClick={() => onSelect(s.id)}>
                      <DiscountBadge
                        advertisedListPrice={s.advertisedListPrice}
                        currentPrice={s.currentPrice}
                        currency={s.currency}
                        compact
                      />
                    </td>
                    {/* Status */}
                    <td className="px-2 py-2 cursor-pointer" onClick={() => onSelect(s.id)}>
                      <StatusPill status={s.parseStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
