// "Magic booster box prices by country" (/guides/magic-booster-box-prices-by-country): the pure selection on fixtures, the body as a
// crawler sees it (every market in its own currency, never converted), and the loaders (by-country, a guide's, a post's) run end to
// end through the public data files (the site's default source), so the engine answers their query shapes without falling to Neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findBannedCopy } from "../src/lib/copy-rules";
import { REGION_LIST, type Market } from "../src/lib/regions";
import { COUNTRY_GUIDE, countryFaqs, marketLines, shownSets, whereOpen, type MarketCard } from "../src/content/guides/country-prices";
import { CountryBody } from "../src/content/guides/country-prices-body";
import { buildPublicFiles, type Tables } from "../src/lib/public-data/export";
import { resetPublicData } from "../src/lib/public-data/store";

(globalThis as unknown as { React: typeof React }).React = React;

const TODAY = "2026-10-21";
const card = (market: Market, setCode: string, name: string, cents: number, stores = 3, marketplace = false): MarketCard => ({
  market,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  productType: "x",
  setCode,
  imageUrl: null,
  lowestPriceCents: cents,
  inStockStores: stores,
  listedStores: stores + 1,
  marketplaceOpen: marketplace,
  medianOpenCents: null,
  releaseDate: null,
});

const CARDS: MarketCard[] = [
  ...REGION_LIST.map((r, i) => card(r.market, "fra", "Reality Fracture Play Booster Box", 15000 + i * 1000, 3 + i)),
  ...REGION_LIST.slice(0, 3).map((r, i) => card(r.market, "fra", "Reality Fracture Collector Booster Box", 30000 + i * 1000)),
  card("US", "hob", "The Hobbit Play Booster Box", 14000, 4, true),
  card("UK", "hob", "The Hobbit Play Booster Box", 12000, 2),
  card("AU", "spm", "Marvel's Spider-Man Play Booster Box", 20000), // one market only: not shown
];

test("the registry entry: a /guides path, a description that fits", () => {
  assert.equal(COUNTRY_GUIDE.path, `/guides/${COUNTRY_GUIDE.slug}`);
  assert.ok(COUNTRY_GUIDE.description.length <= 160);
  assert.equal(findBannedCopy(`${COUNTRY_GUIDE.title} ${COUNTRY_GUIDE.description}`), null);
});

test("selection: sets open in two or more markets, newest first; lines in REGION_LIST order; per pack only when certain", () => {
  assert.deepEqual(shownSets(CARDS), ["fra", "hob"]);
  const lines = marketLines(CARDS, "fra", "collector-box");
  assert.deepEqual(lines.map((l) => l.r.market), REGION_LIST.map((r) => r.market));
  assert.equal(lines[0].perPack, 2500, "30000 / 12");
  assert.equal(marketLines(CARDS, "fra", "play-box")[0].perPack, null);
  assert.equal(whereOpen({ inStockStores: 0, marketplaceOpen: true }), "TCGplayer");
});

test("the body: every market in its own currency, no ranking of countries, no banned copy", () => {
  const html = renderToStaticMarkup(React.createElement(CountryBody, { data: { today: TODAY, checked: null, sets: shownSets(CARDS), cards: CARDS } }));
  const t = html.replace(/<[^>]+>/g, " ");
  for (const r of REGION_LIST) assert.ok(t.includes(r.name), r.name);
  for (const sym of ["A$", "£", "€", "S$", "C$", "NZ$"]) assert.ok(t.includes(sym), sym);
  assert.doesNotMatch(t, /cheapest country is|cheapest in (?:the )?(?:US|UK|Australia)/i);
  assert.equal(findBannedCopy(t), null);
  for (const f of countryFaqs({ name: "Reality Fracture", lines: marketLines(CARDS, "fra", "play-box") })) assert.equal(findBannedCopy(`${f.q} ${f.a}`), null);
});

// ─── The loaders, end to end through the public data files ─────────────────────

