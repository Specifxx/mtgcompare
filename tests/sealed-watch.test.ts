import test from "node:test";
import assert from "node:assert/strict";
import {
  SEALED_RESTOCK_COOLDOWN_MS,
  SEALED_RESTOCK_MIN_SOLDOUT_MS,
  SEALED_WATCH_COOLDOWN_MS,
  offerStock,
  sealedOfferState,
  sealedNotificationTitle,
  shouldEmailSealedDrop,
  shouldEmailSealedRrp,
  shouldEmailSealedTarget,
} from "../src/lib/sealed-watch-run";
import { isRealSealedStore, type SealedListing } from "../src/lib/sealed-alert-read";
import { SEALED_WATCH_LIMIT_PLUS, sealedWatchLimit } from "../src/lib/alert-limits";
import { sourceLabel } from "../src/lib/stores";
import { rrpGapText } from "../src/lib/watch-emails";
import { verifyAlertAction } from "../src/lib/alert-actions";
import { NOW, daysAgo, free, hoursAgo, lapsed, offer, plus, premium, sealedHarness, sealedRow } from "./helpers/watch-harness";

process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789abcdef0123456789abcdef";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES (lib/sealed-watch-run.ts, RiftCompare's sealed-watch rules
// ported over MTG Compare's Offer rows): restock after a sold-out spell at EVERY
// real store, at the member's target, or a material drop — `store:` sources
// only, a restock at most once per 6h and the rest once per 24h per watch. RRP
// is off (no MSRP table). Email off delivers the same triggers in-app.
// ─────────────────────────────────────────────────────────────────────────────

const listing = (priceCents: number, over: Partial<SealedListing> = {}): SealedListing => ({
  retailer: "store:shopx",
  retailerName: "Shop X",
  priceCents,
  url: "https://shopx.example/box",
  inStock: true,
  lastSeen: NOW.toISOString(),
  ...over,
});
const STALE = new Date(NOW.getTime() - 80 * 3_600_000).toISOString();

