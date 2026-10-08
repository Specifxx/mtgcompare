// Subscription analytics for MTG Compare's Plus and Premium (ported from
// RiftCompare's lib/subscription-metrics.ts): MRR/ARR, active vs trialing, plan
// and tier mix, new vs churned, an estimated monthly churn rate, a rough LTV,
// trial→paid conversion and a signup-month cohort-retention table.
//
// STRIPE IS THE SOURCE OF TRUTH here, not User.premiumUntil — only Stripe knows
// the plan, the amount, the currency and the real cancel/renew history. PURE:
// no Stripe client and no db. The fetch lives in lib/admin-subscriptions.ts, so
// the maths (and the "is it ours" filter) is unit-testable without an account.
import type Stripe from "stripe";
import type { Tier } from "./plans";
import { isOurSubscription, tierOfSubscription } from "./stripe-entitlement";

// A Stripe subscription flattened to just what the metrics need, so a test can
// build rows by hand.
export interface SubRow {
  status: Stripe.Subscription.Status;
  interval: "day" | "week" | "month" | "year" | null;
  unitAmount: number; // minor units (cents), per `currency`
  currency: string; // lowercase ISO, e.g. "usd"
  createdMs: number;
  canceledAtMs: number | null;
  endedAtMs: number | null;
  trialEndMs: number | null;
  tier: Tier; // from tierOfSubscription (the live Price's metadata, then the subscription's)
}

const DAY = 86_400_000;

// Normalise one Stripe subscription (with its price expanded) to a SubRow.
export function toSubRow(sub: Stripe.Subscription): SubRow {
  const item = sub.items?.data?.[0];
  const price = item?.price as Stripe.Price | undefined;
  return {
    status: sub.status,
    interval: (price?.recurring?.interval as SubRow["interval"]) ?? null,
    unitAmount: price?.unit_amount ?? 0,
    currency: (price?.currency ?? "usd").toLowerCase(),
    createdMs: sub.created * 1000,
    canceledAtMs: sub.canceled_at ? sub.canceled_at * 1000 : null,
    endedAtMs: sub.ended_at ? sub.ended_at * 1000 : null,
    trialEndMs: sub.trial_end ? sub.trial_end * 1000 : null,
    tier: tierOfSubscription(sub),
  };
}

// Per-copy monthly value, so a yearly plan contributes 1/12 of its price to MRR.
export function monthlyValueCents(row: Pick<SubRow, "interval" | "unitAmount">): number {
  switch (row.interval) {
    case "year":
      return Math.round(row.unitAmount / 12);
    case "month":
      return row.unitAmount;
    case "week":
      return Math.round((row.unitAmount * 52) / 12);
    case "day":
      return Math.round((row.unitAmount * 365) / 12);
    default:
      return 0;
  }
}

export interface CurrencyBlock {
  currency: string;
  active: number;
  monthlyActive: number;
  annualActive: number;
  mrrCents: number;
}

export interface CohortRow {
  month: string; // "YYYY-MM"
  started: number;
  active: number;
  retentionPct: number;
}

