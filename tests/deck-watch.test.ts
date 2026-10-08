import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DECK_DROP_MIN_CENTS,
  DECK_DROP_MIN_PCT,
  DECK_TARGET_REFIRE_PCT,
  WATERMARK_TTL_MS,
  createDeckWatch,
  deleteDeckWatch,
  friendlyTargetCents,
  isDeckMaterialDrop,
  listDeckWatches,
  loaderDeckSource,
  priceDeckList,
  shouldEmailDeckDrop,
  shouldEmailDeckTarget,
  updateDeckWatch,
  type DeckWatchRouteDb,
} from "../src/lib/deck-watch";
import { parseDeckList } from "../src/lib/deck";
import { DECK_WATCH_LIMIT, deckWatchLimit } from "../src/lib/tier-limits";
import { BIRDS, COUNTERSPELL, DAY, LIST_TEXT, NOW, deckHarness, deckRow, fixtureSource, free, lapsed, lowRows, plus, premium, realLowCents, servePlane, uidOf, type StoreRow } from "./helpers/deck-watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// DECK PRICE WATCH (Premium; the deck half of RiftCompare's watch tests for MTG
// Compare). Email is off until configured: an alert is an in-app notification
// (lastFlaggedAt) unless the run is told email is on, and then it is sent
// (lastNotifiedAt). Both move the watermark.
//
// A watch prices a list the way Best Basket does and a basket line is a UNIT,
// (productId, finish): the list below is two Birds of Paradise (7th Edition 231)
// and three Counterspell (Modern Horizons 2 267), real products of Annex A,
// resolved by the real resolver over the 57-product published tree, with
// listing rows at those products' own TCGplayer lows (tests/helpers).
// ─────────────────────────────────────────────────────────────────────────────

const stop = servePlane();
after(stop);

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const LISTINGS: StoreRow[] = lowRows();
const BIRDS_N = uidOf(BIRDS), COUNTER_N = uidOf(COUNTERSPELL), COUNTER_F = uidOf(COUNTERSPELL, "Foil");
const ask = (listText: string) => ({ listText, market: "US" as const, region: null, trackedOnly: null });
async function total(listings = LISTINGS): Promise<number> {
  const p = await priceDeckList(fixtureSource(listings), ask(LIST_TEXT));
  return p!.plan.totalCents;
}

test("the numbers, the friendly default target and the pure rules", () => {
  assert.equal(DECK_WATCH_LIMIT, 10);
  assert.equal(deckWatchLimit("premium"), 10);
  assert.equal(deckWatchLimit("plus"), 0, "Plus has no deck watches");
  assert.equal(deckWatchLimit(null), 0);
  assert.equal(DECK_DROP_MIN_PCT, 5);
  assert.equal(DECK_DROP_MIN_CENTS, 100);
  assert.equal(DECK_TARGET_REFIRE_PCT, 5);
  assert.equal(friendlyTargetCents(18740), 18500);
  assert.equal(friendlyTargetCents(4200), 4100);
  assert.equal(friendlyTargetCents(35_000), 34_000);
  assert.equal(friendlyTargetCents(50), 100, "floored at the minimum target");
  assert.equal(isDeckMaterialDrop(10_000, 9_500), true);
  assert.equal(isDeckMaterialDrop(10_000, 9_501), false);
  assert.equal(isDeckMaterialDrop(1_000, 940), false, "6% but under a whole unit");
  assert.equal(isDeckMaterialDrop(1_000, 900), true);
  const base = { targetCents: 10_000, lastNotifiedAt: hoursAgo(12), now: NOW };
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 10_001, lastEmailedCents: null }), false, "over the target");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 10_000, lastEmailedCents: null }), true, "at the target, never alerted");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 9_800, lastEmailedCents: 10_000 }), false, "2% under the last alert: not news");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 9_500, lastEmailedCents: 10_000 }), true, "5% under: news");
  assert.equal(shouldEmailDeckTarget({ ...base, totalCents: 9_900, lastEmailedCents: 10_000, lastNotifiedAt: new Date(NOW.getTime() - WATERMARK_TTL_MS - 1) }), true, "the 30-day TTL lapsed");
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: 10_000, lastTotalCents: 10_000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "a target set: the drop rule is off");
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: 10_000, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), true);
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: 9_100, lastEmailedCents: 9_300, lastNotifiedAt: hoursAgo(20), now: NOW }), false, "measured from the live alerted total");
  assert.equal(shouldEmailDeckDrop({ totalCents: 9_000, targetCents: null, lastTotalCents: null, lastEmailedCents: null, lastNotifiedAt: null, now: NOW }), false, "first run: nothing to compare");
});

