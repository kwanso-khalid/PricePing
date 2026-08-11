import React from 'react';
import type { ObservationHistory } from '../../types/storage.js';
import type { AlertEntry } from '../../lib/alertlog.js';
import { formatMoney } from '../../lib/money.js';

interface PriceChartProps {
  history: ObservationHistory;
  currency: string;
  rangeDays: 30 | 90 | 365 | null; // null = all
  advertisedListPrice: number | null;
  targetPrice?: number | null;       // horizontal dashed green line
  alertEntries?: AlertEntry[];       // vertical markers where alerts fired
  width?: number;
  height?: number;
}

const PAD_LEFT = 64;
const PAD_RIGHT = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 32;

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted[mid] ?? 0;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function PriceChart({
  history,
  currency,
  rangeDays,
  advertisedListPrice,
  targetPrice = null,
  alertEntries = [],
  width = 600,
  height = 200,
}: PriceChartProps) {
  const nowMs = Date.now();
  const cutoffMs =
    rangeDays !== null ? nowMs - rangeDays * 24 * 60 * 60 * 1000 : 0;

  const obs = history.obs.filter((o) => o[0] * 60_000 >= cutoffMs);

  if (obs.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-gray-400 text-sm"
      >
        No data for this range
      </div>
    );
  }

  const W = width;
  const H = height;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const prices = obs.map((o) => o[1]);
  const times = obs.map((o) => o[0] * 60_000);

  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const timeMin = Math.min(...times);
  const timeMax = Math.max(...times);

  // Expand range if list price or target price is outside
  const allPricesForRange = [
    ...prices,
    ...(advertisedListPrice !== null ? [advertisedListPrice] : []),
    ...(targetPrice !== null ? [targetPrice] : []),
  ];
  const yMin = Math.min(...allPricesForRange) * 0.97;
  const yMax = Math.max(...allPricesForRange) * 1.03;
  const yRange = yMax - yMin || 1;
  const xRange = timeMax - timeMin || 1;

  function toX(ms: number): number {
    return PAD_LEFT + ((ms - timeMin) / xRange) * innerW;
  }

  function toY(minor: number): number {
    return PAD_TOP + (1 - (minor - yMin) / yRange) * innerH;
  }

  // Gap detection: median time gap between consecutive obs
  const gaps = obs.slice(1).map((o, i) => o[0] - (obs[i]?.[0] ?? 0)); // in minutes
  const medianGap = median(gaps);
  const GAP_THRESHOLD = medianGap * 2;

  // Build segments (groups of consecutive obs without big gaps)
  const segments: (typeof obs)[] = [];
  const firstOb = obs[0];
  if (!firstOb) return <div style={{ width, height }} />;
  let current: typeof obs = [firstOb];

  for (let i = 1; i < obs.length; i++) {
    const curOb = obs[i];
    const prevOb = obs[i - 1];
    if (!curOb || !prevOb) continue;
    const gap = curOb[0] - prevOb[0];
    if (gap > GAP_THRESHOLD && medianGap > 0) {
      segments.push(current);
      current = [curOb];
    } else {
      current.push(curOb);
    }
  }
  segments.push(current);

  // Build polyline point strings per segment
  const polylines = segments.map((seg) =>
    seg.map((o) => `${toX(o[0] * 60_000).toFixed(1)},${toY(o[1]).toFixed(1)}`).join(' '),
  );

  // Build area fill path strings per segment
  const areaPaths = segments.map((seg) => {
    if (seg.length === 0) return '';
    const firstPt = seg[0];
    if (!firstPt) return '';
    const firstX = toX(firstPt[0] * 60_000).toFixed(1);
    const baseY = (H - PAD_BOTTOM).toFixed(1);
    const linePts = seg.map((o) => `L ${toX(o[0] * 60_000).toFixed(1)},${toY(o[1]).toFixed(1)}`).join(' ');
    const lastPt = seg[seg.length - 1];
    if (!lastPt) return '';
    const lastX = toX(lastPt[0] * 60_000).toFixed(1);
    return `M ${firstX},${toY(firstPt[1]).toFixed(1)} ${linePts} L ${lastX},${baseY} L ${firstX},${baseY} Z`;
  });

  // Min/max markers
  const minObs = obs.reduce((a, b) => (b[1] < a[1] ? b : a));
  const maxObs = obs.reduce((a, b) => (b[1] > a[1] ? b : a));
  const minX = toX(minObs[0] * 60_000);
  const minY = toY(minObs[1]);
  const maxX = toX(maxObs[0] * 60_000);
  const maxY = toY(maxObs[1]);

  // Y-axis labels
  const yTicks = 4;
  const yLabels: { y: number; label: string }[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const minor = yMin + (yRange * i) / yTicks;
    yLabels.push({
      y: toY(minor),
      label: formatMoney({ amountMinor: Math.round(minor), currency }),
    });
  }

  // X-axis labels (up to 5 evenly spaced)
  const xTicks = Math.min(5, obs.length);
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i < xTicks; i++) {
    const ms = timeMin + (xRange * i) / Math.max(1, xTicks - 1);
    xLabels.push({ x: toX(ms), label: formatDate(ms) });
  }

  const listY = advertisedListPrice !== null ? toY(advertisedListPrice) : null;
  const targetY = targetPrice !== null ? toY(targetPrice) : null;

  // Alert event markers: filter to those within the visible time range
  const alertMarkers = alertEntries
    .filter((e) => e.firedAt >= (cutoffMs === 0 ? -Infinity : cutoffMs) && e.firedAt <= nowMs)
    .map((e) => ({ x: toX(e.firedAt), price: e.newPriceMinor }));

  const minLabelAbove = minY > PAD_TOP + 16;
  const maxLabelAbove = maxY > PAD_TOP + 16;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height }}
      aria-label="Price history chart"
    >
      <defs>
        <linearGradient id="pw-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y gridlines and labels */}
      {yLabels.map((tick, i) => (
        <g key={i}>
          <line
            x1={PAD_LEFT}
            y1={tick.y}
            x2={W - PAD_RIGHT}
            y2={tick.y}
            stroke="#f1f5f9"
            strokeWidth="1"
          />
          <text
            x={PAD_LEFT - 4}
            y={tick.y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* Advertised list price dashed line */}
      {listY !== null && (
        <g>
          <line
            x1={PAD_LEFT}
            y1={listY}
            x2={W - PAD_RIGHT}
            y2={listY}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={W - PAD_RIGHT + 2}
            y={listY}
            dominantBaseline="middle"
            fontSize="9"
            fill="#f59e0b"
          >
            List
          </text>
        </g>
      )}

      {/* Target price dashed line */}
      {targetY !== null && (
        <g>
          <line
            x1={PAD_LEFT}
            y1={targetY}
            x2={W - PAD_RIGHT}
            y2={targetY}
            stroke="#16a34a"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={W - PAD_RIGHT + 2}
            y={targetY}
            dominantBaseline="middle"
            fontSize="9"
            fill="#16a34a"
          >
            Target
          </text>
        </g>
      )}

      {/* Alert event vertical markers */}
      {alertMarkers.map((m, i) => (
        <g key={i}>
          <line
            x1={m.x}
            y1={PAD_TOP}
            x2={m.x}
            y2={H - PAD_BOTTOM}
            stroke="#a855f7"
            strokeWidth="1"
            strokeDasharray="3 2"
            strokeOpacity="0.6"
          />
          <circle cx={m.x} cy={toY(m.price)} r={3} fill="#a855f7" fillOpacity="0.8" />
        </g>
      ))}

      {/* Area fill paths (rendered before polylines) */}
      {areaPaths.map((d, i) =>
        d ? (
          <path
            key={i}
            d={d}
            fill="url(#pw-area-grad)"
            stroke="none"
          />
        ) : null,
      )}

      {/* Price line segments */}
      {polylines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Min marker */}
      {priceMin !== priceMax && (
        <g>
          <circle cx={minX} cy={minY} r={4} fill="#22c55e" />
          <text
            x={minX}
            y={minLabelAbove ? minY - 8 : minY + 14}
            textAnchor="middle"
            fontSize="10"
            fill="#16a34a"
            fontWeight="600"
          >
            {formatMoney({ amountMinor: minObs[1], currency })}
          </text>
        </g>
      )}

      {/* Max marker */}
      {priceMin !== priceMax && (
        <g>
          <circle cx={maxX} cy={maxY} r={4} fill="#ef4444" />
          <text
            x={maxX}
            y={maxLabelAbove ? maxY - 8 : maxY + 14}
            textAnchor="middle"
            fontSize="10"
            fill="#dc2626"
            fontWeight="600"
          >
            {formatMoney({ amountMinor: maxObs[1], currency })}
          </text>
        </g>
      )}

      {/* X-axis labels */}
      {xLabels.map((tick, i) => (
        <text
          key={i}
          x={tick.x}
          y={H - PAD_BOTTOM + 14}
          textAnchor="middle"
          fontSize="10"
          fill="#9ca3af"
        >
          {tick.label}
        </text>
      ))}

      {/* Axes */}
      <line
        x1={PAD_LEFT}
        y1={PAD_TOP}
        x2={PAD_LEFT}
        y2={H - PAD_BOTTOM}
        stroke="#d1d5db"
        strokeWidth="1"
      />
      <line
        x1={PAD_LEFT}
        y1={H - PAD_BOTTOM}
        x2={W - PAD_RIGHT}
        y2={H - PAD_BOTTOM}
        stroke="#d1d5db"
        strokeWidth="1"
      />
    </svg>
  );
}
