import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MIN_CONDITION,
  initialMinCondition,
  meetsMinCondition,
  parseBasketPrefs,
  parseMinCondition,
  playedCopiesNote,
  playedCopyCount,
  storedMinCondition,
  toStoredMinCondition,
} from "../src/lib/basket-condition";
import { loadBasketPrefs, loadStoreListings, saveMinConditionPref } from "../src/lib/basket-server";
import { parseBasketRequest } from "../src/lib/basket-request";
import { basketPreview, optimizeBasket, type BasketCard } from "../src/lib/basket";
import { basketStoresFor, postageOptionsFrom } from "../src/lib/shipping";
import { createDeckWatch, priceDeckList, updateDeckWatch, type DeckWatchRouteDb } from "../src/lib/deck-watch";
import { BIRDS, COUNTERSPELL, NOW, deckHarness, deckRow, fixtureSource, plus, premium, servePlane, uidOf, type StoreRow } from "./helpers/deck-watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// MINIMUM CONDITION (RiftCompare's tests/min-condition.test.ts, for MTG Compare).
// Best Basket and the deck price watch price only listings at or above the
// member's floor, filtered INSIDE loadStoreListings. MTG Compare keeps ONE row
// per (product, store, market) — the store's best-condition copy — so a floor
// can only drop a store's row, never swap it for a better copy.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Two real stores of this market's basket map (the registry, never a hand-typed name).
const [S1, S2] = Object.keys(basketStoresFor("US", {})).filter((k) => k !== "tcgplayer");
const STORES = [S1!, S2!];
const stop = servePlane();
after(stop);
const BIRDS_UID = uidOf(BIRDS), COUNTER_UID = uidOf(COUNTERSPELL);
const [NM, LP, MP, HP] = [0, 1, 2, 3];   // CONDITIONS indexes

test("grades: NM/Mint and an unstated condition are Near Mint; LP passes 'LP or better' but not 'NM only'; MP and worse pass neither", () => {
  for (const c of ["Near Mint", "NM", "Mint", null, undefined, "", "Default Title"]) {
    assert.equal(meetsMinCondition(c, "nm"), true, `${c} reads as NM`);
    assert.equal(meetsMinCondition(c, "lp"), true);
  }
  assert.equal(meetsMinCondition("Lightly Played", "nm"), false);
  assert.equal(meetsMinCondition("LP", "lp"), true, "the LP boundary is inside 'LP or better'");
  assert.equal(meetsMinCondition("Moderately Played", "lp"), false, "the MP boundary is outside it");
  assert.equal(meetsMinCondition("MP", "lp"), false);
  assert.equal(meetsMinCondition("HP", "lp"), false);
  assert.equal(meetsMinCondition("DMG", "lp"), false);
  for (const c of ["DMG", "HP", "MP", "LP", "NM", null]) assert.equal(meetsMinCondition(c, "any"), true, `${c}: no floor`);
});

test("the floor filters each store's row before the per-store reduction; eBay and unknown sources never enter", async () => {
  const rows: StoreRow[] = [
    { uid: BIRDS_UID, source: `store:${S1}`, priceCents: 500, condition: HP },
    { uid: BIRDS_UID, source: `store:${S2}`, priceCents: 700, condition: LP },
    { uid: BIRDS_UID, source: "ebay", priceCents: 100, condition: null },
    { uid: BIRDS_UID, source: "ebay_us", priceCents: 90, condition: null },
    { uid: BIRDS_UID, source: "store:notastore", priceCents: 50, condition: null },
  ];
  const src = fixtureSource(rows);
  const at = async (floor: "any" | "lp" | "nm") => (await loadStoreListings([String(BIRDS_UID)], "US", STORES, floor, src.listings)).get(String(BIRDS_UID)) ?? [];
  assert.deepEqual((await at("any")).map((l) => [l.retailer, l.priceCents]).sort(), [[S1, 500], [S2, 700]].sort());
  assert.deepEqual((await at("lp")).map((l) => [l.retailer, l.priceCents]), [[S2, 700]], "the HP-only store leaves at LP or better");
  assert.deepEqual(await at("nm"), [], "nothing at NM: not covered");
});

