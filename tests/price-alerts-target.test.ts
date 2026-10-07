import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BELOW_MARKET_MIN_PCT,
  PAID_COOLDOWN_MS,
  PAID_SEND_CAP,
  TARGET_REFIRE_STEP_PCT,
  alertPostage,
  belowMarketSignal,
  inPaidCooldown,
  shouldEmailTarget,
  shouldRearmTarget,
} from "../src/lib/price-alerts";
import { dropRow, postageNote, priceDropCopy, type PriceDropItem } from "../src/lib/email";
import { sourceLabel } from "../src/lib/stores";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { adminEmails } from "../src/lib/admin-emails";
import { applyWrites, cardNum, daysAgo, free, harness, hoursAgo, lapsed, listing, NOW, owned, plus, premium, row, type User } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// TARGET-PRICE AND BELOW-MARKET ALERTS (Plus/Premium), as reworked 2026-09-25.
//
// TARGET: fires when the alert price is at or under the member's target and
// the target is ARMED. Once fired it fires again only 10% further down, and it
// re-arms when a run sees the price back above the target (or sold out) —
// Keepa's "desired price met again". The old rule re-sent on every 1-cent new
// low under the target: seven emails in 3.5 days for a 15-cent drift.
// BELOW MARKET: the alert price scored against TCGplayer market, read
// directly for the candidate cards (not the day-cached ranking), ≥15% under,
// and a material move against the reference.
// Both skip the weekly cap, have a 24h per-card cooldown, and run after every
// import for entitled accounts only.
// ─────────────────────────────────────────────────────────────────────────────

// ── The pure policies ────────────────────────────────────────────────────────

test("shouldEmailTarget: at or under the target while armed; then only a further 10% down", () => {
  assert.equal(TARGET_REFIRE_STEP_PCT, 10);
  const armed = { targetEmailedCents: null };
  assert.equal(shouldEmailTarget({ ...armed, current: 900, targetCents: null }), false, "no target, no target alert");
  assert.equal(shouldEmailTarget({ ...armed, current: 1001, targetCents: 1000 }), false, "a cent above is not a hit");
  assert.equal(shouldEmailTarget({ ...armed, current: 1000, targetCents: 1000 }), true, "AT the target is a hit");
  assert.equal(shouldEmailTarget({ ...armed, current: 400, targetCents: 1000 }), true);
  const fired = { targetEmailedCents: 900, targetCents: 1000 };
  assert.equal(shouldEmailTarget({ ...fired, current: 900 }), false, "the same price never re-sends");
  assert.equal(shouldEmailTarget({ ...fired, current: 811 }), false, "under 10% further: quiet");
  assert.equal(shouldEmailTarget({ ...fired, current: 810 }), true, "10% further down: news");
});

test("shouldRearmTarget: the price back above the target, or sold out, re-arms a fired target", () => {
  assert.equal(shouldRearmTarget({ current: 1001, targetCents: 1000, targetEmailedCents: 900 }), true);
  assert.equal(shouldRearmTarget({ current: null, targetCents: 1000, targetEmailedCents: 900 }), true, "sold out");
  assert.equal(shouldRearmTarget({ current: 1000, targetCents: 1000, targetEmailedCents: 900 }), false, "still at the target");
  assert.equal(shouldRearmTarget({ current: 1500, targetCents: 1000, targetEmailedCents: null }), false, "already armed");
});

test("the paid cooldown is 20h per card — under the 24h between same-slot runs", () => {
  assert.equal(PAID_COOLDOWN_MS, 20 * 3600_000);
  assert.equal(inPaidCooldown(hoursAgo(19), NOW), true);
  assert.equal(inPaidCooldown(hoursAgo(20), NOW), false);
  assert.equal(inPaidCooldown(null, NOW), false);
  // A 12h-later run is still inside it; yesterday's same slot, a few minutes
  // late or early by import jitter, never is (it was, at exactly 24h).
  assert.equal(inPaidCooldown(hoursAgo(12), NOW), true);
  assert.equal(inPaidCooldown(new Date(NOW.getTime() - 24 * 3600_000 + 4 * 60_000), NOW), false);
});

