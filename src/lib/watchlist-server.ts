// THE ACCOUNT WATCHLIST, server side — every database read and write behind
// /api/alerts/watchlist/** (RiftCompare's api/alerts/watchlist routes,
// lib/target-alerts.ts and lib/free-limits-server.ts, ported in wave 2,
// 2026-10-03). Route files may export only their handlers and may not import
// @/lib/db (tests/app-no-db-import.test.ts), so the logic lives here and the
// routes keep only the session read, the rate limit and the response.
//
// Egress (CLAUDE.md, the accounts exception): every query is scoped to ONE
// account, select-limited and bounded — ids only for the header (one indexed
// select, newest 500), one count for the target readout, and the full list
// WITHOUT a card join: the rows carry card ids, and the route prices them
// from the cached catalogue (getCatalog in lib/data.ts). Called only from
// /api/* routes, never from a page render or a cached loader.
//
// Card ids are numbers (Card.id, the TCGplayer productId). MTG Compare is
// account-only here: there is no anonymous email door, so every row carries
// userId as well as the account's email (kept for AlertMute and future mail).
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { isCountry, MARKETS, type Country } from "./country";
import { checkFreeAllowance, freeLimitBody, FREE_LIMIT_STATUS, type Allowance, type HoldingsCounter } from "./free-limits";
import { isPremium, tierOf, type EntitlementFields } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { MAX_TARGET_CENTS, MIN_TARGET_CENTS } from "./target-price";
import { ALERT_FRESH_MS, pickBaselineCents, type BaselineOffer } from "./watch-baseline";

/** The newest this many watches are returned (and fit the header's id set). */
export const WATCH_LIST_CAP = 500;
/** The most local (signed-out) watches one merge imports. */
export const MERGE_CAP = 200;

export type Account = EntitlementFields & { id: string; email: string };

// ── Reads ───────────────────────────────────────────────────────────────────

/** Card ids this account watches, newest first (the header heart and every tile's heart). */
export async function watchedCardIds(userId: string): Promise<{ cardId: number }[]> {
  return prisma.priceAlert
    .findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: WATCH_LIST_CAP, select: { cardId: true } })
    .catch(() => []);
}

/** How many of this account's watches carry a target price; null on a failed count (show none rather than a wrong one). */
export async function targetCount(userId: string): Promise<number | null> {
  return prisma.priceAlert.count({ where: { userId, targetCents: { not: null } } }).catch(() => null);
}

export interface WatchRow {
  id: string;
  cardId: number;
  market: string;
  lastPriceCents: number | null;
  startPriceCents: number | null;
  targetCents: number | null;
  snoozedUntil: Date | null;
  createdAt: Date;
}

/** The whole watchlist (no card join: the route prices rows from the cached catalogue). */
export async function listWatches(userId: string): Promise<WatchRow[]> {
  return prisma.priceAlert
    .findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: WATCH_LIST_CAP,
      select: { id: true, cardId: true, market: true, lastPriceCents: true, startPriceCents: true, targetCents: true, snoozedUntil: true, createdAt: true },
    })
    .catch(() => []);
}

/** Has this address paused alert emails (AlertMute)? null on a failed read. */
export async function alertsPaused(email: string): Promise<boolean | null> {
  return prisma.alertMute
    .findUnique({ where: { email }, select: { email: true } })
    .then((r) => r != null)
    .catch(() => null);
}

// ── The free watchlist limit (RiftCompare lib/free-limits-server.ts) ────────
// The distinct count is COUNT(DISTINCT "cardId") in SQL on purpose: Prisma's
// `distinct` dedupes in the client and drops the LIMIT. It is read only when
// an add brings a card the account does not hold yet, and never for a paid
// account. Two overlapping adds at 9 of 10 can both land at 11 — accepted:
// the limit is a funnel, not a quota anyone is billed on.
type RawCount = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<{ n: number | bigint }[]>;
export type WatchLimitDb = {
  priceAlert: { findMany: (args: { where: object; select: { cardId: true }; take: number }) => PromiseLike<{ cardId: number }[]> };
  $queryRaw: RawCount;
};

