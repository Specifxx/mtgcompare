// One-off (and safe to re-run) Stripe setup for MTG Compare, run by the
// "Stripe setup" workflow with the STRIPE_SECRET_KEY secret of MTG Compare's OWN
// Stripe account (created inside the owner's RiftCompare organisation; never
// RiftCompare's keys):
//   • a Product per tier (metadata site=mtgcompare, tier, statement descriptor
//     MTGCOMPARE),
//   • a recurring Price per tier × interval, from src/lib/plans.ts, with the
//     lookup key the site reads (mtgcompare_plus_month …) — a changed amount gets
//     a NEW Price and the lookup key moves to it (existing subscribers keep theirs),
//   • a Customer Portal configuration (cancel at period end, card, invoices,
//     switch between the four Prices), found by the site via metadata.
// It never touches anything without metadata site=mtgcompare, and prints only ids.
// The webhook endpoint is made in the Dashboard (its signing secret must go to
// Vercel), and this script reports whether it exists. Account BRANDING (colour
// #9140da, icon <SITE_URL>/icon-512.png) is a Dashboard setting with no API for
// your own account: the script only reads it and says what is off.
import Stripe from "stripe";
import { INTERVALS, PLAN_CENTS, PLAN_CURRENCY, STRIPE_SITE, TIERS, TIER_NAMES, lookupKey } from "../src/lib/plans";

const SITE = (process.env.SITE_URL || "https://mtgcompare.app").replace(/\/+$/, "");
const HOST = new URL(SITE).host;
/** MTG Compare's "Arcane Ink" amethyst (brand spec): Dashboard > Settings > Branding. */
const BRAND_COLOR = "#9140da";
const BRAND_ICON = `${SITE}/icon-512.png`;
/** On the card statement of every subscription charge (22 characters at most, capitals). */
const STATEMENT_DESCRIPTOR = "MTGCOMPARE";
const DESCRIPTIONS: Record<(typeof TIERS)[number], string> = {
  plus: `No ads and every Deal Finder deal on ${HOST}.`,
  premium: `Everything in Plus, plus the full Rising Cards and Demand Finder lists and Best Basket on ${HOST}.`,
};
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
  const branding = account.settings?.branding;
  if (branding?.primary_color?.toLowerCase() !== BRAND_COLOR) console.log(`BRANDING: set the brand colour to ${BRAND_COLOR} and the icon to ${BRAND_ICON} (Dashboard > Settings > Branding); it is ${branding?.primary_color ?? "not set"} now.`);
  else console.log(`Branding colour ${BRAND_COLOR} is set.`);

  const existing: Stripe.Product[] = [];
  for await (const p of stripe.products.list({ limit: 100, active: true })) if (p.metadata?.site === STRIPE_SITE) existing.push(p);

  const portalProducts: { product: string; prices: string[] }[] = [];
  for (const tier of TIERS) {
    let product = existing.find((p) => p.metadata.tier === tier);
    if (!product) {
      product = await stripe.products.create({
        name: `MTG Compare ${TIER_NAMES[tier]}`,
        description: DESCRIPTIONS[tier],
        statement_descriptor: STATEMENT_DESCRIPTOR,
        metadata: { site: STRIPE_SITE, tier },
      });
      console.log(`Created product ${product.id} (${product.name})`);
    } else {
      console.log(`Product ${product.id} (${product.name}) exists`);
      if (product.statement_descriptor !== STATEMENT_DESCRIPTOR || product.description !== DESCRIPTIONS[tier]) {
        await stripe.products.update(product.id, { statement_descriptor: STATEMENT_DESCRIPTOR, description: DESCRIPTIONS[tier] });
        console.log(`  updated its description and statement descriptor (${STATEMENT_DESCRIPTOR})`);
      }
    }
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
    business_profile: { headline: "MTG Compare — manage your plan", privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
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
