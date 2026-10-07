import type { prisma } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARED ALERT BUDGET'S COUNT (2026-09-29).
// ─────────────────────────────────────────────────────────────────────────────
// Every alert run — the card watches (lib/price-alerts.ts), the deck price
// watches (lib/deck-watch.ts) and the sealed watches (lib/sealed-watch.ts) —
// shares ALERT_DAILY_BUDGET distinct addresses per ALERT_BUDGET_WINDOW_MS,
// because all of them ride the same transactional quota as verification,
// reset and welcome mail. Each run counts the addresses ANY run emailed inside
// the window from the three tables' lastNotifiedAt, so an address a deck
// watch emailed at 07:xx costs the card run nothing at 19:xx, and a new
// address opened by any run is one of the day's fifty.
//
// Three small, bounded reads: GROUP BY in Postgres for the two tables that
// carry the address (never findMany's `distinct`, which dedupes client-side
// after reading every row — tests/prisma-client-side-distinct.test.ts), and a
// capped select of the owner's address for deck watches, which carry none.

export type AlertBudgetDb = {
  priceAlert: Pick<typeof prisma.priceAlert, "groupBy">;
  deckWatch: Pick<typeof prisma.deckWatch, "findMany">;
  sealedWatch: Pick<typeof prisma.sealedWatch, "groupBy">;
};

/** Distinct addresses emailed by any alert run since `now − windowMs`. Throws on a failed read. */
export async function recentlyEmailedAddresses(db: AlertBudgetDb, now: Date, windowMs: number): Promise<Set<string>> {
  const since = new Date(now.getTime() - windowMs);
  const out = new Set<string>();
  const cards = await db.priceAlert.groupBy({
    by: ["email"],
    where: { lastNotifiedAt: { gte: since } },
    orderBy: { email: "asc" },
    take: 1000,
  });
  for (const r of cards) out.add(r.email);
  const sealed = await db.sealedWatch.groupBy({
    by: ["email"],
    where: { lastNotifiedAt: { gte: since } },
    orderBy: { email: "asc" },
    take: 1000,
  });
  for (const r of sealed) out.add(r.email);
  const decks = await db.deckWatch.findMany({
    where: { lastNotifiedAt: { gte: since } },
    select: { user: { select: { email: true } } },
    take: 1000,
  });
  for (const r of decks) if (r.user?.email) out.add(r.user.email);
  return out;
}

/**
 * Most emails ONE address may get from ONE watch pass (deck or sealed). The
 * card run sends one digest per address, so "distinct addresses" bounded it;
 * the deck and sealed passes send one email PER WATCH, and Premium's sealed
 * watches are unlimited, so a print wave restocking forty boxes would have sent
 * forty emails to one member on the strength of one budget slot. The rest wait
 * with their baselines held (the deferred path) and re-detect at the next run.
 */
export const WATCH_EMAILS_PER_ADDRESS = 3;

/**
 * One run's share of the budget: how many NEW addresses (not already counted
 * in `recent`) it may open, and the bookkeeping to spend it. `perRunCap` is
 * the run's own ceiling on new addresses (what is left of PAID_SEND_CAP for
 * this pass — the paid route shares one across the card, deck and sealed
 * passes), beside the budget. `perAddressCap` bounds the emails one address
 * may get from this run (WATCH_EMAILS_PER_ADDRESS for the watch passes).
 */
export class RunBudget {
  private openedBudget = 0;
  private openedCap = 0;
  private readonly sent = new Map<string, number>();
  constructor(
    private readonly recent: Set<string>,
    private readonly remaining: number,
    private readonly perRunCap: number,
    private readonly perAddressCap: number = Number.POSITIVE_INFINITY,
  ) {}
  /** Why this address cannot get another email now, or null when it can. */
  reason(email: string): "cap" | "budget" | "address" | null {
    const n = this.sent.get(email) ?? 0;
    if (n > 0) return n >= this.perAddressCap ? "address" : null; // already opened: costs no new slot
    if (this.openedCap >= this.perRunCap) return "cap";
    if (!this.recent.has(email) && this.openedBudget >= this.remaining) return "budget";
    return null;
  }
  /** Record that an email is going to this address now. */
  open(email: string): void {
    const n = this.sent.get(email) ?? 0;
    this.sent.set(email, n + 1);
    if (n > 0) return;
    this.openedCap++;
    if (!this.recent.has(email)) this.openedBudget++;
  }
  /** Distinct addresses this run has opened (what counts against the shared PAID_SEND_CAP). */
  get newAddresses(): number {
    return this.openedCap;
  }
}
