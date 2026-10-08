import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { foldStoreRows } from "../src/lib/data";
import { SET_CHECKLIST_CHUNK, getBoxPools, getBoxPoolsFoil, getSetChecklist, getSetValueStats, getUpcomingSets } from "../src/lib/data/sets";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { PRICE_MASK } from "../src/lib/constants";
import { ownedBySet, ownedCardsBySet, ownedTakeFor, OWNED_TAKE, type OwnedAllDb, type OwnedDb } from "../src/lib/set-owned";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

// ─────────────────────────────────────────────────────────────────────────────
// The set checklist's data. The public half (lib/data/sets.ts getSetChecklist) reads
// the published set board st/<setId>[-k].json: EVERY listed class-0 row of the set,
// THIN ones included, priced from the board's own per-market aggregate (never eBay,
// which is not published). The per-user half (lib/set-owned.ts) is one groupBy
// scoped by userId and the row's own setId. The board below is built from real
// products of tests/fixtures/magic-products.json.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("foldStoreRows takes the cheapest store and counts distinct stores, ignoring null and non-positive minimums", () => {
  const m = foldStoreRows([
    { productId: 1, _min: { priceCents: 500 } },
    { productId: 1, _min: { priceCents: 300 } },
    { productId: 1, _min: { priceCents: null } },
    { productId: 2, _min: { priceCents: 0 } },
    { productId: 3, _min: { priceCents: 999 } },
  ]);
  assert.deepEqual(m.get(1), { minCents: 300, stores: 2 });
  assert.equal(m.has(2), false);
  assert.deepEqual(m.get(3), { minCents: 999, stores: 1 });
});

interface Fx {
  productId: number; name: string; groupId: number; group: string; groupKind: string; tcgNumber: string | null; tcgRarity: string;
  prices: Partial<Record<"Normal" | "Foil", { market: number | null; low: number | null }>>;
  expect: { slug: string; setTok: string; cls: number | string; rarity: string | null; nkey: string | null; displayName: string | null; sc: string | null };
}
const FIXTURE = JSON.parse(read("tests/fixtures/magic-products.json")) as Fx[];
const fx = (id: number): Fx => FIXTURE.find((p) => p.productId === id)!;
const cents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));

/** One board row of a real product. `usLow` is the headline unit's US aggregate (TCGplayer's own low counts in the US): derived from the fixture's Normal low, never invented; stores = 1 (TCGplayer). */
function boardRow(p: Fx, o: { thin?: boolean; treat?: string; usLow?: boolean } = {}): unknown[] {
  const n = p.prices.Normal, f = p.prices.Foil;
  let mask = PRICE_MASK.LISTED | (n ? PRICE_MASK.HASN : 0) | (f ? PRICE_MASK.HASF : 0) | (o.thin ? PRICE_MASK.THIN : 0);
  if (!n) mask |= PRICE_MASK.HEADF;
  const low = o.usLow && n?.low != null ? [cents(n.low), null, null, null, null, null] : 0;
  return [p.productId, p.expect.slug, p.expect.displayName ?? p.name, p.expect.nkey ?? p.tcgNumber ?? 0, p.expect.rarity ?? p.tcgRarity, p.expect.cls, o.treat ?? "", 0, 0, p.expect.sc ?? 0, cents(n?.market), cents(f?.market), cents(n?.low), cents(f?.low), mask, low, low ? [1, 0, 0, 0, 0, 0] : 0, null];
}
const board = (setId: number, rows: unknown[][], extra: Record<string, unknown> = {}) => ({ v: 1, set: setId, at: "2026-10-07", n: rows.length, chunk: 0, chunks: 1, c: rows, ...extra });

async function withPlane<T>(files: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const tree = realMiniTree();
  for (const [rel, v] of Object.entries(files)) tree.write(rel, JSON.stringify(v));
  const dir = writePlaneDir(tree), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir;
  resetPlaneForTests();
  try {
    return await run();
  } finally {
    if (was === undefined) delete process.env.PLANE_DIR;
    else process.env.PLANE_DIR = was;
    resetPlaneForTests();
    rmSync(dir, { recursive: true, force: true });
  }
}

