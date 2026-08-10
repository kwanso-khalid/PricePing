# PriceWatch Extension - Specification

## Overview
A Chrome extension to save product pages and get notified when prices drop.

## Core User Stories
1. Click extension icon on product page → see detected product name, image, current price, currency → save with one click
2. Optionally set target price when saving (default: any drop below price at save time)
3. See all tracked items in popup, sorted by most recent price change, with current/original price and % change
4. Desktop notification when price drops below trigger → click opens product page
5. Delete, edit target price, or pause tracking per item
6. Simple price history per item
7. Export/import tracked items as JSON

## Architecture Decisions

### Manifest V3
- All state in `chrome.storage.local`, never in service worker memory
- Scheduling via `chrome.alarms` (30-minute period)
- Service worker re-registers alarm on every `onInstalled` and `onStartup`

### Extraction Engine (5 layers, confidence-scored)
1. **Site adapter** (confidence 0.92-0.95): Amazon, eBay specific selectors
2. **JSON-LD** (confidence 0.90): schema.org Product/Offer parser, handles @graph
3. **Microdata** (confidence 0.80): itemprop="price" / itemprop="priceCurrency"
4. **OpenGraph** (confidence 0.75): og:price:amount, product:price:amount
5. **Generic DOM heuristic** (confidence 0.40): price-shaped text near heading

Best result (highest confidence) wins. If confidence < 0.5, popup shows manual correction UI.

### Money Handling
- All prices stored as integer minor units (amountMinor) to avoid float errors
- Currency always stored with price
- Never compare prices across currencies
- Format using Intl.NumberFormat

### Background Checking
- Alarm fires every 30 minutes
- Per-alarm pass checks up to 10 due items
- Default check interval: 6 hours (configurable 1-24h)
- Exponential backoff on failures: `min(6h * 2^failures, 72h)`
- 5+ consecutive failures → mark item as "needs attention"
- Stagger requests 2-8 seconds, never parallelize same hostname

### Notifications
- Trigger: currentPrice < targetPrice, or if no target, currentPrice < initialPrice
- Dedup: never notify for same/higher price as last notification
- Cooldown: max 1 notification per item per 24 hours
- Batching: if ≥3 items drop in same pass → 1 grouped notification
- Click notification → open product URL in new tab

## Data Model

See `src/types/index.ts` for full TypeScript types.

### TrackedItem key fields
- `id`: uuid
- `url`: canonical URL (tracking params stripped)
- `initialPrice`/`currentPrice`: Money (amountMinor + currency)
- `targetPrice`: Money | null (null = any drop triggers notification)
- `history`: PricePoint[] (capped at 200, old entries downsampled to 1/day)
- `consecutiveFailures`: number (≥5 = needs attention)
- `paused`: boolean

## URL Canonicalization
- Strip tracking params: UTM, Amazon ref/qid/sr, fbclid, gclid, eBay campid, etc.
- Strip Amazon path-style tracking: `/ref=sr_1_1`
- Remove fragment
- Sort remaining params for stability
- Normalize to https://