test("belowMarketSignal: scored from the alert price, at least 15% under, and material", () => {
  assert.equal(BELOW_MARKET_MIN_PCT, 15);
  const tcg = { marketCents: 1420, marketUsdCents: 940, lowUsdCents: null };
  const base = { country: "UK" as const, prev: null, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW, tcg };
  const hit = belowMarketSignal({ ...base, current: 1150 });
  assert.deepEqual(hit, { marketCents: 1420, marketUsdCents: 940, belowCents: 270, belowPct: 19 });
  assert.equal(belowMarketSignal({ ...base, current: 1250 }), null, "12% under: below the 15% floor");
  assert.equal(belowMarketSignal({ ...base, current: 1150, tcg: null }), null, "no market figure, no trigger");
  // News only: a material move against the reference.
  assert.equal(belowMarketSignal({ ...base, current: 1150, prev: 1150 }), null, "has sat there since the last run");
  assert.ok(belowMarketSignal({ ...base, current: 1000, prev: 1150 }), "a material drop into (deeper into) the zone");
  // The reference expires, so a bogus emailed low no longer locks it out for ever.
  assert.equal(belowMarketSignal({ ...base, current: 1000, prev: 1150, lowestEmailedCents: 300, lastNotifiedAt: daysAgo(10) }), null);
  assert.ok(belowMarketSignal({ ...base, current: 1000, prev: 1150, lowestEmailedCents: 300, lastNotifiedAt: daysAgo(31) }));
  // In the US, TCGplayer's own cheaper listing kills it (scoreVsTcg).
  assert.equal(belowMarketSignal({ ...base, country: "US", current: 700, tcg: { marketCents: 1000, marketUsdCents: 1000, lowUsdCents: 650 } }), null);
});

// ── The run ──────────────────────────────────────────────────────────────────

test("an entitled target hit bypasses the weekly cap and writes both references", async () => {
  // Emailed two days ago: a free drop for this address would wait five more days.
  const h = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1500, price: 950 })]);
  const s = await h.run();
  assert.equal(h.sent.length, 1);
  const item = h.items()[0]!;
  assert.equal(item.kind, "target");
  assert.equal(item.targetCents, 1000);
  assert.equal(item.currentCents, 950);
  assert.equal(item.stores[0]!.name, sourceLabel("store:shopx"), "the store behind the price");
  assert.equal(s.targets, 1);
  assert.equal(s.drops, 0, "counted as a target, not also as a drop");
  assert.equal(h.writeFor("a")!.targetEmailedCents, 950);
  assert.equal(h.writeFor("a")!.lowestEmailedCents, 950, "the price we just told them");
  assert.deepEqual(h.writeFor("a")!.lastNotifiedAt, NOW);
});

test("the drift that sent seven target emails in 3.5 days now sends one", async () => {
  // Plus target $10.00, one step per import (twice a day).
  let rows = [owned("a", plus, { targetCents: 1000, lastPriceCents: 1100 })];
  let emails = 0;
  let t = NOW.getTime();
  for (const price of [999, 998, 995, 990, 989, 985, 984]) {
    t += 12 * 3600_000;
    const now = new Date(t);
    const h = harness(rows, { now, stores: [listing("card-a", price, { updatedAt: new Date(t - 3600_000) })] });
    await h.run("paid");
    emails += h.sent.length;
    rows = applyWrites(rows, h.writes);
  }
  assert.equal(emails, 1);
});

