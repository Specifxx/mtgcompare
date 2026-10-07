import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { foldStoreRows } from "../src/lib/data";
import { ownedBySet, ownedTakeFor, OWNED_TAKE, type OwnedDb } from "../src/lib/set-owned";

// ─────────────────────────────────────────────────────────────────────────────
// The set checklist's data — RiftCompare's tests/set-checklist.test.ts, ported
// in wave 2 (2026-10-03). The cached half (lib/data.ts getSetChecklist) is ONE
// Offer groupBy per (set, market) over real stores — never eBay, never
// Card.low<M> — and the per-user half (lib/set-owned.ts) one groupBy scoped by
// userId.
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

test("the cached read is ONE groupBy over stores, in stock, in the market, fresh, never eBay, scoped to the set's ids", () => {
  const data = code("src/lib/data.ts");
  const block = data.slice(data.indexOf("const loadSetStoreMins"), data.indexOf("export async function getSetChecklist"));
  assert.match(block, /prisma\.card\.findMany\(\{ where: \{ setId \}, select: \{ id: true \}, take: SET_CARD_CAP \}\)/);
  assert.match(block, /prisma\.offer\.groupBy\(\{\s*by: \["productId", "source"\]/);
  assert.match(block, /productId: \{ in: ids \}/);
  assert.match(block, /inStock: true/);
  assert.match(block, /updatedAt: \{ gt: new Date\(Date\.now\(\) - STALE_MS\) \}/);
  assert.match(block, /NOT: \{ source: \{ startsWith: "ebay" \} \}/);
  assert.match(block, /\["set-checklist-v1", String\(setId\), market\]/, "one entry per (set, market)");
  assert.match(block, /tags: \[PRICES_TAG\], revalidate: TTL/);
  assert.doesNotMatch(block, /getCatalog\(|getCardDetail\(|getHistoryRef\(/, "no cached loader inside the cache callback");
  const outer = data.slice(data.indexOf("export async function getSetChecklist"));
  assert.match(outer, /Promise\.all\(\[loadSetStoreMins\(setId, market\), getCatalog\(\)\]\)/, "the catalogue is read outside the cache");
  assert.match(outer, /otherSource: !hit && c\.low\[market\] != null/, "an eBay-only card is 'other', never priced");
});

test("the pages call the loader directly, never inside another cache", () => {
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    const c = code(f);
    assert.match(c, /getSetChecklist\(set\.id, country\)/, f);
    assert.doesNotMatch(c, /unstable_cache/, f);
  }
});

test("the owned read is one groupBy scoped by userId and the set, capped, summed across conditions", async () => {
  const calls: unknown[] = [];
  const db: OwnedDb = {
    collectionCard: {
      groupBy: async (args) => {
        calls.push(args);
        return [
          { cardId: 454664, _sum: { quantity: 3 } },
          { cardId: 454665, _sum: { quantity: 0 } },
        ];
      },
    },
  };
  const owned = await ownedBySet(db, "u1", 3188);
  assert.deepEqual(owned, { "454664": 3 });
  assert.deepEqual(calls[0], {
    by: ["cardId"],
    where: { userId: "u1", card: { setId: 3188 } },
    _sum: { quantity: true },
    orderBy: { cardId: "asc" },
    take: OWNED_TAKE,
  });
  await ownedBySet(db, "u1", [1, 2]);
  assert.deepEqual((calls[1] as { where: unknown }).where, { userId: "u1", card: { setId: { in: [1, 2] } } });
});

test("the index scales its owned read to the sets it lists", () => {
  assert.equal(ownedTakeFor([100, 200]), OWNED_TAKE);
  assert.equal(ownedTakeFor([1000, 900, 400]), 2300);
  assert.match(code("src/app/portfolio/sets/page.tsx"), /ownedTakeFor\(shown\.map\(\(l\) => l\.cards\.length\)\)/);
});

test("GET /api/collection/owned is authenticated, validates the set, and answers no-store from the caller's own rows", () => {
  const c = code("src/app/api/collection/owned/route.ts");
  assert.ok(c.indexOf("getCurrentUser()") < c.indexOf("ownedBySet("));
  assert.match(c, /\{ error: "Unknown set" \}, \{ status: 400/);
  assert.match(c, /ownedBySet\(await ownedDb\(\), user\.id, set\.id\)/);
});
