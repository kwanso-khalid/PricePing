/**
 * Badge count management for the extension action icon.
 */

/**
 * Set badge to count of unseen alerts, or clear if 0.
 */
export function updateBadge(count: number): void {
  if (count === 0) {
    void chrome.action.setBadgeText({ text: '' });
    return;
  }
  void chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
  void chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // red
}

/**
 * Clear the badge (e.g. after marking all alerts as seen).
 */
export function clearBadge(): void {
  void chrome.action.setBadgeText({ text: '' });
}