export function watchHoldings(db: WatchLimitDb, account: { id: string; email: string }): HoldingsCounter<number> {
  const owner = { OR: [{ email: account.email }, { userId: account.id }] };
  return {
    async held(cardIds) {
      const rows = await db.priceAlert.findMany({
        where: { AND: [owner, { cardId: { in: cardIds } }] },
        select: { cardId: true },
        take: cardIds.length * MARKETS.length,
      });
      return new Set(rows.map((r) => r.cardId));
    },
    async count() {
      const rows = await db.$queryRaw`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "PriceAlert" WHERE "email" = ${account.email} OR "userId" = ${account.id}`;
      return Number(rows[0]?.n ?? 0);
    },
  };
}

/** May these cards be watched by `account`? Paid tiers are never counted. */
export function watchAllowance(db: WatchLimitDb, account: Account, cardIds: number[]): Promise<Allowance<number>> {
  return checkFreeAllowance(watchHoldings(db, account), "watchlist", cardIds, isPremium(account));
}

// ── The baseline a new watch starts from ────────────────────────────────────

/** The Offer filter for alert prices: tracked stores and TCGplayer, in stock, fresh — never eBay. */
export function baselineWhere(cardIds: number[], market: string, now: number) {
  return {
    productId: { in: cardIds },
    market,
    inStock: true,
    updatedAt: { gte: new Date(now - ALERT_FRESH_MS) },
    OR: [{ source: { startsWith: "store:" } }, { source: "tcgplayer" }],
  };
}

export type BaselineDb = {
  offer: { findMany: (args: { where: object; select: Record<string, true>; take: number }) => PromiseLike<(BaselineOffer & { productId: number })[]> };
};

/** Today's alert price per card in one market, from ONE bounded Offer read. Throws on a failed read. */
export async function alertBaselines(db: BaselineDb, cardIds: number[], market: string, now = Date.now()): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>(cardIds.map((id) => [id, null]));
  if (!cardIds.length) return out;
  const rows = await db.offer.findMany({
    where: baselineWhere(cardIds, market, now),
    select: { productId: true, source: true, priceCents: true, inStock: true, updatedAt: true },
    take: cardIds.length * 60,
  });
  const by = new Map<number, BaselineOffer[]>();
  for (const r of rows) {
    const list = by.get(r.productId) ?? [];
    list.push(r);
    by.set(r.productId, list);
  }
  for (const id of cardIds) out.set(id, pickBaselineCents(by.get(id) ?? [], now));
  return out;
}

function seed(cents: number | null) {
  return { lastPriceCents: cents, startPriceCents: cents, dropAnchorCents: cents };
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface RouteResult {
  status: number;
  body: Record<string, unknown>;
}

type UpsertArgs = {
  where: { email_cardId_market: { email: string; cardId: number; market: string } };
  update: { userId: string };
  create: Record<string, unknown>;
};
export type WatchWriteDb = WatchLimitDb &
  BaselineDb & {
    card: { findUnique: (args: { where: { id: number }; select: { id: true } }) => PromiseLike<{ id: number } | null> };
    priceAlert: WatchLimitDb["priceAlert"] & {
      findFirst: (args: { where: object; select: { unsubToken: true } }) => PromiseLike<{ unsubToken: string } | null>;
      upsert: (args: UpsertArgs) => PromiseLike<{ id: string }>;
    };
  };

/** Parse `{ cardId, market }`. Market defaults to US (OP's default). */
export function parseWatchBody(raw: unknown): { cardId: number; market: Country } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const cardId = typeof b.cardId === "number" ? b.cardId : typeof b.cardId === "string" && /^\d{1,12}$/.test(b.cardId) ? Number(b.cardId) : NaN;
  if (!Number.isSafeInteger(cardId) || cardId <= 0) return null;
  const market = b.market == null ? "US" : b.market;
  if (!isCountry(market)) return null;
  return { cardId, market };
}

