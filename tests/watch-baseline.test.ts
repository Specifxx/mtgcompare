// "Watching from", the live chips and the start-price seed (src/lib/watch-baseline.ts),
// and the Offer filter the seed reads through (lib/watchlist-server.ts baselineWhere).
import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_FRESH_MS, isAlertSource, pickBaselineCents, watchBaseline, watchChips } from "../src/lib/watch-baseline";
import { alertBaselines, baselineWhere } from "../src/lib/watchlist-server";

test("watchBaseline: the start price in the WATCH's currency, the delta only in the viewer's market", () => {
  const it = { market: "AU", startPriceCents: 1000, lastPriceCents: 900 };
  const au = watchBaseline(it, "AU", 800);
  assert.equal(au.label, "watching from");
  assert.equal(au.text, "A$10.00");
  assert.equal(au.delta, -20);
  const us = watchBaseline(it, "US", 800);
  assert.equal(us.text, "A$10.00", "an AU watch reads A$ whatever the viewer browses");
  assert.equal(us.delta, null, "an A$ start against a US$ price is no number at all");
});

test("watchBaseline: rows without a start price say 'at the last check'; no price means no fake 0%", () => {
  assert.equal(watchBaseline({ market: "US", startPriceCents: null, lastPriceCents: 500 }, "US", 500).label, "at the last check");
  const none = watchBaseline({ market: "US", startPriceCents: null, lastPriceCents: null }, "US", 500);
  assert.equal(none.text, null);
  assert.equal(none.delta, null);
  assert.equal(watchBaseline({ market: "US", startPriceCents: 500, lastPriceCents: null }, "US", null).delta, null);
});

test("watchChips: 'At your target' and 'New low since you started', in the viewer's market only", () => {
  const it = { market: "US", startPriceCents: 1000, targetCents: 800 };
  assert.deepEqual(watchChips(it, "US", 790), { atTarget: true, newLow: true });
  assert.deepEqual(watchChips(it, "US", 950), { atTarget: false, newLow: true });
  assert.deepEqual(watchChips(it, "US", 1000), { atTarget: false, newLow: false });
  assert.deepEqual(watchChips(it, "UK", 500), { atTarget: false, newLow: false }, "another market's price says nothing");
  assert.deepEqual(watchChips({ ...it, targetCents: null }, "US", 100), { atTarget: false, newLow: true });
});

test("the seed is a tracked store or TCGplayer, in stock and fresh — never eBay", () => {
  const now = Date.UTC(2026, 9, 3, 12);
  const fresh = new Date(now - 3600_000);
  assert.equal(isAlertSource("store:sweetspot"), true);
  assert.equal(isAlertSource("tcgplayer"), true);
  assert.equal(isAlertSource("ebay"), false);
  assert.equal(isAlertSource("ebay_us"), false);
  const offers = [
    { source: "ebay", priceCents: 100, inStock: true, updatedAt: fresh },
    { source: "ebay_us", priceCents: 120, inStock: true, updatedAt: fresh },
    { source: "store:a", priceCents: 900, inStock: false, updatedAt: fresh },
    { source: "store:b", priceCents: 700, inStock: true, updatedAt: new Date(now - ALERT_FRESH_MS - 1) },
    { source: "store:c", priceCents: 1100, inStock: true, updatedAt: fresh },
    { source: "tcgplayer", priceCents: 1050, inStock: true, updatedAt: fresh },
  ];
  assert.equal(pickBaselineCents(offers, now), 1050, "the cheapest eligible copy; eBay, sold-out and stale rows never seed");
  assert.equal(pickBaselineCents(offers.slice(0, 2), now), null, "only eBay: no start price rather than an eBay one");
});

test("the Offer read itself filters to stores and TCGplayer (never eBay), in stock, fresh", () => {
  const w = baselineWhere([1, 2], "US", 1_000_000_000);
  assert.deepEqual(w.OR, [{ source: { startsWith: "store:" } }, { source: "tcgplayer" }]);
  assert.equal(w.inStock, true);
  assert.deepEqual(w.productId, { in: [1, 2] });
  assert.equal(JSON.stringify(w).includes("ebay"), false);
});

test("alertBaselines: one bounded read for every card, eBay rows dropped even if a source returned them", async () => {
  const now = Date.UTC(2026, 9, 3);
  let calls = 0;
  const db = {
    offer: {
      findMany: async (args: { take: number }) => {
        calls++;
        assert.ok(args.take <= 2 * 60, "bounded");
        return [
          { productId: 1, source: "ebay", priceCents: 5, inStock: true, updatedAt: new Date(now) },
          { productId: 1, source: "store:x", priceCents: 500, inStock: true, updatedAt: new Date(now) },
        ];
      },
    },
  };
  const m = await alertBaselines(db, [1, 2], "US", now);
  assert.equal(calls, 1);
  assert.equal(m.get(1), 500);
  assert.equal(m.get(2), null);
});