test("the fixture rows are the real TCGplayer lows of the list's products (Birds of Paradise 7ED 231 $17.49, Counterspell MH2 267 $1.99)", () => {
  assert.deepEqual(LISTINGS.map((r) => [r.uid, r.priceCents]), [[BIRDS_N, 1749], [COUNTER_N, 199]]);
  assert.equal(realLowCents(COUNTERSPELL, "Foil"), 187);
});

test("priceDeckList prices the list the Best Basket way: the same resolver, the cached listings, the plan's delivered total", async () => {
  const src = fixtureSource(LISTINGS);
  const p = await priceDeckList(src, ask("Deck\n2 Birds of Paradise (7ED) 231\n1 Counterspell (MH2) 267\n2 Nobody At All\nTotal: 3 cards\n// a comment"));
  assert.ok(p);
  assert.equal(p.requestedCopies, 3);
  assert.equal(p.unmatchedLines, 1, "an unmatched line is reported, never priced; headers, totals and comments are not lines");
  assert.equal(p.plan.coveredCopies, 3);
  assert.equal(p.complete, true);
  assert.equal(p.plan.itemsCents, 2 * 1749 + 199);
  assert.equal(p.plan.totalCents, p.plan.itemsCents + p.plan.shippingCents + p.plan.topUpCents);
  assert.deepEqual(src.reads, [[BIRDS_N, COUNTER_N]], "one listing read for the list, by unit");
  assert.equal(await priceDeckList(src, ask("2 Nobody At All")), null, "nothing resolved: not priced");
});

test("a basket line is a UNIT: Foil and Normal copies of one card are two lines with two prices, and a Normal listing never fills a Foil copy", async () => {
  const both: StoreRow[] = [...LISTINGS, { uid: COUNTER_F, source: "tcgplayer", priceCents: realLowCents(COUNTERSPELL, "Foil")!, condition: 0 }];
  const src = fixtureSource(both);
  const p = await priceDeckList(src, ask("1 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*"));
  assert.ok(p);
  assert.deepEqual(src.reads, [[COUNTER_N, COUNTER_F]], "two units, one read");
  assert.equal(p.plan.coveredCopies, 2);
  assert.equal(p.plan.itemsCents, 199 + 187, "each copy at its own finish's low");
  const normalOnly = await priceDeckList(fixtureSource(LISTINGS), ask("1 Counterspell (MH2) 267\n1 Counterspell (MH2) 267 *F*"));
  assert.equal(normalOnly!.plan.coveredCopies, 1, "the Foil copy has no listing of its own");
  assert.equal(normalOnly!.complete, false);
  assert.equal(normalOnly!.requestedCopies, 2);
  const merged = await priceDeckList(fixtureSource(LISTINGS), ask("2 Counterspell (MH2) 267\n1 Counterspell (MH2) 267"));
  assert.equal(merged!.requestedCopies, 3, "repeated lines of one unit are summed");
});

test("the default source reads the published files: the resolver over the plane and TCGplayer's own low as the listing (no database, no Neon)", async () => {
  const src = loaderDeckSource();
  const rows = await src.resolve(parseDeckList("1 Counterspell (MH2) 267 *F*\n1 Birds of Paradise (7ED) 231"));
  assert.deepEqual(rows.map((r) => [r.card?.id, r.finish]), [[COUNTERSPELL, "F"], [BIRDS, "N"]]);
  const tuples = await src.listings("US", [COUNTER_F, BIRDS_N]);
  assert.deepEqual(tuples.map((t) => [t[0], t[1], t[2]]).sort((a, b) => Number(a[0]) - Number(b[0])), [[BIRDS_N, "tcgplayer", 1749], [COUNTER_F, "tcgplayer", 187]]);
});

test("email off: a target met is an in-app notification (lastFlaggedAt), once, linking back to the plan; quiet until a further 5%", async () => {
  const t = await total();
  const h = deckHarness([deckRow("w1", premium, { targetCents: t, name: "Birds and Counterspell" })], LISTINGS);
  const s = await h.run();
  assert.equal(s.targets, 1);
  assert.equal(s.notified, 1);
  assert.equal(s.emails, 0);
  assert.equal(h.sent.length, 0, "nothing is sent while email is off");
  assert.equal(h.notified[0]!.type, "deck_watch");
  assert.match(h.notified[0]!.title, /^Birds and Counterspell is under your target: US\$\d+\.\d\d delivered$/);
  assert.equal(h.notified[0]!.href, "/tools/best-basket?watch=w1");
  const w = h.writeFor("w1")!;
  assert.equal(w.lastTotalCents, t);
  assert.equal(w.lastEmailedCents, t, "the watermark");
  assert.deepEqual(w.lastFlaggedAt, NOW);
  assert.equal(w.lastNotifiedAt, undefined, "lastNotifiedAt is the EMAIL stamp, never set without an email");
  const again = deckHarness([deckRow("w1", premium, { targetCents: t, lastTotalCents: t, lastEmailedCents: t, lastFlaggedAt: NOW })], LISTINGS, { now: new Date(NOW.getTime() + 12 * 3_600_000) });
  assert.equal((await again.run()).targets, 0, "the in-app stamp counts as the watermark's age");
});

