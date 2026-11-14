// Internal links and the sitemap's dates (2026-11-14, DECISIONS.md "Every sitemap product is linked from its siblings; lastmod is the
// day a page changed"). Measured on a build of the 14 November data: 255 of the US sitemap's 801 product pages were linked from two
// indexable pages or fewer, and every URL of the regional sitemaps carried the import's time as its lastmod.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { ProductCardData } from "../src/lib/data";
import { GUIDE_BY_SLUG } from "../src/content/guides";
import { neighboursByName, setNeighbours } from "../src/lib/product-data";
import { REGIONS } from "../src/lib/regions";
import { ringAfter } from "../src/lib/ring";
import { regionSitemap, sitemapChanges } from "../src/lib/sitemap";
import { SITE_URL } from "../src/lib/site";

const src = (p: string) => fs.readFileSync(path.join("src", p), "utf8");

test("ringAfter: the next few of a list, wrapping; in a long list every item is linked by exactly `take` others", () => {
  const list = Array.from({ length: 11 }, (_, i) => ({ slug: `s${i}` }));
  assert.deepEqual(ringAfter(list, "s0", 4).map((x) => x.slug), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual(ringAfter(list, "s9", 4).map((x) => x.slug), ["s10", "s0", "s1", "s2"], "wraps at the end");
  const picked = new Map<string, number>();
  for (const self of list) {
    const out = ringAfter(list, self.slug, 4);
    assert.equal(out.length, 4);
    assert.ok(!out.some((x) => x.slug === self.slug), "never itself");
    assert.equal(new Set(out.map((x) => x.slug)).size, 4, "no repeats");
    for (const x of out) picked.set(x.slug, (picked.get(x.slug) ?? 0) + 1);
  }
  for (const x of list) assert.equal(picked.get(x.slug), 4, `${x.slug} is linked from four siblings`);
  // a short list: everything else, in order; an unknown slug: the first few
  assert.deepEqual(ringAfter(list.slice(0, 4), "s2", 4).map((x) => x.slug), ["s0", "s1", "s3"]);
  assert.deepEqual(ringAfter(list, "nope", 3).map((x) => x.slug), ["s0", "s1", "s2"]);
  assert.deepEqual(ringAfter([], "x", 4), []);
});

test("More <type>: the four products after this one by name, so a line stays together and no page is left out", () => {
  const rows = ["Signature Spellbook: Jace", "From the Vault: Lore", "From the Vault: Angels", "Commander Collection: Green", "From the Vault: Twenty", "Signature Spellbook: Gideon", "Commander Collection: Black"].map((name) => ({
    name,
    slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  }));
  const self = { name: "From the Vault: Exiled", slug: "from-the-vault-exiled" };
  assert.deepEqual(neighboursByName(rows, self, 4).map((r) => r.name), ["From the Vault: Lore", "From the Vault: Twenty", "Signature Spellbook: Gideon", "Signature Spellbook: Jace"]);
  // the last name wraps to the first; the product itself is never returned even when the rows hold it
  const last = rows.find((r) => r.name === "Signature Spellbook: Jace")!;
  assert.deepEqual(neighboursByName(rows, last, 2).map((r) => r.name), ["Commander Collection: Black", "Commander Collection: Green"]);
  // every row of the type is linked from exactly four others
  const count = new Map<string, number>();
  for (const r of rows) for (const n of neighboursByName(rows, r, 4)) count.set(n.slug, (count.get(n.slug) ?? 0) + 1);
  for (const r of rows) assert.equal(count.get(r.slug), 4, r.name);
  const lib = src("lib/product-data.ts");
  assert.match(lib, /isOpen\(s\)\)\.map\(cardRow\)\.filter\(\(r\) => !productNoindex\(r, productType\)\)/, "only in-stock products whose page is indexable");
  assert.match(lib, /rows && rows\.length \? rows\.map\(altToCard\) : before\(\)/, "nothing else of the type, or the database: the cheapest in stock, as before");
});