const SEVENTH = 2, MKM = 23361, THIRTIETH = 17666, ONC = 17685;

test("getSetChecklist: every listed class-0 row of the set board in collector order, THIN included, priced from the board's per-market aggregate", async () => {
  const rows = [boardRow(fx(3077)), boardRow(fx(2831), { usLow: true }), boardRow(fx(478655)), boardRow(fx(449401), { thin: true })];
  await withPlane({ [`st/${SEVENTH}.json`]: board(SEVENTH, [rows[0]!, rows[1]!]), [`st/${ONC}.json`]: board(ONC, [rows[2]!]), [`st/${THIRTIETH}.json`]: board(THIRTIETH, [rows[3]!]) }, async () => {
    const seventh = await getSetChecklist(SEVENTH, "US");
    assert.deepEqual(seventh.map((c) => [c.id, c.number, c.rarity, c.setCode]), [[3077, "218", "R", "7ED"], [2831, "231", "R", "7ED"]]);
    const birds = seventh.find((c) => c.id === 2831)!;
    assert.deepEqual([birds.minCents, birds.stores, birds.otherSource, birds.printing, birds.isPromo], [1749, 1, false, "standard", false], "Birds of Paradise: TCGplayer's own Normal low, 1 store");
    const shivan = seventh.find((c) => c.id === 3077)!;
    assert.deepEqual([shivan.minCents, shivan.stores], [null, 0], "no store aggregate on the board: not stocked, never a guess");
    assert.deepEqual((await getSetChecklist(SEVENTH, "AU")).map((c) => c.minCents), [null, null], "another market reads its own slot of the aggregate");
    assert.deepEqual(await getSetChecklist(ONC, "US"), [], "a token is another checklist, not part of the set's cards");
    const thin = await getSetChecklist(THIRTIETH, "US");
    assert.deepEqual(thin.map((c) => [c.id, c.thin]), [[449401, true]], "a THIN row is noindex, not absent: the tracker is complete");
    assert.deepEqual(await getSetChecklist(99999, "US"), [], "an unknown set");
  });
});

test("getSetChecklist reads every chunk of a big board and marks a promo treatment inside an expansion as a promo the set does not count", async () => {
  const first = boardRow(fx(533889)), second = boardRow(fx(536485), { treat: "prerelease" });
  await withPlane({ [`st/${MKM}.json`]: board(MKM, [first], { chunks: 2, n: 2 }), [`st/${MKM}-1.json`]: board(MKM, [second], { chunk: 1, chunks: 2, n: 2 }) }, async () => {
    assert.equal(SET_CHECKLIST_CHUNK, 2000);
    const list = await getSetChecklist(MKM, "US");
    assert.deepEqual(list.map((c) => [c.id, c.printing, c.isPromo, c.variant]), [[533889, "standard", false, null], [536485, "prerelease", true, "Prerelease"]]);
  });
});

test("getBoxPools is the set's listed singles with their prices; getSetValueStats is the market file's per-set totals; getUpcomingSets are the announced main sets", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await withPlane({ [`st/${SEVENTH}.json`]: board(SEVENTH, [boardRow(fx(3077)), boardRow(fx(2831))]), "mk/overview.json": { v: 1, at: "2026-10-07", basket: { n: 1, totalUsd: 2289, avg: 2289, median: 2289 }, adv: 0, dec: 0, cons: [], sets: [[SEVENTH, 1, 2289]] } }, async () => {
    const pool = await getBoxPools(SEVENTH);
    assert.deepEqual(pool.map((c) => [c.id, c.marketUsd]), [[3077, 91], [2831, 2289]]);
    assert.deepEqual(await getBoxPools(99999), []);
    assert.deepEqual([...(await getBoxPoolsFoil(SEVENTH))], [[3077, null], [2831, 398075]], "Birds of Paradise Foil $3,980.75; Shivan Dragon's Foil has a single listing and no market");
    assert.deepEqual([...(await getBoxPoolsFoil(99999))], []);
    assert.deepEqual([...(await getSetValueStats())], [[SEVENTH, { n: 1, totalCents: 2289 }]]);
  });
  const tree = realMiniTree();
  const sets = JSON.parse(tree.read("meta/sets.json")) as { v: 1; at: string; sets: unknown[][] };
  for (const r of sets.sets) if (r[0] === MKM) r[7] = tomorrow;                        // Murders at Karlov Manor, announced for tomorrow in this scenario
  for (const r of sets.sets) if (r[0] === THIRTIETH) r[7] = tomorrow;                  // the 30th Anniversary Edition is a masters set: announced sets of that kind count
  for (const r of sets.sets) if (r[0] === 92) r[7] = tomorrow;                         // Prerelease Cards is a promo set: an announcement it is not
  tree.write("meta/sets.json", JSON.stringify(sets));
  const dir = writePlaneDir(tree), was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir;
  resetPlaneForTests();
  try {
    assert.deepEqual((await getUpcomingSets()).map((s) => s.id).sort((a, b) => a - b), [THIRTIETH, MKM]);
    assert.equal((await getUpcomingSets(1)).length, 1);
  } finally {
    if (was === undefined) delete process.env.PLANE_DIR;
    else process.env.PLANE_DIR = was;
    resetPlaneForTests();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the pages call the loader directly, never inside another cache", () => {
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    const c = code(f);
    assert.match(c, /getSetChecklist\(set\.id, country\)/, f);
    assert.doesNotMatch(c, /unstable_cache/, f);
  }
});