/**
 * POST /api/alerts/watchlist — watch one card for the signed-in account.
 * 400 bad body / unknown card · 402 the free limit (a NEW card only) · 503 a
 * failed price read (nothing saved) · 200 { ok, id }.
 */
export async function createWatch(db: WatchWriteDb, account: Account, raw: unknown, now = Date.now()): Promise<RouteResult> {
  const parsed = parseWatchBody(raw);
  if (!parsed) return { status: 400, body: { error: "Invalid request" } };
  const { cardId, market } = parsed;
  const card = await db.card.findUnique({ where: { id: cardId }, select: { id: true } });
  if (!card) return { status: 400, body: { error: "No matching card" } };

  // THE FREE WATCHLIST LIMIT: only a NEW card is refused, and only on a free
  // account. Checked before the price read, so a refused add costs two tiny reads.
  const allowance = await watchAllowance(db, account, [card.id]);
  if (allowance.blocked.length) {
    return { status: FREE_LIMIT_STATUS, body: { ...freeLimitBody("watchlist", allowance.count ?? allowance.limit) } };
  }

  let start: number | null;
  try {
    start = (await alertBaselines(db, [card.id], market, now)).get(card.id) ?? null;
  } catch {
    return { status: 503, body: { error: "Couldn't read today's price. Please try again." } };
  }

  // One unsubscribe token per address, so a future emailed link covers every row.
  const existing = await db.priceAlert.findFirst({ where: { email: account.email }, select: { unsubToken: true } });
  // upsert: the update branch only stamps ownership — rewriting the price
  // would reset the baseline and swallow the drop the watch exists to catch.
  const item = await db.priceAlert.upsert({
    where: { email_cardId_market: { email: account.email, cardId: card.id, market } },
    update: { userId: account.id },
    create: { email: account.email, userId: account.id, cardId: card.id, market, unsubToken: existing?.unsubToken ?? randomUUID(), ...seed(start) },
  });
  return { status: 200, body: { ok: true, id: item.id } };
}

/** DELETE /api/alerts/watchlist/[cardId] — every market of one card; the userId scope IS the ownership check. */
export async function deleteWatch(userId: string, cardId: number): Promise<number> {
  const res = await prisma.priceAlert.deleteMany({ where: { userId, cardId } });
  return res.count;
}

// ── Target prices (RiftCompare lib/target-alerts.ts) ────────────────────────
//   403 not a paying member · 400 bad body · 409 at the tier's limit (Plus 25,
//   Premium unlimited) · 404 not a watch of this account · 200 { ok,
//   targetCents, used, limit }. The limit counts this account's OTHER watches
//   with a target, so editing one never trips it. A changed target re-arms only
//   its own watermark (targetEmailedCents).
export type TargetDb = {
  priceAlert: {
    count: (args: { where: object }) => PromiseLike<number>;
    findFirst: (args: { where: object; select: { targetCents: true } }) => PromiseLike<{ targetCents: number | null } | null>;
    updateMany: (args: { where: object; data: object }) => PromiseLike<{ count: number }>;
  };
};

export function parseTargetBody(raw: unknown): { market: Country; targetCents: number | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!isCountry(b.market)) return null;
  const t = b.targetCents;
  if (t === null) return { market: b.market, targetCents: null };
  if (typeof t !== "number" || !Number.isInteger(t) || t < MIN_TARGET_CENTS || t > MAX_TARGET_CENTS) return null;
  return { market: b.market, targetCents: t };
}

