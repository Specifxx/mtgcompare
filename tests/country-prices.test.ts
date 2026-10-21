// "Pokémon booster box prices by country" (/guides/pokemon-booster-box-prices-by-country) and the Build & Battle guide's loader:
// the pure selection and sentences on fixtures, the body rendered as a crawler sees it (every market in its own currency, never
// converted, US MSRP on the US row only, links into every region, no ad unit), and both loaders run end to end through the public
// data files (the site's default source), so the engine answers their query shapes without falling through to Neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { money } from "../src/lib/format";
import { packsFor, perPackCents } from "../src/lib/packs";
import { preorderPath } from "../src/lib/preorder-guides";
import { REGION_LIST, isRegion, type Market } from "../src/lib/regions";
import { RRP_NOTE, usMsrpCents } from "../src/lib/rrp";
import { TYPE_BY_SLUG } from "../src/lib/sealed-title";
import { SET_BY_CODE, SET_BY_SLUG } from "../src/lib/sets";
import { BOX, candidateSets, COUNTRY_GUIDE, countryFaqs, leadSummary, marketLines, shownSets, whereOpen, type MarketCard } from "../src/content/guides/country-prices";
import { countryOutline, CountryBody } from "../src/content/guides/country-prices-body";
import type { CountryData } from "../src/content/guides/country-prices-data";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { resetPublicData } from "../src/lib/public-data/store";

(globalThis as unknown as { React: typeof React }).React = React;

const TODAY = "2026-10-16";
const CHECKED = "2026-10-15T23:18:41.716Z";

