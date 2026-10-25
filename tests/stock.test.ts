// Stock first (owner's creator feedback, 2026-10-25): the stock line every card and product page leads with, the history-built lists
// (back in stock, price moves), older sets still in stock, the featuring rule (the newest released set leads, never a pre-order), and
// the three new pages rendered from data/public: valid JSON-LD, honest empty states, no copy the data cannot back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import type { ProductCardData } from "../src/lib/data";
import { hotPicks } from "../src/lib/hot-picks";
import { HOT_SETS, hotSetsByFeature } from "../src/lib/popular";
import { dayOf, updatePriceHistory, type PriceHistory } from "../src/lib/price-history";
import { featureOrder, featureSort, newestReleasedSet } from "../src/lib/release";
import { identify, isIdentity } from "../src/lib/sealed-title";
import { SET_BY_CODE } from "../src/lib/sets";
import { staticSitemap } from "../src/lib/sitemap";
import {
  backInStock,
  groupOlderInStock,
  MIN_DAYS_MOVES,
  olderCutoff,
  olderSets,
  popularSetCodes,
  priceMoves,
  stockHeadline,
} from "../src/lib/stock";
import { StockFilter } from "../src/components/StockFilter";
import { jsonLdBlocks, nodesOf, validateJsonLd } from "./helpers/jsonld";

(globalThis as unknown as { React: typeof React }).React = React;

const TODAY = "2026-10-25";
const D0 = dayOf("2026-10-10");

/** A history from per-day rows: day offset → [slug, cents | null, stores][] (every slug every day). */
function hist(days: [string, number | null, number][][], market = "US"): PriceHistory {
  let h: PriceHistory | null = null;
  days.forEach((rows, i) => (h = updatePriceHistory(h, rows.map(([slug, cents, stores]) => ({ market, slug, cents, stores })), D0 + i)));
  return h!;
}

// ─── The stock line ───────────────────────────────────────────────────────────

test("stockHeadline: independent stores of the stores that list it; TCGplayer apart, never counted; sold out said plainly", () => {
  assert.deepEqual(stockHeadline({ inStockStores: 12, listedStores: 15, marketplaceOpen: true }), { text: "In stock at 12 of 15 stores", open: true, tcg: true });
  assert.equal(stockHeadline({ inStockStores: 3, listedStores: 4, marketplaceOpen: false }, true).text, "Pre-order at 3 of 4 stores");
  assert.equal(stockHeadline({ inStockStores: 1, listedStores: 1, marketplaceOpen: false }).text, "In stock at 1 of 1 store");
  assert.deepEqual(stockHeadline({ inStockStores: 0, listedStores: 0, marketplaceOpen: true }), { text: "On TCGplayer only: no store has it in stock", open: true, tcg: false });
  assert.equal(stockHeadline({ inStockStores: 0, listedStores: 5, marketplaceOpen: false }).text, "Sold out at all 5 stores that list it");
  assert.equal(stockHeadline({ inStockStores: 0, listedStores: 1, marketplaceOpen: false }).text, "Sold out at the 1 store that lists it");
  assert.equal(stockHeadline({ inStockStores: 0, listedStores: 0, marketplaceOpen: false }).text, "Not in stock anywhere we track");
  for (const t of ["In stock at 12 of 15 stores", "Sold out at all 5 stores that list it"]) assert.equal(findBannedCopy(t), null);
});

// ─── Back in stock ────────────────────────────────────────────────────────────

test("backInStock: nothing open in one snapshot, open in a later one and still open; a first snapshot is never a return", () => {
  const filler = Array.from({ length: 40 }, (_, i): [string, number | null, number] => [`f${i}`, 1000, 1]);
  const h = hist([
    [["a", null, 0], ["b", 5000, 2], ["c", null, 0], ...filler],
    [["a", 6000, 1], ["b", 5000, 2], ["c", null, 0], ["new", 7000, 3], ...filler],
  ]);
  assert.deepEqual(backInStock(h, "US").map((b) => b.slug), ["a"], "a came back; b never left; c is still out; new is new, not back");
  assert.equal(backInStock(h, "US")[0].stores, 1);
  // one day of snapshots: nothing can be said
  assert.deepEqual(backInStock(hist([[["a", 6000, 1]]]), "US"), []);
  assert.deepEqual(backInStock(null, "US"), []);
  // gone again in the last snapshot: not listed
  const gone = hist([[["a", null, 0], ...filler], [["a", 6000, 1], ...filler], [["a", null, 0], ...filler]]);
  assert.deepEqual(backInStock(gone, "US"), []);
});

test("backInStock: a day when a large share of the market 'came back' is a failed read the day before, not restocks", () => {
  const many = (cents: number | null) => Array.from({ length: 60 }, (_, i): [string, number | null, number] => [`p${i}`, cents, cents ? 1 : 0]);
  const h = hist([many(1000), many(null), many(1000)]);
  assert.deepEqual(backInStock(h, "US"), []);
});

// ─── Price moves ──────────────────────────────────────────────────────────────

