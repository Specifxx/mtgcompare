// "Search all Compare Empire sites" (compare search test, 2026-11-10 to 2026-12-08). The link is shown ONLY where this
// site's own search found nothing, so it never takes a click from a product this site sells. compareempire.com/search is
// noindex; it takes `q` (lower case, single spaces, at most 80 characters), `r` (one of its markets) and `from` (which
// site sent the visitor, for the test's measurement).
export const COMPARE_SEARCH_URL = "https://compareempire.com/search";
const CE_MARKETS = new Set(["us", "au", "uk", "ca", "sg"]);

export function compareSearchHref(query: string, from: string, market?: string): string {
  const u = new URL(COMPARE_SEARCH_URL);
  u.searchParams.set("q", query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80));
  const r = market?.toLowerCase() === "gb" ? "uk" : market?.toLowerCase();
  if (r && CE_MARKETS.has(r)) u.searchParams.set("r", r);
  u.searchParams.set("from", from);
  return u.toString();
}