const card = (market: Market, setCode: string, productType: string, cents: number | null, stores = 3, marketplace = false): MarketCard => ({
  market,
  slug: `${SET_BY_CODE.get(setCode)!.slug}-${productType.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  name: `${SET_BY_CODE.get(setCode)!.name} ${productType}`,
  productType,
  setCode,
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 2,
  marketplaceOpen: marketplace,
  medianOpenCents: null,
  releaseDate: SET_BY_CODE.get(setCode)!.releaseDate,
});

// Delta Reign (pre-order) open in five markets, Pitch Black in all seven, Chaos Rising in three; Delta Reign's ETB and bundle in some.
const CARDS: MarketCard[] = [
  card("AU", "me6", BOX, 33500, 9),
  card("US", "me6", BOX, 19990, 5, true),
  card("CA", "me6", BOX, 27999, 6),
  card("EU", "me6", BOX, 21990, 1),
  card("SG", "me6", BOX, 16990, 1),
  ...(["AU", "US", "UK", "CA", "NZ", "EU", "SG"] as const).map((m, i) => card(m, "me5", BOX, 13000 + i * 2500, 5 + i)),
  card("AU", "me4", BOX, 26995, 18),
  card("UK", "me4", BOX, 16000, 8),
  card("US", "me4", BOX, 15049, 22, true),
  card("AU", "me6", "Elite Trainer Box", 16999, 8),
  card("US", "me6", "Elite Trainer Box", 8999, 7, true),
  card("AU", "me6", "Booster Bundle", 8000, 7),
  card("SG", "me6", "Booster Bundle", 5990, 1),
];
const DATA: CountryData = { today: TODAY, checked: CHECKED, sets: ["me6", "me5", "me4"], cards: CARDS };

const render = (data: CountryData = DATA) => renderToStaticMarkup(React.createElement(CountryBody, { data }));
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

test("the page's facts: a title that fits and says Australia, a description under 160, editorial dates, its region-less path", () => {
  assert.ok(COUNTRY_GUIDE.title.length <= 65, `${COUNTRY_GUIDE.title.length}`);
  assert.match(COUNTRY_GUIDE.title, /^Pokémon booster box prices by country/);
  assert.match(COUNTRY_GUIDE.title, /Australia/);
  assert.ok(COUNTRY_GUIDE.description.length <= 160, `${COUNTRY_GUIDE.description.length}`);
  for (const d of [COUNTRY_GUIDE.published, COUNTRY_GUIDE.updated]) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(COUNTRY_GUIDE.path, `/guides/${COUNTRY_GUIDE.slug}`);
  assert.equal(findBannedCopy(`${COUNTRY_GUIDE.title} ${COUNTRY_GUIDE.description}`), null);
  assert.doesNotMatch(COUNTRY_GUIDE.title, /\d+\s+stores?/, "no store count in the title");
});

test("candidate sets: the soonest upcoming booster-box set first, then the newest released ones, never a set sold without a box", () => {
  const c = candidateSets(TODAY);
  assert.equal(c[0].code, "me6");
  assert.ok(c.length >= 4);
  for (const s of c) assert.ok(!s.noBoosterBox, s.name);
  assert.ok(c.slice(1).every((s) => s.releaseDate <= TODAY));
  assert.ok(candidateSets("2026-11-06")[0].releaseDate <= "2026-11-06", "after release, the newest released set leads");
});

test("market lines: every market in REGION_LIST order, its cheapest OPEN listing of the set and type, per pack from packs.ts", () => {
  const lines = marketLines([...CARDS, card("AU", "me6", BOX, 30000, 0), card("AU", "me6", BOX, 99999, 2)], "me6", BOX);
  assert.deepEqual(
    lines.map((l) => l.r.region),
    REGION_LIST.map((r) => r.region),
  );
  assert.equal(lines[0].p?.lowestPriceCents, 33500, "a closed listing (no store, no marketplace) is never the cheapest");
  assert.equal(lines[0].perPack, perPackCents(33500, packsFor("booster-box", "me6")));
  assert.equal(lines.find((l) => l.r.region === "uk")!.p, null);
  assert.equal(lines.find((l) => l.r.region === "us")!.p?.lowestPriceCents, 19990);
  // a set with no box anywhere is skipped; the order of the candidates is kept
  assert.deepEqual(shownSets(CARDS, ["me6", "cel30", "me5", "me4", "me3"]), ["me6", "me5", "me4"]);
  assert.equal(whereOpen(card("US", "me6", BOX, 1, 5, true)), "5 stores + TCGplayer");
  assert.equal(whereOpen(card("US", "me6", BOX, 1, 0, true)), "TCGplayer");
});

test("the lead sentence is currency-free but for each market's own per-pack price, and never names a cheapest country", () => {
  const lines = marketLines(CARDS, "me6", BOX);
  const s = leadSummary(SET_BY_CODE.get("me6")!, lines, TODAY)!;
  assert.match(s, /open for pre-order in 5 of the 7 markets we compare \(Australia, the US, Canada, Europe and Singapore\)/);
  assert.match(s, /Australia has the most stores with it open \(9\)/);
  for (const l of lines.filter((x) => x.p)) assert.ok(s.includes(`${money(l.perPack, l.r.market)} in ${l.r.inName}`), l.r.region);
  assert.doesNotMatch(s, /cheapest (country|market)|cheaper in/i);
  assert.equal(leadSummary(SET_BY_CODE.get("me6")!, marketLines([], "me6", BOX), TODAY), null);
});

test("the body: every market's price in its own currency, US MSRP on the US row only (with RRP_NOTE), nothing converted, no ad unit", () => {
  const html = render();
  const t = text(html);
  for (const code of DATA.sets) {
    for (const l of marketLines(CARDS, code, BOX).filter((x) => x.p)) {
      assert.ok(t.includes(money(l.p!.lowestPriceCents, l.r.market)), `${code} ${l.r.region} price`);
      assert.ok(t.includes(money(l.perPack, l.r.market)), `${code} ${l.r.region} per pack`);
    }
  }
  // the US list price, US rows only: once per box table whose set has one, once in the ETB table, and the note beside them
  const usBoxMsrp = money(usMsrpCents("booster-box", "me6"), "US");
  assert.equal((t.match(new RegExp(`US MSRP ${usBoxMsrp.replace("$", "\\$")}`, "g")) ?? []).length, DATA.sets.filter((c) => marketLines(CARDS, c, BOX).find((l) => l.r.market === "US")?.p).length);
  assert.ok(t.includes(RRP_NOTE));
  assert.ok(!/MSRP/.test(t.replace(/US MSRP \$[\d.,]+/g, "").split(RRP_NOTE).join("")), "MSRP appears only as a US row's label and its note");
  // never converted
  assert.doesNotMatch(t, /≈|~\s?\$|converted to|in US\$|exchange rate of/i);
  assert.match(t, /We don’t convert currencies/);
  // no eBay or TCGplayer unit or link on this page
  assert.doesNotMatch(html, /data-ad=|ebay\.|tcgplayer\.com/i);
  assert.equal(findBannedCopy(t), null);
  assert.doesNotMatch(t, /pull[-\s]*rates?|expected value|\bEV\b|invest/i);
  assert.doesNotMatch(t, /\[VERIFY|\[live/i);
  // the lead set is a pre-order: its rows say so, a market with none says so plainly
  assert.match(t, /Cheapest pre-order/);
  assert.match(t, /No pre-orders right now/);
});

test("the body links into every region: product, pre-order, type, set, cheapest-per-pack and release pages that exist", () => {
  const html = render();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const r of REGION_LIST) {
    for (const p of ["/type/booster-boxes", "/cheapest-packs", "/releases"]) assert.ok(hrefs.includes(`/${r.region}${p}`), `${r.region}${p}`);
    assert.ok(hrefs.includes(preorderPath(r.region, "me6")!), `${r.region}: the Delta Reign pre-order page`);
  }
  for (const l of marketLines(CARDS, "me5", BOX)) assert.ok(hrefs.includes(`/${l.r.region}/p/${l.p!.slug}`), `${l.r.region}: Pitch Black's box`);
  for (const h of hrefs) {
    assert.ok(h.startsWith("/"), `internal only: ${h}`);
    const [region, section, slug] = h.split("/").filter(Boolean);
    assert.ok(isRegion(region), `${h}: every link lands in a region`);
    if (section === "type") assert.ok(TYPE_BY_SLUG.has(slug), h);
    if (section === "sets") assert.ok(SET_BY_SLUG.has(slug), h);
  }
});