test("a card with nothing at the floor is not covered: no listing, never a played copy in its place", async () => {
  const src = fixtureSource([
    { uid: COUNTER_UID, source: `store:${S1}`, priceCents: 300, condition: HP },
    { uid: COUNTER_UID, source: `store:${S2}`, priceCents: 400, condition: MP },
  ]);
  const map = await loadStoreListings([String(COUNTER_UID)], "US", STORES, "lp", src.listings);
  assert.equal(map.has(String(COUNTER_UID)), false);
  const stores = basketStoresFor("US", postageOptionsFrom("US", null, null));
  const card: BasketCard = { cardId: String(COUNTER_UID), name: "Counterspell", slug: "counterspell-mh2-267", qty: 2, listings: map.get(String(COUNTER_UID)) ?? [] };
  const plan = optimizeBasket([card], stores);
  assert.equal(plan.coveredCopies, 0);
  assert.deepEqual(plan.unbuyable, [{ name: "Counterspell", qty: 2 }]);
  const anyMap = await loadStoreListings([String(COUNTER_UID)], "US", STORES, "any", src.listings);
  assert.equal(anyMap.get(String(COUNTER_UID))?.length, 2, "…while 'Anything' still finds them");
});

test("the floor adds no reads: one cached listing read per 40-card chunk whatever the floor", async () => {
  const src = fixtureSource([{ uid: BIRDS_UID, source: `store:${S1}`, priceCents: 1000, condition: NM }]);
  await loadStoreListings([String(BIRDS_UID)], "US", STORES, "nm", src.listings);
  await loadStoreListings([String(BIRDS_UID)], "US", STORES, "any", src.listings);
  assert.deepEqual(src.reads, [[BIRDS_UID], [BIRDS_UID]]);
  const ids = Array.from({ length: 95 }, (_, i) => String((i + 1) * 2));
  const src2 = fixtureSource([]);
  await loadStoreListings(ids, "US", STORES, "any", src2.listings);
  assert.deepEqual(src2.reads.map((r) => r.length), [40, 40, 15], "sorted 40-id chunks, so a list re-priced hits the same cache entries");
});

test("the request: the floor defaults to 'any' so every existing caller is unchanged; junk is 'any'", () => {
  assert.equal(parseBasketRequest({ source: "deck", text: "3 Birds of Paradise" }).minCondition, "any");
  assert.equal(parseBasketRequest(null).minCondition, "any");
  assert.equal(parseBasketRequest({ minCondition: "lp" }).minCondition, "lp");
  assert.equal(parseBasketRequest({ minCondition: "nm" }).minCondition, "nm");
  assert.equal(parseBasketRequest({ minCondition: "mint" }).minCondition, "any");
  assert.equal(parseBasketRequest({ minCondition: 1 }).minCondition, "any");
  assert.equal(parseBasketRequest({}).saveMinCondition, false);
  assert.equal(parseBasketRequest({ saveMinCondition: true }).saveMinCondition, true);
  assert.equal(parseMinCondition(undefined, DEFAULT_MIN_CONDITION), "lp");
});

