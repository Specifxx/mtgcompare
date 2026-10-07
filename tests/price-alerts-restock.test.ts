import { test } from "node:test";
import assert from "node:assert/strict";
import { RESTOCK_MIN_SOLDOUT_MS, RESTOCK_MIN_SOLDOUT_RUNS, isRestock } from "../src/lib/price-alerts";
import { dropRow, priceDropCopy } from "../src/lib/email";
import { applyWrites, daysAgo, harness, hoursAgo, listing, NOW, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// BACK IN STOCK (2026-09-25). A single that sold out AFTER the watch started
// and came back at the same or a higher price used to send nothing, while
// PriceAlertModal promised "in stock or gets cheaper". Now:
//   • alert price sold out, with a baseline → soldOutAt = now (baseline kept),
//     soldOutRuns = 1; seen sold out again → soldOutRuns = 2;
//   • priced again ≥20h later, after two sold-out runs → "back in stock at X,
//     was Y before it sold out" (one sold-out read of a once-a-day free run
//     was always ≥24h old by the next — review, 2026-09-25);
//   • back inside 20h → just cleared (one missed scrape is not news);
//   • "unknown" (only stale rows — a failing feed) never sets or clears it.
// Free watches: weekly cap + FIRST_PRICE_SEND_CAP. Entitled: every import.
// ─────────────────────────────────────────────────────────────────────────────

test("isRestock needs a baseline, 20h sold out and two sold-out runs", () => {
  assert.equal(RESTOCK_MIN_SOLDOUT_MS, 20 * 3600_000);
  assert.equal(RESTOCK_MIN_SOLDOUT_RUNS, 2);
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(20), soldOutRuns: 2, now: NOW }), true);
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(19), soldOutRuns: 2, now: NOW }), false);
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(48), soldOutRuns: 1, now: NOW }), false, "one sold-out read is not a sell-out");
  assert.equal(isRestock({ prev: 1000, soldOutAt: hoursAgo(48), soldOutRuns: null, now: NOW }), false, "null reads as one run");
  assert.equal(isRestock({ prev: 1000, soldOutAt: null, soldOutRuns: 2, now: NOW }), false);
  assert.equal(isRestock({ prev: null, soldOutAt: hoursAgo(48), soldOutRuns: 2, now: NOW }), false);
});

test("sold out → back at the SAME price sends 'back in stock' (F5)", async () => {
  let rows = [row("a", { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(20) })];
  const out = harness(rows); // no listing: sold out
  const s1 = await out.run();
  assert.equal(s1.soldOut, 1);
  assert.deepEqual(out.writeFor("a"), { soldOutAt: NOW, soldOutRuns: 1 }, "the baseline is kept");
  rows = applyWrites(rows, out.writes);
  // Seen sold out again the next day: now it is a real sell-out.
  const again = harness(rows);
  const s1b = await again.run();
  assert.equal(s1b.soldOut, 0, "already marked");
  assert.deepEqual(again.writeFor("a"), { soldOutRuns: 2 });
  rows = applyWrites(rows, again.writes).map((r) => ({ ...r, soldOutAt: daysAgo(3) }));
  const back = harness(rows.map((r) => ({ ...r, _price: 1000 })));
  const s2 = await back.run();
  assert.equal(s2.restocks, 1);
  assert.equal(back.sent.length, 1);
  const item = back.items()[0]!;
  assert.equal(item.kind, "restock");
  assert.equal(item.referenceCents, 1000);
  assert.equal(item.referenceBasis, "before_soldout");
  assert.deepEqual(item.soldOutAt, daysAgo(3));
  assert.equal(back.writeFor("a")!.soldOutAt, null, "cleared once told");
  assert.equal(back.writeFor("a")!.soldOutRuns, null);
  assert.equal(back.writeFor("a")!.lowestEmailedCents, 1000);
  assert.match(priceDropCopy([item]).subject, /is back in stock: \$10\.00 at shopx/);
  assert.match(dropRow(item), /Back in stock/);
});

test("back inside 20h: cleared, no email, judged as an ordinary price", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, soldOutAt: hoursAgo(10), price: 1100 })]);
  const s = await h.run();
  assert.equal(s.restocks, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writeFor("a")!.soldOutAt, null);
  assert.equal(h.writeFor("a")!.lastPriceCents, 1100);
});

test("a failing store feed (only stale rows) is UNKNOWN: never sold out, never a restock", async () => {
  const stale = listing("card-a", 1000, { updatedAt: hoursAgo(50) });
  const h = harness([row("a", { lastPriceCents: 1000 })], { stores: [stale] });
  const s = await h.run();
  assert.equal(s.unknown, 1);
  assert.equal(s.soldOut, 0);
  assert.equal(h.writes.length, 0, "nothing written until a fresh import decides");
  const h2 = harness([row("a", { lastPriceCents: 1000, soldOutAt: daysAgo(2) })], { stores: [stale] });
  await h2.run();
  assert.equal(h2.writes.length, 0, "an unknown never clears soldOutAt either");
});

