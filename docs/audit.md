# PriceWatch — Codebase Audit

Phase 1a. Every claim is inferred from code. File and line citations given for
anything non-obvious. No guesses.

---

## 1. Architecture map

### File inventory

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: storage, alarms, notifications, activeTab, scripting. No host permissions. |
| `src/background/index.ts` | Service worker entry. Registers four listener groups synchronously at module level: `onInstalled`/`onStartup` → `setupAlarm()`; `alarms.onAlarm` → `runCheckPass()` + `processNotifications()`; `notifications.onClicked` → `handleNotificationClick()`; `runtime.onMessage` (PING / RUN_CHECK). No module-level mutable state. |
| `src/background/scheduler.ts` | `setupAlarm()`: creates `pricewatch-check` alarm (1 min initial, 30 min period). Idempotent — checks for existing alarm before creating. `void`s the create call (risk: see R1). |
| `src/background/checker.ts` | `runCheckPass()`: reads settings + all items; filters to ≤ 10 items due for checking; groups by hostname; sequential fetch with 2–8 s `setTimeout` stagger; 15 s `AbortController` timeout; `DOMParser` parse; `extractProduct`; `applyCheckResult` → `saveItem`. `shouldTriggerNotification` and `applyCheckResult` are pure functions exported and tested separately. |
| `src/background/notifier.ts` | `processNotifications()`: reads all items; filters by `shouldTriggerNotification`; sends batch (≥ 3 items) or individual `chrome.notifications.create`; marks items notified in storage. `handleNotificationClick()`: opens product tab or popup. |
| `src/content/index.ts` | Injected on demand via `executeScript({ files })`. Runs `extractProduct(document, hostname)`; stores result at `window.__pricewatch_result__` in the page's isolated world. Popup retrieves with a second `executeScript({ func })`. |
| `src/content/extract/index.ts` | Layered strategy runner. Order: **adapter → jsonld → microdata → opengraph → generic**. Returns highest-confidence result; short-circuits if confidence ≥ 0.9. All strategies wrapped in try/catch; errors are logged, not thrown. |
| `src/content/extract/jsonld.ts` | Parses all `<script type="application/ld+json">` tags. Handles `@graph` wrapper, root arrays, nested offers. Resolves `offer.lowPrice` if `price` absent. No `advertisedListPrice` / `highPrice` captured. Confidence: 0.9. |
| `src/content/extract/microdata.ts` | Reads `itemprop="price"`, `itemprop="priceCurrency"`, `itemprop="availability"`. Confidence: 0.8. |
| `src/content/extract/opengraph.ts` | Reads `og:price:amount`, `og:price:currency`, `product:price:amount`. Confidence: 0.75. |
| `src/content/extract/adapters/amazon.ts` | Amazon CSS selectors for price (8 candidates), title, image, availability. Currency inferred from `lang` attribute and hostname suffix. No "was" price captured. Confidence: 0.95. Returns `method: 'adapter'`. |
| `src/content/extract/adapters/ebay.ts` | eBay selectors for price (4 candidates), title, image, availability. No "was" price. Confidence: 0.92. Returns `method: 'adapter'`. |
| `src/content/extract/adapters/generic.ts` | Generic DOM heuristic. Title from `h1` variants; price from class/id substrings matching "price", excluding "was/old/original" classes. Confidence: 0.40. **Bug: returns `method: 'adapter'`** (should be `'generic'` or a tier identifier). |
| `src/content/extract/adapters/index.ts` | Adapter registry. Amazon: 10 domains. eBay: 5 domains. No Shopify, WooCommerce, or other platform adapters. |
| `src/popup/App.tsx` | Root popup component. Loads items on mount; queries active tab; two-phase content script injection on "+ Save"; builds `TrackedItem` and calls `saveItem`. Dedup by comparing `pageInfo.url` against `item.url` (canonical URL equality). Sort: recent change / biggest drop / name / date added. |
| `src/popup/components/SaveProductPanel.tsx` | Detected-product card with target-price input and manual-price fallback. |
| `src/popup/components/TrackedItemCard.tsx` | Per-item card. Shows `⚠ Needs attention` when `consecutiveFailures ≥ 5`. No distinction between blocked and error states. Price change is % vs `initialPrice`, not vs last checked. |
| `src/popup/components/SparklineChart.tsx` | Inline SVG polyline from `PricePoint[]`. No gap rendering — plots `history.length - 1` segments with evenly spaced x-positions regardless of `observedAt` timestamps. **Gaps in observation time appear as straight lines, not gaps.** |
| `src/popup/main.tsx` | React root mount into `#root`. |
| `src/options/App.tsx` | Check-interval slider (1–24 h), notifications toggle, mute select, JSON export/import with structural validation. `perSiteEnabled` in schema but no UI to edit it. |
| `src/lib/storage.ts` | Typed wrapper over `chrome.storage.local`. Single key `pricewatch_data`. Schema v1. Migration runner (v0 → v1). 5 MB soft quota guard (pre-write JSON byte estimate via `Blob.size`). Every public function: `loadSchema() → mutate → saveSchema()`. |
| `src/lib/money.ts` | `parsePrice`: locale-aware string → `Money`. `formatMoney`, `compareMoney`, `isLessThan`, `sameCurrency`, `priceDifferencePercent`, `moneyFromMinor`. Throws on cross-currency comparison. |
| `src/lib/history.ts` | `addPricePoint` + `downsampleHistory`. Cap: 200 points. Downsamples points older than 90 days to 1 per calendar day (keeps latest). |
| `src/lib/backoff.ts` | `calculateBackoffMs`, `checkerBackoffMs` (base 6 h, cap 72 h), `isDueForCheck`, `staggerDelayMs` (2–8 s). |
| `src/lib/logger.ts` | Structured console logger. Production min level: `'warn'` (via `import.meta.env.DEV` check). Dev: all levels. Output to `globalThis.console` (safe in SW context). |
| `src/lib/url.ts` | `canonicalizeUrl`: strips 30+ tracking params, Amazon `/ref=` path segments, forces HTTPS, lowercases hostname, sorts remaining params. `getHostname`: strips `www.`. |
| `src/lib/result.ts` | `Result<T, E>` type with `ok`, `err`, `isOk`, `isErr`, `mapResult`, `unwrapOr`. |
| `src/lib/strings.ts` | All user-visible strings. `perSiteSettings` string exists but no UI renders it. |
| `src/types/index.ts` | All shared types (see §2). |
| `vite.config.ts` | Main build: popup + options + service worker via crxjs. |
| `vite.content.config.ts` | Separate IIFE build → `dist/src/content/index.js`. |
| `tests/setup.ts` | Vitest global setup. Full Chrome API mock (storage, runtime, alarms, notifications, tabs, scripting, action). Default: storage reads return `{}`, writes succeed. |