test("email on: the alert is sent and stamps lastNotifiedAt; a failed send holds the baseline to re-detect", async () => {
  const t = await total();
  const h = deckHarness([deckRow("w1", premium, { targetCents: t })], LISTINGS, { emailEnabled: true });
  const s = await h.run();
  assert.equal(s.emails, 1);
  assert.equal(h.sent[0]!.to, "w1@example.com");
  assert.equal(h.sent[0]!.item.kind, "deck_target");
  assert.equal(h.sent[0]!.item.storeCount, 1);
  assert.equal(h.sent[0]!.item.stores[0]!.name, "TCGplayer");
  assert.equal(h.sent[0]!.item.requestedCopies, 5);
  assert.deepEqual(h.writeFor("w1")!.lastNotifiedAt, NOW);
  const failing = deckHarness([deckRow("w1", premium, { targetCents: t, lastTotalCents: t + 500 })], LISTINGS, { emailEnabled: true, sendOk: false });
  const s2 = await failing.run();
  assert.equal(s2.held, 1);
  assert.equal(failing.writeFor("w1")!.lastTotalCents, undefined, "baseline held");
  assert.equal(failing.writeFor("w1")!.lastEmailedCents, undefined);
});

test("with no target, a material drop alerts; a sub-5% move is stored but silent; the whole list moving in an import is what the run sees", async () => {
  const t = await total();
  const quiet = deckHarness([deckRow("w1", premium, { lastTotalCents: Math.round(t * 1.03) })], LISTINGS);
  assert.equal((await quiet.run()).drops, 0);
  assert.equal(quiet.notified.length, 0);
  assert.equal(quiet.writeFor("w1")!.lastTotalCents, t, "the last total still advances");
  const loud = deckHarness([deckRow("w1", premium, { lastTotalCents: Math.round(t * 1.2) })], LISTINGS);
  assert.equal((await loud.run()).drops, 1);
  assert.match(loud.notified[0]!.title, /is now US\$\d+\.\d\d delivered$/);
  // a later import: every low 15% down against the total the watch last saw
  const cheaper = lowRows(0.85), after = await total(cheaper);
  assert.ok(after < t);
  const next = deckHarness([deckRow("w1", premium, { lastTotalCents: t })], cheaper);
  assert.equal((await next.run()).drops, 1);
  assert.equal(next.writeFor("w1")!.lastTotalCents, after);
});

test("snoozed: no alert, baseline advances; lapsed and Plus owners are skipped untouched; a failed read aborts unwritten", async () => {
  const t = await total();
  const snoozed = deckHarness([deckRow("w1", premium, { targetCents: t, snoozedUntil: new Date(NOW.getTime() + 10 * DAY) })], LISTINGS);
  assert.equal((await snoozed.run()).snoozed, 1);
  assert.equal(snoozed.notified.length, 0);
  assert.equal(snoozed.writeFor("w1")!.lastTotalCents, t);
  assert.equal(snoozed.writeFor("w1")!.lastEmailedCents, undefined);
  const gone = deckHarness([deckRow("w1", lapsed, { targetCents: t }), deckRow("w2", plus, { targetCents: t }), deckRow("w3", free, { targetCents: t })], LISTINGS);
  assert.equal((await gone.run()).lapsed, 3);
  assert.equal(gone.writes.length, 0, "rows kept, nothing written");
  assert.equal(gone.source.reads.length, 0, "no read for an owner who is not entitled");
  await assert.rejects(priceDeckList(fixtureSource(LISTINGS, { fail: true }), ask(LIST_TEXT)), /listing read failed/, "a failed listing read is never priced as nothing in stock");
});

test("the per-account cap: rows past DECK_WATCH_LIMIT (oldest first) are not priced; an incomplete plan never fires", async () => {
  const rows = Array.from({ length: DECK_WATCH_LIMIT + 2 }, (_, i) => deckRow(`w${i}`, premium, { userId: "u-one" }));
  const h = deckHarness(rows, LISTINGS);
  assert.equal((await h.run()).priced, DECK_WATCH_LIMIT);
  const inc = deckHarness([deckRow("w1", premium, { targetCents: 1_000_000 })], [LISTINGS[0]!]);
  const s = await inc.run();
  assert.equal(s.incomplete, 1);
  assert.equal(s.targets, 0);
  assert.ok(inc.writeFor("w1")!.lastTotalCents, "the partial total is still recorded");
});

