import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getBrowseIndex } from "../src/lib/data/catalog";
import { cutDealList, rankFromIndex } from "../src/lib/data/deals";
import { unitUids } from "../src/lib/deal-pages";
import { hrefFor, parseDealFinderParams } from "../src/lib/deal-finder-href";
import { entitlementOf } from "../src/lib/premium";
import { STORES } from "../src/lib/stores";
import { ixPath } from "../src/lib/data/plane/shards";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

// ─────────────────────────────────────────────────────────────────────────────
// "ONLY MY CARDS" on the Deal Finder (Plus and Premium; parity P29): the account's watchlist (this browser's list plus its price alerts) and, new on this site, its
// binder (the collection). The filter runs BEFORE paging inside the loader, so the total and the page describe the list the reader is looking at; below full access it is
// a refinement like any other and is coerced away. Real products of the fixture: African Swallow - Birds of Paradise, Birds of Paradise (7ED) and Sol Ring.
// ─────────────────────────────────────────────────────────────────────────────

// ── the served tree: four real units on sale in the US (store prices set below their real TCGplayer market) ──
const SWALLOW = 560662, BIRDS = 2831, SOL_RING = 594545;
const SWALLOW_F = SWALLOW * 2 + 1, SWALLOW_N = SWALLOW * 2, BIRDS_N = BIRDS * 2, SOL_F = SOL_RING * 2 + 1;
const US_STORES = STORES.filter((s) => s.country === "US" && s.platform !== "feed");
const STORE_A = US_STORES[0]!, STORE_B = US_STORES[1]!;
/** [uid, store A price, store B price] in US cents (null = not on offer there). */
const OFFERS: [number, number | null, number | null][] = [[SWALLOW_F, null, 4000], [SWALLOW_N, 3000, 3300], [BIRDS_N, 1599, null], [SOL_F, 500, 520]];

function serveDeals(counts = 4): () => void {
  const t = realMiniTree();
  const K = JSON.parse(t.read(ixPath("k", 0))) as { id: number[] };
  const none = [-1, -1, -1, -1, -1, -1];
  const lows = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/magic-products.json"), "utf8")) as { productId: number; prices: Record<string, { low: number | null }> }[];
  const lowOf = (uid: number): number => Math.round((lows.find((p) => p.productId === uid >> 1)!.prices[uid & 1 ? "Foil" : "Normal"]!.low ?? 0) * 100);
  const u = OFFERS.map(([uid, a, b]) => {
    const smin = Math.min(...[a, b].filter((x): x is number => x != null));
    return [K.id.indexOf(uid >> 1), uid & 1, lowOf(uid), ...none.slice(1), 1, 0, 0, 0, 0, 0, smin, ...none.slice(1)];
  });
  t.write(ixPath("s", 0), JSON.stringify({ v: 1, at: "2026-10-07", u }));
  const flat = OFFERS.flatMap(([uid, a, b]) => [[uid, STORE_A.id, a], [uid, STORE_B.id, b]] as [number, number, number | null][]).filter((r) => r[2] != null);
  t.write(ixPath("f", 0), JSON.stringify({ v: 1, n: flat.length, uid: flat.map((r) => r[0]), mk: "0".repeat(flat.length), st: flat.map((r) => r[1]), pr: flat.map((r) => r[2]) }));
  t.write("hm/home.json", JSON.stringify({ v: 1, at: "2026-10-07", stats: { cards: 0, tracked: 0, sets: 0, sealed: 0, oracles: 0 }, newest: [], upcoming: [], chase: [], popular: [], up: [], down: [], dealCounts: [counts, 0, 0, 0, 0, 0], dealsFree: [null, null, null, null, null, null] }));
  const dir = writePlaneDir(t);
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  return () => { delete process.env.PLANE_DIR; resetPlaneForTests(); fs.rmSync(dir, { recursive: true, force: true }); };
}

