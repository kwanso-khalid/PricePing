# PriceWatch: Plan

Local-only Chrome extension (MV3). Nothing leaves the browser. No backend, no
accounts, no AI, no third party services.

## Scope

1. Mark a product on almost any retailer site, up to 100 products
2. Dashboard listing every tracked product
3. Per-product price history, trend and metrics
4. Fake discount detection
5. Reliable price drop notifications

## Explicitly out of scope

Backend or sync, cross-retailer price comparison, coupons, post-purchase price
protection, shared or crowd-sourced polling, email or web push, accounts,
analytics, any remote code or remote config.

## Accepted limitation

Prices are only checked while Chrome is running, so history has gaps. This is
handled by capturing opportunistically on every visit to a tracked page and by
showing the observation count everywhere a trend is displayed, so thin data
looks thin instead of authoritative.

---

# Phase 0: cleanup

```
Clean the repo down to the scope in docs/plan.md. Be careful and reversible.

1. Commit all current work first. Do not proceed on a dirty tree.

2. Inventory before deleting. List every file under docs/ and every source file,
   and classify each as: in scope, out of scope, or unclear. Show me the list
   with a one-line reason each. Do not delete anything yet.

3. After I approve, delete only the out-of-scope items in a single commit
   titled "chore: scope cleanup", so it can be reverted as one unit.

4. Docs end state, exactly these:
   - CLAUDE.md
   - docs/plan.md (this file)
   - docs/audit.md (regenerate, see Phase 1)
   - CHANGELOG.md
   Remove every other markdown file, including earlier roadmap and schema
   proposals, since they describe a scope we are no longer building.

5. Rewrite CLAUDE.md so the scope and out-of-scope lists above are the first
   thing in it. Keep the existing Product principles, Engineering constraints
   and Definition of done. Verify every "Current state" value against the code
   and correct anything the code does not prove to "unclear: <reason>".

6. Source code: flag anything dead, unreachable, or serving a dropped feature,
   but do not delete source in this task. List it and wait.

7. Audit the manifest. List every permission, whether the code actually uses it,
   and what the Chrome Web Store justification would be. Flag any we should drop.
```

---

# Phase 1: audit, then storage

## 1a. Audit (no code)

```
Read the entire codebase. Do not modify files. Write the result to docs/audit.md.

1. ARCHITECTURE MAP. Every file, its responsibility, and the data flow from
   "user marks a product" to "notification fires". Where state lives at each hop.

2. CURRENT DATA MODEL. Exact shape of what we persist, inferred from code and
   not from comments. Include storage keys and how values are serialized.

3. STORAGE BUDGET. Bytes persisted per tracked product today. Project it to 100
   products. Note whether all data sits under one storage key, since that
   determines write cost.

4. BLOCKERS. For each, what prevents it and whether the fix is additive or a
   refactor:
   a. Price history as a time series
   b. Storing the advertised "was" price separately from the current price
   c. Suppressing duplicate and trivial notifications
   d. Failing closed when extraction breaks, rather than showing a stale price
   e. A full-page dashboard, as opposed to the popup

5. RISK REGISTER. Unhandled rejections, unused permissions, setTimeout or
   setInterval assuming the MV3 service worker stays alive, event listeners
   registered inside async callbacks rather than at top level, unversioned
   storage writes, any parse path that can yield a wrong number.

Ask me anything the code does not answer. Do not guess.
```

## 1b. Storage

```
Build the storage layer. Everything else sits on this, so the model is settled
before any feature work.

MONEY
Integer minor units plus an ISO 4217 code. Never a float, never a bare number.
Pure `normalizeMoney(input: unknown): Money | null` handling comma decimal
separators, thin spaces, symbols on either side, and price ranges (take the low
end). Test against at least 20 real strings including "1.299,00 EUR",
"$1,299.00", "1 299,00 zl", "Free", "See price in cart", "", "0".

KEY LAYOUT
chrome.storage.local serializes per key, so a single blob means every write
rewrites everything. Shard:
  meta            schema version, settings, counters
  idx             array of product summaries, powers the dashboard list in one read
  p:<id>          product record
  h:<id>          that product's observation history
  alerts          sent idempotency keys, pruned after 60 days
Reading the dashboard list must be one `get('idx')`. Appending an observation
must touch only `h:<id>` and `idx`.

ENTITIES
Propose exact fields for review before implementing.
- Product: id, retailer host, url, canonicalKey, title, imageUrl, variantLabel,
  currentPrice, currency, advertisedListPrice (nullable), stockState,
  parseStatus, parseTier, lastCheckedAt, lastSuccessfulParseAt, createdAt
- Observation: append-only, inserted ONLY when price or stock changed, never on
  every poll. Store as a positional array, not an object, to cut JSON overhead:
  [minutesSinceEpoch, priceMinorUnits, listMinorUnits|0, stockState, tier]
- Watch settings per product: targetPrice (nullable), cooldownHours, muted,
  lastAlertedPrice, lastAlertedAt
- Cached stats on Product, recomputed on write and never on read, so the
  dashboard is a single lookup: min, max, median and observation count over 30,
  90, 365 days and all time, plus daysTracked, changeCount, lastChangeAt

CANONICAL KEY
sha256(retailerHost + normalizedPath + sortedVariantParams). Strip tracking
params, session ids, locale segments. One pure testable function. Adding an
already-tracked product updates it instead of duplicating.

SANITY GUARD
Reject any observation below 20% or above 5x the trailing median of the last 10.
Do not store it, log an anomaly, leave parseStatus untouched. One bad write
permanently corrupts every record claim for that product.

100 PRODUCT CAP
Enforce at add time with a clear message naming what to remove. Retain 400
observations per product, dropping oldest, while keeping allTimeMin and
allTimeMax permanently so trimming never breaks a "lowest ever" claim.
Verify my budget: roughly 32 bytes per observation as a positional array,
400 observations plus about 1KB of metadata gives ~14KB per product, so ~1.4MB
at 100 products against a 10MB quota, about 14%. Measure it for real with
getBytesInUse and report actual numbers. Add unlimitedStorage only if the
measurement demands it, since it worsens store review.

MIGRATION
Versioned and forward-only. Existing tracked products survive, seeded with
whatever price we already hold as their first observation. Test against the
previous schema version.

Show me the schema and migration plan first. Wait for approval.
```

