// The pure half of RiftCompare's tests/free-limits.test.ts (wave 2, 2026-10-03).
// The route, panel and tier-table halves arrive with the tracks that build
// those surfaces. OP Compare's card ids are numbers, so the ids here are too.
import test from "node:test";
import assert from "node:assert/strict";
import {
  FREE_LIMIT_STATUS,
  FREE_PORTFOLIO_LIMIT,
  FREE_WATCHLIST_LIMIT,
  FREE_LIMIT_POPOVER,
  canonicalWatchEmail,
  checkFreeAllowance,
  freeLimitBody,
  freeLimitCounterText,
  freeLimitPopoverTop,
  parseFreeLimit,
  showFreeLimitCounter,
  wouldHitFreeLimit,
  type HoldingsCounter,
} from "../src/lib/free-limits";
import * as tiers from "../src/lib/tier-limits";
import { DURATION, Z } from "../src/lib/motion-tokens";

/** A counter over an in-memory set of held card ids, recording each query. */
function memCounter(held: number[]) {
  const calls: string[] = [];
  const counter: HoldingsCounter = {
    async held(ids) {
      calls.push("held");
      return new Set(ids.filter((id) => held.includes(id)));
    },
    async count() {
      calls.push("count");
      return new Set(held).size;
    },
  };
  return { counter, calls };
}
const ids = (n: number, from = 1000) => Array.from({ length: n }, (_, i) => from + i);
const NEW = 1, NEW2 = 2;

test("the limits are 10 watched cards and 50 portfolio cards, and the refusal is a structured 402", () => {
  assert.equal(FREE_WATCHLIST_LIMIT, 10);
  assert.equal(FREE_PORTFOLIO_LIMIT, 50);
  assert.equal(FREE_LIMIT_STATUS, 402);
  const b = freeLimitBody("watchlist", 10);
  assert.deepEqual({ ...b, error: undefined }, { error: undefined, code: "free_limit", kind: "watchlist", limit: 10, count: 10 });
  assert.match(b.error, /10 cards, the free limit/);
  assert.match(freeLimitBody("portfolio", 64).error, /64 cards in your portfolio — over the free limit of 50, and you keep all of them/);
  assert.deepEqual(parseFreeLimit(JSON.parse(JSON.stringify(b))), b, "survives the JSON round trip");
  for (const bad of [null, {}, { code: "free_limit", kind: "other" }, { error: "x" }]) assert.equal(parseFreeLimit(bad), null);
});

test("under the limit a new card is allowed; at the limit it is refused", async () => {
  const under = memCounter(ids(9));
  const u = await checkFreeAllowance(under.counter, "watchlist", [NEW], false);
  assert.deepEqual(u, { allowed: [NEW], blocked: [], count: 9, limit: 10 });

  const at = memCounter(ids(10));
  const a = await checkFreeAllowance(at.counter, "watchlist", [NEW], false);
  assert.deepEqual(a.allowed, []);
  assert.deepEqual(a.blocked, [NEW]);
  assert.equal(a.count, 10);
});

test("grandfathered: an account over the limit keeps everything, may re-add a card it has, and is refused only a new one", async () => {
  const over = memCounter(ids(64));
  const again = await checkFreeAllowance(over.counter, "portfolio", [1003], false);
  assert.deepEqual(again.allowed, [1003]);
  assert.deepEqual(again.blocked, []);
  assert.deepEqual(over.calls, ["held"], "a held card costs one scoped read, no count");
  const fresh = await checkFreeAllowance(over.counter, "portfolio", [NEW], false);
  assert.deepEqual(fresh.blocked, [NEW]);
  assert.equal(fresh.count, 64);
  assert.equal(freeLimitBody("portfolio", fresh.count!).count, 64);
});

test("any paid tier is unlimited, and is never counted", async () => {
  const m = memCounter(ids(500));
  const r = await checkFreeAllowance(m.counter, "watchlist", [NEW, NEW2], true);
  assert.deepEqual(r.allowed, [NEW, NEW2]);
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(m.calls, [], "no query at all for a paying account");
});

test("an import fills the remaining allowance in paste order and reports the rest", async () => {
  const m = memCounter(ids(47));
  const pasted = [1, 1005, 2, 3, 4, 5, 1];
  const r = await checkFreeAllowance(m.counter, "portfolio", pasted, false);
  assert.deepEqual(r.allowed, [1, 1005, 2, 3], "the held card always, then 3 new cards (47 → 50), de-duplicated");
  assert.deepEqual(r.blocked, [4, 5]);
});

