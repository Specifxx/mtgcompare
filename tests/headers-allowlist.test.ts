// Cache-Control of plane-backed responses (critique DP-01, DP-08, DP-14, DP-21). Owner WP02 (headers.json/ts), WP21 (next.config.js wiring). A plane-backed page is force-dynamic and CDN-cached by header; nothing per-user or per-tier is ever public.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cfg from "../src/lib/data/plane/headers.json";
import { PRIVATE_CACHE_CONTROL, PRIVATE_SOURCES, PUBLIC_DATA_CACHE_CONTROL, PUBLIC_SOURCES, nextHeaderEntries, patternMatches, privateHeaders, publicDataHeaders, thinHeaders } from "../src/lib/data/plane/headers";

const sample = (pattern: string): string => pattern.replace(/\/:[a-zA-Z]+\*$/, "/x/y").replace(/\/:[a-zA-Z]+$/, "/x");
test("the public value is 5 minutes at the CDN plus 10 of stale-while-revalidate: worst case 5 + 5 + 10 minutes behind a publish (not 24 hours)", () => {
  assert.equal(PUBLIC_DATA_CACHE_CONTROL, "public, s-maxage=300, stale-while-revalidate=600"); assert.equal(PRIVATE_CACHE_CONTROL, "private, no-store");
  const m = /s-maxage=(\d+), stale-while-revalidate=(\d+)/.exec(PUBLIC_DATA_CACHE_CONTROL)!; assert.ok(Number(m[1]) + Number(m[2]) <= 15 * 60);
});
test("no path is both public and private; every paid tool page, every account page and every /api route is private", () => {
  for (const p of PRIVATE_SOURCES) for (const q of PUBLIC_SOURCES) assert.ok(!patternMatches(q, sample(p)), `${p} (private) is matched by the public pattern ${q}`);
  for (const q of PUBLIC_SOURCES) for (const p of PRIVATE_SOURCES) assert.ok(!patternMatches(p, sample(q)), `${q} (public) is matched by the private pattern ${p}`);
  for (const must of ["/tools/deal-finder", "/tools/rising", "/tools/demand", "/api/deal-finder", "/api/top-deals/savings", "/api/me", "/dashboard", "/profile", "/portfolio/sets", "/watching", "/admin/data", "/login", "/premium/welcome"]) assert.ok(PRIVATE_SOURCES.some((p) => patternMatches(p, must)), `${must} must be private, no-store`);
  for (const must of ["/", "/browse", "/card/sol-ring-cmm-703", "/sets/mh3", "/market", "/movers", "/stores/cardkingdom", "/decks/x"]) assert.ok(PUBLIC_SOURCES.some((p) => patternMatches(p, must)), `${must} must be CDN-cached`);
  assert.ok(!PUBLIC_SOURCES.some((p) => patternMatches(p, "/tools/deal-finder")), "a catch-all like /tools/:path* would let the CDN serve a member's response to an anonymous visitor");
});
test("next.config.js headers() is generated from the JSON, one Cache-Control per entry; route handlers set exactly one lowercase cache-control themselves", () => {
  const e = nextHeaderEntries(); assert.equal(e.length, PUBLIC_SOURCES.length + PRIVATE_SOURCES.length); for (const x of e) { assert.equal(x.headers.length, 1); assert.equal(x.headers[0]!.key, "Cache-Control"); }
  assert.deepEqual(Object.keys(publicDataHeaders({ "content-type": "application/xml" })).sort(), ["cache-control", "content-type"]); assert.equal(publicDataHeaders()["cache-control"], PUBLIC_DATA_CACHE_CONTROL); assert.equal(privateHeaders()["cache-control"], "private, no-store");
  assert.equal(thinHeaders()["x-robots-tag"], "noindex, follow"); assert.match(thinHeaders()["cache-control"]!, /s-maxage=86400/);
  assert.equal(cfg.public, PUBLIC_DATA_CACHE_CONTROL);
});
test("the repository's next.config.js reads headers.json (skipped in the contract tree, which has no next.config.js)", { skip: !fs.existsSync(path.join(process.cwd(), "next.config.js")) }, () => {
  const src = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf8"); assert.match(src, /plane\/headers\.json/, "next.config.js must build its Cache-Control entries from src/lib/data/plane/headers.json");
});

