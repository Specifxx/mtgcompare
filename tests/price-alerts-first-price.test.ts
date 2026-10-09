import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST_CONTACT_SEND_CAP, FIRST_PRICE_SEND_CAP, isFirstPrice } from "../src/lib/price-alerts";
import { dropRow, priceDropCopy, type PriceDropItem } from "../src/lib/email";
import { daysAgo, harness, listing, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// "Get a price alert" on a card no store lists yet: a null → priced move sends
// a "now listed" notice (2026-09-25 lineup). It shares the weekly per-address
// cap with drops and has its own per-run cap (FIRST_PRICE_SEND_CAP, 25 since
// the 2026-09-25 alerts rework), and both defer (baseline held at null).
//
// PRE-ORDERS. While the card's set has not released (Set.releasedOn), the
// same notice is labelled "open for pre-order" and never becomes the drop
// reference — a set's singles list at TCGplayer in the week before release, a week
// before anyone can ship them, and every one used to read "now in stock".
// ─────────────────────────────────────────────────────────────────────────────

const PRE_RIFT = new Date("2026-10-16T09:00:00Z"); // OP-99 (a made-up set) releases 2026-10-23
const OP99 = new Date("2026-10-23T00:00:00Z");

test("isFirstPrice: only never-priced → priced", () => {
  assert.equal(isFirstPrice(null, 500), true);
  assert.equal(isFirstPrice(null, null), false);
  assert.equal(isFirstPrice(700, 500), false, "a drop is not a first price");
  assert.equal(isFirstPrice(500, 700), false);
});

test("null → priced emails exactly one 'listed' item and writes the baseline", async () => {
  const h = harness([row("a", { price: 1299, startPriceCents: null })]);
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  const item = h.items()[0]!;
  assert.equal(item.kind, "listed");
  assert.equal(item.referenceCents, null);
  assert.equal(item.change, null);
  assert.equal(item.currentCents, 1299);
  assert.equal(item.preorder, false);
  assert.equal(summary.listed, 1);
  assert.equal(summary.drops, 0, "a first listing is not counted as a drop");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0]!.data.lastPriceCents, 1299);
  assert.equal(h.writes[0]!.data.lowestEmailedCents, 1299, "the first price becomes the reference");
});

test("a card from an unreleased set is labelled a PRE-ORDER, and never becomes the drop reference", async () => {
  // The listing must be fresh relative to PRE_RIFT, so it is passed explicitly.
  const h2 = harness([row("a", { setCode: "OP99", releasedOn: OP99 })], {
    now: PRE_RIFT,
    stores: [listing("card-a", 1299, { updatedAt: new Date(PRE_RIFT.getTime() - 3600_000) })],
  });
  const s = await h2.run();
  assert.equal(s.listed, 1);
  assert.equal(s.preorders, 1);
  const item = h2.items()[0]!;
  assert.equal(item.kind, "preorder");
  assert.equal(item.preorder, true);
  assert.equal(item.releasedOn, "2026-10-23");
  assert.equal(h2.writes[0]!.data.lastPriceCents, 1299);
  assert.equal(h2.writes[0]!.data.lowestEmailedCents, undefined, "a pre-order price never seeds the watermark");
  assert.ok(h2.writes[0]!.data.lastNotifiedAt, "but it is an email about this card");
  const copy = priceDropCopy([item]);
  assert.match(copy.subject, /is open for pre-order from/);
  assert.doesNotMatch(`${copy.subject} ${copy.heading} ${copy.intro} ${dropRow(item)}`, /in stock/i);
  // After release day the same card lists as an ordinary card.
  const after = harness([row("b", { setCode: "OP99", releasedOn: OP99, price: 1299 })]);
  await after.run();
  assert.equal(after.items()[0]!.kind, "listed");
});

test("a still-unpriced card does nothing", async () => {
  const h = harness([row("a")]);
  const summary = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(summary.listed, 0);
});

test("a quiet address keeps a null baseline, so the notice re-detects next run", async () => {
  const h = harness([row("a", { price: 999, lastNotifiedAt: daysAgo(2) })]);
  const summary = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(summary.listed, 1);
  assert.equal(summary.deferred, 1);
  assert.equal(summary.held, 1);
  assert.equal(h.writes.length, 0, "no baseline write — lastPriceCents stays null");
});

