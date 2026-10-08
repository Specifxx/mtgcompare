// /admin/lookup?q=: ONE account by e-mail or id, read-only (the grant and revoke forms live on /admin/accounts and are audited by adminLog). Owner-only, UNCACHED, select-limited.
// The Stripe customer id is shown by its last six characters only.
import { prisma } from "./db";
import { tierOf } from "./premium";

type Db = typeof prisma;

export interface LookupResult {
  id: string; email: string; displayName: string; isAdmin: boolean; plan: string; premiumUntil: Date | null; stripeCustomerTail: string | null;
  signupSource: string | null; createdAt: Date; lastLoginAt: Date | null; activeDays: number; signIns: string[];
  counts: { priceAlerts: number; sealedWatches: number; deckWatches: number; collectionLines: number; notifications: number; publishedDecks: number; supportTickets: number };
  notifications: { type: string; createdAt: Date }[];
}

/** A query is an e-mail (contains @) or a cuid-like id; anything else, or over 100 characters, is not looked up (pure). */
export function parseLookup(q: string | null | undefined): { by: "email" | "id"; value: string } | null {
  const v = (q ?? "").trim().slice(0, 100);
  if (!v) return null;
  if (v.includes("@")) return { by: "email", value: v.toLowerCase() };
  return /^[a-z0-9]{20,32}$/i.test(v) ? { by: "id", value: v } : null;
}
export const lastSix = (id: string | null | undefined): string | null => (id ? id.slice(-6) : null);

export async function lookupAccount(q: string | null | undefined, db: Db = prisma, now = new Date()): Promise<LookupResult | null> {
  const p = parseLookup(q);
  if (!p) return null;
  const u = await db.user.findFirst({
    where: p.by === "email" ? { email: p.value } : { id: p.value },
    select: { id: true, email: true, displayName: true, isAdmin: true, premiumUntil: true, premiumTier: true, stripeCustomerId: true, signupSource: true, createdAt: true, lastLoginAt: true, activeDays: true, googleId: true, discordId: true },
  });
  if (!u) return null;
  const [priceAlerts, sealedWatches, deckWatches, collectionLines, notifications, publishedDecks, supportTickets, recent] = await Promise.all([
    db.priceAlert.count({ where: { userId: u.id } }),
    db.sealedWatch.count({ where: { userId: u.id } }),
    db.deckWatch.count({ where: { userId: u.id } }),
    db.collectionCard.count({ where: { userId: u.id } }),
    db.notification.count({ where: { userId: u.id } }),
    db.publishedDeck.count({ where: { userId: u.id } }),
    db.supportTicket.count({ where: { userId: u.id } }),
    db.notification.findMany({ where: { userId: u.id }, select: { type: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return {
    id: u.id, email: u.email, displayName: u.displayName, isAdmin: u.isAdmin,
    plan: tierOf({ isAdmin: false, premiumUntil: u.premiumUntil, premiumTier: u.premiumTier }, now.getTime()) ?? "free",
    premiumUntil: u.premiumUntil, stripeCustomerTail: lastSix(u.stripeCustomerId), signupSource: u.signupSource, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, activeDays: u.activeDays,
    signIns: [u.googleId ? "Google" : "", u.discordId ? "Discord" : ""].filter(Boolean),
    counts: { priceAlerts, sealedWatches, deckWatches, collectionLines, notifications, publishedDecks, supportTickets },
    notifications: recent,
  };
}
