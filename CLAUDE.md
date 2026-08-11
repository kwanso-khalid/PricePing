# PricePing

Local-only Chrome extension (MV3). Nothing leaves the browser. No backend, no
accounts, no AI, no third-party services.

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

Prices are only checked while Chrome is running, so history has gaps. Show the
observation count everywhere a trend is displayed so thin data looks thin.

---

## Current state

- Manifest version: MV3
- Frontend: React 18, TypeScript strict mode, hooks only
- Bundler: Vite 5 with @crxjs/vite-plugin; content script built as a separate IIFE via `vite.content.config.ts`
- Storage: `chrome.storage.local`, single JSON blob under key `pricewatch_data`, schema v1, forward-only migration runner
- Backend: none
- Database: none
- Extraction tiers today: adapter (Amazon, eBay hardcoded) → JSON-LD → Microdata → OpenGraph → generic DOM heuristic. No Shopify/.js or platform-endpoint tier yet.
- Advertised "was" price: not captured. No field in `PricePoint`, `TrackedItem`, or `ExtractedProduct`.
- `parseStatus` field: does not exist on `TrackedItem`. Failure surfaces only after 5 consecutive failures via `consecutiveFailures` counter.
- Parse tier recorded per observation: not yet. `extractionMethod` on `TrackedItem` is a single value, not per-observation.
- 100-product cap: not enforced. No limit at add time.
- Sanity guard on observations: not implemented.
- Dashboard page: does not exist. All UI is in the popup.
- Idempotency keys for notifications: not implemented.
- Quiet hours: not implemented.
- `optional_host_permissions: ["<all_urls>"]`: declared in manifest but never requested at runtime via `chrome.permissions.request`. Removed in Phase 0 cleanup.
- Users: [FILL]
- Monetization intent: [FILL]

---

## Product principles

1. A notification must be trustworthy. A false or duplicate alert costs more than
   a missed one. Suppress aggressively.
2. Never claim a price record we cannot defend from stored history.
3. Thin data must look thin. Show observation counts everywhere a trend appears.
4. Extraction must fail closed. A broken selector shows "tracking paused", never
   a stale price presented as current.
5. It is the user's data. Export must always work, even if nothing else does.

## Engineering constraints

- TypeScript strict mode. No `any` in new code.
- MV3 service workers are evicted. No in-memory state that must survive.
  All state goes to `chrome.storage`. Use `chrome.alarms`, never `setInterval`
  for anything that must outlive the current event handler.
- Register all event listeners synchronously at the top level of the service
  worker. A listener registered inside an async callback or after an `await` is
  lost on eviction.
- No remotely hosted code. Config files (data-only JSON) are acceptable; remote
  executables fail Chrome Web Store review.
- Every parse failure produces a structured log entry. Silent failure is a bug.
- Money is stored as integer minor units plus an ISO 4217 currency code. Never a
  float, never a bare number.
- All timestamps are epoch milliseconds in storage. ISO 8601 in log output.
- Migrations are forward-only and versioned. Existing tracked products must
  survive every schema change, seeded with whatever data we already hold.
- Tier 3 (generic heuristic) observations may never alone trigger a notification
  or support a fake-discount verdict.

## Definition of done for any task

- Typechecks and lints clean (`npm run typecheck && npm run lint`)
- Unit tests for all new logic; existing suite stays green (`npm test`)
- Storage migration written and tested against the previous schema version
- No new permission added to the manifest without a justification comment in the
  same commit
- A short entry appended to `CHANGELOG.md`
