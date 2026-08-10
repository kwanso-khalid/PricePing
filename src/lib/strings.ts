/**
 * All user-visible strings in one place.
 * Never hardcode UI text in components.
 */
export const STRINGS = {
  // General
  appName: 'PriceWatch',
  loading: 'Loading...',
  error: 'Something went wrong',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  close: 'Close',
  confirm: 'Confirm',

  // Popup
  popupTitle: 'PriceWatch',
  trackedItems: 'Tracked Items',
  noTrackedItems: 'No tracked items yet',
  noTrackedItemsHint: 'Visit a product page and click the extension icon to start tracking.',
  currentPrice: 'Current Price',
  originalPrice: 'Original Price',
  targetPrice: 'Target Price',
  priceHistory: 'Price History',
  priceChange: 'Price Change',
  lastChecked: 'Last checked',
  neverChecked: 'Never checked',
  paused: 'Paused',
  pauseTracking: 'Pause tracking',
  resumeTracking: 'Resume tracking',
  deleteItem: 'Remove from tracking',
  setTargetPrice: 'Set target price',
  editTargetPrice: 'Edit target price',
  openProductPage: 'Open product page',
  failedChecks: 'Failed checks',
  needsAttention: 'Needs attention',
  blocked: 'Site may be blocking checks',
  anyPriceDrop: 'Any price drop',
  optionalTargetPrice: 'Optional: set a target price',
  trackProduct: 'Track this product',
  alreadyTracking: 'Already tracking this product',
  saveForTracking: 'Save for price tracking',
  targetPricePlaceholder: 'e.g. 29.99',
  viewOptions: 'Options',
  exportData: 'Export',
  importData: 'Import',

  // Save flow
  detectingPrice: 'Detecting price...',
  priceDetected: 'Price detected',
  priceNotDetected: 'Could not detect price',
  manualPriceEntry: 'Enter price manually',
  confirmManualPrice: 'Confirm price',
  priceSaved: 'Product saved for tracking',
  duplicateItem: 'Already tracking this product',
  saveFailed: 'Failed to save product',

  // Notifications
  priceDrop: 'Price Drop!',
  priceDropMessage: (title: string, price: string) => `${title} is now ${price}`,
  multipleDrops: (count: number) => `${count} items have dropped in price`,
  viewDrops: 'View price drops',

  // Options
  optionsTitle: 'PriceWatch Options',
  checkFrequency: 'Check Frequency',
  checkFrequencyHint: 'How often to check prices (1–24 hours)',
  notificationSettings: 'Notification Settings',
  enableNotifications: 'Enable notifications',
  muteNotifications: 'Mute notifications',
  mutedUntil: (date: string) => `Muted until ${date}`,
  perSiteSettings: 'Per-site Settings',
  exportImport: 'Export / Import',
  exportButton: 'Export tracked items',
  importButton: 'Import tracked items',
  importSuccess: (count: number) => `Imported ${count} item(s) successfully`,
  importFailed: 'Import failed: invalid data format',
  exportFailed: 'Export failed',
  settingsSaved: 'Settings saved',

  // Errors
  storageError: 'Storage error. Please try again.',
  networkError: 'Network error. Will retry later.',
  quotaExceeded: 'Storage quota exceeded. Please remove some tracked items.',

  // Sorting
  sortByRecent: 'Recent change',
  sortByDrop: 'Biggest drop',
  sortByName: 'Name',
  sortByAdded: 'Date added',
} as const;