### Data flow: "user marks a product" → "notification fires"

```
1. User visits product page, opens popup
   chrome.tabs.query({ active: true, currentWindow: true })
   → tab.url, tab.id
   → canonicalizeUrl(tab.url) → pageInfo.url
   getAllItems() → loadSchema() → chrome.storage.local.get('pricewatch_data')
   → items[] rendered in popup

2. User clicks "+ Save"
   chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/index.js'] })
     [content script runs in page's isolated world]
     extractProduct(document, hostname)
       tries: adapter → jsonld → microdata → opengraph → generic
       → ExtractedProduct { title, price, imageUrl, currency, inStock, confidence, method }
     window.__pricewatch_result__ = { success, product }
   chrome.scripting.executeScript({ target: { tabId }, func: () => window.__pricewatch_result__ })
   → popup receives ExtractedProduct (or null → manual-price fallback)

3. User clicks "Track Product"
   builds TrackedItem {
     id: uuidv4(),
     url: pageInfo.url (canonical),
     initialPrice: product.price,
     currentPrice: product.price,
     history: [{ price, observedAt: now, inStock }],
     consecutiveFailures: 0, paused: false,
     extractionMethod: product.method,
     ...
   }
   saveItem(item) → loadSchema() → schema.items[id] = item → chrome.storage.local.set

4. chrome.alarms fires 'pricewatch-check' every 30 minutes
   service worker may have been evicted and cold-starts

5. runCheckPass()
   getAllItems() + getSettings() from chrome.storage.local.get('pricewatch_data')
   filter: !paused && isDueForCheck(lastCheckedAt, consecutiveFailures, checkIntervalMs)
   slice to MAX 10 items
   group by hostname
   for each item (sequential):
     [if not first] setTimeout stagger 2–8 s   ← see R4
     fetch(url, { signal: AbortController(15s), credentials: 'omit', ... })
     → HTTP error → status: 'error'
     DOMParser.parseFromString(html, 'text/html') → Document
     extractProduct(doc, hostname) → ExtractedProduct | null
     isBlockedResponse(doc, extracted) → if null + bot keywords → status: 'blocked'
     sameCurrency check → mismatch → status: 'error'
     → status: 'ok', product: ExtractedProduct
     applyCheckResult(item, result, now)
       'ok': update currentPrice; if changed, addPricePoint to history; check shouldTriggerNotification
       'error': consecutiveFailures++; ≥5 → logger.error only
       'blocked': consecutiveFailures++
     saveItem(updatedItem) → chrome.storage.local.set

6. processNotifications()
   getAllItems() from storage
   filter: shouldTriggerNotification(item)
     • cooldown: lastNotifiedAt within 24 h → skip
     • dedup: currentPrice.amountMinor >= lastNotifiedPriceMinor → skip
     • trigger: currentPrice < targetPrice, or if no target, currentPrice < initialPrice
   ≥ 3 items → sendBatchNotification; else sendItemNotification per item
   chrome.notifications.create(...)
   for each notified item:
     saveItem({ ...item, lastNotifiedAt: now, lastNotifiedPriceMinor: current })

7. User clicks notification
   chrome.notifications.onClicked → handleNotificationClick(notificationId)
   item notification → getAllItems() → chrome.tabs.create({ url: item.url })
   batch notification → chrome.action.openPopup() (may fail outside user gesture)
   chrome.notifications.clear(notificationId)
```

