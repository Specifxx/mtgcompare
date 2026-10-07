// /admin and /admin/accounts reads. Owner-only traffic, so UNCACHED by design
// (unstable_cache lives in lib/data.ts only), with narrow selects: about seven
// small queries per accounts view.
import type { Prisma } from "@prisma/client";
import { isAdminEmail } from "./admin-emails";
import { newCounts } from "./admin-inbox";
import { prisma } from "./db";
import { tierOf } from "./premium";
import type { Tier } from "./plans";
import { STORES } from "./stores";

const STORE_KEYS = new Set(STORES.map((s) => s.key));

export const ACCOUNT_FILTERS = ["all", "paid", "plus", "premium", "verified", "recent"] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];
export const ACCOUNT_FILTER_LABELS: Record<AccountFilter, string> = {
  all: "All",
  paid: "Any paid",
  plus: "Plus",
  premium: "Premium",
  verified: "Verified",
  recent: "Signed in 7d",
};
export const MAX_ACCOUNT_ROWS = 500;
export const MAX_QUERY_LENGTH = 100;

const DAY = 86_400_000;

export function isAccountFilter(v: unknown): v is AccountFilter {
  return typeof v === "string" && (ACCOUNT_FILTERS as readonly string[]).includes(v);
}

export interface AccountRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerified: boolean;
  google: boolean;
  discord: boolean;
  admin: boolean;
  premiumUntil: Date | null;
  tier: Tier | null; // the PAID tier active now (admin override not applied), null if none
  lapsed: boolean;
  stripeCustomer: boolean;
}

/** The Prisma filter for a list view. Pure, exported for tests. */
export function accountWhere(f: AccountFilter, q: string | undefined, now: Date): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (f === "paid") and.push({ premiumUntil: { gt: now } });
  if (f === "plus") and.push({ premiumUntil: { gt: now }, premiumTier: "plus" });
  if (f === "premium") and.push({ premiumUntil: { gt: now }, premiumTier: { not: "plus" } });
  if (f === "verified") and.push({ emailVerified: { not: null } });
  if (f === "recent") and.push({ lastLoginAt: { gte: new Date(now.getTime() - 7 * DAY) } });
  const term = (q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (term) {
    and.push({ OR: [{ email: { contains: term, mode: "insensitive" } }, { displayName: { contains: term, mode: "insensitive" } }] });
  }
  return and.length ? { AND: and } : {};
}

export async function listAccounts(opts: { q?: string; f?: AccountFilter; take?: number }): Promise<{ rows: AccountRow[]; capped: boolean }> {
  const now = new Date();
  const take = Math.min(Math.max(1, opts.take ?? MAX_ACCOUNT_ROWS), MAX_ACCOUNT_ROWS);
  const users = await prisma.user.findMany({
    where: accountWhere(opts.f ?? "all", opts.q, now),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    select: {
      id: true, email: true, displayName: true, createdAt: true, lastLoginAt: true, emailVerified: true, googleId: true, discordId: true,
      isAdmin: true, premiumUntil: true, premiumTier: true, stripeCustomerId: true,
    },
  });
  const capped = users.length > take;
  const rows = users.slice(0, take).map((u): AccountRow => {
    const tier = tierOf({ isAdmin: false, premiumUntil: u.premiumUntil, premiumTier: u.premiumTier }, now.getTime());
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      emailVerified: u.emailVerified != null,
      google: Boolean(u.googleId),
      discord: Boolean(u.discordId),
      admin: u.isAdmin || isAdminEmail(u.email),
      premiumUntil: u.premiumUntil,
      tier,
      lapsed: !tier && u.premiumUntil != null,
      stripeCustomer: Boolean(u.stripeCustomerId),
    };
  });
  return { rows, capped };
}

export interface AccountStats {
  total: number;
  verified: number;
  plusActive: number;
  premiumActive: number;
  signedIn7d: number;
  signups30: { day: string; n: number }[]; // 30 UTC days, oldest first, zero-filled
  new7: number;
  new30: number;
  /** New accounts in 30 days by User.signupSource (wave 2; "—" = not recorded). */
  bySource30: { k: string; n: number }[];
  /** Accounts active in the last 7 days (User.lastActiveAt, lib/activity.ts). */
  active7d: number;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** 30 zero-filled UTC days ending today, oldest first. Pure, exported for tests. */
export function bucketSignups(dates: Date[], now: Date): { day: string; n: number }[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 30 }, (_, i) => dayKey(new Date(today - (29 - i) * DAY)));
  const counts = new Map(days.map((d) => [d, 0]));
  for (const d of dates) {
    const k = dayKey(d);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return days.map((day) => ({ day, n: counts.get(day)! }));
}

export async function accountStats(now = new Date()): Promise<AccountStats> {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [total, verified, plusActive, premiumActive, signedIn7d, recent, sources, active7d] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.user.count({ where: { premiumUntil: { gt: now }, premiumTier: "plus" } }),
    prisma.user.count({ where: { premiumUntil: { gt: now }, premiumTier: { not: "plus" } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.user.groupBy({ by: ["signupSource"], _count: { _all: true }, where: { createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { lastActiveAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
  ]);
  const dates = recent.map((r) => r.createdAt);
  return {
    total,
    verified,
    plusActive,
    premiumActive,
    signedIn7d,
    signups30: bucketSignups(dates, now),
    new7: dates.filter((d) => now.getTime() - d.getTime() <= 7 * DAY).length,
    new30: dates.length,
    bySource30: sources.map((r) => ({ k: r.signupSource ?? "—", n: r._count._all })).sort((a, b) => b.n - a.n),
    active7d,
  };
}

const orNull = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export interface AdminHomeCounts {
  accounts: number | null;
  paying: number | null;
  inboxNew: number | null;
  storesFailed: number | null;
}

/**
 * The /admin home's tiles: small counts in one round (the inbox's four NEW
 * counts come from lib/admin-inbox.ts). Each is wrapped, so a
 * failure shows "–" instead of breaking the page. "Stores whose last read
 * failed" is one small SQL query over each store's own newest appearance, the
 * same rule as store-health's `last-read-failed`/`failing` alerts, so every
 * store it counts is listed under "Needs a look" there.
 */
export async function getAdminHomeCounts(now = new Date()): Promise<AdminHomeCounts> {
  const [accounts, paying, inbox, failed] = await Promise.all([
    orNull(prisma.user.count()),
    orNull(prisma.user.count({ where: { premiumUntil: { gt: now } } })),
    orNull(newCounts()),
    // Each store's OWN newest read (the rule /admin/store-health uses), never
    // "the newest full run": a partial IMPORT_ONLY_* rerun is also kind
    // 'full' and would count failures among just the stores it read.
    orNull(
      prisma.$queryRaw<{ key: string }[]>`
        SELECT key FROM (
          SELECT DISTINCT ON (s->>'key') s->>'key' AS key, (s->>'failed')::boolean AS failed
          FROM "ImportRun" r CROSS JOIN LATERAL jsonb_array_elements(r.summary->'stores') s
          WHERE r.ok AND r.summary ? 'stores' AND r."finishedAt" > now() - interval '8 days'
          ORDER BY s->>'key', r.id DESC
        ) latest
        WHERE failed`,
    ),
  ]);
  return {
    accounts,
    paying,
    inboxNew: inbox ? inbox.reports + inbox.suggestions + inbox.feedback + inbox.contact : null,
    storesFailed: failed ? failed.filter((r) => STORE_KEYS.has(r.key)).length : null,
  };
}
