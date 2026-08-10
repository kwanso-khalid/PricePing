# PriceWatch Roadmap (slim)

Scope: local-only Chrome extension. Price drop notifications plus fake discount
detection. No backend, no server, no accounts, no AI. Nothing leaves the browser.

Dropped from the earlier plan: price protection, shared polling, cross-retailer
matching, remote config, email and web push.

Consequence you are accepting: tracking only happens while Chrome is running.
That is fine for this product, but it means history has gaps and the confidence
gating in Phase 3 matters more, not less.

---

## PART A: audit (run first, no code)

```
Read the entire codebase and produce an audit. Do not modify files in this task.

1. ARCHITECTURE MAP
   Every file, its responsibility, and the data flow from "user clicks watch"
   to "notification fires". Where does state live at each hop?

2. CURRENT DATA MODEL
   The exact shape of what we persist today, inferred from code, not from
   comments or docs. Include the storage keys in use.

3. BLOCKERS
   For each, what in the current code prevents it, and is the fix additive or
   a refactor:
   a. Storing price history as a time series
   b. Storing the retailer's advertised "was" price separately from current price
   c. Suppressing duplicate and trivial notifications
   d. Failing closed when a selector breaks, instead of showing a stale price

4. RISK REGISTER
   Anything already broken or fragile: unhandled rejections, permissions held
   but unused, setTimeout or setInterval that assumes the MV3 service worker
   stays alive, unversioned storage writes, price parsing that can produce a
   wrong number.

5. STORAGE BUDGET
   How much data do we persist per watched product today, and what happens at
   100 and at 500 watched products?

Write the result to docs/audit.md. Ask me anything you cannot answer from the
code. Do not guess.
```

---

## PART B: Phase 1, storage and price history

```
Refactor storage to hold a price time series. Everything later depends on this,
so the model comes before the features.

1. Money as integer minor units plus an ISO 4217 currency code. Never a float,
   never a bare number. Write a pure `normalizeMoney(input: unknown): Money | null`
   handling comma decimal separators, thin spaces, symbols on either side, and
   price ranges (take the low end). Test against at least 20 real world strings
   including "1.299,00 EUR", "$1,299.00", "1 299,00 zl", "Free",
   "See price in cart", "".

2. Entities. Propose the exact field list for my review before implementing:
   - Product: id, retailer, url, canonical key, title, image, currentPrice,
     currency, advertisedListPrice (nullable), stockState, lastCheckedAt,
     lastSuccessfulParseAt, parseStatus
   - PriceObservation: productId, priceMinorUnits, advertisedListMinorUnits,
     stockState, observedAt. Append-only. Insert ONLY when price or stock
     changed, never on every poll.
   - Watch: productId, targetPrice (nullable), lastAlertedPrice, lastAlertedAt,
     cooldownHours, createdAt

3. Canonical key so the same product on two URLs collapses to one record:
   sha256(retailer + normalized_path + sorted_variant_params). Strip tracking
   params, session ids, locale segments. One pure testable function.

4. Sanity guard. Reject any observation below 20% or above 5x the trailing
   median of the last 10 observations. Do not store it, log it as an anomaly.
   One bad write permanently poisons our "lowest ever" claims.

5. Storage: chrome.storage.local, versioned, with a forward-only migration.
   Existing watchlists must survive, seeded with whatever price we already hold.
   Store observations compactly, positional arrays rather than object keys.
   Cap retention at 400 observations per product, dropping oldest, and keep a
   permanent all-time min and max so trimming never breaks a record claim.
   Report the projected bytes per product at 100 and 500 products, and add the
   unlimitedStorage permission only if the numbers actually require it.

6. Cache derived stats on the Product record, recomputed on write not on read,
   so the popup is a single lookup: min, max and median over 30, 90 and 365 days
   and all time, plus observation count and days of history.

Show me the schema and migration plan first. Wait for my approval.
```

---

## PART C: Phase 2, extraction that does not lie

