// /admin/loyalty: the most active members (ported from RiftCompare; parity P20). Ranked by distinct active days (User.activeDays, stamped by the session touch), then collection size and
// Premium tenure. Owner-only, UNCACHED, select-limited. Admins are excluded (they are the owner), and the first weeks are thin by construction: the counter starts at deploy.
import { prisma } from "./db";
import { isAdminEmail } from "./admin-emails";
import { tierOf } from "./premium";

type Db = typeof prisma;
export const LOYALTY_ROWS = 25;

export interface LoyaltyRow {
  userId: string; email: string; displayName: string; activeDays: number; lastActiveAt: Date | null; createdAt: Date;
  collectionLines: number; plan: "free" | "plus" | "premium"; premiumSince: null; memberDays: number;
}

/** Member age in whole days (pure). */
export const memberDays = (createdAt: Date, now = new Date()): number => Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));

export async function loadLoyalty(db: Db = prisma, now = new Date()): Promise<LoyaltyRow[]> {
  const users = await db.user.findMany({
    where: { isAdmin: false, activeDays: { gt: 0 } },
    select: { id: true, email: true, displayName: true, activeDays: true, lastActiveAt: true, createdAt: true, premiumUntil: true, premiumTier: true, _count: { select: { collection: true } } },
    orderBy: [{ activeDays: "desc" }, { lastActiveAt: "desc" }],
    take: LOYALTY_ROWS * 2,
  });
  return users
    .filter((u) => !isAdminEmail(u.email))
    .slice(0, LOYALTY_ROWS)
    .map((u) => ({
      userId: u.id, email: u.email, displayName: u.displayName, activeDays: u.activeDays, lastActiveAt: u.lastActiveAt, createdAt: u.createdAt,
      collectionLines: u._count.collection,
      plan: (tierOf({ isAdmin: false, premiumUntil: u.premiumUntil, premiumTier: u.premiumTier }, now.getTime()) ?? "free") as LoyaltyRow["plan"],
      premiumSince: null, memberDays: memberDays(u.createdAt, now),
    }));
}