---

# Phase 2: extraction, broad coverage

```
Cover almost any retailer without a per-site selector list. Tiers, first success
wins, and every observation records which tier produced it.

TIER 1, structured data
JSON-LD script[type="application/ld+json"] including @graph traversal, then
microdata and RDFa (itemprop price, availability, gtin), then Open Graph product
tags. Broad coverage because storefronts emit it for Google rich results.

TIER 2, platform endpoints
Detect the ecommerce platform and use its own JSON. This is what buys the long
tail: integrate once, inherit every store on the platform.
- Shopify: any product URL plus ".js" returns variants with price in cents and
  compare_at_price, which is the advertised list price we need for fake discount
  detection, at no extra cost
- WooCommerce, Magento, BigCommerce, Wix: detect via generator meta tag, known
  script paths, or global JS objects, and use their product JSON where exposed
Fetch with credentials omitted. Same-origin only. Never fetch a host the user is
not currently on.

TIER 3, generic DOM heuristic
Currency regex across the page scored by proximity to an add-to-cart control,
font size, and viewport position. Low confidence, always. Noisy by nature.

TIER 4, fail closed
parseStatus "paused" with a machine-readable reason, shown in the popup and
flagged in the dashboard. Never guess, never keep presenting the last known
price as current.

ALSO REQUIRED
- Advertised list, "was" or strikethrough price captured as a separate field.
  Phase 3's discount detection is built entirely on it.
- stockState enum: in_stock, out_of_stock, preorder, limited, unknown
- Client-rendered prices: MutationObserver with a hard timeout, not a single
  parse at load. Many storefronts paint the price after hydration.
- `ParseResult` discriminated union: success carrying tier and confidence, or
  failure with a reason code.
- Opportunistic capture on every visit to a tracked page, since that observation
  is free and needs no polling.

TIER GATES CLAIMS
Tier 1 and 2 observations may support superlatives and an inflated verdict.
Tier 3 observations are stored but require a higher observation count before any
superlative, and may never on their own support a fake discount accusation. A
misidentified DOM node must not become a confident false claim.

COVERAGE HONESTY
Amazon and Walmart render and personalize prices and block programmatic fetches,
so they will land on Tier 3 or paused. Do not special-case them in this phase.
Login-gated and cart-only pricing is uncoverable, detect it and say so rather
than reporting 0.

TESTS
Fixture HTML per tier: JSON-LD, Shopify .js payload, microdata, out-of-stock,
price range, a page with an advertised list price, a client-rendered price, and
a deliberately broken page asserting we fail closed rather than report a wrong
number.
```

---

# Phase 3: dashboard, trends, fake discounts