const stop = serveDeals(4);
after(stop);
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
const future = new Date(Date.now() + 30 * 86_400_000);
const plus = entitlementOf({ isAdmin: false, premiumUntil: future, premiumTier: "plus" });
const free = entitlementOf({ isAdmin: false, premiumUntil: null, premiumTier: "premium" });
const ranking = async () => rankFromIndex(await getBrowseIndex({ withStores: true, withOracle: false }), "US", "saving", null, null);

test("a watchlist or binder holds product ids; the filter takes both finishes of each, because a collector's foil is a deal the Normal copy is not", () => {
  assert.equal(unitUids(null), undefined);
  assert.equal(unitUids(new Set()), undefined, "an empty list is no filter here: the caller answers an empty page itself");
  assert.deepEqual([...unitUids(new Set([BIRDS, SOL_RING]))!].sort((a, b) => a - b), [BIRDS * 2, BIRDS * 2 + 1, SOL_RING * 2, SOL_RING * 2 + 1].sort((a, b) => a - b));
});

test("the filter applies before paging: the total is the reader's list, not the global one", async () => {
  const r = await ranking();
  const mine = cutDealList("US", r, { onlyUids: unitUids(new Set([SWALLOW, SOL_RING])) }, plus);
  assert.deepEqual(mine.rows.map((x) => x.uid), [SWALLOW_F, SWALLOW_N, SOL_F], "Birds of Paradise is not on the list; the foil Swallow still ranks first");
  assert.equal(mine.total, 3);
  const one = cutDealList("US", r, { onlyUids: unitUids(new Set([BIRDS])) }, plus);
  assert.deepEqual(one.rows.map((x) => x.uid), [BIRDS_N]);
  assert.equal(one.total, 1);
  assert.equal(cutDealList("US", r, { onlyUids: unitUids(new Set([123456789])) }, plus).total, 0, "a card with no deal is simply absent");
});

test("a free account asking for its own cards gets the default view and a coerced flag: the API answers 402, a shared link still opens", async () => {
  const r = await ranking();
  const s = cutDealList("US", r, { onlyUids: unitUids(new Set([SOL_RING])) }, free);
  assert.equal(s.coerced, true);
  assert.deepEqual(s.rows.map((x) => x.uid), r.slice(0, 3).map((t) => t[0]), "not the one card asked for: the same three rows everyone gets");
});

test("the URL: mine=watch and mine=binder at full access only; every link goes through hrefFor", () => {
  assert.equal(parseDealFinderParams({ mine: "binder" }, { allowMine: true }).mine, "binder");
  assert.equal(parseDealFinderParams({ mine: "watch" }, { allowMine: true }).mine, "watch");
  assert.equal(parseDealFinderParams({ mine: "binder" }, { allowMine: false }).mine, null);
  assert.equal(parseDealFinderParams({ view: "ebay", mine: "binder" }, { allowMine: true }).mine, null, "Cheapest on eBay is free for everyone and has no 'mine'");
  const p = parseDealFinderParams({ mine: "binder", sort: "pct", page: "3" }, { allowMine: true });
  assert.equal(hrefFor(p), "/tools/deal-finder?sort=pct&mine=binder&page=3");
  assert.equal(hrefFor(p, { mine: null, page: 1 }), "/tools/deal-finder?sort=pct");
});

test("the route reads the account's alerts or its collection on the server, and the page offers both chips", () => {
  const route = read("src/app/api/deal-finder/route.ts");
  assert.match(route, /body\.mine === "binder"/);
  assert.match(route, /collectionRows\(user\.id\)/);
  assert.match(route, /watchedCardIds\(user\.id\)/);
  assert.match(route, /idsForSlugs\(slugs\)/, "this browser's list is merged in");
  const page = read("src/app/tools/deal-finder/page.tsx");
  assert.match(page, /\{ key: "binder", label: "My binder" \}/);
  assert.match(page, /\{ key: "watch", label: "My watchlist" \}/);
  assert.match(read("src/app/tools/deal-finder/MineDeals.tsx"), /mine: params\.mine/, "the island tells the server which list");
});
