import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DROP_MIN_CENTS,
  DROP_MIN_PCT,
  WATERMARK_TTL_MS,
  alertReference,
  isMaterialDrop,
  liveWatermark,
  shouldEmailDrop,
} from "../src/lib/price-alerts";
import { applyWrites, daysAgo, harness, NOW, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// Anti-spam (2026-09-25 rework). Two rules replace "any new low, plus a
// reminder every two months":
//
//   • A MINIMUM MEANINGFUL MOVE. A drop must be ≥5% AND ≥50 minor units of the
//     reference. A 1-cent "new low" was the root of the 2026-09-21 "emails
//     every single day" report, and a Plus target drifting down a few cents per
//     import sent seven emails in 3.5 days for a 15-cent total move.
//   • A 30-DAY WATERMARK. The price we last emailed is the reference only for
//     30 days; after that it lapses and drops are measured from the last price.
//     One bogus low used to silence free drops for two months and below-market
//     alerts for ever; now it is bounded, with no admin tool. The two-month
//     "reminder" (which fired on a 1-cent dip at any level) is gone.
// ─────────────────────────────────────────────────────────────────────────────

test("the thresholds are the documented ones", () => {
  assert.equal(DROP_MIN_PCT, 5);
  assert.equal(DROP_MIN_CENTS, 50);
  assert.equal(WATERMARK_TTL_MS, 30 * 24 * 60 * 60 * 1000);
});

test("isMaterialDrop: at least 5% AND at least 50 minor units", () => {
  assert.equal(isMaterialDrop(1000, 950), true, "exactly 5% and exactly 50c");
  assert.equal(isMaterialDrop(1000, 951), false, "49c");
  assert.equal(isMaterialDrop(1000, 999), false, "the 1-cent new low");
  // Cheap cards: 5% of $2 is 10c, so the 50c floor governs.
  assert.equal(isMaterialDrop(200, 160), false, "20% but only 40c");
  assert.equal(isMaterialDrop(200, 150), true);
  // Dear cards: 50c on $100 is 0.5%, so the 5% governs.
  assert.equal(isMaterialDrop(10000, 9500), true);
  assert.equal(isMaterialDrop(10000, 9600), false, "$4 on $100 is 4%");
  // 5% of 1001 is 50.05 → 51 minor units, rounded up.
  assert.equal(isMaterialDrop(1001, 951), false);
  assert.equal(isMaterialDrop(1001, 950), true);
  assert.equal(isMaterialDrop(1000, 1000), false);
  assert.equal(isMaterialDrop(1000, 1100), false, "a rise is never a drop");
});

test("the watermark counts for 30 days after the email, then lapses", () => {
  const w = { lowestEmailedCents: 700, now: NOW };
  assert.equal(liveWatermark({ ...w, lastNotifiedAt: daysAgo(29) }), 700);
  assert.equal(liveWatermark({ ...w, lastNotifiedAt: new Date(NOW.getTime() - WATERMARK_TTL_MS + 1) }), 700);
  assert.equal(liveWatermark({ ...w, lastNotifiedAt: new Date(NOW.getTime() - WATERMARK_TTL_MS) }), null, "exactly 30 days: lapsed");
  assert.equal(liveWatermark({ ...w, lastNotifiedAt: null }), null);
  assert.equal(liveWatermark({ lowestEmailedCents: null, lastNotifiedAt: daysAgo(1), now: NOW }), null);
  // The reference an email's "what changed" line quotes.
  assert.deepEqual(alertReference({ prev: 1200, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(3), now: NOW }), { cents: 700, basis: "emailed" });
  assert.deepEqual(alertReference({ prev: 1200, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(31), now: NOW }), { cents: 1200, basis: "last" });
  assert.deepEqual(alertReference({ prev: null, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW }), { cents: null, basis: null });
});

test("shouldEmailDrop: a material drop against the reference, and a real drop since the last price", () => {
  const base = { lowestEmailedCents: null, lastNotifiedAt: null, now: NOW };
  assert.equal(shouldEmailDrop({ ...base, prev: 1000, current: 800 }), true, "never emailed: measured from the last price");
  assert.equal(shouldEmailDrop({ ...base, prev: 1000, current: 990 }), false, "10c is not news");
  assert.equal(shouldEmailDrop({ ...base, prev: null, current: 800 }), false, "no baseline: that's a first price, not a drop");
  assert.equal(shouldEmailDrop({ ...base, prev: 800, current: 900 }), false, "a rise");
  // Emailed $7 three days ago: the $10 → $8 sawtooth back down stays quiet…
  const told = { lowestEmailedCents: 700, lastNotifiedAt: daysAgo(3), now: NOW };
  assert.equal(shouldEmailDrop({ ...told, prev: 1000, current: 800 }), false, "a dip back above the price we sent");
  assert.equal(shouldEmailDrop({ ...told, prev: 1000, current: 700 }), false, "matching it exactly");
  assert.equal(shouldEmailDrop({ ...told, prev: 1000, current: 660 }), false, "40c under it: not material");
  assert.equal(shouldEmailDrop({ ...told, prev: 1000, current: 650 }), true, "50c (7%) under it: news");
  // …but a month on, the $7 has lapsed and the $10 → $8 drop is news again.
  assert.equal(shouldEmailDrop({ ...told, lastNotifiedAt: daysAgo(30), prev: 1000, current: 800 }), true);
});

test("one bogus low no longer locks a watch out for two months (F1)", async () => {
  // Day 0: an A$3 low is emailed (the watermark is 300). Day 1 the real price
  // is back at A$25. Day 8: a real store drops to A$18 — silent, the A$3 is
  // still live. Day 31: the A$3 has lapsed; A$25 → A$18 sends.
  let rows = [row("a", { lastPriceCents: 2500, lowestEmailedCents: 300, lastNotifiedAt: daysAgo(8), price: 1800 })];
  let h = harness(rows);
  let s = await h.run();
  assert.equal(h.sent.length, 0, "inside the 30 days the bogus low still gates");
  assert.equal(s.suppressed, 1);
  rows = applyWrites(rows, h.writes).map((r) => ({ ...r, lastPriceCents: 2500 }));
  h = harness(rows.map((r) => ({ ...r, lastNotifiedAt: daysAgo(31), _price: 1800 })));
  s = await h.run();
  assert.equal(h.sent.length, 1, "after the TTL a real drop gets through");
  const item = h.items()[0]!;
  assert.equal(item.kind, "drop");
  assert.equal(item.referenceCents, 2500, "measured from the last price, not the lapsed A$3");
  assert.equal(item.referenceBasis, "last");
  assert.deepEqual(item.change, { cents: 700, pct: 28 });
  assert.equal(h.writeFor("a")!.lowestEmailedCents, 1800, "the new email is the new reference");
});

test("no reminders: a price sitting still never re-emails, however long", async () => {
  const h = harness([row("a", { lastPriceCents: 950, lowestEmailedCents: 950, dropAnchorCents: 950, lastNotifiedAt: daysAgo(90), price: 950 })]);
  const s = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(s.drops + s.suppressed, 0);
  assert.equal(h.writes.length, 0, "nothing moved, nothing written");
  // And the old failure: 61 days after an email, a 1-cent dip at a HIGHER level.
  const dip = harness([row("b", { lastPriceCents: 1500, lowestEmailedCents: 950, lastNotifiedAt: daysAgo(61), price: 1499 })]);
  const d = await dip.run();
  assert.equal(dip.sent.length, 0, "the old reminder emailed 'drop 1500 → 1499'");
  assert.equal(d.suppressed, 1);
  assert.equal(dip.writeFor("b")!.lastPriceCents, 1499, "the baseline still tracks the move");
});
