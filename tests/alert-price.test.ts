import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_FRESH_MS,
  ALERT_LOOKBACK_MS,
  ALERT_OUTAGE_MAX_MS,
  alertBaselineSeed,
  alertConditionRank,
  alertPairKey,
  alertPriceFromRows,
  computeAlertPrices,
  isAlertEligibleSource,
  type AlertOfferReader,
} from "../src/lib/alert-price";
import { NOW, cardNum, hoursAgo, listing } from "./helpers/alert-harness";
import type { LiveOffer } from "../src/lib/offer-read";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE: alerts compare the cheapest copy you could actually buy —
// Near Mint or unstated, in stock, seen within 36h, at a real store or
// TCGplayer's cheapest US listing — never eBay and never Card.low<M>.
// RiftCompare's test, over the published live offers (source "store:<key>",
// "tcgplayer", "ebay…"; refreshedAt; integer productIds; a finish on every unit).
// ─────────────────────────────────────────────────────────────────────────────

test("eBay never sets or names an alert price — every ebay source", () => {
  for (const source of ["ebay", "ebay_us", "ebay_uk", "ebay-au", "EBAY"]) {
    assert.equal(isAlertEligibleSource(source), false, source);
    const p = alertPriceFromRows([listing("c", 300, { source }), listing("c", 2500)], NOW);
    assert.equal(p.priceCents, 2500, `${source}: the $3 eBay listing is ignored, the store's $25 is the price`);
    assert.deepEqual(p.stores.map((s) => s.source), ["store:shopx"]);
  }
  // With ONLY eBay, the card is sold out as far as alerts are concerned.
  assert.equal(alertPriceFromRows([listing("c", 300, { source: "ebay" })], NOW).state, "soldout");
});

test("only a tracked store or TCGplayer is eligible; TCGplayer's cheapest US listing counts as a store", () => {
  for (const source of ["store:bigshop", "tcgplayer"]) assert.equal(isAlertEligibleSource(source), true, source);
  for (const source of ["cardmarket", "tcgplayer_market", "", "shop"]) assert.equal(isAlertEligibleSource(source), false, source);
  assert.equal(alertPriceFromRows([listing("c", 420, { source: "tcgplayer", condition: "NM" })], NOW).priceCents, 420);
});

test("only Near Mint or unstated condition: a played copy is not a price drop", () => {
  for (const c of ["Lightly Played", "Slightly Played", "Moderately Played", "Heavily Played", "Damaged", "Played", "Near Mint / Lightly Played"]) {
    const p = alertPriceFromRows([listing("c", 1200, { condition: c }), listing("c", 3000, { source: "store:shopy" })], NOW);
    assert.equal(p.priceCents, 3000, `${c} is ignored`);
  }
  for (const c of [null, "", "Near Mint", "NM", "Mint", "Default", "Foil"]) {
    assert.equal(alertPriceFromRows([listing("c", 1200, { condition: c })], NOW).priceCents, 1200, `${c} counts`);
  }
});

test("alertConditionRank: worst named condition wins", () => {
  assert.equal(alertConditionRank("Slightly Played"), 1);
  assert.equal(alertConditionRank("Played"), 2);
  assert.equal(alertConditionRank("Near Mint Foil"), 0);
  assert.equal(alertConditionRank("HP"), 3);
  assert.equal(alertConditionRank("Poor"), 4);
  assert.equal(alertConditionRank(null), 0);
  // Cardmarket's "Good" is played.
  for (const g of ["Good", "GD", "Very Good"]) assert.equal(alertConditionRank(g), 2, g);
});

