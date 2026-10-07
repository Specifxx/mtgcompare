// Share images (src/lib/og, src/app/**/opengraph-image.tsx). Network-free: art is
// passed as null (the placeholder path) and fonts come from the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import type { CardLite, SetLite } from "../src/lib/data";
import { MARKETS, type Country } from "../src/lib/country";
import { OG_FONT_DIR, OG_FONT_FILES, isSfnt, loadOgFonts } from "../src/lib/og/fonts";
import { DEFAULT_OG_IMAGE, pageOg, pageOgOwnImage } from "../src/lib/og/meta";
import { OG_AFTER_ERROR, OG_CACHED } from "../src/lib/og/respond";
import { ogPriceLines, pickGuideRows, setTopRows, showMoveColumn, storesTracked } from "../src/lib/og/select";
import { SET_STATS, badgeText, clip, clipWords, fitStats, ogDate, ogDelta, ogMoney, setTitleSize, splitEdition, statWidth } from "../src/lib/og/theme";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src", "app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const ogRoutes = walk(APP).filter((f) => /[/\\](opengraph|twitter)-image\.(tsx|ts|jsx|js)$/.test(f));

// ── 1. Route exports ────────────────────────────────────────────────────────
const ALLOWED = new Set(["default", "alt", "size", "contentType", "runtime", "revalidate", "dynamic", "maxDuration", "generateImageMetadata"]);

test("there is a share image for /, /price-guide, sets, sealed, cards and blog posts", () => {
  const rel = ogRoutes.map((f) => path.relative(APP, f).split(path.sep).join("/")).sort();
  for (const want of [
    "opengraph-image.tsx",
    "price-guide/opengraph-image.tsx",
    "sets/[slug]/opengraph-image.tsx",
    "sealed/[slug]/opengraph-image.tsx",
    "card/[slug]/opengraph-image.tsx",
    "blog/[slug]/opengraph-image.tsx",
  ]) {
    assert.ok(rel.includes(want), `missing src/app/${want}`);
  }
  // twitter:image is copied from og:image; a twitter-image file would override it.
  assert.deepEqual(rel.filter((r) => r.includes("twitter-image")), []);
});

for (const file of ogRoutes) {
  const rel = path.relative(ROOT, file);
  test(`${rel}: nodejs, 1200×630 PNG, alt, revalidate, only Next's export names`, () => {
    const src = fs.readFileSync(file, "utf8");
    assert.match(src, /export const runtime = "nodejs";/);
    assert.match(src, /export const size = \{ width: 1200, height: 630 \};/);
    assert.match(src, /export const contentType = "image\/png";/);
    assert.match(src, /export const revalidate = 21600;/);
    const alt = src.match(/export const alt =\s*"([^"]*)"/);
    assert.ok(alt && alt[1].length > 20, "alt text");
    const names = [...src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:const|function|let|var)?\s*(\w+)?/g)].map((m) =>
      /export\s+default/.test(m[0]) ? "default" : m[1],
    );
    for (const n of names) assert.ok(ALLOWED.has(n), `${rel} exports "${n}", which next build rejects in an image route`);
    assert.doesNotMatch(src, /export[^\n]*generateStaticParams/, "never prewarm share images");
    assert.doesNotMatch(src, /no-store|force-dynamic/, "a share image must stay ISR-cached");
    assert.doesNotMatch(src, /from "@\/lib\/db"/);
  });
}

// ── 2–3. Metadata that would hide or mis-point the images ────────────────────
test("a page beside an opengraph-image never sets openGraph.images (it blocks the file)", () => {
  for (const file of ogRoutes) {
    const dir = path.dirname(file);
    for (const page of ["page.tsx", "layout.tsx"]) {
      const p = path.join(dir, page);
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      const og = src.match(/openGraph:.*$/gm) ?? [];
      for (const block of og) assert.doesNotMatch(block, /\bimages\s*:/, `${path.relative(ROOT, p)}: ${block}`);
    }
  }
});

