# PriceWatch - Chrome Web Store Review Notes

## For Chrome Web Store Reviewers

This document explains each permission request and data usage for the PriceWatch extension.

---

## Permission Justifications

### `storage`
Used to persist tracked product data (URL, title, price history) and user settings (check interval, notification preferences) in `chrome.storage.local`. No data leaves the device.

### `alarms`
Used to create a single repeating alarm (`pricewatch-check`) that fires every 30 minutes. On each alarm, the extension checks which tracked items are due for a price re-check based on the user's configured interval (default: every 6 hours).

This replaces `setInterval`/`setTimeout` which cannot be used for long durations in Manifest V3 service workers.

### `notifications`
Used to display desktop notifications when a tracked product's price drops. Notifications include the product name and new price. Clicking a notification opens the product page.

The extension respects user preferences — notifications can be disabled globally or muted for a duration in the Options page.

### `activeTab`
Used to inject a content script into the current tab when the user explicitly clicks the extension icon on a product page. This allows the extension to read the product name and price.

This permission is granted only for the active tab at the moment of the user's click — it does not grant persistent or broad tab access.

### `scripting`
Required by Manifest V3 to use `chrome.scripting.executeScript()`. Used only in combination with `activeTab` — only the user's explicitly active tab is targeted.

---

## Data Usage

| Data | Where Stored | Purpose | Sent Externally? |
|------|-------------|---------|-----------------|
| Product URL | chrome.storage.local | Identify tracked item | No |
| Product title | chrome.storage.local | Display to user | No |
| Product image URL | chrome.storage.local | Display thumbnail | No (fetched by browser) |
| Price history | chrome.storage.local | Show trends, detect drops | No |
| User settings | chrome.storage.local | Configure extension behavior | No |
| Notification state | chrome.storage.local | Dedup notifications | No |

---

## Network Requests

The extension makes background fetch() requests to tracked product URLs to check current prices. These requests:
- Include only standard browser headers (User-Agent, Accept)
- Use `credentials: 'omit'` (no cookies sent)
- Are subject to a 15-second timeout
- Are rate-limited (max 10 per 30-minute alarm, staggered 2-8 seconds)
- Never include any user data, extension data, or tracking information

---

## Content Script Behavior

The content script (`src/content/index.ts`) is injected only on explicit user action (clicking the icon). It:
1. Reads the current page's DOM to extract product name, price, image
2. Uses schema.org JSON-LD, OpenGraph meta tags, microdata, or site-specific selectors
3. Returns the extracted data to the popup
4. Does NOT modify the page in any way
5. Does NOT access cookies, local storage, form data, or any sensitive page data
6. Does NOT persist or transmit any data from the page

---

## Single Purpose

PriceWatch has a single purpose: help users track product prices and get notified when they drop. All features (save, check, notify, export) serve this single user goal.
