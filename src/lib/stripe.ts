// The Stripe client, created lazily so a build without STRIPE_SECRET_KEY works
// and every paid surface simply reads as "not configured". Checkout is hosted
// by Stripe, so no publishable key is needed anywhere.
//
// OP Compare should run on its OWN Stripe account (docs/SETUP.md): RiftCompare's
// daily reconcile matches every subscription in its account by email, so an OP
// Compare subscriber sharing that account could be granted RiftCompare Premium.
import Stripe from "stripe";
import { INTERVALS, TIERS, lookupKey, type Interval, type Tier } from "./plans";

let client: Stripe | null = null;

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Price ids by lookup key (opcompare_plus_month …), read from Stripe and kept
// for ten minutes. No price-id env vars to keep in sync by hand.
let priceCache: { at: number; ids: Map<string, string> } | null = null;

export async function priceIdFor(tier: Tier, interval: Interval): Promise<string | null> {
  if (!priceCache || Date.now() - priceCache.at > 10 * 60 * 1000) {
    const keys = TIERS.flatMap((t) => INTERVALS.map((i) => lookupKey(t, i)));
    const res = await stripe().prices.list({ lookup_keys: keys, active: true, limit: keys.length });
    priceCache = { at: Date.now(), ids: new Map(res.data.filter((p) => p.lookup_key).map((p) => [p.lookup_key!, p.id])) };
  }
  return priceCache.ids.get(lookupKey(tier, interval)) ?? null;
}

// The Customer Portal configuration scripts/stripe-setup.ts creates (metadata
// site=opcompare): cancel, card, invoices and Plus ↔ Premium / monthly ↔ yearly
// switches. Falls back to the account default when there isn't one.
let portalCache: { at: number; id: string | null } | null = null;

export async function portalConfigurationId(): Promise<string | undefined> {
  if (!portalCache || Date.now() - portalCache.at > 10 * 60 * 1000) {
    const list = await stripe().billingPortal.configurations.list({ active: true, limit: 50 });
    portalCache = { at: Date.now(), id: list.data.find((c) => c.metadata?.site === "opcompare")?.id ?? null };
  }
  return portalCache.id ?? undefined;
}
