import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_HOURS } from "../src/lib/constants";
import { STALE_MS } from "../src/lib/data/core";
import { OFFER_STALE_H, OFFER_STALE_MS, headlineOffer, offerStock, offerStockLabel, openStoreCount, rankOffers, soldOutEverywhere } from "../src/lib/sealed-offers";
import { sealedQuickViewPayload } from "../src/lib/sealed-quick-view";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const h = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();
const o = (priceCents: number, inStock: boolean, ageH = 1) => ({ priceCents, inStock, lastSeen: h(ageH) });

test("three states: open, sold out, and unknown once a row is older than the stale window", () => {
  assert.equal(offerStock(o(100, true), NOW), "open");
  assert.equal(offerStock(o(100, false), NOW), "soldout");
  assert.equal(offerStock(o(100, true, OFFER_STALE_H + 1), NOW), "unknown");
  assert.equal(offerStock({ priceCents: 1, inStock: true }, NOW), "open"); // no timestamp: trust the flag
});

test("the headline is the cheapest OPEN offer, never a sold-out or stale one", () => {
  const rows = [o(5000, false), o(9000, true), o(7000, true), o(1000, true, 100)];
  assert.equal(headlineOffer(rows, NOW)?.priceCents, 7000);
  assert.equal(headlineOffer([o(1, false)], NOW), null);
  assert.deepEqual(rankOffers(rows, NOW).map((r) => r.priceCents), [7000, 9000, 1000, 5000]);
});

test("sold out everywhere needs every store fresh and sold out", () => {
  assert.equal(soldOutEverywhere([o(1, false), o(2, false)], NOW), true);
  assert.equal(soldOutEverywhere([o(1, false), o(2, false, 100)], NOW), false); // one stale: unknown
  assert.equal(soldOutEverywhere([o(1, false), o(2, true)], NOW), false);
  assert.equal(soldOutEverywhere([], NOW), false);
});

test("labels and open store count", () => {
  assert.equal(offerStockLabel("open", true), "Pre-order open");
  assert.equal(offerStockLabel("open", false), "In stock");
  assert.equal(offerStockLabel("soldout", false), "Sold out");
  assert.equal(offerStockLabel("unknown", false), "Unknown");
  assert.equal(openStoreCount([{ ...o(1, true), retailer: "a" }, { ...o(2, true), retailer: "a" }, { ...o(3, false), retailer: "b" }], NOW), 1);
});

test("the stale window matches the data layer's", () => {
  assert.equal(OFFER_STALE_H, STALE_HOURS);
  assert.equal(OFFER_STALE_MS, STALE_MS);
});

test("the quick-view payload is market-independent, per-market in its own currency, and tags links", () => {
  const p = sealedQuickViewPayload(
    {
      id: 541164, slug: "modern-horizons-3-play-booster-display", name: "Modern Horizons 3 - Play Booster Display", setId: 1, kind: "Booster Box", packCount: 36, releasedOn: "2024-06-14", presale: false, marketUsd: 30393,
      lowTcg: 29899, change7d: null, contents: null,
      offers: [
        { finish: "N", storeId: 10, source: "store:x", market: "US", priceCents: 29500, currency: "USD", url: "https://x.com/a", inStock: true, condition: null, shippingCents: null, updatedAt: h(2) },
        { finish: "N", storeId: 11, source: "store:y", market: "US", priceCents: 9999, currency: "AUD", url: "https://y.com/a", inStock: true, condition: null, shippingCents: null, updatedAt: h(2) },
        { finish: "N", storeId: 12, source: "ebay", market: "AU", priceCents: 60000, currency: "AUD", url: "https://ebay.com.au/i", inStock: true, condition: null, shippingCents: 0, updatedAt: h(2) },
      ],
    },
    { code: "MH3", name: "Modern Horizons 3", slug: "mh3" },
    "2026-10-04",
  );
  assert.equal(p.markets.US.offers.length, 1); // the AUD row in the US market is dropped
  assert.equal(p.markets.AU.offers[0].ebay, true);
  assert.match(p.markets.EU.ebaySearch, /ebay/);
  assert.match(p.markets.EU.ebaySearch, /Magic(\+|%20)The/);
  assert.equal(p.preRelease, false);
  assert.match(p.imageUrl ?? "", /541164_400w\.jpg$/);
  assert.match(p.tcgHref, /541164/);
});

