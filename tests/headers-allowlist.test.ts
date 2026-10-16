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
  if (!star) return own;
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
    assert.ok(PUBLIC_SOURCES.includes(s), `${s}: a CDN source must also be a public source`);
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