function deckDb(seed: Record<string, unknown>[] = []) {
  const rows: Record<string, unknown>[] = seed.map((r) => ({ ...r }));
  let n = rows.length;
  const db = {
    deckWatch: {
      count: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `d${++n}`, lastTotalCents: null, lastCheckedAt: null, lastEmailedCents: null, lastNotifiedAt: null, lastFlaggedAt: null, snoozedUntil: null, createdAt: NOW, ...data };
        rows.push(r);
        return r;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((x) => x.id === where.id)!, data),
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.userId === where.userId);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  };
  return { db: db as unknown as DeckWatchRouteDb, rows };
}
const u = (id: string, tier: typeof premium) => ({ ...tier, id, email: `${id}@example.com` });

test("routes: Premium to create or edit (402 otherwise); snooze and stop are any owner's; only the owner's rows; 409 at the limit", async () => {
  const { db, rows } = deckDb();
  for (const who of [free, plus, lapsed]) {
    const res = await createDeckWatch(db, u("x", who), { name: "d", listText: "3 Counterspell (MH2) 267" }, "US");
    assert.equal(res.status, 402);
    assert.equal(res.body.code, "tier_required");
  }
  const created = await createDeckWatch(db, u("owner", premium), { name: " Burn sideboard ", listText: LIST_TEXT, targetCents: 18_000, region: "NE", trackedOnly: true }, "US");
  assert.equal(created.status, 201);
  const w = created.body.watch as Record<string, unknown>;
  assert.equal(w.name, "Burn sideboard");
  assert.equal(w.targetCents, 18_000);
  assert.equal(w.region, "NE");
  assert.equal(w.market, "US");
  const named = await createDeckWatch(db, u("owner", premium), { listText: "2 Sol Ring (C21) 263 *F*\n1 Counterspell" }, "US");
  assert.equal((named.body.watch as { name: string }).name, "Sol Ring +1", "a name defaults to the first card");
  assert.equal((await createDeckWatch(db, u("owner", premium), { listText: "" }, "US")).status, 400);
  assert.equal((await createDeckWatch(db, u("owner", premium), { listText: "Sideboard\nTotal: 15 cards" }, "US")).status, 400, "headers and totals are not a list");
  assert.equal((await createDeckWatch(db, u("owner", premium), { listText: "3 Counterspell (MH2) 267", targetCents: "lots" }, "US")).status, 400);
  rows[0]!.lastEmailedCents = 17_000;
  assert.equal((await updateDeckWatch(db, u("someone-else", premium), "d1", { targetCents: 5 }, NOW)).status, 404);
  assert.equal((await updateDeckWatch(db, u("owner", plus), "d1", { targetCents: 5000 }, NOW)).status, 402);
  assert.equal((await updateDeckWatch(db, u("owner", premium), "d1", { targetCents: 15_000 }, NOW)).status, 200);
  assert.equal(rows[0]!.lastEmailedCents, null, "re-armed");
  assert.equal((await updateDeckWatch(db, u("owner", free), "d1", { snoozeDays: 30 }, NOW)).status, 200, "a lapsed owner can snooze");
  assert.equal(((await listDeckWatches(db, u("owner", premium))).body.watches as unknown[]).length, 2);
  assert.equal((await deleteDeckWatch(db, u("someone-else", premium), "d1")).status, 404);
  assert.equal((await deleteDeckWatch(db, u("owner", free), "d1")).status, 200, "a lapsed owner can stop a watch");
  const full = deckDb(Array.from({ length: DECK_WATCH_LIMIT }, (_, i) => ({ id: `x${i}`, userId: "owner" })));
  const res = await createDeckWatch(full.db, u("owner", premium), { listText: "1 Counterspell (MH2) 267" }, "US");
  assert.equal(res.status, 409);
  assert.equal(res.body.count, DECK_WATCH_LIMIT);
});

test("the routes import no Prisma client; the per-user library is in CLAUDE.md's exception", () => {
  for (const f of ["src/app/api/watches/deck/route.ts", "src/app/api/watches/deck/[id]/route.ts"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /@\/lib\/db"/);
    assert.match(src, /getCurrentUser\(\)/);
  }
});

test("the watch reads the published files, never a database or a catalogue held in memory, and never eBay", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/deck-watch.ts"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /getCatalog\b|indexCards|deckIndex/, "no whole-catalogue read");
  assert.doesNotMatch(src, /\bebay/i, "eBay is never in a deck plan");
  assert.match(src, /unitOfUid/, "a basket item is a unit");
  assert.equal((src.match(/prisma\./g) ?? []).length >= 1, true, "Neon holds the watch rows only");
  assert.doesNotMatch(src, /prisma\.(card|offer|priceHistory|publishedDeck)\b/);
});
