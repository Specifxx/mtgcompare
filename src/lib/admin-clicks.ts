// /admin/premium reads (RiftCompare's admin page of the same name). Owner-only traffic, so UNCACHED by design (unstable_cache lives in
// lib/data.ts only), grouped in the database, with a capped recent list.
import { CLICK_RETENTION_DAYS } from "./beacons";
import { prisma } from "./db";
import { tierOf } from "./premium";
import type { Tier } from "./plans";

const DAY = 86_400_000;
export const PLAN_CLICK_SAMPLE = 2000;

// Rows older than this are pruned (lib/beacons.ts pruneBeacons), so it is also
// the widest window the reports show.
export { CLICK_RETENTION_DAYS };

export interface InterestUser {
  userId: string;
  count: number;
  last: Date;
  surfaces: string[];
  displayName: string;
  email: string;
  tier: Tier | null;
}

/** Fold recent PremiumClick rows into one entry per signed-in user (pure). */
export function foldPlanClicks(rows: { userId: string | null; surface: string; createdAt: Date }[]): { byUser: Map<string, { count: number; last: Date; surfaces: Set<string> }>; anon: number } {
  const byUser = new Map<string, { count: number; last: Date; surfaces: Set<string> }>();
  let anon = 0;
  for (const r of rows) {
    if (!r.userId) {
      anon++;
      continue;
    }
    const cur = byUser.get(r.userId) ?? { count: 0, last: r.createdAt, surfaces: new Set<string>() };
    cur.count++;
    if (r.createdAt > cur.last) cur.last = r.createdAt;
    cur.surfaces.add(r.surface);
    byUser.set(r.userId, cur);
  }
  return { byUser, anon };
}

export interface PlanInterestReport {
  totals: { d90: number; d7: number; d30: number; checkout30: number };
  bySurface30: { k: string; n: number }[];
  /** Checkouts STARTED (PremiumClick source "checkout", wave 2), by the surface that sent the buyer. */
  checkoutBySurface30: { k: string; n: number }[];
  users: InterestUser[];
  anon: number;
  converted: number;
  sampled: boolean;
}

export async function loadPlanInterest(now = Date.now()): Promise<PlanInterestReport> {
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const d90 = new Date(now - CLICK_RETENTION_DAYS * DAY);
  const [e90, e7, e30, checkout30, surface30, recent, started30] = await Promise.all([
    prisma.premiumClick.count({ where: { createdAt: { gte: d90 } } }),
    prisma.premiumClick.count({ where: { createdAt: { gte: d7 } } }),
    prisma.premiumClick.count({ where: { createdAt: { gte: d30 } } }),
    // A started checkout: the route's row (source "checkout"), or a wave-1 client "checkout" beacon.
    prisma.premiumClick.count({ where: { createdAt: { gte: d30 }, OR: [{ source: "checkout" }, { surface: "checkout" }] } }),
    prisma.premiumClick.groupBy({ by: ["surface"], _count: { _all: true }, where: { createdAt: { gte: d30 }, source: "click" } }),
    prisma.premiumClick.findMany({ where: { createdAt: { gte: d90 } }, orderBy: { createdAt: "desc" }, take: PLAN_CLICK_SAMPLE, select: { userId: true, surface: true, createdAt: true } }),
    prisma.premiumClick.groupBy({ by: ["surface"], _count: { _all: true }, where: { createdAt: { gte: d30 }, source: "checkout" } }),
  ]);
  const { byUser, anon } = foldPlanClicks(recent);
  const ids = [...byUser.keys()];
  const found = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true, isAdmin: true, premiumUntil: true, premiumTier: true } })
    : [];
  const users: InterestUser[] = found
    .map((u) => {
      const a = byUser.get(u.id)!;
      return { userId: u.id, count: a.count, last: a.last, surfaces: [...a.surfaces], displayName: u.displayName, email: u.email, tier: tierOf(u, now) };
    })
    .sort((a, b) => b.last.getTime() - a.last.getTime());
  return {
    totals: { d90: e90, d7: e7, d30: e30, checkout30 },
    bySurface30: surface30.map((r) => ({ k: r.surface, n: r._count._all })).sort((a, b) => b.n - a.n),
    checkoutBySurface30: started30.map((r) => ({ k: r.surface, n: r._count._all })).sort((a, b) => b.n - a.n),
    users,
    anon,
    converted: users.filter((u) => u.tier != null).length,
    sampled: e90 > PLAN_CLICK_SAMPLE,
  };
}