test("the client pre-check and the quiet counter", () => {
  const held = new Set(ids(10));
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held, cardId: NEW }), true);
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held, cardId: 1001 }), false, "a card already watched");
  assert.equal(wouldHitFreeLimit("watchlist", { paid: true, held, cardId: NEW }), false);
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held: new Set(ids(9)), cardId: NEW }), false);
  // String ids still work (the helper is generic).
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held: new Set(["a"]), cardId: "a" }), false);
  // No nagging before 7 of 10 (40 of 50); never for a paid account.
  assert.equal(showFreeLimitCounter("watchlist", 6, false), false);
  assert.equal(showFreeLimitCounter("watchlist", 7, false), true);
  assert.equal(showFreeLimitCounter("watchlist", 12, true), false);
  assert.equal(showFreeLimitCounter("portfolio", 39, false), false);
  assert.equal(showFreeLimitCounter("portfolio", 40, false), true);
  assert.equal(freeLimitCounterText("watchlist", 8), "8 of 10 free");
  assert.equal(freeLimitCounterText("watchlist", 14), "14 cards · free accounts add up to 10");
});

test("one inbox, one allowance: +tags and dotted Gmail fold together", () => {
  assert.equal(canonicalWatchEmail("Alice+1@Gmail.com"), "alice@gmail.com");
  assert.equal(canonicalWatchEmail("a.l.ice+deals@googlemail.com"), "alice@gmail.com");
  assert.equal(canonicalWatchEmail("bob+x@example.com"), "bob@example.com");
  assert.equal(canonicalWatchEmail("b.o.b@example.com"), "b.o.b@example.com", "dots only fold on Gmail");
  assert.equal(canonicalWatchEmail("+x@example.com"), "+x@example.com", "nothing left of the local part: untouched");
});

test("the heart's popover outranks every overlay and flips above an anchor near the bottom", () => {
  assert.equal(FREE_LIMIT_POPOVER.zClass, `z-${FREE_LIMIT_POPOVER.zToken}`);
  const z = Z[FREE_LIMIT_POPOVER.zToken];
  for (const host of ["overlay", "sheet", "menu", "bottombar", "nudge"] as const) assert.ok(z > Z[host], `outranks Z.${host}`);
  assert.equal(freeLimitPopoverTop({ top: 100, bottom: 140 }, 190, 844), 148);
  const top = freeLimitPopoverTop({ top: 788, bottom: 836 }, 187, 844);
  assert.equal(top, 788 - 8 - 187);
  assert.equal(freeLimitPopoverTop({ top: 40, bottom: 80 }, 190, 250), 16);
  assert.ok(DURATION.base > 0);
});

test("tier-limits.ts is the one home of the wave-2 tier constants", () => {
  assert.equal(tiers.FREE_DEAL_ROWS, 3);
  assert.equal(tiers.FREE_RISING_ROWS, 3);
  assert.equal(tiers.FREE_DEMAND_ROWS, 10);
  assert.equal(tiers.PREMIUM_DEMAND_ROWS, 25);
  assert.equal((tiers as Record<string, unknown>).FREE_BASKET_TOTALS_PER_DAY, undefined, "Best Basket is Premium only (2026-10-07)");
  assert.equal(tiers.SET_GAP_CHUNK, 200);
  assert.equal(tiers.FREE_WATCHLIST_LIMIT, FREE_WATCHLIST_LIMIT);
  assert.equal(tiers.FREE_PORTFOLIO_LIMIT, FREE_PORTFOLIO_LIMIT);
  assert.equal(tiers.PLUS_TARGET_ALERT_LIMIT, 25);
  assert.equal(tiers.DECK_WATCH_LIMIT, 10);
  assert.equal(tiers.SEALED_WATCH_LIMIT_PLUS, 10);
  assert.equal(tiers.SEALED_WATCH_HARD_CAP, 200);
  assert.equal(tiers.SEALED_CHECK_CADENCE, "twice a day");
  assert.deepEqual([...tiers.SEALED_RRP_MARKETS], [], "no at-RRP alerts until an MSRP table exists");
  assert.equal(tiers.targetAlertLimit("premium"), Infinity);
  assert.equal(tiers.targetAlertLimit("plus"), 25);
  assert.equal(tiers.targetAlertLimit(null), 0);
  assert.equal(tiers.deckWatchLimit("premium"), 10);
  assert.equal(tiers.deckWatchLimit("plus"), 0);
  assert.equal(tiers.sealedWatchLimit("plus"), 10);
  assert.equal(tiers.sealedWatchCeiling("premium"), 200);
  assert.equal(tiers.sealedWatchCeiling(null), 0);
});
