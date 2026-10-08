/**
 * Read-only: why does this account have (or lack) Premium, per Stripe's own
 * records? Prints the DB row's billing-relevant fields, then every Stripe
 * subscription on the linked customer (all statuses, not just entitled ones)
 * with its latest invoice and, if that invoice's payment failed, the actual
 * decline reason, so "payment failed but they have Premium" (or the reverse) can
 * be diagnosed from real data instead of guessed at. RiftCompare's
 * scripts/diagnose-billing.ts (parity P24) on MTG Compare's entitlement model:
 * a date and a tier on the User row, written only by the webhook, the daily
 * reconcile, the admin grant/revoke routes and the launch promotion.
 *
 * Never writes anything, to Stripe or the database. The account's email is
 * printed (you asked about it), so run it where the log is private.
 *
 * Usage: npx tsx scripts/diagnose-billing.ts someone@example.com
 * (an argument, not an environment variable: the variables the code reads are
 * the table of Annex B, tests/env-names.test.ts, and a one-off target is not one.)
 */
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { entitledUntilFromSubscription, isOurSubscription, periodEndFromSubscription, tierOfSubscription } from "../src/lib/stripe-entitlement";
import { tierOf } from "../src/lib/premium";

const EMAIL = (process.argv[2] ?? "").trim().toLowerCase();

async function main() {
  if (!EMAIL) {
    console.error("::error::the account e-mail is required: npx tsx scripts/diagnose-billing.ts someone@example.com");
    process.exit(1);
  }
  if (!stripeEnabled()) {
    console.error("::error::Stripe is not configured (no STRIPE_SECRET_KEY), so subscription state cannot be read.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: { id: true, email: true, premiumUntil: true, premiumTier: true, isAdmin: true, stripeCustomerId: true, createdAt: true, signupSource: true },
  });
  if (!user) {
    console.error(`::error::no account found with email ${EMAIL}.`);
    process.exit(1);
  }

  console.log(`Account: ${user.email} (${user.id}), created ${user.createdAt.toISOString()}, signed up from ${user.signupSource ?? "(untracked)"}`);
  console.log(`  premiumUntil      : ${user.premiumUntil ? user.premiumUntil.toISOString() : "null"}`);
  console.log(`  premiumTier       : ${user.premiumTier}`);
  console.log(`  → tier right now  : ${tierOf(user) ?? "none (a free account)"}`);
  console.log(`  isAdmin           : ${user.isAdmin}${user.isAdmin ? "  (an admin counts as Premium whatever the date says)" : ""}`);
  console.log(`  stripeCustomerId  : ${user.stripeCustomerId ?? "null"}`);

  if (!user.stripeCustomerId) {
    console.log("\nNo Stripe customer linked to this account. premiumUntil (if set) came from an admin grant or the launch promotion, not from a subscription.");
    return;
  }

  const subs = await stripe().subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 20, expand: ["data.items.data.price"] });
  console.log(`\n${subs.data.length} subscription(s) on this customer:`);

  for (const sub of subs.data) {
    const entitled = entitledUntilFromSubscription(sub);
    const periodEnd = periodEndFromSubscription(sub);
    const price = sub.items.data[0]?.price;
    console.log(`\n  Subscription ${sub.id}`);
    console.log(`    status              : ${sub.status}`);
    console.log(`    ours?               : ${isOurSubscription(sub) ? "yes (site tag matches)" : "NO - not MTG Compare's, the site ignores it"}`);
    console.log(`    price / tier        : ${price?.lookup_key ?? price?.id ?? "?"} -> ${tierOfSubscription(sub)}`);
    console.log(`    current_period_end  : ${periodEnd ? periodEnd.toISOString() : "n/a"}`);
    console.log(`    entitles access?    : ${entitled && isOurSubscription(sub) ? `YES, through ${entitled.toISOString()}` : "NO"}`);
    console.log(`    cancel_at_period_end: ${sub.cancel_at_period_end}`);
    console.log(`    metadata.userId     : ${sub.metadata?.userId ?? "unset"}${sub.metadata?.userId && sub.metadata.userId !== user.id ? "  (DIFFERENT account)" : ""}`);

    const latestInvoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
    if (!latestInvoiceId) {
      console.log("    latest_invoice      : none");
      continue;
    }
    try {
      const invoice = await stripe().invoices.retrieve(latestInvoiceId, { expand: ["payment_intent"] });
      console.log(`    latest_invoice      : ${invoice.id} (status ${invoice.status})`);
      console.log(`      amount_due/paid   : ${invoice.amount_due} / ${invoice.amount_paid} ${invoice.currency}`);
      const pi = (invoice as unknown as { payment_intent?: unknown }).payment_intent;
      const piObj = pi && typeof pi !== "string" ? (pi as { status?: string; last_payment_error?: { message?: string; decline_code?: string } }) : null;
      if (piObj) {
        console.log(`      payment_intent    : status=${piObj.status ?? "?"}`);
        if (piObj.last_payment_error) {
          console.log(`      LAST PAYMENT ERROR: ${piObj.last_payment_error.message ?? "?"} (decline_code=${piObj.last_payment_error.decline_code ?? "?"})`);
        }
      }
    } catch (e) {
      console.log(`    latest_invoice      : could not retrieve (${(e as Error).message})`);
    }
  }

  if (!subs.data.length) {
    console.log("  (no subscriptions at all on this Stripe customer)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