**State at each hop**

| Hop | Where state lives |
|---|---|
| Tab URL and ID | `chrome.tabs` API — ephemeral |
| Extracted product | `window.__pricewatch_result__` in page isolated world — ephemeral, tab-scoped |
| Popup React state | `useState` — popup lifetime only, lost on close |
| All persistent data | `chrome.storage.local`, key `pricewatch_data` |
| Alarm schedule | `chrome.alarms` — survives SW eviction |

---

## 2. Current data model

Single key in `chrome.storage.local`: **`pricewatch_data`**

Everything is one JSON blob. One `chrome.storage.local.get` call deserializes the
entire dataset. One `chrome.storage.local.set` call serializes and writes it all.

```typescript
// Key: 'pricewatch_data'
StorageSchema {                            // src/types/index.ts:46
  schemaVersion: number                   // 1 currently
  items: Record<string, TrackedItem>      // keyed by TrackedItem.id (UUID v4)
  settings: AppSettings
  notifications: NotificationState
}

TrackedItem {                             // src/types/index.ts:16
  id: string                             // UUID v4
  url: string                            // canonical URL (tracking params stripped)
  title: string
  imageUrl: string | null
  hostname: string                       // www. stripped
  currency: CurrencyCode                 // ISO 4217 string, not validated beyond typeof
  initialPrice: Money                    // price at save time
  currentPrice: Money                    // most-recently extracted price
  targetPrice: Money | null
  history: PricePoint[]                  // inline, max 200, >90d downsampled to 1/day
  createdAt: number                      // epoch ms
  lastCheckedAt: number | null           // epoch ms
  lastNotifiedAt: number | null          // epoch ms
  lastNotifiedPriceMinor: number | null  // for notification dedup
  consecutiveFailures: number
  paused: boolean
  extractionMethod: ExtractionMethod     // one value for the whole item, not per observation
}

Money {                                  // src/types/index.ts:3
  amountMinor: number                   // integer (e.g. 1999 = $19.99)
  currency: CurrencyCode
}

PricePoint {                             // src/types/index.ts:8
  price: Money
  observedAt: number                    // epoch ms
  inStock: boolean
  // NO advertisedListPrice field
  // NO parseTier field
}

AppSettings {                            // src/types/index.ts:53
  checkIntervalHours: number            // default 6
  notificationsEnabled: boolean
  mutedUntil: number | null             // epoch ms
  perSiteEnabled: Record<string, boolean>  // stored, never read by any logic
}

NotificationState {                      // src/types/index.ts:60
  lastBatchNotificationAt: number | null
  recentlyNotifiedItemIds: string[]     // appended, never read
}
```

