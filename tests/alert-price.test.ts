import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_FRESH_MS,
  ALERT_LOOKBACK_MS,
  ALERT_OUTAGE_MAX_MS,
  ALERT_ROWS_PER_PAIR,
  alertBaselineSeed,
  alertConditionRank,
  alertPairKey,
  alertPriceFromRows,
  computeAlertPrices,
  isAlertEligibleSource,
  type AlertPriceDb,
} from "../src/lib/alert-price";
import { NOW, cardNum, hoursAgo, listing } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// THE ALERT PRICE: alerts compare the cheapest copy you could actually buy —
// Near Mint or unstated, in stock, seen within 36h, at a real store or
// TCGplayer's cheapest US listing — never eBay and never Card.low<M>.
// RiftCompare's test, over OP Compare's Offer rows (source "store:<key>",
// "tcgplayer", "ebay…"; updatedAt; integer productIds).
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

test("computeAlertPrices: ONE bounded query over the watched pairs, grouped by market", async () => {
  const queries: Record<string, unknown>[] = [];
  const db = {
    offer: {
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        return [listing("a", 700), listing("b", 900, { market: "UK" })];
      },
    },
  } as unknown as AlertPriceDb;
  const [a, b, c] = [cardNum("a"), cardNum("b"), cardNum("c")];
  const out = await computeAlertPrices(
    db,
    [
      { cardId: a, market: "US" },
      { cardId: b, market: "UK" },
      { cardId: a, market: "US" }, // duplicate pair: one lookup
      { cardId: c, market: "US" }, // nobody lists it
    ],
    NOW,
  );
  // The first read; "c" came back sold out, so a second, narrower read looks
  // for older rows of that pair only (the outage check).
  assert.equal(queries.length, 2);
  const q = queries[0] as {
    where: { inStock: boolean; updatedAt: { gte: Date }; AND: [{ OR: unknown[] }, { OR: unknown[] }] };
    select: Record<string, boolean>;
    take: number;
    orderBy: unknown;
  };
  assert.equal(q.where.inStock, true);
  assert.deepEqual(q.where.updatedAt.gte, new Date(NOW.getTime() - ALERT_LOOKBACK_MS));
  assert.deepEqual(q.where.AND[0], { OR: [{ source: { startsWith: "store:" } }, { source: "tcgplayer" }] }, "the query itself refuses eBay and every non-store source");
  assert.deepEqual(q.where.AND[1], {
    OR: [
      { market: "US", productId: { in: [a, c] } },
      { market: "UK", productId: { in: [b] } },
    ],
  });
  assert.deepEqual(Object.keys(q.select).sort(), ["condition", "inStock", "market", "priceCents", "productId", "source", "updatedAt", "url"]);
  assert.equal(q.take, 3 * ALERT_ROWS_PER_PAIR);
  assert.deepEqual(q.orderBy, { priceCents: "asc" });
  assert.equal(out.get(alertPairKey("US", a))!.priceCents, 700);
  assert.equal(out.get(alertPairKey("UK", b))!.priceCents, 900);
  assert.equal(out.get(alertPairKey("US", c))!.state, "soldout");
  const q2 = queries[1] as { where: { updatedAt: { gte: Date; lt: Date }; AND: [unknown, { OR: unknown[] }] }; take: number; select: Record<string, boolean> };
  assert.deepEqual(q2.where.AND[1].OR, [{ market: "US", productId: { in: [c] } }], "only the sold-out pairs");
  assert.deepEqual(q2.where.updatedAt, { gte: new Date(NOW.getTime() - ALERT_OUTAGE_MAX_MS), lt: new Date(NOW.getTime() - ALERT_LOOKBACK_MS) });
  assert.equal(q2.take, ALERT_ROWS_PER_PAIR);
  assert.equal(q2.select.url, undefined, "narrow");
  // No pairs, no query.
  await computeAlertPrices(db, [], NOW);
  assert.equal(queries.length, 2);
  // Every pair priced: no second read.
  await computeAlertPrices(db, [{ cardId: a, market: "US" }], NOW);
  assert.equal(queries.length, 3);
});

test("an outage longer than 72h stays UNKNOWN while the source's old rows survive (up to 14 days)", async () => {
  const stub = (rows: ReturnType<typeof listing>[]) =>
    ({
      offer: {
        findMany: async (args: { where: { updatedAt: { gte: Date; lt?: Date } } }) =>
          rows.filter((r) => r.updatedAt >= args.where.updatedAt.gte && (!args.where.updatedAt.lt || r.updatedAt < args.where.updatedAt.lt)),
      },
    }) as unknown as AlertPriceDb;
  const pair = [{ cardId: cardNum("c"), market: "US" }];
  const key = alertPairKey("US", cardNum("c"));
  // A store whose scrape keeps failing keeps its rows: an 80h-old in-stock row
  // means its feed is down, not that the card sold out.
  const eighty = await computeAlertPrices(stub([listing("c", 900, { updatedAt: hoursAgo(80) })]), pair, NOW);
  assert.equal(eighty.get(key)!.state, "unknown");
  // A played row that old proves nothing.
  const played = await computeAlertPrices(stub([listing("c", 900, { updatedAt: hoursAgo(80), condition: "Heavily Played" })]), pair, NOW);
  assert.equal(played.get(key)!.state, "soldout");
  // An eBay row that old proves nothing either.
  const ebay = await computeAlertPrices(stub([listing("c", 900, { updatedAt: hoursAgo(80), source: "ebay" })]), pair, NOW);
  assert.equal(ebay.get(key)!.state, "soldout");
  // Past ALERT_OUTAGE_MAX_MS the listing is gone for all purposes.
  const old = await computeAlertPrices(stub([listing("c", 900, { updatedAt: hoursAgo(15 * 24) })]), pair, NOW);
  assert.equal(old.get(key)!.state, "soldout");
  assert.equal(ALERT_OUTAGE_MAX_MS, 14 * 24 * 3600_000);
});

test("slim reads skip the URL", async () => {
  const queries: { select: Record<string, boolean> }[] = [];
  const db = {
    offer: {
      findMany: async (args: { select: Record<string, boolean> }) => {
        queries.push(args);
        const { url: _u, ...rest } = listing("a", 700);
        return [rest];
      },
    },
  } as unknown as AlertPriceDb;
  const out = await computeAlertPrices(db, [{ cardId: cardNum("a"), market: "US" }], NOW, { slim: true });
  assert.equal(queries[0]!.select.url, false);
  assert.equal(out.get(alertPairKey("US", cardNum("a")))!.priceCents, 700);
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
  const db = { offer: { findMany: async () => { throw new Error("db down"); } } } as unknown as AlertPriceDb;
  await assert.rejects(computeAlertPrices(db, [{ cardId: 1, market: "US" }], NOW), /db down/);
});