test("the root openGraph carries no url (every page would inherit og:url = the homepage)", () => {
  const src = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
  const block = src.match(/openGraph:.*$/m);
  assert.ok(block, "layout.tsx sets openGraph");
  assert.doesNotMatch(block[0], /\burl\s*:/);
  assert.match(src, /summary_large_image/);
});

// Pages whose metadata belongs to another track (the contact/feedback forms and
// the privacy policy); each should adopt pageOg() the next time it is edited.
const OG_URL_PENDING = new Set(["contact/page.tsx", "feedback/page.tsx", "privacy/page.tsx", "stores/page.tsx", "stores/suggest/page.tsx"]);

test("every page with a canonical also sets og:url to that same path (pageOg)", () => {
  const pages = walk(APP).filter((f) => /[/\\]page\.tsx$/.test(f));
  let checked = 0;
  for (const file of pages) {
    const rel = path.relative(APP, file).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    const canon = src.match(/canonical:\s*("[^"]*"|`[^`]*`)/);
    if (!canon || OG_URL_PENDING.has(rel)) continue;
    const og = src.match(/openGraph:\s*(pageOg|pageOgOwnImage)\(\s*("[^"]*"|`[^`]*`)/);
    assert.ok(og, `${rel}: has a canonical but no openGraph: pageOg(...)`);
    assert.equal(og[2], canon[1], `${rel}: og:url must be the canonical path`);
    // A page's own openGraph replaces the root's, images included: without a sibling
    // opengraph-image it must carry the default (pageOg); with one, it must not
    // name images at all (pageOgOwnImage), or the key blocks the file.
    const own = fs.readdirSync(path.dirname(file)).some((f) => /^opengraph-image\.(tsx|ts|jsx|js)$/.test(f));
    assert.equal(og[1], own ? "pageOgOwnImage" : "pageOg", `${rel}: ${own ? "has its own share image" : "needs the default share image"}`);
    checked++;
  }
  assert.ok(checked >= 20, `checked ${checked} pages`);
});

test("pageOg: OG_BASE plus the page's url and the default image; extra fields override, a non-path throws", () => {
  assert.deepEqual(pageOg("/movers"), { siteName: "OP Compare", locale: "en_US", type: "website", url: "/movers", images: [DEFAULT_OG_IMAGE] });
  assert.equal("images" in pageOgOwnImage("/card/x"), false);
  // The default image's alt is the root route's own.
  const root = fs.readFileSync(path.join(APP, "opengraph-image.tsx"), "utf8");
  assert.equal(root.match(/export const alt =\s*"([^"]*)"/)?.[1], DEFAULT_OG_IMAGE.alt);
  const a = pageOg("/blog/x", { type: "article", title: "T" }) as Record<string, unknown>;
  assert.equal(a.type, "article");
  assert.equal(a.url, "/blog/x");
  assert.throws(() => pageOg("https://opcompare.app/"));
});

// ── Cache headers ────────────────────────────────────────────────────────────
test("share images send a 6 h CDN header, fallbacks one minute; never ImageResponse's immutable year", () => {
  assert.equal(OG_CACHED, "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400");
  assert.equal(OG_AFTER_ERROR, "public, max-age=0, s-maxage=60");
  const src = fs.readFileSync(path.join(ROOT, "src", "lib", "og", "images.tsx"), "utf8");
  assert.match(src, /export const fallbackOg = \(\) => ogResponse\(<FallbackImage \/>, OG_AFTER_ERROR\);/);
  // Every non-fallback ogResponse( … ) passes OG_CACHED.
  const calls = src.split("ogResponse(").slice(1);
  for (const c of calls) {
    const body = c.slice(0, c.indexOf(");") + 1);
    assert.match(body, /OG_(CACHED|AFTER_ERROR)/, `ogResponse(${body.slice(0, 60)}…) has no cache header`);
  }
  const respond = fs.readFileSync(path.join(ROOT, "src", "lib", "og", "respond.ts"), "utf8");
  assert.match(respond, /"cache-control": cacheControl/, "the key must be lowercase to replace ImageResponse's default");
});

// ── 4. Row selection ─────────────────────────────────────────────────────────
const SETS: SetLite[] = [
  { id: 1, slug: "romance-dawn", code: "OP01", name: "Romance Dawn", kind: "booster", releasedOn: "2022-12-02", cardCount: 0, sealedCount: 0 },
  { id: 2, slug: "promos", code: "P", name: "Promotion Cards", kind: "promo", releasedOn: null, cardCount: 0, sealedCount: 0 },
];
let nextId = 1;
function card(o: Partial<CardLite> & { lowUS?: number | null; storesUS?: number }): CardLite {
  const low = Object.fromEntries(MARKETS.map((m) => [m, null])) as Record<Country, number | null>;
  const stores = Object.fromEntries(MARKETS.map((m) => [m, 0])) as Record<Country, number>;
  low.US = o.lowUS === undefined ? (o.marketUsd ?? 5000) : o.lowUS;
  stores.US = o.storesUS ?? 3;
  const id = o.id ?? nextId++;
  return {
    id, slug: `c-${id}`, name: `Card ${id}`, number: `OP01-${String(id).padStart(3, "0")}`, setId: 1, rarity: "SEC", variant: null,
    printing: "manga", colors: ["Red"], cardType: "Character", cost: 1, power: 1000, counter: null, life: null, hasImage: true,
    marketUsd: 5000, change7d: 0, change30d: null, high90Usd: null,
    ...o, low, stores,
  };
}
const catOf = (cards: CardLite[]) => ({ cards, setById: new Map(SETS.map((s) => [s.id, s])) });

test("pickGuideRows: excludes promos, odd variants, no-art, single-store and out-of-band listings", () => {
  const good = [10, 9, 8, 7, 6].map((k) => card({ name: `Good ${k}`, marketUsd: k * 10000 }));
  const bad = [
    card({ name: "Promo", printing: "promo", marketUsd: 900000 }),
    card({ name: "Promo set", setId: 2, marketUsd: 900000 }),
    card({ name: "Serial", variant: "Serial Numbered", marketUsd: 900000 }),
    card({ name: "Championship", variant: "Championship 2025", marketUsd: 900000 }),
    card({ name: "No art", hasImage: false, marketUsd: 900000 }),
    card({ name: "One store", storesUS: 1, marketUsd: 900000 }),
    card({ name: "Mislisted", marketUsd: 900000, lowUS: 5000000 }),
    card({ name: "Cheap", marketUsd: 999 }),
    card({ name: "No US", marketUsd: 900000, lowUS: null }),
  ];
  const rows = pickGuideRows(catOf([...bad, ...good]));
  assert.deepEqual(rows.map((r) => r.name), ["Good 10", "Good 9", "Good 8", "Good 7", "Good 6"]);
  assert.equal(rows[0].setCode, "OP01");
  assert.equal(rows[0].low, 100000);
});

test("pickGuideRows: the hero rows keep to 1.2× the market; a 1.5× ask only fills in when nothing else does", () => {
  const good = [10, 9, 8, 7, 6].map((k) => card({ name: `G${k}`, marketUsd: k * 10000 }));
  // DB, 2026-10-03: Monkey.D.Luffy Manga OP05-119, market US$5,000, cheapest US$7,499.98 (3 stores).
  const high = card({ name: "Luffy manga", marketUsd: 500000, lowUS: 749998, storesUS: 3 });
  assert.deepEqual(pickGuideRows(catOf([high, ...good])).map((r) => r.name), ["G10", "G9", "G8", "G7", "G6"]);
  const few = [card({ name: "Luffy manga 2", marketUsd: 500000, lowUS: 749998 }), card({ name: "A", marketUsd: 20000 }), card({ name: "B", marketUsd: 10000 })];
  assert.equal(pickGuideRows(catOf(few)).length, 3);
});

test("pickGuideRows: one row per name, sorted by the cheapest US price, at most 5", () => {
  const cards = [
    card({ name: "Shanks", marketUsd: 400000, lowUS: 285000 }),
    card({ name: "Shanks", marketUsd: 300000, lowUS: 290000 }),
    ...[1, 2, 3, 4, 5, 6].map((k) => card({ name: `N${k}`, marketUsd: k * 20000 })),
  ];
  const rows = pickGuideRows(catOf(cards));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.name), ["Shanks", "N6", "N5", "N4", "N3"]);
  assert.equal(rows[0].low, 290000);
});

test("pickGuideRows: empty catalogue gives []; relaxes to one store, then drops the band", () => {
  assert.deepEqual(pickGuideRows(catOf([])), []);
  const oneStore = [1, 2, 3, 4, 5].map((k) => card({ name: `S${k}`, storesUS: 1, marketUsd: k * 10000 }));
  assert.equal(pickGuideRows(catOf(oneStore)).length, 5);
  const offBand = [1, 2, 3].map((k) => card({ name: `B${k}`, storesUS: 1, marketUsd: 10000, lowUS: 10000 * (k + 2) }));
  assert.deepEqual(pickGuideRows(catOf(offBand)).map((r) => r.name), ["B3", "B2", "B1"]);
});

test("setTopRows: the set's most valuable printings; a wild ask shows the market instead", () => {
  const cards = [
    card({ name: "Top", marketUsd: 600000, lowUS: 5000000 }),
    card({ name: "Second", marketUsd: 300000, lowUS: 280000 }),
    card({ name: "Other set", setId: 2, marketUsd: 900000 }),
  ];
  const rows = setTopRows(catOf(cards), SETS[0]);
  assert.deepEqual(rows.map((r) => r.name), ["Top", "Second"]);
  assert.equal(rows[0].low, null);
  assert.equal(rows[1].low, 280000);
});

// ── 5. The 7-day column switch ───────────────────────────────────────────────
test("showMoveColumn: store counts until at least 3 rows really moved", () => {
  assert.equal(showMoveColumn([0, 0, 0, 0, 0].map((change7d) => ({ change7d }))), false);
  assert.equal(showMoveColumn([12.4, -3.1, 0, null, 0.01].map((change7d) => ({ change7d }))), false);
  assert.equal(showMoveColumn([12.4, -3.1, 0, 7.8, null].map((change7d) => ({ change7d }))), true);
});

// ── 6. Formatting ────────────────────────────────────────────────────────────
test("ogMoney: whole units from 100 up, cents below, each market's symbol", () => {
  assert.equal(ogMoney(69900), "US$699");
  assert.equal(ogMoney(1234), "US$12.34");
  assert.equal(ogMoney(398001), "US$3,980");
  assert.equal(ogMoney(249900, "UK"), "£2,499");
  assert.equal(ogMoney(295000, "EU"), "€2,950");
  assert.equal(ogMoney(null), "—");
});

test("clip, badgeText, ogDelta", () => {
  assert.equal(clip("Monkey.D.Luffy", 21), "Monkey.D.Luffy");
  assert.equal(clip("Charlotte Katakuri and friends", 10), "Charlotte…");
  assert.equal(badgeText({ variant: "Parallel · Manga · Alternate Art", printing: "manga" }), "Manga");
  assert.equal(badgeText({ variant: "Super Alternate Art", printing: "alt" }), "Super Alternate Art");
  assert.equal(badgeText({ variant: null, printing: "standard" }), "Standard");
  assert.equal(ogDelta(12.44).text, "+12.4%");
  assert.equal(ogDelta(-3.1).text, "-3.1%");
  assert.equal(ogDelta(0.01).text, "—");
  assert.equal(ogDelta(null).text, "—");
});

test("ogDate: a 3-letter month, never en-GB's 'Sept'", () => {
  assert.equal(ogDate("2025-09-30"), "30 Sep 2025");
  assert.equal(ogDate("2025-08-22T00:00:00.000Z"), "22 Aug 2025");
  assert.equal(ogDate(null), "");
  assert.equal(ogDate("nope"), "");
});

test("set titles: the edition goes to the eyebrow, three size steps, clipped at a word", () => {
  const long = "Starter Deck 3: The Seven Warlords of The Sea (Super Pre-Release Edition)";
  assert.deepEqual(splitEdition(long), { title: "Starter Deck 3: The Seven Warlords of The Sea", edition: "Super Pre-Release Edition" });
  assert.deepEqual(splitEdition("Romance Dawn"), { title: "Romance Dawn", edition: null });
  assert.equal(setTitleSize("Romance Dawn"), 58);
  assert.equal(setTitleSize("The World's Strongest Warriors"), 48);
  assert.equal(setTitleSize("Starter Deck 3: The Seven Warlords of The Sea"), 40);
  assert.equal(clipWords("Sea (Super Pre-Release Edition) and more words", 22), "Sea (Super…");
  assert.ok(!/-…$/.test(clipWords("Super Pre-Release Edition", 15)));
  assert.equal(clipWords("Short", 22), "Short");
});

test("set stats: the widest real row fits its 396px column; 'top card' goes first", () => {
  // The estimate is checked against satori: "US$13,000" draws 118px (est 119), "30 Sep 2025" 144 (146), "printings" 91 (103).
  assert.ok(statWidth(["US$13,000", "top card"]) >= 118);
  assert.ok(statWidth(["30 Sep 2025", "released"]) >= 144);
  const total = (xs: [string, string][]) => xs.reduce((w, x, i) => w + statWidth(x) + (i ? SET_STATS.gap : 0), 0);
  // The widest real sets on 2026-10-03: OP-PR (1,348 printings), OP11 (top card US$13,000), plus the longest date.
  for (const top of ["US$80.99", "US$1,895", "US$13,000", "US$99,999"]) {
    for (const n of ["17", "159", "1,348"]) {
      const row = fitStats([[n, "printings"], [top, "top card"], ["30 Sep 2025", "released"]]);
      assert.ok(total(row) <= SET_STATS.width, `${n} / ${top}: ${total(row)}px`);
      assert.equal(row[0][1], "printings");
      assert.ok(row.some(([, l]) => l === "released"), "the date is kept; the top card goes first");
    }
  }
  assert.equal(fitStats([["17", "printings"], ["US$80.99", "top card"], ["30 Sep 2025", "released"]]).length, 3);
});

test("ogPriceLines: the US listing leads; else EU, UK, …; else TCGplayer's market", () => {
  const p = (low: Partial<Record<Country, number>>, marketUsd: number | null = 1000) => ({
    low: Object.fromEntries(MARKETS.map((m) => [m, low[m] ?? null])) as Record<Country, number | null>,
    stores: Object.fromEntries(MARKETS.map((m) => [m, low[m] != null ? 2 : 0])) as Record<Country, number>,
    marketUsd,
  });
  const a = ogPriceLines(p({ US: 900, UK: 700, EU: 800 }));
  assert.deepEqual([a.head.kind, a.head.country, a.head.cents], ["listing", "US", 900]);
  assert.deepEqual(a.others.map((o) => o.country), ["UK", "EU"]);
  const b = ogPriceLines(p({ UK: 700, EU: 800 }));
  assert.deepEqual([b.head.kind, b.head.country], ["listing", "EU"]);
  assert.deepEqual(ogPriceLines(p({})).head, { kind: "reference", country: "US", cents: 1000, stores: 0 });
  assert.equal(ogPriceLines(p({}, null)).head.kind, "none");
});

test("ogPriceLines: a lone ask far above the market never leads; the market does and the ask is kept", () => {
  const p = (lowUS: number | null, marketUsd: number | null, storesUS = 1, lowUK: number | null = null) => ({
    low: Object.fromEntries(MARKETS.map((m) => [m, m === "US" ? lowUS : m === "UK" ? lowUK : null])) as Record<Country, number | null>,
    stores: Object.fromEntries(MARKETS.map((m) => [m, m === "US" ? storesUS : m === "UK" && lowUK != null ? 1 : 0])) as Record<Country, number>,
    marketUsd,
  });
  // DB, 2026-10-03: monkey-d-luffy-op05-119-sp-gold lowUS 5,000,000, market 1,300,000, 1 US store.
  const gold = ogPriceLines(p(5000000, 1300000));
  assert.deepEqual(gold.head, { kind: "reference", country: "US", cents: 1300000, stores: 0, ask: { country: "US", cents: 5000000, stores: 1 } });
  // 1.5× exactly still leads; no market means nothing to compare with.
  assert.equal(ogPriceLines(p(150000, 100000)).head.kind, "listing");
  assert.equal(ogPriceLines(p(5000000, null)).head.kind, "listing");
  // A UK lead is compared in pounds, not dollars.
  const uk = ogPriceLines(p(null, 10000, 0, 9000));
  assert.deepEqual([uk.head.kind, uk.head.country], ["listing", "UK"]);
  assert.equal(ogPriceLines(p(null, 10000, 0, 90000)).head.kind, "reference");
});

test("storesTracked: distinct sources with stock; the registry size before any import", () => {
  assert.equal(
    storesTracked({ storeOffers: [
      { source: "tcgplayer", market: "US", offers: 9, inStock: 9 },
      { source: "a", market: "US", offers: 3, inStock: 1 },
      { source: "a", market: "CA", offers: 3, inStock: 2 },
      { source: "b", market: "UK", offers: 3, inStock: 0 },
    ] }),
    2,
  );
  assert.ok(storesTracked(null) > 1);
});

// ── 7. Fonts ─────────────────────────────────────────────────────────────────
test("brand fonts are bundled as TTF/OTF (never WOFF2) and load", async () => {
  for (const f of OG_FONT_FILES) {
    const buf = fs.readFileSync(path.join(OG_FONT_DIR, f.file));
    assert.ok(isSfnt(buf), `${f.file} must be TTF/OTF`);
  }
  assert.equal(isSfnt(Buffer.from("wOF2xxxx")), false);
  const fonts = await loadOgFonts();
  assert.equal(fonts.length, OG_FONT_FILES.length);
  assert.deepEqual(await loadOgFonts(path.join(ROOT, "no-such-dir")), []);
  const cfg = fs.readFileSync(path.join(ROOT, "next.config.js"), "utf8");
  assert.match(cfg, /outputFileTracingIncludes:[^}]*opengraph-image[^}]*src\/lib\/og\/fonts/);
});