test("a target re-arms above the line and fires again when the price comes back under", async () => {
  // Fired at $9 against a $10 target; the price rises to $14…
  let rows = [owned("a", plus, { targetCents: 1000, targetEmailedCents: 900, lowestEmailedCents: 900, lastNotifiedAt: daysAgo(5), lastPriceCents: 900, price: 1400 })];
  const up = harness(rows);
  await up.run();
  assert.equal(up.sent.length, 0);
  assert.equal(up.writeFor("a")!.targetEmailedCents, null, "re-armed");
  rows = applyWrites(rows, up.writes);
  // …and back to $9.50: under the target again, and armed, so it sends
  // (the old rule stayed silent for two months).
  const back = harness(rows.map((r) => ({ ...r, _price: 950 })));
  await back.run();
  assert.equal(back.sent.length, 1);
  assert.equal(back.items()[0]!.kind, "target");
  assert.equal(back.writeFor("a")!.targetEmailedCents, 950);
});

test("sold out re-arms a fired target", async () => {
  const h = harness([owned("a", plus, { targetCents: 1000, targetEmailedCents: 900, lastPriceCents: 900 })]);
  const s = await h.run();
  assert.equal(s.soldOut, 1);
  assert.equal(h.writeFor("a")!.targetEmailedCents, null);
  assert.deepEqual(h.writeFor("a")!.soldOutAt, NOW);
});

test("paid triggers hold for 24h after an email about the same card, then fire", async () => {
  const state = { targetCents: 1000, lastPriceCents: 1200, lowestEmailedCents: 1200 };
  const h = harness([owned("a", plus, { ...state, lastNotifiedAt: hoursAgo(6), price: 950 })]);
  const s = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(s.cooldown, 1);
  assert.equal(s.targets, 1, "detected");
  assert.equal(h.writes.length, 0, "baseline held so the next run re-detects it");
  const later = harness([owned("a", plus, { ...state, lastNotifiedAt: hoursAgo(25), price: 950 })]);
  await later.run();
  assert.equal(later.sent.length, 1);
});

test("a lapsed subscription ignores its target: the watch runs the free rules", async () => {
  const rowFor = (id: string, lastNotifiedAt: Date | null) =>
    owned(id, lapsed, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt, lowestEmailedCents: 1500, price: 950 });
  const quiet = harness([rowFor("a", daysAgo(2))]);
  const s1 = await quiet.run();
  assert.equal(quiet.sent.length, 0);
  assert.equal(s1.targets, 0);
  assert.equal(s1.drops, 1);
  assert.equal(s1.deferred, 1);
  assert.equal(quiet.writes.length, 0, "baseline held for the next digest");
  const open = harness([rowFor("b", daysAgo(8))]);
  await open.run();
  assert.equal(open.items()[0]!.kind, "drop");
  const f = harness([owned("c", free, { targetCents: 1000, lastPriceCents: 1200, lastNotifiedAt: daysAgo(2), price: 950 })]);
  const s3 = await f.run();
  assert.equal(s3.targets, 0);
  assert.equal(s3.deferred, 1);
});

test("a hit with the price unmoved is still recorded, and never re-sends", async () => {
  const first = harness([owned("a", plus, { targetCents: 1000, lastPriceCents: 900, price: 900 })]);
  await first.run();
  assert.equal(first.sent.length, 1);
  assert.equal(first.writeFor("a")!.targetEmailedCents, 900);
  const second = harness([
    owned("a", plus, { targetCents: 1000, lastPriceCents: 900, lowestEmailedCents: 900, targetEmailedCents: 900, dropAnchorCents: 900, lastNotifiedAt: daysAgo(2), price: 900 }),
  ]);
  const s = await second.run();
  assert.equal(second.sent.length, 0);
  assert.equal(s.targets, 0);
  assert.equal(second.writes.length, 0);
});

