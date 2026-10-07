import { test } from "node:test";
import assert from "node:assert/strict";
import { addressInCooldown, MIN_DIGEST_INTERVAL_MS } from "../src/lib/price-alerts";
import { applyWrites, daysAgo, harness, NOW, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// "Can we make price drop emails less frequent? like once every week." (owner,
// 2026-09-21 — kept by the 2026-09-25 rework.)
//
// Two independent gates, both still in force:
//   • is this worth telling someone at all? Per CARD (isMaterialDrop & co.).
//   • may we tell them anything yet?         Per ADDRESS (addressInCooldown).
// A capped item is DEFERRED with its baseline held, so it re-detects next run.
// What changed on 2026-09-25: if the price recovers before the window opens,
// the held low is NOT reported — the /alerts FAQ now says so instead of
// promising "deferred, not lost".
// ─────────────────────────────────────────────────────────────────────────────

test("the cap is one week, inclusive at the boundary", () => {
  assert.equal(MIN_DIGEST_INTERVAL_MS / (24 * 60 * 60 * 1000), 7);
  assert.equal(addressInCooldown({ lastEmailedAt: null, now: NOW }), false, "never emailed: no cooldown");
  for (const d of [0, 1, 3, 6]) assert.equal(addressInCooldown({ lastEmailedAt: daysAgo(d), now: NOW }), true, `${d} days`);
  for (const d of [7, 8, 30]) assert.equal(addressInCooldown({ lastEmailedAt: daysAgo(d), now: NOW }), false, `${d} days`);
  const at = new Date(NOW.getTime() - MIN_DIGEST_INTERVAL_MS);
  assert.equal(addressInCooldown({ lastEmailedAt: at, now: NOW }), false);
  assert.equal(addressInCooldown({ lastEmailedAt: new Date(at.getTime() + 1), now: NOW }), true);
});

test("a material drop inside the week is deferred: no email, no watermark, baseline held", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, lowestEmailedCents: 1100, lastNotifiedAt: daysAgo(2), price: 800 })]);
  const s = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(s.drops, 1);
  assert.equal(s.deferred, 1);
  assert.equal(s.suppressed, 0, "deferred ('later') is counted apart from suppressed ('never')");
  assert.equal(s.held, 1);
  assert.equal(h.writes.length, 0, "lastPriceCents stays 1000, so the drop re-detects");
  // Once the week is up, the same drop sends — measured from the price we last emailed.
  const later = harness([row("a", { lastPriceCents: 1000, lowestEmailedCents: 1100, lastNotifiedAt: daysAgo(8), price: 800 })]);
  await later.run();
  assert.equal(later.sent.length, 1);
  assert.equal(later.items()[0]!.referenceCents, 1100);
  assert.equal(later.items()[0]!.referenceBasis, "emailed");
});

test("a held low that recovers before the window opens is not reported (F3, now documented)", async () => {
  let rows = [row("a", { lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(2), price: 800 })];
  const h1 = harness(rows);
  await h1.run();
  assert.equal(h1.sent.length, 0);
  rows = applyWrites(rows, h1.writes);
  const h2 = harness(rows.map((r) => ({ ...r, lastNotifiedAt: daysAgo(8), _price: 1000 })));
  const s = await h2.run();
  assert.equal(h2.sent.length, 0, "back at $10: nothing to send");
  assert.equal(s.deferred, 0);
});

test("two cards dropping the same day share one digest, not two", async () => {
  const h = harness([
    row("x", { email: "fan@example.com", lastPriceCents: 1000, price: 800 }),
    row("y", { email: "fan@example.com", lastPriceCents: 2000, price: 1500 }),
  ]);
  const s = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.items.length, 2);
  assert.equal(s.deferred, 0);
});

test("a paid alert opens a digest and the same address's capped drop rides along", async () => {
  const email = "member@example.com";
  const h = harness([
    owned("drop", plus, { email, userId: "u-m", lastPriceCents: 1000, lowestEmailedCents: 1000, lastNotifiedAt: daysAgo(3), price: 800 }),
    owned("hit", plus, { email, userId: "u-m", targetCents: 500, lastPriceCents: 700, lastNotifiedAt: daysAgo(3), price: 480 }),
  ]);
  const s = await h.run();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0]!.items.map((i) => i.kind), ["target", "drop"], "the target leads; the drop joins");
  assert.equal(s.deferred, 0);
  assert.deepEqual(h.writeFor("drop")!.lastNotifiedAt, NOW);
});
