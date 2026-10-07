// The tier lineup as the dashboard, the plan switches and the billing facts
// read it (RiftCompare's tests/premium-tiers.test.ts, the parts OP Compare has).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DASHBOARD_TOOLS, dashboardToolOpens } from "../src/lib/dashboard-tools";
import { TIER_COMPARISON } from "../src/lib/plans";
import { planSwitchPriceLabel } from "../src/lib/plan-switch-price";
import { billingStateFor, forgetBillingState } from "../src/lib/billing-state";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the dashboard's tool list tags each tool with the tier that opens it in full, and its free taste", () => {
  const byTitle = Object.fromEntries(DASHBOARD_TOOLS.map((t) => [t.title, t]));
  assert.deepEqual(Object.keys(byTitle), [
    "Deal Finder",
    "Rising Cards",
    "Best Basket",
    "Demand Finder",
    "Watchlist & target alerts",
    "Sealed watches",
    "Deck price watch",
    "Portfolio",
    "Set checklist",
    "Box EV",
    "Deck pricer",
    "Trade calculator",
  ]);
  assert.equal(byTitle["Deal Finder"].tier, "plus");
  assert.equal(byTitle["Rising Cards"].tier, "premium");
  assert.equal(byTitle["Best Basket"].tier, "premium");
  assert.equal(byTitle["Demand Finder"].tier, "premium");
  assert.equal(byTitle["Sealed watches"].tier, "plus");
  assert.equal(byTitle["Deck price watch"].tier, "premium");

  // The free taste each paid tool offers is exactly TIER_COMPARISON's free cell.
  const cell = (feature: string) => TIER_COMPARISON.find((r) => r.feature === feature)!.account;
  assert.equal(cell("Deal Finder"), "Top 3");
  assert.equal(byTitle["Deal Finder"].freeTaste, "Top 3 free");
  assert.equal(cell("Rising Cards"), "Top 3");
  assert.equal(byTitle["Rising Cards"].freeTaste, "Top 3 free");
  // Best Basket is Premium only (owner, 2026-10-07): no free taste, a dash below Premium.
  assert.equal(cell("Best Basket — cheapest delivered order for a list"), false);
  assert.equal(byTitle["Best Basket"].freeTaste, undefined);
  assert.equal(cell("Demand Finder — most searched & viewed cards"), "Top 10 searched");
  assert.equal(byTitle["Demand Finder"].freeTaste, "Top 10 free");
  // The two watches have no free taste: their rows are a dash for a free account.
  assert.equal(TIER_COMPARISON.find((r) => r.feature.startsWith("Sealed watches"))!.account, false);
  assert.equal(TIER_COMPARISON.find((r) => r.feature.startsWith("Deck price watch"))!.plus, false);
  assert.equal(byTitle["Sealed watches"].freeTaste, undefined);
  assert.equal(byTitle["Deck price watch"].freeTaste, undefined);

  const free = ["Watchlist & target alerts", "Portfolio", "Set checklist", "Box EV", "Deck pricer", "Trade calculator"];
  for (const [viewer, opens] of [
    [null, free],
    ["plus", ["Deal Finder", "Watchlist & target alerts", "Sealed watches", "Portfolio", "Set checklist", "Box EV", "Deck pricer", "Trade calculator"]],
    ["premium", DASHBOARD_TOOLS.map((t) => t.title)],
  ] as const) {
    assert.deepEqual(
      DASHBOARD_TOOLS.filter((t) => dashboardToolOpens(t.tier, viewer)).map((t) => t.title),
      opens,
      `viewer ${viewer ?? "free"}`,
    );
  }
  const src = read("src/app/dashboard/page.tsx");
  assert.match(src, /tierOf\(user\)/, "the dashboard reads the member's real tier");
  assert.match(src, /dashboardToolOpens\(t\.tier, tier\)/);
  assert.match(src, /\{t\.freeTaste\} →/);
  assert.match(src, /data-locked-tool/, "a paid tool with no taste renders as a lock");
});