test("stale rows never set a price; only-stale is UNKNOWN, never sold out", () => {
  const fresh = listing("c", 1000, { updatedAt: hoursAgo(35) });
  const stale = listing("c", 800, { source: "store:shopy", updatedAt: hoursAgo(37) });
  // A failing store that was CHEAPER than every fresh copy: the price is its
  // 800 or something higher — unknown. Reading it as 1000 raised the baseline,
  // and the store's recovery at its unchanged 800 then sent a phantom "new low".
  assert.equal(alertPriceFromRows([fresh, stale], NOW).state, "unknown");
  // A stale row DEARER than the fresh minimum cannot lower the price.
  const dear = alertPriceFromRows([fresh, { ...stale, priceCents: 1200 }], NOW);
  assert.equal(dear.state, "priced");
  assert.equal(dear.priceCents, 1000, "the 37h-old row is never the price");
  // Same source fresh and stale: a listing the store dropped, not an outage.
  const same = alertPriceFromRows([fresh, { ...stale, source: fresh.source }], NOW);
  assert.equal(same.state, "priced");
  assert.equal(same.priceCents, 1000);
  // A failing feed: its last rows claim stock, nothing fresh does.
  assert.equal(alertPriceFromRows([stale], NOW).state, "unknown");
  // A stale PLAYED row would not have counted anyway: plainly sold out.
  assert.equal(alertPriceFromRows([{ ...stale, condition: "Lightly Played" }], NOW).state, "soldout");
  assert.equal(alertPriceFromRows([], NOW).state, "soldout");
  assert.equal(ALERT_FRESH_MS, 36 * 3600_000);
  assert.equal(ALERT_LOOKBACK_MS, 72 * 3600_000);
});

test("an out-of-stock row never sets a price", () => {
  assert.equal(alertPriceFromRows([listing("c", 500, { inStock: false })], NOW).state, "soldout");
});

test("up to three stores, one per source: price, then source key", () => {
  const p = alertPriceFromRows(
    [
      listing("c", 1000, { source: "store:zeta" }),
      listing("c", 1000, { source: "store:alpha" }),
      listing("c", 1000, { source: "store:mid" }),
      listing("c", 900, { source: "store:alpha" }), // same store, cheaper row
      listing("c", 2000, { source: "store:late" }),
      listing("c", 500, { source: "store:gone", inStock: false }),
    ],
    NOW,
  );
  assert.equal(p.state, "priced");
  assert.equal(p.priceCents, 900);
  assert.deepEqual(p.stores.map((s) => [s.source, s.priceCents]), [["store:alpha", 900], ["store:mid", 1000], ["store:zeta", 1000]]);
  assert.equal(p.condition, "Near Mint");
  assert.deepEqual(p.checkedAt, p.stores[0]!.lastSeen);
});

const liveOf = (productId: number, priceCents: number, over: Partial<LiveOffer> = {}): LiveOffer => ({
  productId, finish: "N", market: "US", storeId: 1, source: "store:shopx", priceCents, currency: "USD", url: `https://shopx.example/${productId}`,
  condition: "NM", inStock: true, refreshedAt: hoursAgo(2), ...over,
});

test("computeAlertPrices: one read per market over the watched (product, finish) units, duplicates collapsed", async () => {
  const calls: { units: unknown; market: string }[] = [];
  const [a, b, c] = [cardNum("a"), cardNum("b"), cardNum("c")];
  const read: AlertOfferReader = async (units, market) => {
    calls.push({ units, market });
    return [liveOf(a, 700), liveOf(b, 900, { market: "UK" }), liveOf(a, 1500, { finish: "F" })];
  };
  const out = await computeAlertPrices(
    read,
    [
      { cardId: a, finish: "N", market: "US" },
      { cardId: b, finish: "N", market: "UK" },
      { cardId: a, finish: "N", market: "US" }, // duplicate pair: one unit
      { cardId: a, finish: "F", market: "US" }, // the foil unit of the same product is its own pair
      { cardId: c, finish: "N", market: "US" }, // nobody lists it
    ],
    NOW,
  );
  assert.equal(calls.length, 2, "one read per market");
  assert.deepEqual(calls.find((x) => x.market === "US")!.units, [{ id: a, finish: "N" }, { id: a, finish: "F" }, { id: c, finish: "N" }]);
  assert.equal(out.get(alertPairKey("US", a, "N"))!.priceCents, 700);
  assert.equal(out.get(alertPairKey("US", a, "F"))!.priceCents, 1500, "the finish is part of the key");
  assert.equal(out.get(alertPairKey("UK", b, "N"))!.priceCents, 900);
  assert.equal(out.get(alertPairKey("US", c, "N"))!.state, "soldout");
  // No pairs, no read.
  await computeAlertPrices(read, [], NOW);
  assert.equal(calls.length, 2);
});

