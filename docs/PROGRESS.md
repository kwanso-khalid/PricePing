# PriceWatch - Build Progress

## Phase 0: Scaffold ✅
- Initialized git repository
- Vite + @crxjs/vite-plugin configured for MV3
- TypeScript strict mode enabled
- React 18 with hooks
- Tailwind CSS + PostCSS
- ESLint + Prettier configured
- Vitest for unit tests (jsdom environment)
- Playwright for e2e (headed Chromium with extension)
- Manifest V3 with minimal permissions
- Build produces loadable extension ✅

## Phase 1: Storage and Money ✅
- `src/lib/storage.ts`: Typed wrapper over chrome.storage.local
  - Schema version with migration runner (v0→v1)
  - Quota guard (5MB soft limit)
  - Corrupt data recovery (returns defaults)
  - Full Result<T,E> error handling
- `src/lib/money.ts`: Price parsing, formatting, comparison
  - Handles all locale formats: $1,234.56, 1.234,56 €, £99, ¥1980, Rs 4,999, 1 234,56
  - Zero-decimal currencies (JPY, KRW, etc.)
  - Three-decimal currencies (KWD, etc.)
  - Strict: never compares across currencies
- `src/lib/result.ts`: Result<T,E> type - no throwing across boundaries
- `src/lib/backoff.ts`: Exponential backoff, isDueForCheck, stagger delay
- `src/lib/history.ts`: PricePoint management, 200-point cap, 90-day downsampling
- Full unit test coverage (114 tests passing)

## Phase 2: Extraction ✅
- 5-layer extraction strategy with confidence scoring
- JSON-LD parser: schema.org Product, handles @graph, arrays, nested offers
- OpenGraph: og:price:amount, product:price:amount
- Microdata: itemprop="price/priceCurrency/name/image"
- Adapters: Amazon (0.95), eBay (0.92), Generic DOM heuristic (0.40)
- 9 HTML fixtures: Amazon, eBay, JSON-LD @graph, Microdata, OpenGraph, European EUR, generic, malformed JSON-LD, no-price page
- Extraction tests: 19 cases all passing

## Phase 3: Save Flow ✅
- Content script (`src/content/index.ts`) runs extraction on demand
- URL canonicalization strips 30+ tracking param families
- Amazon path-style /ref=... stripped
- Popup inject+extract flow via chrome.scripting.executeScript
- Duplicate detection by canonical URL
- Manual price entry fallback when extraction fails
- Target price optional at save time

## Phase 4: Background Checker ✅
- `src/background/scheduler.ts`: Alarm setup, idempotent, 30-min period
- `src/background/checker.ts`:
  - Processes up to 10 due items per alarm
  - Grouped by hostname, sequential with 2-8s stagger
  - 15s AbortController timeout per fetch
  - Blocked-site detection (200 but no price / bot-check page)
  - Applies backoff based on consecutive failures
  - Currency mismatch detection
  - History recording on price change
- Service worker entry re-registers alarm on startup

## Phase 5: Notifications ✅
- `src/background/notifier.ts`:
  - Dedup: never notify same/higher price as last
  - 24-hour cooldown per item
  - Batch if ≥3 drops in same pass
  - Click → opens product page (item notification) or popup (batch)
  - Respects global mute setting

## Phase 6: Popup UI ✅
- Full item list with sort: recent change, biggest drop, name, date added
- Per-item: SparklineChart, price change %, target price
- TrackedItemCard: pause/resume, delete, set target price
- SaveProductPanel: detected product view, manual price entry, target price
- Loading state, error state, empty state
- Dark mode support via Tailwind dark: prefix

## Phase 7: Options Page ✅
- Check frequency slider (1-24h)
- Notification enable/disable + mute duration
- Export to JSON (date-stamped filename)
- Import from JSON with validation
- Settings saved to chrome.storage

## Phase 8: Hardening ✅
- Storage quota guard: 5MB soft limit before writing
- Corrupt data recovery: returns defaults on parse failure
- Schema migrations: v0→v1 adds missing fields
- Catch blocks log via logger utility (no console.log)
- Currency mismatch detection prevents cross-currency comparison
- All user-visible strings in src/lib/strings.ts
- Dark mode support
- Keyboard accessible (tab, enter, escape on forms)

## Phase 9: Packaging ✅
- Production build with Vite (minified, chunked)
- Icon set at 16, 32, 48, 128px
- Docs: SPEC.md, PROGRESS.md, TESTING.md, DECISIONS.md, PERMISSIONS.md
- Privacy policy draft in STORE.md

## Test Results
- Unit tests: 114 passing, 0 failing
- TypeScript: 0 errors
- ESLint: 0 warnings/errors
- E2E: popup loads, options page loads
