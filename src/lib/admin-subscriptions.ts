// /admin/subscriptions reads: every MTG Compare subscription in Stripe (the
// metrics' source of truth) and how many accounts the DB currently entitles.
// Uncached; calling Stripe on an ADMIN page view is fine (the no-Stripe-on-
// page-load rule is about public pages).
import type Stripe from "stripe";
import { prisma } from "./db";
import { stripe } from "./stripe";
import { ourRows, type SubRow } from "./subscription-metrics";

export const MAX_SUBSCRIPTION_PAGES = 20;

/** Pages through the account (100 per page, ≤ 20 pages) and keeps only site=mtgcompare subscriptions. */
export async function fetchSubscriptionRows(maxPages = MAX_SUBSCRIPTION_PAGES): Promise<{ rows: SubRow[]; capped: boolean }> {
  const subs: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page: Stripe.ApiList<Stripe.Subscription> = await stripe().subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subs.push(...page.data);
    if (!page.has_more || page.data.length === 0) return { rows: ourRows(subs), capped: false };
    startingAfter = page.data[page.data.length - 1]!.id;
  }
  return { rows: ourRows(subs), capped: true };
}

/** Accounts with a paid-through date in the future (includes manual grants; admins without a date are not counted). */
export function entitledInDbCount(): Promise<number> {
  return prisma.user.count({ where: { premiumUntil: { gt: new Date() } } });
}