test("free and anonymous cadence is unchanged, and a paid run never touches those rows", async () => {
  const rows = [row("anon", { lastPriceCents: 1000, price: 800, lastNotifiedAt: daysAgo(2) }), owned("free", free, { lastPriceCents: 1000, price: 800 })];
  const all = harness(rows);
  const s = await all.run();
  assert.equal(s.deferred, 1, "the anonymous drop waits out its week");
  assert.equal(all.sent.length, 1, "the free account's first drop sends at once");
  assert.equal(all.alertQueries[0]!.where, undefined, "the 'all' run reads every row, unfiltered");
  const paid = harness(rows);
  const p = await paid.run("paid");
  assert.equal(paid.sent.length, 0);
  assert.equal(paid.writes.length, 0, "no free or anonymous baseline moves in a paid run");
  assert.equal(p.drops + p.listed + p.deferred, 0);
  assert.ok(paid.alertQueries[0]!.where, "the paid run narrows its read to entitled accounts");
});

test("an ADMIN_EMAILS account is entitled in the cron exactly as in the session", async () => {
  const adminEmail = adminEmails()[0];
  assert.ok(adminEmail, "fixture: at least one admin address");
  const admin: User = { isAdmin: false, premiumUntil: null, premiumTier: "plus", premiumTierFloor: null, email: adminEmail.toUpperCase() };
  const n = PLUS_TARGET_ALERT_LIMIT + 2;
  const rows = Array.from({ length: n }, (_, i) =>
    row(`adm${i}`, { userId: "u-admin", user: admin, email: adminEmail, cardId: `c-adm${i}`, targetCents: 1000, lastPriceCents: 1200, price: 950 }),
  );
  for (const scope of ["all", "paid"] as const) {
    const h = harness(rows);
    const s = await h.run(scope);
    assert.equal(s.targets, n, `${scope}: every target honoured — an admin reads as Premium, unlimited`);
    assert.equal(h.sent.length, 1, `${scope}: one digest for the address`);
  }
  const paid = harness(rows);
  await paid.run("paid");
  assert.ok(JSON.stringify(paid.alertQueries[0]!.where).includes(adminEmail));
  const other = harness([owned("x", { ...admin, email: "someone@example.com" }, { targetCents: 1000, lastPriceCents: 1200, price: 950 })]);
  assert.equal((await other.run()).targets, 0);
});

test("a paid run still applies the weekly cap to an entitled watch's plain drops", async () => {
  const h = harness([owned("a", plus, { lastPriceCents: 1000, price: 800, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1000 })]);
  const s = await h.run("paid");
  assert.equal(h.sent.length, 0);
  assert.equal(s.deferred, 1);
});

test("PAID_SEND_CAP defers the overflow of new digests, baselines held", async () => {
  const rows = Array.from({ length: PAID_SEND_CAP + 3 }, (_, i) => owned(`p${i}`, plus, { targetCents: 1000, lastPriceCents: 1200, price: 900 }));
  const h = harness(rows);
  const s = await h.run("paid");
  assert.equal(h.sent.length, PAID_SEND_CAP);
  assert.equal(s.targets, PAID_SEND_CAP + 3);
  assert.equal(s.deferred, 3);
  assert.equal(s.held, 3);
  assert.equal(h.writes.length, PAID_SEND_CAP);
});

test("a Plus account's targets beyond its limit are not honoured; Premium has no limit", async () => {
  const many = (user: User) =>
    Array.from({ length: PLUS_TARGET_ALERT_LIMIT + 2 }, (_, i) =>
      row(`t${i}`, { email: "member@example.com", userId: "u-member", user, targetCents: 1000, lastPriceCents: 900, price: 900, createdAt: daysAgo(i) }),
    );
  const p = harness(many(plus));
  const sp = await p.run();
  assert.equal(sp.targets, PLUS_TARGET_ALERT_LIMIT);
  assert.equal(p.sent.length, 1, "one digest per address");
  const hitIds = new Set(p.items().map((i) => i.cardId));
  assert.ok(!hitIds.has(cardNum("card-t0")) && !hitIds.has(cardNum("card-t1")), "the two newest watches are the ones left out");
  assert.ok(hitIds.has(cardNum(`card-t${PLUS_TARGET_ALERT_LIMIT + 1}`)), "the oldest is honoured");
  const q = harness(many(premium));
  assert.equal((await q.run()).targets, PLUS_TARGET_ALERT_LIMIT + 2);
});

