/**
 * All user-visible strings in one place.
 * Never hardcode UI text in components.
 */
export const STRINGS = {
  // General
  appName: 'PricePing',
  loading: 'Loading...',
  error: 'Something went wrong',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  close: 'Close',
  confirm: 'Confirm',

  // Popup
  popupTitle: 'PricePing',
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
  optionsTitle: 'PricePing Options',
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

  // Dashboard
  openDashboard: 'Dashboard',
  dashboardTitle: 'PricePing Dashboard',
  backToList: '← Back',
  noProducts: 'No products tracked yet',
  filterDropped: 'Dropped',
  filterPaused: 'Paused',
  filterDiscount: 'Discount',
  searchPlaceholder: 'Search products…',
  columnTitle: 'Title',
  columnPrice: 'Price',
  columnChange: 'Change',
  columnAllTimeLow: 'ATL',
  columnAboveLow: '% above ATL',
  columnDays: 'Days',
  columnObs: 'Obs.',
  columnSpark: 'Trend',
  columnDiscount: 'Discount',
  columnStatus: 'Status',
  metricsTitle: 'Price Metrics',
  discountSectionTitle: 'Discount Analysis',
  trendSectionTitle: 'Trend',
  controlsTitle: 'Settings',
  targetPriceLabel: 'Target price',
  cooldownLabel: 'Cooldown (hours)',
  muteLabel: 'Mute alerts',
  deleteConfirm: 'Remove this product from tracking?',
  exportJson: 'Export JSON',
  exportCsv: 'Export CSV',
  importJson: 'Import JSON',
  verdictGenuine: 'Genuine discount',
  verdictInflated: 'Possibly inflated',
  verdictInsufficient: 'Insufficient data',
  obsCount: (n: number) => `${n} observation${n !== 1 ? 's' : ''}`,

  // Stock state
  stockInStock: 'In stock',
  stockOutOfStock: 'Out of stock',
  stockPreorder: 'Pre-order',
  stockLimited: 'Limited',
  stockUnknown: '',

  // Extraction method labels (shown in save panel)
  methodAdapter: 'Site-specific extractor',
  methodJsonLd: 'Structured data (JSON-LD)',
  methodMicrodata: 'Structured data (Microdata)',
  methodOpengraph: 'Open Graph',
  methodShopify: 'Shopify endpoint',
  methodWoocommerce: 'WooCommerce endpoint',
  methodGeneric: 'Generic heuristic',
  methodManual: 'Manual entry',
  methodTierWarning: 'Alerts disabled for generic heuristic data',

  // Check-now
  checkNow: 'Refresh',
  checking: 'Checking…',
  checkDone: 'Updated',

  // Notes
  notesLabel: 'Notes',
  notesPlaceholder: 'Why you\'re tracking this…',

  // Restock & drop threshold
  notifyOnRestockLabel: 'Notify when back in stock',
  dropThresholdLabel: 'Minimum drop to alert (%)',
  dropThresholdPlaceholder: 'e.g. 10',

  // Bulk actions
  bulkDelete: 'Delete selected',
  bulkMute: 'Mute selected',
  bulkUnmute: 'Unmute selected',
  bulkSelected: (n: number) => `${n} selected`,

  // Sorting
  sortByRecent: 'Recent change',
  sortByDrop: 'Biggest drop',
  sortByName: 'Name',
  sortByAdded: 'Date added',

  // Quiet hours / alert log
  quietHoursHeld: (count: number) => `${count} price drop${count !== 1 ? 's' : ''} held during quiet hours`,
  alertLog: 'Alert Log',
  markAllSeen: 'Mark all seen',
  noAlerts: 'No price alerts yet',
  alertsTab: 'Alerts',
  listTab: 'Products',
} as const;
