# PriceWatch Codebase Audit

Scope: local-only Chrome MV3 extension. Everything inferred from code.
No guesses about intent or future state.

---

## 1. ARCHITECTURE MAP

### Files and responsibilities

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: storage, alarms, notifications, activeTab, scripting. Optional host: `<all_urls>`. Service worker: `service-worker-loader.js`. |
| `src/background/index.ts` | Service worker entry. Registers: `onInstalled`/`onStartup` → `setupAlarm()`; `alarm` → `runCheckPass()` then `processNotifications()`; `notifications.onClicked` → `handleNotificationClick()`; `runtime.onMessage` (PING / RUN_CHECK). No module-level state intended to survive eviction. |
| `src/background/scheduler.ts` | Creates alarm `pricewatch-check` (1 min initial delay, 30 min period). Idempotent check before create. |
| `src/background/checker.ts` | `runCheckPass()`: reads settings + items; filters ≤10 due items; groups by hostname; staggered sequential fetch with 2–8 s jitter; 15 s AbortController timeout; DOMParser parse; `extractProduct`; `applyCheckResult` → `saveItem`. `shouldTriggerNotification` is a pure exported function also used by notifier. |
| `src/background/notifier.ts` | `processNotifications()`: reads all items; filters by `shouldTriggerNotification`; sends batch (`≥3`) or individual `chrome.notifications.create`; marks items notified in storage. `handleNotificationClick`: opens product tab or popup. |
| `src/content/index.ts` | Injected on demand via `chrome.scripting.executeScript({ files })`. Runs `extractProduct(document, hostname)`, stores result in `window.__pricewatch_result__` (isolated world). Popup retrieves with a second `executeScript({ func })`. |
| `src/content/extract/index.ts` | Runs strategies in order: **adapter → jsonld → microdata → opengraph → generic**. Returns highest-confidence result; short-circuits at confidence ≥ 0.9. |
| `src/content/extract/jsonld.ts` | Parses `<script type="application/ld+json">`. Handles `@graph`, arrays, nested offers. Confidence 0.9. |
| `src/content/extract/microdata.ts` | Reads `itemprop="price"`, `itemprop="priceCurrency"`. Confidence 0.8. |
| `src/content/extract/opengraph.ts` | Reads `og:price:amount`, `og:price:currency`, `product:price:amount`. Confidence 0.75. |
| `src/content/extract/adapters/amazon.ts` | Amazon CSS selectors for price, title, image, availability. Confidence 0.95. |
| `src/content/extract/adapters/ebay.ts` | eBay selectors. Confidence 0.92. |
| `src/content/extract/adapters/generic.ts` | Generic DOM heuristic (price-shaped text near `h1`, excludes was/old classes). Confidence 0.40. **Bug: returns `method: 'adapter'`** instead of a distinct value. |
| `src/content/extract/adapters/index.ts` | Registry mapping hostname arrays to extractor functions. Amazon: 10 domains. eBay: 5 domains. |
| `src/popup/App.tsx` | Loads items from storage; queries active tab; two-phase content script injection on "+ Save"; builds `TrackedItem`; calls `saveItem`. |
| `src/popup/components/SaveProductPanel.tsx` | Shows detected product card, target-price input, manual price-entry fallback. |
| `src/popup/components/TrackedItemCard.tsx` | Per-item card: inline SVG sparkline (`SparklineChart`), prices, % change, pause/delete/target-price actions. Shows `⚠ Needs attention` when `consecutiveFailures ≥ 5`. |
| `src/popup/components/SparklineChart.tsx` | Renders `PricePoint[]` history as inline SVG polyline. |
| `src/options/App.tsx` | Check interval slider, notifications toggle, mute selector, JSON export/import with structural validation. |
| `src/lib/storage.ts` | Typed wrapper over `chrome.storage.local`. Single key `pricewatch_data`. Schema v1. Migration runner (v0→v1). 5 MB soft quota pre-write guard. |
| `src/lib/money.ts` | `parsePrice`: locale-aware string → `Money` (integer minor units). `formatMoney`, `isLessThan`, `sameCurrency`, `priceDifferencePercent`. No float storage. |
| `src/lib/backoff.ts` | `isDueForCheck` (base 6 h, cap 72 h). `staggerDelayMs` (2–8 s). |
| `src/lib/history.ts` | `addPricePoint` + `downsampleHistory`. Cap 200. Downsamples points older than 90 days to 1/day (keeps latest per calendar day). |
| `src/lib/logger.ts` | Structured console logger. Production: warn/error only. Dev: all levels. `globalThis.console` used to survive SW context. |
| `src/lib/result.ts` | `Result<T,E>` type. No throwing across module boundaries. |
| `src/lib/strings.ts` | All user-visible strings. |
| `src/lib/url.ts` | `canonicalizeUrl`: strips 30+ tracking params, Amazon `/ref=` path segments, normalises scheme/host, sorts remaining params. |
| `src/types/index.ts` | Canonical types: `TrackedItem`, `Money`, `PricePoint`, `StorageSchema`, `AppSettings`, `NotificationState`, `CheckResult`, `ExtractedProduct`. |
| `vite.config.ts` | Main build: popup + options + service worker via crxjs. |
| `vite.content.config.ts` | Separate IIFE build for content script → `dist/src/content/index.js`. |

