# PriceWatch

Chrome extension (Manifest V3) that lets users watch product pages and get alerted
on meaningful price drops.

## Current state
- Manifest version: MV3
- Frontend: React 18 + TypeScript (strict mode), hooks only
- Bundler: Vite 5 with @crxjs/vite-plugin; content script built via a separate vite.content.config.ts as an IIFE
- Storage today: chrome.storage.local (single JSON blob under key `pricewatch_data`, schema version field, migration runner)
- Backend today: none
- Database today: none
- Retailers currently parsed: Amazon (amazon.com / .co.uk / .de / .ca / .co.jp / .in / .fr / .es / .it / .com.au), eBay (ebay.com / .co.uk / .de / .com.au / .ca) via dedicated adapters; any other site falls back to JSON-LD → Microdata → OpenGraph → generic DOM heuristic
- Users: [FILL: 0 / ~N installs]
- Monetization intent: [FILL: affiliate links / subscription / none yet]

## Product principles
1. A notification must be trustworthy. A false or duplicate alert costs more than
   a missed one. Suppress aggressively.
2. Never claim a price record we cannot defend from stored history.
3. Extraction must degrade gracefully. A broken selector shows "tracking paused",
   never a wrong price.
4. The watched unit is a product variant, not a URL.

## Engineering constraints
- TypeScript strict mode. No `any` in new code.
- MV3 service workers are evicted. No in-memory state that must survive.
  All state goes to storage. Use `chrome.alarms`, never `setInterval`.
- No remotely hosted code. Remote JSON config is fine, remote executable is not,
  it fails Chrome Web Store review.
- Every parse failure emits a structured telemetry event. Silent failure is a bug.
- Money is stored as integer minor units (cents) plus an ISO 4217 currency code.
  Never float, never a bare number.
- All timestamps are UTC ISO 8601. Alert scheduling respects user local time.
- Migrations are forward-only and versioned. Existing users' watchlists must
  survive every schedema change.

## Definition of done for any task
- Type checks and lints clean
- Unit tests for parsing, money normalization, and alert-decision logic
- Storage migration written and tested against the previous schema version
- No new permission added to the manifest without an explicit note explaining
  why, and what the Chrome Web Store justification text will say
- A short entry appended to CHANGELOG.md