const T0 = new Date("2026-10-20T23:18:41.716Z");
function fixtureDir(): string {
  const p = (id: string, name: string, productType: string, setCode: string) => ({ id, groupKey: id, slug: id, name, productType, setCode, imageUrl: null, createdAt: T0 });
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
    Product: [
      p("fra-play", "Reality Fracture Play Booster Box", "Play Booster Box", "fra"),
      p("fra-coll", "Reality Fracture Collector Booster Box", "Collector Booster Box", "fra"),
      p("trk-bundle", "Star Trek Bundle", "Bundle", "trk"),
      p("trk-deck", "Star Trek Commander Deck - Klingon Fury", "Commander Deck", "trk"),
    ],
    Offer: [],
    ProductStat: [
      stat("fra-play", "AU", 24999, 9),
      stat("fra-play", "US", 15999, 5, true),
      stat("fra-play", "UK", 13000, 0), // listed, sold out: not open
      stat("fra-coll", "AU", 39999, 3),
      stat("fra-coll", "NZ", 45999, 2),
      stat("trk-bundle", "US", 6499, 4),
      stat("trk-deck", "UK", 5999, 2),
    ],
    StoreStat: [{ store: "store-a", market: "AU", listed: 5, inStock: 4, lastOkAt: T0, lastError: null, dormant: false, updatedAt: T0 }],
    EbayListing: [],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtg-country-"));
  for (const [name, body] of buildPublicFiles(tables, { generatedAt: T0, source: "test" })) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("the by-country, guide and blog loaders run on the public data files alone (no Neon)", async () => {
  const saved = { mode: process.env.PUBLIC_DATA_MODE, dir: process.env.PUBLIC_DATA_DIR, db: process.env.DATABASE_URL, dc2: process.env.SEALED_DATABASE_URL };
  process.env.PUBLIC_DATA_MODE = "files";
  process.env.PUBLIC_DATA_DIR = fixtureDir();
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:1/none";
  delete process.env.SEALED_DATABASE_URL;
  resetPublicData();
  try {
    const { loadCountryData } = await import("../src/content/guides/country-prices-data");
    const d = await loadCountryData(new Date(`${TODAY}T12:00:00Z`));
    assert.deepEqual(d.sets, ["fra"]);
    assert.equal(d.checked, T0.toISOString());
    assert.deepEqual(d.cards.map((c) => `${c.market} ${c.slug}`).sort(), ["AU fra-coll", "AU fra-play", "NZ fra-coll", "US fra-play"]);

    const { loadGuideData } = await import("../src/content/guides/data");
    const { REGIONS } = await import("../src/lib/regions");
    const g = await loadGuideData("is-a-collector-booster-box-worth-it", REGIONS.au, new Date(`${TODAY}T12:00:00Z`));
    assert.deepEqual(g.rows["collector-box"]?.map((c) => c.lowestPriceCents), [39999]);
    const w = await loadGuideData("where-to-buy-magic-sealed-online", REGIONS.au);
    assert.equal(w.stores[0]?.store, "store-a");
    assert.ok(w.types.some((t) => t.productType === "Play Booster Box" && t.open === 1));

    const { loadPostData } = await import("../src/lib/blog/data");
    const st = await loadPostData("where-to-buy-magic-star-trek");
    assert.deepEqual(st.named.map((c) => `${c.market} ${c.slug}`).sort(), ["UK trk-deck", "US trk-bundle"]);
    const boxes = await loadPostData("cheapest-magic-booster-boxes");
    assert.deepEqual(boxes.boxes.filter((c) => c.market === "AU").map((c) => c.slug), ["fra-play", "fra-coll"]);
  } finally {
    for (const [k, v] of Object.entries({ PUBLIC_DATA_MODE: saved.mode, PUBLIC_DATA_DIR: saved.dir, DATABASE_URL: saved.db, SEALED_DATABASE_URL: saved.dc2 })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetPublicData();
  }
});
