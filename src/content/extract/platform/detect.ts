/**
 * Platform detection for Tier 2 endpoint extraction.
 * Detection is done entirely from the DOM / window globals — no network calls.
 */

export type DetectedPlatform = 'shopify' | 'woocommerce' | 'magento' | 'bigcommerce' | 'wix' | null;

/**
 * Detect which e-commerce platform the current page is running on.
 * Returns the platform name or null if unknown.
 */
export function detectPlatform(doc: Document): DetectedPlatform {
  // --- Shopify ---
  // window.Shopify global, checkout token meta, or myshopify.com in script src
  if (isShopify(doc)) return 'shopify';

  // --- WooCommerce ---
  // generator meta contains "WooCommerce", or body has woocommerce class
  if (isWooCommerce(doc)) return 'woocommerce';

  // --- Magento ---
  // body data-ui-id or Mage/require.js pattern
  if (isMagento(doc)) return 'magento';

  // --- BigCommerce ---
  // meta generator contains "BigCommerce" or window.BCData present
  if (isBigCommerce(doc)) return 'bigcommerce';

  // --- Wix ---
  // meta generator contains "Wix.com" or specific Wix script URLs
  if (isWix(doc)) return 'wix';

  return null;
}

function isShopify(doc: Document): boolean {
  // Meta tag: <meta name="shopify-checkout-api-token">
  if (doc.querySelector('meta[name="shopify-checkout-api-token"]')) return true;

  // Any <link rel="canonical"> or script src containing "myshopify.com"
  const scripts = doc.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (src.includes('myshopify.com') || src.includes('cdn.shopify.com')) return true;
  }

  // Inline scripts containing Shopify.theme or "myshopify.com"
  const inlineScripts = doc.querySelectorAll('script:not([src])');
  for (const script of inlineScripts) {
    const content = script.textContent ?? '';
    if (content.includes('Shopify.theme') || content.includes('"myshopify.com"')) return true;
  }

  return false;
}

function isWooCommerce(doc: Document): boolean {
  // <meta name="generator" content="WooCommerce ...">
  const generator = doc.querySelector('meta[name="generator"]');
  if (generator) {
    const content = generator.getAttribute('content') ?? '';
    if (content.toLowerCase().includes('woocommerce')) return true;
  }

  // body class contains 'woocommerce'
  const bodyClass = doc.body?.className ?? '';
  if (bodyClass.includes('woocommerce')) return true;

  // wp-content/plugins/woocommerce in any script src
  const scripts = doc.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (src.includes('woocommerce')) return true;
  }

  return false;
}

function isMagento(doc: Document): boolean {
  // <script type="text/x-magento-init"> or data-mage-init attributes
  if (doc.querySelector('script[type="text/x-magento-init"]')) return true;
  if (doc.querySelector('[data-mage-init]')) return true;

  // body data-ui-id attribute (Magento 2)
  if (doc.body?.hasAttribute('data-ui-id')) return true;

  // requirejs-config.js in a script src (Magento uses RequireJS)
  const scripts = doc.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (src.includes('requirejs-config.js') || src.includes('/pub/static/') && src.includes('Magento')) return true;
  }

  return false;
}

function isBigCommerce(doc: Document): boolean {
  const generator = doc.querySelector('meta[name="generator"]');
  if (generator) {
    const content = generator.getAttribute('content') ?? '';
    if (content.toLowerCase().includes('bigcommerce')) return true;
  }

  const scripts = doc.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (src.includes('bigcommerce.com')) return true;
  }

  return false;
}

function isWix(doc: Document): boolean {
  const generator = doc.querySelector('meta[name="generator"]');
  if (generator) {
    const content = generator.getAttribute('content') ?? '';
    if (content.toLowerCase().includes('wix.com')) return true;
  }

  const scripts = doc.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (src.includes('static.wixstatic.com') || src.includes('wix.com')) return true;
  }

  return false;
}