test("the per-run send cap (25) defers the overflow instead of dropping it", async () => {
  assert.equal(FIRST_PRICE_SEND_CAP, 25);
  const rows = Array.from({ length: FIRST_PRICE_SEND_CAP + 5 }, (_, i) => row(`r${i}`, { price: 500 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_PRICE_SEND_CAP);
  assert.equal(summary.listed, FIRST_PRICE_SEND_CAP + 5);
  assert.equal(summary.deferred, 5);
  assert.equal(summary.held, 5);
  assert.equal(h.writes.length, FIRST_PRICE_SEND_CAP, "the deferred five keep a null baseline");
});

test("several watched cards listing the same day share ONE digest, none deferred", async () => {
  const rows = ["x", "y", "z"].map((id) => row(id, { email: "fan@example.com", price: 400 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.items.length, 3);
  assert.equal(summary.deferred, 0);
  assert.equal(h.writes.length, 3);
});

test("a joined digest does not count against the cap", async () => {
  const rows = Array.from({ length: FIRST_PRICE_SEND_CAP }, (_, i) => row(`r${i}`, { price: 500 }));
  rows.push(row("extra", { email: "r0@example.com", price: 600 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_PRICE_SEND_CAP);
  assert.equal(summary.deferred, 0);
});

test("a failed send holds the first-price baseline at null for a retry", async () => {
  const h = harness([row("a", { price: 1000 })], { sendOk: false });
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(summary.emails, 0);
  assert.equal(summary.held, 1);
  assert.equal(h.writes.length, 0);
});

test("drops still send, measured from the last price", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, price: 800, startPriceCents: 1200 })]);
  const summary = await h.run();
  assert.equal(summary.drops, 1);
  assert.equal(summary.listed, 0);
  const item = h.items()[0]!;
  assert.equal(item.kind, "drop");
  assert.equal(item.referenceCents, 1000);
  assert.equal(item.startPriceCents, 1200, "the email can say where they started watching");
  assert.ok(!("startPriceCents" in h.writes[0]!.data), "the cron never writes the start price");
});

test("email copy: 'now in stock' for listings, no strikethrough on a listing", () => {
  const base = {
    name: "Lightning Bolt",
    setCode: "2XM",
    number: "141",
    url: "https://x/card/a",
    market: "US" as const,
    currency: "USD",
    alertId: "a",
    cardId: 100001,
    startPriceCents: null,
    condition: "Near Mint",
    stores: [],
    checkedAt: new Date(),
    targetCents: null,
    tcgMarket: null,
    soldOutAt: null,
    preorder: false,
    releasedOn: null,
  };
  const listed: PriceDropItem = { ...base, kind: "listed", currentCents: 1299, referenceCents: null, referenceBasis: null, change: null };
  const drop: PriceDropItem = { ...base, kind: "drop", currentCents: 1299, referenceCents: 1500, referenceBasis: "last", change: { cents: 201, pct: 13 } };

  const l = priceDropCopy([listed]);
  assert.match(l.subject, /^Lightning Bolt is now in stock from /);
  assert.equal(l.heading, "Now in stock");
  for (const c of [l, priceDropCopy([listed, { ...listed, name: "B" }]), priceDropCopy([drop, listed])]) {
    assert.doesNotMatch(`${c.heading} ${c.intro} ${c.subject}`, /first time/);
  }
  // The subject names the card, the price and the saving (2026-09-25 rebuild).
  assert.equal(priceDropCopy([drop]).subject, "Lightning Bolt: $12.99, 13% off");
  // The drop leads a mixed digest (a saving outranks a listing).
  assert.equal(priceDropCopy([listed, drop]).subject, "Lightning Bolt: $12.99, 13% off (+1 more)");
  const r = dropRow(listed);
  assert.match(r, /Now in stock · from/);
  assert.doesNotMatch(r, /line-through|NaN|Infinity/);
  assert.match(dropRow(drop), /line-through/);
  assert.match(dropRow(drop), /save \$2\.01 \(−13%\)/);
});

test("the watch modal and /alerts say 'in stock' for an unpriced card, never 'first'", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  // Restocks are real (lib/price-alerts.ts isRestock), so the modal's promise
  // holds for every watcher.
  assert.match(read("src/components/PriceAlertModal.tsx"), /when this card is in stock or gets cheaper/);
  assert.match(read("src/lib/alerts-copy.ts"), /Can I watch a card with no price yet\?/);
  assert.doesNotMatch(read("src/components/PriceAlertModal.tsx"), /first in stock|No store has it yet/);
});

test("first-contact drop digests are capped per run; the overflow is deferred with its baseline held", async () => {
  const rows = Array.from({ length: FIRST_CONTACT_SEND_CAP + 5 }, (_, i) => row(`n${i}`, { lastPriceCents: 1000, price: 800 }));
  rows.push(row("known", { lastPriceCents: 1000, price: 800, lastNotifiedAt: daysAgo(40), lowestEmailedCents: 900 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(summary.drops, FIRST_CONTACT_SEND_CAP + 6);
  assert.equal(h.sent.length, FIRST_CONTACT_SEND_CAP + 1, "the cap's worth of new addresses, plus the known one");
  assert.ok(h.sent.some((m) => m.to === "known@example.com"), "an address emailed before is never held by this cap");
  assert.equal(summary.deferred, 5);
  assert.equal(summary.held, 5);
  const written = new Set(h.writes.map((w) => w.id));
  for (let i = FIRST_CONTACT_SEND_CAP; i < FIRST_CONTACT_SEND_CAP + 5; i++) assert.ok(!written.has(`n${i}`));
});

test("a second card joining a first-contact digest already opened is not counted", async () => {
  const rows = Array.from({ length: FIRST_CONTACT_SEND_CAP }, (_, i) => row(`n${i}`, { lastPriceCents: 1000, price: 800 }));
  rows.push(row("second", { email: "n0@example.com", lastPriceCents: 700, price: 600 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_CONTACT_SEND_CAP);
  assert.equal(summary.deferred, 0);
});