### Data flow: "user clicks Save" → "notification fires"

```
User visits product page → clicks popup icon

1. Popup mount
   chrome.tabs.query(active) → tab.url, tab.id
   canonicalizeUrl(tab.url) → pageInfo.url
   getAllItems() → items (from chrome.storage.local)

2. User clicks "+ Save"
   chrome.scripting.executeScript({ files: ['src/content/index.js'] })
     [content script, isolated world]
     extractProduct(document, hostname) → ExtractedProduct | null
     window.__pricewatch_result__ = { success, product }
   chrome.scripting.executeScript({ func: () => window.__pricewatch_result__ })
   popup receives ExtractedProduct

3. User clicks "Track Product"
   builds TrackedItem {
     id: uuidv4(),
     url: pageInfo.url (canonical),
     initialPrice: detectedProduct.price,
     currentPrice: detectedProduct.price,
     history: [{ price, observedAt: now, inStock }],
     consecutiveFailures: 0, paused: false, ...
   }
   saveItem(item) → loadSchema() → mutate → chrome.storage.local.set

4. chrome.alarms fires 'pricewatch-check' (every 30 min)
   service worker cold-starts; all state re-read from storage

5. runCheckPass()
   getAllItems() + getSettings() from storage
   filter: !paused && isDueForCheck(lastCheckedAt, failures, intervalMs)
   slice to MAX 10 items
   group by hostname; for each item:
     [optional] setTimeout stagger 2–8 s   ← SW timeout risk (see R4)
     fetch(url, { signal: AbortController(15s) })
     DOMParser.parseFromString → Document
     extractProduct(doc, hostname) → ExtractedProduct | null
     isBlockedResponse check (bot-detection keywords)
     sameCurrency check
     applyCheckResult → updated TrackedItem
     saveItem(updatedItem) → loadSchema() → mutate → chrome.storage.local.set

6. processNotifications()
   getAllItems() from storage
   filter: shouldTriggerNotification(item)
     cooldown: lastNotifiedAt within 24 h → skip
     dedup: currentPrice.amountMinor >= lastNotifiedPriceMinor → skip
     trigger: currentPrice < targetPrice, or < initialPrice if no target
   ≥3 items → sendBatchNotification; else individual
   chrome.notifications.create(...)
   saveItem per notified item (lastNotifiedAt, lastNotifiedPriceMinor updated)

7. User clicks notification
   chrome.notifications.onClicked → handleNotificationClick
   chrome.tabs.create({ url: item.url })
```

**State at each hop**

| Hop | Where |
|---|---|
| Tab / page info | `chrome.tabs` API (ephemeral) |
| Extracted product | `window.__pricewatch_result__`, page isolated world (ephemeral) |
| Popup React state | `useState` (popup lifetime only) |
| Items, settings, notification state | `chrome.storage.local`, key `pricewatch_data` |
| Alarm schedule | `chrome.alarms` (persists across SW evictions) |

---

## 2. CURRENT DATA MODEL

Single storage key: **`pricewatch_data`** in `chrome.storage.local`.

