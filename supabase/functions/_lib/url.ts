// API addresses for the Independent plan. Pure functions, so they run in unit tests too.

export function normalizeBase(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "").replace(/\/+$/, "");
}

/**
 * Check a base URL a student typed. Only public https APIs are allowed: no IP addresses, local or
 * internal host names, credentials or odd ports, so the server cannot be pointed at private networks.
 * Returns the cleaned URL, or null.
 */
export function safeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|corp)$/.test(host)) return null;
  if (/(^|\.)supabase\.(co|in|com)$/.test(host)) return null;
  url.search = "";
  url.hash = "";
  return normalizeBase(url.toString());
}

/**
 * Check a calendar link a student pasted. Like safeBaseUrl (public https only, no private hosts),
 * but keeps the query, which calendar links use for their secret. webcal:// is https.
 */
export function safeFeedUrl(raw: string): string | null {
  const s = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|corp)$/.test(host)) return null;
  if (/(^|\.)supabase\.(co|in|com)$/.test(host)) return null;
  url.hash = "";
  return url.toString();
}