export interface SubscriptionMetrics {
  total: number; // rows considered
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  new7: number;
  new30: number;
  churned30: number;
  churnRatePct: number | null; // monthly, estimate; null when there's nothing to divide by
  // Money is reported in the DOMINANT currency (most active subs). Mixed-currency
  // accounts also get the full per-currency breakdown so nothing is silently
  // summed across currencies.
  currency: string;
  mrrCents: number;
  arrCents: number;
  arpuCents: number;
  monthlyActive: number;
  annualActive: number;
  // Tier mix among active subs, from each row's tier.
  plusActive: number;
  premiumActive: number;
  ltvCents: number | null; // ARPU / churn — estimate; null when churn is 0/unknown
  trialsStarted: number;
  trialsConverted: number;
  trialConvPct: number | null;
  byCurrency: CurrencyBlock[];
  cohorts: CohortRow[];
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// True for a subscription that is live right now (billing or in a paid-committed
// state). `trialing` is counted separately, not as active MRR.
// past_due counts here — a card that failed this cycle is still a customer —
// even though it never EARNS entitlement (lib/stripe-entitlement.ts).
export function isActive(s: Stripe.Subscription.Status): boolean {
  return s === "active" || s === "past_due";
}

export function computeSubscriptionMetrics(rows: SubRow[], nowMs: number, cohortMonths = 12): SubscriptionMetrics {
  const active = rows.filter((r) => isActive(r.status));
  const trialing = rows.filter((r) => r.status === "trialing");

  // Money, grouped by currency so nothing is added across currencies.
  const curMap = new Map<string, CurrencyBlock>();
  for (const r of active) {
    const b =
      curMap.get(r.currency) ??
      { currency: r.currency, active: 0, monthlyActive: 0, annualActive: 0, mrrCents: 0 };
    b.active += 1;
    if (r.interval === "year") b.annualActive += 1;
    else if (r.interval === "month") b.monthlyActive += 1;
    b.mrrCents += monthlyValueCents(r);
    curMap.set(r.currency, b);
  }
  const byCurrency = [...curMap.values()].sort((a, b) => b.active - a.active);
  const head = byCurrency[0] ?? { currency: "usd", active: 0, monthlyActive: 0, annualActive: 0, mrrCents: 0 };

  const new7 = rows.filter((r) => nowMs - r.createdMs <= 7 * DAY).length;
  const new30 = rows.filter((r) => nowMs - r.createdMs <= 30 * DAY).length;

  // Churned in the last 30d: a subscription that reached a terminal state
  // (canceled/ended) within the window. Uses whichever terminal stamp it has.
  const churned30 = rows.filter((r) => {
    const end = r.endedAtMs ?? (r.status === "canceled" ? r.canceledAtMs : null);
    return end != null && nowMs - end <= 30 * DAY;
  }).length;

  // Monthly churn ≈ churned / (still-active + churned). A denominator of 0 (no
  // subs at all) yields null rather than a fake 0%.
  const churnDenom = head.active + churned30;
  const churnRatePct = churnDenom > 0 ? (churned30 / churnDenom) * 100 : null;

  // Tier mix — across ALL active subs regardless of currency, unlike the
  // money figures above which are dominant-currency-only: a count doesn't
  // need a common unit to be summed.
  let plusActive = 0;
  let premiumActive = 0;
  for (const r of active) {
    if (r.tier === "plus") plusActive += 1;
    else premiumActive += 1;
  }

  const arpuCents = head.active > 0 ? Math.round(head.mrrCents / head.active) : 0;
  const ltvCents = churnRatePct && churnRatePct > 0 ? Math.round(arpuCents / (churnRatePct / 100)) : null;

  // Trial → paid: of the subs that ever had a trial, how many made it to a live
  // paying state after the trial ended.
  const trialed = rows.filter((r) => r.trialEndMs != null);
  const trialsStarted = trialed.length;
  const trialsConverted = trialed.filter((r) => r.trialEndMs! <= nowMs && isActive(r.status)).length;
  const trialConvPct = trialsStarted > 0 ? (trialsConverted / trialsStarted) * 100 : null;

  // Cohort retention by signup month — the single clearest read on whether the
  // bucket holds.
  const cohortMap = new Map<string, { started: number; active: number }>();
  for (const r of rows) {
    const k = monthKey(r.createdMs);
    const c = cohortMap.get(k) ?? { started: 0, active: 0 };
    c.started += 1;
    if (isActive(r.status) || r.status === "trialing") c.active += 1;
    cohortMap.set(k, c);
  }
  const cohorts: CohortRow[] = [...cohortMap.entries()]
    .map(([month, c]) => ({ month, started: c.started, active: c.active, retentionPct: c.started > 0 ? (c.active / c.started) * 100 : 0 }))
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, cohortMonths);

  return {
    total: rows.length,
    active: head.active,
    trialing: trialing.length,
    pastDue: rows.filter((r) => r.status === "past_due").length,
    canceled: rows.filter((r) => r.status === "canceled").length,
    new7,
    new30,
    churned30,
    churnRatePct,
    currency: head.currency,
    mrrCents: head.mrrCents,
    arrCents: head.mrrCents * 12,
    arpuCents,
    monthlyActive: head.monthlyActive,
    annualActive: head.annualActive,
    plusActive,
    premiumActive,
    ltvCents,
    trialsStarted,
    trialsConverted,
    trialConvPct,
    byCurrency,
    cohorts,
  };
}

/**
 * Only MTG Compare's subscriptions (Price or subscription metadata site=mtgcompare,
 * the same test the webhook applies), flattened. Anything else in the Stripe
 * account never reaches the metrics.
 */
export function ourRows(subs: Stripe.Subscription[]): SubRow[] {
  return subs.filter((s) => isOurSubscription(s)).map(toSubRow);
}