test("the dashboard never calls a Plus member Premium, and is sign-in only and noindex", () => {
  const src = read("src/app/dashboard/page.tsx");
  assert.match(src, /isPlus \? "Plus · ad-free" : tierName/);
  assert.match(src, /redirect\("\/login\?next=\/dashboard"\)/);
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.match(src, /<RecentAlerts/, "OP Compare's in-app alerts have a home");
});

test("a plan switch quotes the price the route will charge, in the subscriber's own interval", () => {
  assert.equal(planSwitchPriceLabel("premium", "month"), "$4.99/mo");
  assert.equal(planSwitchPriceLabel("premium", "year"), "$39.99/yr");
  assert.equal(planSwitchPriceLabel("premium", "year", false), "$4.99/mo", "no yearly Price: the route bills monthly");
  assert.equal(planSwitchPriceLabel("plus", null), "$2.99/mo");
});

test("billingStateFor reads Stripe once per paying customer, and never for anyone else", async () => {
  forgetBillingState();
  let reads = 0;
  const read_ = async () => {
    reads++;
    return { status: "active", interval: "year" as const };
  };
  assert.deepEqual(await billingStateFor(null, true, 0, read_), { trialing: false, interval: null });
  assert.deepEqual(await billingStateFor({ stripeCustomerId: "cus_1" }, false, 0, read_), { trialing: false, interval: null });
  assert.equal(reads, 0, "a free or Premium viewer costs no Stripe read");
  assert.deepEqual(await billingStateFor({ stripeCustomerId: "cus_1" }, true, 0, read_), { trialing: false, interval: "year" });
  await billingStateFor({ stripeCustomerId: "cus_1" }, true, 60_000, read_);
  assert.equal(reads, 1, "memoised inside the 10-minute window");
  await billingStateFor({ stripeCustomerId: "cus_1" }, true, 11 * 60_000, read_);
  assert.equal(reads, 2);
  forgetBillingState();
});

test("billingStateFor never holds /api/me on Stripe, and never pins a failed read for ten minutes", async () => {
  forgetBillingState();
  let reads = 0;
  const empty = async () => {
    reads++;
    return null;
  };
  await billingStateFor({ stripeCustomerId: "cus_2" }, true, 0, empty);
  await billingStateFor({ stripeCustomerId: "cus_2" }, true, 30_000, empty);
  assert.equal(reads, 1);
  await billingStateFor({ stripeCustomerId: "cus_2" }, true, 61_000, empty);
  assert.equal(reads, 2, "an empty answer is kept a minute, not ten");
  const boom = async () => {
    throw new Error("stripe down");
  };
  assert.deepEqual(await billingStateFor({ stripeCustomerId: "cus_3" }, true, 0, boom), { trialing: false, interval: null });
  let release!: () => void;
  let slowReads = 0;
  const slow = () => {
    slowReads++;
    return new Promise<{ status: string; interval: "month" }>((r) => {
      release = () => r({ status: "trialing", interval: "month" });
    });
  };
  const [a, b] = await Promise.all([billingStateFor({ stripeCustomerId: "cus_4" }, true, 0, slow, 20), billingStateFor({ stripeCustomerId: "cus_4" }, true, 0, slow, 20)]);
  assert.deepEqual(a, { trialing: false, interval: null }, "timed out: answered without Stripe");
  assert.deepEqual(b, a);
  assert.equal(slowReads, 1, "one in-flight read per customer");
  release();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(await billingStateFor({ stripeCustomerId: "cus_4" }, true, 1_000, slow, 20), { trialing: true, interval: "month" });
  assert.equal(slowReads, 1, "the late answer was memoised");
  forgetBillingState();
});

test("/api/me reads billing state for Plus viewers only, and carries the wave-2 fields", () => {
  const src = read("src/app/api/me/route.ts");
  assert.match(src, /billingStateFor\(user, tier === "plus"\)/);
  for (const f of ["trialing:", "interval:", "unreadCount:", "preferredCountry:", "userId:", "emailOn:"]) assert.ok(src.includes(f), f);
  assert.match(src, /touchActivity\(user\)/);
  const me = read("src/lib/use-me.ts");
  assert.match(me, /addEventListener\("focus"/, "the count refreshes on window focus, never on a timer");
  assert.doesNotMatch(read("src/lib/use-unread.ts"), /setInterval/, "no 60-second poll");
});
