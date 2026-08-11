const VARIANT_PARAMS = new Set([
  'color', 'colour', 'size', 'variant', 'sku', 'option', 'model',
  'style', 'configuration', 'edition', 'format', 'type',
]);

const LOCALE_PATH_RE = /^\/((?:[a-z]{2}[-_][a-z]{2})|(?:[a-z]{2}))\//i;

async function sha256hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function canonicalKey(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return sha256hex(rawUrl);
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  let path = url.pathname.replace(LOCALE_PATH_RE, '/');
  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

  const variantParts: string[] = [];
  const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    if (VARIANT_PARAMS.has(key.toLowerCase())) {
      variantParts.push(`${key.toLowerCase()}=${value}`);
    }
  }

  return sha256hex(`${host}:${path}:${variantParts.join('&')}`);
}