```
A full extension page at dashboard.html, opened from the popup and the action
context menu. The popup stays small and scoped to the current tab.

LIST VIEW
One `get('idx')`, no per-product reads. Columns: image, title, retailer, current
price, change since added, all-time low, percent above that low, days tracked,
observation count, sparkline, discount badge, status. Sortable on every column.
Filter by retailer, by "dropped since added", by discount verdict, by paused.
Search by title. Virtualize the rows.

DETAIL VIEW
- Price chart, inline SVG, no chart library and no network call. Range toggle
  30 / 90 / 365 / all. Mark min and max. Render observation points, and render
  gaps as gaps rather than interpolating a straight line through days we never
  observed, because a smooth line through missing data is a lie.
- Overlay the advertised list price as a separate series when we have it, which
  makes an inflated list visually obvious.
- Metrics: current, all-time min and max with dates, 30/90/365 min, max and
  median, percent above all-time low, days since last at or below this price,
  number of changes, average days between changes, largest single drop,
  volatility, first and last observed, observation count, parse tier, status.
- Every metric shows the observation count it rests on. A metric from 5
  observations must not look like one from 300.
- Per-product controls: target price, cooldown, mute, delete, open product page.

FAKE DISCOUNT DETECTION
Structured verdict, never prose:
  { verdict: 'genuine' | 'inflated' | 'insufficient_data',
    advertisedList, observedMaxInWindow, windowDays,
    observationsAtOrNearList, observationCount, tierFloor }
- 'inflated' only when the item has not been observed at or near the advertised
  list within the window. Near means within 3%.
- Requires Tier 1 or 2 observations and at least 8 of them across 14 days.
  Otherwise insufficient_data.
- Copy states evidence, not accusation: "listed as 40% off $199, but we have not
  seen it above $139 in 8 months across 62 observations."
- Be conservative. Silence beats a false accusation.

TREND LABELS
Rank of current price in window, percent above window minimum, percent below
median, days since last this low. Plain labels such as "lowest in 97 days" or
"3rd lowest ever". Same confidence gate: 14 days and 8 observations, Tier 1 or 2,
else "still building history, N observations". Thresholds as named constants in
one file.

EXPORT
JSON and CSV export of everything, and JSON import. It is the user's data, it
only exists on their machine, and it is their only backup.

All stats read from cached fields on the Product record. The dashboard performs
no recomputation across full histories on render.
```

---

# Phase 4: reliable notifications

```
Reliability is the whole feature. A missed alert is bad, a false or duplicate
alert is worse, because it costs the install.

DECISION, pure function over history, all conditions must hold
- price <= targetPrice, or price sits at a 90th percentile low for the window
- price <= lastAlertedPrice * (1 - 0.03), so a $0.40 wobble on a $300 item never
  fires twice
- hoursSince(lastAlertedAt) >= cooldownHours, default 24
- the observation passed the Phase 1 sanity guard
- stockState is not out_of_stock
- the product is not muted
- parseTier is 1 or 2. Never alert on a Tier 3 heuristic price.

IDEMPOTENCY
Key = hash(productId, priceMinorUnits, dayBucket). Persist keys in `alerts`,
check before sending, prune after 60 days. A retry, a duplicate poll, or a
service worker restart must never double-send.

MV3 LIFECYCLE, the actual source of unreliability
- chrome.alarms only. Remove every setTimeout and setInterval that assumes the
  worker survives.
- Register all event listeners synchronously at top level in the service worker.
  A listener registered inside an async callback or after an await is lost when
  the worker is evicted, which is the single most common cause of alerts that
  silently stop firing.
- Persist every intermediate step. Assume eviction mid-cycle, and make the poll
  cycle resumable rather than restartable.
- On startup, reconcile: find due checks missed while the browser was closed and
  run them, so closing the laptop for a weekend does not silently skip alerts.

POLLING
A 6 hour alarm plus opportunistic capture on visits to tracked pages. Stagger
across products rather than firing 100 fetches at once. Skip when offline and
retry on reconnect. Exponential backoff per host on failures, and pause a host
after repeated failures rather than hammering it.

DELIVERY
- chrome.notifications, body always carrying Phase 3 context. Never a bare
  "price dropped". Include old price, new price, percent, and the trend label.
- Click opens the product page. Handle the click when the worker was evicted.
- Quiet hours in local time, default 22:00 to 08:00. Hold, do not drop, and
  coalesce overnight accumulation into one digest.
- Badge count of unseen drops on the action icon.
- An in-extension alert log, so a user who missed a system notification can
  still find it. System notifications are not a reliable record.

TESTS
Table-driven over the decision function: each suppression rule firing in
isolation, quiet hours boundaries, duplicate idempotency keys, a Tier 3
observation being refused, and a resumed cycle after simulated eviction.
```

---

# Phase 5: click-to-teach (optional, cut freely)

Only if Tier 1 through 3 coverage proves insufficient in real use. Nothing else
depends on it.

```
Let the user click the price on an unsupported page to teach the extension.

- Element picker overlay, click to select, confirm the parsed value before saving.
- Store a resilient anchor, not an nth-child chain: a stable ancestor identified
  by id or data attribute, plus a text pattern, plus a nearby landmark. Chains
  break on the next deploy.
- Re-verify the anchor on each visit. On mismatch, pause and prompt to re-teach
  rather than reporting a possibly wrong number.
- Taught extractions record as Tier 2.5: they may support superlatives, but keep
  the higher observation requirement for a fake discount verdict.
```

---

# Sequence

Phase 0, then 1a, 1b, 2, 3, 4. One phase per session, commit between. Phase 5
only on evidence.

Approve the schema in 1b before it is implemented. Everything else can run
unattended.
