// THE ANONYMOUS (EMAIL-ONLY) WATCH — RiftCompare's /api/alerts/subscribe and the
// watch half of its lib/free-limits-server.ts, ported in wave 2 (2026-10-03).
// BUILT, AND HIDDEN: the route answers 404 unless email is on (Meta "email",
// getEmailStatus) AND the owner has enabled it (NEXT_PUBLIC_ANON_ALERTS=1);
// PriceAlertModal renders under the same two conditions. MTG Compare's
// watchlist is otherwise account-only (the member track).
//
// Request-time mail is DEFERRED: the route sends nothing. A new anonymous row
// is written with confirmSentAt null, and the hourly outbox
// (scripts/email-hourly.ts → lib/alert-confirmations.ts drainConfirmations)
// sends the first-watch confirmation within the hour, under the daily cap.
//
// Egress: one narrow, capped read per step, scoped by the posted address (and
// the session's account when it owns that address). Called only from the route.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { isCountry, type Country } from "./country";
import { canonicalWatchEmail, checkFreeAllowance, freeLimitBody, FREE_LIMIT_STATUS, type HoldingsCounter } from "./free-limits";
import { isPremium, type EntitlementFields } from "./premium";
import { FINISH_INDEX, type Finish } from "./constants";
import { getCardsByIds } from "./data";
import { alertBaselineSeed, alertPairKey, computeAlertPrices, liveAlertReader, type AlertOfferReader, type AlertPrice } from "./alert-price";

/** Most cards one request may watch (one request stays cheap). */
export const SUBSCRIBE_CARD_CAP = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubscribeBody {
  email: string;
  cardIds: number[];
  market: Country;
  /** The finish every posted card is watched in; absent = each card's headline finish (Normal first). */
  finish: Finish | null;
}

/** Where a subscribe reads the catalogue and the live offers from; tests pass stand-ins. */
export interface SubscribeIo {
  catalog?: (ids: readonly number[]) => Promise<Map<number, { headFinish: Finish }>>;
  readOffers?: AlertOfferReader;
}

/** RiftCompare's zod schema, written out. null = 400. The address is trimmed and lowercased. */
export function parseSubscribeBody(raw: unknown): SubscribeBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.email !== "string") return null;
  const email = b.email.trim().toLowerCase();
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return null;
  if (!Array.isArray(b.cardIds) || b.cardIds.length < 1 || b.cardIds.length > SUBSCRIBE_CARD_CAP) return null;
  const cardIds: number[] = [];
  for (const v of b.cardIds) {
    const n = typeof v === "string" && /^\d{1,10}$/.test(v) ? Number(v) : v;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null;
    cardIds.push(n);
  }
  const market = b.market === undefined ? "US" : b.market;
  if (!isCountry(market)) return null;
  let finish: Finish | null = null;
  if (b.finish !== undefined && b.finish !== null) {
    if (b.finish === 0 || b.finish === "N") finish = "N";
    else if (b.finish === 1 || b.finish === "F") finish = "F";
    else return null;
  }
  return { email, cardIds: [...new Set(cardIds)], market, finish };
}

/** Is the email-only door open? Both: email on, and the owner's switch. */
export function anonymousAlertsEnabled(emailStatus: "on" | "off", env: Record<string, string | undefined> = process.env): boolean {
  return emailStatus === "on" && env.NEXT_PUBLIC_ANON_ALERTS === "1";
}

const MARKET_COUNT = 6;

/**
 * Watches held by an address — and by the account, when there is one. The
 * anonymous door counts the address as typed AND its canonical inbox
 * (canonicalWatchEmail), so `alice+1@gmail.com` is at the limit when
 * `alice@gmail.com` already watches ten. COUNT(DISTINCT) in SQL, never a row pull.
 */
export function addressHoldings(emails: string[], userId: string | null): HoldingsCounter<number> {
  const list = [...new Set(emails)];
  const byEmail = list.length === 1 ? { email: list[0] } : { email: { in: list } };
  const owner = userId ? { OR: [byEmail, { userId }] } : byEmail;
  return {
    async held(cardIds) {
      const rows = await prisma.priceAlert.findMany({
        where: { AND: [owner, { cardId: { in: cardIds } }] },
        select: { cardId: true },
        take: cardIds.length * MARKET_COUNT * list.length,
      });
      return new Set(rows.map((r) => r.cardId));
    },
    async count() {
      const rows = userId
        ? await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "PriceAlert" WHERE "email" = ANY(${list}) OR "userId" = ${userId}`
        : await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(DISTINCT "cardId")::int AS n FROM "PriceAlert" WHERE "email" = ANY(${list})`;
      return Number(rows[0]?.n ?? 0);
    },
  };
}

