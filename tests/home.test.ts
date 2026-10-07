import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRY_LIST, MARKETS } from "../src/lib/country";
import {
  POPULAR_MIN_CARDS,
  RECENT_MIN_CENTS,
  countsAsStore,
  homeStatsFrom,
  popularKind,
  recentMoves,
} from "../src/lib/home";
import { IMPORT_CADENCE, currencyList, homeFaqs, marketList } from "../src/lib/home-faq";
import { REGION_HOME_PATH, homeTitle, regionHomeHreflang, regionHomeTitle } from "../src/lib/seo";
import { startHereFor } from "../src/lib/content/featured";
import { POSTS } from "../src/lib/blog";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── Rendering model ──────────────────────────────────────────────────────────

test("the homepage and the region homes are static: no cookie, header or session read, hourly ISR", () => {
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx", "src/components/home/home-data.ts", "src/components/home/HomeSections.tsx", "src/components/home/CinematicHero.tsx", "src/components/home/EditorialHub.tsx"]) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /getCountry|next\/headers|cookies\(\)|headers\(\)|getCurrentUser/, f);
  }
  assert.match(read("src/app/page.tsx"), /export const revalidate = 3600;/);
  for (const r of ["au", "uk", "ca", "sg", "eu"]) {
    const src = read(`src/app/${r}/page.tsx`);
    assert.match(src, /export const revalidate = 3600;/, r);
    assert.match(src, new RegExp(`<RegionHome region="${r.toUpperCase()}" />`), r);
  }
});

test("the homepage uses RiftCompare's display face and order", () => {
  const page = codeOnly(read("src/app/page.tsx"));
  assert.match(page, /variable: "--font-riftbound"/);
  assert.match(page, /\$\{archivo\.variable\} rb-display-sans flex flex-col gap-10/);
  const order = ["<CinematicHero", "<EditorialHub", "<HomeTopDeals", "<PriceGuideCallout", "<HomeSections", "card-surface p-6"];
  let at = -1;
  for (const t of order) {
    const i = page.indexOf(t);
    assert.ok(i > at, `${t} out of order`);
    at = i;
  }
  // The sea hero, the bob animation and the old SectionHeader sections are gone.
  assert.doesNotMatch(page, /SectionHeader|animate-bob|sea-grid|MarketPills/);
});

// ── Stats ────────────────────────────────────────────────────────────────────

test("stores are store:* sources with an in-stock offer, plus TCGplayer in the US; eBay never counts", () => {
  assert.ok(countsAsStore("store:abc", "AU"));
  assert.ok(countsAsStore("tcgplayer", "US"));
  assert.ok(!countsAsStore("tcgplayer", "AU"));
  assert.ok(!countsAsStore("ebay", "US"));
  assert.ok(!countsAsStore("ebay_us", "CA"));
  const priced = Object.fromEntries(MARKETS.map((m) => [m, 10])) as Record<(typeof MARKETS)[number], number>;
  const s = homeStatsFrom(
    [
      { source: "store:a", market: "US", offers: 5, inStock: 3 },
      { source: "store:b", market: "US", offers: 5, inStock: 0 },
      { source: "tcgplayer", market: "US", offers: 9, inStock: 9 },
      { source: "ebay", market: "US", offers: 4, inStock: 4 },
      { source: "store:a", market: "AU", offers: 2, inStock: 2 },
      { source: "store:c", market: "UK", offers: 2, inStock: 1 },
    ],
    priced,
    7000,
    "2026-10-03T07:00:00.000Z",
  );
  assert.deepEqual(s.statsByCountry.US, { priced: 10, inStock: 12, stores: 2 }, "store:b has nothing in stock; eBay is excluded everywhere");
  assert.equal(s.statsByCountry.AU.stores, 1);
  assert.equal(s.statsByCountry.SG.stores, 0);
  assert.equal(s.liveStoresAll, 3, "store:a, tcgplayer, store:c");
  assert.equal(s.totalCards, 7000);
});

// ── Recently updated ─────────────────────────────────────────────────────────

test("recently updated: real changes only, outliers and sub-dollar cards dropped, biggest moves first", () => {
  const prev = { "1": [1000, 900], "2": [1000, 900], "3": [1000, 900], "4": [1000, 900], "5": [50, 40], "6": [2000, null], "7": [null, 100], "9": [1000, 1] } as Record<string, [number | null, number | null]>;
  const last = { "1": [1100, 900], "2": [1000, 800], "3": [4000, 900], "4": [150, 900], "5": [90, 40], "6": [1500, null], "7": [500, 100], "8": [700, 600], "9": [900, 1] } as Record<string, [number | null, number | null]>;
  const out = recentMoves(prev, last, (id) => id !== 9);
  assert.deepEqual(
    out.map((m) => [m.id, m.pct]),
    [
      [6, -25],
      [1, 10],
    ],
  );
  // 2 unchanged market price; 3 +300% spike; 4 −85% drop; 5 under US$1; 7 no previous; 8 new; 9 not a card.
  assert.ok(RECENT_MIN_CENTS === 100);
  assert.equal(recentMoves(prev, last, () => true, 1).length, 1, "the limit holds");
});

