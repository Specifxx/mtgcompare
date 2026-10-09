// The plan-interest beacon writes (RiftCompare's /api/premium/click). Outbound
// shop clicks are NOT recorded any more (owner's call, 2026-10-05: each one was
// a database write and cost network credits); GA's buy_click is the only count.
// Server-only: the routes in src/app/api may not import @/lib/db themselves
// (tests/nested-cache.test.ts). Each is ONE small insert, per click, never
// read on a page: only /admin/premium reads them back
// (src/lib/admin-clicks.ts, uncached). pruneBeacons deletes rows older than
// CLICK_RETENTION_DAYS; no workflow calls it yet (there is one import a day).
import { prisma } from "./db";
import type { Tier } from "./plans";

/** How long beacon rows are kept; also the admin reports' widest window. */
export const CLICK_RETENTION_DAYS = 90;

export async function recordPlanClick(surface: string, tier: Tier | null, userId: string | null): Promise<void> {
  await prisma.premiumClick.create({ data: { surface, tier, userId } });
}

/**
 * A STARTED CHECKOUT (wave 2): written by /api/premium/checkout once Stripe
 * returned a session, with the surface that sent the buyer (or "checkout"
 * when none is known). source "checkout" tells it apart from a click, for
 * /admin/premium's "Started checkout by surface".
 */
export async function recordCheckoutStart(surface: string | null, tier: Tier, userId: string): Promise<void> {
  await prisma.premiumClick.create({ data: { surface: surface ?? "checkout", tier, userId, source: "checkout" } });
}

/** Delete plan-interest rows older than the retention window (indexed on createdAt). */
export async function pruneBeacons(now = Date.now()): Promise<{ planClicks: number }> {
  const before = new Date(now - CLICK_RETENTION_DAYS * 86_400_000);
  const planClicks = await prisma.premiumClick.deleteMany({ where: { createdAt: { lt: before } } });
  return { planClicks: planClicks.count };
}