export interface SubscribeResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Subscribe an address to price alerts on these cards. Idempotent: an
 * already-watched card is a no-op (its baseline is never reset).
 *
 * `session` attaches ownership only when the session's address IS the posted
 * one — THE EMAIL COMPARISON IS THE SECURITY BOUNDARY: trusting the posted
 * address alone would let any signed-in user claim a stranger's watches.
 */
export async function subscribeAddress(
  body: SubscribeBody,
  session: (EntitlementFields & { id: string; email: string }) | null,
  now: Date = new Date(),
  io: SubscribeIo = {},
): Promise<SubscribeResult> {
  const { email, market } = body;
  const userId = session && session.email.toLowerCase() === email ? session.id : null;

  // Only watch cards that exist in the published catalogue; each is watched in
  // the posted finish, else its headline finish. The id is a plain product id.
  const known = await (io.catalog ?? getCardsByIds)(body.cardIds.slice(0, SUBSCRIBE_CARD_CAP));
  const cards = body.cardIds.flatMap((id) => {
    const c = known.get(id);
    return c ? [{ id, finish: body.finish ?? c.headFinish }] : [];
  });
  if (!cards.length) return { status: 400, body: { error: "No matching cards" } };

  // One unsubscribe token per address: reuse it so a single link covers every card.
  const existing = await prisma.priceAlert.findFirst({ where: { email }, select: { unsubToken: true } });
  const unsubToken = existing?.unsubToken ?? randomUUID();

  const already = existing
    ? await prisma.priceAlert.findMany({ where: { email, market, cardId: { in: cards.map((c) => c.id) } }, select: { cardId: true, finish: true }, take: SUBSCRIBE_CARD_CAP * 2 })
    : [];
  const watched = new Set(already.map((r) => `${r.cardId}.${r.finish}`));

  // THE FREE WATCHLIST LIMIT, here too, so the email-only door is no way around
  // it — unless the address (or the inbox it aliases) is a paying member's.
  const account = userId && session ? session : null;
  const emails = account ? [email] : [...new Set([email, canonicalWatchEmail(email)])];
  let allowance = await checkFreeAllowance(addressHoldings(emails, account?.id ?? null), "watchlist", cards.map((c) => c.id), isPremium(account));
  if (allowance.blocked.length && !account) {
    for (const e of emails) {
      const owner = await prisma.user.findUnique({ where: { email: e }, select: { isAdmin: true, premiumUntil: true, premiumTier: true } });
      if (isPremium(owner)) {
        allowance = { allowed: cards.map((c) => c.id), blocked: [], count: null, limit: allowance.limit };
        break;
      }
    }
  }
  const allowedIds = new Set(allowance.allowed);
  const fresh = cards.filter((c) => !watched.has(`${c.id}.${FINISH_INDEX[c.finish]}`) && allowedIds.has(c.id));
  if (allowance.blocked.length && fresh.length === 0) {
    return { status: FREE_LIMIT_STATUS, body: { ...freeLimitBody("watchlist", allowance.count ?? allowance.limit), signedIn: userId != null } };
  }

  // THE BASELINE: today's alert price (never eBay), so we alert on FUTURE
  // moves; null when no store has it, so its first listing fires "now listed".
  // A failed read saves nothing: a guessed baseline sends wrong alerts.
  let prices: Map<string, AlertPrice>;
  try {
    prices = fresh.length ? await computeAlertPrices(io.readOffers ?? liveAlertReader(), fresh.map((c) => ({ cardId: c.id, finish: c.finish, market })), now) : new Map();
  } catch {
    return { status: 503, body: { error: "Couldn't read today's prices. Please try again." } };
  }

  const result = await prisma.priceAlert.createMany({
    data: fresh.map((c) => ({ email, userId, cardId: c.id, finish: FINISH_INDEX[c.finish], market, unsubToken, confirmSentAt: null, ...alertBaselineSeed(prices.get(alertPairKey(market, c.id, c.finish))) })),
    skipDuplicates: true,
  });
  const total = await prisma.priceAlert.count({ where: { email, market } });
  return {
    status: 200,
    body: {
      ok: true,
      added: result.count,
      watching: total,
      ...(allowance.blocked.length ? { skipped: allowance.blocked.length, freeLimit: freeLimitBody("watchlist", allowance.count ?? allowance.limit) } : {}),
    },
  };
}
