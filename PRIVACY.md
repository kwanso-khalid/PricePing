# PricePing — Privacy Policy

**Last updated: 2026-08-10**

---

## Summary

PricePing is a local-only Chrome extension. All data stays on your device. Nothing is transmitted to any server, third party, or remote service.

---

## Data Inventory

### What PricePing collects

| Data | Purpose | Stored where | Transmitted where | Third party |
|---|---|---|---|---|
| Product page URLs | Identify which products to track | `chrome.storage.local` on your device | Nowhere | None |
| Product titles | Display in the product list and notifications | `chrome.storage.local` on your device | Nowhere | None |
| Product image URLs | Display product thumbnails | `chrome.storage.local` on your device | Nowhere | None |
| Price observations (timestamp, amount, currency, stock state) | Price history charts, trend analysis, drop detection | `chrome.storage.local` on your device | Nowhere | None |
| Retailer hostname | Group products by store | `chrome.storage.local` on your device | Nowhere | None |
| User settings (check interval, notification preferences, quiet hours) | Extension behaviour configuration | `chrome.storage.local` on your device | Nowhere | None |
| Alert log (price drop events with old/new price and timestamp) | Alert history shown in dashboard | `chrome.storage.local` on your device | Nowhere | None |

### What PricePing does NOT collect

- Your name, email address, or any account information
- Browsing history beyond the specific product pages you choose to track
- Location data
- Device identifiers
- Analytics or usage telemetry
- Any data from pages you visit that are not explicitly tracked

---

## How data is used

- Product URLs are used to fetch updated prices on a schedule (default: every 6 hours) using Chrome's alarm API.
- Price observations are stored locally to display charts, trends, and all-time low/high statistics.
- Notification state (last alerted price, cooldown timestamps) is stored locally to prevent duplicate alerts.

---

## Network requests

PricePing makes outbound HTTP requests **only** to the product page URLs that you have explicitly added to tracking. These requests:

- Are made from the Chrome extension service worker directly to the retailer's website
- Use a standard browser User-Agent header
- Do not include cookies or credentials (`credentials: 'omit'`)
- Are not proxied through any PricePing server (there is no PricePing server)
- Time out after 15 seconds

No request is ever made to a PricePing server, analytics endpoint, or any third-party service.

---

## Data retention

All data is stored in `chrome.storage.local` on your device and is:

- Retained until you explicitly delete a product or clear extension storage
- Limited to a maximum of 100 products
- Limited to a maximum of 400 price observations per product (oldest trimmed, preserving all-time min/max)
- Limited to 200 alert log entries (oldest trimmed)
- Alert idempotency keys pruned after 60 days

---

## Data sharing

PricePing does not share any data with any third party. There is no backend, no analytics, no crash reporting, and no telemetry.

---

## Export and deletion

- You can export all your data at any time as a JSON or CSV file from the dashboard or options page.
- You can delete individual products from the popup or dashboard.
- Uninstalling the extension removes all stored data from your device.

---

## Permissions

PricePing requests the following Chrome permissions:

| Permission | Reason |
|---|---|
| `storage` | Save product list, price history, and settings to local device storage |
| `alarms` | Schedule periodic price checks (survives service worker sleep) |
| `notifications` | Show price drop alerts |
| `activeTab` | Read the URL of the current tab when you click the extension icon, so the correct product page is identified |
| `scripting` | Inject the price extraction script into the current tab on demand when you click Track |
| `host_permissions: <all_urls>` | Fetch product pages from any retailer domain to check for price updates in the background |

---

## Changes to this policy

If PricePing's data practices change materially, this file will be updated with a new date. As long as PricePing remains local-only with no backend, this policy will remain substantially the same.

---

## Contact

This extension is privately developed. If you have privacy questions, contact the developer via the Chrome Web Store listing.