// ── THE CDN COPY (2026-10-16, DECISIONS.md "The CDN finally caches the public pages") ─────────────────────────────────────────────────────
// On Vercel a force-dynamic page's own `private, no-store` beats the config's Cache-Control, so no page was ever CDN-cached (x-vercel-cache: MISS on every
// public page). Vercel-CDN-Cache-Control beats both. One copy serves every visitor, so it may go only on a page whose SERVER render reads nothing per visitor.
import { CDN_CACHE_CONTROL, CDN_SOURCES, cdnHeaderEntries } from "../src/lib/data/plane/headers";
import { closure } from "./helpers/import-graph";

/** Calls that make a render depend on the visitor: the market (cookie, then IP geo), the session or entitlement, any cookie or header. */
const PER_VISITOR = /(?<![.\w])(getCountry|cookies|headers|getCurrentUser|currentEntitlement|draftMode)\s*\(/;
const APP = path.join(process.cwd(), "src/app");
/** The page files a next.config source matches ("/sets" → src/app/sets/page.tsx; "/stores/:path*" → every page under src/app/stores, the index included). */
function pagesOf(source: string): string[] {
  const star = /\/:[a-zA-Z]+\*$/.test(source), base = source.replace(/\/:[a-zA-Z]+\*$/, ""), dir = path.join(APP, ...base.split("/").filter(Boolean));
  const own = ["page.tsx", "page.ts"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
  if (!star) { const one = /\/:/.test(source) ? marketPage(source) : null; return one ? [one] : own; }
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /^page\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  return fs.existsSync(dir) ? walk(dir) : [];
}
const layoutsOf = (page: string): string[] => {
  const out: string[] = [];
  for (let d = path.dirname(page); d.startsWith(APP); d = path.dirname(d)) { for (const f of ["layout.tsx", "layout.ts"]) if (fs.existsSync(path.join(d, f))) out.push(path.join(d, f)); if (d === APP) break; }
  return out;
};

test("the CDN copy: six hours or more, on public pages only, wired in next.config.js as Vercel-CDN-Cache-Control", () => {
  const m = /^public, s-maxage=(\d+), stale-while-revalidate=(\d+)$/.exec(CDN_CACHE_CONTROL); assert.ok(m, CDN_CACHE_CONTROL);
  assert.ok(Number(m[1]) >= 21600, "the plane publishes once a day: under six hours buys renders, not freshness");
  for (const s of CDN_SOURCES) {
    assert.ok(PUBLIC_SOURCES.some((p) => p === s || patternMatches(p, sample(s))), `${s}: a CDN source must also be a public source`);
    for (const p of PRIVATE_SOURCES) assert.ok(!patternMatches(p, sample(s)) && !patternMatches(s, sample(p)), `${s} overlaps the private ${p}`);
  }
  assert.ok(!CDN_SOURCES.some((s) => patternMatches(s, "/tools/deal-finder") || patternMatches(s, "/decks/x")), "no paid tool, and no member-published deck (purged on publish), at the CDN for six hours");
  for (const e of cdnHeaderEntries()) assert.deepEqual(e.headers, [{ key: "Vercel-CDN-Cache-Control", value: CDN_CACHE_CONTROL }]);
  if (fs.existsSync(path.join(process.cwd(), "next.config.js"))) assert.match(fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf8"), /plane\.pagesCdn\.map\(\(source\) => \(\{ source, headers: \[\{ key: "Vercel-CDN-Cache-Control", value: plane\.cdn \}\] \}\)\)/);
});

test("every CDN-cached page renders the same for every visitor: no market, cookie, header or session read in its server closure or its layouts", { skip: !fs.existsSync(APP) }, () => {
  // The import graph stops at the data barrel, so the barrel itself must stay request-free.
  for (const f of fs.readdirSync(path.join(process.cwd(), "src/lib/data"), { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(f)) continue; const s = fs.readFileSync(path.join(process.cwd(), "src/lib/data", f), "utf8");
    assert.doesNotMatch(s, /from ["'](next\/headers|@\/lib\/(auth|get-country|premium|referral))["']/, `src/lib/data/${f} reaches a per-visitor read`);
  }
  for (const s of CDN_SOURCES) {
    const pages = pagesOf(s); assert.ok(pages.length > 0, `${s} matches no page`);
    for (const pg of pages) for (const entry of [pg, ...layoutsOf(pg)]) for (const f of closure(entry, process.cwd()).files) {
      const src = fs.readFileSync(f, "utf8"); if (/^\s*["']use client["']/.test(src)) continue;
      const hit = PER_VISITOR.exec(src.replace(/\/\/.*$/gm, ""));
      assert.equal(hit, null, `${s}: ${path.relative(process.cwd(), f)} calls ${hit?.[1]}() — this page cannot share one CDN copy (take it out of pagesCdn)`);
    }
  }
});

// ── THE MARKET PAGES' CDN COPY, ONE PER MARKET (2026-10-17, DECISIONS.md "Crawlers get the US copy from the CDN", "Every market gets its own CDN copy") ─────
// A market page renders in getCountry()'s market. next.config.js makes the market the cache key: a US render keeps the bare URL, another market's render is
// rewritten to ?_mk=<cookie or IP country>, and a request the rules cannot place goes to ?_mk=1, never stored. These tests hold the rules against getCountry itself.
import { CDN_MARKET_CACHE_CONTROL, CDN_MARKET_SOURCES, MARKET_KEY, withoutMarketKey } from "../src/lib/data/plane/headers";
import { COUNTRY_COOKIE, MARKETS, isCountry, normalizeCountry } from "../src/lib/country";

type Cond = { type: string; key: string; value?: string };
type Rule = { source: string; has?: Cond[]; missing?: Cond[]; headers?: { key: string; value: string }[]; destination?: string };
type Req = { cookie?: string; geo?: string; query?: Record<string, string> };
/** Next's matchHas (shared/lib/router/utils/prepare-destination.js): a value is an anchored regex whose named groups become destination params; an empty value
 *  means "present"; `missing` fails on any match. Returns the captured params, or null. */
const RX = new Map<string, RegExp>();
const condMatch = (c: Cond, r: Req): Record<string, string> | null => {
  const v = c.type === "cookie" ? (c.key === COUNTRY_COOKIE ? r.cookie : undefined) : c.type === "header" ? (c.key.toLowerCase() === "x-vercel-ip-country" ? r.geo : undefined) : c.type === "query" ? r.query?.[c.key] : undefined;
  if (!v) return null;
  if (c.value === undefined) return {};
  let rx = RX.get(c.value); if (!rx) RX.set(c.value, (rx = new RegExp(`^${c.value}$`)));
  const m = rx.exec(v); return m ? { ...(m.groups ?? {}) } : null;
};
const condMatches = (c: Cond, r: Req): boolean => condMatch(c, r) !== null;
const ruleMatches = (x: Rule, r: Req): boolean => (x.has ?? []).every((c) => condMatches(c, r)) && !(x.missing ?? []).some((c) => condMatches(c, r));
/** The cache key a request ends on: the rewrite's `_mk` (its `:params` filled from the `has` captures), else the one the URL arrived with, else "" (the bare URL). */
const keyOf = (rewrites: Rule[], r: Req): string => {
  const hit = rewrites.filter((x) => ruleMatches(x, r));
  assert.ok(hit.length <= 1, `the rewrites overlap for ${JSON.stringify(r)}: their order would decide the key`);
  if (!hit.length) return r.query?.[MARKET_KEY] ?? "";
  const params = Object.assign({}, ...(hit[0]!.has ?? []).map((c) => condMatch(c, r) ?? {})) as Record<string, string>;
  const q = new URLSearchParams(hit[0]!.destination!.split("?")[1]!.replace(/:(\w+)/g, (_, k: string) => params[k] ?? `:${k}`));
  return q.get(MARKET_KEY)!;
};
/** getCountry() (src/lib/get-country.ts): the cookie when it names a market, else the IP country, else the US. */
const marketOf = (r: Req): string => (isCountry(r.cookie) ? r.cookie : r.geo ? normalizeCountry(r.geo) : "US");
const CONFIG = path.join(process.cwd(), "next.config.js");
const loadConfig = async (): Promise<{ headers: Rule[]; rewrites: Rule[] }> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const c = require(CONFIG) as { headers(): Promise<Rule[]>; rewrites(): Promise<{ beforeFiles: Rule[] }> };
  return { headers: await c.headers(), rewrites: (await c.rewrites()).beforeFiles };
};

test("market pages: a day at the CDN, public pages only, wired in next.config.js as one copy per market", { skip: !fs.existsSync(CONFIG) }, async () => {
  assert.equal(CDN_MARKET_CACHE_CONTROL, "public, s-maxage=86400, stale-while-revalidate=86400", "a day: the owner's minimum is twelve hours and the plane publishes once a day");
  assert.equal(MARKET_KEY, "_mk");
  const { headers, rewrites } = await loadConfig();
  for (const s of CDN_MARKET_SOURCES) {
    assert.ok(PUBLIC_SOURCES.some((p) => p === s || patternMatches(p, sample(s))), `${s}: a market source must also be a public source`);
    for (const p of PRIVATE_SOURCES) assert.ok(!patternMatches(p, sample(s)) && !patternMatches(s, sample(p)), `${s} overlaps the private ${p}`);
    assert.ok(!CDN_SOURCES.some((n) => n === s || patternMatches(n, sample(s)) || patternMatches(s, sample(n))), `${s} is also a market-neutral CDN source: one copy would serve every market`);
    assert.ok(!/opengraph-image|:\w+\*/.test(s), `${s}: no catch-all, so a share image (its own one-minute fallback) never takes the page's day`);
    const hs = headers.filter((h) => h.source === s && h.headers?.some((x) => x.key === "Vercel-CDN-Cache-Control")), rs = rewrites.filter((x) => x.source === s);
    assert.equal(hs.length, 4, `${s}: four CDN rules (US cookie, US IP, market cookie, market IP)`);
    for (const h of hs) assert.deepEqual(h.headers, [{ key: "Vercel-CDN-Cache-Control", value: CDN_MARKET_CACHE_CONTROL }]);
    assert.equal(rs.length, 4, `${s}: four rewrites (market cookie, market IP, a cookie naming no market, an unplaced request)`);
    for (const x of rs) assert.ok(x.destination === `${s}?${MARKET_KEY}=:mk` || x.destination === `${s}?${MARKET_KEY}=1`, x.destination);
  }
  assert.ok(CDN_MARKET_SOURCES.includes("/card/:slug") && CDN_MARKET_SOURCES.includes("/sealed/:slug") && CDN_MARKET_SOURCES.includes("/sets/:slug") && CDN_MARKET_SOURCES.includes("/price-guide") && CDN_MARKET_SOURCES.includes("/guides/:slug") && CDN_MARKET_SOURCES.includes("/blog/:slug"));
});

test("market pages: the lists in headers.json are exactly getCountry's markets and the IP countries normalizeCountry sends to them", () => {
  assert.deepEqual(["US", ...cfg.marketCookies].sort(), [...MARKETS].sort());
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", codes = [...A].flatMap((a) => [...A].map((b) => a + b));
  assert.deepEqual([...cfg.marketGeo].sort(), codes.filter((c) => normalizeCountry(c) !== "US").sort(), "marketGeo must list every country code normalizeCountry places outside the US, and no other");
});

test("market pages: a stored copy always holds its key's market, every reader of a key renders that market, and crawlers in every market are cached", { skip: !fs.existsSync(CONFIG) }, async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/get-country.ts"), "utf8");
  const ck = src.indexOf("cookies().get(COUNTRY_COOKIE)"), geo = src.indexOf('headers().get("x-vercel-ip-country")');
  assert.ok(ck > 0 && geo > ck, "getCountry reads the country cookie, then the IP country: the rules below mirror exactly that order");
  const { headers, rewrites } = await loadConfig();
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", allGeo = [undefined, "us", "gb", "de", ...[...A].flatMap((a) => [...A].map((b) => a + b))];
  const cookies = [undefined, "", "US", "UK", "EU", "AU", "SG", "CA", "us", "uk", "XX", "AUS", "XAUX", "USA", "GB"];
  const queries: (Record<string, string> | undefined)[] = [undefined, { finish: "foil" }, { [MARKET_KEY]: "1" }, { [MARKET_KEY]: "UK" }];
  CDN_MARKET_SOURCES.forEach((s, i) => {
    const hs = headers.filter((h) => h.source === s && h.headers?.some((x) => x.key === "Vercel-CDN-Cache-Control")), rs = rewrites.filter((x) => x.source === s);
    const geos = i === 0 ? allGeo : [undefined, "US", "GB", "DE", "FR", "AU", "SG", "CA", "NZ", "JP", "us"];
    const stored = new Map<string, string>(), reads: { key: string; market: string; at: string }[] = [];
    for (const cookie of cookies) for (const g of geos) for (const query of queries) {
      const r: Req = { cookie, geo: g, query }, market = marketOf(r), key = keyOf(rs, r), cached = hs.some((h) => ruleMatches(h, r)), crafted = query?.[MARKET_KEY] !== undefined;
      const at = `${s} cookie=${cookie} geo=${g} query=${JSON.stringify(query)}`;
      if (crafted) { assert.ok(!cached, `${at}: a URL that arrives carrying ${MARKET_KEY} is never stored`); continue; }
      if (key === "") assert.equal(market, "US", `${at}: only a US render reads the bare URL`);
      if (key === "1") assert.ok(!cached, `${at}: the unplaced key is never stored`);
      if (cached) {
        assert.notEqual(key, "1", at);
        const had = stored.get(key); assert.ok(had === undefined || had === market, `${at}: key ${key || "(bare)"} would hold both ${had} and ${market}`); stored.set(key, market);
      }
      reads.push({ key, market, at });
    }
    for (const x of reads) { const held = stored.get(x.key); if (held !== undefined) assert.equal(x.market, held, `${x.at}: reads key ${x.key || "(bare)"}, which holds a ${held} render`); }
    const cachedAt = (r: Req): string | null => (hs.some((h) => ruleMatches(h, r)) ? keyOf(rs, r) : null);
    assert.equal(cachedAt({ geo: "US" }), "", `${s}: a US crawler (no cookie) is cached on the bare URL`);
    assert.equal(cachedAt({ cookie: "US", geo: "GB" }), "", `${s}: a US cookie is the US render wherever the visitor is`);
    assert.equal(cachedAt({ geo: "GB" }), "GB", `${s}: a UK crawler is cached on its own key`);
    assert.equal(cachedAt({ geo: "DE" }), "DE", `${s}: a German visitor is cached on its own key`);
    assert.equal(cachedAt({ cookie: "UK", geo: "US" }), "UK", `${s}: a UK cookie is cached on the UK key`);
    assert.equal(cachedAt({ cookie: "EU" }), "EU", `${s}: an EU cookie is cached on the EU key`);
    assert.equal(cachedAt({ geo: "JP" }), null, `${s}: a country the rules do not place is rendered, never stored`);
    assert.equal(cachedAt({ cookie: "XAUX", geo: "GB" }), null, `${s}: a cookie that names no market is rendered, never stored`);
    assert.equal(keyOf(rs, { cookie: "XAUX", geo: "GB" }), "1", `${s}: a cookie that names no market never reads another market's copy`);
  });
});

const APP_ROOT = path.join(process.cwd(), "src/app");
/** "/sets/:slug/gallery" → src/app/sets/[slug]/gallery/page.tsx (a :param is the one non-catch-all dynamic directory there). */
function marketPage(source: string): string | null {
  let dir = APP_ROOT;
  for (const seg of source.split("/").filter(Boolean)) {
    if (!seg.startsWith(":")) { dir = path.join(dir, seg); continue; }
    const dyn = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^\[[^.[\]]+\]$/.test(d)) : [];
    if (dyn.length !== 1) return null; dir = path.join(dir, dyn[0]!);
  }
  const f = path.join(dir, "page.tsx"); return fs.existsSync(f) ? f : null;
}

test("market pages read the visitor only through getCountry: no cookie, header or session of their own in the server closure or the layouts", { skip: !fs.existsSync(APP_ROOT) }, () => {
  const OTHER = /(?<![.\w])(cookies|headers|getCurrentUser|currentEntitlement|draftMode)\s*\(/;
  const GET_COUNTRY = path.join(process.cwd(), "src/lib/get-country.ts");
  for (const s of CDN_MARKET_SOURCES) {
    const pg = marketPage(s); assert.ok(pg, `${s} matches no page`);
    for (const entry of [pg, ...layoutsOf(pg)]) for (const f of closure(entry, process.cwd()).files) {
      if (f === GET_COUNTRY) continue;
      const src = fs.readFileSync(f, "utf8"); if (/^\s*["']use client["']/.test(src)) continue;
      const hit = OTHER.exec(src.replace(/\/\/.*$/gm, ""));
      assert.equal(hit, null, `${s}: ${path.relative(process.cwd(), f)} calls ${hit?.[1]}() — the market rules key the cache on getCountry's inputs only`);
    }
  }
});

test("a market page that hands its whole searchParams on strips the cache key first, so a non-US page never links or indexes ?_mk", { skip: !fs.existsSync(APP_ROOT) }, () => {
  assert.deepEqual(withoutMarketKey({ page: "2", [MARKET_KEY]: "1" }), { page: "2" });
  const plain = { set: "mh3" }; assert.equal(withoutMarketKey(plain), plain);
  for (const s of CDN_MARKET_SOURCES) {
    const pg = marketPage(s)!, src = fs.readFileSync(pg, "utf8").replace(/\/\/.*$/gm, "");
    const rest = src
      .replace(/searchParams\s*\??\.\s*[A-Za-z_$]/g, "")                 // a member read: one known key
      .replace(/searchParams\s*\??:/g, "")                               // a type annotation or a renamed destructure
      .replace(/\{\s*(?:params\s*,\s*)?searchParams\s*,?\s*\}/g, "");   // the props destructure
    if (/\bsearchParams\b/.test(rest)) assert.match(src, /withoutMarketKey\(/, `${path.relative(process.cwd(), pg)} passes searchParams on whole: wrap it in withoutMarketKey()`);
  }
});