```typescript
// src/lib/storage.ts:9
StorageSchema {
  schemaVersion: number          // 1 currently
  items: Record<string, TrackedItem>   // keyed by TrackedItem.id (UUID)
  settings: AppSettings
  notifications: NotificationState
}

// src/types/index.ts:16-34
TrackedItem {
  id: string                     // UUID v4
  url: string                    // canonical URL
  title: string
  imageUrl: string | null
  hostname: string               // www. stripped
  currency: CurrencyCode         // ISO 4217 string — not validated beyond being a string
  initialPrice: Money            // price at save time
  currentPrice: Money            // most-recently checked price
  targetPrice: Money | null
  history: PricePoint[]          // max 200; >90 d downsampled to 1/day
  createdAt: number              // epoch ms
  lastCheckedAt: number | null
  lastNotifiedAt: number | null
  lastNotifiedPriceMinor: number | null
  consecutiveFailures: number
  paused: boolean
  extractionMethod: 'jsonld'|'opengraph'|'microdata'|'adapter'|'manual'
}

// src/types/index.ts:3-6
Money {
  amountMinor: number            // integer (e.g. 1999 = $19.99)
  currency: CurrencyCode
}

// src/types/index.ts:8-12
PricePoint {
  price: Money
  observedAt: number             // epoch ms
  inStock: boolean
}

// src/types/index.ts:53-58
AppSettings {
  checkIntervalHours: number     // default 6, range 1-24
  notificationsEnabled: boolean
  mutedUntil: number | null      // epoch ms
  perSiteEnabled: Record<string, boolean>  // stored but never consulted (dead field)
}

// src/types/index.ts:60-63
NotificationState {
  lastBatchNotificationAt: number | null
  recentlyNotifiedItemIds: string[]  // appended but never read (dead field)
}
```

**Migration history** (`src/lib/storage.ts:36-57`):

| v0 → v1 | Added `consecutiveFailures`, `paused`, `lastNotifiedAt`, `lastNotifiedPriceMinor` to existing items |

---

## 3. BLOCKERS

### a. Storing price history as a time series

**Not blocked — partially implemented, but sparse and inline.**

`TrackedItem.history: PricePoint[]` exists. `addPricePoint` in `history.ts` is called on every price *change* (not every poll — `checker.ts:184` guards on `priceChanged`). This is the correct design.

Limitations relevant to Phase 1:
- History lives inline inside `TrackedItem`, which lives inside the single `pricewatch_data` blob. Every history query deserialises the full blob.
- No `advertisedListPrice` field anywhere in `PricePoint` or `TrackedItem`. Phase 3 fake-discount detection cannot be built on the current model.
- Cap is 200 points (Phase 1 spec wants 400, plus permanent all-time min/max).
- No sanity guard: any extracted price, including obviously wrong ones, writes to history.

**Fix type:** Additive for the time-series shape itself. Refactor required for the `advertisedListPrice` field, cap change, and sanity guard.

---

### b. Storing the retailer's advertised "was" price separately from current price

**Blocked completely.**

Neither `PricePoint` nor `TrackedItem` has an `advertisedListPrice` or `wasPrice` field. None of the extraction strategies (`jsonld.ts`, `opengraph.ts`, `microdata.ts`, `amazon.ts`, `ebay.ts`) extract a "was" or strikethrough price. `ExtractedProduct` has no such field.

Phase 3 fake-discount detection is entirely built on comparing the retailer's stated "was" price against our observed history. Without this field, Phase 3 cannot function at all.

**Fix type:** Refactor of the data model (`PricePoint`, `TrackedItem`, `ExtractedProduct`) plus new extraction logic in every strategy and every adapter. This is a load-bearing Phase 2 deliverable gating Phase 3.

---

### c. Suppressing duplicate and trivial notifications

**Partially done — three of the required suppressions exist; three do not.**

**Exists:**
- 24-hour cooldown per item (`checker.ts:238-241`, `lastNotifiedAt` field)
- Dedup by price level: never notify for same or higher price than last alert (`checker.ts:243-248`, `lastNotifiedPriceMinor` field)
- Global mute toggle (`notifier.ts:24-28`, `settings.mutedUntil`)

**Missing:**
- Minimum delta filter: no `MIN_DELTA_PCT` guard. A $0.40 wobble on a $300 item fires every 24 hours indefinitely as long as the price stays below the last alert price.
- Idempotency key per alert: no hash of `(watchId, priceMinorUnits, dayBucket)` stored. A service worker restart mid-notification pass can double-send.
- Quiet hours: no local-timezone time window. Notifications fire immediately regardless of time of day.

**Fix type:** Additive. New fields on `Watch`/`TrackedItem` (sentAlertKeys, quietHoursStart/End) plus logic changes in `shouldTriggerNotification` and `processNotifications`.

---

### d. Failing closed when a selector breaks, instead of showing a stale price

**Partially done — the extension does not show stale prices as current, but it also does not surface the failure distinctly.**

