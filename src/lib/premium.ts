// Who is entitled to what. Entitlement is a DATE (User.premiumUntil) and a tier
// (User.premiumTier, from the Stripe Price) — reading it never calls Stripe.
// The webhook, the daily reconcile and the admin grant/revoke routes
// (lib/admin-billing.ts, admin session only, audited) are the only writers.
// They only ever extend the date (lib/stripe-entitlement.ts,
// extendedPremiumUntil), except an explicit admin revoke.
import { prisma } from "./db";
import { mintEntitlement, type Entitlement } from "./data/plane/entitlement";
import { SIGNED_OUT } from "./premium-gates";
import { TIER_RANK, isTier, type Tier } from "./plans";
import { customerIdOf, entitledUntilFromSubscription, extendedPremiumUntil, isOurSubscription, tierOfSubscription, userIdFromSubscription } from "./stripe-entitlement";

export interface EntitlementFields {
  isAdmin: boolean;
  premiumUntil: Date | null;
  premiumTier: string;
}

/** The tier a user has RIGHT NOW, or null. Admins are Premium. */
export function tierOf(user: EntitlementFields | null | undefined, now = Date.now()): Tier | null {
  if (!user) return null;
  if (user.isAdmin) return "premium";
  if (!user.premiumUntil || user.premiumUntil.getTime() <= now) return null;
  return isTier(user.premiumTier) ? user.premiumTier : "premium";
}

/**
 * THE MINT of the opaque Entitlement the three paid loaders take (Deal Finder,
 * Rising Cards, Demand Finder: lib/data/plane/entitlement.ts). A page or route
 * calls this ONCE with the session user and hands the value to the loader; the
 * loader looks at it, never the caller, and cuts the ranking after the cache
 * (lib/premium-gates.ts is the only module that says how many rows).
 *   • no user (signed out, or the read of the user failed) → signed out, which
 *     is the tier-less end of the gate, NEVER Premium;
 *   • an admin is "premium" (tierOf), so an admin sees everything;
 *   • the tier comes from tierOf(), i.e. from the stored entitlement date, not
 *     from a header, a cookie hint or a query parameter.
 * `mintEntitlement` is called from here and from tests, nowhere else.
 */
export function entitlementOf(user: EntitlementFields | null | undefined, now = Date.now()): Entitlement {
  if (!user) return mintEntitlement(SIGNED_OUT);
  return mintEntitlement({ signedIn: true, tier: tierOf(user, now) });
}

/**
 * entitlementOf over a READ of the user: a read that throws (Neon down, a bad
 * row) is a signed-out viewer, never Premium and never an error page for a
 * public tool. lib/auth.ts currentEntitlement() is this over getCurrentUser.
 */
export async function entitlementOfRead(read: () => Promise<EntitlementFields | null | undefined>, now = Date.now()): Promise<Entitlement> {
  try {
    return entitlementOf(await read(), now);
  } catch {
    return entitlementOf(null, now);
  }
}

/** Does the user have at least `min` (Plus by default)? */
export function isPremium(user: EntitlementFields | null | undefined, min: Tier = "plus", now = Date.now()): boolean {
  const t = tierOf(user, now);
  return t != null && TIER_RANK[t] >= TIER_RANK[min];
}

/**
 * Write what a Stripe subscription entitles, extend-only. Returns what it did,
 * for logs. Ignores subscriptions that are not MTG Compare's and statuses that
 * earn nothing (past_due, canceled, unpaid, incomplete).
 */
export async function stampFromSubscription(sub: unknown, hintUserId?: string | null): Promise<"stamped" | "unchanged" | "not-ours" | "not-entitled" | "no-user"> {
  if (!isOurSubscription(sub)) return "not-ours";
  const until = entitledUntilFromSubscription(sub);
  if (!until) return "not-entitled";
  const customerId = customerIdOf(sub);
  const userId = userIdFromSubscription(sub) ?? hintUserId ?? null;
  const user =
    (userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, premiumUntil: true, premiumTier: true, stripeCustomerId: true } }) : null) ??
    (customerId ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true, premiumUntil: true, premiumTier: true, stripeCustomerId: true } }) : null);
  if (!user) return "no-user";
  const tier = tierOfSubscription(sub);
  const next = extendedPremiumUntil(user.premiumUntil, until);
  const linkCustomer = Boolean(customerId && !user.stripeCustomerId);
  const tierChange = user.premiumTier !== tier;
  if (!next && !linkCustomer && !tierChange) return "unchanged";
  await prisma.user.update({
    where: { id: user.id },
    data: { ...(next ? { premiumUntil: next } : {}), ...(linkCustomer ? { stripeCustomerId: customerId } : {}), ...(tierChange ? { premiumTier: tier } : {}) },
  });
  return "stamped";
}
