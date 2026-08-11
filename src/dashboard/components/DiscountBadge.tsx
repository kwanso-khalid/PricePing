import React from 'react';
import type { DiscountVerdict } from '../../lib/discount.js';
import { formatMoney } from '../../lib/money.js';

interface DiscountBadgeProps {
  advertisedListPrice: number | null;
  currentPrice: number;
  currency: string;
  verdict?: DiscountVerdict | null;
  compact?: boolean;
}

export function DiscountBadge({
  advertisedListPrice,
  currentPrice,
  currency,
  verdict,
  compact = false,
}: DiscountBadgeProps) {
  if (advertisedListPrice === null || advertisedListPrice <= currentPrice) {
    return null;
  }

  const discountPct = Math.round(
    ((advertisedListPrice - currentPrice) / advertisedListPrice) * 100,
  );

  const verdictStyle =
    verdict?.verdict === 'genuine'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      : verdict?.verdict === 'inflated'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';

  if (compact) {
    return (
      <span
        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${verdictStyle}`}
        title={
          verdict?.verdict === 'genuine'
            ? 'Genuine discount — has been observed near list price'
            : verdict?.verdict === 'inflated'
              ? 'Possibly inflated — never observed near list price in window'
              : 'Insufficient data to evaluate discount'
        }
      >
        -{discountPct}%
      </span>
    );
  }

  return (
    <div className={`rounded-lg p-3 ${verdictStyle}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">
          {discountPct}% off list price
        </span>
        {verdict && (
          <span className="text-xs font-medium">
            {verdict.verdict === 'genuine'
              ? 'Genuine'
              : verdict.verdict === 'inflated'
                ? 'Possibly inflated'
                : 'Insufficient data'}
          </span>
        )}
      </div>
      <div className="text-xs">
        List: {formatMoney({ amountMinor: advertisedListPrice, currency })} →
        Current: {formatMoney({ amountMinor: currentPrice, currency })}
      </div>
      {verdict && verdict.verdict !== 'insufficient_data' && (
        <div className="text-xs mt-1 opacity-80">
          {verdict.verdict === 'genuine'
            ? `Observed at or near list price ${verdict.observationsAtOrNearList}× out of ${verdict.observationCount} observations in ${verdict.windowDays} days.`
            : `Never observed at or near list price in ${verdict.observationCount} observations across ${verdict.windowDays} days. Highest observed: ${
                verdict.observedMaxInWindow !== null
                  ? formatMoney({ amountMinor: verdict.observedMaxInWindow, currency })
                  : '—'
              }.`}
        </div>
      )}
      {verdict?.verdict === 'insufficient_data' && (
        <div className="text-xs mt-1 opacity-80">
          Need at least 8 Tier 1/2 observations across 14 days to evaluate.
          Currently {verdict.observationCount} qualifying observations.
        </div>
      )}
    </div>
  );
}
