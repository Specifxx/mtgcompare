import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_EMAIL_COMPACT_ROWS, ALERT_EMAIL_FULL_ROWS, buildPriceDropEmail, dropRow } from "../src/lib/email";
import { alertReference, nextDropAnchor, shouldEmailDrop } from "../src/lib/price-alerts";
import { sanitizeNextPath } from "../src/lib/next-param";
import { GET as marketGET } from "../src/app/api/market/route";
import { DAY, NOW, applyWrites, cardNum, daysAgo, harness, hoursAgo, listing, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// Fixes from the 2026-09-25 review of the price-alerts rebuild (DECISIONS.md,
// "Price alerts: review fixes"). Behavioural wherever the logic is pure or
// runs against the harness.
// ─────────────────────────────────────────────────────────────────────────────

// ── F4: a slow slide adds up ─────────────────────────────────────────────────

test("a steady −3%/day decline with no live watermark emails once it adds up to a material fall", async () => {
  let rows = [row("a", { lastPriceCents: 10000, startPriceCents: 10000 })];
  let price = 10000;
  const sentAt: number[] = [];
  for (let d = 19; d >= 0; d--) {
    price = Math.round(price * 0.97);
    const h = harness(
      rows.map((r) => ({ ...r, _price: price })),
      { now: daysAgo(d) },
    );
    await h.run();
    if (h.sent.length) sentAt.push(price);
    rows = applyWrites(rows, h.writes);
  }
  assert.ok(sentAt.length >= 1, "measured from the last price, 20 sub-5% steps (−46%) sent nothing");
  assert.equal(sentAt[0], 9409, "the second step: 5.9% under the 10000 the slide started from");
});

test("the same with an EXPIRED watermark (emailed more than 30 days ago)", async () => {
  let rows = [row("a", { lastPriceCents: 10000, lowestEmailedCents: 10000, lastNotifiedAt: daysAgo(60), dropAnchorCents: 10000 })];
  const prices = [9750, 9500, 9300];
  const sent: number[] = [];
  for (const [i, p] of prices.entries()) {
    const h = harness(rows.map((r) => ({ ...r, _price: p })), { now: new Date(NOW.getTime() + i * DAY) });
    await h.run();
    for (const it of h.items()) sent.push(it.currentCents);
    if (h.items()[0]) {
      assert.equal(h.items()[0]!.referenceCents, 10000);
      assert.equal(h.items()[0]!.referenceBasis, "anchor");
      assert.match(dropRow(h.items()[0]!), /Down from where it stood before this slide/);
    }
    rows = applyWrites(rows, h.writes);
  }
  assert.deepEqual(sent, [9500], "2.5% then 5% down from 10000: one email at 9500");
  assert.equal(rows[0]!.dropAnchorCents, 9500, "reset to what we emailed");
});

test("the anchor follows the price up, holds on the way down, and a sawtooth stays quiet", () => {
  assert.equal(nextDropAnchor({ anchorCents: null, prev: 1000, current: 970 }), 1000, "starts from the last price");
  assert.equal(nextDropAnchor({ anchorCents: 1000, prev: 970, current: 940 }), 1000, "holds through the slide");
  assert.equal(nextDropAnchor({ anchorCents: 1000, prev: 940, current: 1100 }), 1100, "a rise above it resets it");
  assert.equal(nextDropAnchor({ anchorCents: null, prev: null, current: 800 }), 800, "a first price");
  // 1000 ↔ 970 for ever: never material against the 1000 anchor.
  assert.equal(shouldEmailDrop({ current: 970, prev: 1000, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW, anchorCents: 1000 }), false);
  // A live watermark still wins over the anchor.
  assert.deepEqual(alertReference({ prev: 900, lowestEmailedCents: 950, lastNotifiedAt: daysAgo(3), now: NOW, anchorCents: 1200 }), { cents: 950, basis: "emailed" });
  assert.deepEqual(alertReference({ prev: 900, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW, anchorCents: 1200 }), { cents: 1200, basis: "anchor" });
  assert.deepEqual(alertReference({ prev: 900, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW, anchorCents: 900 }), { cents: 900, basis: "last" });
});

test("a deferred drop keeps its anchor (the baseline is held); a sent one resets it", async () => {
  const deferred = harness([row("a", { lastPriceCents: 1050, dropAnchorCents: 1100, lowestEmailedCents: 2000, lastNotifiedAt: daysAgo(40), price: 1000 }), row("a2", { email: "a@example.com", lastNotifiedAt: daysAgo(2) })]);
  // (a2 shares the address and was emailed 2 days ago: the week binds.)
  const s = await deferred.run();
  assert.equal(s.deferred, 1);
  assert.equal(deferred.writeFor("a"), undefined);
  const sent = harness([row("b", { lastPriceCents: 1050, dropAnchorCents: 1100, price: 1000 })]);
  await sent.run();
  assert.equal(sent.items()[0]!.referenceCents, 1100);
  assert.equal(sent.writeFor("b")!.dropAnchorCents, 1000);
});

// ── F3: a partial feed outage is not news ────────────────────────────────────

test("a cheaper store going stale while a dearer one is fresh sends nothing, raises nothing, re-arms nothing", async () => {
  const cheapStale = listing("card-a", 800, { source: "store:storea", updatedAt: hoursAgo(40) });
  const dearFresh = listing("card-a", 1000, { source: "store:storeb" });
  // Free: run 1 used to write lastPriceCents 1000; run 2 then emailed "800, down from 1000".
  let rows = [row("a", { lastPriceCents: 800, dropAnchorCents: 800 })];
  const r1 = harness(rows, { stores: [cheapStale, dearFresh] });
  const s1 = await r1.run();
  assert.equal(s1.unknown, 1);
  assert.equal(r1.writes.length, 0, "the baseline is not raised to the dearer store");
  rows = applyWrites(rows, r1.writes);
  const r2 = harness(rows, { stores: [{ ...cheapStale, updatedAt: hoursAgo(2) }, dearFresh], now: new Date(NOW.getTime() + DAY) });
  await r2.run();
  assert.equal(r2.sent.length, 0, "the cheap store recovering at its unchanged price is not a new low");
  // Plus: a fired target at 800 used to re-arm on run 1 and re-send on run 2.
  let prow = [owned("p", plus, { targetCents: 900, targetEmailedCents: 800, lastPriceCents: 800, dropAnchorCents: 800, lastNotifiedAt: daysAgo(3) })];
  const p1 = harness(prow, { stores: [{ ...cheapStale, productId: cardNum("card-p") }, { ...dearFresh, productId: cardNum("card-p") }] });
  await p1.run("paid");
  assert.equal(p1.writes.length, 0, "targetEmailedCents is not reset");
  prow = applyWrites(prow, p1.writes);
  const p2 = harness(prow, { stores: [{ ...cheapStale, productId: cardNum("card-p"), updatedAt: hoursAgo(2) }, { ...dearFresh, productId: cardNum("card-p") }] });
  await p2.run("paid");
  assert.equal(p2.sent.length, 0, "no second 'hit your target' at the same 800");
});

// ── E3: nothing is recorded as emailed that the email did not show ───────────

test("a digest past what one email renders holds the rest for the next email", async () => {
  const shown = ALERT_EMAIL_FULL_ROWS + ALERT_EMAIL_COMPACT_ROWS;
  const rows = Array.from({ length: shown + 5 }, (_, i) =>
    row(`c${i}`, { email: "big@example.com", unsubToken: "tok-big", setCode: "2XM" }),
  ).map((r, i) => ({ ...r, _price: 1000 + i }));
  const h = harness(rows);
  const s = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(s.overflow, 5);
  const told = h.writes.filter((w) => w.data.lastNotifiedAt instanceof Date);
  assert.equal(told.length, shown, "only the rendered items get lastNotifiedAt / a watermark");
  const heldIds = rows.map((r) => r.id).filter((id) => !told.some((w) => w.id === id));
  assert.equal(heldIds.length, 5);
  for (const id of heldIds) assert.equal(h.writeFor(id), undefined, `${id}: baseline held, so it re-detects next run`);
  // The email says they are coming, not that they are on the watchlist page.
  const email = buildPriceDropEmail(h.sent[0]!.items, "tok-big");
  assert.match(email.text, /5 more cards with news will come in your next alert email/);
});

// ── The push re-import's baseline pass ───────────────────────────────────────

test("baselineOnly: every priced watch moves to the new price, nothing is sent, no watermark written", async () => {
  const rows = [
    row("drop", { lastPriceCents: 1000, dropAnchorCents: 1000, price: 700 }), // a matching fix, 30% "down"
    row("wild", { lastPriceCents: 2500, dropAnchorCents: 2500, price: 300 }), // would be an outlier hold
    row("back", { lastPriceCents: 1000, soldOutAt: daysAgo(3), price: 1000 }),
    row("new", { price: 900 }), // never priced: left for "now listed"
    owned("t", plus, { targetCents: 900, targetEmailedCents: 850, lastPriceCents: 850, dropAnchorCents: 850, price: 950 }),
    row("gone", { lastPriceCents: 1000, dropAnchorCents: 1000 }), // sold out now
  ];
  const h = harness(rows);
  const s = await h.runBaseline();
  assert.equal(h.sent.length, 0);
  assert.equal(h.budgetQueries.length, 0);
  assert.equal(h.muteQueries.length, 0);
  assert.equal(s.outlierHeld, 0);
  assert.deepEqual(h.writeFor("drop"), { lastPriceCents: 700, dropAnchorCents: 700 });
  assert.deepEqual(h.writeFor("wild"), { lastPriceCents: 300, dropAnchorCents: 300 });
  assert.deepEqual(h.writeFor("back"), { dropAnchorCents: 1000, soldOutAt: null, soldOutRuns: null });
  assert.equal(h.writeFor("new"), undefined, "no baseline invented: the next run sends 'now listed'");
  assert.deepEqual(h.writeFor("t"), { targetEmailedCents: null, lastPriceCents: 950, dropAnchorCents: 950 });
  assert.deepEqual(h.writeFor("gone"), { soldOutAt: NOW, soldOutRuns: 1 });
  for (const w of h.writes) {
    assert.equal(w.data.lastNotifiedAt, undefined);
    assert.equal(w.data.lowestEmailedCents, undefined);
  }
  // And the next scheduled run sees no "drop".
  const next = harness(applyWrites(rows, h.writes), { now: new Date(NOW.getTime() + DAY) });
  await next.run();
  assert.deepEqual(next.items().map((i) => [i.alertId, i.kind]), [["new", "listed"]]);
});

// ── The open redirect ────────────────────────────────────────────────────────

test("sanitizeNextPath refuses backslash and control-character tricks", () => {
  for (const bad of ["/\\evil.com", "/\\\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com", "/%09"]) {
    const r = sanitizeNextPath(bad);
    if (bad === "/%09") assert.equal(r, "/%09", "an encoded character in a real path is fine");
    else assert.equal(r, null, JSON.stringify(bad));
  }
  assert.equal(sanitizeNextPath("/card/jinx?utm_source=email"), "/card/jinx?utm_source=email");
});

test("/api/market never 307s off-origin", () => {
  for (const to of ["/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/%5Cevil.com"]) {
    const r = marketGET(new Request(`https://mtgcompare.app/api/market?m=AU&to=${encodeURIComponent(to)}`));
    const loc = r.headers.get("location") ?? "";
    assert.ok(loc.startsWith("https://mtgcompare.app/"), `${JSON.stringify(to)} → ${loc}`);
  }
  // The decoded backslash form, as the finding reproduced it.
  const r = marketGET(new Request("https://mtgcompare.app/api/market?to=%2F%5Cevil.com"));
  assert.equal(r.headers.get("location"), "https://mtgcompare.app/");
});