What currently happens when extraction fails:
1. `checkItem` returns `{ status: 'error', message }` or `{ status: 'blocked' }`.
2. `applyCheckResult` increments `consecutiveFailures`. At ≥5, a logger error fires.
3. `TrackedItemCard` shows a `⚠ Needs attention` badge when `consecutiveFailures ≥ 5` (`TrackedItemCard.tsx:49, 100-104`).
4. The current price displayed is whatever was last successfully extracted — it is not marked as stale.

What is missing:
- No `parseStatus` field on `TrackedItem` (Phase 1 spec adds this). The "paused" flag means user-paused, not extraction-paused; they are conflated.
- No distinction in the UI between "blocked" (site blocks fetches) and "error" (extraction failed). Both just increment `consecutiveFailures`.
- The `⚠` badge only appears after 5 consecutive failures. Failures 1–4 are invisible.
- The generic adapter returns `method: 'adapter'` (`generic.ts:111`), making it indistinguishable from Amazon/eBay adapters in storage. Logic that gates on `extractionMethod` cannot identify generic-heuristic items.

**Fix type:** Additive (new `parseStatus` field + UI treatment). The extraction pipeline itself already falls through gracefully; what is missing is the failure state propagation into the data model and UI.

---

## 4. RISK REGISTER

### R1 — `setTimeout` used for inter-request stagger inside the service worker
**File:** `src/background/checker.ts:149`
**Severity:** Medium

```typescript
await new Promise<void>((resolve) => setTimeout(resolve, delay));
```

Used to stagger requests between items in a single alarm pass. Chrome's MV3 service worker has a ~30 s idle timeout (extended to ~5 min when a fetch or alarm is in progress). With 10 items × up to 15 s each + 8 s jitter between each, worst case is ~(15+8)×10 = 230 s. This exceeds 30 s idle and is close to the extended limit. If Chrome kills the worker mid-pass, remaining items are skipped until the next alarm fires 30 minutes later. This is not catastrophic — it just means some items miss a pass. But it is a real risk under memory pressure.

The `setTimeout` itself is acceptable here (sub-minute, within a single event handler), but the total pass duration is the actual concern.

---

### R2 — Single-blob load-modify-save is not atomic
**File:** `src/lib/storage.ts:142-146`
**Severity:** Medium

Every public storage function does `loadSchema() → mutate → saveSchema()`. The alarm handler calls `saveItem` for each checked item sequentially; `processNotifications` calls `saveItem` again for each notified item. These are sequential awaits in the same event loop, so interleaving within one alarm pass is not possible. However, if a popup write (save new item, pause item) races with an alarm-triggered save, one write silently clobbers the other. `chrome.storage.local` provides no transactions. The single-blob design maximises this risk surface.

---

### R3 — Generic adapter returns `method: 'adapter'`
**File:** `src/content/extract/adapters/generic.ts:111`
**Severity:** Medium

Returns `{ method: 'adapter' }` instead of a distinct value (e.g. `'generic'`). Any future code that gates behaviour on `extractionMethod` — such as "require user confirmation before notifying if method is generic-heuristic" — cannot identify these items. They are stored identically to Amazon/eBay adapter results.

---

### R4 — `parsePrice` cannot handle "Free", "See price in cart", or empty string without erroring
**File:** `src/lib/money.ts:61-86`
**Severity:** Medium

`parsePrice("")` → `err('Empty or invalid price input')`. `parsePrice("Free")` → stripped of symbols → `""` → `err(...)`. `parsePrice("See price in cart")` → stripped → `NaN` → `err(...)`. These are all handled gracefully (returns `err`, never crashes). The risk is that an extraction strategy that finds one of these strings as the price element returns `null`, the engine falls through to the next strategy, which may find a *different* number (e.g. a related-product price) and report it with medium confidence. The caller cannot distinguish "no price found" from "wrong price found" — both look like a successful extraction at lower confidence.

---

### R5 — `void chrome.alarms.create(...)` silently swallows alarm creation failure
**File:** `src/background/scheduler.ts:15`
**Severity:** Low

