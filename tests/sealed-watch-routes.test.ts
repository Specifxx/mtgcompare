// Sealed watches' route logic (src/lib/sealed-watch.ts) against a stub client:
// Plus and Premium only, Plus capped at 10, Premium at the hard cap, owner-only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSealedWatch, deleteSealedWatch, listSealedWatches, updateSealedWatch, type SealedWatchRouteDb } from "../src/lib/sealed-watch";
import { SEALED_WATCH_HARD_CAP, SEALED_WATCH_LIMIT_PLUS } from "../src/lib/alert-limits";

const FUTURE = new Date(Date.now() + 30 * 86_400_000);
const free = { id: "u1", email: "a@x.com", isAdmin: false, premiumUntil: null, premiumTier: "premium" };
const plus = { ...free, premiumUntil: FUTURE, premiumTier: "plus" };
const premium = { ...free, premiumUntil: FUTURE, premiumTier: "premium" };

function stub(opts: { count?: number; existing?: boolean; owned?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const db = {
    sealed: { findUnique: async ({ where }: { where: { id: number } }) => (where.id === 404 ? null : { id: where.id }) },
    sealedWatch: {
      count: async () => opts.count ?? 0,
      findFirst: async ({ where }: { where: { userId: string } }) => ((opts.existing || opts.owned) && where.userId === "u1" ? { id: "w1" } : null),
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: "new", ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updated.push(data);
        return { id: "w1", ...data };
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => ({ count: opts.owned && where.userId === "u1" ? 1 : 0 }),
    },
  };
  return { db: db as unknown as SealedWatchRouteDb, created, updated };
}

test("a free account gets the Plus gate (402), never a watch", async () => {
  const s = stub();
  const r = await createSealedWatch(s.db, free, { sealedId: 7 }, "US");
  assert.equal(r.status, 402);
  assert.equal(r.body.tier, "plus");
  assert.equal(s.created.length, 0);
});

test("Plus: up to 10 products, then 409; Premium: unlimited up to the hard cap", async () => {
  assert.equal(SEALED_WATCH_LIMIT_PLUS, 10);
  assert.equal((await createSealedWatch(stub({ count: 9 }).db, plus, { sealedId: 7 }, "US")).status, 201);
  const at = await createSealedWatch(stub({ count: 10 }).db, plus, { sealedId: 7 }, "US");
  assert.equal(at.status, 409);
  assert.equal(at.body.limit, 10);
  assert.equal((await createSealedWatch(stub({ count: 150 }).db, premium, { sealedId: 7 }, "US")).status, 201);
  const cap = await createSealedWatch(stub({ count: SEALED_WATCH_HARD_CAP }).db, premium, { sealedId: 7 }, "US");
  assert.equal(cap.status, 409);
  assert.equal(cap.body.limit, 200);
});

test("the row is keyed by Sealed.id and market; watching again updates the target instead of a duplicate", async () => {
  const s = stub();
  await createSealedWatch(s.db, plus, { sealedId: "7", targetCents: 12000 }, "AU");
  assert.deepEqual(s.created[0], { userId: "u1", email: "a@x.com", market: "AU", sealedId: 7, targetCents: 12000 });
  const again = stub({ existing: true });
  const r = await createSealedWatch(again.db, plus, { sealedId: 7, targetCents: 9000 }, "AU");
  assert.equal(r.body.existed, true);
  assert.deepEqual(again.updated[0], { targetCents: 9000, lastEmailedCents: null });
  assert.equal((await createSealedWatch(stub().db, plus, { sealedId: "box" }, "US")).status, 400);
  assert.equal((await createSealedWatch(stub().db, plus, { sealedId: 404 }, "US")).status, 400, "an unknown product");
});

test("update and delete are owner-only; snoozing needs no tier, a target does", async () => {
  assert.equal((await updateSealedWatch(stub().db, plus, "w1", { snoozeDays: 30 })).status, 404, "not this account's watch");
  const owned = stub({ owned: true });
  assert.equal((await updateSealedWatch(owned.db, free, "w1", { snoozeDays: 30 })).status, 200, "a lapsed owner can snooze");
  assert.equal((await updateSealedWatch(owned.db, free, "w1", { targetCents: 100 })).status, 402);
  assert.equal((await updateSealedWatch(owned.db, plus, "w1", { snoozeDays: 999 })).status, 400);
  assert.equal((await deleteSealedWatch(stub().db, plus, "w1")).status, 404);
  assert.equal((await deleteSealedWatch(stub({ owned: true }).db, free, "w1")).status, 200, "stopping needs no tier");
  const l = await listSealedWatches(stub().db, plus);
  assert.equal(l.body.limit, 10);
  assert.equal((await listSealedWatches(stub().db, premium)).body.limit, null);
});

test("the routes are transport only: session, rate limit, same origin, no database import", () => {
  for (const p of ["src/app/api/watches/sealed/route.ts", "src/app/api/watches/sealed/[id]/route.ts"]) {
    const src = readFileSync(join(process.cwd(), p), "utf8");
    assert.doesNotMatch(src, /@\/lib\/db"/);
    assert.match(src, /getCurrentUser\(\)/);
    assert.match(src, /sameOrigin\(req\)/);
  }
});
