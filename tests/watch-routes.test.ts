// The account watchlist's route logic (src/lib/watchlist-server.ts), driven
// against stub clients: the POST (free limit, baseline seed, upsert), the
// target PATCH (RiftCompare's target-alert-route rules) and the route files'
// own shape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyTargetPrice, createWatch, parseTargetBody, parseWatchBody, type TargetDb, type WatchWriteDb } from "../src/lib/watchlist-server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const FUTURE = new Date(Date.now() + 30 * 86_400_000);
const free = { id: "u1", email: "a@x.com", isAdmin: false, premiumUntil: null, premiumTier: "premium" };
const plus = { ...free, premiumUntil: FUTURE, premiumTier: "plus" };
const premium = { ...free, premiumUntil: FUTURE, premiumTier: "premium" };

function watchDb(opts: { held?: number[]; count?: number; offers?: { source: string; priceCents: number }[]; readFails?: boolean } = {}) {
  const upserts: unknown[] = [];
  const db = {
    card: { findUnique: async ({ where }: { where: { id: number } }) => (where.id === 404 ? null : { id: where.id }) },
    offer: {
      findMany: async () => {
        if (opts.readFails) throw new Error("db down");
        return (opts.offers ?? []).map((o) => ({ productId: 7, inStock: true, updatedAt: new Date(), ...o }));
      },
    },
    priceAlert: {
      findMany: async ({ where }: { where: { AND: [unknown, { cardId: { in: number[] } }] } }) =>
        (opts.held ?? []).filter((id) => where.AND[1].cardId.in.includes(id)).map((cardId) => ({ cardId })),
      findFirst: async () => null,
      upsert: async (args: unknown) => {
        upserts.push(args);
        return { id: "w1" };
      },
    },
    $queryRaw: async () => [{ n: opts.count ?? 0 }],
  };
  return { db: db as unknown as WatchWriteDb, upserts };
}

test("parseWatchBody: a numeric card id and one of OP's six markets (US by default)", () => {
  assert.deepEqual(parseWatchBody({ cardId: 7, market: "AU" }), { cardId: 7, market: "AU" });
  assert.deepEqual(parseWatchBody({ cardId: "7" }), { cardId: 7, market: "US" });
  assert.equal(parseWatchBody({ cardId: 7, market: "NZ" }), null);
  assert.equal(parseWatchBody({ cardId: -1 }), null);
  assert.equal(parseWatchBody({ cardId: "7; drop" }), null);
  assert.equal(parseWatchBody(null), null);
});

test("POST: a free account's 11th card is a 402 free_limit; nothing is written", async () => {
  const { db, upserts } = watchDb({ held: [], count: 10 });
  const r = await createWatch(db, free, { cardId: 7, market: "US" });
  assert.equal(r.status, 402);
  assert.equal(r.body.code, "free_limit");
  assert.equal(r.body.kind, "watchlist");
  assert.equal(r.body.limit, 10);
  assert.equal(upserts.length, 0);
});

test("POST: a card already held is always allowed (grandfathering), and paid tiers are never counted", async () => {
  assert.equal((await createWatch(watchDb({ held: [7], count: 30 }).db, free, { cardId: 7, market: "UK" })).status, 200);
  assert.equal((await createWatch(watchDb({ held: [], count: 500 }).db, plus, { cardId: 7 })).status, 200);
});

test("POST: the start price is the cheapest store/TCGplayer copy — an eBay row never seeds startPriceCents", async () => {
  const { db, upserts } = watchDb({ offers: [{ source: "ebay", priceCents: 50 }, { source: "store:a", priceCents: 900 }, { source: "tcgplayer", priceCents: 950 }] });
  const r = await createWatch(db, free, { cardId: 7, market: "US" });
  assert.equal(r.status, 200);
  const up = upserts[0] as { where: unknown; update: unknown; create: Record<string, unknown> };
  assert.deepEqual(up.where, { email_cardId_market: { email: "a@x.com", cardId: 7, market: "US" } });
  assert.deepEqual(up.update, { userId: "u1" }, "the update branch only stamps ownership");
  assert.equal(up.create.startPriceCents, 900);
  assert.equal(up.create.lastPriceCents, 900);
  assert.equal(up.create.userId, "u1");

  const only = watchDb({ offers: [{ source: "ebay_us", priceCents: 40 }] });
  await createWatch(only.db, free, { cardId: 7, market: "US" });
  assert.equal((only.upserts[0] as { create: Record<string, unknown> }).create.startPriceCents, null);
});

