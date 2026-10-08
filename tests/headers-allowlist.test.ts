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
