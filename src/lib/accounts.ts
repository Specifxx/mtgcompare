// Find-or-create the account behind an OAuth sign-in (RiftCompare's rules):
// 1. the provider id already linked → that account (the email is never changed);
// 2. otherwise only a provider-VERIFIED email may go further:
//    an account with that email gets the provider linked, else a new account.
import { prisma } from "./db";
import type { OAuthProfile, OAuthProvider } from "./oauth";
import { isCountry } from "./country";
import { claimAlertsForUser } from "./alerts";
import { claimLaunchPromo } from "./launch-promo";

// `signupSource` (wave 2): the whitelisted sign-up surface from the
// mc_signup_src cookie (lib/signup-source-shared.ts parseSignupSource),
// stamped on a NEW account only — never rewritten on a later sign-in.
export async function upsertOAuthUser(provider: OAuthProvider, p: OAuthProfile, opts: { signupSource?: string | null } = {}): Promise<{ id: string; isNew: boolean; promo: boolean } | null> {
  if (!p.providerId || !p.email) return null;
  const link = provider === "google" ? { googleId: p.providerId } : { discordId: p.providerId };
  const byProvider = await prisma.user.findFirst({ where: link, select: { id: true, avatarUrl: true, emailVerified: true } });
  if (byProvider) {
    await prisma.user.update({
      where: { id: byProvider.id },
      data: { lastLoginAt: new Date(), avatarUrl: byProvider.avatarUrl ?? p.avatar, emailVerified: byProvider.emailVerified ?? (p.emailVerified ? new Date() : null) },
    });
    await claimAlertsForUser(byProvider.id, p.email); // anonymous watches made before signing in (lib/alerts.ts)
    return { id: byProvider.id, isNew: false, promo: false };
  }
  if (!p.emailVerified) return null;
  const byEmail = await prisma.user.findUnique({ where: { email: p.email }, select: { id: true, avatarUrl: true, emailVerified: true } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { ...link, lastLoginAt: new Date(), avatarUrl: byEmail.avatarUrl ?? p.avatar, emailVerified: byEmail.emailVerified ?? new Date() },
    });
    await claimAlertsForUser(byEmail.id, p.email);
    return { id: byEmail.id, isNew: false, promo: false };
  }
  const created = await prisma.user.create({
    data: {
      email: p.email,
      displayName: (p.name ?? p.email.split("@")[0]).slice(0, 24),
      ...link,
      emailVerified: new Date(),
      avatarUrl: p.avatar,
      lastLoginAt: new Date(),
      signupSource: opts.signupSource ?? null,
    },
    select: { id: true },
  });
  await claimAlertsForUser(created.id, p.email);
  // The launch promotion (lib/launch-promo.ts): the first 50 NEW accounts get a
  // month of Premium. Only here, only for a row created just now.
  const promo = await claimLaunchPromo(created.id);
  return { id: created.id, isNew: true, promo };
}

/**
 * The market an account chose (User.preferredCountry), from the welcome
 * checklist's market step via /api/account/country (wave 2). One
 * select-limited update of the caller's own row; an unknown code is refused.
 */
export async function setPreferredCountry(userId: string, country: unknown): Promise<boolean> {
  if (!isCountry(country)) return false;
  await prisma.user.update({ where: { id: userId }, data: { preferredCountry: country }, select: { id: true } });
  return true;
}