test("priceMoves: week over week, both days open, ≥10% and ≥5.00, within ×2, popular products only; nothing under 8 days", () => {
  const day = (i: number): [string, number | null, number][] => [
    ["up", i === 7 ? 13000 : 10000, 4],
    ["down", i === 7 ? 8500 : 10000, 3],
    ["small", i === 7 ? 1300 : 1000, 2], // +30% but only 3.00
    ["wobble", i === 7 ? 10500 : 10000, 2], // +5%
    ["misfiled", i === 7 ? 30000 : 10000, 1], // ×3
    ["was-out", i === 0 ? null : i === 7 ? 15000 : 10000, 1],
    ["not-popular", i === 7 ? 20000 : 10000, 1],
  ];
  const h = hist(Array.from({ length: MIN_DAYS_MOVES }, (_, i) => day(i)));
  const slugs = ["up", "down", "small", "wobble", "misfiled", "was-out"];
  assert.deepEqual(
    priceMoves(h, "US", slugs).map((m) => [m.slug, m.pct]),
    [["up", 30], ["down", -15]],
  );
  assert.equal(priceMoves(h, "US", slugs)[1].stores, 3);
  const short = hist(Array.from({ length: MIN_DAYS_MOVES - 1 }, (_, i) => day(i)));
  assert.deepEqual(priceMoves(short, "US", slugs), [], "7 days: no week-over-week move yet");
});

test("popularSetCodes: the released hot sets, the newest released and the most stocked; never a set not out yet", () => {
  const codes = popularSetCodes(HOT_SETS, new Map([["ltr", 40], ["trk", 99], ["blb", 10]]), TODAY);
  assert.ok(!codes.includes("trk"), "Star Trek is not out on 2026-10-25");
  for (const c of ["fra", "hob", "ltr", "blb"]) assert.ok(codes.includes(c), c);
  assert.equal(codes[0], "fra");
});

// ─── Older sets ───────────────────────────────────────────────────────────────

test("older sets: released 18+ months ago; The Lord of the Rings is one, its Collector Booster Box is identified; TCGplayer-only is left out", () => {
  assert.equal(olderCutoff(TODAY), "2025-04-25");
  const codes = olderSets(TODAY).map((s) => s.code);
  assert.ok(codes.includes("ltr") && !codes.includes("fra") && !codes.includes("fin"));
  assert.equal(SET_BY_CODE.get("ltr")!.releaseDate, "2023-06-23");
  const id = identify("The Lord of the Rings: Tales of Middle-earth Collector Booster Box");
  assert.ok(isIdentity(id) && id.groupKey === "ltr|collector-booster-box");
  const card = (o: Partial<ProductCardData>) => ({ slug: "x", name: "x", productType: "Collector Booster Box", setCode: "ltr", inStockStores: 2, listedStores: 3, marketplaceOpen: false, ...o });
  const groups = groupOlderInStock(
    [
      card({ slug: "ltr-cbb", name: "LTR Collector Booster Box", inStockStores: 3 }),
      card({ slug: "ltr-bundle", name: "LTR Bundle", productType: "Bundle", inStockStores: 5 }),
      card({ slug: "ltr-pack", name: "LTR Collector Booster Pack", productType: "Collector Booster Pack", inStockStores: 9 }),
      card({ slug: "ltr-tcg", name: "LTR Draft Booster Box", productType: "Draft Booster Box", inStockStores: 0, marketplaceOpen: true }),
      card({ slug: "pip-cbb", name: "Fallout CBB", setCode: "pip", inStockStores: 20 }),
      card({ slug: "fra-box", name: "RF box", setCode: "fra", productType: "Play Booster Box", inStockStores: 30 }),
    ],
    TODAY,
  );
  assert.deepEqual(groups.map((g) => g.set.code), ["pip", "ltr"], "most store stock first; Reality Fracture is not older");
  assert.deepEqual(groups[1].items.map((c) => c.slug), ["ltr-bundle", "ltr-cbb"], "packs and TCGplayer-only left out; most stores first");
});

// ─── Featuring balance ─────────────────────────────────────────────────────────

test("featuring: the newest released set leads, the pre-order set second; by date, so it moves on by itself", () => {
  assert.equal(newestReleasedSet(TODAY)!.code, "fra");
  assert.deepEqual(hotSetsByFeature(TODAY).slice(0, 2), ["fra", "trk"]);
  assert.equal(hotSetsByFeature("2026-11-20")[0], "trk", "Star Trek leads once it is out");
  assert.deepEqual(featureOrder(["trk", "hob", "msh"], TODAY), ["hob", "trk", "msh"], "never a pre-order first, even without the newest set");
  assert.deepEqual(featureOrder(["trk"], TODAY), ["trk"]);
  const p = (slug: string, setCode: string, productType = "Play Booster Box"): ProductCardData => ({
    slug, name: slug, productType, setCode, imageUrl: null, lowestPriceCents: 10000, inStockStores: 3, listedStores: 4, marketplaceOpen: false, medianOpenCents: null, releaseDate: SET_BY_CODE.get(setCode)!.releaseDate,
  });
  assert.deepEqual(featureSort([p("t", "trk"), p("h", "hob"), p("f", "fra")], TODAY).map((x) => x.slug), ["f", "t", "h"]);
  const picks = hotPicks([p("trk-box", "trk")], [p("hob-box", "hob"), p("fra-box", "fra"), p("fin-box", "fin")], TODAY);
  assert.deepEqual(picks.map((x) => x.slug), ["fra-box", "trk-box", "hob-box"], "Reality Fracture first, Star Trek's pre-order second");
});

