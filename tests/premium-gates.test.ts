// WHO SEES WHAT in Deal Finder, Rising Cards and Demand Finder (src/lib/premium-gates.ts). Pure: runs the rules, reads no page.
// The page and loader discipline (rows limited in the query, never with CSS) is the ratchet tests/premium-gates-pages.test.ts (WP19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, FEATURE_RULES, GATE_TIER_RANK, SIGNED_OUT, TEASER_ROWS, accessFor, allowsRefinement, gate, gateMatrix, isFreeView, rowLimit, teaserRows, type Feature, type Viewer } from "../src/lib/premium-gates";
import { TIER_RANK } from "../src/lib/plans";
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "../src/lib/tier-limits";

const FREE: Viewer = { signedIn: true, tier: null };
const PLUS: Viewer = { signedIn: true, tier: "plus" };
const PREMIUM: Viewer = { signedIn: true, tier: "premium" };   // an admin resolves to "premium" in tierOf()

test("the rank table is plans.ts's", () => assert.deepEqual(GATE_TIER_RANK, TIER_RANK));

test("Deal Finder: signed out nothing, a free account the top 3, Plus and Premium everything", () => {
  const f: Feature = "deal-finder";
  assert.deepEqual([SIGNED_OUT, FREE, PLUS, PREMIUM].map((v) => accessFor(f, v)), ["none", "preview", "full", "full"]);
  assert.equal(rowLimit(f, "none"), 0);
  assert.equal(rowLimit(f, "preview", FREE), FREE_DEAL_ROWS);
  assert.equal(FREE_DEAL_ROWS, 3);
  assert.equal(FEATURE_RULES[f].minTier, "plus");
});

test("Rising Cards: Premium only; a free or Plus account sees the top 3; signed out sees none", () => {
  const f: Feature = "rising";
  assert.deepEqual([SIGNED_OUT, FREE, PLUS, PREMIUM].map((v) => accessFor(f, v)), ["none", "preview", "preview", "full"]);
  assert.equal(rowLimit(f, "preview", PLUS), FREE_RISING_ROWS);
  assert.equal(rowLimit(f, "full"), 40);
  assert.equal(FEATURE_RULES[f].minTier, "premium");
});

test("Demand Finder: Premium only; everyone else gets the free strip (top 10 searched over 7 days), signed out included", () => {
  const f: Feature = "demand";
  assert.deepEqual([SIGNED_OUT, FREE, PLUS, PREMIUM].map((v) => accessFor(f, v)), ["preview", "preview", "preview", "full"]);
  assert.equal(rowLimit(f, "preview", SIGNED_OUT), FREE_DEMAND_ROWS);
  assert.equal(rowLimit(f, "full"), PREMIUM_DEMAND_ROWS);
  assert.equal(FEATURE_RULES[f].minTier, "premium");
});

test("gate() cuts a ranking once, reports the true total, and never invents rows", () => {
  const ranking = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
  const g = gate("rising", "preview", ranking, FREE);
  assert.deepEqual(g.rows.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual([g.shown, g.total, g.hidden, g.access], [3, 40, 37, "preview"]);
  assert.equal(gate("rising", "none", ranking).rows.length, 0);
  assert.equal(gate("rising", "full", ranking).rows.length, 40);
  assert.equal(gate("rising", "full", ranking.slice(0, 2)).hidden, 0);
  assert.equal(gate("demand", "preview", ranking, SIGNED_OUT).rows.length, FREE_DEMAND_ROWS);
  assert.equal(gate("deal-finder", "full", ranking).rows.length, 40);
});

test("filters, sorting, paging and 'only my cards' exist only at full access", () => {
  assert.deepEqual((["none", "preview", "full"] as const).map(allowsRefinement), [false, false, true]);
});

test("Deal Finder's Cheapest-on-eBay view is free for everyone; nothing else is", () => {
  assert.equal(isFreeView("deal-finder", "ebay"), true);
  assert.equal(isFreeView("deal-finder", "tcg"), false);
  assert.equal(isFreeView("deal-finder", "vs-ebay"), false);
  assert.equal(isFreeView("rising", "ebay"), false);
});

test("a cached public page may tease at most what a free account sees on the tool page", () => {
  assert.deepEqual(FEATURES.map((f) => teaserRows(f)), [1, 3, 10]);
  for (const f of FEATURES) assert.ok(teaserRows(f) <= Math.max(FEATURE_RULES[f].freePreviewRows, FEATURE_RULES[f].signedOutRows), f);
  assert.equal(TEASER_ROWS["deal-finder"], 1, "Today's Top Deals: one row and the real total");
});

test("the matrix, as the /premium page and docs/premium-gates.md print it", () => {
  assert.deepEqual(gateMatrix(), [
    { feature: "deal-finder", signedOut: 0, free: 3, plus: "all", premium: "all" },
    { feature: "rising", signedOut: 0, free: 3, plus: 3, premium: "all" },
    { feature: "demand", signedOut: 10, free: 10, plus: 10, premium: "all" },
  ]);
  assert.deepEqual([...FEATURES], ["deal-finder", "rising", "demand"]);
});
