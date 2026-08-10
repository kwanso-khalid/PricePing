# PriceWatch - Manual Smoke Test Steps

## Prerequisites
- Extension built: `npm run build`
- Chrome or Chromium installed
- Extension loaded in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

---

## Smoke Test 1: Extension Loads

1. Open `chrome://extensions`
2. Verify "PriceWatch" appears with version 0.1.0
3. Click the extension icon in the toolbar
4. **Expected**: Popup opens with "PriceWatch" title and "No tracked items yet" message

---

## Smoke Test 2: Detect and Save a Product (JSON-LD page)

1. Navigate to any product page with JSON-LD (e.g., most major retailers)
2. Click the PriceWatch extension icon
3. Click "+ Save" button
4. **Expected**:
   - Popup shows "Detecting price..." briefly
   - Then shows product title, price, and confidence %
   - Save button is available

5. Click "Track this product"
6. **Expected**: Green "Product saved for tracking" message, then popup switches to list view showing the saved item

---

## Smoke Test 3: Duplicate Detection

1. Navigate to the same product page used in Test 2
2. Click the PriceWatch icon, then "+ Save"
3. **Expected**: "Already tracking this product" message shown, no save button

---

## Smoke Test 4: Set Target Price

1. With an item tracked, click "+ Save" on any new product
2. Before saving, enter a target price in the optional field (e.g., "19.99")
3. Click "Track this product"
4. **Expected**: Item saved with target price shown in list view

---

## Smoke Test 5: Pause and Resume

1. Open popup with tracked items
2. Click the ⏸ button on any item
3. **Expected**: Item shows "Paused" label, button changes to ▶
4. Click ▶ to resume
5. **Expected**: "Paused" label removed

---

## Smoke Test 6: Delete Item

1. Click 🗑 on a tracked item
2. **Expected**: Item removed from list immediately

---

## Smoke Test 7: Price History Sparkline

1. Track an item and wait for or manually trigger a price check
2. **Expected**: Small sparkline chart appears next to item when >1 price point in history

---

## Smoke Test 8: Options Page

1. Click ⚙ in popup header or go to `chrome-extension://[ID]/src/options/index.html`
2. **Expected**: Options page loads with:
   - Check Frequency slider (default 6h)
   - Notification Settings section
   - Export/Import section

3. Move slider to 12h, click Save Settings
4. **Expected**: Green "Settings saved" toast

---

## Smoke Test 9: Export and Import

1. With tracked items, go to Options page
2. Click "Export tracked items"
3. **Expected**: JSON file downloaded with timestamp in name

4. Click "Import tracked items" and select the downloaded file
5. **Expected**: "Imported N item(s) successfully" message

---

## Smoke Test 10: Notification Test

1. Track an item where the current price IS below initial (manually edit storage if needed)
2. Go to `chrome://extensions`, click "Service Worker" → Console
3. In console: `chrome.alarms.onAlarm.dispatch({name: 'pricewatch-check'})`
4. **Expected**: Desktop notification appears with price drop message

---

## Smoke Test 11: Manual Price Entry

1. Navigate to a page without product data (e.g., about:blank)
2. Open popup, click "+ Save"
3. **Expected**: "Could not detect price" message with "Enter price manually" link
4. Click "Enter price manually", enter "$29.99", click Confirm
5. Click "Track this product"
6. **Expected**: Item saved with manually entered price

---

## Smoke Test 12: Service Worker Restart

1. Track several items
2. Go to `chrome://extensions`, click service worker link, close the devtools
3. Wait 30+ seconds for service worker to terminate
4. Open popup
5. **Expected**: All tracked items still appear (state persisted in storage)

---

## Automated Tests

```bash
# Unit tests
npm test

# Type checking
npm run typecheck

# Lint
npm run lint

# E2E (requires npm run build first)
npm run test:e2e
```
