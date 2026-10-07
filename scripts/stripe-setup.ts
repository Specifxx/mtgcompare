// One-off (and safe to re-run) Stripe setup for OP Compare, run by the
// "Stripe setup" workflow with the STRIPE_SECRET_KEY secret:
//   • a Product per tier (metadata site=opcompare, tier),
//   • a recurring Price per tier × interval, from src/lib/plans.ts, with the
//     lookup key the site reads (opcompare_plus_month …) — a changed amount gets
//     a NEW Price and the lookup key moves to it (existing subscribers keep theirs),
//   • a Customer Portal configuration (cancel at period end, card, invoices,
//     switch between the four Prices), found by the site via metadata.
// It never touches anything without metadata site=opcompare, and prints only ids.
// The webhook endpoint is made in the Dashboard (its signing secret must go to
// Vercel), and this script reports whether it exists.
import Stripe from "stripe";
import { INTERVALS, PLAN_CENTS, PLAN_CURRENCY, STRIPE_SITE, TIERS, TIER_NAMES, lookupKey } from "../src/lib/plans";

const SITE = (process.env.SITE_URL || "https://opcompare.app").replace(/\/+$/, "");
const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.log("STRIPE_SECRET_KEY is not set — nothing to do.");
    return;
  }
  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieveCurrent();
  console.log(`Stripe account: ${account.settings?.dashboard?.display_name ?? account.id} (${key.startsWith("sk_live") ? "LIVE" : "TEST"} mode)`);

  const existing: Stripe.Product[] = [];
  for await (const p of stripe.products.list({ limit: 100, active: true })) if (p.metadata?.site === STRIPE_SITE) existing.push(p);

  const portalProducts: { product: string; prices: string[] }[] = [];
  for (const tier of TIERS) {
    let product = existing.find((p) => p.metadata.tier === tier);
    if (!product) {
      product = await stripe.products.create({
        name: `OP Compare ${TIER_NAMES[tier]}`,
        description: tier === "plus" ? "No ads and every Deal Finder deal on opcompare.app." : "Everything in Plus, plus Best Basket on opcompare.app.",
        metadata: { site: STRIPE_SITE, tier },
      });
      console.log(`Created product ${product.id} (${product.name})`);
    } else console.log(`Product ${product.id} (${product.name}) exists`);
    const prices: string[] = [];
    for (const interval of INTERVALS) {
      const lk = lookupKey(tier, interval);
      const amount = PLAN_CENTS[tier][interval];
      const found = (await stripe.prices.list({ lookup_keys: [lk], limit: 1 })).data[0];
      if (found && found.active && found.unit_amount === amount && found.currency === PLAN_CURRENCY && found.recurring?.interval === interval && found.product === product.id) {
        console.log(`  ${lk}: ${found.id} ($${(amount / 100).toFixed(2)}/${interval}) exists`);
        prices.push(found.id);
        continue;
      }
      const price = await stripe.prices.create({
        product: product.id,
        currency: PLAN_CURRENCY,
        unit_amount: amount,
        recurring: { interval },
        lookup_key: lk,
        transfer_lookup_key: true,
        nickname: `${TIER_NAMES[tier]} ${interval === "month" ? "monthly" : "yearly"}`,
        metadata: { site: STRIPE_SITE, tier, interval },
      });
      console.log(`  ${lk}: created ${price.id} ($${(amount / 100).toFixed(2)}/${interval})${found ? ` — replaces ${found.id}` : ""}`);
      prices.push(price.id);
    }
    portalProducts.push({ product: product.id, prices });
  }

  const portalParams = {
    business_profile: { headline: "OP Compare — manage your plan", privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
    default_return_url: `${SITE}/account`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email" as const] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" as const },
      subscription_update: { enabled: true, default_allowed_updates: ["price" as const], proration_behavior: "create_prorations" as const, products: portalProducts },
    },
    metadata: { site: STRIPE_SITE },
  };
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 50 });
  const mine = configs.data.find((c) => c.metadata?.site === STRIPE_SITE);
  if (mine) {
    await stripe.billingPortal.configurations.update(mine.id, portalParams);
    console.log(`Portal configuration ${mine.id} updated`);
  } else {
    const c = await stripe.billingPortal.configurations.create(portalParams);
    console.log(`Portal configuration ${c.id} created`);
  }

  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const url = `${SITE}/api/stripe/webhook`;
  const hook = hooks.data.find((h) => h.url === url);
  if (!hook) console.log(`\nWEBHOOK MISSING: add an endpoint for ${url} in the Dashboard with events:\n  ${EVENTS.join("\n  ")}\nand put its signing secret in Vercel as STRIPE_WEBHOOK_SECRET.`);
  else {
    const missing = EVENTS.filter((e) => !hook.enabled_events.includes(e) && !hook.enabled_events.includes("*"));
    console.log(`\nWebhook ${hook.id} → ${url}: ${hook.status}${missing.length ? `; MISSING events: ${missing.join(", ")}` : "; all six events subscribed"}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