// ── 8. Render smoke test ─────────────────────────────────────────────────────
test("GuideImage and FallbackImage render to PNGs under 1 MB with the bundled fonts", async () => {
  // tsx compiles JSX in the classic runtime (React.createElement); Next uses the automatic one.
  (globalThis as unknown as { React: typeof React }).React = React;
  const { GuideImage, FallbackImage, SetImage, CardImage } = await import("../src/lib/og/compose");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImageResponse } = require("next/dist/compiled/@vercel/og/index.node.js");
  const fonts = await loadOgFonts();
  const rows = pickGuideRows(catOf([1, 2, 3, 4, 5].map((k) => card({ name: `Monkey.D.Luffy ${k}`, marketUsd: k * 100000, variant: "Parallel · Manga · Alternate Art" }))));
  const els = [
    React.createElement(GuideImage, { rows, cards: 7255, stores: 231, variant: "home" }),
    React.createElement(FallbackImage),
    React.createElement(SetImage, { code: "OP18", name: "The Dominance of God", kindLabel: "Booster set", printings: 21, topCard: null, released: "20 Nov 2026", upcoming: true, rows: [], preview: [] }),
    React.createElement(CardImage, {
      name: "Shanks", variant: null, printing: "manga", printingLabel: "Manga", rarity: "SEC", rarityLabel: "Secret Rare", number: "OP01-120",
      setName: "Romance Dawn", art: null, marketUsd: 399874, head: { kind: "listing", country: "US", cents: 285000, stores: 2 }, others: [{ country: "UK", cents: 249900 }],
    }),
  ];
  for (const el of els) {
    const res = new ImageResponse(el, { width: 1200, height: 630, fonts });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    assert.ok(buf.length > 10_000 && buf.length < 1_000_000, `PNG size ${buf.length}`);
  }
});