test("POST: a failed price read saves nothing (503); an unknown card is a 400", async () => {
  const failed = watchDb({ readFails: true });
  assert.equal((await createWatch(failed.db, free, { cardId: 7 })).status, 503);
  assert.equal(failed.upserts.length, 0);
  assert.equal((await createWatch(watchDb().db, free, { cardId: 404 })).status, 400);
  assert.equal((await createWatch(watchDb().db, free, { cardId: "x" })).status, 400);
});

function targetDb(opts: { others: number; current?: { targetCents: number | null } | null }) {
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  return {
    updates,
    db: ({
      priceAlert: {
        count: async () => opts.others,
        findFirst: async () => (opts.current === undefined ? { targetCents: null } : opts.current),
        updateMany: async (a: { where: unknown; data: Record<string, unknown> }) => {
          updates.push(a);
          return { count: opts.current === null ? 0 : 1 };
        },
      },
    } as unknown) as TargetDb,
  };
}

test("PATCH target: free accounts get a 403; a bad body a 400", async () => {
  assert.equal((await applyTargetPrice(targetDb({ others: 0 }).db, free, 7, { market: "US", targetCents: 500 })).status, 403);
  assert.equal((await applyTargetPrice(targetDb({ others: 0 }).db, plus, 7, { market: "US", targetCents: 0 })).status, 400);
  assert.equal((await applyTargetPrice(targetDb({ others: 0 }).db, plus, 7, { market: "XX", targetCents: 5 })).status, 400);
  assert.equal(parseTargetBody({ market: "US", targetCents: 10_000_001 }), null);
});

test("PATCH target: Plus is capped at 25 (409, the count is of OTHER targets); Premium is unlimited", async () => {
  const at = await applyTargetPrice(targetDb({ others: 25 }).db, plus, 7, { market: "US", targetCents: 500 });
  assert.equal(at.status, 409);
  assert.equal(at.body.limit, 25);
  const editing = await applyTargetPrice(targetDb({ others: 24 }).db, plus, 7, { market: "US", targetCents: 500 });
  assert.equal(editing.status, 200);
  assert.equal(editing.body.used, 25);
  assert.equal(editing.body.limit, 25);
  const clearAtLimit = await applyTargetPrice(targetDb({ others: 25 }).db, plus, 7, { market: "US", targetCents: null });
  assert.equal(clearAtLimit.status, 200, "clearing a target is never blocked");
  const prem = await applyTargetPrice(targetDb({ others: 400 }).db, premium, 7, { market: "US", targetCents: 500 });
  assert.equal(prem.status, 200);
  assert.equal(prem.body.limit, null, "unlimited, as JSON null");
});

test("PATCH target: a changed target re-arms its own watermark; the same target re-arms nothing; 404 when not watched", async () => {
  const changed = targetDb({ others: 0, current: { targetCents: 900 } });
  await applyTargetPrice(changed.db, plus, 7, { market: "US", targetCents: 800 });
  assert.deepEqual(changed.updates[0].data, { targetCents: 800, targetEmailedCents: null });
  const same = targetDb({ others: 0, current: { targetCents: 800 } });
  await applyTargetPrice(same.db, plus, 7, { market: "US", targetCents: 800 });
  assert.deepEqual(same.updates[0].data, { targetCents: 800 });
  assert.equal((await applyTargetPrice(targetDb({ others: 0, current: null }).db, plus, 7, { market: "US", targetCents: 800 })).status, 404);
});

test("the routes: session first, rate limited, same-origin mutations, a 404 DELETE, no database import", () => {
  const list = read("src/app/api/alerts/watchlist/route.ts");
  const one = read("src/app/api/alerts/watchlist/[cardId]/route.ts");
  const merge = read("src/app/api/alerts/watchlist/merge/route.ts");
  for (const src of [list, one, merge]) {
    assert.doesNotMatch(src, /@\/lib\/db"/);
    assert.match(src, /getCurrentUser\(\)/);
    assert.match(src, /force-dynamic/);
  }
  assert.match(list, /searchParams[\s\S]*"ids"\) === "1"/);
  assert.match(list, /"targets"\) === "1"/);
  assert.match(list, /rateLimit\(`alerts:watch:\$\{user\.id\}`, 60, 60_000\)/);
  assert.match(list, /getCardLookup\(\{ ids:/, "rows are priced from the published catalogue (getCardLookup), not a join; getCatalog() refuses in production");
  assert.match(one, /if \(removed === 0\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404 \}\)/);
  for (const src of [one, merge]) assert.match(src, /sameOrigin\(req\)/);
});
