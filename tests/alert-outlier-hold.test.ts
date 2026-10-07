import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTLIER_CONFIRM_PCT, OUTLIER_DROP_PCT, confirmsPendingLow, isOutlierLow } from "../src/lib/price-alerts";
import { applyWrites, harness, listing as listingFor, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// OUTLIER HOLD (2026-09-25). A new low more than 40% under the last price is
// the classic mismatch signature — a mistyped Shopify price, a store title
// matched to the wrong card. It is written to pendingLowCents and NOTHING is
// sent; the next run fires only if the price is still within ±5% of it, and
// clears the pending low either way. A LOWER figure is not a confirmation: it
// is held again (review, 2026-09-25 — the upper-only band let the very bogus
// low the hold exists for go out at once). Applies to drops, targets and
// below-market alike. The cost is one run: a day for free alerts, ~12h paid.
// ─────────────────────────────────────────────────────────────────────────────

test("the thresholds", () => {
  assert.equal(OUTLIER_DROP_PCT, 40);
  assert.equal(OUTLIER_CONFIRM_PCT, 5);
  assert.equal(isOutlierLow(1000, 599), true);
  assert.equal(isOutlierLow(1000, 600), false, "exactly 40% under is not held");
  assert.equal(isOutlierLow(null, 1), false, "a first price has nothing to be an outlier against");
  assert.equal(confirmsPendingLow(300, 315), true);
  assert.equal(confirmsPendingLow(300, 316), false);
  assert.equal(confirmsPendingLow(300, 285), true, "5% under the held low still confirms it");
  assert.equal(confirmsPendingLow(300, 284), false, "further down is a NEW low, not a confirmation");
  assert.equal(confirmsPendingLow(500, 50), false);
});

test("a >40% low is held one run, then sent when it is still there", async () => {
  let rows = [row("a", { lastPriceCents: 2500, price: 300 })];
  const h1 = harness(rows);
  const s1 = await h1.run();
  assert.equal(h1.sent.length, 0, "nothing sent on the implausible low");
  assert.equal(s1.outlierHeld, 1);
  assert.deepEqual(h1.writeFor("a"), { pendingLowCents: 300 }, "the low is recorded; the baseline is not moved");
  rows = applyWrites(rows, h1.writes);
  const h2 = harness(rows.map((r) => ({ ...r, _price: 310 })));
  const s2 = await h2.run();
  assert.equal(s2.outlierHeld, 0);
  assert.equal(h2.sent.length, 1, "confirmed on the next import");
  const item = h2.items()[0]!;
  assert.equal(item.kind, "drop");
  assert.equal(item.referenceCents, 2500, "measured from the pre-hold price");
  assert.equal(h2.writeFor("a")!.pendingLowCents, null);
  assert.equal(h2.writeFor("a")!.lastPriceCents, 310);
});

test("a low that vanishes by the next run is dropped silently", async () => {
  let rows = [row("a", { lastPriceCents: 2500, price: 300 })];
  const h1 = harness(rows);
  await h1.run();
  rows = applyWrites(rows, h1.writes);
  const h2 = harness(rows.map((r) => ({ ...r, _price: 2500 })));
  const s2 = await h2.run();
  assert.equal(h2.sent.length, 0);
  assert.equal(s2.drops, 0);
  // Cleared; the baseline is unmoved. The drop anchor is seeded at the
  // unchanged price on the first priced run of the anchor rule.
  assert.deepEqual(h2.writeFor("a"), { pendingLowCents: null, dropAnchorCents: 2500 }, "cleared; nothing else moved");
});

test("a different implausible low re-holds at the new figure", async () => {
  const h = harness([row("a", { lastPriceCents: 2500, pendingLowCents: 300, price: 900 })]);
  const s = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(s.outlierHeld, 1);
  assert.deepEqual(h.writeFor("a"), { pendingLowCents: 900 });
});

test("targets are held too, and a confirmed low deferred by the weekly cap stays confirmable", async () => {
  const t = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 2000, price: 500 })]);
  const s = await t.run();
  assert.equal(t.sent.length, 0);
  assert.equal(s.outlierHeld, 1);
  assert.equal(s.targets, 0);
  // Confirmed, but the address is inside its week: deferred, and the pending
  // low is NOT cleared, so the next run confirms it again instead of re-holding.
  const d = harness([row("b", { lastPriceCents: 2500, pendingLowCents: 300, lastNotifiedAt: new Date(Date.UTC(2026, 9, 28)), lowestEmailedCents: 2500, price: 300 })]);
  const sd = await d.run();
  assert.equal(sd.deferred, 1);
  assert.equal(d.writes.length, 0);
});

test("a held low followed by an even LOWER figure is held again, never sent (free drop)", async () => {
  // Run 1 held 500 against a 1000 baseline. Run 2 sees a 50-cent listing (a
  // bogus price) under the 520 one: it used to count as "confirmed", email at
  // once, and become the watermark that muted the card for 30 days.
  const h = harness([row("a", { lastPriceCents: 1000, pendingLowCents: 500, price: 520 })], {
    stores: [{ ...listingFor("card-a", 50), source: "store:shopy" }],
  });
  const s = await h.run();
  assert.equal(h.sent.length, 0, "nothing sent");
  assert.equal(s.outlierHeld, 1);
  assert.deepEqual(h.writeFor("a"), { pendingLowCents: 50 }, "re-held at the new figure; no baseline or watermark written");
});

test("a held target low followed by an even LOWER figure is held again (Plus)", async () => {
  const h = harness([owned("p", plus, { targetCents: 900, lastPriceCents: 1000, pendingLowCents: 520, price: 520 })], {
    stores: [{ ...listingFor("card-p", 10), source: "store:shopy" }],
  });
  const s = await h.run("paid");
  assert.equal(h.sent.length, 0);
  assert.equal(s.targets, 0);
  assert.equal(s.outlierHeld, 1);
  assert.deepEqual(h.writeFor("p"), { pendingLowCents: 10 }, "targetEmailedCents untouched");
});

test("a held low still there within the band confirms, from either side", async () => {
  for (const price of [480, 520]) {
    const h = harness([row("a", { lastPriceCents: 1000, pendingLowCents: 500, price })]);
    await h.run();
    assert.equal(h.sent.length, 1, `confirmed at ${price}`);
    assert.equal(h.items()[0]!.currentCents, price);
  }
});