test("the numbers and the pure rules", () => {
  assert.equal(SEALED_WATCH_LIMIT_PLUS, 10);
  assert.equal(sealedWatchLimit("plus"), 10);
  assert.equal(sealedWatchLimit("premium"), Number.POSITIVE_INFINITY);
  assert.equal(sealedWatchLimit(null), 0);
  assert.equal(SEALED_RESTOCK_MIN_SOLDOUT_MS, 5 * 3_600_000);
  assert.equal(SEALED_RESTOCK_COOLDOWN_MS, 6 * 3_600_000);
  assert.equal(SEALED_WATCH_COOLDOWN_MS, 24 * 3_600_000);
  for (const r of ["ebay", "ebay_us", "tcgplayer", "TCGplayer", "cardmarket"]) assert.equal(isRealSealedStore(r), false, r);
  assert.equal(isRealSealedStore("store:shopx"), true);
  // The offer state reads real stores only; a row not refreshed for 72h is unknown, never sold out.
  const mixed = sealedOfferState([listing(15000, { inStock: false }), listing(16000, { retailer: "store:shopy", retailerName: "Shop Y" })], NOW);
  assert.equal(mixed.open?.priceCents, 16000, "the cheapest OPEN store");
  assert.equal(mixed.openStores, 1);
  assert.equal(mixed.soldOutEverywhere, false);
  assert.equal(sealedOfferState([listing(15000, { inStock: false }), listing(16000, { retailer: "store:shopy", inStock: false })], NOW).soldOutEverywhere, true);
  assert.equal(sealedOfferState([listing(15000, { inStock: false }), listing(16000, { retailer: "store:shopy", inStock: false, lastSeen: STALE })], NOW).soldOutEverywhere, false, "a stale store is unknown, not sold out");
  assert.equal(sealedOfferState([listing(15000, { lastSeen: STALE })], NOW).unknown, true);
  assert.equal(sealedOfferState([], NOW).unknown, true);
  assert.equal(offerStock({ inStock: true, lastSeen: STALE }, NOW.getTime()), "unknown");
  // Targets: news only.
  assert.equal(shouldEmailSealedTarget({ priceCents: 14000, targetCents: 14000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldEmailSealedTarget({ priceCents: 14001, targetCents: 14000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false);
  assert.equal(shouldEmailSealedTarget({ priceCents: 13500, targetCents: 14000, lastEmailedCents: 14000, lastNotifiedAt: hoursAgo(30), now: NOW }), false, "3.6% under the last email: not news");
  assert.equal(shouldEmailSealedTarget({ priceCents: 13300, targetCents: 14000, lastEmailedCents: 14000, lastNotifiedAt: hoursAgo(30), now: NOW }), true);
  // Drops need no target, ≥5% and ≥ $1 under the reference.
  assert.equal(shouldEmailSealedDrop({ priceCents: 9000, targetCents: null, lastPriceCents: 10000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldEmailSealedDrop({ priceCents: 9600, targetCents: null, lastPriceCents: 10000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "4% is not material");
  assert.equal(shouldEmailSealedDrop({ priceCents: 9000, targetCents: 9500, lastPriceCents: 10000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "a target replaces the drop rule");
  // RRP is off: no MSRP table exists.
  for (const market of ["US", "AU", "UK", "SG", "CA", "EU"] as const) assert.equal(shouldEmailSealedRrp({ market, lastAtRrp: null, atRrp: true }), false, market);
  assert.equal(rrpGapText(11800, 12000, "USD"), "$118.00, RRP $120.00 — $2.00 under");
  assert.equal(rrpGapText(15000, null, "USD"), "");
});

test("restock: sold out at every real store, then a real store has it — never from eBay or the TCGplayer row", async () => {
  // Run 1: everything sold out → the clock starts.
  const h1 = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: true })], { offers: [offer(15000, { inStock: false })] });
  const s1 = await h1.run();
  assert.equal(s1.soldOut, 1);
  assert.deepEqual(h1.writeFor("s1")!.soldOutAt, NOW);
  assert.equal(h1.writeFor("s1")!.lastInStock, false);
  assert.equal(h1.sent.length, 0);

  // Only eBay and TCGplayer have it: nothing changes.
  const h2 = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: daysAgo(2) })], {
    offers: [offer(15000, { inStock: false }), offer(9000, { source: "ebay" }), offer(9500, { source: "tcgplayer" })],
  });
  await h2.run();
  assert.equal(h2.sent.length, 0, "an eBay listing is never a restock");
  assert.equal(h2.writeFor("s1")?.soldOutAt, undefined);

  // A real store has it again after a day: restock, naming that store.
  const h3 = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: daysAgo(1) })], { offers: [offer(15500)] });
  const s3 = await h3.run();
  assert.equal(s3.restocks, 1);
  assert.equal(s3.emails, 1);
  const item = h3.sent[0]!.item;
  assert.equal(item.kind, "sealed_restock");
  assert.equal(item.priceCents, 15500);
  assert.equal(item.store.name, sourceLabel("store:shopx", "US"));
  assert.deepEqual(item.soldOutAt, daysAgo(1));
  assert.deepEqual(h3.writeFor("s1")!.lastNotifiedAt, NOW);
  assert.equal(h3.writeFor("s1")!.soldOutAt, null);
  assert.equal(h3.writeFor("s1")!.lastFlaggedAt, undefined, "an email is not an in-app flag");
  // Its stop and snooze links are signed for a sealed watch and only that.
  const stop = new URL(item.actions!.stop).searchParams.get("t");
  const v = verifyAlertAction(stop);
  assert.ok(v.ok && v.kind === "sealed" && v.alertId === "s1" && v.action === "stop");
  assert.match(sealedNotificationTitle(item), /is back in stock: \$155\.00 at shopx/);
});