// ── the loaders, against a published tree of real Modern Horizons 3 sealed products (TCGCSV group 23444, 2026-10-07) ──
import { memTree } from "../src/lib/data/plane/tree";
import { sealedDetailPath, sealedListPath, slugPath } from "../src/lib/data/plane/shards";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { getSealedAll, getSealedBySet, getSealedByIds, getSealedDetail, getSealedPage, getSealedSoldOut } from "../src/lib/data/sealed";
import { STORES } from "../src/lib/stores";
import { writePlaneDir } from "./helpers/data-source";
import fsx from "node:fs";

const DISPLAY = { id: 541164, slug: "modern-horizons-3-play-booster-display", name: "Modern Horizons 3 - Play Booster Display" };
const BUNDLE = { id: 541185, slug: "modern-horizons-3-bundle", name: "Modern Horizons 3 - Bundle" };
const RETIRED = { id: 541159, slug: "modern-horizons-3-prerelease-pack", name: "Modern Horizons 3 - Prerelease Pack" };

function sealedTree() {
  const store = STORES.find((s) => s.id >= 10)!;
  const t = memTree(), j = JSON.stringify;
  // row: id, slug, name, setId, kind, packCount, releasedOn, flags, market, lowTcg, low[6], stores[6], change7d
  const list = [
    [DISPLAY.id, DISPLAY.slug, DISPLAY.name, 23444, "Booster Box", 36, "2024-06-14", 0, 30393, 29899, [29500, null, null, null, null, null], [2, 0, 0, 0, 0, 0], -1.5],
    [BUNDLE.id, BUNDLE.slug, BUNDLE.name, 23444, "Bundle", 0, "2024-06-14", 0, 12908, 13398, 0, 0, null],
    [RETIRED.id, RETIRED.slug, RETIRED.name, 23444, "Prerelease Pack", 0, "2024-06-14", 2, 7194, 7090, 0, 0, null],
  ];
  t.write(sealedListPath(0), j({ v: 1, at: "x", chunk: 0, chunks: 1, s: list }));
  for (const p of [DISPLAY, BUNDLE, RETIRED]) {
    const offers = p === DISPLAY ? [[0, store.id, 29500, null, 1, "/products/play-booster-display"]] : [];
    t.write(sealedDetailPath(p.slug), j({ v: 1, h: 0, p: [[p.id, p.slug, offers, p === DISPLAY ? "36 Play Boosters" : 0]] }));
    t.write(slugPath(p.slug), j({ v: 1, h: 0, s: [], o: [], z: [[p.slug, p.id]] }));
  }
  t.write("ss/runs.json", j({ v: 1, at: new Date().toISOString(), r: [[store.id, 0, new Date().toISOString(), 1, 1, 1, 0, 1, 29500]] }));
  return t;
}

test("sealed loaders: list rows decode, GONE stays out of lists but resolves by id, detail carries store and TCGplayer rows", async () => {
  const dir = writePlaneDir(sealedTree());
  process.env.PLANE_DIR = dir;
  resetPlaneForTests();
  try {
    const all = await getSealedAll();
    assert.deepEqual(all.map((s) => s.id), [DISPLAY.id, BUNDLE.id], "the GONE prerelease pack is out of every list");
    const box = all[0]!;
    assert.equal(box.kind, "Booster Box");
    assert.equal(box.packCount, 36);
    assert.equal(box.low.US, 29500);
    assert.equal(box.low.AU, null);
    assert.equal(box.stores.US, 2);
    assert.equal(all[1]!.packCount, null, "0 on the wire is no pack count");
    assert.equal(all[1]!.low.US, null);
    const page = await getSealedPage({ kind: "Booster Box", sort: "value", page: 1, per: 24 });
    assert.equal(page.total, 1);
    assert.deepEqual((await getSealedBySet(23444)).map((s) => s.id), [DISPLAY.id, BUNDLE.id], "the booster box first");
    const byId = await getSealedByIds([RETIRED.id, 1]);
    assert.deepEqual([...byId.keys()], [RETIRED.id]);
    const soldOut = await getSealedSoldOut();
    assert.deepEqual(soldOut.US, [RETIRED.id]);
    const d = await getSealedDetail(DISPLAY.slug);
    assert.equal(d?.contents, "36 Play Boosters");
    assert.deepEqual(d?.offers.map((o) => [o.source === "tcgplayer" ? "tcgplayer" : "store", o.priceCents, o.finish]), [["store", 29500, "N"], ["tcgplayer", 29899, "N"]]);
    assert.equal(d?.offers[0]!.inStock, true);
    assert.equal(await getSealedDetail("no-such-product"), null);
    assert.equal((await getSealedDetail(RETIRED.slug))?.id, RETIRED.id, "a GONE product still opens");
  } finally {
    delete process.env.PLANE_DIR;
    resetPlaneForTests();
    fsx.rmSync(dir, { recursive: true, force: true });
  }
});