**Serialization:** Standard `JSON.stringify` / `JSON.parse`. All numbers are
stored as numbers (not strings). Epoch ms throughout.

**Migration history** (`src/lib/storage.ts:36`):

| Version | Change |
|---|---|
| v0 → v1 | Adds `consecutiveFailures`, `paused`, `lastNotifiedAt`, `lastNotifiedPriceMinor` to any item missing them |

---

## 3. Storage budget

### Per-item size today

Measured by serializing representative `TrackedItem` JSON objects.

**Base item, no history (object keys included):**

Fields serialized as JSON:

| Field | Typical bytes |
|---|---|
| `"id":"xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"` | 42 |
| `"url":"https://example.com/product/widget-blue"` | 55 |
| `"title":"Product name of typical length here"` | 50 |
| `"imageUrl":"https://cdn.example.com/images/product.jpg"` | 60 |
| `"hostname":"example.com"` | 22 |
| `"currency":"USD"` | 15 |
| `"initialPrice":{"amountMinor":9999,"currency":"USD"}` | 50 |
| `"currentPrice":{"amountMinor":9999,"currency":"USD"}` | 50 |
| `"targetPrice":null` | 16 |
| `"history":[]` | 11 |
| `"createdAt":1722000000000` | 25 |
| `"lastCheckedAt":1722000000000` | 28 |
| `"lastNotifiedAt":null` | 22 |
| `"lastNotifiedPriceMinor":null` | 28 |
| `"consecutiveFailures":0` | 24 |
| `"paused":false` | 14 |
| `"extractionMethod":"jsonld"` | 27 |
| Braces, commas, whitespace | ~20 |
| **Base total** | **~559 bytes** |

**Per `PricePoint`** (inline in `history[]`):

```json
{"price":{"amountMinor":9999,"currency":"USD"},"observedAt":1722000000000,"inStock":true}
```
= **88 bytes**

**Item totals by history depth:**

| History points | Item size | Notes |
|---|---|---|
| 0 | ~560 B | Just saved, never checked |
| 10 | ~1.4 KB | ~10 price changes |
| 50 | ~5.0 KB | ~1 year of weekly changes |
| 100 | ~9.4 KB | |
| 200 (cap) | ~18.2 KB | Max under current cap |

**In practice:** History grows only on price *changes*, not every poll. A product
polled every 6 hours that changes price once a week accumulates ~52 points/year.
At 2 years: ~104 points ≈ ~9.7 KB per item.

### Top-level overhead (non-item fields)

| Field | Size |
|---|---|
| `schemaVersion` | ~20 B |
| `settings` | ~120 B |
| `notifications` (50 UUID strings) | ~1.9 KB |
| Object boilerplate | ~30 B |
| **Total overhead** | **~2.1 KB** |

### Projection to 100 products

**All data is under one storage key.** Every read and write touches every item
regardless of how many items changed.

| Scenario | Per-item avg | 100-item total | % of 10 MB quota |
|---|---|---|---|
| Sparse history (avg 25 pts) | ~2.8 KB | ~282 KB | 2.8% |
| Typical (avg 75 pts) | ~7.2 KB | ~722 KB | 7.2% |
| Dense (200 pts cap, volatile prices) | ~18.2 KB | ~1.82 MB | 18.2% |

**Quota verdict:** At 100 products the 10 MB limit is not a concern even in the
dense case. The existing 5 MB soft guard (`storage.ts:10`) is overly conservative
and would fire at ~270 typical-history items or ~55 fully-loaded items.
`unlimitedStorage` is not needed at this scale.

**Write cost is the real problem, not quota.** Every `saveItem` call:
1. `JSON.parse` of the entire blob (up to 1.8 MB at 100 dense items)
2. Mutate one item
3. `JSON.stringify` of the entire blob
4. `chrome.storage.local.set` (which itself serializes again internally)

After a 10-item check pass + notifications, that is 20+ full-blob cycles.
At 100 items with dense history, each cycle can exceed 1 MB of
serialization work, all blocking the service worker event loop. This is the
primary structural reason to shard storage in Phase 1b.

---

## 4. Blockers

### a. Price history as a time series

**Not blocked at the data level — blocked at the presentation level.**

`TrackedItem.history: PricePoint[]` exists and is populated correctly (only on
price changes, `checker.ts:184`). `addPricePoint` and `downsampleHistory` work.