test("eBay and non-store sources never reach the price, whatever the reader returns", async () => {
  const a = cardNum("a");
  const read: AlertOfferReader = async () => [liveOf(a, 300, { source: "ebay" }), liveOf(a, 2500)];
  const out = await computeAlertPrices(read, [{ cardId: a, finish: "N", market: "US" }], NOW);
  assert.equal(out.get(alertPairKey("US", a, "N"))!.priceCents, 2500);
});

test("an outage longer than 72h stays UNKNOWN while the source's old rows survive (up to 14 days)", async () => {
  const c = cardNum("c");
  const pair = [{ cardId: c, finish: "N" as const, market: "US" }];
  const key = alertPairKey("US", c, "N");
  // The reader calls a row of a store whose run is older than 72h out of stock but still returns it, stamped with that run.
  const stub = (o: LiveOffer): AlertOfferReader => async () => [o];
  // A store whose scrape keeps failing keeps its rows: an 80h-old run means its feed is down, not that the card sold out.
  const eighty = await computeAlertPrices(stub(liveOf(c, 900, { inStock: false, refreshedAt: hoursAgo(80) })), pair, NOW);
  assert.equal(eighty.get(key)!.state, "unknown");
  // A played row that old proves nothing.
  const played = await computeAlertPrices(stub(liveOf(c, 900, { inStock: false, refreshedAt: hoursAgo(80), condition: "HP" })), pair, NOW);
  assert.equal(played.get(key)!.state, "soldout");
  // An eBay row that old proves nothing either.
  const ebay = await computeAlertPrices(stub(liveOf(c, 900, { inStock: false, refreshedAt: hoursAgo(80), source: "ebay" })), pair, NOW);
  assert.equal(ebay.get(key)!.state, "soldout");
  // Past ALERT_OUTAGE_MAX_MS the listing is gone for all purposes.
  const old = await computeAlertPrices(stub(liveOf(c, 900, { inStock: false, refreshedAt: hoursAgo(15 * 24) })), pair, NOW);
  assert.equal(old.get(key)!.state, "soldout");
  // A fresh run that lists the row out of stock IS a sell-out.
  const fresh = await computeAlertPrices(stub(liveOf(c, 900, { inStock: false, refreshedAt: hoursAgo(3) })), pair, NOW);
  assert.equal(fresh.get(key)!.state, "soldout");
  assert.equal(ALERT_OUTAGE_MAX_MS, 14 * 24 * 3600_000);
});

test("alertBaselineSeed: a new watch starts from the alert price, or from nothing", () => {
  const priced = alertPriceFromRows([listing("a", 700)], NOW);
  assert.deepEqual(alertBaselineSeed(priced), { lastPriceCents: 700, startPriceCents: 700, dropAnchorCents: 700 });
  for (const p of [alertPriceFromRows([], NOW), alertPriceFromRows([listing("a", 700, { updatedAt: hoursAgo(40) })], NOW), undefined]) {
    assert.deepEqual(alertBaselineSeed(p), { lastPriceCents: null, startPriceCents: null, dropAnchorCents: null });
  }
  // eBay-only: no seed, so the first store listing fires "now listed".
  assert.deepEqual(alertBaselineSeed(alertPriceFromRows([listing("a", 300, { source: "ebay" })], NOW)).lastPriceCents, null);
});

test("a failed price read throws rather than reading as every card sold out", async () => {
  const read: AlertOfferReader = async () => { throw new Error("data host down"); };
  await assert.rejects(computeAlertPrices(read, [{ cardId: 1, finish: "N", market: "US" }], NOW), /data host down/);
});