test("below-market: scored from the alert price against TCGplayer market, entitled watches only", async () => {
  // Card.marketUsd is TCGplayer's US market in USD cents; US watches need no conversion.
  const h = harness([
    owned("a", plus, { cardId: "deal", marketUsd: 1200, lastPriceCents: 1100, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1100, price: 900 }),
    // 10% under market: under the 15% floor — an ordinary (capped) drop.
    owned("b", plus, { cardId: "meh", marketUsd: 1000, lastPriceCents: 1000, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1000, price: 900 }),
    // Free: the trigger is not theirs.
    owned("c", free, { cardId: "deal", marketUsd: 1200, lastPriceCents: 1100, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1100, price: 900 }),
  ]);
  const s = await h.run();
  assert.equal(s.belowMarket, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.to, "a@example.com");
  const item = h.items()[0]!;
  assert.equal(item.kind, "below_market");
  assert.deepEqual(item.tcgMarket, { marketCents: 1200, marketUsdCents: 1200, belowCents: 300, belowPct: 25 });
  assert.equal(s.deferred, 2, "b and c wait out their week");
});

test("below-market in the UK converts TCGplayer's USD market with OP's fx table", async () => {
  const h = harness([owned("a", plus, { cardId: "deal", market: "UK", marketUsd: 2000, lastPriceCents: 1100, lastNotifiedAt: daysAgo(2), lowestEmailedCents: 1100, price: 900 })]);
  await h.run();
  const item = h.items()[0]!;
  assert.equal(item.kind, "below_market");
  assert.equal(item.tcgMarket!.marketUsdCents, 2000);
  assert.ok(item.tcgMarket!.marketCents > 1000 && item.tcgMarket!.marketCents < 2000, "a pound is worth more than a dollar");
});

test("below-market never fires on an eBay price: the alert price has no eBay in it", async () => {
  const h = harness([owned("a", plus, { cardId: "deal", marketUsd: 1200, lastPriceCents: 1100 })], {
    stores: [listing("deal", 400, { source: "ebay" }), listing("deal", 1100)],
  });
  const s = await h.run();
  assert.equal(s.belowMarket, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(s.outlierHeld, 0, "the eBay $4 is not even a candidate low");
});

// ── The stores behind the price ─────────────────────────────────────────────

test("the email names up to three stores from the same rows as the price; postage is never invented", async () => {
  const h = harness([owned("a", plus, { cardId: "c1", targetCents: 1000, lastPriceCents: 1200 })], {
    stores: [
      listing("c1", 950, { source: "tcgplayer", condition: "NM", url: "https://www.tcgplayer.com/product/1" }),
      listing("c1", 960, { source: "store:alpha" }),
      listing("c1", 970, { source: "store:beta" }),
      listing("c1", 980, { source: "store:gamma" }),
      listing("c1", 300, { source: "ebay" }),
    ],
  });
  await h.run();
  const item = h.items()[0]!;
  assert.equal(item.currentCents, 950, "eBay's $3 is not the price");
  assert.deepEqual(item.stores.map((s) => s.name), [sourceLabel("tcgplayer"), sourceLabel("store:alpha"), sourceLabel("store:beta")]);
  for (const st of item.stores) assert.deepEqual([st.postageCents, st.postageBasis, st.deliveredCents], [null, null, null], "OP stores state no postage: item price only");
  assert.match(item.stores[0]!.url, /tcgplayer/);
  assert.equal(item.condition, "NM");
  assert.deepEqual(item.checkedAt, hoursAgo(2));
});

test("alertPostage never claims postage OP Compare does not know", () => {
  assert.deepEqual(alertPostage({ source: "store:anything", priceCents: 500 }, "AU"), { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null });
  assert.deepEqual(alertPostage({ source: "tcgplayer", priceCents: 500 }, "US"), { postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null });
});

test("a failing price read aborts the run: nothing sent, nothing written", async () => {
  const h = harness([row("x", { lastPriceCents: 700, price: 500 })], { priceQueryFails: true });
  await assert.rejects(h.run(), /db down/);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
});

test("the run makes no nested-cache calls and reads TCGplayer market from the card row", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/price-alerts.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(code, /unstable_cache|cachedOrDirect|getTcgDealRanks/);
  assert.match(code, /marketUsd/);
  assert.doesNotMatch(code, /offer\.findMany/, "every Offer read goes through lib/alert-price.ts");
});

