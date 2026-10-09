import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getBrowseIndex } from "../src/lib/data/catalog";
import { cutDealList, getDealCount, getDealRanksOf, rankFromIndex, type RankTuple } from "../src/lib/data/deals";
import { DEAL_PAGE_SIZES } from "../src/lib/data/plane/entitlement";
import { accessFor, gateMatrix, rowLimit } from "../src/lib/premium-gates";
import { entitlementOf } from "../src/lib/premium";
import { FREE_DEAL_ROWS } from "../src/lib/tier-limits";
import { STORES } from "../src/lib/stores";
import { ixPath } from "../src/lib/data/plane/shards";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

// ─────────────────────────────────────────────────────────────────────────────
// THE DEAL FINDER GATE (owner addendum 2026-10-08, section 14). The ranking is computed per request from published columns and cut ONCE, in the loader, for the
// Entitlement of the session: signed out sees the real count and no row; a free account the top 3 of the default ranking; Plus and Premium (and an admin) everything,
// with the store picker, sort, paging and "only my cards". Below full access every refinement is coerced to the default view, so no sequence of requests can enumerate
// more than the free rows. The prices are real products of the fixture (African Swallow - Birds of Paradise, Birds of Paradise, Sol Ring); the store prices are set in
// tests/helpers/deal-tree.ts below their real TCGplayer market.
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
const who = {
  out: entitlementOf(null),
  free: entitlementOf({ isAdmin: false, premiumUntil: null, premiumTier: "premium" }),
  plus: entitlementOf({ isAdmin: false, premiumUntil: future, premiumTier: "plus" }),
  premium: entitlementOf({ isAdmin: false, premiumUntil: future, premiumTier: "premium" }),
  admin: entitlementOf({ isAdmin: true, premiumUntil: null, premiumTier: "premium" }),
  lapsed: entitlementOf({ isAdmin: false, premiumUntil: new Date(Date.now() - 86_400_000), premiumTier: "premium" }),
};
async function ranking(sort: "saving" | "pct" = "saving", storeIds: ReadonlySet<number> | null = null): Promise<RankTuple[]> {
  const ix = await getBrowseIndex({ withStores: true, withOracle: false });
  const flat = new Map<number, [number, number][]>();
  if (storeIds) for (const [uid, a, b] of OFFERS) flat.set(uid, [[STORE_A.id, a], [STORE_B.id, b]].filter((r): r is [number, number] => r[1] != null));
  return rankFromIndex(ix, "US", sort, storeIds, storeIds ? flat : null);
}

test("the ranking: market-only units well under their TCGplayer market, a TCGplayer low below the store vetoes, money first", async () => {
  const r = await ranking();
  assert.deepEqual(r.map((t) => t[0]), [SWALLOW_F, SWALLOW_N, BIRDS_N, SOL_F]);
  assert.deepEqual(r.map((t) => t[3]), [1585, 1423, 690, 288], "money below the market price");
  assert.deepEqual(r.map((t) => t[4]), [28.4, 32.2, 30.1, 36.5]);
  assert.deepEqual((await ranking("pct")).map((t) => t[0]), [SOL_F, SWALLOW_N, BIRDS_N, SWALLOW_F], "percentage first");
});

test("who sees what: signed out no row and the true total; a free account the top 3; Plus, Premium and an admin everything; a lapsed Premium is a free account", async () => {
  const r = await ranking();
  const at = (w: keyof typeof who) => cutDealList("US", r, {}, who[w]);
  assert.deepEqual([at("out").rows.length, at("out").total, at("out").locked], [0, 4, true]);
  assert.deepEqual(at("free").rows.map((x) => x.uid), r.slice(0, FREE_DEAL_ROWS).map((t) => t[0]));
  assert.equal(at("free").total, 4, "the count of the rest is real");
  assert.equal(at("free").locked, true);
  for (const w of ["plus", "premium", "admin"] as const) assert.deepEqual([at(w).rows.length, at(w).locked], [4, false], w);
  assert.equal(at("lapsed").rows.length, FREE_DEAL_ROWS);
  assert.equal(accessFor("deal-finder", who.free.viewer), "preview");
  assert.equal(rowLimit("deal-finder", accessFor("deal-finder", who.out.viewer), who.out.viewer), 0, "a signed-out request is not even queried");
  assert.equal(gateMatrix().find((g) => g.feature === "deal-finder")!.free, FREE_DEAL_ROWS);
});

