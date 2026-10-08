// The premium gate at the data boundary (critique DP-07, DP-08; sections 12.3 and 7.8). Owner WP02 (the module), WP13/WP07 (the loaders that call it). Pins: the same rows at every tier and a different length; no way to enumerate the free preview by paging or narrowing;
// a forged tier is refused; the cache key never contains a tier.
import test from "node:test";
import assert from "node:assert/strict";
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "../src/lib/tier-limits";
import { DEFAULT_DEAL_QUERY, accessOf, buyKeysHash, coerceDealQuery, isEntitlement, mintEntitlement, rankKey, sliceRanking, viewerOf, type DealQuery } from "../src/lib/data/plane/entitlement";
import { SIGNED_OUT, accessFor, type Viewer } from "../src/lib/premium-gates";

const who = { anon: mintEntitlement(SIGNED_OUT), free: mintEntitlement({ signedIn: true, tier: null }), plus: mintEntitlement({ signedIn: true, tier: "plus" }), premium: mintEntitlement({ signedIn: true, tier: "premium" }) };
const ranking = [...Array(100)].map((_, i) => ({ uid: 1000 + i, pct: 90 - i * 0.5 }));

test("four tiers, one ranking: the same first rows, a different length (anon 0, free 3, plus and premium a full page)", () => {
  const rows = (w: keyof typeof who) => sliceRanking("deal-finder", who[w], ranking).rows.map((r) => r.uid);
  assert.deepEqual(rows("anon"), []); assert.deepEqual(rows("free"), [1000, 1001, 1002]); assert.equal(rows("plus").length, 25); assert.deepEqual(rows("plus"), rows("premium"));
  assert.deepEqual(rows("free"), rows("premium").slice(0, FREE_DEAL_ROWS), "the free rows are the FIRST rows of the same ranking");
  assert.equal(sliceRanking("deal-finder", who.anon, ranking).total, 100, "the true total is shown (a count is not a row)"); assert.equal(sliceRanking("deal-finder", who.anon, ranking).locked, true);
  assert.equal(sliceRanking("deal-finder", who.plus, ranking).locked, false);
});
test("DP-08: NO sequence of requests lets a free or anonymous viewer read more than the preview (page, page size, sort, store picker, onlyUids all coerce to the default)", () => {
  for (const tier of ["anon", "free"] as const) {
    const seen = new Set<number>();
    for (const page of [1, 2, 3, 7]) for (const pageSize of [10, 25, 50, 100]) for (const sort of ["saving", "pct"] as const) for (const buyKeys of [undefined, ["store:a"], ["store:a", "store:b"]]) for (const only of [undefined, new Set([1050, 1060, 1070]), new Set<number>()]) {
      const q: Partial<DealQuery> = { page, pageSize, sort, buyKeys, onlyUids: only }; const s = sliceRanking("deal-finder", who[tier], ranking, q);
      for (const r of s.rows) seen.add(r.uid);
      const named = page !== 1 || pageSize !== 25 || sort !== "saving" || (buyKeys?.length ?? 0) > 0 || (only?.size ?? 0) > 0; assert.equal(s.coerced, named, `coerced flag for ${JSON.stringify({ page, pageSize, sort, buyKeys, only: only?.size })}`);
    }
    assert.ok(seen.size <= (tier === "anon" ? 0 : FREE_DEAL_ROWS), `${tier} could read ${seen.size} distinct rows (the preview is ${tier === "anon" ? 0 : FREE_DEAL_ROWS})`);
  }
  const paid = sliceRanking("deal-finder", who.plus, ranking, { page: 3, pageSize: 25, sort: "pct" }); assert.equal(paid.rows[0]!.uid, 1050); assert.equal(paid.page, 3); assert.equal(paid.coerced, false);
  assert.equal(sliceRanking("deal-finder", who.premium, ranking, { page: 99 }).rows.length, 0, "past the end is empty, not an error");
});
test("coerceDealQuery: below full the default view; at full a normalised request", () => {
  assert.deepEqual(coerceDealQuery("preview", { page: 9, sort: "pct" }), { q: DEFAULT_DEAL_QUERY, coerced: true }); assert.deepEqual(coerceDealQuery("none", {}), { q: DEFAULT_DEAL_QUERY, coerced: false });
  const f = coerceDealQuery("full", { page: -4, pageSize: 7, sort: "nonsense" as never, buyKeys: ["b", "a"] }); assert.equal(f.q.page, 1); assert.equal(f.q.pageSize, 25); assert.equal(f.q.sort, "saving"); assert.deepEqual(f.q.buyKeys, ["a", "b"]);
});
test("Rising (40, Premium; 3 for free and Plus) and Demand (25, Premium; 10 for free): the same rule, the gate module's limits", () => {
  const r40 = [...Array(40)].map((_, i) => i), d30 = [...Array(30)].map((_, i) => i);
  assert.equal(sliceRanking("rising", who.premium, r40).rows.length, 40); assert.equal(sliceRanking("rising", who.plus, r40).rows.length, FREE_RISING_ROWS); assert.equal(sliceRanking("rising", who.free, r40).rows.length, FREE_RISING_ROWS); assert.equal(sliceRanking("rising", who.anon, r40).rows.length, 0);
  assert.equal(sliceRanking("demand", who.premium, d30).rows.length, PREMIUM_DEMAND_ROWS); assert.equal(sliceRanking("demand", who.free, d30).rows.length, FREE_DEMAND_ROWS); assert.equal(sliceRanking("demand", who.anon, d30).rows.length, FREE_DEMAND_ROWS, "the strip /movers already shows everyone");
  assert.equal(sliceRanking("rising", who.premium, r40).total, 40);
});
test("an Entitlement cannot be forged: a plain object, a string or a header value is refused at run time", () => {
  for (const bad of [{ tier: "premium", viewer: { signedIn: true, tier: "premium" } }, "premium", null, undefined, 42, JSON.parse(JSON.stringify(who.premium))]) { assert.equal(isEntitlement(bad), false); assert.throws(() => viewerOf(bad as never), TypeError); assert.throws(() => sliceRanking("deal-finder", bad as never, ranking), TypeError); }
  assert.equal(isEntitlement(who.premium), true); assert.equal(Object.isFrozen(who.premium), true);
  assert.equal(JSON.stringify(who.premium).includes("premium"), true); assert.equal(isEntitlement(JSON.parse(JSON.stringify(who.premium))), false, "it does not survive serialisation: it can never come back from a client");
});
test("a failed user read is anonymous and never premium; an admin is premium because tierOf says so (the caller passes tier 'premium')", () => {
  const failed = mintEntitlement({ signedIn: false, tier: "premium" } as Viewer); assert.equal(failed.tier, "anon"); assert.equal(accessOf("deal-finder", failed), "none"); assert.equal(accessOf("rising", failed), "none");
  assert.equal(accessOf("deal-finder", who.plus), "full"); assert.equal(accessOf("rising", who.plus), "preview"); assert.equal(accessOf("rising", who.premium), "full"); assert.equal(accessFor("demand", viewerOf(who.free)), "preview");
});
test("the cache key of a ranking carries the data commit, the market, the sort and the store set: never a tier, a viewer or a page", () => {
  const k = rankKey("deal-rank-v1", "a".repeat(40), "US", "saving", buyKeysHash(["b", "a"])); assert.deepEqual(k, ["deal-rank-v1", "a".repeat(40), "US", "saving", "a,b"]);
  for (const t of ["anon", "free", "plus", "premium", "page"]) assert.ok(!k.some((p) => p.includes(t)), t); assert.equal(buyKeysHash(undefined), "default"); assert.equal(buyKeysHash([]), "default");
});
