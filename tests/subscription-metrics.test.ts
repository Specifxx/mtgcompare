// /admin/subscriptions maths (ported from RiftCompare, minus its legacy-price
// and checkout-surface cases), plus the filter that keeps other sites'
// subscriptions out of MTG Compare's numbers.
import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { computeSubscriptionMetrics, monthlyValueCents, ourRows, type SubRow } from "../src/lib/subscription-metrics";

// Fixed clock so cohort months and 30d windows are deterministic.
const NOW = Date.UTC(2026, 7, 27); // 2026-08-27
const DAY = 86_400_000;
const ago = (d: number) => NOW - d * DAY;

function row(p: Partial<SubRow>): SubRow {
  return {
    status: "active",
    interval: "month",
    unitAmount: 499,
    currency: "usd",
    createdMs: ago(10),
    canceledAtMs: null,
    endedAtMs: null,
    trialEndMs: null,
    tier: "premium",
    ...p,
  };
}

test("monthlyValueCents normalises a yearly plan to 1/12", () => {
  assert.equal(monthlyValueCents({ interval: "month", unitAmount: 499 }), 499);
  assert.equal(monthlyValueCents({ interval: "year", unitAmount: 3900 }), 325);
  assert.equal(monthlyValueCents({ interval: null, unitAmount: 999 }), 0);
});

test("empty account yields no fake numbers", () => {
  const m = computeSubscriptionMetrics([], NOW);
  assert.equal(m.active, 0);
  assert.equal(m.mrrCents, 0);
  assert.equal(m.arpuCents, 0);
  assert.equal(m.churnRatePct, null, "no subs → churn is unknown, not 0%");
  assert.equal(m.ltvCents, null);
  assert.equal(m.trialConvPct, null);
  assert.equal(m.trialsStarted, 0);
});

test("MRR, plan mix, tier mix, ARPU, churn, LTV and cohorts compute correctly", () => {
  const rows: SubRow[] = [
    row({ createdMs: ago(5), tier: "plus", unitAmount: 299 }), // A: active monthly Plus, new
    row({ createdMs: ago(40), trialEndMs: ago(26) }), // B: active monthly, trial converted
    row({ createdMs: ago(100) }), // C: active monthly, old
    row({ interval: "year", unitAmount: 3900, createdMs: ago(60), trialEndMs: ago(46) }), // D: active annual
    row({ status: "trialing", createdMs: ago(3), trialEndMs: NOW + 11 * DAY }), // E: trialing (not MRR)
    row({ status: "canceled", createdMs: ago(50), canceledAtMs: ago(10), endedAtMs: ago(10), trialEndMs: ago(36) }), // F: churned
    row({ currency: "aud", unitAmount: 699, createdMs: ago(20), tier: "plus" }), // G: active monthly AUD
    row({ status: "past_due", createdMs: ago(70) }), // H: past due still counts as a customer
  ];
  const m = computeSubscriptionMetrics(rows, NOW);
  assert.equal(m.currency, "usd");
  assert.equal(m.active, 5, "A,B,C,D,H are the active USD subs");
  assert.equal(m.pastDue, 1);
  assert.equal(m.monthlyActive, 4);
  assert.equal(m.annualActive, 1);
  assert.equal(m.trialing, 1);
  assert.equal(m.plusActive, 2, "A and G, across currencies");
  assert.equal(m.premiumActive, 4);
  // MRR = 299 + 499*3 + 3900/12
  assert.equal(m.mrrCents, 299 + 499 * 3 + 325);
  assert.equal(m.arrCents, m.mrrCents * 12);
  assert.equal(m.arpuCents, Math.round(m.mrrCents / 5));
  assert.equal(m.churned30, 1);
  assert.equal(m.churnRatePct, (1 / 6) * 100);
  assert.equal(m.ltvCents, Math.round(m.arpuCents / (1 / 6)));
  assert.equal(m.new7, 2);
  assert.equal(m.new30, 3);
  assert.equal(m.trialsStarted, 4);
  assert.equal(m.trialsConverted, 2);
  assert.equal(m.trialConvPct, 50);
  assert.equal(m.byCurrency.length, 2);
  const aud = m.byCurrency.find((b) => b.currency === "aud");
  assert.ok(aud && aud.active === 1 && aud.mrrCents === 699);
  assert.equal(m.cohorts[0]!.month, "2026-08");
  assert.equal(m.cohorts[0]!.started, 3);
  const jul = m.cohorts.find((c) => c.month === "2026-07");
  assert.ok(jul && jul.started === 2 && jul.active === 1 && jul.retentionPct === 50);
});

test("only MTG Compare's subscriptions reach the metrics, with the tier from the live Price", () => {
  const sub = (site: string | null, tier: string, id: string) =>
    ({
      id,
      status: "active",
      created: NOW / 1000,
      canceled_at: null,
      ended_at: null,
      trial_end: null,
      metadata: {},
      items: { data: [{ price: { id: `price_${id}`, unit_amount: 499, currency: "usd", recurring: { interval: "month" }, metadata: site ? { site, tier } : {} } }] },
    }) as unknown as Stripe.Subscription;
  const rows = ourRows([sub("mtgcompare", "plus", "a"), sub("riftcompare", "premium", "b"), sub(null, "premium", "c"), sub("mtgcompare", "premium", "d")]);
  assert.equal(rows.length, 2, "another site's (or an untagged) subscription is excluded");
  assert.deepEqual(rows.map((r) => r.tier), ["plus", "premium"]);
  assert.equal(rows[0]!.interval, "month");
  assert.equal(rows[0]!.unitAmount, 499);
});
