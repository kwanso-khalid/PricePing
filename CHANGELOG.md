# Changelog

## [0.1.0] - 2026-08-10 (Rename: PriceWatch → PricePing)

### Changed
- Extension renamed from PriceWatch to PricePing throughout: manifest name, all UI strings, page titles, notification IDs, alarm name, export filenames, log prefix, and package name
- Removed empty `content_scripts: []` array from manifest (no-op)
- Removed `web_accessible_resources` entry for dashboard — dashboard is opened via `chrome.tabs.create` from extension context and does not need to be accessible to web pages
- Legacy `pricewatch-check` alarm cleared at install time to prevent orphaned alarms on upgrade
- Export filenames changed from `pricewatch-*.json/csv` to `priceping-*.json/csv`

## [Unreleased] - 2026-08-10 (Bug fixes)

### Fixed
- Added `host_permissions: ["<all_urls>"]` to manifest — background checker's cross-origin fetches were CORS-blocked without it, silently failing every 6-hourly check pass
- `handleSave` in popup wrapped in try/catch — errors from `canonicalKey` or storage no longer swallowed silently; user now sees `saveFailed` message
- Content script re-injection guard in `detectProduct` — clicking Track twice on the same page no longer spawns multiple extractions and extra MutationObservers
- `addProduct` now checks canonical key before inserting — prevents duplicate product entries when the same product is reachable at slightly different URLs
- Background checker now calls `extractProductAsync` — enables Shopify `.js` endpoint extraction (Tier 2) during scheduled check passes, not just on page visits

## [Unreleased] - 2026-08-10 (Phase 4)

### Added (Phase 4)
- Quiet hours: hold notifications during 22:00–08:00 local time (configurable), coalesce into digest on wake
- Badge count of unseen price drops on the extension icon
- In-extension alert log (alertlog storage key, capped at 200 entries), shown in dashboard Alerts tab
- Rich notification body: old price → new price, percent change, trend label
- Per-host exponential backoff: pause a host for 24h after 5 consecutive failures
- Online check at start of each poll pass (skip if offline)
- 90th-percentile low trigger: also notify when price is in the cheapest 10% of yearly observations
- Reconcile on startup: catch-up check pass for items overdue while browser was closed
- MARK_ALERTS_SEEN message handler: badge clears when user views alert log

## [Unreleased] - 2026-08-10 (Phase 3)

### Added (Phase 3)
- Full-page dashboard (`src/dashboard`) with list view and product detail view
- Inline SVG price chart with gap detection, min/max markers, and advertised list price overlay
- Fake discount detection: structured verdict (`'genuine' | 'inflated' | 'insufficient_data'`) with evidence text, requires Tier 1/2 and 8+ observations across 14 days (`src/lib/discount.ts`)
- Trend labels: "lowest in X days", "Nth lowest", percent above window low; same confidence gate (`src/lib/trend.ts`)
- JSON and CSV export; JSON import — user's only backup (`src/lib/export.ts`)
- Metrics grid: all-time min/max, 30/90/365-day windows, each showing observation count
- Dashboard link in popup header
- Unit tests for `discount.ts`, `trend.ts`, and `export.ts`

## [Unreleased] - 2026-08-10 (Phase 2)

### Added (Phase 2)
- Tier 2: Shopify platform endpoint (`.js`) extraction with `compare_at_price` for advertised list price (`method: 'shopify'`)
- Tier 2: Platform detection for WooCommerce, Magento, BigCommerce, Wix (`detectPlatform()`) — detection only; endpoint extraction where available
- Advertised "was"/list price captured from JSON-LD `priceSpecification` (with `priceType: ListPrice`), DOM strikethrough elements, and Shopify `compare_at_price`
- `stockState` enum (0=unknown, 1=in_stock, 2=out_of_stock, 3=preorder, 4=limited) propagated across all extraction tiers via `parseStockState()` helper
- MutationObserver fallback in content script for client-rendered prices (3 s timeout, 300 ms debounce)
- `ParseResult` discriminated union and `ParseFailureReason` type for structured fail-closed extraction reporting
- `ExtractionMethod` extended with `'shopify'` and `'woocommerce'`; `methodToTier` updated accordingly (maps to tier 2)
- New test fixtures: `shopify-product.html`, `out-of-stock.html`, `advertised-list-price.html`, `woocommerce-product.html`, `price-range.html`, `broken-extraction.html`
- New test file: `tests/unit/platform.test.ts` covering platform detection, stock state parsing, list price extraction, and fail-closed behaviour

### Fixed
- `generic.ts` now returns `method: 'generic'` (was incorrectly returning `'adapter'`) and `confidence: 0.35` (was `0.4`)

### Added
- Phase 1b: sharded storage layer (meta/idx/p:\<id\>/h:\<id\>/alerts keys)
- Positional Observation tuples [minutesSinceEpoch, priceMinorUnits, listMinorUnits, stockState, tier]
- `computeStats` pure function for cached dashboard stats (w30/w90/w365 windows)
- `sanityCheckObservation` guard (rejects outliers below 20% or above 5× trailing median)
- `canonicalKey(url)` for dedup-safe product identity via SHA-256
- `normalizeMoney(input)` for robust price string normalization (handles ranges, Free, cart strings)
- Migration runner: v1 single-blob → v2 sharded keys, safe to re-run
- 100-product cap enforced at add time with clear error message
- 400-observation cap per product, all-time min/max preserved across trims
- Alert idempotency keys in `alerts` key, pruned after 60 days
- Tier gate: Tier 3 (generic heuristic) observations never trigger notifications
- MIN_DELTA_PCT (3%) suppression on notifications to prevent wobble alerts