`void chrome.alarms.create(ALARM_NAME, {...})` — errors (e.g. exceeding Chrome's alarm limit) are silently discarded. If alarm creation fails, price checking never runs and the user receives no indication.

---

### R6 — `perSiteEnabled` and `recentlyNotifiedItemIds` are dead schema fields
**Files:** `src/lib/storage.ts:16`, `src/background/notifier.ts:66-70`
**Severity:** Low

`AppSettings.perSiteEnabled` is stored and settable in options but never read by the checker. `NotificationState.recentlyNotifiedItemIds` is appended to on every notification pass (capped at 50) but never queried. Both write to storage on every cycle for no effect. They bloat the blob and add writer noise.

---

### R7 — `chrome.alarms.create` voided in scheduler; failure invisible
**File:** `src/background/scheduler.ts:15`
**Severity:** Low

Already noted above as R5. Separately: `setupAlarm` is called with `void` at the call sites (`index.ts:15, 20`), so even if `setupAlarm` propagated an error, the caller would not see it.

---

### R8 — Two-phase content script injection has a TOCTOU gap
**File:** `src/popup/App.tsx:66-90`
**Severity:** Low

If the user navigates the active tab between the `executeScript({ files })` call and the `executeScript({ func })` retrieval call, the retrieval reads `undefined` from the new page's isolated world, `setDetectedProduct(null)` is called silently, and the manual-price fallback appears with no explanation.

---

### R9 — Timestamps are epoch ms in storage; constraint says ISO 8601
**File:** `src/types/index.ts:10,27-30`
**Severity:** Low (internal inconsistency only)

`CLAUDE.md` engineering constraints say "All timestamps are UTC ISO 8601." The data model stores all timestamps as `number` (epoch ms). Epoch ms is correct for arithmetic (sorting, age calculations); ISO 8601 would be correct for human-readable export. The inconsistency is between the constraint document and the implementation, not within the code itself.

---

## 5. STORAGE BUDGET

### Per-item size breakdown

**Base overhead per `TrackedItem` (no history):**

| Field | Typical bytes (JSON) |
|---|---|
| id (UUID string) | 38 |
| url | 50–120 |
| title | 60–250 |
| imageUrl | 80–150 (or 4 for null) |
| hostname | 15–25 |
| currency | 5 |
| initialPrice + currentPrice | ~90 total |
| targetPrice | 4 (null) or ~45 |
| history: [] | 2 |
| createdAt, lastCheckedAt, lastNotifiedAt | ~42 |
| lastNotifiedPriceMinor | 4–10 |
| consecutiveFailures | 3 |
| paused | 5 |
| extractionMethod | 12–15 |
| JSON key names (overhead) | ~180 |
| **Base total** | **~600–900 bytes** |

**Per `PricePoint`:**
```json
{"price":{"amountMinor":9999,"currency":"USD"},"observedAt":1722000000000,"inStock":true}
```
≈ **85 bytes** per point.

**Per-item totals by history depth:**

| History points | Item size |
|---|---|
| 0 | ~750 B |
| 50 | ~5.0 KB |
| 100 | ~9.2 KB |
| 200 (current cap) | ~17.8 KB |

**Note:** History grows only on price *changes*, not every poll. A product polled every 6 hours that changes price weekly accumulates ~52 observations per year. At 2 years: ~104 points = ~9.6 KB.

---

### At 100 watched products

| Scenario | Total size |
|---|---|
| Sparse history (avg 25 pts/item) | ~295 KB |
| Moderate (avg 75 pts/item) | ~690 KB |
| Dense (200 pts/item — volatile prices) | ~1.8 MB |

Well within Chrome's 10 MB `chrome.storage.local` limit. The 5 MB soft guard in `storage.ts:10` will not trigger.

**Performance concern at 100 items:** Every `saveItem` call reads and writes the entire blob (~300 KB–1.8 MB). At the end of a 10-item check pass + notifications, that is 20+ full-blob read-write cycles. Still fast enough in practice.

---

### At 500 watched products

| Scenario | Total size |
|---|---|
| Sparse history (avg 25 pts/item) | ~1.45 MB |
| Moderate (avg 75 pts/item) | ~3.45 MB |
| Dense (200 pts/item) | ~8.9 MB |

The **dense case approaches Chrome's 10 MB limit.** The current 5 MB soft guard fires at roughly 280 fully-loaded items with 200-point histories, which is too conservative — it blocks saves before the Chrome limit is reached but at an arbitrary threshold.

More critically: at 500 items, every single `saveItem` call serialises and deserialises a blob of 1.5–9 MB. The 30-item batch at the end of a check pass + notification round becomes a serious performance problem. This is the primary motivation for splitting the single blob into per-item keys in Phase 1.

**`unlimitedStorage` permission:** Not needed at 100 items. At 500 dense items the 10 MB limit could be breached. The Phase 1 spec correctly defers this decision until the new schema's byte projections are known.

---

### StorageSchema overhead (non-item fields)

| Field | Size |
|---|---|
| schemaVersion | ~20 B |
| settings | ~120 B |
| notifications (50 UUID strings) | ~1.8 KB |
| **Total overhead** | **~2 KB** |

Negligible.