test("the outline: unique anchors, the FAQ last, and it still renders with no data at all", () => {
  const ids = countryOutline(DATA).sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 3), ["lead-set", "recent-sets", "etb-and-bundle"]);
  assert.equal(ids.at(-1), "faq");
  const empty = render({ today: TODAY, checked: null, sets: [], cards: [] });
  assert.doesNotMatch(text(empty), /Cheapest pre-order/);
  assert.match(text(empty), /How to compare prices across countries/);
});

test("the FAQ: no country ranked, live AU and US prices each in their own currency, tax said plainly", () => {
  const lead = { set: SET_BY_CODE.get("me6")!, lines: marketLines(CARDS, "me6", BOX) };
  const faqs = countryFaqs(lead, TODAY);
  const all = faqs.map((f) => `${f.q} ${f.a}`).join(" ");
  assert.match(faqs[0].a, /We don’t convert currencies, so we don’t rank countries/);
  assert.ok(faqs[0].a.includes(money(33500, "AU")) && faqs[0].a.includes(money(19990, "US")));
  assert.match(all, /about twice a day/);
  assert.match(all, /GST/);
  assert.equal(findBannedCopy(all), null);
  assert.doesNotMatch(countryFaqs(null, TODAY)[0].a, /Right now/, "no live line without data");
});

// ─── The loaders, end to end through the public data files ─────────────────────

