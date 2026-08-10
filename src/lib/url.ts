/**
 * URL canonicalization: strip tracking parameters, normalize.
 */

const TRACKING_PARAMS = new Set([
  // UTM
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  // Amazon
  'ref', 'ref_', 'pf_rd_p', 'pf_rd_r', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg',
  'qid', 'sr', 'sprefix', 'crid', 'dib', 'dib_tag', 'keywords',
  // General
  'fbclid', 'gclid', 'msclkid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid',
  'yclid', 'dclid', '_ga', '_gl', 'igshid', 'epik', 'ttclid',
  // eBay
  'epid', 'mkevt', 'mkcid', 'mkrid', 'campid', 'customid', 'toolid',
  // Shopping
  'srsltid', 'sourceid',
]);

// Amazon-style path tracking segments (e.g., /ref=sr_1_1)
const AMAZON_PATH_TRACKING_RE = /\/(?:ref|pf_rd_[a-z]+)=[^/]*/gi;

export function canonicalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  // Normalize protocol and hostname
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase();

  // Remove fragment
  url.hash = '';

  // Strip Amazon-style path tracking segments
  url.pathname = url.pathname.replace(AMAZON_PATH_TRACKING_RE, '');

  // Strip tracking params
  const toDelete: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      toDelete.push(key);
    }
  });
  for (const key of toDelete) {
    url.searchParams.delete(key);
  }

  // Sort remaining params for stability
  url.searchParams.sort();

  return url.toString();
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isSameProduct(urlA: string, urlB: string): boolean {
  return canonicalizeUrl(urlA) === canonicalizeUrl(urlB);
}
