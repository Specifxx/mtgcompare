// The Stripe client, created lazily so a build without STRIPE_SECRET_KEY works
// and every paid surface simply reads as "not configured". Checkout is hosted
// by Stripe, so no publishable key is needed anywhere.
//
// MTG Compare runs on its OWN Stripe account, created inside the owner's
// RiftCompare organisation (docs/SETUP.md): RiftCompare's daily reconcile matches
// every subscription in its account by email, so an MTG Compare subscriber sharing
// that account could be granted RiftCompare Premium.
import Stripe from "stripe";
import { INTERVALS, STRIPE_SITE, TIERS, lookupKey, type Interval, type Tier } from "./plans";

let client: Stripe | null = null;

/** Stripe is configured: a key exists, live or test. Billing for an EXISTING subscription (portal, plan changes, reconcile, webhook) runs on this. */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// TEST MODE IS NOT OPEN CHECKOUT. MTG Compare stays on a Stripe TEST key until
// the owner decides to take payments (docs/SETUP.md section 6): a test key takes
// test cards and charges no one, so a visitor's "Get Plus" must not reach it,
// and a test card must not buy a real entitlement (the webhook stamps any paid
// test subscription). The mode is read from the key's own prefix: Stripe's
// secret keys are sk_live_ / sk_test_, restricted keys rk_live_ / rk_test_.
// Checkout is offered only on a live key; anything else fails closed. There is
// no publishable key in this site (Checkout is hosted), so the secret key is
// the one source, and only the boolean ever reaches a page.
export type StripeMode = "off" | "test" | "live" | "unknown";

/** The mode of a Stripe key, from its prefix. Pure. */
export function stripeModeOf(key: string | null | undefined): StripeMode {
  const k = (key ?? "").trim();
  if (!k) return "off";
  if (/^[sr]k_live_/.test(k)) return "live";
  if (/^[sr]k_test_/.test(k)) return "test";
  return "unknown";
}

export function stripeMode(): StripeMode {
  return stripeModeOf(process.env.STRIPE_SECRET_KEY);
}

/** May this visitor start a NEW checkout? Live: everyone. Test: an admin only (the owner testing the flow; never shown as a button). Off or unknown: no one. Pure. */
export function checkoutAllowed(mode: StripeMode, isAdmin: boolean): boolean {
  return mode === "live" || (mode === "test" && isAdmin);
}

/**
 * Are the public buy buttons open? Only on a live key: with a test key every
 * "Get Plus / Get Premium" is a disabled button with "Checkout opens soon".
 * It switches itself on when the live key replaces the test key (Vercel applies
 * a changed variable at the next deployment, which SETUP's go-live step ends with).
 */
export function checkoutOpen(): boolean {
  return checkoutAllowed(stripeMode(), false);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Price ids by lookup key (mtgcompare_plus_month …), read from Stripe and kept
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
// site=mtgcompare): cancel, card, invoices and Plus ↔ Premium / monthly ↔ yearly
// switches. Falls back to the account default when there isn't one.
let portalCache: { at: number; id: string | null } | null = null;

export async function portalConfigurationId(): Promise<string | undefined> {
  if (!portalCache || Date.now() - portalCache.at > 10 * 60 * 1000) {
    const list = await stripe().billingPortal.configurations.list({ active: true, limit: 50 });
    portalCache = { at: Date.now(), id: list.data.find((c) => c.metadata?.site === STRIPE_SITE)?.id ?? null };
  }
  return portalCache.id ?? undefined;
}