// ── The email ────────────────────────────────────────────────────────────────

test("target email copy names the price and the store; postage is never invented", () => {
  const base = {
    name: "Monkey.D.Luffy",
    setCode: "OP01",
    number: "OP01-003",
    url: "https://x/card/a",
    market: "US" as const,
    currency: "USD",
    alertId: "a",
    cardId: 100001,
    startPriceCents: null,
    condition: "Near Mint",
    checkedAt: NOW,
    tcgMarket: null,
    soldOutAt: null,
    preorder: false,
    releasedOn: null,
    referenceCents: 1200,
    referenceBasis: "last" as const,
    change: { cents: 300, pct: 25 },
  };
  const store = { retailer: "store:shopx", name: "Shop X", url: "https://shopx.example/a", priceCents: 900, condition: null, postageCents: null, postageBasis: null, postageUpTo: false, deliveredCents: null };
  const hit: PriceDropItem = { ...base, kind: "target", currentCents: 900, targetCents: 1000, stores: [store] };
  assert.equal(priceDropCopy([hit]).subject, "Monkey.D.Luffy hit your $10.00 target: $9.00 at Shop X");
  assert.match(priceDropCopy([hit, { ...hit, kind: "drop", targetCents: null }]).subject, /\(\+1 more\)$/);
  assert.equal(priceDropCopy([{ ...hit, stores: [] }]).subject, "Monkey.D.Luffy hit your $10.00 target: $9.00");
  const html = dropRow(hit);
  assert.match(html, /Your target \$10\.00 · now <strong[^>]*>\$9\.00<\/strong> · \$1\.00 under it/);
  assert.match(html, /<strong[^>]*>Shop X<\/strong> · \$9\.00 item price, postage extra/);
  assert.match(html, /item price, postage extra/);
  assert.doesNotMatch(html, /delivered/i);
  assert.match(dropRow({ ...hit, stores: [{ ...store, name: "<b>A&B</b>" }] }), /&lt;b&gt;A&amp;B&lt;\/b&gt;/);

  assert.equal(postageNote({ postageCents: null, postageBasis: null, postageUpTo: false }, "USD"), "item price, postage extra");
  assert.equal(postageNote({ postageCents: 0, postageBasis: "measured", postageUpTo: false }, "USD"), "free postage");
  assert.equal(postageNote({ postageCents: 450, postageBasis: "listing", postageUpTo: false }, "USD"), "+ $4.50 postage");
  assert.equal(postageNote({ postageCents: 800, postageBasis: "estimate", postageUpTo: false }, "USD"), "+ $8.00 postage (est.)");

  const below: PriceDropItem = { ...hit, kind: "below_market", targetCents: null, tcgMarket: { marketCents: 1420, marketUsdCents: 940, belowCents: 520, belowPct: 36.6 } };
  assert.equal(priceDropCopy([below]).subject, "Monkey.D.Luffy: $9.00 at Shop X, 37% under TCGplayer market");
  assert.match(dropRow(below), /≈ \$14\.20 · 37% under/);
});

test("a paid digest links Deal Finder filtered to the member's watchlist", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/email.ts"), "utf8");
  assert.match(src, /\/tools\/deal-finder\?mine=watch/);
});