const card = (slug: string, cents: number | null, inStock: number, listed = 5, productType = "Commander Deck"): ProductCardData => ({
  slug,
  name: slug,
  productType,
  setCode: "trk",
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: inStock,
  listedStores: listed,
  marketplaceOpen: false,
  medianOpenCents: null,
  releaseDate: null,
});

test("More from <set>: a big set links every in-stock product from eight siblings, not the same cheapest eight from all", () => {
  // twelve in stock (cheapest first, as data.ts sortCards returns them), two sold out, one in stock at a single store (a thin page)
  const open = Array.from({ length: 12 }, (_, i) => card(`p${String(i).padStart(2, "0")}`, 1000 * (i + 1), 3));
  const all = [...open, card("thin", 500, 1, 1), card("sold-a", null, 0), card("sold-b", null, 0)];
  const relatedOf = (slug: string) => all.filter((c) => c.slug !== slug).sort((a, b) => Number(b.inStockStores > 0) - Number(a.inStockStores > 0) || (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0));
  const count = new Map<string, number>();
  for (const self of open) {
    const grid = setNeighbours(relatedOf(self.slug), self);
    assert.equal(grid.length, 8);
    assert.ok(grid.every((c) => c.slug !== self.slug && c.inStockStores >= 3), "in stock and indexable only, never itself");
    for (const c of grid) count.set(c.slug, (count.get(c.slug) ?? 0) + 1);
  }
  for (const c of open) assert.equal(count.get(c.slug), 8, `${c.slug} is linked from eight siblings`);
  assert.deepEqual(setNeighbours(relatedOf("p03"), open[3]).map((c) => c.slug), ["p04", "p05", "p06", "p07", "p08", "p09", "p10", "p11"], "the ones priced next above it");
  assert.deepEqual(setNeighbours(relatedOf("p10"), open[10]).map((c) => c.slug).slice(0, 3), ["p11", "p00", "p01"], "wrapping to the cheapest");
  // a sold-out product, and a small set: the first eight of the list, as before
  assert.deepEqual(setNeighbours(relatedOf("sold-a"), all[13]), relatedOf("sold-a").slice(0, 8));
  const small = all.slice(0, 6);
  assert.deepEqual(setNeighbours(small.slice(1), small[0]), small.slice(1));
  const page = src("app/[region]/p/[slug]/page.tsx");
  assert.match(page, /const grid = set \? setNeighbours\(related, toCard\(/);
  assert.doesNotMatch(page, /related\.slice\(0, 8\)/);
});

test("sitemap lastmod: the day a product's price or stock last changed; a set or type page, the latest of its products; else the import time", () => {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const rows = [
    { slug: "a-box", setCode: "blb", productType: "Play Booster Box" },
    { slug: "b-cbb", setCode: "blb", productType: "Collector Booster Box" },
    { slug: "c-box", setCode: null, productType: "Play Booster Box" },
    { slug: "no-history", setCode: "blb", productType: "Bundle" },
  ];
  const series = {
    "a-box": [[day("2026-10-23"), 9000, 4], [day("2026-11-03"), 8500, 4]],
    "b-cbb": [[day("2026-11-09"), 24000, 2]],
    "c-box": [[day("2026-10-23"), null, 0]],
    "not-in-this-market": [[day("2026-11-14"), 1, 1]],
  } as Record<string, [number, number | null, number][]>;
  const changed = sitemapChanges(rows, series);
  assert.deepEqual(changed.products.get("a-box"), new Date("2026-11-03T00:00:00Z"), "its last change-point, not its first");
  assert.equal(changed.products.get("no-history"), undefined);
  assert.equal(changed.products.has("not-in-this-market"), false);
  assert.deepEqual(changed.sets.get("blb"), new Date("2026-11-09T00:00:00Z"), "the latest of the set's products");
  assert.deepEqual(changed.types.get("Play Booster Box"), new Date("2026-11-03T00:00:00Z"));
  assert.equal(changed.types.get("Bundle"), undefined);
  assert.equal(sitemapChanges(rows, undefined).products.size, 0, "no history for the market: no dates");

  const imported = new Date("2026-11-14T01:18:30Z");
  const entries = regionSitemap(REGIONS.uk, { typeLabels: ["Play Booster Box", "Bundle"], setCodes: ["blb"], productSlugs: ["a-box", "b-cbb", "no-history"], lastmod: imported, changed });
  const at = (p: string) => entries.find((e) => e.url === `${SITE_URL}${p}`)?.lastModified;
  assert.deepEqual(at("/uk/p/a-box"), new Date("2026-11-03T00:00:00Z"));
  assert.deepEqual(at("/uk/p/b-cbb"), new Date("2026-11-09T00:00:00Z"));
  assert.deepEqual(at("/uk/p/no-history"), imported, "no history yet: the import time, as before");
  assert.deepEqual(at("/uk/sets/bloomburrow"), new Date("2026-11-09T00:00:00Z"));
  assert.deepEqual(at("/uk/type/play-booster-boxes"), new Date("2026-11-03T00:00:00Z"));
  assert.deepEqual(at("/uk/type/bundles"), imported);
  // without `changed` (PUBLIC_DATA_MODE "db", or no history file) every URL carries the import time
  assert.ok(regionSitemap(REGIONS.uk, { typeLabels: ["Bundle"], setCodes: ["blb"], productSlugs: ["a-box"], lastmod: imported }).every((e) => e.lastModified === imported));
  const route = src("app/sitemap.ts");
  assert.match(route, /lastChanges\(r\.market\)/);
  assert.match(route, /return sitemapChanges\(rows, h\.series\[market\]\);/);
});

test("the committed price history gives real, different dates, none after its last day", () => {
  const file = path.join("data", "public", "price-history.json");
  if (!fs.existsSync(file)) return;
  const h = JSON.parse(fs.readFileSync(file, "utf8")) as { through: number; series: Record<string, Record<string, [number, number | null, number][]>> };
  const us = h.series.US ?? {};
  const changed = sitemapChanges(Object.keys(us).map((slug) => ({ slug, setCode: null, productType: "x" })), us);
  const days = new Set([...changed.products.values()].map((d) => d.getTime()));
  assert.ok(days.size > 1, "not one date for every product");
  for (const d of changed.products.values()) assert.ok(d.getTime() <= h.through * 86_400_000, "never after the last day folded in");
});

test("the old singles site's sitemap files are gone: no route serves them and no redirect points them at today's sitemap", async () => {
  // Until 2026-10-21 /sitemap.xml indexed /sitemaps/<kind>-<n>.xml (about 41,700 card URLs) and robots.txt also named /news-sitemap.xml.
  // /sitemap.xml is today's index at the same URL; the old children must answer 404, never a sitemap and never a redirect.
  for (const gone of ["sitemaps", "news-sitemap.xml", "feed.json"]) assert.equal(fs.existsSync(path.join("src", "app", gone)), false, `src/app/${gone}`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require("../next.config.js") as { redirects: () => Promise<{ source: string; destination: string }[]> };
  const rules = await cfg.redirects();
  for (const r of rules) {
    assert.doesNotMatch(r.source, /sitemap/i, r.source);
    assert.doesNotMatch(r.destination, /sitemap/i, r.destination);
    const first = /^\/:path\(([^)]*)\)/.exec(r.source)?.[1].split("|") ?? [r.source.split("/")[1]];
    assert.ok(!first.includes("sitemaps") && !first.includes("news-sitemap.xml"), r.source);
  }
  const robots = src("app/robots.ts");
  assert.match(robots, /sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/, "one sitemap, the index");
});

test("no page links a guide that does not exist, or the bare /preorders path (both were 404s)", () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
  for (const file of walk("src")) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\$\{r\.region\}\/guides\/([a-z0-9-]+)/g)) assert.ok(GUIDE_BY_SLUG.has(m[1] as never), `${file}: /guides/${m[1]} is not a guide`);
    assert.doesNotMatch(text, /href: `\/\$\{r\.region\}\/preorders`|href=\{`\/\$\{r\.region\}\/preorders`\}/, `${file}: /<region>/preorders has no page`);
  }
});