test("an all-stale or unlisted product decides nothing: a feed outage is not a sell-out", async () => {
  const stale = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: true })], { offers: [offer(15000, { updatedAt: new Date(STALE) })] });
  const s = await stale.run();
  assert.equal(s.unknown, 1);
  assert.equal(stale.writes.length, 0);
  const none = sealedHarness([sealedRow("s1", plus)], { offers: [] });
  assert.equal((await none.run()).missing, 1);
  assert.equal(none.writes.length, 0);
});

test("target: fires once at the member's price, then only on a real further drop", async () => {
  const h = sealedHarness([sealedRow("s1", plus, { targetCents: 14000, lastPriceCents: 16000, lastInStock: true })], { offers: [offer(13900)] });
  const s = await h.run();
  assert.equal(s.targets, 1);
  assert.equal(h.sent[0]!.item.kind, "sealed_target");
  assert.equal(h.writeFor("s1")!.lastEmailedCents, 13900);
  // Next day at the same price: quiet (24h cooldown and not news).
  const again = sealedHarness([sealedRow("s1", plus, { targetCents: 14000, lastPriceCents: 13900, lastInStock: true, lastEmailedCents: 13900, lastNotifiedAt: hoursAgo(30) })], { offers: [offer(13900)] });
  await again.run();
  assert.equal(again.sent.length, 0);
});

test("a material drop with no target emails once; the cooldown holds the baseline", async () => {
  const drop = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { offers: [offer(14000)] });
  const s = await drop.run();
  assert.equal(s.drops, 1);
  assert.equal(drop.sent[0]!.item.kind, "sealed_drop");
  assert.equal(drop.sent[0]!.item.referenceCents, 16000);
  const hot = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true, lastNotifiedAt: hoursAgo(3), lastEmailedCents: 16000 })], { offers: [offer(14000)] });
  const sh = await hot.run();
  assert.equal(sh.cooldown, 1);
  assert.equal(hot.sent.length, 0);
  assert.equal(hot.writeFor("s1")?.lastPriceCents, undefined, "the baseline is held, so the drop re-detects after the cooldown");
  assert.equal(sh.held, 1);
});

test("entitlement: a lapsed or free account's watches are skipped; Plus holds its limit, Premium none", async () => {
  const h = sealedHarness([sealedRow("a", lapsed, { lastPriceCents: 16000 }), sealedRow("b", free, { lastPriceCents: 16000 })], { offers: [offer(14000)] });
  const s = await h.run();
  assert.equal(s.lapsed, 2);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
  const many = (user: typeof plus) =>
    Array.from({ length: SEALED_WATCH_LIMIT_PLUS + 2 }, (_, i) => ({ ...sealedRow(`m${i}`, user, { productId: 6000 + i, lastPriceCents: 16000, lastInStock: true, email: "same@example.com" }), userId: "u-same" }));
  const offers = Array.from({ length: SEALED_WATCH_LIMIT_PLUS + 2 }, (_, i) => offer(14000, { productId: 6000 + i }));
  const p = await sealedHarness(many(plus), { offers }).run();
  assert.equal(p.overLimit, 2);
  const q = await sealedHarness(many(premium), { offers }).run();
  assert.equal(q.overLimit, 0);
});

test("snooze and pause: no email, baselines still advance", async () => {
  const snoozed = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true, snoozedUntil: new Date(NOW.getTime() + 86_400_000) })], { offers: [offer(14000)] });
  const a = await snoozed.run();
  assert.equal(a.snoozed, 1);
  assert.equal(snoozed.sent.length, 0);
  assert.equal(snoozed.writeFor("s1")!.lastPriceCents, 14000);
  const paused = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { offers: [offer(14000)], mutes: ["s1@example.com"] });
  const b = await paused.run();
  assert.equal(b.paused, 1);
  assert.equal(paused.sent.length, 0);
});

