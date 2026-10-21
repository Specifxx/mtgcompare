// How a page is cached (2026-10-17, DEPLOY.md "Caching"). The owner: prices only need refreshing every 6 to 24 hours, and the bill
// must come down. ISR made every visited page an ISR write (billed per 8 KB) after every release, about twenty times what rendering
// it costs, so the data pages are force-dynamic and Vercel's CDN keeps each response for a day (next.config.js CDN_PAGES with
// Vercel-CDN-Cache-Control). A release is the only thing that changes the data, and it empties the CDN. These pin it: every data page
// is force-dynamic and covered by a CDN rule of at least 6 hours; no page reads a cookie, a header or the session (one CDN copy serves
// every visitor); nothing caches for less than 6 hours but the eBay listings API (a strip's JSON, 5 minutes at the CDN by design:
// src/lib/ebay-route.ts, pinned in tests/ebay-route.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIN_TTL_S = 6 * 3600;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const SOURCES = walk(join(ROOT, "src"))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ path: relative(ROOT, f).split("\\").join("/"), text: readFileSync(f, "utf8") }));

const ttlOf = (text: string): string | null => /^export const revalidate\s*=\s*([^;\n]+);?/m.exec(text)?.[1].trim() ?? null;
const isForceDynamic = (text: string): boolean => /^export const dynamic\s*=\s*["']force-dynamic["']/m.test(text);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require(join(ROOT, "next.config.js")) as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };

/** next.config path pattern → does it match this concrete path? (":region(a|b)", ":path*" and ":slug" as Next reads them.) */
function matches(source: string, path: string): boolean {
  const re = "^" + source.replace(/\/:(\w+)\(([^)]+)\)/g, "/($2)").replace(/\/:\w+\*/g, "(?:/.*)?").replace(/\/:\w+/g, "/[^/]+") + "$";
  return new RegExp(re).test(path);
}

test("no page, layout, sitemap or route is cached for less than 6 hours", () => {
  for (const s of SOURCES.filter((x) => ttlOf(x.text) !== null)) {
    const v = ttlOf(s.text)!;
    if (v === "false") continue;
    assert.match(v, /^\d[\d_]*$/, `${s.path}: revalidate must be a number literal, got ${v}`);
    assert.ok(Number(v.replace(/_/g, "")) >= MIN_TTL_S, `${s.path}: revalidate = ${v} is under 6 hours (never lower it)`);
  }
  for (const s of SOURCES) {
    assert.doesNotMatch(s.text, /export const fetchCache\s*=/, `${s.path}: no fetchCache override`);
    for (const m of s.text.matchAll(/next:\s*\{[^}]*revalidate:\s*(\d[\d_]*)/g)) {
      assert.ok(Number(m[1].replace(/_/g, "")) >= MIN_TTL_S, `${s.path}: fetch revalidate ${m[1]} is under 6 hours`);
    }
  }
});

test("every data page is force-dynamic, not ISR, and Vercel's CDN keeps it for 6 hours or more", async () => {
  const pages = SOURCES.filter((s) => (s.path.startsWith("src/app/[region]/") || s.path === "src/app/(site)/guides/[slug]/page.tsx") && s.path.endsWith("/page.tsx"));
  assert.ok(pages.length >= 17, `found ${pages.length}`);
  const rules = (await config.headers()).filter((r) => r.headers.some((h) => h.key === "Vercel-CDN-Cache-Control"));
  assert.ok(rules.length > 0, "next.config.js sets Vercel-CDN-Cache-Control");
  for (const r of rules) {
    const v = r.headers.find((h) => h.key === "Vercel-CDN-Cache-Control")!.value;
    const m = /^public, s-maxage=(\d+), stale-while-revalidate=(\d+)$/.exec(v);
    assert.ok(m && Number(m[1]) >= MIN_TTL_S, `${r.source}: ${v}`);
  }
  for (const s of pages) {
    assert.ok(isForceDynamic(s.text), `${s.path}: export const dynamic = "force-dynamic" (the CDN caches it, not ISR)`);
    assert.equal(ttlOf(s.text), null, `${s.path}: no revalidate: an ISR write costs about twenty renders`);
    assert.doesNotMatch(s.text, /generateStaticParams/, `${s.path}: nothing is prerendered`);
  }
  for (const sample of ["/au", "/us/p/pitch-black-booster-box", "/uk/sealed/page/2", "/sg/stores/x/page/3", "/guides/pokemon-booster-box-prices-by-country"]) {
    assert.ok(rules.some((r) => matches(r.source, sample)), `${sample} is not covered by a CDN rule`);
  }
  for (const never of ["/api/ebay/au", "/api/browse/au", "/api/revalidate", "/about"]) {
    assert.ok(!rules.some((r) => matches(r.source, never)), `${never} must not be CDN-cached by the page rule`);
  }
});

test("one CDN copy serves every visitor: nothing under src/app reads a cookie, a header or the session", () => {
  for (const s of SOURCES.filter((x) => x.path.startsWith("src/app/") || x.path.startsWith("src/components/") || x.path.startsWith("src/lib/"))) {
    if (s.path.startsWith("src/app/api/")) continue;
    assert.doesNotMatch(s.text, /from ["']next\/headers["']/, `${s.path}: a cookie or header read makes a page per-visitor, and the CDN would serve one visitor's page to all`);
  }
});

test("a CDN cache under 6 hours exists only for the eBay listings API", () => {
  for (const s of SOURCES) {
    for (const m of s.text.matchAll(/s-maxage=(\d+)/g)) {
      if (Number(m[1]) >= MIN_TTL_S) continue;
      assert.equal(s.path, "src/lib/ebay-route.ts", `${s.path}: s-maxage=${m[1]} is under 6 hours`);
    }
  }
});