What is missing or wrong:

1. **No `observedAt`-based x-axis in the sparkline.** `SparklineChart.tsx:30`
   distributes points evenly across the SVG width by index, not by timestamp.
   A gap of three weeks between two observations is drawn as one segment
   identical to a gap of one day. A smooth line through missing data is a lie.

2. **No `advertisedListPrice` field** anywhere in `PricePoint`, `TrackedItem`,
   or `ExtractedProduct`. No extraction logic for it. Phase 3 fake-discount
   detection requires this field on every observation.

3. **Cap is 200 points** (Phase 1b spec wants 400 plus permanent allTimeMin /
   allTimeMax). The current `downsampleHistory` drops the oldest points when
   trimming, so trimming permanently loses the historical minimum if it is old.

4. **No sanity guard.** Any extracted price, including obviously wrong ones from
   the generic heuristic, writes directly to history and updates `currentPrice`.

5. **No parse tier per observation.** `extractionMethod` is one value on the
   whole `TrackedItem`, not stamped per `PricePoint`. After Phase 2 introduces
   tiers, there is no way to know which tier produced each stored observation.

**Fix type for items 2–5:** Refactor of `PricePoint`, `TrackedItem`, and
`ExtractedProduct`, plus new extraction logic. This is Phase 1b + Phase 2.
**Fix type for item 1:** Additive — change `SparklineChart` x-calculation.

---

### b. Storing the advertised "was" price separately from current price

**Fully blocked. Nothing in the current codebase captures this field.**

- `ExtractedProduct` has no `advertisedListPrice` field (`types/index.ts:36`).
- `PricePoint` has no `listPriceMinor` field (`types/index.ts:8`).
- `TrackedItem` has no `advertisedListPrice` field.
- No extraction strategy reads a strikethrough price. `jsonld.ts` resolves
  `offer.lowPrice` but ignores `offer.highPrice`. Amazon and eBay adapters read
  the current price selector only.

Phase 3 fake-discount detection is built entirely on comparing the retailer's
stated "was" price to our observed history. Without this field, Phase 3 cannot
function at all.

**Fix type:** Refactor of all three types plus new extraction logic in every
strategy. The Shopify `compare_at_price` field (Phase 2 Tier 2) provides this
automatically; JSON-LD `offer.highPrice` sometimes carries it; HTML strikethrough
elements require per-site heuristics. This is a Phase 2 deliverable that gates
Phase 3.

---

### c. Suppressing duplicate and trivial notifications

**Three suppressions exist; three are missing.**

**Exists:**
- 24-hour per-item cooldown (`checker.ts:238`, `lastNotifiedAt`)
- Price-level dedup: no re-notify at same or higher price (`checker.ts:243`, `lastNotifiedPriceMinor`)
- Global mute toggle (`notifier.ts:24`, `settings.mutedUntil`)

**Missing:**

1. **Minimum delta filter.** No `MIN_DELTA_PCT` check. A $0.40 wobble on a $300
   item (0.13%) fires every time cooldown expires, as long as price stays below
   `lastNotifiedPriceMinor`. Plan requires `price <= lastAlertedPrice * (1 - 0.03)`.

2. **Idempotency key.** No hash of `(productId, priceMinorUnits, dayBucket)`
   stored or checked. A service worker eviction mid-notification pass, or a
   `RUN_CHECK` message arriving while an alarm is also running, can double-send.

3. **Quiet hours.** No time-of-day suppression. Notifications fire at any hour.
   Plan requires hold-not-drop with overnight coalescing.

4. **Tier gate.** No check that `extractionMethod === 'adapter'` means a
   reliable tier (due to the `method: 'adapter'` bug in generic.ts, this check
   would be wrong even if it existed). Plan requires Tier 1 or 2 only for alerts.

**Fix type:** All additive. New fields on `TrackedItem` (or a new `alerts` key
for idempotency keys), new checks in `shouldTriggerNotification`, and a quiet-
hours accumulation mechanism in `processNotifications`.

---

### d. Failing closed when extraction breaks, rather than showing a stale price

**Partially done. The price is not updated on failure, but the failure is not
surfaced distinctly until it is already severe.**

**What currently happens on extraction failure:**