const T0 = new Date("2026-10-15T23:18:41.716Z");
function fixtureDir(): string {
  const products = [
    { id: "p-me6-box", groupKey: "me6|booster-box", slug: "delta-reign-booster-box", name: "Delta Reign Booster Box", productType: "Booster Box", setCode: "me6", imageUrl: null, createdAt: T0 },
    { id: "p-me6-etb", groupKey: "me6|etb", slug: "delta-reign-elite-trainer-box", name: "Delta Reign Elite Trainer Box", productType: "Elite Trainer Box", setCode: "me6", imageUrl: null, createdAt: T0 },
    { id: "p-me6-bb", groupKey: "me6|build-battle", slug: "delta-reign-build-battle-box", name: "Delta Reign Build & Battle Box", productType: "Build & Battle Box", setCode: "me6", imageUrl: null, createdAt: T0 },
    { id: "p-me5-box", groupKey: "me5|booster-box", slug: "pitch-black-booster-box", name: "Pitch Black Booster Box", productType: "Booster Box", setCode: "me5", imageUrl: null, createdAt: T0 },
    { id: "p-me5-bb", groupKey: "me5|build-battle", slug: "pitch-black-build-battle-box", name: "Pitch Black Build & Battle Box", productType: "Build & Battle Box", setCode: "me5", imageUrl: null, createdAt: T0 },
    { id: "p-me5-bun", groupKey: "me5|booster-bundle", slug: "pitch-black-booster-bundle", name: "Pitch Black Booster Bundle", productType: "Booster Bundle", setCode: "me5", imageUrl: null, createdAt: T0 },
  ];
  const stat = (productId: string, market: string, cents: number, inStock: number, marketplaceOpen = false) => ({
    productId,
    market,
    lowestPriceCents: cents,
    inStockStores: inStock,
    listedStores: inStock + 1,
    marketplaceOpen,
    medianOpenCents: null,
  });
  const tables: Tables = {
    Product: products,
    Offer: [],
    ProductStat: [
      stat("p-me6-box", "AU", 33500, 9),
      stat("p-me6-box", "US", 19990, 5, true),
      stat("p-me6-box", "UK", 30000, 0), // listed, sold out everywhere: not open
      stat("p-me6-etb", "AU", 16999, 8),
      stat("p-me6-bb", "AU", 3999, 2),
      stat("p-me5-box", "AU", 29999, 17),
      stat("p-me5-box", "NZ", 35999, 5),
      stat("p-me5-bb", "AU", 7900, 2),
      stat("p-me5-bun", "AU", 5499, 9),
    ],
    StoreStat: [{ store: "pokebox", market: "AU", listed: 5, inStock: 4, lastOkAt: T0, lastError: null, dormant: false, updatedAt: T0 }],
    EbayListing: [],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-country-"));
  for (const [name, body] of buildPublicFiles(tables, { generatedAt: T0, source: "test" })) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("both new loaders run on the public data files alone (no Neon), with the shapes the pages render", async () => {
  const saved = { mode: process.env.PUBLIC_DATA_MODE, dir: process.env.PUBLIC_DATA_DIR, db: process.env.DATABASE_URL, dc2: process.env.DC2 };
  process.env.PUBLIC_DATA_MODE = "files";
  process.env.PUBLIC_DATA_DIR = fixtureDir();
  // An unreachable database: a query the file engine refused would fall through to it and fail the test.
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none";
  delete process.env.DC2;
  resetPublicData();
  try {
    const { loadCountryData } = await import("../src/content/guides/country-prices-data");
    const d = await loadCountryData(new Date(`${TODAY}T12:00:00Z`));
    assert.deepEqual(d.sets, ["me6", "me5"], "the sets with a box open somewhere, the upcoming one first");
    assert.equal(d.checked, T0.toISOString());
    const key = (c: MarketCard) => `${c.market} ${c.slug} ${c.lowestPriceCents}`;
    assert.deepEqual(d.cards.map(key).sort(), [
      "AU delta-reign-booster-box 33500",
      "AU delta-reign-elite-trainer-box 16999",
      "AU pitch-black-booster-box 29999",
      "NZ pitch-black-booster-box 35999",
      "US delta-reign-booster-box 19990",
    ]);
    const { loadGuideData } = await import("../src/content/guides/data");
    const { REGIONS } = await import("../src/lib/regions");
    const g = await loadGuideData("pokemon-build-and-battle-box", REGIONS.au, new Date(`${TODAY}T12:00:00Z`));
    assert.deepEqual(Object.keys(g.bySet).sort(), ["me5", "me6"]);
    assert.equal(g.bySet.me6[0].lowestPriceCents, 3999);
    assert.deepEqual(
      g.cards.map((c) => c.productType).sort(),
      ["Booster Box", "Booster Bundle", "Build & Battle Box"],
      "Pitch Black (the newest released set with a box open) beside its bundle and booster box",
    );
  } finally {
    for (const [k, v] of Object.entries({ PUBLIC_DATA_MODE: saved.mode, PUBLIC_DATA_DIR: saved.dir, DATABASE_URL: saved.db, DC2: saved.dc2 })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetPublicData();
  }
});