```
Replace selector-only scraping with a layered chain. DOM breakage is the top
operational failure mode and a wrong price is worse than no price.

Order, first success wins:
1. JSON-LD, script[type="application/ld+json"], including @graph traversal
2. Microdata and RDFa, itemprop="price" and itemprop="availability"
3. Open Graph product tags
4. Retailer-specific CSS selectors from a bundled JSON config
5. Fail closed: set parseStatus to "paused", surface it in the popup, log it.
   Never guess, never keep showing the old price as if it were current.

Also:

- Extract the advertised list, "was", or strikethrough price separately from the
  current price. Do not conflate them. Phase 3 is built entirely on this field.
- Extract stockState as an enum: in_stock, out_of_stock, preorder, limited,
  unknown.
- Selector config is data-only JSON validated with zod before use, keyed by
  retailer hostname, so adding a retailer is a config edit and not a code change.
- Return a `ParseResult` discriminated union: success carrying which layer
  produced it, or failure with a machine-readable reason.
- Tests using fixture HTML per supported retailer: one JSON-LD case, one
  selector-only case, one out-of-stock case, one price-range case, one page with
  an advertised list price, and one deliberately broken page asserting we fail
  closed rather than reporting a wrong number.

Retailers to support: [FILL: your list]
```

---

## PART D: Phase 3, fake discounts and trustworthy alerts

```
The two user-facing features. Both stand on stored history, so every claim must
be provable from it.

FAKE DISCOUNT DETECTION

Compare the retailer's advertised list price against what we have actually
observed. Return a structured verdict, never prose:

  { verdict: 'genuine' | 'inflated' | 'insufficient_data',
    advertisedList, observedMaxInWindow, windowDays,
    daysObservedAtOrNearList, observationCount }

- 'inflated' only when the item has not been observed at or near the advertised
  list price within the window. Near means within [FILL: 3]%.
- Be conservative. A false accusation is worse than silence. Return
  insufficient_data unless the evidence is unambiguous.
- Copy shows the evidence, not an accusation: "listed as 40% off $199, but we
  have not seen it above $139 in 8 months (62 observations)."

PRICE CONTEXT

For a product and window, return rank of the current price, percent above the
window minimum, percent below the median, and days since it was last this low.
Render a plain label such as "lowest in 97 days" or "3rd lowest ever".

Confidence gating: no superlative on thin data. Require [FILL: 14] days of
history and [FILL: 8] distinct observations before any "lowest" claim. Below
that show "still building history, N observations". Thresholds as named
constants in one place.

ALERTS

Fire only when all of these hold:
- price <= watch.targetPrice, or the price is at a [FILL: 90th] percentile low
- price <= lastAlertedPrice * (1 - 0.03), so a $0.40 wobble on a $300 item
  never fires twice
- hoursSince(lastAlertedAt) >= cooldownHours, default 24
- the observation passed the Phase 1 sanity guard
- stockState is not out_of_stock

Plus:
- Idempotency key per alert: hash of (watchId, productId, priceMinorUnits,
  dayBucket). Persist sent keys. A retry or a service worker restart must never
  double-send.
- Notification body always carries Phase 3 context. Never a bare
  "price dropped".
- Quiet hours in local time, default [FILL: 22:00 to 08:00]. Hold, do not drop,
  and coalesce whatever accumulates overnight into one digest.
- The decision logic is a pure function taking history and returning a decision,
  with table-driven tests covering each suppression rule firing in isolation,
  quiet hours boundaries, and duplicate idempotency keys.

UI

Popup shows: current price, the context label, the discount verdict when not
insufficient_data, and a 90 day sparkline as inline SVG. No chart library, no
network call.

POLLING

chrome.alarms only. Audit for any setTimeout or setInterval that assumes the
service worker stays alive. Poll watched products on a [FILL: 6] hour alarm plus
opportunistically when the user visits a watched page, since that fetch is free
and uses their own session.
```

---

## Decide before Phase 2

Which retailers. Ten parsed correctly beats a hundred parsed badly, and this
sets the whole scope of Phase 2. Everything else above has a working default.