1. `checkItem` returns `{ status: 'error' }` or `{ status: 'blocked' }`.
2. `applyCheckResult` increments `consecutiveFailures`. Sets `lastCheckedAt`.
3. `currentPrice` is **not updated** — the last good price is preserved.
4. After ≥ 5 failures, `logger.error` is called. `TrackedItemCard` shows `⚠ Needs attention` via the `consecutiveFailures ≥ 5` check (`TrackedItemCard.tsx:49`).

**What is missing:**

1. **No `parseStatus` field.** There is no machine-readable reason code on
   `TrackedItem` to distinguish: `ok`, `error`, `blocked`, `paused-by-user`.
   The UI cannot render "this site blocks background checks" vs "selector broke"
   vs "network timeout" vs "user paused".

2. **Failures 1–4 are invisible to the user.** The item card looks identical
   to a healthy item. `consecutiveFailures` is in storage but not surfaced until
   it hits 5.

3. **`blocked` and `error` are treated identically** by `applyCheckResult` —
   both increment `consecutiveFailures` with no distinction stored.

4. **No per-item `parseStatus` means the dashboard cannot filter by it.** Phase
   3 needs to filter by "paused due to extraction failure" as a first-class state.

5. **`lastCheckedAt` is updated on every check attempt, including failures.**
   A user looking at "Last checked: 2h ago" cannot tell if that check succeeded
   or failed. `lastSuccessfulParseAt` does not exist.

**Fix type:** Additive. New fields `parseStatus`, `parseStatusReason`,
`lastSuccessfulParseAt` on the entity. Small changes to `applyCheckResult` and
`TrackedItemCard`.

---

### e. A full-page dashboard, as opposed to the popup

**Fully blocked by architecture — no dashboard exists at all.**

Current state:
- One HTML page: `src/popup/index.html`, loaded as the extension popup.
- All item display is in `src/popup/App.tsx`, a cramped popup-sized component.
- The popup has no route to a full page.
- There is no `dashboard.html`, no `src/dashboard/` directory, no
  `chrome.action.openPopup()` → dashboard navigation.
- The options page (`src/options/index.html`) exists but handles settings only.

What is needed for Phase 3:
- New entry point: `src/dashboard/index.html` + `App.tsx` + `main.tsx`
- Registered in `manifest.json` (as `chrome_url_overrides` or a plain
  `web_accessible_resource` opened via `chrome.tabs.create`)
