// Manual Plus/Premium grant and revoke, from /admin/accounts (admin session
// only, audited by the routes with adminLog). The one amendment to the
// entitlement-writer rule: besides the Stripe webhook and the daily reconcile,
// these two may write User.premiumUntil. A grant only ever EXTENDS (it stacks
// on the current date); a revoke is the single explicit exception to
// extend-only. Neither calls Stripe: a live subscription re-grants itself at
// its next webhook or reconcile, which the admin UI says out loud.
import { isAdminEmail } from "./admin-emails";
import { prisma } from "./db";
import { isTier, type Tier } from "./plans";

/** Switch for the grant/revoke routes, should the owner want them off. */
export const ADMIN_GRANTS = true;
export const MAX_GRANT_DAYS = 1830;
const DAY = 86_400_000;

/** New paid-through date: `days` on top of max(now, current). Pure. */
export function grantedUntil(current: Date | null, days: number, now = new Date()): Date {
  const from = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(from + days * DAY);
}

/**
 * Of the candidate rows, the ones whose email equals `email` exactly, ignoring
 * case only. Never a pattern match: `_` and `%` are ordinary characters here,
 * so `a_b@x.com` never finds `axb@x.com` (Prisma's `mode: "insensitive"` is an
 * ILIKE on Postgres, which treats both as wildcards). Pure, for the tests.
 */
export function exactEmailMatches<T extends { email: string }>(rows: T[], email: string): T[] {
  const want = email.trim().toLowerCase();
  return rows.filter((r) => r.email.toLowerCase() === want);
}

const USER_SELECT = { id: true, email: true, premiumUntil: true, premiumTier: true, isAdmin: true, stripeCustomerId: true } as const;

/** The ONE account with exactly this email (case-insensitive equality), or null; refuses an ambiguous match. */
async function findByEmail(email: string) {
  const ids = await prisma.$queryRaw<{ id: string; email: string }[]>`SELECT id, email FROM "User" WHERE lower(email) = ${email.toLowerCase()} LIMIT 2`;
  const exact = exactEmailMatches(ids, email);
  if (exact.length !== 1) return null; // none, or two accounts differing only in case: refuse rather than guess
  return prisma.user.findUnique({ where: { id: exact[0]!.id }, select: USER_SELECT });
}

type NotFound = { ok: false; status: 404; error: "No account with that email" };
const NOT_FOUND: NotFound = { ok: false, status: 404, error: "No account with that email" };

export async function grantByEmail(
  email: string,
  days: number,
  tier: Tier,
  now = new Date(),
): Promise<{ ok: true; email: string; before: Date | null; after: Date; tier: Tier; tierChanged: boolean } | NotFound> {
  const user = await findByEmail(email);
  if (!user) return NOT_FOUND;
  const after = grantedUntil(user.premiumUntil, days, now);
  // An active subscriber's tier is never changed here: the webhook re-stamps it
  // from the live Price anyway. Only a lapsed or free account takes the tier.
  const active = Boolean(user.premiumUntil && user.premiumUntil.getTime() > now.getTime());
  const tierChanged = !active && user.premiumTier !== tier;
  await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: after, ...(active ? {} : { premiumTier: tier }) } });
  return { ok: true, email: user.email, before: user.premiumUntil, after, tier: active ? (isTier(user.premiumTier) ? user.premiumTier : "premium") : tier, tierChanged };
}

export async function revokeByEmail(
  email: string,
): Promise<{ ok: true; email: string; was: Date | null; wasTier: string; stillAdmin: boolean; hasStripeCustomer: boolean } | NotFound> {
  const user = await findByEmail(email);
  if (!user) return NOT_FOUND;
  // Only the date. Never isAdmin, premiumTier, stripeCustomerId or Stripe.
  await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: null } });
  return {
    ok: true,
    email: user.email,
    was: user.premiumUntil,
    wasTier: user.premiumTier,
    stillAdmin: user.isAdmin || isAdminEmail(user.email),
    hasStripeCustomer: Boolean(user.stripeCustomerId),
  };
}

// One "@", no whitespace, and none of the characters a pattern, a URL or a
// header could misread (`%`, `*`, a backslash, `"`, `<>`, `,;:`, `?&=`). `_`
// stays legal: it is common in real addresses, and the lookup above is exact.
const ADMIN_EMAIL_RE = /^[a-z0-9._+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Body validation shared by both routes. */
export function parseAdminEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e || e.length > 200 || !ADMIN_EMAIL_RE.test(e)) return null;
  return e;
}

export function parseGrantDays(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_GRANT_DAYS ? v : null;
}
