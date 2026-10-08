/**
 * Reconcile STRIPE (who is actually paying) against the DATABASE (who actually
 * has Premium or Plus). READ-ONLY, always. RiftCompare's
 * scripts/audit-premium-vs-stripe.ts (parity P24), without its FIX mode.
 *
 * WHY. A restore of the database from an older snapshot loses every write after
 * it, and for PAYING subscribers that is the worst possible loss: they keep being
 * charged while the site treats them as free. It surfaces as a support ticket, if
 * at all; nothing in the app errors. Stripe is the authority here, not the
 * database: it is the system that took the money and it was never rolled back. So
 * walk every live subscription of THIS site and assert the database agrees.
 *
 * For each active/trialing subscription (past_due never entitles) it checks the
 * three things that must ALL hold for a subscriber to keep working:
 *
 *   1. a User row exists for the subscription (its metadata.userId, the customer
 *      id on a row, or, only to REPORT it, the customer's e-mail)
 *   2. premiumUntil is >= the subscription's current_period_end
 *      (a shortfall means they paid for time the site will not honour) and
 *      premiumTier is the tier of the live Price
 *   3. the next renewal can find the row: subscription.metadata.userId matches it
 *      or User.stripeCustomerId matches the customer
 *
 * NO FIX MODE, on purpose. MTG Compare's entitlement has four writers (the Stripe
 * webhook, the daily reconcile, the admin grant and revoke routes, the launch
 * promotion) and a maintenance script is not one of them (CLAUDE.md, "Plus &
 * Premium"). A shortfall repairs itself the next time the reconcile runs:
 * POST /api/admin/stripe-reconcile (admin session) or the daily cron stamps every
 * subscription of this site, extend-only. A no-account case needs the customer to
 * sign in once; an OAuth row carries a provider identity nobody can invent.
 *
 * Output is ids, never e-mail addresses: CI logs are retained.
 *
 * Usage:  npx tsx scripts/audit-premium-vs-stripe.ts
 */
import type Stripe from "stripe";
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { ENTITLED_STATUSES, isOurSubscription, periodEndFromSubscription, tierOfSubscription, userIdFromSubscription } from "../src/lib/stripe-entitlement";

type Problem = "no-account" | "premium-short" | "renewal-unlinked" | "tier-mismatch";
const customerIdOf = (sub: Stripe.Subscription): string => (typeof sub.customer === "string" ? sub.customer : sub.customer.id);

async function main() {
  if (!stripeEnabled()) {
    console.error("::error::STRIPE_SECRET_KEY is not set, so there is nothing to audit.");
    process.exit(1);
  }

  const subs: Stripe.Subscription[] = [];
  let foreign = 0;
  for (const status of ENTITLED_STATUSES as Set<Stripe.SubscriptionListParams.Status>) {
    // Auto-pagination: a missed subscriber is the whole failure mode here, so never cap the page at Stripe's default 10.
    for await (const s of stripe().subscriptions.list({ status, limit: 100, expand: ["data.items.data.price"] })) {
      if (isOurSubscription(s)) subs.push(s);
      else foreign++;
    }
  }
  console.log(`Stripe: ${subs.length} ${[...ENTITLED_STATUSES].join("/")} MTG Compare subscription(s)${foreign ? ` (${foreign} from other products in the account, ignored)` : ""}.\n`);

  const problems: { sub: string; customer: string; kind: Problem; detail: string }[] = [];
  let ok = 0;

  for (const sub of subs) {
    const customerId = customerIdOf(sub);
    const periodEnd = periodEndFromSubscription(sub);
    const metaUserId = userIdFromSubscription(sub);
    const select = { id: true, premiumUntil: true, premiumTier: true, stripeCustomerId: true } as const;
    let user = metaUserId ? await prisma.user.findUnique({ where: { id: metaUserId }, select }) : null;
    user ??= await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select });

    if (!user) {
      // Report only: the e-mail is looked up to say whether the person HAS an account, never written anywhere and never printed.
      let hasAccountByEmail = false;
      try {
        const c = await stripe().customers.retrieve(customerId);
        const email = !("deleted" in c && c.deleted) ? (c.email ?? "").trim().toLowerCase() : "";
        hasAccountByEmail = Boolean(email) && Boolean(await prisma.user.findFirst({ where: { email }, select: { id: true } }));
      } catch {
        /* reported without it */
      }
      problems.push({
        sub: sub.id,
        customer: customerId,
        kind: "no-account",
        detail: `paying (${sub.status}, through ${periodEnd?.toISOString() ?? "?"}) but no account is linked${hasAccountByEmail ? "; an account with the customer's e-mail exists but carries neither link, so no renewal can find it" : "; no account has the customer's e-mail either"}`,
      });
      continue;
    }

    let issue = false;

    // (2) does the database honour what they have paid for?
    if (periodEnd && (!user.premiumUntil || user.premiumUntil < periodEnd)) {
      issue = true;
      problems.push({ sub: sub.id, customer: customerId, kind: "premium-short", detail: `user ${user.id}: premiumUntil=${user.premiumUntil?.toISOString() ?? "null"} < paid-through ${periodEnd.toISOString()}` });
    }
    // (2b) and the tier of the live Price (a Plus subscriber stamped Premium, or the reverse)?
    const liveTier = tierOfSubscription(sub);
    if (user.premiumTier !== liveTier) {
      issue = true;
      problems.push({ sub: sub.id, customer: customerId, kind: "tier-mismatch", detail: `user ${user.id}: premiumTier=${user.premiumTier} but the live Price is ${liveTier}` });
    }

    // (3) can the next renewal still find them? Either link is enough for stampFromSubscription.
    const metaOk = metaUserId === user.id;
    const custOk = user.stripeCustomerId === customerId;
    if (!metaOk && !custOk) {
      issue = true;
      problems.push({ sub: sub.id, customer: customerId, kind: "renewal-unlinked", detail: `user ${user.id}: metadata.userId=${metaUserId ?? "unset"}, User.stripeCustomerId=${user.stripeCustomerId ?? "null"}` });
    }

    if (!issue) ok++;
  }

  console.log(`${ok}/${subs.length} subscription(s) fully consistent.`);
  if (!problems.length) {
    console.log("No discrepancies. Every paying subscriber has access and a working renewal link.");
    return;
  }

  console.log(`\n${problems.length} discrepancy(ies):`);
  for (const p of problems) console.log(`  [${p.kind}] ${p.sub} (customer ${p.customer}): ${p.detail}`);

  const shortfalls = problems.filter((p) => p.kind === "premium-short" || p.kind === "tier-mismatch");
  if (shortfalls.length) {
    console.log(`\n${shortfalls.length} shortfall(s) repair themselves: run the Stripe reconcile (POST /api/admin/stripe-reconcile as an admin, or wait for the daily cron). It stamps every subscription of this site, extend-only.`);
  }
  const orphans = problems.filter((p) => p.kind === "no-account" || p.kind === "renewal-unlinked");
  if (orphans.length) {
    console.log(`\n::warning::${orphans.length} paying customer(s) cannot be matched to an account by the renewal path. This script does not fix them: ask the customer to sign in once, or grant the time from /admin/accounts, then run the reconcile again.`);
  }
  process.exitCode = 1; // a discrepancy is a red run, so a scheduled audit gets noticed
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
