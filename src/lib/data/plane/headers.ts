// src/lib/data/plane/headers.ts (owner WP02, FROZEN). Cache-Control for plane-backed responses, from ONE JSON file shared with next.config.js (which cannot import TypeScript). Pure.
import cfg from "./headers.json";

export const PUBLIC_DATA_CACHE_CONTROL: string = cfg.public;
export const PUBLIC_LONG_CACHE_CONTROL: string = cfg.publicLong;
export const PRIVATE_CACHE_CONTROL: string = cfg.private;
export const PRIVATE_SOURCES: readonly string[] = cfg.pagesPrivate;
export const PUBLIC_SOURCES: readonly string[] = cfg.pagesPublic;
/** The entries next.config.js `headers()` returns: public pages first, the private ones after (a later, more specific entry for the same path wins in Next, and the allowlist test forbids any overlap anyway). */
export function nextHeaderEntries(): { source: string; headers: { key: string; value: string }[] }[] {
  return [
    ...PUBLIC_SOURCES.map((source) => ({ source, headers: [{ key: "Cache-Control", value: PUBLIC_DATA_CACHE_CONTROL }] })),
    ...PRIVATE_SOURCES.map((source) => ({ source, headers: [{ key: "Cache-Control", value: PRIVATE_CACHE_CONTROL }] })),
  ];
}
/** The CDN copy of the market-neutral public pages (2026-10-16): Vercel-CDN-Cache-Control, which Vercel's CDN reads before the page function's own `private, no-store` and never forwards to the browser. Every CDN source is also a PUBLIC source; tests/headers-allowlist.test.ts proves each page's server render reads no market, cookie, header or session. */
export const CDN_CACHE_CONTROL: string = cfg.cdn;
export const CDN_SOURCES: readonly string[] = cfg.pagesCdn;
export const cdnHeaderEntries = (): { source: string; headers: { key: string; value: string }[] }[] =>
  CDN_SOURCES.map((source) => ({ source, headers: [{ key: "Vercel-CDN-Cache-Control", value: CDN_CACHE_CONTROL }] }));
/** The pages that render in the visitor's market (2026-10-17): next.config.js caches only their certainly-US requests and rewrites every other one to `?_mk=1`, a key of its own that is never stored (headers.json, cdnMarketComment). */
export const CDN_MARKET_CACHE_CONTROL: string = cfg.cdnMarket;
export const CDN_MARKET_SOURCES: readonly string[] = cfg.pagesCdnMarket;
export const MARKET_KEY: string = cfg.marketKey;
/** A market page's searchParams without the rewrite's cache key, for any page that hands the whole object on (a parser, a link builder, Object.keys): a non-US visitor's page would otherwise carry `_mk` into its links and its robots. */
export function withoutMarketKey<T extends object>(sp: T): T {
  if (!(MARKET_KEY in sp)) return sp;
  const { [MARKET_KEY]: _, ...rest } = sp as Record<string, unknown>;
  return rest as T;
}
/** For route handlers (sitemaps, feeds, llms.txt, image routes) that set their own header: `new Response(body, { headers: publicDataHeaders({ "content-type": "application/xml" }) })`. */
export const publicDataHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({ ...extra, "cache-control": PUBLIC_DATA_CACHE_CONTROL });
export const privateHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({ ...extra, "cache-control": PRIVATE_CACHE_CONTROL });
/** A THIN card page: noindex, cached a day. */
export const thinHeaders = (): Record<string, string> => ({ "cache-control": cfg.thinNoindex.value, "x-robots-tag": "noindex, follow" });
/** Does a path pattern of the config match a concrete path? (Next's :param* matcher, reduced: used by the allowlist test to prove no path is both public and private.) */
export function patternMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  const star = /^(.*?)\/:[a-zA-Z]+\*$/.exec(pattern); if (star) return path === star[1] || path.startsWith(`${star[1]}/`);
  const one = /^(.*?)\/:[a-zA-Z]+$/.exec(pattern); if (one) return path.startsWith(`${one[1]}/`) && !path.slice(one[1]!.length + 1).includes("/");
  return false;
}
