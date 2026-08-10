import React from 'react';
import type { PricePoint } from '../../types/index.js';

interface SparklineChartProps {
  history: PricePoint[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparklineChart({
  history,
  width = 80,
  height = 32,
  color = '#3b82f6',
}: SparklineChartProps) {
  if (history.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-gray-300 text-xs">—</div>;
  }

  const prices = history.map((p) => p.price.amountMinor);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const padding = 2;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = prices.map((price, i) => {
    const x = padding + (i / (prices.length - 1)) * plotWidth;
    const y = padding + plotHeight - ((price - minPrice) / range) * plotHeight;
    return `${x},${y}`;
  });

  const polylinePoints = points.join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