// ─── The filter ───────────────────────────────────────────────────────────────

test("StockFilter: in stock only by default; the sold-out list is in the server HTML, hidden", () => {
  const html = renderToStaticMarkup(React.createElement(StockFilter, { soldCount: 3, soldOut: React.createElement("p", null, "SOLD-LIST"), children: React.createElement("p", null, "OPEN-LIST") }));
  assert.match(html, /aria-pressed="true"[^>]*>.*In stock only/);
  assert.match(html, /3 sold out hidden/);
  assert.match(html, /OPEN-LIST/);
  assert.match(html, /<div hidden="" data-sold-out=""><p>SOLD-LIST<\/p><\/div>/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(StockFilter, { soldCount: 0, soldOut: null, children: "x" })), /In stock only/, "nothing to filter: no toggle");
});

// ─── The pages, from data/public ──────────────────────────────────────────────

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("the stock pages render from data/public: force-dynamic, breadcrumbs JSON-LD, honest states, copy the data backs", async () => {
  process.env.PUBLIC_DATA_MODE = "files";
  const R = require("react") as { cache?: unknown };
  if (typeof R.cache !== "function") R.cache = (fn: unknown) => fn;
  const h = JSON.parse(readFileSync("data/public/price-history.json", "utf8")) as PriceHistory;
  const days = h.through - h.since + 1;
  for (const [route, history] of [["back-in-stock", true], ["price-moves", true], ["out-of-print", false]] as const) {
    const src = readFileSync(`src/app/[region]/${route}/page.tsx`, "utf8");
    assert.match(src, /export const dynamic = "force-dynamic"/, route);
    assert.doesNotMatch(src, /cookies\(|headers\(|searchParams/, `${route}: one cached copy`);
    const mod = (await import(`../src/app/[region]/${route}/page`)) as { default: (a: { params: { region: string } }) => Promise<React.ReactElement> };
    const html = renderToStaticMarkup(await mod.default({ params: { region: "us" } }));
    const { docs, errors } = jsonLdBlocks(html);
    assert.deepEqual(errors, [], route);
    for (const d of docs) assert.deepEqual(validateJsonLd(d), [], route);
    assert.ok(docs.flatMap(nodesOf).some((n) => n["@type"] === "BreadcrumbList"), `${route}: breadcrumbs`);
    const t = text(html);
    assert.equal(findBannedCopy(t, { history }), null, `${route}: "${findBannedCopy(t, { history })}"`);
    assert.doesNotMatch(t, /investment|will rise|guaranteed/i, route);
    if (route === "price-moves" && days < MIN_DAYS_MOVES) assert.match(t, /Not enough history yet: a week-over-week move needs 8 daily snapshots, and MTG Compare has \d+/);
    if (route === "back-in-stock" && days < 2) assert.match(t, /Not enough history yet/);
    if (route === "out-of-print") assert.match(t, /The Lord of the Rings: Tales of Middle-earth/, "LTR is stocked in the US today");
  }
});

test("the sitemap lists the three stock pages in every region, with the import's lastmod", () => {
  const m = new Date("2026-10-24T00:00:00Z");
  const sm = staticSitemap({ US: m, AU: m });
  for (const p of ["back-in-stock", "price-moves", "out-of-print"]) {
    const e = sm.find((x) => x.url.endsWith(`/us/${p}`));
    assert.ok(e, p);
    assert.equal(e!.lastModified, m);
  }
});

test("the stock pages' titles and descriptions fit (60 / 160) in every region", async () => {
  const { seoCopy, shownTitle, SEO_TITLE_MAX, SEO_DESCRIPTION_MAX } = await import("../src/lib/seo-titles");
  const { REGION_LIST } = await import("../src/lib/regions");
  for (const r of REGION_LIST) {
    for (const t of [seoCopy.backTitle(r), seoCopy.movesTitle(r), seoCopy.oopTitle(r)]) {
      const shown = typeof t === "string" ? t : t.absolute;
      assert.ok((typeof t === "string" ? shownTitle(t) : t.absolute).length <= SEO_TITLE_MAX, shown);
      assert.equal(findBannedCopy(shown, { history: true }), null);
    }
    for (const d of [seoCopy.backDescription(r, 0), seoCopy.backDescription(r, 12), seoCopy.movesDescription(r), seoCopy.oopDescription(r, 20, 300)]) assert.ok(d.length <= SEO_DESCRIPTION_MAX, `${d.length}: ${d}`);
  }
});
