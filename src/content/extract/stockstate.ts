import type { StockStateCode } from '../../types/storage.js';

/**
 * Parse an availability string (schema.org URL or plain text) into a StockStateCode.
 *
 * Codes:
 *  0 = unknown
 *  1 = in_stock
 *  2 = out_of_stock
 *  3 = preorder
 *  4 = limited
 */
export function parseStockState(availabilityStr: string): StockStateCode {
  if (!availabilityStr) return 0;
  const s = availabilityStr.toLowerCase();

  // Check out-of-stock / sold-out first (before "stock" catches in-stock strings)
  if (
    s.includes('outofstock') ||
    s.includes('out of stock') ||
    s.includes('out_of_stock') ||
    s.includes('soldout') ||
    s.includes('sold out') ||
    s.includes('sold_out') ||
    s.includes('discontinued') ||
    s.includes('unavailable')
  ) {
    return 2;
  }

  if (
    s.includes('preorder') ||
    s.includes('pre-order') ||
    s.includes('pre order') ||
    s.includes('preordersignup') ||
    s.includes('comingsoon') ||
    s.includes('coming soon') ||
    s.includes('coming_soon')
  ) {
    return 3;
  }

  if (
    s.includes('limitedavailability') ||
    s.includes('limited availability') ||
    s.includes('limited') ||
    s.includes('low stock') ||
    s.includes('lowstock') ||
    // "only N left" / "only N in stock" pattern
    (/only\s+\d/.test(s) && s.includes('left')) ||
    (/only\s+\d/.test(s) && s.includes('stock'))
  ) {
    return 4;
  }

  if (
    s.includes('instock') ||
    s.includes('in stock') ||
    s.includes('in_stock') ||
    s.includes('onlineonly') ||
    s.includes('online only') ||
    s.includes('available') ||
    s.includes('instoreonly')
  ) {
    return 1;
  }

  return 0;
}

/**
 * Derive the legacy inStock boolean from a StockStateCode.
 * unknown (0), in_stock (1), preorder (3), and limited (4) all count as "available".
 * only out_of_stock (2) is false.
 */
export function stockStateToInStock(code: StockStateCode): boolean {
  return code !== 2;
}
