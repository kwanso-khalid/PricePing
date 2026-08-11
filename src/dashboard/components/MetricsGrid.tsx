import React from 'react';
import type { CachedStats, ParseStatus, ParseTier } from '../../types/storage.js';
import { formatMoney } from '../../lib/money.js';

interface MetricsGridProps {
  stats: CachedStats;
  currency: string;
  parseStatus: ParseStatus;
  parseTier: ParseTier;
}

function fmtDate(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtPrice(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '—';
  return formatMoney({ amountMinor: minor, currency });
}

const TIER_LABELS: Record<ParseTier, string> = {
  1: 'Tier 1 — Structured data',
  2: 'Tier 2 — Platform endpoint',
  3: 'Tier 3 — Generic heuristic',
  4: 'Tier 4 — Failed',
};

const STATUS_LABELS: Record<ParseStatus, string> = {
  ok: 'Active',
  paused: 'Paused',
  blocked: 'Blocked',
};

export function MetricsGrid({
  stats,
  currency,
  parseStatus,
  parseTier,
}: MetricsGridProps) {
  return (
    <div className="space-y-5">

      {/* Three headline stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40">
          <div className="text-xs font-medium text-green-600 dark:text-green-500 mb-2">All-time low</div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-400 leading-none">
            {fmtPrice(stats.allTimeMin?.priceMinor, currency)}
          </div>
          <div className="text-xs text-green-600/60 dark:text-green-500/60 mt-1.5">
            {fmtDate(stats.allTimeMin?.observedAt ?? null)}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
          <div className="text-xs font-medium text-red-500 dark:text-red-400 mb-2">All-time high</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 leading-none">
            {fmtPrice(stats.allTimeMax?.priceMinor, currency)}
          </div>
          <div className="text-xs text-red-500/60 dark:text-red-400/60 mt-1.5">
            {fmtDate(stats.allTimeMax?.observedAt ?? null)}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Price changes</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">
            {stats.changeCount}
          </div>
          <div className="text-xs text-gray-400 mt-1.5">
            {stats.lastChangeAt ? `Last: ${fmtDate(stats.lastChangeAt)}` : 'No changes yet'}
          </div>
        </div>
      </div>

      {/* Window comparison table */}
      <div>
        <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
          Historical windows
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 w-24"></th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">30 days</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">90 days</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">365 days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-2.5 text-xs font-semibold text-green-600 dark:text-green-400">Min</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w30 ? fmtPrice(stats.w30.min, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w90 ? fmtPrice(stats.w90.min, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w365 ? fmtPrice(stats.w365.min, currency) : '—'}
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Median</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w30 ? fmtPrice(stats.w30.median, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w90 ? fmtPrice(stats.w90.median, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w365 ? fmtPrice(stats.w365.median, currency) : '—'}
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-2.5 text-xs font-semibold text-red-500 dark:text-red-400">Max</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w30 ? fmtPrice(stats.w30.max, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w90 ? fmtPrice(stats.w90.max, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stats.w365 ? fmtPrice(stats.w365.max, currency) : '—'}
                </td>
              </tr>
              <tr className="bg-gray-50/40 dark:bg-gray-800/20">
                <td className="px-4 py-2.5 text-xs font-medium text-gray-400">Obs.</td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">{stats.w30?.count ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">{stats.w90?.count ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-400">{stats.w365?.count ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2.5 text-xs text-gray-400 pt-1">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          parseStatus === 'ok'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : parseStatus === 'paused'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {STATUS_LABELS[parseStatus]}
        </span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span>{TIER_LABELS[parseTier]}</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span>{stats.observationCount} obs. over {Math.round(stats.daysTracked)} days</span>
      </div>
    </div>
  );
}
