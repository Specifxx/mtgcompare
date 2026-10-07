// In-app plan changes (lib/plan-change.ts, /api/premium/{upgrade,downgrade}):
// only our own active subscription, idempotent, the proration each direction
// promises, and never an entitlement write.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changePlan, PRORATION, type PlanChangeDeps } from "../src/lib/plan-change";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sub(tier: "plus" | "premium", over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { site: "opcompare", tier },
    items: { data: [{ id: "si_1", price: { id: `price_${tier}`, recurring: { interval: "year" }, metadata: { site: "opcompare", tier } } }] },
    ...over,
  };
}

function deps(found: unknown) {
  const updates: { id: string; params: Record<string, unknown> }[] = [];
  const d: PlanChangeDeps = {
    find: async () => found as never,
    price: async (tier, iv) => `price_${tier}_${iv}`,
    update: async (id, params) => {
      updates.push({ id, params: params as Record<string, unknown> });
      return {};
    },
  };
  return { d, updates };
}

test("proration is pinned: an upgrade bills the difference now, a downgrade credits the next invoice", () => {
  assert.deepEqual(PRORATION, { upgrade: "always_invoice", downgrade: "create_prorations" });
});

test("upgrade: Plus → Premium at the subscriber's own interval", async () => {
  const { d, updates } = deps(sub("plus"));
  const r = await changePlan("upgrade", "cus_1", d);
  assert.equal(r.status, 200);
  assert.deepEqual(updates[0].params.items, [{ id: "si_1", price: "price_premium_year" }]);
  assert.equal(updates[0].params.proration_behavior, "always_invoice");
  assert.equal((updates[0].params.metadata as Record<string, string>).tier, "premium");
});

test("downgrade: Premium → Plus, create_prorations", async () => {
  const { d, updates } = deps(sub("premium"));
  assert.equal((await changePlan("downgrade", "cus_1", d)).status, 200);
  assert.equal(updates[0].params.proration_behavior, "create_prorations");
  assert.deepEqual(updates[0].params.items, [{ id: "si_1", price: "price_plus_year" }]);
});

test("idempotent on the tier read from the live price: nothing is charged twice", async () => {
  const { d, updates } = deps(sub("premium"));
  const r = await changePlan("upgrade", "cus_1", d);
  assert.deepEqual(r.body, { ok: true, already: true });
  assert.equal(updates.length, 0);
});

test("refused: no OP Compare subscription (a foreign one is filtered out), not active, or set to end", async () => {
  // ourSubscription() returns null for a subscription whose Price/metadata isn't site=opcompare.
  assert.equal((await changePlan("upgrade", "cus_1", deps(null).d)).status, 400);
  assert.equal((await changePlan("upgrade", "cus_1", deps(sub("plus", { status: "trialing" })).d)).status, 400);
  assert.equal((await changePlan("upgrade", "cus_1", deps(sub("plus", { status: "past_due" })).d)).status, 400);
  const ending = deps(sub("plus", { cancel_at_period_end: true }));
  assert.equal((await changePlan("upgrade", "cus_1", ending.d)).status, 409);
  assert.equal(ending.updates.length, 0);
});

test("ourSubscription only ever returns an OP Compare subscription", () => {
  const src = code("src/lib/plan-subscription.ts");
  assert.match(src, /isOurSubscription\(s\)/);
});

test("the routes: POST only, same-origin, the caller's own customer, and no entitlement write", () => {
  for (const p of ["src/app/api/premium/upgrade/route.ts", "src/app/api/premium/downgrade/route.ts", "src/app/api/premium/resume/route.ts", "src/lib/plan-change.ts"]) {
    const src = code(p);
    assert.doesNotMatch(src, /prisma\.user\.update|premiumUntil/, `${p} must not write entitlement`);
    if (p.endsWith("route.ts")) {
      assert.match(src, /export async function POST\(/);
      assert.doesNotMatch(src, /export async function (GET|PUT|PATCH|DELETE)\(/);
      assert.match(src, /sameOrigin\(req\)/);
      assert.match(src, /user\.stripeCustomerId/);
    }
  }
  assert.match(code("src/app/api/premium/resume/route.ts"), /cancel_at_period_end: false/);
});

test("the member card states the money consequence of every button it offers", () => {
  const src = read("src/components/SubscriptionActions.tsx");
  assert.match(src, /Billed the difference for the rest of this period/);
  assert.match(src, /credited against your next invoice/);
  assert.match(src, /Billed for the year now, with credit for the rest of this month/);
  assert.match(src, /Nothing more is charged before/);
  assert.match(read("src/app/premium/PremiumPlans.tsx"), /<SubscriptionActions/);
});
