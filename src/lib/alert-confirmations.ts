import { prisma } from "./db";
import { isCountry, type Country } from "./country";
import { SITE_URL } from "./site";
import { alertPairKey, computeAlertPrices, type AlertPriceDb } from "./alert-price";
import { CONFIRMATION_CARD_ROWS, sendAlertConfirmationEmail, type AlertConfirmationCard } from "./email";

// THE WATCH CONFIRMATION — RiftCompare's lib/alert-confirmations.ts, ported in
// wave 2 (2026-10-03). OP Compare sends nothing at request time: the subscribe
// route writes rows with confirmSentAt null, and the hourly outbox
// (scripts/email-hourly.ts → drainConfirmations below) sends the confirmation,
// under the same global daily cap.
//
// THE GLOBAL DAILY CAP ON WATCH-CONFIRMATION EMAILS (/api/alerts/subscribe).
//
// That route takes any address with no double opt-in, and Resend's 100/day
// quota is shared with verification, password reset and the alert digests
// themselves, so ~100 posted addresses could starve all of them. rateLimit()
// cannot be the cap — it is per serverless instance — so the database keeps
// the count.
//
// This bounds the CONFIRMATIONS only. The drop digests those posted addresses
// would get on the next daily run are bounded separately, by
// FIRST_CONTACT_SEND_CAP in lib/price-alerts.ts (review, 2026-09-25).
//
// WHAT IS COUNTED: confirmations sent, one per call, and nothing else. The
// first version counted anonymous PriceAlert rows created in the last 24h,
// which is a different number. A returning anonymous watcher adds a row on
// every heart click (PriceAlertModal's silent path) but is never re-confirmed,
// so 30 such clicks shut new addresses out; and a signed-in subscriber's
// confirmation (userId set) was sent but never counted. The route calls this
// only at the moment it is about to send, so the counter IS the confirmations.
//
// The count lives in the existing Counter table (one row per UTC day, key
// "alert-confirm:YYYY-MM-DD" — a few bytes a day, no schema change). The
// upsert is a single INSERT … ON CONFLICT DO UPDATE on the primary key, so two
// concurrent requests can't both read 29. Fails CLOSED: any error (including
// the rare first-of-the-day insert race) sends nothing — a capped confirmation
// costs only the courtesy email; the watch itself is already saved.
export const CONFIRMATION_DAILY_CAP = 30;

export type ConfirmationDb = {
  counter: Pick<typeof prisma.counter, "upsert">;
};

export function confirmationKey(now: Date): string {
  return `alert-confirm:${now.toISOString().slice(0, 10)}`;
}

// Claim one of today's confirmation slots. true = send it; false = the cap is
// reached (or the count failed). Every call claims, so call it only when the
// email is otherwise certain to go.
export async function claimConfirmationSlot(db: ConfirmationDb, now: Date = new Date()): Promise<boolean> {
  const key = confirmationKey(now);
  try {
    const row = await db.counter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return row.value <= CONFIRMATION_DAILY_CAP;
  } catch {
    return false;
  }
}

// ── What the confirmation lists ──────────────────────────────────────────────
// The cards being watched, each with TODAY'S ALERT PRICE (lib/alert-price.ts:
// cheapest in-stock Near Mint or unstated-condition copy at a store, never
// eBay) and that copy's condition. One bounded query for at most
// CONFIRMATION_CARD_ROWS cards, reached only by a confirmation about to be sent.
export async function confirmationCards(
  db: AlertPriceDb,
  cards: readonly { id: number; name: string; slug: string; setCode: string; number: string | null }[],
  market: Country,
  now: Date = new Date(),
): Promise<AlertConfirmationCard[]> {
  const shown = cards.slice(0, CONFIRMATION_CARD_ROWS);
  const read = shown.length ? await computeAlertPrices(db, shown.map((c) => ({ cardId: c.id, market })), now, { slim: true }).catch(() => null) : null;
  return shown.map((c) => {
    const p = read?.get(alertPairKey(market, c.id));
    const priced = p?.state === "priced";
    return {
      name: c.name,
      setCode: c.setCode,
      number: c.number ?? "",
      url: `${SITE_URL}/card/${c.slug}`,
      market,
      priceCents: priced ? p!.priceCents : null,
      storeName: priced ? p!.stores[0]?.name ?? null : null,
      condition: priced ? p!.condition : null,
    };
  });
}

// ── The outbox (scripts/email-hourly.ts) ─────────────────────────────────────

/** Addresses one outbox run confirms at most (the daily cap bounds the day). */
export const CONFIRMATIONS_PER_RUN = 30;

export interface ConfirmationRunSummary {
  pending: number; // addresses with unstamped rows
  sent: number;
  stamped: number; // returning addresses' new rows, stamped with no email (they were confirmed before)
  capped: number; // left for tomorrow: the daily cap was reached
  failed: number;
}

/**
 * Send the first-watch confirmation to every NEW anonymous address (no row of
 * it ever stamped), and stamp a returning address's new rows silently — it had
 * its confirmation already, and re-confirming on every new card was one email
 * per heart-click. Claim-before-send under CONFIRMATION_DAILY_CAP; a failed
 * send leaves the rows unstamped for the next hour.
 */
export async function drainConfirmations(now: Date = new Date(), send = sendAlertConfirmationEmail): Promise<ConfirmationRunSummary> {
  const summary: ConfirmationRunSummary = { pending: 0, sent: 0, stamped: 0, capped: 0, failed: 0 };
  const pending = await prisma.priceAlert.groupBy({
    by: ["email"],
    where: { confirmSentAt: null, userId: null },
    orderBy: { email: "asc" },
    take: CONFIRMATIONS_PER_RUN * 4,
  });
  summary.pending = pending.length;
  for (const { email } of pending) {
    const confirmedBefore = await prisma.priceAlert.findFirst({ where: { email, confirmSentAt: { not: null } }, select: { id: true } });
    if (confirmedBefore) {
      const r = await prisma.priceAlert.updateMany({ where: { email, confirmSentAt: null }, data: { confirmSentAt: now } });
      summary.stamped += r.count;
      continue;
    }
    if (summary.sent >= CONFIRMATIONS_PER_RUN) break;
    const rows = await prisma.priceAlert.findMany({
      where: { email },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { market: true, unsubToken: true, card: { select: { id: true, name: true, variant: true, slug: true, number: true, set: { select: { code: true } } } } },
    });
    if (!rows.length) continue;
    if (!(await claimConfirmationSlot(prisma, now))) {
      summary.capped++;
      break; // the day's cap is reached: everyone else waits for tomorrow
    }
    const market: Country = isCountry(rows[0].market) ? rows[0].market : "US";
    const inMarket = rows.filter((r) => r.market === market);
    const cards = await confirmationCards(
      prisma,
      inMarket.map((r) => ({ id: r.card.id, name: `${r.card.name}${r.card.variant ? ` (${r.card.variant})` : ""}`, slug: r.card.slug, setCode: r.card.set.code, number: r.card.number })),
      market,
      now,
    );
    const ok = await send(email, cards, inMarket.length, rows[0].unsubToken, true);
    if (!ok) {
      summary.failed++;
      continue;
    }
    summary.sent++;
    await prisma.priceAlert.updateMany({ where: { email, confirmSentAt: null }, data: { confirmSentAt: now } });
  }
  return summary;
}
