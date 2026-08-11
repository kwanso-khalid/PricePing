import React from 'react';

interface SparklineChartProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparklineChart({ points, width = 80, height = 32, color = '#3b82f6' }: SparklineChartProps) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-gray-300 text-xs">—</div>;
  }
  const minP = Math.min(...points);
  const maxP = Math.max(...points);
  const range = maxP - minP || 1;
  const pad = 2;
  const pw = width - pad * 2;
  const ph = height - pad * 2;
  const pts = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * pw;
    const y = pad + ph - ((p - minP) / range) * ph;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