// ── Popular ──────────────────────────────────────────────────────────────────

test("'Most popular' needs a real counter: fewer searched cards than the row shows means the chase row", () => {
  assert.equal(popularKind([]), "chase");
  assert.equal(popularKind(Array.from({ length: POPULAR_MIN_CARDS - 1 }, (_, i) => i)), "chase");
  assert.equal(popularKind(Array.from({ length: POPULAR_MIN_CARDS }, (_, i) => i)), "popular");
  const carousel = read("src/components/home/PopularCardsCarousel.tsx");
  assert.match(carousel, /label: "Chase cards"/);
  // The words "most-searched" appear only on the branch backed by the counter.
  const chaseBranch = carousel.slice(carousel.indexOf(': {\n                key: "alltime",\n                label: "Chase cards"'));
  assert.doesNotMatch(chaseBranch.slice(0, 600), /searched/i);
});

// ── FAQ claims match the constants they state ────────────────────────────────

test("every FAQ claim is built from the constants it states", () => {
  const ml = marketList();
  for (const c of COUNTRY_LIST) assert.ok(ml.includes(c.code === "US" ? "the US" : c.code === "UK" ? "the UK" : c.code === "EU" ? "the EU" : c.label), c.code);
  const cl = currencyList();
  for (const c of COUNTRY_LIST) assert.ok(cl.includes(c.currency), c.currency);
  const off = homeFaqs({ ebayLive: false });
  const on = homeFaqs({ ebayLive: true });
  assert.equal(off.length, 8, "eight FAQs, as on RiftCompare");
  assert.ok(off[0].a.includes(ml));
  assert.ok(off[1].a.includes(IMPORT_CADENCE));
  assert.ok(off[7].a.includes(cl));
  // eBay listings are claimed only while the eBay pass is live.
  assert.ok(!off.some((f) => /cheapest matching eBay listing/.test(f.a)));
  assert.ok(on[0].a.includes("cheapest matching eBay listing"));
  // Nothing promises an email, a delivered total the site does not show, or a game.
  for (const f of [...off, ...on]) {
    assert.doesNotMatch(f.a, /email|we'll notify|riftle|pack sim/i, f.q);
    assert.doesNotMatch(f.q + f.a, /Riftbound|RiftCompare/, f.q);
  }
});

test("the About copy names only revenue OP Compare really has", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /affiliate commission \(the eBay Partner Network and TCGplayer\) and Plus and\s+Premium subscriptions/);
  assert.doesNotMatch(page, /display ads|consulting|Amazon/);
});

// ── SEO ──────────────────────────────────────────────────────────────────────

test("titles fit 60 characters and name the store count only when there is one", () => {
  assert.equal(homeTitle(95), "One Piece Card Prices: Live Price Guide, 95 Stores");
  assert.equal(homeTitle(95, true), "One Piece Card Prices: Live Price Guide, 95 Stores + eBay");
  assert.equal(homeTitle(0), "One Piece Card Prices: Live Price Guide, Stores");
  assert.equal(homeTitle(0, true), "One Piece Card Prices: Live Price Guide, Stores + eBay");
  for (const r of ["AU", "UK", "SG", "CA", "EU"] as const) {
    assert.ok(regionHomeTitle(r, 123).length <= 60, regionHomeTitle(r, 123));
    assert.ok(regionHomeTitle(r, null).length <= 60);
  }
});

test("region homes carry reciprocal hreflang with / as x-default", () => {
  const map = regionHomeHreflang();
  assert.equal(map["x-default"], map["en-US"]);
  for (const [c, path] of Object.entries(REGION_HOME_PATH)) {
    if (c === "US") continue;
    assert.ok(Object.values(map).some((u) => u.endsWith(path)), path);
  }
  assert.ok(map["en-GB"].endsWith("/uk") && map["en-AU"].endsWith("/au") && map["en-IE"].endsWith("/eu"));
  const meta = read("src/lib/home-metadata.ts");
  assert.match(meta, /languages: regionHomeHreflang\(\)/);
  assert.match(read("src/app/sitemap.ts"), /\["\/au", "\/uk", "\/ca", "\/sg", "\/eu"\]/);
});

test("every editorial pick resolves to a real post", () => {
  const slugs = new Set(POSTS.map((p) => p.slug));
  for (const m of [undefined, ...MARKETS]) for (const p of startHereFor(m)) assert.ok(slugs.has(p.slug), p.slug);
});