test("a free restock waits out the weekly cap with soldOutAt held; an entitled one does not wait", async () => {
  const state = { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(3), soldOutAt: daysAgo(2), price: 1000 };
  const f = harness([row("a", state)]);
  const s = await f.run();
  assert.equal(s.restocks, 1);
  assert.equal(s.deferred, 1);
  assert.equal(f.writes.length, 0, "soldOutAt stays, so the restock re-detects");
  const p = harness([owned("b", plus, state)]);
  await p.run("paid");
  assert.equal(p.sent.length, 1);
  assert.equal(p.items()[0]!.kind, "restock");
});

test("going sold out needs a baseline; a never-priced watch stays unpriced", async () => {
  const h = harness([row("a")]);
  const s = await h.run();
  assert.equal(s.soldOut, 0);
  assert.equal(h.writes.length, 0);
});

test("ebayOnly: sold out on the alert price but priced on the Card is counted", async () => {
  // A baseline already confirmed as an alert price (dropAnchorCents set).
  const h = harness([row("a", { lastPriceCents: 900, dropAnchorCents: 900, cardPrice: 300 })], {
    stores: [listing("card-a", 300, { source: "ebay" })],
  });
  const s = await h.run();
  assert.equal(s.ebayOnly, 1);
  assert.equal(s.soldOut, 1);
  assert.equal(s.legacyReset, 0);
  assert.equal(h.sent.length, 0);
});

test("a free row sold out for ONE daily run then back is not 'back in stock'", async () => {
  // Day 0 priced; day 1 one out-of-stock read at 07:00 (a missed scrape, or a
  // restock the 19:00 import already saw); day 2 priced again at 1000.
  let rows = [row("a", { lastPriceCents: 1000, dropAnchorCents: 1000 })];
  const d1 = harness(rows, { now: daysAgo(1) });
  await d1.run();
  assert.deepEqual(d1.writeFor("a"), { soldOutAt: daysAgo(1), soldOutRuns: 1 });
  rows = applyWrites(rows, d1.writes);
  const d2 = harness(rows.map((r) => ({ ...r, _price: 1000 })));
  const s2 = await d2.run();
  assert.equal(s2.restocks, 0);
  assert.equal(d2.sent.length, 0, "24h after one sold-out read used to send 'back in stock'");
  assert.deepEqual(d2.writeFor("a"), { soldOutAt: null, soldOutRuns: null }, "just cleared");
  // Two daily sold-out reads, then priced: a real restock.
  let r2 = [row("b", { lastPriceCents: 1000, dropAnchorCents: 1000 })];
  for (const n of [2, 1]) {
    const h = harness(r2, { now: daysAgo(n) });
    await h.run();
    r2 = applyWrites(r2, h.writes);
  }
  const back = harness(r2.map((r) => ({ ...r, _price: 1000 })));
  const sb = await back.run();
  assert.equal(sb.restocks, 1);
  assert.equal(back.items()[0]!.kind, "restock");
});

test("a Card-price (eBay-seeded) baseline that reads sold out is reset to no price, not marked sold out", async () => {
  // A watch created before 2026-09-25 was seeded from Card.lowestPriceCents*:
  // here a US$3.00 eBay listing no store ever matched. It is not a sell-out.
  let rows = [row("e", { lastPriceCents: 300, startPriceCents: 300, cardPrice: 300 })];
  const h1 = harness(rows, { stores: [listing("card-e", 300, { source: "ebay" })], now: daysAgo(2) });
  const s1 = await h1.run();
  assert.equal(s1.legacyReset, 1);
  assert.equal(s1.soldOut, 0);
  assert.deepEqual(h1.writeFor("e"), { lastPriceCents: null, startPriceCents: null });
  rows = applyWrites(rows, h1.writes);
  // A store lists it two days later: "now in stock", never "back in stock …
  // US$3.00 before it sold out", and no eBay "you started watching at".
  const h2 = harness(rows, { stores: [listing("card-e", 1200, { source: "store:cherry" })] });
  await h2.run();
  const item = h2.items()[0]!;
  assert.equal(item.kind, "listed");
  assert.equal(item.referenceCents, null);
  assert.equal(item.startPriceCents, null);
  assert.doesNotMatch(dropRow(item), /before it sold out|started watching at \$3\.00/);
  // A Plus watch gets it too (as a listing, under the free rules).
  const plusRows = applyWrites([owned("p", plus, { lastPriceCents: 300, startPriceCents: 300, cardPrice: 300 })], h1.writes.map((w) => ({ ...w, id: "p" })));
  assert.equal(plusRows[0]!.lastPriceCents, null);
  const hp = harness(plusRows, { stores: [listing("card-p", 1200)] });
  await hp.run("paid");
  assert.equal(hp.items()[0]?.kind, "listed", "the next paid run tells a Plus watcher it is listed — not silence");
});
