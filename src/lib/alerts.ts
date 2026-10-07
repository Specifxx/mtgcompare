import { prisma } from "./db";

/**
 * Attach an account to the price watches its owner created before signing in.
 *
 * Price alerts shipped account-free: the wishlist pop-up asks for an email and
 * nothing else, so a row's only identity is its address. Someone who watched a
 * few cards anonymously and registered afterwards would otherwise never see
 * those watches on /watching — they would be invisible but still emailing, the
 * worst of both.
 *
 * Called on every sign-in (register, login, OAuth callback) rather than once at
 * migration time, because the anonymous flow still exists: a person can watch
 * cards today and create an account next week, and that gap never closes.
 *
 * Idempotent and cheap: it only matches rows that are still unclaimed, so it is
 * a no-op updateMany once there is nothing left to adopt. Safe to call on every
 * session start and safe to fire-and-forget.
 *
 * Exact lowercase equality is correct — PriceAlert.email is stored trimmed and
 * lowercased (the zod schema on the subscribe route enforces it) and every
 * User.email write path lowercases too.
 */
export async function claimAlertsForUser(userId: string, email: string): Promise<number> {
  const addr = email.trim().toLowerCase();
  if (!addr) return 0;
  const res = await prisma.priceAlert
    .updateMany({ where: { email: addr, userId: null }, data: { userId } })
    .catch(() => ({ count: 0 }));
  return res.count;
}
