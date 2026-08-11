import React, { useState } from 'react';
import type { ExtractedProduct, ExtractionMethod } from '../../types/index.js';
import { formatMoney, parsePrice } from '../../lib/money.js';
import { STRINGS } from '../../lib/strings.js';

const METHOD_LABELS: Record<ExtractionMethod, string> = {
  adapter: STRINGS.methodAdapter,
  jsonld: STRINGS.methodJsonLd,
  microdata: STRINGS.methodMicrodata,
  opengraph: STRINGS.methodOpengraph,
  shopify: STRINGS.methodShopify,
  woocommerce: STRINGS.methodWoocommerce,
  generic: STRINGS.methodGeneric,
  manual: STRINGS.methodManual,
};

const GENERIC_METHODS: ExtractionMethod[] = ['generic'];

function ExtractionLabel({ method }: { method: ExtractionMethod }) {
  const isGeneric = GENERIC_METHODS.includes(method);
  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-xs text-gray-400">
        Detected via {METHOD_LABELS[method]}
      </p>
      {isGeneric && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠ {STRINGS.methodTierWarning}
        </p>
      )}
    </div>
  );
}

interface SaveProductPanelProps {
  product: ExtractedProduct | null;
  loading: boolean;
  alreadyTracked: boolean;
  onSave: (targetPriceMinor: number | null) => void;
  onManualPrice: (priceStr: string) => void;
}

export function SaveProductPanel({
  product,
  loading,
  alreadyTracked,
  onSave,
  onManualPrice,
}: SaveProductPanelProps) {
  const [targetInput, setTargetInput] = useState('');
  const [manualPriceInput, setManualPriceInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm" role="status">
        {STRINGS.detectingPrice}
      </div>
    );
  }

  if (alreadyTracked) {
    return (
      <div className="p-4 text-center text-green-600 text-sm">
        ✓ {STRINGS.alreadyTracking}
      </div>
    );
  }

  function handleSave() {
    let targetPriceMinor: number | null = null;
    if (targetInput.trim() && product) {
      const result = parsePrice(targetInput, product.currency);
      if (result.ok) {
        targetPriceMinor = result.value.amountMinor;
      }
    }
    onSave(targetPriceMinor);
  }

  function handleManualSubmit() {
    if (manualPriceInput.trim()) {
      onManualPrice(manualPriceInput);
      setShowManual(false);
    }
  }

  if (!product && !showManual) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500 mb-3">{STRINGS.priceNotDetected}</p>
        <button
          onClick={() => setShowManual(true)}
          className="text-sm text-blue-600 hover:text-blue-700 underline"
        >
          {STRINGS.manualPriceEntry}
        </button>
      </div>
    );
  }

  if (showManual) {
    return (
      <div className="p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {STRINGS.manualPriceEntry}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualPriceInput}
            onChange={(e) => setManualPriceInput(e.target.value)}
            placeholder="$29.99"
            className="flex-1 text-sm border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
            autoFocus
          />
          <button
            onClick={handleManualSubmit}
            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {STRINGS.confirmManualPrice}
          </button>
        </div>
      </div>
    );
  }

  // Product found
  return (
    <div className="p-4">
      {product && (
        <div className="mb-3">
          <div className="flex gap-3 items-start">
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt=""
                className="w-14 h-14 object-cover rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                {product.title}
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                {formatMoney(product.price)}
              </p>
              <ExtractionLabel method={product.method} />
            </div>
          </div>
        </div>
      )}

      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
        {STRINGS.optionalTargetPrice}
      </label>
      <input
        type="text"
        value={targetInput}
        onChange={(e) => setTargetInput(e.target.value)}
        placeholder={STRINGS.targetPricePlaceholder}
        className="w-full text-sm border rounded px-2 py-1 mb-3 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
      />

      <button
        onClick={handleSave}
        className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        {STRINGS.trackProduct}
      </button>
    </div>
  );
}
