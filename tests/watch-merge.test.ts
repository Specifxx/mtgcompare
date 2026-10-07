// The signed-out list merged into the account on first sign-in
// (lib/watchlist-server.ts resolveLocalItems + mergeLocalWatches).
import test from "node:test";
import assert from "node:assert/strict";
import { MERGE_CAP, mergeLocalWatches, resolveLocalItems, type MergeDb } from "../src/lib/watchlist-server";

const cards = [
  { id: 1, slug: "monkey-d-luffy-op01-024" },
  { id: 2, slug: "roronoa-zoro-op01-025" },
];
const lookup = { bySlug: new Map(cards.map((c) => [c.slug, c])), byId: new Map(cards.map((c) => [c.id, c])) };
const account = { id: "u1", email: "a@x.com", isAdmin: false, premiumUntil: null, premiumTier: "premium" };

test("slugs and ids resolve through the catalogue; unknown items are skipped, never guessed; duplicates collapse", () => {
  assert.deepEqual(
    resolveLocalItems(
      [{ slug: "monkey-d-luffy-op01-024" }, { id: 2, slug: "renamed-slug" }, { slug: "no-such-card" }, { slug: "monkey-d-luffy-op01-024", id: 1 }, null, "junk", { id: "2" }],
      lookup,
    ),
    [1, 2],
  );
  assert.deepEqual(resolveLocalItems("not a list", lookup), []);
});

test("at most MERGE_CAP (200) cards are imported", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, slug: `c${i + 1}` }));
  const big = { bySlug: new Map(many.map((c) => [c.slug, c])), byId: new Map(many.map((c) => [c.id, c])) };
  assert.equal(MERGE_CAP, 200);
  assert.equal(resolveLocalItems(many.map((c) => ({ slug: c.slug })), big).length, 200);
});

function db(opts: { failRead?: boolean } = {}) {
  const upserts: { where: unknown; update: unknown; create: Record<string, unknown> }[] = [];
  const d = {
    offer: {
      findMany: async () => {
        if (opts.failRead) throw new Error("down");
        return [{ productId: 1, source: "store:a", priceCents: 700, inStock: true, updatedAt: new Date() }];
      },
    },
    priceAlert: {
      findFirst: async () => ({ unsubToken: "tok" }),
      upsert: async (a: { where: unknown; update: unknown; create: Record<string, unknown> }) => {
        upserts.push(a);
        return { id: "x" };
      },
    },
  };
  return { db: d as unknown as MergeDb, upserts };
}

test("GRANDFATHERED: a free account's 30 local hearts all merge — no free-limit check on the import", async () => {
  const many = Array.from({ length: 30 }, (_, i) => i + 1);
  const { db: d, upserts } = db();
  const r = await mergeLocalWatches(d, account, many, "US");
  assert.equal(r.merged, 30);
  assert.equal(upserts.length, 30);
});

test("IDEMPOTENT: an upsert whose update branch only stamps ownership, with the address's own token and the store seed", async () => {
  const { db: d, upserts } = db();
  await mergeLocalWatches(d, account, [1, 1, 2], "AU");
  assert.equal(upserts.length, 2, "duplicates collapse");
  assert.deepEqual(upserts[0].where, { email_cardId_market: { email: "a@x.com", cardId: 1, market: "AU" } });
  assert.deepEqual(upserts[0].update, { userId: "u1" });
  assert.equal(upserts[0].create.unsubToken, "tok");
  assert.equal(upserts[0].create.startPriceCents, 700);
  assert.equal(upserts[1].create.startPriceCents, null, "no eligible copy: no start price");
});

test("a failed price read still merges (the watch matters more than its start price)", async () => {
  const { db: d, upserts } = db({ failRead: true });
  assert.equal((await mergeLocalWatches(d, account, [1], "US")).merged, 1);
  assert.equal(upserts[0].create.startPriceCents, null);
});