export async function applyTargetPrice(db: TargetDb, user: EntitlementFields & { id: string }, cardId: number, rawBody: unknown): Promise<RouteResult> {
  if (!isPremium(user)) return { status: 403, body: { error: "Target prices are part of Plus." } };
  const parsed = parseTargetBody(rawBody);
  if (!parsed) return { status: 400, body: { error: "Send { market, targetCents }: whole cents from 1 to 10,000,000, or null to clear." } };
  const { market, targetCents } = parsed;

  const limit = targetAlertLimit(tierOf(user));
  const others = await db.priceAlert.count({ where: { userId: user.id, targetCents: { not: null }, NOT: { cardId, market } } });
  if (targetCents != null && others >= limit) {
    return {
      status: 409,
      body: {
        error: `Plus covers target prices on ${limit} cards, and all ${limit} are in use. Clear one to set this, or move to Premium for unlimited targets.`,
        used: others,
        limit,
      },
    };
  }

  const current = await db.priceAlert.findFirst({ where: { userId: user.id, cardId, market }, select: { targetCents: true } });
  if (!current) return { status: 404, body: { error: "Not found" } };

  const changed = targetCents !== current.targetCents;
  const res = await db.priceAlert.updateMany({
    where: { userId: user.id, cardId, market },
    data: changed ? { targetCents, targetEmailedCents: null } : { targetCents },
  });
  if (res.count === 0) return { status: 404, body: { error: "Not found" } };
  return {
    status: 200,
    body: { ok: true, targetCents, used: others + (targetCents != null ? 1 : 0), limit: Number.isFinite(limit) ? limit : null },
  };
}

// ── The signed-out list, merged on first sign-in (MTG Compare) ───────────────
// The browser posts the card items of its localStorage `mc:watchlist` (slug
// and, on newer items, the id). Each resolves through the cached catalogue —
// an unknown slug is skipped, never guessed. At most MERGE_CAP are imported,
// and they are GRANDFATHERED: no free-limit check, because a visitor who
// hearted 30 cards before making an account keeps all 30 (RiftCompare: "if
// you already watch more, you keep them all"); the limit applies to adds
// after the merge. Idempotent: an upsert on (email, card, market) whose update
// branch touches nothing but ownership, so a repeated merge changes nothing.
export interface LocalWatchItem {
  slug?: unknown;
  id?: unknown;
}

export type MergeDb = BaselineDb & {
  priceAlert: {
    findFirst: (args: { where: object; select: { unsubToken: true } }) => PromiseLike<{ unsubToken: string } | null>;
    upsert: (args: UpsertArgs) => PromiseLike<{ id: string }>;
  };
};

/** Resolve posted local items to card ids (catalogue lookups only), deduped, capped, in the list's order. */
export function resolveLocalItems(items: unknown, lookup: { bySlug: Map<string, { id: number }>; byId: Map<number, { id: number }> }): number[] {
  if (!Array.isArray(items)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of items.slice(0, MERGE_CAP * 2)) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as LocalWatchItem;
    const byId = typeof it.id === "number" && Number.isSafeInteger(it.id) ? lookup.byId.get(it.id) : undefined;
    const bySlug = typeof it.slug === "string" && it.slug.length <= 200 ? lookup.bySlug.get(it.slug) : undefined;
    const card = byId ?? bySlug;
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card.id);
    if (out.length >= MERGE_CAP) break;
  }
  return out;
}

export async function mergeLocalWatches(db: MergeDb, account: Account, cardIds: number[], market: Country, now = Date.now()): Promise<{ merged: number }> {
  const ids = [...new Set(cardIds)].slice(0, MERGE_CAP);
  if (!ids.length) return { merged: 0 };
  // A failed price read still merges: the watch matters more than its start price.
  const baselines = await alertBaselines(db, ids, market, now).catch(() => new Map<number, number | null>());
  const existing = await db.priceAlert.findFirst({ where: { email: account.email }, select: { unsubToken: true } });
  const token = existing?.unsubToken ?? randomUUID();
  let merged = 0;
  for (const cardId of ids) {
    await db.priceAlert.upsert({
      where: { email_cardId_market: { email: account.email, cardId, market } },
      update: { userId: account.id },
      create: { email: account.email, userId: account.id, cardId, market, unsubToken: token, ...seed(baselines.get(cardId) ?? null) },
    });
    merged++;
  }
  return { merged };
}

/** The live Prisma client, typed for the helpers above (the routes pass this). */
export const watchDb = prisma as unknown as WatchWriteDb & TargetDb & MergeDb;