test("a failed send holds the baseline for the next run; a failed read throws and writes nothing", async () => {
  const bad = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { offers: [offer(14000)], sendOk: false });
  await bad.run();
  assert.equal(bad.writeFor("s1")?.lastPriceCents, undefined);
  assert.equal(bad.writeFor("s1")?.lastNotifiedAt, undefined);
  const failing = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000 })], { readFails: true });
  await assert.rejects(failing.run(), /data host down/);
  assert.equal(failing.writes.length, 0);
});

test("the read is one detail file per watched product, real-store rows only", async () => {
  const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000 }), sealedRow("s2", plus, { productId: 5002, market: "UK" })], { offers: [offer(14000), offer(9900, { source: "tcgplayer" }), offer(8000, { source: "ebay" })] });
  await h.run();
  assert.deepEqual(h.offerQueries, [{ sealedId: 5001 }, { sealedId: 5002 }], "one read per product, nothing else");
  assert.equal(h.sent[0]?.item.priceCents, 14000, "the store row, never the TCGplayer or eBay one");
});

// ── Email off: in-app delivery ───────────────────────────────────────────────

test("email off: a trigger writes a Notification and lastFlaggedAt, never lastNotifiedAt", async () => {
  const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { offers: [offer(14000)], emailEnabled: false });
  const s = await h.run();
  assert.equal(s.flagged, 1);
  assert.equal(s.emails, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notified.length, 1);
  assert.equal(h.notified[0]!.type, "sealed_watch");
  assert.equal(h.notified[0]!.href, "/sealed/box-5001");
  const w = h.writeFor("s1")!;
  assert.deepEqual(w.lastFlaggedAt, NOW);
  assert.equal(w.lastNotifiedAt, undefined, "lastNotifiedAt means an email was sent");
  assert.equal(w.lastEmailedCents, 14000, "the delivered price is the reference, so it does not re-fire every run");
  assert.equal(w.lastPriceCents, 14000);
  // The 24h cooldown reads the later of the two stamps, so the in-app cadence matches the email one.
  const again = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 14000, lastInStock: true, lastEmailedCents: 14000, lastFlaggedAt: hoursAgo(3) })], { offers: [offer(12000)], emailEnabled: false });
  assert.equal((await again.run()).cooldown, 1);
  assert.equal(again.notified.length, 0);
});

test("email off: pauses, the budget and the per-run cap do not apply to in-app delivery; a failed notify holds the watch", async () => {
  const rows = Array.from({ length: 40 }, (_, i) => sealedRow(`w${i}`, plus, { productId: 7000 + i, lastPriceCents: 16000, lastInStock: true }));
  const offers = rows.map((r, i) => offer(14000, { productId: 7000 + i }));
  const h = sealedHarness(rows, { offers, emailEnabled: false, mutes: ["w0@example.com"], dailyBudget: 0 });
  const s = await h.run();
  assert.equal(s.flagged, 40);
  assert.equal(s.paused, 0);
  assert.equal(s.deferred, 0);
  // A notify that throws leaves the watch un-flagged and its baseline held, so the next run retries.
  const failing = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 16000, lastInStock: true })], { offers: [offer(14000)], emailEnabled: false, notifyFails: true });
  const f = await failing.run();
  assert.equal(f.flagged, 0);
  assert.equal(f.held, 1);
  assert.equal(failing.writeFor("s1")?.lastFlaggedAt, undefined);
  assert.equal(failing.writeFor("s1")?.lastPriceCents, undefined);
});

test("email on: the daily budget and the per-address cap defer the overflow with baselines held", async () => {
  const rows = Array.from({ length: 4 }, (_, i) => sealedRow(`b${i}`, plus, { productId: 8000 + i, lastPriceCents: 16000, lastInStock: true }));
  const offers = rows.map((r, i) => offer(14000, { productId: 8000 + i }));
  const h = sealedHarness(rows, { offers, dailyBudget: 3, recent: ["x@example.com", "y@example.com"] });
  const s = await h.run();
  assert.equal(s.emails, 1, "one slot left in the budget");
  assert.equal(s.budgetDeferred, 3);
  assert.equal(s.held, 3);
  assert.equal(h.writes.length, 1);
});
