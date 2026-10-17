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

// ── THE MARKET PAGES' CDN COPY (2026-10-17, DECISIONS.md "Crawlers get the US copy from the CDN") ─────────────────────────────────────────
// A market page renders in getCountry()'s market. next.config.js caches it a day only for a request that certainly renders the US one (a country=US cookie, or no
// cookie and a US IP), and rewrites every other request to ?_mk=1, a cache key that is never stored. These tests hold the rules against getCountry itself.
import { CDN_MARKET_CACHE_CONTROL, CDN_MARKET_SOURCES, MARKET_KEY, withoutMarketKey } from "../src/lib/data/plane/headers";
import { COUNTRY_COOKIE, isCountry, normalizeCountry } from "../src/lib/country";

type Cond = { type: string; key: string; value?: string };
type Rule = { source: string; has?: Cond[]; missing?: Cond[]; headers?: { key: string; value: string }[]; destination?: string };
type Req = { cookie?: string; geo?: string; query?: Record<string, string> };
/** Next's matchHas (shared/lib/router/utils/prepare-destination.js): a value is an anchored regex; an empty value means "present"; `missing` fails on any match. */
const condMatches = (c: Cond, r: Req): boolean => {
  const v = c.type === "cookie" ? (c.key === COUNTRY_COOKIE ? r.cookie : undefined) : c.type === "header" ? (c.key.toLowerCase() === "x-vercel-ip-country" ? r.geo : undefined) : c.type === "query" ? r.query?.[c.key] : undefined;
  if (!v) return false;
  return c.value === undefined ? true : new RegExp(`^${c.value}$`).test(v);
};
const ruleMatches = (x: Rule, r: Req): boolean => (x.has ?? []).every((c) => condMatches(c, r)) && !(x.missing ?? []).some((c) => condMatches(c, r));
/** getCountry() (src/lib/get-country.ts): the cookie when it names a market, else the IP country, else the US. */
const marketOf = (r: Req): string => (isCountry(r.cookie) ? r.cookie : r.geo ? normalizeCountry(r.geo) : "US");
const CONFIG = path.join(process.cwd(), "next.config.js");
const loadConfig = async (): Promise<{ headers: Rule[]; rewrites: Rule[] }> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const c = require(CONFIG) as { headers(): Promise<Rule[]>; rewrites(): Promise<{ beforeFiles: Rule[] }> };
  return { headers: await c.headers(), rewrites: (await c.rewrites()).beforeFiles };
};

test("market pages: a day at the CDN, public pages only, wired in next.config.js as a US copy plus a key of their own for everyone else", { skip: !fs.existsSync(CONFIG) }, async () => {
  assert.equal(CDN_MARKET_CACHE_CONTROL, "public, s-maxage=86400, stale-while-revalidate=86400", "a day: the owner's minimum is twelve hours and the plane publishes once a day");
  assert.equal(MARKET_KEY, "_mk");
  const { headers, rewrites } = await loadConfig();
  for (const s of CDN_MARKET_SOURCES) {
    assert.ok(PUBLIC_SOURCES.some((p) => p === s || patternMatches(p, sample(s))), `${s}: a market source must also be a public source`);
    for (const p of PRIVATE_SOURCES) assert.ok(!patternMatches(p, sample(s)) && !patternMatches(s, sample(p)), `${s} overlaps the private ${p}`);
    assert.ok(!CDN_SOURCES.some((n) => n === s || patternMatches(n, sample(s)) || patternMatches(s, sample(n))), `${s} is also a market-neutral CDN source: one copy would serve every market`);
    assert.ok(!/opengraph-image|:\w+\*/.test(s), `${s}: no catch-all, so a share image (its own one-minute fallback) never takes the page's day`);
    const hs = headers.filter((h) => h.source === s && h.headers?.some((x) => x.key === "Vercel-CDN-Cache-Control")), rs = rewrites.filter((x) => x.source === s);
    assert.equal(hs.length, 2, `${s}: two CDN rules (a US cookie; no cookie and a US IP)`);
    for (const h of hs) assert.deepEqual(h.headers, [{ key: "Vercel-CDN-Cache-Control", value: CDN_MARKET_CACHE_CONTROL }]);
    assert.equal(rs.length, 2, `${s}: two rewrites (a non-US cookie; no cookie and a non-US IP)`);
    for (const x of rs) assert.equal(x.destination, `${s}?${MARKET_KEY}=1`);
  }
  assert.ok(CDN_MARKET_SOURCES.includes("/card/:slug") && CDN_MARKET_SOURCES.includes("/sealed/:slug") && CDN_MARKET_SOURCES.includes("/sets/:slug") && CDN_MARKET_SOURCES.includes("/price-guide") && CDN_MARKET_SOURCES.includes("/guides/:slug") && CDN_MARKET_SOURCES.includes("/blog/:slug"));
});

test("market pages: the cached copy is always the US render, a crawler's request is cached, and every other market reads and writes a key of its own", { skip: !fs.existsSync(CONFIG) }, async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/get-country.ts"), "utf8");
  const ck = src.indexOf("cookies().get(COUNTRY_COOKIE)"), geo = src.indexOf('headers().get("x-vercel-ip-country")');
  assert.ok(ck > 0 && geo > ck, "getCountry reads the country cookie, then the IP country: the rules below mirror exactly that order");
  const { headers, rewrites } = await loadConfig();
  const cookies = [undefined, "", "US", "UK", "EU", "AU", "SG", "CA", "us", "XX", "AUS"], geos = [undefined, "US", "GB", "DE", "AU", "SG", "CA", "JP", "us"], queries: (Record<string, string> | undefined)[] = [undefined, { [MARKET_KEY]: "1" }, { finish: "foil" }];
  for (const s of CDN_MARKET_SOURCES) {
    const hs = headers.filter((h) => h.source === s && h.headers?.some((x) => x.key === "Vercel-CDN-Cache-Control")), rs = rewrites.filter((x) => x.source === s);
    for (const cookie of cookies) for (const g of geos) for (const query of queries) {
      const r: Req = { cookie, geo: g, query }, market = marketOf(r), cached = hs.some((h) => ruleMatches(h, r)), rewritten = rs.some((x) => ruleMatches(x, r)), keyed = rewritten || !!query?.[MARKET_KEY];
      const at = `${s} cookie=${cookie} geo=${g} query=${JSON.stringify(query)}`;
      if (cached) assert.equal(market, "US", `${at}: a stored copy must be a US render`);
      if (cached) assert.ok(!keyed, `${at}: the US copy lives on the bare URL`);
      if (!keyed) assert.equal(market, "US", `${at}: only a US render may read the bare URL's copy`);
      if (market !== "US") assert.ok(keyed && !cached, `${at}: a ${market} render needs its own key, never stored`);
    }
    assert.ok(hs.some((h) => ruleMatches(h, { geo: "US" })), `${s}: a crawler (no cookie, US IP) must be cached`);
    assert.ok(hs.some((h) => ruleMatches(h, { cookie: "US", geo: "GB" })), `${s}: a US cookie is the US render wherever the visitor is`);
    assert.ok(rs.some((x) => ruleMatches(x, { cookie: "UK", geo: "US" })) && rs.some((x) => ruleMatches(x, { geo: "GB" })), `${s}: UK visitors are rewritten`);
  }
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