test("the floor is Premium's: the route prices a non-Premium request at 'any' and only echoes/remembers it for Premium", () => {
  const route = read("src/app/api/basket/route.ts");
  assert.match(route, /buildBasket\(user\.id, full, request, full \? request\.minCondition : "any"/);
  assert.match(route, /if \(full && request\.saveMinCondition/);
  assert.match(route, /loadStoreListings\(\[\.\.\.wanted\.keys\(\)\], country, Object\.keys\(stores\), minCondition\)/);
  const preview = route.slice(route.indexOf("const preview = basketPreview("), route.indexOf("const { plan, alternatives }"));
  assert.ok(preview.length > 20, "found the free branch");
  assert.doesNotMatch(preview, /minCondition/);
});

test("the free total says how many played copies it includes, from the plan's lines only (a count, no store)", async () => {
  const src = fixtureSource([
    { uid: BIRDS_UID, source: `store:${S1}`, priceCents: 500, condition: HP },
    { uid: COUNTER_UID, source: `store:${S1}`, priceCents: 800, condition: LP },
  ]);
  const listings = await loadStoreListings([String(BIRDS_UID), String(COUNTER_UID)], "US", STORES, "any", src.listings);
  const cards: BasketCard[] = [
    { cardId: String(BIRDS_UID), name: "Birds of Paradise", slug: "birds-of-paradise-7ed-231", qty: 3, listings: listings.get(String(BIRDS_UID)) ?? [] },
    { cardId: String(COUNTER_UID), name: "Counterspell", slug: "counterspell-mh2-267", qty: 1, listings: listings.get(String(COUNTER_UID)) ?? [] },
  ];
  const plan = optimizeBasket(cards, basketStoresFor("US", postageOptionsFrom("US", null, null)));
  const preview = basketPreview(plan);
  assert.equal(preview.playedCopies, 3, "only the three HP copies are below LP");
  assert.equal(playedCopiesNote(3), "Includes 3 played copies (below Lightly Played)");
  assert.equal(playedCopiesNote(1), "Includes 1 played copy (below Lightly Played)");
  assert.doesNotMatch(JSON.stringify(preview), new RegExp(`${S1}|https?:`, "i"), "no store name or link in the preview");
  assert.equal(playedCopyCount([{ qty: 2, condition: null }, { qty: 1, condition: "LP" }]), 0);
});

test("the page and the watch agree: the same list at the same floor is the same delivered total", async () => {
  const rows: StoreRow[] = [
    { uid: BIRDS_UID, source: `store:${S1}`, priceCents: 500, condition: HP },
    { uid: BIRDS_UID, source: `store:${S2}`, priceCents: 1000, condition: NM },
    { uid: COUNTER_UID, source: `store:${S2}`, priceCents: 2000, condition: NM },
  ];
  const src = fixtureSource(rows);
  const stores = basketStoresFor("US", postageOptionsFrom("US", null, null));
  for (const floor of ["any", "lp", "nm"] as const) {
    const watch = await priceDeckList(src, { listText: "3 Birds of Paradise (7ED) 231\n1 Counterspell (MH2) 267", market: "US", region: null, trackedOnly: null, minCondition: floor });
    assert.ok(watch, floor);
    const listings = await loadStoreListings([String(BIRDS_UID), String(COUNTER_UID)], "US", Object.keys(stores), floor, src.listings);
    const page = optimizeBasket(
      [
        { cardId: String(BIRDS_UID), name: "Birds of Paradise", slug: "birds-of-paradise-7ed-231", qty: 3, listings: listings.get(String(BIRDS_UID)) ?? [] },
        { cardId: String(COUNTER_UID), name: "Counterspell", slug: "counterspell-mh2-267", qty: 1, listings: listings.get(String(COUNTER_UID)) ?? [] },
      ],
      stores,
    );
    assert.equal(watch.plan.totalCents, page.totalCents, `floor ${floor}: page and watch totals equal`);
  }
  const lp = await priceDeckList(src, { listText: "3 Birds of Paradise (7ED) 231\n1 Counterspell (MH2) 267", market: "US", region: null, trackedOnly: null, minCondition: "lp" });
  assert.equal(lp!.plan.itemsCents, 3 * 1000 + 2000, "LP or better: the NM copies");
  assert.equal(lp!.complete, true);
});

function routeDb(seed: Record<string, unknown>[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  const db = {
    deckWatch: {
      count: async () => rows.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `d${rows.length + 1}`, lastTotalCents: null, lastCheckedAt: null, lastEmailedCents: null, lastNotifiedAt: null, snoozedUntil: null, createdAt: NOW, ...data };
        rows.push(r);
        return r;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      findMany: async () => rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  return { db: db as unknown as DeckWatchRouteDb, rows };
}
const me = (id: string, tier: typeof premium) => ({ ...tier, id, email: `${id}@example.com` });

test("a NEW deck watch starts on 'LP or better'; 'anything' is stored as null; a bad value is a 400", async () => {
  const { db, rows } = routeDb();
  assert.equal((await createDeckWatch(db, me("o", premium), { listText: "3 Birds of Paradise (7ED) 231" }, "US")).status, 201);
  assert.equal(rows[0]!.minCondition, "lp", "the new-watch default");
  assert.equal((await createDeckWatch(db, me("o", premium), { listText: "3 Birds of Paradise (7ED) 231", minCondition: "nm" }, "US")).status, 201);
  assert.equal(rows[1]!.minCondition, "nm");
  assert.equal((await createDeckWatch(db, me("o", premium), { listText: "3 Birds of Paradise (7ED) 231", minCondition: "any" }, "US")).status, 201);
  assert.equal(rows[2]!.minCondition, null, "'any' is null");
  assert.equal((await createDeckWatch(db, me("o", premium), { listText: "3 Birds of Paradise (7ED) 231", minCondition: "pristine" }, "US")).status, 400);
  assert.equal(storedMinCondition(null), "any");
  assert.equal(toStoredMinCondition("any"), null);
});

test("changing a watch's floor re-baselines it and never alerts a false drop", async () => {
  const { db, rows } = routeDb([
    { id: "d1", userId: "o", market: "US", name: "Deck", listText: "3 Birds of Paradise (7ED) 231", minCondition: "lp", targetCents: null, lastTotalCents: 10_000, lastEmailedCents: 9_800, lastNotifiedAt: NOW, snoozedUntil: null },
  ]);
  assert.equal((await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "lp" }, NOW)).status, 200);
  assert.equal(rows[0]!.lastTotalCents, 10_000, "the same floor keeps its baseline");
  assert.equal((await updateDeckWatch(db, me("o", plus), "d1", { minCondition: "nm" }, NOW)).status, 402, "editing the floor is Premium's");
  assert.equal((await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "shiny" }, NOW)).status, 400);
  assert.equal((await updateDeckWatch(db, me("o", premium), "d1", { minCondition: "any" }, NOW)).status, 200);
  assert.equal(rows[0]!.minCondition, null);
  assert.equal(rows[0]!.lastTotalCents, null, "re-baselined");
  assert.equal(rows[0]!.lastEmailedCents, null);
  const listings: StoreRow[] = [
    { uid: BIRDS_UID, source: `store:${S1}`, priceCents: 500, condition: HP },
    { uid: COUNTER_UID, source: `store:${S1}`, priceCents: 2000, condition: NM },
  ];
  const h = deckHarness([deckRow("d1", premium, { minCondition: null })], listings);
  const s = await h.run();
  assert.equal(s.drops, 0, "no false drop");
  assert.equal(h.notified.length, 0);
  assert.ok(h.writeFor("d1")!.lastTotalCents != null, "the new floor's total is the new baseline");
});

