// The tier table (lib/plans.ts TIER_COMPARISON) and the pricing bullets read
// against the enforced constants (RiftCompare's access-tiers and
// ad-free-tier tests, as far as MTG Compare's lineup goes).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN_CENTS, PLAN_FEATURES, PLAN_PITCH, TIER_COMPARISON } from "../src/lib/plans";
import { DIALOG_BINARY_FEATURES, DIALOG_OMIT_FEATURES } from "../src/components/TierComparisonTable";
import {
  DECK_WATCH_LIMIT,
  FREE_DEAL_ROWS,
  FREE_DEMAND_ROWS,
  FREE_PORTFOLIO_LIMIT,
  FREE_RISING_ROWS,
  FREE_WATCHLIST_LIMIT,
  PLUS_TARGET_ALERT_LIMIT,
  SEALED_CHECK_CADENCE,
  SEALED_WATCH_LIMIT_PLUS,
  SET_GAP_CHUNK,
} from "../src/lib/tier-limits";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const row = (prefix: string) => {
  const r = TIER_COMPARISON.find((x) => x.feature.startsWith(prefix));
  assert.ok(r, prefix);
  return r!;
};

test("eighteen rows, RiftCompare's order, Ad-free last", () => {
  assert.equal(TIER_COMPARISON.length, 18);
  assert.deepEqual(
    TIER_COMPARISON.map((r) => r.feature.split(" — ")[0]),
    [
      "Compare prices across every store",
      "Full card database, charts & search",
      "Deck & list pricer, trade calculator & box EV",
      "MTG Compare Index & weekly price movers",
      "Watchlist & new-low alerts",
      "Portfolio",
      "Set tracker",
      "Deal Finder",
      "Rising Cards",
      "Target-price alerts after every price update",
      "Best Basket",
      "Buy this list",
      "Finish this set",
      "Minimum condition",
      "Demand Finder",
      "Sealed watches",
      "Deck price watch",
      "Ad-free experience",
    ],
  );
  assert.ok(!TIER_COMPARISON.some((r) => /Riftbound|RiftCompare|Riot/.test(r.feature)));
});

test("every number in the table is the enforced constant", () => {
  assert.equal(row("Watchlist").account, `${FREE_WATCHLIST_LIMIT} cards`);
  assert.equal(row("Portfolio").account, `${FREE_PORTFOLIO_LIMIT} cards`);
  assert.equal(row("Set tracker").account, `Up to ${FREE_PORTFOLIO_LIMIT} cards`);
  assert.equal(row("Deal Finder").account, `Top ${FREE_DEAL_ROWS}`);
  assert.equal(row("Rising Cards").account, `Top ${FREE_RISING_ROWS}`);
  assert.equal(row("Target-price").plus, `Up to ${PLUS_TARGET_ALERT_LIMIT}`);
  assert.equal(row("Target-price").account, false);
  assert.equal(row("Demand Finder").account, `Top ${FREE_DEMAND_ROWS} searched`);
  assert.equal(row("Sealed watches").plus, `Up to ${SEALED_WATCH_LIMIT_PLUS}`);
  assert.ok(row("Sealed watches").feature.includes(SEALED_CHECK_CADENCE));
  assert.doesNotMatch(row("Sealed watches").feature, /RRP/, "no MSRP table, so no at-RRP promise");
  assert.equal(row("Finish this set").premium, `Store-by-store plan, up to ${SET_GAP_CHUNK} cards`);
  assert.equal(row("Deck price watch").premium, true);
  assert.equal(row("Ad-free").account, false);
  assert.equal(row("Ad-free").plus, true);
  // The free limits RiftCompare uses, adopted for parity (DECISIONS, wave 2).
  assert.equal(FREE_WATCHLIST_LIMIT, 10);
  assert.equal(FREE_PORTFOLIO_LIMIT, 50);
});

test("the dialog drops only rows with no signal, and collapses only rows both paid tiers get in full", () => {
  for (const f of DIALOG_OMIT_FEATURES) {
    const r = TIER_COMPARISON.find((x) => x.feature === f)!;
    assert.ok(r.account === true && r.plus === true && r.premium === true, f);
  }
  assert.equal(DIALOG_OMIT_FEATURES.size, 4);
  for (const f of DIALOG_BINARY_FEATURES) {
    const r = TIER_COMPARISON.find((x) => x.feature === f)!;
    assert.equal(r.plus, r.premium, `${f}: both paid tiers get the same thing`);
  }
});

test("pricing bullets: four a card, Plus leads with no ads, numbers from the constants, prices unchanged", () => {
  assert.equal(PLAN_FEATURES.plus.length, 4);
  assert.equal(PLAN_FEATURES.premium.length, 4);
  assert.equal(PLAN_FEATURES.plus[0], "No ads on any page");
  assert.equal(PLAN_FEATURES.plus[1], "Deal Finder in full, no watchlist or portfolio limit", "Plus names its tool: Deal Finder");
  assert.ok(PLAN_FEATURES.plus.includes(`Target alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`));
  assert.ok(PLAN_FEATURES.plus.includes(`Sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products`));
  assert.ok(PLAN_FEATURES.premium.includes(`Deck price watch on up to ${DECK_WATCH_LIMIT} lists`));
  assert.match(PLAN_FEATURES.premium[0], /no ads/);
  assert.equal(PLAN_PITCH.plus, "No ads, and price watches");
  assert.deepEqual(PLAN_CENTS, { plus: { month: 299, year: 2399 }, premium: { month: 499, year: 3999 } });
});

test("ad-free is any paid tier, and every surface that describes Plus says so", () => {
  assert.match(read("src/app/api/me/route.ts"), /adFree: tier != null/);
  assert.match(read("src/app/dashboard/page.tsx"), /Plus · ad-free/);
  assert.match(read("src/components/SubscriptionActions.tsx"), /Plus stays ad-free/);
});

test("the table renders on /premium (tinted) and compact in the dialog and slide-in", () => {
  assert.match(read("src/app/premium/page.tsx"), /<TierComparisonTable tinted \/>/);
  assert.match(read("src/components/PlanDialog.tsx"), /<TierComparisonTable compact \/>/);
});
