import { prisma } from "./db";
import { type Country } from "./country";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { sealedWatchLimit, sealedWatchCeiling, SEALED_WATCH_LIMIT_PLUS, SEALED_WATCH_HARD_CAP } from "./alert-limits";
import { clampTargetCents } from "./target-price";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES — Plus and Premium. RiftCompare's lib/sealed-watch.ts route
// logic, ported in wave 2 (2026-10-03).
// ─────────────────────────────────────────────────────────────────────────────
// One sealed product (MTG Compare: a Sealed.id, the TCGplayer productId —
// RiftCompare keys by a listing groupKey) in one market. Plus watches up to
// SEALED_WATCH_LIMIT_PLUS, Premium is unlimited up to the SEALED_WATCH_HARD_CAP
// sanity ceiling (lib/alert-limits.ts). The RUN that checks them after each
// import — restock after a sell-out, target, drop; real stores only, never
// eBay or TCGplayer; no RRP trigger until an MSRP table exists — is the
// collection-alerts track's (scripts/alerts.ts), which delivers in-app while
// email is off. This file is what the routes need: create, list, update and
// delete, each scoped to the owner.
//
// Egress: per-user, select-limited, called only from /api/watches/sealed/**
// (CLAUDE.md, the accounts exception).

export type SealedWatchRouteDb = {
  sealedWatch: Pick<typeof prisma.sealedWatch, "count" | "create" | "findFirst" | "findMany" | "update" | "deleteMany">;
  sealed: { findUnique: (args: { where: { id: number }; select: { id: true } }) => PromiseLike<{ id: number } | null> };
};

export interface WatchRouteResult {
  status: number;
  body: Record<string, unknown>;
}

export type RouteUser = EntitlementFields & { id: string; email: string };

export const SEALED_WATCH_SELECT = {
  id: true,
  market: true,
  sealedId: true,
  targetCents: true,
  lastPriceCents: true,
  lastInStock: true,
  soldOutAt: true,
  lastEmailedCents: true,
  lastNotifiedAt: true,
  lastFlaggedAt: true,
  snoozedUntil: true,
  createdAt: true,
} as const;

const asInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : null);

function notPlus(): WatchRouteResult {
  return { status: 402, body: { error: "Sealed watches are part of Plus.", code: "tier_required", tier: "plus" } };
}

/**
 * POST: watch one product in the viewer's market. 402 without a paid tier; on
 * Plus, 409 at SEALED_WATCH_LIMIT_PLUS (Premium: at the hard cap). Watching a
 * product already watched updates its target instead.
 */
export async function createSealedWatch(db: SealedWatchRouteDb, user: RouteUser, raw: unknown, market: Country): Promise<WatchRouteResult> {
  if (!isPremium(user)) return notPlus();
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sealedId = asInt(body.sealedId);
  if (sealedId == null || sealedId <= 0) return { status: 400, body: { error: "Which product?" } };
  const targetRaw = body.targetCents == null ? null : asInt(body.targetCents);
  if (body.targetCents != null && targetRaw == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
  const targetCents = targetRaw == null ? null : clampTargetCents(targetRaw);
  const existing = await db.sealedWatch.findFirst({ where: { userId: user.id, sealedId, market }, select: { id: true } });
  if (existing) {
    const watch = await db.sealedWatch.update({
      where: { id: existing.id },
      data: "targetCents" in body ? { targetCents, lastEmailedCents: null } : {},
      select: SEALED_WATCH_SELECT,
    });
    return { status: 200, body: { ok: true, watch, existed: true } };
  }
  const product = await db.sealed.findUnique({ where: { id: sealedId }, select: { id: true } });
  if (!product) return { status: 400, body: { error: "Which product?" } };
  const tier = tierOf(user);
  const ceiling = sealedWatchCeiling(tier);
  const count = await db.sealedWatch.count({ where: { userId: user.id } });
  if (count >= ceiling) {
    if (tier === "premium") {
      return { status: 409, body: { error: `Sealed watches stop at ${SEALED_WATCH_HARD_CAP} products per account. Stop one to add another.`, code: "limit", limit: SEALED_WATCH_HARD_CAP, count } };
    }
    return {
      status: 409,
      body: { error: `Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} sealed products. Stop one, or move to Premium for unlimited.`, code: "limit", limit: SEALED_WATCH_LIMIT_PLUS, count },
    };
  }
  const watch = await db.sealedWatch.create({ data: { userId: user.id, email: user.email, market, sealedId, targetCents }, select: SEALED_WATCH_SELECT });
  return { status: 201, body: { ok: true, watch } };
}

/** GET: this account's sealed watches, oldest first. */
export async function listSealedWatches(db: SealedWatchRouteDb, user: RouteUser): Promise<WatchRouteResult> {
  const watches = await db.sealedWatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, take: 500, select: SEALED_WATCH_SELECT });
  const limit = sealedWatchLimit(tierOf(user));
  return { status: 200, body: { watches, limit: Number.isFinite(limit) ? limit : null, entitled: isPremium(user) } };
}

/**
 * PATCH: change the target (re-arms it) or snooze / unsnooze. The owner only.
 * Editing the target is Plus's; snoozing needs no entitlement.
 */
export async function updateSealedWatch(db: SealedWatchRouteDb, user: RouteUser, id: string, raw: unknown, now: Date = new Date()): Promise<WatchRouteResult> {
  if (raw && typeof raw === "object" && "targetCents" in raw && !isPremium(user)) return notPlus();
  const row = await db.sealedWatch.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!row) return { status: 404, body: { error: "That watch isn't on your list." } };
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: { targetCents?: number | null; lastEmailedCents?: null; snoozedUntil?: Date | null } = {};
  if ("targetCents" in body) {
    if (body.targetCents == null) data.targetCents = null;
    else {
      const t = asInt(body.targetCents);
      if (t == null) return { status: 400, body: { error: "The target must be a whole number of cents." } };
      data.targetCents = clampTargetCents(t);
    }
    data.lastEmailedCents = null;
  }
  if ("snoozeDays" in body) {
    const d = asInt(body.snoozeDays);
    if (d == null || d < 0 || d > 365) return { status: 400, body: { error: "Snooze for up to a year." } };
    data.snoozedUntil = d === 0 ? null : new Date(now.getTime() + d * 86_400_000);
  }
  if (!Object.keys(data).length) return { status: 400, body: { error: "Nothing to change." } };
  const watch = await db.sealedWatch.update({ where: { id: row.id }, data, select: SEALED_WATCH_SELECT });
  return { status: 200, body: { ok: true, watch } };
}

/** DELETE: stop watching. The owner only, whatever the tier; idempotent. */
export async function deleteSealedWatch(db: SealedWatchRouteDb, user: RouteUser, id: string): Promise<WatchRouteResult> {
  const res = await db.sealedWatch.deleteMany({ where: { id, userId: user.id } });
  return { status: res.count ? 200 : 404, body: { ok: res.count > 0, removed: res.count } };
}

/** How many sealed watches an account holds (a lapsed owner's section on /watching). */
export function sealedWatchCount(userId: string): Promise<number> {
  return prisma.sealedWatch.count({ where: { userId } }).catch(() => 0);
}

/** The product ids an account watches (any market), for naming them on /watching. */
export async function watchedSealedIds(userId: string): Promise<number[]> {
  const rows = await prisma.sealedWatch.findMany({ where: { userId }, select: { sealedId: true }, take: 500 }).catch(() => []);
  return [...new Set(rows.map((r) => r.sealedId))];
}

/** The live Prisma client, typed for the helpers above. */
export const sealedDb = prisma as unknown as SealedWatchRouteDb;