test("the member's last choice is remembered (User.basketPrefs), a new session starts on LP or better, and a failed read is 'no prefs'", async () => {
  assert.equal(initialMinCondition(null), "lp");
  assert.equal(initialMinCondition({}), "lp");
  assert.equal(initialMinCondition({ minCondition: "any" }), "any");
  assert.deepEqual(parseBasketPrefs({ minCondition: "nm", other: 1 }), { minCondition: "nm" });
  assert.deepEqual(parseBasketPrefs("garbage"), {});
  let stored: unknown = null;
  const writes: unknown[] = [];
  const db = {
    user: {
      findUnique: async () => ({ basketPrefs: stored }),
      update: async ({ data }: { data: { basketPrefs: unknown } }) => {
        writes.push(data.basketPrefs);
        stored = data.basketPrefs;
        return {};
      },
    },
  } as unknown as Parameters<typeof saveMinConditionPref>[2];
  await saveMinConditionPref("u", "nm", db);
  assert.deepEqual(stored, { minCondition: "nm" });
  await saveMinConditionPref("u", "nm", db);
  assert.equal(writes.length, 1, "no write when it is already what is stored");
  stored = { minCondition: "nm", region: "NE" };
  await saveMinConditionPref("u", "any", db);
  assert.deepEqual(stored, { minCondition: "any", region: "NE" }, "read-merge keeps other keys");
  assert.deepEqual(await loadBasketPrefs("u", db as unknown as Parameters<typeof loadBasketPrefs>[1]), { minCondition: "any" });
  const broken = { user: { findUnique: async () => { throw new Error("db down"); } } } as unknown as Parameters<typeof loadBasketPrefs>[1];
  assert.deepEqual(await loadBasketPrefs("u", broken), {});
});

test("the page code stays client-safe", () => {
  const pure = read("src/lib/basket-condition.ts");
  const imports = [...pure.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./match"], "the client-safe module imports only the pure condition grades");
  const best = read("src/components/BestBasket.tsx");
  assert.doesNotMatch(best, /from "@\/lib\/basket-server"/);
  assert.doesNotMatch(best, /from "@\/lib\/shipping"/, "the snapshot and the store list stay out of the browser bundle");
});
