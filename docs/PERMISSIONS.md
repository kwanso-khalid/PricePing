# PriceWatch - Permission Justifications

Each permission in `manifest.json` is justified below.

---

## Required Permissions

### `storage`
**Why**: The extension stores all tracked items, price history, settings, and notification state in `chrome.storage.local`. This is the core data persistence mechanism.

**Data stored**:
- Tracked product URLs, titles, prices, history
- User settings (check interval, notification preferences)
- Notification dedup state

**Size**: Soft-limited to 5MB to stay well within Chrome's 10MB quota.

---

### `alarms`
**Why**: Price checking must continue even when the user hasn't interacted with the extension. `chrome.alarms` provides the only reliable scheduling mechanism for Manifest V3 extensions (service workers cannot use `setInterval` for long periods).

**Usage**: One alarm (`pricewatch-check`) fires every 30 minutes. On each fire, items due for checking (based on configured interval, default 6h) are checked.

---

### `notifications`
**Why**: Core feature. Users are notified via desktop notification when a tracked product's price drops below their target or initial price.

**What's shown**: Product name, new price, and a button/click to open the product page.

**User control**: Can disable notifications globally in Options page, or mute for a duration.

---

### `activeTab`
**Why**: When the user clicks the extension icon on a product page, the extension injects a content script to extract the product price. `activeTab` grants permission to the current tab only when the user explicitly clicks the icon — no persistent access to all tabs.

**Scope**: Only the tab that was active when the user clicked. Does not persist. Does not grant access to any other tab.

---

### `scripting`
**Why**: Required to use `chrome.scripting.executeScript()` to inject the content script into the active tab for price detection. This API requires the `scripting` permission in Manifest V3.

**Scope**: Only used in combination with `activeTab` — only injected into the user's currently active tab on explicit user gesture.

---

## Optional Host Permissions

### `<all_urls>` (optional, requested at runtime)
**Why**: Background price checks (from the service worker via `fetch()`) require network access to product page URLs. Because we use `activeTab` rather than blanket host permissions, the service worker can still fetch URLs without explicit host permission — `fetch()` from a service worker doesn't require `host_permissions` for same-origin requests, but to fetch cross-origin pages for price checking, optional host permissions are requested.

**When requested**: NOT requested upfront. The extension functions with just `activeTab` for the save flow. Host permissions would be requested only if needed for service-worker-based price rechecks on sites that block unflagged requests.

**Alternative**: We fetch from service worker background context. Many sites allow this without explicit permissions. Sites that block it are classified as 'blocked' rather than erroring.

---

## What We Do NOT Request

- **`tabs`**: Not needed. We use `activeTab` instead.
- **`history`**: Not needed. We don't access browsing history.
- **`cookies`**: Not needed. Fetch requests use `credentials: 'omit'`.
- **`webRequest` / `webRequestBlocking`**: Not needed. We don't intercept network requests.
- **`<all_urls>` in required permissions**: Deliberately avoided. Users should not see a scary "read all your data" prompt.
- **`declarativeNetRequest`**: Not needed.
- **`identity`**: No user accounts.
- **`sync` storage**: Not used (no cross-device sync in v1).