test("the owned read is one groupBy scoped by userId and the row's own set, capped, summed across conditions and finishes", async () => {
  const calls: unknown[] = [];
  const db: OwnedDb = {
    collectionCard: {
      groupBy: async (args) => {
        calls.push(args);
        return [
          { cardId: 2831, _sum: { quantity: 3 } },
          { cardId: 3077, _sum: { quantity: 0 } },
        ];
      },
    },
  };
  const owned = await ownedBySet(db, "u1", SEVENTH);
  assert.deepEqual(owned, { "2831": 3 });
  assert.deepEqual(calls[0], {
    by: ["cardId"],
    where: { userId: "u1", setId: SEVENTH },
    _sum: { quantity: true },
    orderBy: { cardId: "asc" },
    take: OWNED_TAKE,
  });
  await ownedBySet(db, "u1", [1, 2]);
  assert.deepEqual((calls[1] as { where: unknown }).where, { userId: "u1", setId: { in: [1, 2] } });
});

test("the whole-binder read is one groupBy on (set, card), scoped by userId, and a card counts once whatever its finish", async () => {
  const calls: unknown[] = [];
  const db: OwnedAllDb = {
    collectionCard: {
      groupBy: async (args) => {
        calls.push(args);
        return [{ setId: SEVENTH, cardId: 2831 }, { setId: SEVENTH, cardId: 3077 }, { setId: MKM, cardId: 533889 }];
      },
    },
  };
  const by = await ownedCardsBySet(db, "u1");
  assert.deepEqual([...by], [[SEVENTH, [2831, 3077]], [MKM, [533889]]]);
  assert.deepEqual((calls[0] as { by: string[]; where: unknown }).by, ["setId", "cardId"]);
  assert.deepEqual((calls[0] as { where: unknown }).where, { userId: "u1", setId: { not: null } });
});

test("the index reads a board only for the sets the account holds cards in, and never inside another cache", () => {
  assert.equal(ownedTakeFor([100, 200]), OWNED_TAKE);
  assert.equal(ownedTakeFor([1000, 900, 400]), 2300);
  const idx = code("src/app/portfolio/sets/page.tsx");
  assert.match(idx, /const BAR_CAP = 40/);
  assert.match(idx, /ownedCardsBySet\(await ownedDb\(\), user\.id\)/);
  assert.match(idx, /held\.map\(async \(set\) => \(\{\s*set,\s*cards: await getSetChecklist\(set\.id, country\)/);
});

test("GET /api/collection/owned is authenticated, validates the set, and answers no-store from the caller's own rows", () => {
  const c = code("src/app/api/collection/owned/route.ts");
  assert.ok(c.indexOf("getCurrentUser()") < c.indexOf("ownedBySet("));
  assert.match(c, /\{ error: "Unknown set" \}, \{ status: 400/);
  assert.match(c, /ownedBySet\(await ownedDb\(\), user\.id, set\.id\)/);
});