test("below full access every refinement is coerced to the default view: a free account paging, sorting, picking stores or asking for its own cards gets the same 3 rows", async () => {
  const r = await ranking();
  const seen = new Set<number>();
  const asks = [
    {}, { page: 2 }, { page: 9 }, { sort: "pct" as const }, { pageSize: 100 }, { buyKeys: [STORE_B.key] }, { onlyUids: new Set([SOL_F]) }, { onlyUids: new Set([BIRDS_N, SOL_F]), page: 2, sort: "pct" as const },
  ];
  for (const q of asks) for (const w of ["free", "out"] as const) {
    const s = cutDealList("US", r, q, who[w]);
    s.rows.forEach((x) => seen.add(x.uid));
    assert.equal(s.coerced, Object.keys(q).length > 0, `${w} ${JSON.stringify(q)}`);
    if (w === "free") assert.deepEqual(s.rows.map((x) => x.uid), r.slice(0, 3).map((t) => t[0]));
    else assert.equal(s.rows.length, 0);
  }
  assert.ok(seen.size <= FREE_DEAL_ROWS, `${seen.size} distinct rows ever served to a free account`);
});

test("at full access the request is honoured: sort, paging, page size, and the loader never reads a tier", async () => {
  const r = await ranking("pct");
  const p1 = cutDealList("US", r, { sort: "pct", page: 1, pageSize: 25 }, who.plus);
  assert.equal(p1.rows[0]!.uid, SOL_F);
  assert.equal(p1.coerced, false);
  assert.equal(p1.page, 1);
  assert.equal(cutDealList("US", r, { page: 2, pageSize: 25 }, who.premium).rows.length, 0, "page 2 of 4 rows at 25 a page is empty, with the true total");
  assert.deepEqual([...DEAL_PAGE_SIZES], [25, 50, 100]);
  const loader = read("src/lib/data/deals.ts").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(loader, /\.tier\b|isPremium|tierOf/, "the loader never compares a tier");
  assert.match(loader, /accessOf\("deal-finder", who\)/);
});

test("the store picker (Plus and Premium) ranks over the chosen stores' own prices; eBay and unknown keys are not stores", async () => {
  const b = await ranking("saving", new Set([STORE_B.id]));
  assert.deepEqual(b.map((t) => t[0]), [SWALLOW_F, SWALLOW_N, SOL_F], "Birds of Paradise has no offer at store B");
  assert.deepEqual(b.map((t) => t[1]), [4000, 3300, 520]);
  assert.equal(b[0]![5], STORE_B.id, "the buy side names the store");
  assert.equal((await ranking("saving", new Set())).length, 0, "no store ticked, no deal");
});

test("the count is a number from the published home file, free for everyone; ranks of a member's own units reveal positions only", async () => {
  assert.equal(await getDealCount("US"), 4);
  assert.equal(await getDealCount("AU"), 0);
  assert.match(read("src/lib/data/deals.ts"), /export async function getDealRanksOf/);
  assert.equal(typeof getDealRanksOf, "function");
});

test("the tool page, the API route and the home door ask the loader with the session's Entitlement and never hide a row with CSS", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = strip(read("src/app/tools/deal-finder/page.tsx"));
  assert.match(page, /from "@\/lib\/premium-gates"/);
  assert.match(page, /accessFor\("deal-finder", viewer\)/);
  assert.match(page, /rowLimit\("deal-finder", access, viewer\)/);
  assert.doesNotMatch(page, /blur-|backdrop-blur|select-none/, "rows are limited in the query, never hidden with CSS");
  const api = strip(read("src/app/api/deal-finder/route.ts"));
  assert.match(api, /allowsRefinement\(access\)/);
  assert.match(api, /status: 402/);
  const home = strip(read("src/app/api/top-deals/savings/route.ts"));
  assert.match(home, /status: signedIn \? 402 : 401/);
  const admin = strip(read("src/app/admin/deals/page.tsx"));
  assert.match(admin, /requireAdminPage\(\)/);
});
