# PriceWatch - Architecture Decisions

## Decision Log

---

### D01: Minor Units for Money
**Decision**: Store all prices as integer minor units (e.g., `amountMinor: 1999` for $19.99), never as floats.

**Reasoning**: Floating-point representation causes rounding errors with currency math. `19.99 * 100 = 1998.9999...` in JavaScript. Using `Math.round(amount * multiplier)` and storing as integer eliminates this entirely.

**Tradeoff**: Slightly more complex display code, but zero money comparison bugs.

---

### D02: Result<T, E> instead of Exceptions
**Decision**: All functions that can fail return `Result<T, E>` rather than throwing exceptions.

**Reasoning**: Thrown exceptions across module boundaries are invisible in TypeScript types and are easily swallowed. `Result<T, E>` forces callers to handle failure paths, which is critical for:
- Price parsing (malformed input)
- Storage writes (quota exceeded)
- Network fetches (timeout, blocked)

**Implementation**: `src/lib/result.ts` with `ok()`, `err()`, `isOk()`, `isErr()` helpers.

---

### D03: No Module-Level State in Service Worker
**Decision**: Service worker never stores state in module-level variables that are expected to survive across events.

**Reasoning**: Manifest V3 service workers are ephemeral. They can be killed by Chrome at any time (typically after 30s of inactivity). Any module-level variable will be reset on next activation. All state must be in `chrome.storage`.

**Consequence**: Every alarm handler, notification click handler, etc. starts from scratch by reading from storage.

---

### D04: Layered Extraction with Confidence Scores
**Decision**: Run all 5 extraction strategies and pick the highest confidence result, not just the first one that works.

**Reasoning**: Some pages have both JSON-LD and OpenGraph, or both a site adapter and JSON-LD. Taking the highest confidence result gives better accuracy.

**Exception**: If confidence ≥ 0.9, stop early (performance optimization).

**Tradeoff**: Slightly more computation on page load, but much better extraction accuracy.

---

### D05: Generic Heuristic Confidence = 0.4 (Below UI Threshold)
**Decision**: The generic DOM heuristic has confidence 0.40, which is below the `CONFIDENCE_THRESHOLD = 0.5`. This means generic results require user confirmation.

**Reasoning**: Generic heuristics have high false-positive rates. Showing a "confirm price" UI for low-confidence results prevents the extension from silently saving wrong prices and notifying users incorrectly.

---

### D06: 200-Point History Cap with 90-Day Downsampling
**Decision**: Cap history at 200 points. Points older than 90 days are downsampled to 1 per calendar day before the cap is applied.

**Reasoning**: 200 points is enough for a useful sparkline and price trend analysis. Older data is less valuable per-point (trend matters more than exact timing). Storage space is limited.

---

### D07: URL Canonicalization Approach
**Decision**: Strip well-known tracking parameters rather than allowlisting "safe" parameters.

**Reasoning**: Allowlisting is too restrictive (many legitimate filter/variant params like `color=blue`, `size=M` would need to be allowed). Blocklisting well-known tracking params (UTM, fbclid, Amazon ref/qid, etc.) preserves important product variant params while removing noise.

**Risk**: New tracking params from retailers may not be stripped immediately. This could cause duplicate tracking if a user saves the same product twice with different tracking params. Mitigated by sorting remaining params for stability.

---

### D08: Fetch from Service Worker (Not Content Script)
**Decision**: Price checks are performed by fetching URLs from the service worker background context, not by injecting content scripts.

**Reasoning**:
1. No host permissions needed at all times (only activeTab)
2. Fewer user permission dialogs
3. Content script injection is expensive and requires the tab to exist
4. Service worker can check prices even when no tab is open

**Tradeoff**: Sites that require cookies/sessions for pricing won't be checkable (classified as 'blocked').

---

### D09: 24-Hour Notification Cooldown
**Decision**: Maximum 1 notification per tracked item per 24 hours.

**Reasoning**: Price monitoring is a background feature. Too-frequent notifications train users to dismiss them. One per day is the acceptable maximum for a utility notification.

**Tradeoff**: If a price drops significantly and then rises and drops again within 24 hours, the second drop won't notify. Users can always check the popup.

---

### D010: Batch Notification Threshold = 3
**Decision**: If ≥3 items drop in the same check pass, send 1 grouped notification instead of N individual ones.

**Reasoning**: Getting 5+ notifications at once is overwhelming. A single "N items dropped in price" notification is more user-friendly. The number 3 was chosen as the minimum where individual notifications start to feel spammy.

---

### D011: strings.ts for All User-Visible Text
**Decision**: All user-visible strings are defined in `src/lib/strings.ts` and imported into components. No hardcoded text in JSX.

**Reasoning**: Enables future i18n without refactoring components. Also makes it easy to audit all user-facing copy in one place.

---

### D012: ESLint `no-console` Rule
**Decision**: `no-console` is enabled as an error. The `createLogger()` utility wraps `console.*` internally.

**Reasoning**: `console.log` in production pollutes the browser console and leaks implementation details. The logger utility:
1. Adds structured context (`[PriceWatch:module]`)
2. Respects log levels (debug/info only in development)
3. Can be extended to persist logs to storage for debugging