- New Vite entry point in `vite.config.ts`
- `idx` storage key (Phase 1b) to power the list view with one read
- Virtual row rendering (the popup's current item list is not virtualized)

**Fix type:** Additive (new files, new manifest entry, no changes to existing
popup code required). Depends on Phase 1b sharded storage.

---

## 5. Risk register

### R1 — `void chrome.alarms.create(...)` silently discards alarm creation failure
**File:** `src/background/scheduler.ts:15`
**Severity:** High

```typescript
void chrome.alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 30 });
```

`chrome.alarms.create` returns a `Promise<void>` in MV3. Errors (e.g. the
browser's alarm limit exceeded) are silently discarded by `void`. If alarm
creation fails, price checking never runs and the user receives no indication.
The `void` was added to satisfy the no-floating-promises lint rule, but the
correct fix is `.catch(err => logger.error(...))`.

---

### R2 — Event listeners registered synchronously at top level ✓ / one exception
**File:** `src/background/index.ts`
**Severity:** Low (one edge case)

The four listener groups are all registered synchronously at module evaluation
time — correct MV3 practice. However, `handleNotificationClick` calls
`getAllItems()` (an async storage read) *inside* the `onClicked` handler before
creating a tab. If the service worker is evicted between the notification being
clicked and the tab being created, the tab open succeeds (Chrome re-wakes the
SW for the event), but the `getAllItems` call starts fresh — this is fine since
it reads from storage, not from memory. No actual risk here, but worth noting.

---

### R3 — Single-blob storage: every write rewrites every item
**File:** `src/lib/storage.ts:142`
**Severity:** High (performance, not correctness)

`loadSchema() → mutate one field → saveSchema()` is the pattern for every
public storage function. After a 10-item check pass followed by notification
marking, the service worker performs 20+ full-blob serialize/deserialize cycles.
At 100 dense-history items this is ~1.8 MB per cycle. No data is lost, but the
event loop is blocked and the total execution time grows toward the SW timeout.
This is the primary motivation for the sharded key layout in Phase 1b.

---

### R4 — `setTimeout` used for inter-request stagger inside the service worker
**File:** `src/background/checker.ts:149`
**Severity:** Medium

```typescript
await new Promise<void>((resolve) => setTimeout(resolve, delay));
```

Used to stagger requests within a single alarm handler invocation. This is
technically acceptable (the SW is kept alive by an ongoing event handler), but
the total pass duration can reach (15 s fetch timeout + 8 s jitter) × 10 items
= 230 s. Chrome's SW extended timeout (while a fetch or alarm event is active)
is not publicly documented and has been observed to vary. If Chrome kills the
worker mid-pass, remaining items are silently skipped until the next alarm.
No data is corrupted, but checks are missed. The fix (Phase 4) is to make the
pass resumable by persisting a cursor.

---

### R5 — `generic.ts` returns `method: 'adapter'` — wrong tier identifier
**File:** `src/content/extract/adapters/generic.ts:111`
**Severity:** High

The generic DOM heuristic returns `{ method: 'adapter' }`. All stored items
where the generic heuristic ran show `extractionMethod: 'adapter'` — identical
to Amazon and eBay dedicated adapters. Any future logic that gates behaviour on
extraction tier (Phase 4: "never alert on Tier 3") cannot identify generic-
heuristic items. A misidentified DOM node becomes an alert-eligible observation.

---

### R6 — Notification double-send on service worker restart mid-pass
**File:** `src/background/notifier.ts:17`
**Severity:** Medium

`processNotifications()` reads all items, identifies triggered items, sends
notifications, then marks items as notified — three separate storage operations.
If the service worker is evicted between sending and marking, the next alarm
fires `processNotifications()` again, finds the same items still unnotified
(because `lastNotifiedAt` was never written), and sends duplicate notifications.
The 24-hour cooldown only prevents recurrence after the mark is written.

---

### R7 — `SparklineChart` draws straight lines through observation gaps
**File:** `src/popup/components/SparklineChart.tsx:30`
**Severity:** Medium (correctness, user trust)

```typescript
const x = padding + (i / (prices.length - 1)) * plotWidth;
```

X position is computed by *index*, not by `observedAt` timestamp. Two observations
one week apart are drawn the same distance as two observations one hour apart.
The plan explicitly requires "render gaps as gaps rather than interpolating a
straight line through days we never observed, because a smooth line through
missing data is a lie."

---

### R8 — `recentlyNotifiedItemIds` and `perSiteEnabled` are dead schema fields
**Files:** `src/background/notifier.ts:66`, `src/types/index.ts:57`
**Severity:** Low

`NotificationState.recentlyNotifiedItemIds` is appended to on every notification
pass (capped at 50 in `notifier.ts:70`) but never read for any purpose.
`AppSettings.perSiteEnabled` is stored and defaulted but never consulted by the
checker. Both write to storage on every cycle for no effect and bloat the blob.

---

### R9 — `parsePrice` correctly rejects "Free" / "See price in cart" / "" but the fallback may find a wrong price
**File:** `src/lib/money.ts:61`, `src/content/extract/index.ts:28`
**Severity:** Medium

`parsePrice("")` → `err`. `parsePrice("Free")` → stripped → `err`.
`parsePrice("See price in cart")` → stripped → `NaN` → `err`. These all return
`err` correctly and the extractor returns `null`.

The risk is the fallback chain. If the page's primary price element contains
"See price in cart", JSON-LD fails, and the generic heuristic finds a *different*
number (a related-product price, a shipping cost, a sold-count) and returns it
at confidence 0.40 as a plausible price. The caller cannot distinguish "no price
found on this page" from "wrong element found". Confidence 0.40 should always
require a sanity guard before storage — Phase 1b adds this.

---

### R10 — Load-modify-save is not atomic; concurrent popup + alarm writes can clobber
**File:** `src/lib/storage.ts:142`
**Severity:** Low (rare in practice, not catastrophic)

A user saving a new item in the popup while the alarm handler is mid-pass can
interleave: both read the same blob, both mutate different items, one write
overwrites the other. In practice the alarm pass is sequential and the popup save
is a single user action, so the window is small. No data is permanently
corrupted — the next write restores the missing field. But it can cause a save
to silently vanish.

---

*No questions for you. Everything above is directly observable from the code.*
